import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture} from './support.mjs';import {Workspace} from '../service.mjs';
test('demo assignment skips usable pairs, is repeatable, keeps personal submissions empty and protects analysis even after submission',async t=>{
 const f=await fixture(4);t.after(f.close);const s=new Workspace(f.db,f.store);
 await f.db.query("update rib.activities set kind='w5-personal' where id='w5-demo'");
 const w=await s.ensureWork(f.people[0],{activityId:'w4-demo'});
 await f.db.query(`insert into rib.versions(id,work_id,ordinal,media,metadata,request_id) values('uploaded',$1,1,'[{"fullKey":"real.png"}]','{}','upload')`,[w.id]);
 await f.db.query("insert into rib.ai_readings(id,version_id,comment_a,comment_b,source_hash,image_key,status,created_by,published_at) values('pair','uploaded','甲','乙','hash','real.png','published','teacher',now())");
 let plan=await s.demoPlan(f.teacher,{activityId:'w5-demo',className:'101'});assert.equal(plan.candidates.length,3);assert.equal(plan.coverage.covered,1);
 await assert.rejects(s.demoPlan(f.people[0],{activityId:'w5-demo',className:'101'}),e=>e.status===403);
 const teacher2={role:'teacher',email:'no',teacher:{scopes:[{term:'11501',className:'102'}]}};await assert.rejects(s.assignDemos(teacher2,{...plan}),e=>e.status===403);
 assert.equal((await s.assignDemos(f.teacher,plan)).assigned,3);
 await assert.rejects(s.assignDemos(f.teacher,plan),e=>e.status===409);
 plan=await s.demoPlan(f.teacher,{activityId:'w5-demo',className:'101'});assert.equal((await s.assignDemos(f.teacher,plan)).assigned,0);
 assert.equal((await f.db.query('select * from rib.versions')).length,1);assert.equal((await f.db.query('select * from rib.works')).length,1);
 const board=await s.board(f.people[1],{activityId:'w5-demo'});assert.equal(board.aiReadings.length,3);assert.equal(board.aiReadings[0].isDemo,true);
 const card=await s.aiReading(f.people[1],{readingId:board.aiReadings[0].id});assert.equal(card.studentRecord,null);assert.equal(card.teacherNotes,undefined);assert.match(card.taskNote,/不代表補交/);
 await assert.rejects(s.aiReading(f.people[0],{readingId:card.id}),e=>e.status===403);
 const answers={sourceReference:card.sourceReference,comment:'乙',quote:'特地替他留在這裡',color:'yellow',evidence:'圖中沒有約定',rewritten:'後來有人拿去裝菜'};
 await s.saveAiJudgment(f.people[1],{activityId:'w5-demo',status:'submitted',expectedRevision:0,answers});
 assert.equal((await s.aiReading(f.people[1],{readingId:card.id})).teacherNotes,undefined);assert.equal((await s.aiReading(f.people[1],{readingId:card.id})).studentRecord,null);
 await assert.rejects(s.saveAiJudgment(f.people[0],{activityId:'w5-demo',status:'submitted',expectedRevision:0,answers}),e=>e.status===403);
 assert.ok((await s.aiReading(f.teacher,{readingId:card.id})).teacherNotes);
 await f.db.query("update rib.activities set archived=true where id='w5-demo'");await assert.rejects(s.aiReading(f.people[1],{readingId:card.id}),e=>e.status===403);
});
test('a newly published pair invalidates the preview; another semester does not inherit assignments',async t=>{
 const f=await fixture(2);t.after(f.close);const s=new Workspace(f.db,f.store);await f.db.query("update rib.activities set kind='w5-personal' where id='w5-demo'");
 const plan=await s.demoPlan(f.teacher,{activityId:'w5-demo',className:'101'});const w=await s.ensureWork(f.people[0],{activityId:'w4-demo'});await f.db.query(`insert into rib.versions(id,work_id,ordinal,media,metadata,request_id) values('late',$1,1,'[{"fullKey":"real"}]','{}','late')`,[w.id]);
 assert.equal((await s.demoPlan(f.teacher,{activityId:'w5-demo',className:'101'})).candidates.length,2);
 await f.db.query("insert into rib.ai_readings(id,version_id,comment_a,comment_b,source_hash,image_key,status,created_by,published_at) values('late-pair','late','甲','乙','hash','real','published','teacher',now())");
 await assert.rejects(s.assignDemos(f.teacher,plan),e=>e.status===409);const fresh=await s.demoPlan(f.teacher,{activityId:'w5-demo',className:'101'});assert.equal(fresh.candidates.length,1);await s.assignDemos(f.teacher,fresh);
 await f.db.query("insert into rib.activities(id,term,week,title,kind,phase) values('next','11502',5,'next','w5-personal','production')");assert.equal((await s.demoPlan(f.teacher,{activityId:'next',className:'101'})).alreadyAssigned,0);
});

test('assigned explanation is visible only to the demo owner and teacher',async t=>{
 const f=await fixture(2);t.after(f.close);const s=new Workspace(f.db,f.store);
 await f.db.query("update rib.activities set kind='w5-personal' where id='w5-demo'");
 const plan=await s.demoPlan(f.teacher,{activityId:'w5-demo',className:'101'});await s.assignDemos(f.teacher,plan);
 const board=await s.board(f.people[0],{activityId:'w5-demo'}),id=board.aiReadings[0].id;
 const [a]=await f.db.query("select legacy from rib.activities where id='w5-demo'");
 const entry=Object.values(a.legacy.w5DemoAssignments).flatMap(x=>x.choices||[x]).find(x=>x.id===id);entry.taskNote='原圖待釐清；先用示範完成判讀。漏發是系統條件不完整。';
 await f.db.query("update rib.activities set legacy=$1 where id='w5-demo'",[JSON.stringify(a.legacy)]);
 assert.equal((await s.aiReading(f.people[0],{readingId:id})).taskNote,entry.taskNote);
 assert.equal((await s.aiReading(f.teacher,{readingId:id})).taskNote,entry.taskNote);
 await assert.rejects(s.aiReading(f.people[1],{readingId:id}),e=>e.status===403);
});
test('three choices keep one response and reject another student reference',async t=>{
 const f=await fixture(2);t.after(f.close);const s=new Workspace(f.db,f.store);
 await f.db.query("update rib.activities set kind='w5-personal' where id='w5-demo'");
 const {demoCatalog}=await import('../demo-catalog.mjs');
 const owner=f.people[0].studentId;
 const choices=demoCatalog.map(c=>({...c,id:`demo-w5-demo-${owner}-${c.code}`,taskNote:'漏發原因說明'}));
 await f.db.query("update rib.activities set legacy=$1 where id='w5-demo'",[JSON.stringify({w5DemoAssignments:{[owner]:{choices}}})]);
 const board=await s.board(f.people[0],{activityId:'w5-demo'});assert.equal(board.aiReadings.length,3);
 assert.equal((await s.board(f.people[1],{activityId:'w5-demo'})).aiReadings.length,0);
 let revision=0;
 for(const choice of board.aiReadings){
  const card=await s.aiReading(f.people[0],{readingId:choice.id});assert.equal(card.taskNote,'漏發原因說明');assert.equal(card.teacherNotes,undefined);
  const answers={sourceReference:card.sourceReference,comment:'乙',quote:'測試摘句',color:'yellow',evidence:'缺少線索',rewritten:'縮小範圍'};
  await s.saveAiJudgment(f.people[0],{activityId:'w5-demo',status:'draft',expectedRevision:revision++,answers});
  await assert.rejects(s.saveAiJudgment(f.people[1],{activityId:'w5-demo',status:'draft',expectedRevision:0,answers}),e=>e.status===403);
 }
 const rows=await f.db.query('select * from rib.ai_judgments');assert.equal(rows.length,1);assert.equal(rows[0].revision,3);
});

test('coverage includes uploaded note-only, drafts, withdrawn, hidden and inaccessible pairs; preserves responses and old assignments',async t=>{
 const f=await fixture(8);t.after(f.close);const s=new Workspace(f.db,f.store);
 await f.db.query("update rib.activities set kind='w5-personal' where id='w5-demo'");
 for(let i=0;i<7;i++){
  const w=await s.ensureWork(f.people[i],{activityId:'w4-demo'});
  await f.db.query("insert into rib.versions(id,work_id,ordinal,media,request_id) values($1,$2,1,'[{\"fullKey\":\"image\"}]',$1)",['v'+i,w.id]);
  await f.db.query("insert into rib.ai_readings(id,version_id,comment_a,comment_b,task_note,source_hash,image_key,status,created_by,published_at) values($1,$2,$3,$4,$5,'hash','image',$6,'teacher',now())",['r'+i,'v'+i,i===1?'':i===6?' ':'甲',i===1?'':i===6?' ':'乙',i===1?'原圖全白，請重新上傳。':'',i===2?'draft':i===3?'withdrawn':'published']);
  if(i===4)await f.db.query('update rib.works set hidden=true where id=$1',[w.id]);
  if(i===5)await f.db.query("update rib.members set status='invited' where work_id=$1",[w.id]);
 }
 let plan=await s.demoPlan(f.teacher,{activityId:'w5-demo',className:'101'});assert.equal(plan.candidates.length,7);assert.equal(plan.coverage.covered,1);assert.match(plan.candidates[0].reason,/只有提醒/);
 await s.assignDemos(f.teacher,plan);
 const card=(await s.board(f.people[1],{activityId:'w5-demo'})).aiReadings.find(c=>c.isDemo);
 assert.match((await s.aiReading(f.people[1],{readingId:card.id})).taskNote,/原圖全白/);
 const answers={sourceReference:card.sourceReference,comment:'乙',quote:'摘句',color:'yellow',evidence:'線索',rewritten:'改寫'};
 await s.saveAiJudgment(f.people[1],{activityId:'w5-demo',status:'draft',expectedRevision:0,answers});
 const [old]=await f.db.query("select legacy from rib.activities where id='w5-demo'");
 plan=await s.demoPlan(f.teacher,{activityId:'w5-demo',className:'101'});assert.equal(plan.coverage.missing,0);assert.equal((await s.assignDemos(f.teacher,plan)).assigned,0);
 assert.deepEqual((await f.db.query("select legacy from rib.activities where id='w5-demo'"))[0],old);
 assert.equal((await f.db.query('select * from rib.ai_judgments'))[0].revision,1);
 await f.db.query("update rib.activities set legacy=jsonb_set(legacy,'{w5DemoAssignments}',$1::jsonb) where id='w5-demo'",[JSON.stringify(Object.fromEntries(Object.entries(old.legacy.w5DemoAssignments).filter(([id])=>id!==f.people[1].studentId)))]);
 plan=await s.demoPlan(f.teacher,{activityId:'w5-demo',className:'101'});assert.equal(plan.candidates.length,0);assert.equal(plan.needsReview.length,1);assert.equal(plan.coverage.missing,1);
});
