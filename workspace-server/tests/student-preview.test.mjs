import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './support.mjs';
import {handler} from '../http.mjs';
import {Workspace} from '../service.mjs';
import {createSession} from '../security.mjs';
import {snapshot} from '../backup.mjs';

async function setup(t){
  const f=await fixture();t.after(f.close);
  f.service=new Workspace(f.db,f.store);
  const run=handler({db:f.db,store:f.store,origin:'https://class.invalid',rateSecret:'test'});
  f.cookie='rib_session='+(await createSession(f.db,{role:'admin',email:f.teacher.email})).token;
  f.call=async(action,args={},options={})=>{
    const method=options.method||'GET',query={action,...(method==='GET'||options.query?args:{})};
    const req={url:'/api/workspace?'+new URLSearchParams(query),method,body:method==='POST'?{action,...args}:undefined,headers:{origin:'https://class.invalid','content-type':'application/json',cookie:options.cookie??f.cookie},socket:{remoteAddress:'127.0.0.1'}};
    const result={headers:{}};const res={setHeader:(k,v)=>result.headers[k]=v,end:body=>{result.status=res.statusCode;result.body=JSON.parse(body);}};
    await run(req,res);return result;
  };
  f.preview={previewActivity:'w4-demo',previewStudent:f.people[0].studentId};
  return f;
}
test('preview uses student board and media permissions, keeps teacher session and makes no persistent changes',async t=>{
  const f=await setup(t),own=await f.service.ensureWork(f.people[0],{activityId:'w4-demo'}),peer=await f.service.ensureWork(f.people[1],{activityId:'w4-demo'});
  for(const [id,w] of [['own-version',own],['peer-version',peer]])await f.db.query('insert into rib.versions(id,work_id,ordinal,media,metadata,request_id) values($1,$2,1,$3,$4,$1)',[id,w.id,JSON.stringify([{fullKey:id+'.jpg',thumbKey:id+'-thumb.jpg'}]),JSON.stringify({text:id})]);
  const before=await snapshot(f.db),sessions=await f.db.query('select * from rib.sessions');
  const context=await f.call('previewContext',f.preview);assert.equal(context.status,200);assert.equal(context.body.data.students.length,4);assert.ok(!JSON.stringify(context.body).includes('digest'));
  const home=await f.call('home',f.preview);assert.equal(home.body.data.person.role,'student');assert.equal(home.body.data.person.studentId,f.people[0].studentId);
  const board=await f.call('board',{...f.preview,activityId:'w4-demo'});assert.equal(board.status,200);assert.deepEqual(board.body.data,JSON.parse(JSON.stringify(await f.service.board(f.people[0],{activityId:'w4-demo'}))));
  assert.equal((await f.call('media',{...f.preview,versionId:'own-version'})).status,200);
  assert.equal((await f.call('media',{...f.preview,versionId:'peer-version'})).status,403);
  assert.equal((await f.call('board',{...f.preview,previewStudent:f.people[1].studentId,activityId:'w4-demo'})).body.data.works[0].id,peer.id);
  assert.equal((await f.call('home')).body.data.person.role,'admin');
  assert.deepEqual((await snapshot(f.db)).tables,before.tables);assert.deepEqual(await f.db.query('select * from rib.sessions'),sessions);
});
test('server denies all preview writes and administrative reads even when buttons or request parameters are forged',async t=>{
  const f=await setup(t),before=await snapshot(f.db);
  for(const action of ['ensureWork','prepare','finalize','review','reply','agreement','consent','saveAiJudgment','saveReflection','drawTopic','chooseTopic','invite','leaveGroup','selectionSave','control','logout','login','sendReminders','saveTeacherReading']){
    assert.equal((await f.call(action,f.preview,{method:'POST'})).status,403,action);
    assert.equal((await f.call(action,f.preview,{method:'POST',query:true})).status,403,action+' query');
  }
  for(const action of ['roster','classes','studentAccounts','termBackup','maintenance','evidence','archive','teacherReading','demoPlan','teacher-start'])assert.equal((await f.call(action,f.preview)).status,403,action);
  assert.deepEqual((await snapshot(f.db)).tables,before.tables);
  assert.equal((await f.call('home')).body.data.person.role,'admin');
});
test('every preview request rechecks teacher scope, student status, activity term, test isolation and archives',async t=>{
  const f=await setup(t);
  const studentCookie='rib_session='+(await createSession(f.db,{role:'student',term:'11501',studentId:f.people[0].studentId,revision:1})).token;
  assert.equal((await f.call('previewContext',f.preview,{cookie:studentCookie})).status,403);
  assert.equal((await f.call('home',f.preview,{cookie:''})).status,401);
  await f.db.query("update rib.teachers set role='teacher',scopes=$1",[JSON.stringify([{term:'11501',className:'102',grading:true}])]);
  assert.equal((await f.call('home',f.preview)).status,403);
  await f.db.query('update rib.teachers set scopes=$1',[JSON.stringify([{term:'11501',className:'101',grading:false}])]);
  assert.equal((await f.call('home',f.preview)).status,200);
  await f.db.query('update rib.students set active=false where student_id=$1',[f.preview.previewStudent]);assert.equal((await f.call('home',f.preview)).status,404);
  await f.db.query('update rib.students set active=true,is_test=true where student_id=$1',[f.preview.previewStudent]);assert.equal((await f.call('home',f.preview)).status,403);
  await f.db.query("update rib.activities set legacy='{\"testOnly\":true}' where id='w4-demo'");assert.equal((await f.call('home',f.preview)).status,200);
  await f.db.query("update rib.activities set archived=true where id='w4-demo'");assert.equal((await f.call('home',f.preview)).status,403);
  await f.db.query("update rib.activities set archived=false,term='11502' where id='w4-demo'");assert.equal((await f.call('home',f.preview)).status,404);
  await f.db.query("update rib.activities set term='11501' where id='w4-demo'");
  await f.db.query('update rib.teachers set active=false');assert.equal((await f.call('home',f.preview)).status,403);
});
test('preview honors student agreement and W5 private reading disclosure gates',async t=>{
  const f=await setup(t),w=await f.service.ensureWork(f.people[0],{activityId:'w4-demo'});
  await f.db.query("update rib.activities set kind='w5-personal' where id='w5-demo'");
  await f.db.query("insert into rib.versions(id,work_id,ordinal,media,metadata,request_id) values('v1',$1,1,'[]','{}','r1')",[w.id]);
  await f.db.query("insert into rib.ai_readings(id,version_id,comment_a,comment_b,source_hash,image_key,teacher_notes,status,created_by,published_at) values('reading1','v1','甲內容','乙內容','hash','private/reading.jpg',$1,'published','fixture',now())",[JSON.stringify({judgment:'教師內部秘密',studentRecord:{published:true,basis:'繳交後才能看',internalSecret:'不公開的原始備註'}})]);
  const a={...f.preview,previewActivity:'w5-demo'};
  const actual=await f.service.aiReading(f.people[0],{readingId:'reading1'}),preview=await f.call('aiReading',{...a,readingId:'reading1'});
  assert.equal(preview.status,200);assert.deepEqual(preview.body.data,JSON.parse(JSON.stringify(actual)));assert.ok(!JSON.stringify(preview.body).includes('教師內部秘密'));assert.equal(preview.body.data.recordLocked,true);assert.equal(preview.body.data.studentRecord,null);
  await f.service.saveAiJudgment(f.people[0],{activityId:'w5-demo',status:'submitted',expectedRevision:0,answers:{sourceReference:'reading1 / W4 V1',comment:'甲',quote:'甲內容',color:'yellow',evidence:'圖上不足以判定',rewritten:'目前還不能確定'}});
  const unlocked=await f.call('aiReading',{...a,readingId:'reading1'});assert.equal(unlocked.body.data.recordLocked,false);assert.equal(unlocked.body.data.studentRecord.basis,'繳交後才能看');assert.ok(!JSON.stringify(unlocked.body).includes('不公開的原始備註'));
  await f.db.query("update rib.ai_readings set status='draft'");assert.equal((await f.call('aiReading',{...a,readingId:'reading1'})).status,403);
  await f.db.query('update rib.students set sharing_agreement=null where student_id=$1',[f.preview.previewStudent]);
  assert.equal((await f.call('home',a)).body.data.agreementRequired,true);
  assert.equal((await f.call('board',{...a,activityId:'w5-demo'})).status,403);
  assert.equal((await f.call('agreement',{...a,accepted:true},{method:'POST'})).status,403);
});
