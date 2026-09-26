import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture} from './support.mjs';import {Workspace} from '../service.mjs';
test('demo assignment skips uploads, is repeatable, keeps personal submissions empty and protects analysis even after submission',async t=>{
 const f=await fixture(4);t.after(f.close);const s=new Workspace(f.db,f.store);
 await f.db.query("update rib.activities set kind='w5-personal' where id='w5-demo'");
 const w=await s.ensureWork(f.people[0],{activityId:'w4-demo'});
 await f.db.query(`insert into rib.versions(id,work_id,ordinal,media,metadata,request_id) values('uploaded',$1,1,'[{"fullKey":"real.png"}]','{}','upload')`,[w.id]);
 let plan=await s.demoPlan(f.teacher,{activityId:'w5-demo',className:'101'});assert.equal(plan.candidates.length,3);assert.deepEqual(plan.candidates.map(x=>x.code),['A','B','C']);
 await assert.rejects(s.demoPlan(f.people[0],{activityId:'w5-demo',className:'101'}),e=>e.status===403);
 const teacher2={role:'teacher',email:'no',teacher:{scopes:[{term:'11501',className:'102'}]}};await assert.rejects(s.assignDemos(teacher2,{...plan}),e=>e.status===403);
 assert.equal((await s.assignDemos(f.teacher,plan)).assigned,3);
 await assert.rejects(s.assignDemos(f.teacher,plan),e=>e.status===409);
 plan=await s.demoPlan(f.teacher,{activityId:'w5-demo',className:'101'});assert.equal((await s.assignDemos(f.teacher,plan)).assigned,0);
 assert.equal((await f.db.query('select * from rib.versions')).length,1);assert.equal((await f.db.query('select * from rib.works')).length,1);
 const board=await s.board(f.people[1],{activityId:'w5-demo'});assert.equal(board.aiReadings.length,1);assert.equal(board.aiReadings[0].isDemo,true);
 const card=await s.aiReading(f.people[1],{readingId:board.aiReadings[0].id});assert.equal(card.studentRecord,null);assert.equal(card.teacherNotes,undefined);assert.match(card.taskNote,/不代表補交/);
 await assert.rejects(s.aiReading(f.people[0],{readingId:card.id}),e=>e.status===403);
 const answers={sourceReference:card.sourceReference,comment:'乙',quote:'特地替他留在這裡',color:'yellow',evidence:'圖中沒有約定',rewritten:'後來有人拿去裝菜'};
 await s.saveAiJudgment(f.people[1],{activityId:'w5-demo',status:'submitted',expectedRevision:0,answers});
 assert.equal((await s.aiReading(f.people[1],{readingId:card.id})).teacherNotes,undefined);assert.equal((await s.aiReading(f.people[1],{readingId:card.id})).studentRecord,null);
 await assert.rejects(s.saveAiJudgment(f.people[0],{activityId:'w5-demo',status:'submitted',expectedRevision:0,answers}),e=>e.status===403);
 assert.ok((await s.aiReading(f.teacher,{readingId:card.id})).teacherNotes);
 await f.db.query("update rib.activities set archived=true where id='w5-demo'");await assert.rejects(s.aiReading(f.people[1],{readingId:card.id}),e=>e.status===403);
});
test('a late upload invalidates the preview; another semester does not inherit assignments',async t=>{
 const f=await fixture(2);t.after(f.close);const s=new Workspace(f.db,f.store);await f.db.query("update rib.activities set kind='w5-personal' where id='w5-demo'");
 const plan=await s.demoPlan(f.teacher,{activityId:'w5-demo',className:'101'});const w=await s.ensureWork(f.people[0],{activityId:'w4-demo'});await f.db.query(`insert into rib.versions(id,work_id,ordinal,media,metadata,request_id) values('late',$1,1,'[{"fullKey":"real"}]','{}','late')`,[w.id]);
 await assert.rejects(s.assignDemos(f.teacher,plan),e=>e.status===409);const fresh=await s.demoPlan(f.teacher,{activityId:'w5-demo',className:'101'});assert.equal(fresh.candidates.length,1);await s.assignDemos(f.teacher,fresh);
 await f.db.query("insert into rib.activities(id,term,week,title,kind,phase) values('next','11502',5,'next','w5-personal','production')");assert.equal((await s.demoPlan(f.teacher,{activityId:'next',className:'101'})).alreadyAssigned,0);
});
