import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './support.mjs';
import {Workspace} from '../service.mjs';
import {handler} from '../http.mjs';
import {createSession} from '../security.mjs';
async function setup(){const f=await fixture();const s=new Workspace(f.db,f.store),p=f.people[0],w=await s.ensureWork(p,{activityId:'w4-demo'});await f.db.query("insert into rib.versions(id,work_id,ordinal,media,metadata,request_id) values('notify-v1',$1,1,'[]','{}','notify-v1')",[w.id]);await f.db.query("update rib.works set current_version_id='notify-v1' where id=$1",[w.id]);return {...f,s,p,w};}
const reading=(w,revision,status='published')=>({workId:w.id,versionId:'notify-v1',mode:'human',situation:'看見手指向空椅。',meaning:'我讀成邀請入座。',expectedRevision:revision,status,personallyRead:true});
test('published messages only; GET and teacher preview never mark read; fresh service shares read state',async t=>{
 const f=await setup();t.after(f.close);await f.s.saveTeacherReading(f.teacher,reading(f.w,0,'draft'));assert.equal((await f.s.notifications(f.p)).unread,0);
 await f.s.saveTeacherReading(f.teacher,reading(f.w,1));let inbox=await f.s.notifications(f.p);assert.equal(inbox.unread,1);assert.ok(!JSON.stringify(inbox).includes('手指'));
 const n=await f.s.notification(f.p,{id:inbox.items[0].id});assert.match(n.body,/手指/);assert.equal((await f.s.notifications(f.p)).unread,1);
 const preview={...f.p,teacherPreview:true};await f.s.notification(preview,{id:n.id});await assert.rejects(f.s.readNotification(preview,n),e=>e.status===403);
 await f.s.readNotification(f.p,n);assert.equal((await new Workspace(f.db,f.store).notifications(f.p)).unread,0);
 await f.s.saveTeacherReading(f.teacher,{...reading(f.w,2),meaning:'新回覆'});assert.equal((await f.s.notifications(f.p)).unread,1);await assert.rejects(f.s.readNotification(f.p,n),e=>e.status===409);
 assert.equal((await f.s.notifications(f.people[1])).items.length,0);await assert.rejects(f.s.notification(f.people[1],n),e=>e.status===404);
 await f.db.query('update rib.works set hidden=true where id=$1',[f.w.id]);assert.equal((await f.s.notifications(f.p)).items.length,0);await assert.rejects(f.s.notification(f.p,n),e=>e.status===404);
});
test('thread grouping, baseline, revoked membership and term/test boundaries',async t=>{
 const f=await setup();t.after(f.close);
 await f.db.query("insert into rib.reviews(id,activity_id,target_work_id,reviewer_id,term,version_id,status,situation,meaning) values('nr','w4-demo',$1,$2,'11501','notify-v1','done','s','m')",[f.w.id,f.people[1].studentId]);
 for(const i of [1,2])await f.s.reply(f.teacher,{reviewId:'nr',body:'老師的訊息'+i,requestId:'nr'+i});
 assert.equal((await f.s.notifications(f.p)).items.length,1);assert.equal((await f.s.notifications(f.people[1])).unread,1);assert.equal((await f.s.notifications(f.people[2])).unread,0);
 await f.db.query("update rib.workspace_state set notifications_since=now()+interval '1 second'");assert.equal((await f.s.notifications(f.p)).unread,0);
 await f.db.query("update rib.workspace_state set notifications_since='2000-01-01'");
 await f.db.query("update rib.members set status='declined' where work_id=$1 and student_id=$2",[f.w.id,f.p.studentId]);assert.equal((await f.s.notifications(f.p)).unread,0);
 await f.db.query("update rib.activities set legacy='{\"testOnly\":true}' where id='w4-demo'");assert.equal((await f.s.notifications(f.people[1])).unread,0);
});
test('W5 gated teacher record stays private until submitted; edits re-notify, unchanged resubmission does not',async t=>{
 const f=await setup();t.after(f.close);await f.db.query("update rib.activities set kind='w5-personal' where id='w5-demo'");
 await f.db.query("insert into rib.ai_readings(id,version_id,comment_a,comment_b,source_hash,image_key,teacher_notes,status,created_by,published_at) values('n-ai','notify-v1','甲','乙','h','private/x',$1,'published','fixture',now())",[JSON.stringify({secret:'PRIVATE',studentRecord:{published:true,kind:'joint',teacherReply:'老師的私人判讀回覆'}})]);
 assert.equal((await f.s.notifications(f.p)).unread,0);
 const answers={sourceReference:'n-ai / W4 V1',comment:'甲',quote:'一定',color:'yellow',evidence:'畫面看不出',rewritten:'只看見手勢'};
 await f.s.saveAiJudgment(f.p,{activityId:'w5-demo',answers,status:'draft',expectedRevision:0});assert.equal((await f.s.notifications(f.p)).unread,0);
 await f.s.saveAiJudgment(f.p,{activityId:'w5-demo',answers,status:'submitted',expectedRevision:1});const n=(await f.s.notifications(f.p)).items[0];assert.ok(n);assert.ok(!JSON.stringify(await f.s.notification(f.p,n)).includes('PRIVATE'));
 await f.s.readNotification(f.p,n);await f.s.saveAiJudgment(f.p,{activityId:'w5-demo',answers,status:'submitted',expectedRevision:2});assert.equal((await f.s.notifications(f.p)).unread,0);
 await f.db.query("update rib.ai_readings set teacher_notes=jsonb_set(teacher_notes,'{studentRecord,teacherReply}','\"老師更新\"') where id='n-ai'");assert.equal((await f.s.notifications(f.p)).unread,1);
 await f.db.query("update rib.ai_readings set status='withdrawn' where id='n-ai'");assert.equal((await f.s.notifications(f.p)).items.length,0);
});
test('HTTP requires login and a same-origin POST for read, preview mutation is rejected',async t=>{
 const f=await setup();t.after(f.close);await f.s.saveTeacherReading(f.teacher,reading(f.w,0));const n=(await f.s.notifications(f.p)).items[0];
 const run=handler({db:f.db,store:f.store,origin:'https://class.invalid',rateSecret:'test'});
 const ask=async(action,token='',method='GET',input={},origin='https://class.invalid')=>{let result={};await run({url:'/api/workspace?'+new URLSearchParams({action,...(method==='GET'?input:{})}),method,body:method==='POST'?{action,...input}:undefined,headers:{cookie:'rib_session='+token,origin,'content-type':'application/json'},socket:{remoteAddress:'127.0.0.1'}},{setHeader:()=>{},end:v=>result.body=JSON.parse(v),set statusCode(n){result.status=n;}});return result;};
 assert.equal((await ask('notifications')).status,401);const login=await createSession(f.db,{role:'student',term:f.p.term,studentId:f.p.studentId,revision:1});
 assert.equal((await ask('notifications',login.token)).body.data.unread,1);assert.equal((await ask('readNotification',login.token,'GET',n)).status,405);assert.equal((await ask('readNotification',login.token,'POST',n,'https://other.invalid')).status,403);
 const teacher=await createSession(f.db,{role:'admin',email:f.teacher.email}),preview={previewActivity:'w4-demo',previewStudent:f.p.studentId};assert.equal((await ask('notification',teacher.token,'GET',{...preview,id:n.id})).status,200);assert.equal((await ask('readNotification',teacher.token,'POST',{...preview,...n})).status,403);
 assert.equal((await ask('readNotification',login.token,'POST',n)).status,200);assert.equal((await ask('notifications',login.token)).body.data.unread,0);
});

test('published assessment comments and addressed reminders notify only the intended student',async t=>{
 const f=await setup();t.after(f.close);
 const assess={workId:f.w.id,studentId:f.p.studentId,criteria:[2,2,2,2],comment:'評閱留言',evidenceKey:await f.s.evidence(f.w.id),expectedRevision:0,status:'draft'};
 await f.s.assess(f.teacher,assess);assert.equal((await f.s.notifications(f.p)).unread,0);
 await f.s.assess(f.teacher,{...assess,expectedRevision:1,status:'graded',evidenceReviewed:true});assert.equal((await f.s.notifications(f.p)).items[0].kind,'assessment');assert.equal((await f.s.notifications(f.people[1])).unread,0);
 await f.db.query("update rib.activities set legacy=jsonb_set(coalesce(legacy,'{}'),'{w4Reminders}',$1::jsonb) where id='w4-demo'",[JSON.stringify({[f.people[1].studentId]:[{id:'reminder-test',message:'請補圖卡',sentAt:new Date().toISOString()}]})]);
 assert.equal((await f.s.notifications(f.people[1])).items[0].kind,'reminder');assert.equal((await f.s.notifications(f.people[2])).unread,0);
 await f.s.assess(f.teacher,{...assess,expectedRevision:2,status:'draft'});assert.equal((await f.s.notifications(f.p)).unread,0);
});

test('conversation HTTP preserves reader perspective and excludes internal work data',async t=>{
 const f=await setup();t.after(f.close);
 await f.db.query("insert into rib.reviews(id,activity_id,target_work_id,reviewer_id,term,version_id,status,situation,meaning) values('reader-perspective','w4-demo',$1,$2,'11501','notify-v1','done','看見椅子','像在邀請')",[f.w.id,f.people[1].studentId]);
 const run=handler({db:f.db,store:f.store,origin:'https://class.invalid',rateSecret:'test'});
 for(const [p,viewer]of [[f.p,'author'],[f.people[1],'reader'],[f.teacher,'teacher']]){
  const token=(await createSession(f.db,p.role==='student'?{role:'student',term:p.term,studentId:p.studentId,revision:1}:{role:'admin',email:p.email})).token;
  let result;await run({url:'/api/workspace?action=conversation&reviewId=reader-perspective',method:'GET',headers:{cookie:'rib_session='+token},socket:{}},{setHeader:()=>{},end:v=>result=JSON.parse(v)});
  assert.equal(result.ok,true);assert.equal(result.data.viewer,viewer);assert.equal(result.data.work,undefined);
 }
});
