import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './support.mjs';
import {Workspace} from '../service.mjs';
import {studentProgress,studentTaskSummary} from '../../workspace/progress-model.js';
import {handler} from '../http.mjs';
import {createSession} from '../security.mjs';

async function setup(){const f=await fixture();await f.db.query("update rib.activities set kind='w5-personal',phase='exhibit' where id='w5-demo'");return {...f,s:new Workspace(f.db,f.store)};}
async function snapshot(db){return JSON.stringify(await db.query("select jsonb_build_object('works',(select jsonb_agg(w) from rib.works w),'activities',(select jsonb_agg(a) from rib.activities a),'students',(select jsonb_agg(s) from rib.students s),'events',(select jsonb_agg(e) from rib.events e)) as state"));}
test('roster-first dashboard includes students with no work; reads are private and leave state unchanged',async t=>{
 const f=await setup();t.after(f.close);const before=await snapshot(f.db);
 const teacher=await f.s.progress(f.teacher,{term:'11501'});assert.equal(teacher.students.length,4);assert.equal(teacher.students[0].records[0].versionCount,0);
 const own=await f.s.progress(f.people[0],{});assert.equal(own.students.length,1);assert.equal(own.students[0].studentId,f.people[0].studentId);
 assert.equal(await snapshot(f.db),before);
 assert.ok(!JSON.stringify(own).includes(f.people[1].student.name));assert.ok(!JSON.stringify(own).includes('sharing_agreement'));
 await assert.rejects(f.s.progress(f.people[0],{studentId:f.people[1].studentId}),e=>e.status===403);
 await assert.rejects(f.s.progress(f.people[0],{term:'11502'}),e=>e.status===403);
 await assert.rejects(f.s.progress(f.people[0],{className:'101'}),e=>e.status===403);
 const p=studentProgress(own,own.students[0],6);assert.equal(p.needsEvidence,true);assert.ok(p.actionable.some(i=>i.label==='W4 個人圖卡'));assert.ok(p.waiting.some(i=>i.label==='W5 AI 留言判讀'));assert.ok(!p.actionable.some(i=>i.label==='W4 真人初讀'));
});
test('teacher scope, term, hidden and test isolation apply to every aggregated record',async t=>{
 const f=await setup();t.after(f.close);await f.db.query("update rib.students set class_name='102',is_test=true where student_id='11500004'");
 const limited={role:'teacher',email:'scope@example.invalid',teacher:{scopes:[{term:'11501',className:'101',grading:false}]}};
 assert.equal((await f.s.progress(limited,{term:'11501'})).students.length,3);
 assert.equal((await f.s.progress(limited,{term:'11501',testOnly:'true'})).students.length,0);
 await assert.rejects(f.s.progress(limited,{term:'11501',className:'102'}),e=>e.status===403);
 await assert.rejects(f.s.progress(limited,{term:'11502'}),e=>e.status===403);
 assert.equal((await f.s.progress(f.teacher,{term:'11501',testOnly:'true'})).students.length,1);
 const w=await f.s.ensureWork(f.people[0],{activityId:'w4-demo'});
 await f.db.query("insert into rib.versions(id,work_id,ordinal,media,metadata,request_id) values('private-version',$1,1,'[]','{\"text\":\"PRIVATE ANSWER MUST NOT LEAK\"}','private')",[w.id]);
 assert.ok(!JSON.stringify(await f.s.progress(f.teacher,{term:'11501'})).includes('PRIVATE ANSWER'));
 await f.db.query('update rib.works set hidden=true where id=$1',[w.id]);assert.equal((await f.s.progress(f.people[0],{})).students[0].records[0].versionCount,0);
 await f.db.query("update rib.activities set archived=true where id='w4-demo'");assert.ok(!(await f.s.progress(f.people[0],{})).activities.some(a=>a.id==='w4-demo'));
});
test('human publication, own decision and submitted judgment advance readiness; ORID remains a separate practice',async t=>{
 const f=await setup();t.after(f.close);const p=f.people[0],w=await f.s.ensureWork(p,{activityId:'w4-demo'});
 await f.db.query("insert into rib.versions(id,work_id,ordinal,media,metadata,request_id) values('v-progress',$1,1,'[]','{}','v-progress')",[w.id]);
 const get=async()=>{const d=await f.s.progress(p,{});return studentProgress(d,d.students[0],6);};
 let progress=await get();assert.ok(progress.waiting.some(i=>i.label==='W4 真人初讀'));assert.equal(progress.ready,false);
 const reading={workId:w.id,versionId:'v-progress',mode:'human',situation:'他坐在桌邊',meaning:'無法確定他的心情',expectedRevision:0,status:'draft'};
 await f.s.saveTeacherReading(f.teacher,reading);assert.equal((await get()).ready,false);
 await f.s.saveTeacherReading(f.teacher,{...reading,status:'published',expectedRevision:1,mode:'ai-simulation',reviewed:true});assert.ok((await get()).waiting.some(i=>i.label==='W4 真人初讀'));
 await f.s.saveTeacherReading(f.teacher,{...reading,status:'published',expectedRevision:2,personallyRead:true});assert.ok((await get()).actionable.some(i=>i.label==='W4 我的改留理由'));
 await f.s.decision(p,{workId:w.id,versionId:'v-progress',reason:'保留可見的桌邊動作，不推論心情。'});
 const answers={sourceReference:'W4 V1',comment:'甲',quote:'一定很難過',color:'yellow',evidence:'表情不清楚',rewritten:'他坐在桌邊。'};
 await f.s.saveAiJudgment(p,{activityId:'w5-demo',answers,status:'draft',expectedRevision:0});progress=await get();assert.equal(progress.ready,false);assert.match(progress.items.find(i=>i.label==='W5 AI 留言判讀').detail,/草稿/);
 await f.s.saveAiJudgment(p,{activityId:'w5-demo',answers,status:'submitted',expectedRevision:1});progress=await get();assert.equal(progress.ready,true);assert.ok(progress.actionable.some(i=>i.label==='W5 個人文字轉圖'&&!i.scored));
 const five=await f.s.ensureWork(p,{activityId:'w5-demo'});await f.db.query("insert into rib.versions(id,work_id,ordinal,media,metadata,request_id) values('diagram-v1',$1,1,'[]','{}','diagram')",[five.id]);
 await f.db.query("update rib.works set topic='A06',current_version_id='diagram-v1',reflection='{\"status\":\"submitted\",\"versionId\":\"old-version\"}' where id=$1",[five.id]);
 const peer=await f.s.ensureWork(f.people[1],{activityId:'w5-demo'});await f.db.query("insert into rib.versions(id,work_id,ordinal,media,metadata,request_id) values('peer-v1',$1,1,'[]','{}','peer')",[peer.id]);await f.db.query("update rib.works set topic='A06',current_version_id='peer-v1' where id=$1",[peer.id]);progress=await get();assert.match(progress.items.find(i=>i.label==='W5 同題欣賞與 ORID').detail,/作品已更新/);
 await f.db.query("update rib.activities set accepting=false where id='w5-demo'");progress=await get();assert.equal(progress.items.find(i=>i.label==='W5 同題欣賞與 ORID').state,'blocked');
});
test('HTTP progress requires a session, cannot mutate by POST, and supports read-only teacher preview',async t=>{
 const f=await setup();t.after(f.close);const run=handler({db:f.db,store:f.store,origin:'https://class.invalid',rateSecret:'test'});
 const ask=async(cookie='',method='GET',query='')=>{let result={};await run({url:'/api/workspace?action=progress'+query,method,body:method==='POST'?{action:'progress'}:undefined,headers:{cookie,origin:'https://class.invalid','content-type':'application/json'},socket:{remoteAddress:'127.0.0.1'}},{setHeader:()=>{},end:value=>{result.body=JSON.parse(value);},get statusCode(){return result.status;},set statusCode(n){result.status=n;}});return result;};
 assert.equal((await ask()).status,401);const login=await createSession(f.db,{role:'student',term:'11501',studentId:'11500001',revision:1});assert.equal((await ask('rib_session='+login.token)).status,200);assert.equal((await ask('rib_session='+login.token,'POST')).status,405);
 const teacher=await createSession(f.db,{role:'admin',email:f.teacher.email}),preview=await ask('rib_session='+teacher.token,'GET','&previewActivity=w4-demo&previewStudent=11500001');assert.equal(preview.status,200);assert.equal(preview.body.data.students.length,1);
});

test('a weekly activity is never inferred to be a required submission outside this W4/W5 round',()=>{
 const data={activities:[{id:'w3',week:3,title:'W3 練習',kind:'w3-personal',accepting:true},{id:'w7',week:7,title:'W7 練習',kind:'w7-news',accepting:true},{id:'w8',week:8,title:'W8 共讀',kind:'w8-materials',accepting:true}]};
 const student={records:[]},p=studentProgress(data,student,8);assert.equal(p.actionable.length,0);assert.equal(p.waiting.length,0);assert.equal(p.items.length,0);
 student.records=[{activityId:'w3',versionCount:1}];const saved=studentProgress(data,student,8);assert.equal(saved.items.length,1);assert.equal(saved.items[0].state,'done');assert.equal(saved.actionable.length,0);
});

test('task summary includes classroom practice and current ORID, independently of grading',()=>{
 const collection={weeks:[4,5]},data={collection,activities:[{id:'w4',week:4,kind:'w4',phase:'review',accepting:true},{id:'w5',week:5,kind:'w5-personal',phase:'exhibit',accepting:true},{id:'w7',week:7,kind:'w7-news',accepting:true}]};
 const w4={activityId:'w4',versionCount:1,humanFeedback:true,decision:true,graded:true,readerTotal:1,readerPending:0};
 const w5={activityId:'w5',versionCount:1,materials:true,judgment:'submitted',peerAvailable:true,reflection:{status:'submitted',current:false}};
 const student={records:[w4,w5]},summary=()=>studentTaskSummary(studentProgress(data,student,18),collection);
 let p=summary();assert.equal(p.state,'missing');assert.equal(p.actionable.length,1);assert.equal(p.actionable[0].key,'orid');assert.ok(!p.items.some(i=>i.week===7));
 w5.reflection={status:'draft',current:true};assert.equal(summary().state,'missing');
 w5.reflection.status='submitted';p=summary();assert.equal(p.state,'done');assert.equal(p.items.length,7);
 w4.readerPending=1;w4.readerReady=1;assert.equal(summary().state,'missing');
 w4.humanFeedback=false;w4.decision=false;w4.readerPending=0;p=summary();assert.equal(p.state,'waiting');assert.ok(p.waiting.some(i=>i.key==='human'));assert.ok(p.waiting.some(i=>i.key==='decision'));
 w4.humanFeedback=true;data.activities[0].phase='production';p=summary();assert.equal(p.state,'waiting');assert.equal(p.waiting.find(i=>i.key==='decision').statusLabel,'等待開放改留');
 assert.equal(studentTaskSummary({items:[]},collection).state,'waiting');
});

test('completed assigned reader tasks remain visible without treating teacher coverage as student completion',async t=>{
 const f=await setup();t.after(f.close);const author=f.people[1],reader=f.people[0],w=await f.s.ensureWork(author,{activityId:'w4-demo'});
 await f.db.query("insert into rib.versions(id,work_id,ordinal,media,metadata,request_id) values('reader-summary-v1',$1,1,'[]','{}','reader-summary-v1')",[w.id]);
 await f.s.assignReader(f.teacher,{workId:w.id,studentId:reader.studentId});
 const get=async()=>{const d=await f.s.progress(reader,{});return {record:d.students[0].records.find(r=>r.activityId==='w4-demo'),p:studentProgress(d,d.students[0],6)};};
 let result=await get();assert.equal(result.record.readerTotal,1);assert.equal(result.record.readerPending,1);assert.equal(result.p.items.find(i=>i.key==='reader').state,'missing');
 await f.s.saveTeacherReading(f.teacher,{workId:w.id,versionId:'reader-summary-v1',mode:'human',situation:'看見圖卡',meaning:'無法確定心情',expectedRevision:0,status:'published',personallyRead:true});
 assert.equal((await get()).record.readerPending,1);
 const [r]=await f.db.query('select * from rib.reviews where reviewer_id=$1',[reader.studentId]);
 await f.s.review(reader,{reviewId:r.id,expectedRevision:r.revision,situation:'看見圖卡的線條。',meaning:'不能確定它代表哪種心情。'});
 result=await get();assert.equal(result.record.readerTotal,1);assert.equal(result.record.readerPending,0);assert.equal(result.p.items.find(i=>i.key==='reader').state,'done');
});
