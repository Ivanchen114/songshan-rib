import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './support.mjs';
import {Workspace} from '../service.mjs';
import {snapshot,restoreEmpty} from '../backup.mjs';
import {sha} from '../security.mjs';
const answers={sourceReference:'圖卡 C03 / V1',comment:'甲',quote:'他一定很生氣。',color:'yellow',evidence:'第 2 格只有皺眉，還不能確定原因。',rewritten:'他皺著眉，原因還不能確定。'};
async function setup(t){const f=await fixture();t.after(f.close);await f.db.query("update rib.activities set kind='w5-personal' where id='w5-demo'");return {...f,s:new Workspace(f.db,f.store)};}
const input=(extra={})=>({activityId:'w5-demo',answers,status:'submitted',expectedRevision:0,...extra});
test('private responses save before diagram creation, persist revisions, and reject stale or incomplete submissions',async t=>{
 const f=await setup(t),p=f.people[0];
 await f.s.saveAiJudgment(p,input({status:'draft',answers:Object.fromEntries(Object.keys(answers).map(k=>[k,'']))}));
 await assert.rejects(f.s.saveAiJudgment(p,input()),/另一個視窗/);
 await f.s.saveAiJudgment(p,input({expectedRevision:1}));
 assert.deepEqual((await f.s.aiJudgments(p,{activityId:'w5-demo'})).responses[0].answers,answers);
 assert.equal((await f.s.board(p,{activityId:'w5-demo'})).works.length,0);
 assert.equal((await f.s.aiJudgments(f.people[1],{activityId:'w5-demo'})).responses.length,0);
 await assert.rejects(f.s.aiJudgments(f.people[1],{activityId:'w5-demo',studentId:p.studentId}),/自己/);
 await assert.rejects(f.s.saveAiJudgment(f.people[1],input({studentId:p.studentId})),/自己/);
 await assert.rejects(f.s.saveAiJudgment(p,input({expectedRevision:2,answers:{...answers,color:'purple'}})),/選項/);
 await assert.rejects(f.s.saveAiJudgment(p,input({expectedRevision:2,answers:{...answers,rewritten:''}})),/送出前/);
 await assert.rejects(f.s.saveAiJudgment(p,input({expectedRevision:2,answers:{...answers,color:'green'}})),/選項/);
 await f.s.saveAiJudgment(p,input({expectedRevision:2,answers:{...answers,color:'red',evidence:'第 2 格人物正在哭，反駁他一直笑著。'}}));
 assert.equal((await f.db.query("select * from rib.events where kind='ai-judgment'")).length,3);
 assert.equal((await f.db.query('select * from rib.reviews')).length,0);
});
test('teacher scope, activity writes, test accounts and archives protect responses',async t=>{
 const f=await setup(t),p=f.people[0];await f.s.saveAiJudgment(p,input());
 assert.equal((await f.s.aiJudgments(f.teacher,{activityId:'w5-demo',className:'101'})).responses.length,1);
 const wrong={role:'teacher',email:'scoped@example.invalid',teacher:{scopes:[{term:'11501',className:'102'}]}};
 await assert.rejects(f.s.aiJudgments(wrong,{activityId:'w5-demo',className:'101'}));
 await assert.rejects(f.s.saveAiJudgment(f.teacher,input()),/本人/);
 await assert.rejects(f.s.saveAiJudgment({...p,student:{...p.student,is_test:true}},input()),/活動/);
 await assert.rejects(f.s.saveAiJudgment(p,input({activityId:'w4-demo'})),/W5/);
 await f.db.query("update rib.activities set accepting=false where id='w5-demo'");
 await assert.rejects(f.s.saveAiJudgment(p,input({expectedRevision:1})),/開放/);
 await f.db.query("update rib.activities set archived=true where id='w5-demo'");
 await assert.rejects(f.s.saveAiJudgment(p,input({expectedRevision:1})),/封存/);
 assert.equal((await f.s.aiJudgments(f.teacher,{activityId:'w5-demo',className:'101'})).responses.length,1);
});
test('W4 assessment evidence changes with W5 response, while public galleries never include it',async t=>{
 const f=await setup(t),p=f.people[0],w=await f.s.ensureWork(p,{activityId:'w4-demo'}),before=await f.s.evidence(w.id);
 await f.s.saveAiJudgment(p,input());assert.notEqual(await f.s.evidence(w.id),before);
 assert.equal((await f.s.judgmentsForWork(w.id))[0].answers.quote,answers.quote);
 await assert.rejects(f.s.assess(f.teacher,{workId:w.id,studentId:p.studentId,criteria:[1,1,1,1],comment:'親自核對',status:'graded',evidenceReviewed:true,evidenceKey:before,expectedRevision:0}),/更新/);
 assert.ok(!JSON.stringify(await f.s.gallery({})).includes(answers.quote));
 await f.db.query("update rib.activities set phase='exhibit' where id='w5-demo'");
 assert.ok(!JSON.stringify(await f.s.classWall(f.people[1],{activityId:'w5-demo'})).includes(answers.quote));
});
test('snapshots preserve private responses and can restore older backups',async t=>{
 const f=await setup(t);await f.s.saveAiJudgment(f.people[0],input());const backup=await snapshot(f.db);
 assert.equal(backup.tables.ai_judgments.length,1);assert.equal(backup.format,'rib-backup-v5');
 const {PGlite}=await import('@electric-sql/pglite'),{readFile}=await import('node:fs/promises');
 for(const old of [false,true]){
  const pg=new PGlite();t.after(()=>pg.close());await pg.exec(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));
  const wrap=c=>({query:async(q,p=[])=>(await c.query(q,p)).rows,transaction:fn=>c.transaction(tx=>fn(wrap(tx)))});
  let b=structuredClone(backup);if(old){delete b.sha256;b.format='rib-backup-v3';delete b.tables.ai_judgments;b.sha256=sha(JSON.stringify(b));}
  const restored=await restoreEmpty(wrap(pg),b);assert.equal(restored.ai_judgments,old?0:1);
 }
});

test('unified backup restores both published-reading V4 and response-only V4 without losing either table',async t=>{
 const f=await setup(t);await f.s.saveAiJudgment(f.people[0],input());
 const w=await f.s.ensureWork(f.people[0],{activityId:'w4-demo'});
 await f.db.query("insert into rib.versions(id,work_id,ordinal,media,metadata,request_id) values('compat-v1',$1,1,'[]','{}','compat')",[w.id]);
 await f.db.query("insert into rib.ai_readings(id,version_id,comment_a,comment_b,source_hash,image_key,status,created_by,published_at) values('compat-reading','compat-v1','甲','乙','hash','private/image','published','fixture',now())");
 const complete=await snapshot(f.db);assert.equal(complete.format,'rib-backup-v5');
 const {PGlite}=await import('@electric-sql/pglite'),{readFile}=await import('node:fs/promises');
 for(const omit of [null,'ai_readings','ai_judgments']){
  const pg=new PGlite();t.after(()=>pg.close());await pg.exec(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));
  const wrap=c=>({query:async(q,p=[])=>(await c.query(q,p)).rows,transaction:fn=>c.transaction(tx=>fn(wrap(tx)))});
  const b=structuredClone(complete);delete b.sha256;if(omit){b.format='rib-backup-v4';delete b.tables[omit];}b.sha256=sha(JSON.stringify(b));
  const restored=await restoreEmpty(wrap(pg),b);assert.equal(restored.ai_readings,omit==='ai_readings'?0:1);assert.equal(restored.ai_judgments,omit==='ai_judgments'?0:1);
 }
});
