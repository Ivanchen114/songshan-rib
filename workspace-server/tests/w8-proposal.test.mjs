import test from 'node:test';import assert from 'node:assert/strict';import sharp from 'sharp';
import {fixture} from './support.mjs';import {Workspace} from '../service.mjs';import {sha} from '../security.mjs';
import {setupW8Materials} from '../w8-materials-setup.mjs';
async function setup(t){const f=await fixture(5);t.after(f.close);await setupW8Materials(f.db,{apply:true});
 const [a]=await f.db.query("select * from rib.activities where kind='w8-proposal' and not (legacy->>'testOnly')::boolean");
 await f.db.query('update rib.activities set accepting=true where id=any($1::text[])',[[a.id,a.legacy.materialsActivityId]]);
 return {...f,s:new Workspace(f.db,f.store),a,materialsId:a.legacy.materialsActivityId};}
async function group(f,people){const w=await f.s.ensureWork(people[0],{activityId:f.materialsId});if(people.length>1)await f.s.invite(people[0],{workId:w.id,studentIds:people.slice(1).map(p=>p.studentId)});return {...w,...await f.s.drawTopic(people[0],{workId:w.id,expectedRevision:0})};}
async function upload(f,p,w,title='先確認情況，再提供協助',requestId='proposal-one'){
 const bytes=await sharp({create:{width:800,height:1120,channels:3,background:'#eee'}}).png().toBuffer();
 const input={workId:w.id,expectedRevision:w.revision,requestId,title,files:[{bytes:bytes.length,mime:'image/png',sha256:sha(bytes)}]};
 const u=await f.s.prepare(p,input);const [ticket]=await f.db.query('select files from rib.uploads where id=$1',[u.ticketId]);f.store.objects.set(ticket.files[0].key,bytes);
 return {result:await f.s.finalize(p,{ticketId:u.ticketId}),input,ticketId:u.ticketId};}

test('same group, separate personal works; source comes from server; upload/readback/retry and resubmission keep evidence',async t=>{
 const f=await setup(t),[p,q]=f.people,g=await group(f,[p,q]);
 const [w,again]=await Promise.all([f.s.ensureWork(p,{activityId:f.a.id}),f.s.ensureWork(p,{activityId:f.a.id})]);assert.equal(w.id,again.id);
 const other=await f.s.ensureWork(q,{activityId:f.a.id});assert.notEqual(other.id,w.id);
 const b=await f.s.board(p,{activityId:f.a.id});assert.equal(b.works[0].topic,g.topic);assert.equal(b.relatedActivityId,f.materialsId);assert.equal(b.works[0].members.length,1);
 assert.equal((await f.s.board(p,{activityId:f.materialsId})).relatedActivityId,f.a.id);
 await assert.rejects(f.s.prepare(q,{workId:w.id,files:[]}),/不能保存/);
 await assert.rejects(f.s.prepare(p,{workId:w.id,topic:g.topic==='T1'?'T2':'T1',files:[]}),/已分配/);
 await assert.rejects(f.s.prepare(p,{workId:w.id,title:' ',files:[]}),/填寫/);
 const u=await upload(f,p,w);const v=await f.s.media(p,{versionId:u.result.versionId});assert.equal(v.metadata.title,u.input.title);assert.equal(v.metadata.topic,g.topic);assert.equal(v.metadata.sourceGroupId,g.id);assert.equal(v.metadata.publicDisplay,false);assert.equal(v.images.length,1);
 assert.equal((await f.s.prepare(p,u.input)).versionId,u.result.versionId);assert.equal((await f.s.finalize(p,{ticketId:u.ticketId})).versionId,u.result.versionId);
 await assert.rejects(f.s.media(q,{versionId:u.result.versionId}),/自己的作品/);
 const v2=await upload(f,p,{...w,revision:1},'補傳清楚照片','proposal-two');assert.notEqual(v2.result.versionId,u.result.versionId);
 assert.equal((await f.s.board(f.teacher,{activityId:f.a.id,className:'101'})).works.find(x=>x.id===w.id).versions.length,2);
 assert.equal((await f.s.board(q,{activityId:f.a.id})).works[0].versions.length,0);
 assert.equal((await f.s.gallery()).items.length,0);
 await f.s.consent(p,{workId:w.id,consent:true});assert.equal((await f.s.gallery()).items.length,0);
});
test('undrawn, ungrouped, wrong test scope, closed and archived gates; exhibition only within shared classes',async t=>{
 const f=await setup(t),[p,q,r,outside,tester]=f.people;
 await assert.rejects(f.s.ensureWork(p,{activityId:f.a.id}),/加入正確小組/);
 const own=await f.s.ensureWork(p,{activityId:f.materialsId});await assert.rejects(f.s.ensureWork(p,{activityId:f.a.id}),/完成抽題/);
 await f.s.drawTopic(p,{workId:own.id,expectedRevision:0});const w=await f.s.ensureWork(p,{activityId:f.a.id});
 await assert.rejects(f.s.ensureWork({...tester,student:{...tester.student,is_test:true}},{activityId:f.a.id}),/測試帳號/);
 const {result}=await upload(f,p,w);await f.db.query("update rib.activities set phase='exhibit',legacy=legacy||'{\"classroomGroups\":[[\"101\",\"102\"]]}'::jsonb where id=$1",[f.a.id]);
 for(const [x,cls]of[[q,'102'],[outside,'103']]){x.student.class_name=cls;await f.db.query('update rib.students set class_name=$1 where student_id=$2',[cls,x.studentId]);}
 assert.equal((await f.s.classWall(q,{activityId:f.a.id})).items[0].label,'101 班 示範同學1');assert.equal((await f.s.media(q,{versionId:result.versionId})).images.length,1);
 assert.equal((await f.s.classWall(outside,{activityId:f.a.id})).items.length,0);await assert.rejects(f.s.media(outside,{versionId:result.versionId}),/共同上課/);
 await f.db.query('update rib.activities set accepting=false where id=$1',[f.a.id]);await assert.rejects(upload(f,p,{...w,revision:1}),/不能保存/);
 await f.db.query('update rib.activities set archived=true where id=$1',[f.a.id]);await assert.rejects(f.s.media(p,{versionId:result.versionId}),/無法查看/);
});
test('adding personal submissions preserves an already drawn materials activity',async t=>{
 const f=await fixture(2);t.after(f.close);await f.db.query("insert into rib.activities(id,term,week,title,kind,phase,accepting) values('existing-w8','11501',8,'W8','w8-materials','production',true)");
 const s=new Workspace(f.db,f.store),p=f.people[0],w=await s.ensureWork(p,{activityId:'existing-w8'});await s.drawTopic(p,{workId:w.id,expectedRevision:0});const before=await f.db.query("select * from rib.works where activity_id='existing-w8'");
 await setupW8Materials(f.db,{apply:true});assert.deepEqual(await f.db.query("select * from rib.works where activity_id='existing-w8'"),before);
 const rows=await f.db.query("select * from rib.activities where kind='w8-proposal' and legacy->>'materialsActivityId'='existing-w8'");assert.equal(rows.length,1);assert.equal(rows[0].accepting,false);assert.equal((await setupW8Materials(f.db,{apply:true})).created.length,0);
});

test('home exposes the explicit W8 pair and archived teacher navigation keeps both stages reachable',async t=>{
 const f=await setup(t);
 const home=await f.s.home(f.people[0]);
 assert.equal(home.activities.find(a=>a.id===f.a.id).materialsActivityId,f.materialsId);
 await f.db.query('update rib.activities set archived=true where id=any($1::text[])',[[f.a.id,f.materialsId]]);
 const b=await f.s.board(f.teacher,{activityId:f.materialsId,className:'101'});
 assert.equal(b.relatedActivityId,f.a.id);
});
