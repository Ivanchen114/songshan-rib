import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './support.mjs';import {Workspace} from '../service.mjs';import {parseRoster,currentTerm} from '../terms.mjs';import {authenticate,matches,sha} from '../security.mjs';import {snapshot,restoreEmpty} from '../backup.mjs';import {PGlite} from '@electric-sql/pglite';import {readFile} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';
const draft={term:'11502',sourceTerm:'11501',expectedRevision:0,teachers:['teacher@example.invalid','second@example.invalid'],rosterText:'學號\t姓名\t班級\t座號\n11500001\t示範同學1\t108\t1\n11500002\t示範同學2\t109\t2\n11509999\t新生\t109\t3'};
async function setup(t){const f=await fixture(3);t.after(f.close);await f.db.query("insert into rib.teachers(email,name,role) values('second@example.invalid','共同授課','teacher')");return {...f,s:new Workspace(f.db,f.store)};}
function env(t,value){const old=process.env.RIB_ACCEPTANCE_ONLY;process.env.RIB_ACCEPTANCE_ONLY=value;t.after(()=>old===undefined?delete process.env.RIB_ACCEPTANCE_ONLY:process.env.RIB_ACCEPTANCE_ONLY=old);}
test('semester draft validates roster, preserves current state, hides hashes and detects stale drafts',async t=>{
 const f=await setup(t),before=await f.db.query('select * from rib.credentials order by student_id');
 const r=await f.s.termSave(f.teacher,draft);assert.equal(r.issuedCodes.length,1);assert.match(r.issuedCodes[0].code,/^\d{6}$/);assert.equal(await currentTerm(f.db),'11501');
 assert.deepEqual(await f.db.query('select * from rib.credentials order by student_id'),before);assert.equal((await f.db.query("select count(*)::int as n from rib.students where term='11502'"))[0].n,0);
 assert.equal(r.draft.summary.retained.length,2);assert.equal(r.draft.summary.removed.length,1);assert.equal(r.draft.summary.moved.length,2);
 assert.ok(!JSON.stringify(await f.s.terms(f.teacher)).includes('digest'));assert.ok(!JSON.stringify(await f.s.terms(f.teacher)).includes(r.issuedCodes[0].code));
 await assert.rejects(f.s.termSave(f.teacher,draft),/已更新/);await assert.rejects(f.s.termSave(f.people[0],draft),/管理教師/);
 await assert.rejects(f.s.termSave(f.teacher,{...draft,term:'11601',rosterText:draft.rosterText.replace('示範同學1','另一人')}),/姓名不同/);
 assert.throws(()=>parseRoster('11500001\t甲\t108\t1\n11500001\t甲\t108\t2'),/重複/);
 assert.throws(()=>parseRoster('11500001\t甲\t108\t1\n11500002\t乙\t108\t1'),/重複/);
 const r2=await f.s.termSave(f.teacher,{...draft,expectedRevision:1});assert.equal(r2.issuedCodes.length,0);
});
test('activation is atomic, backs up to private storage, retains six digits and old works, shares both classes',async t=>{
 env(t,'false');const f=await setup(t);await f.s.dispatch(f.teacher,{activityId:'w4-demo',className:'101',expectedRevision:0});
 const works=await f.db.query('select * from rib.works order by id'),creds=await f.db.query('select * from rib.credentials order by student_id');
 const r=await f.s.termSave(f.teacher,draft),args={term:'11502',expectedRevision:r.draft.revision,confirmTerm:'11502',confirm:true};
 await assert.rejects(f.s.termActivate(f.teacher,{...args,confirmTerm:'wrong'}),/確認/);
 const activation=await f.s.termActivate(f.teacher,args);assert.equal(await currentTerm(f.db),'11502');assert.equal((await f.db.query("select sharing_agreement from rib.students where term='11502' limit 1"))[0].sharing_agreement,null);assert.equal((await f.s.termActivate(f.teacher,args)).alreadyActivated,true);
 assert.deepEqual(await f.db.query('select * from rib.works order by id'),works);
 assert.deepEqual(await f.db.query("select * from rib.credentials where term='11501' order by student_id"),creds);
 const [c]=await f.db.query("select * from rib.credentials where term='11502' and student_id='11500001'");assert.equal(await matches('012345',c),true);
 const [newC]=await f.db.query("select * from rib.credentials where term='11502' and student_id='11509999'");assert.equal(await matches(r.issuedCodes[0].code,newC),true);
 const login=await f.s.login({term:'11502',studentId:'11500001',code:'012345'},'test');assert.equal((await authenticate(f.db,login.token)).term,'11502');
 const activities=await f.db.query("select * from rib.activities where term='11502'");assert.equal(activities.length,2);assert.ok(activities.every(a=>!a.accepting&&!a.archived));
 for(const teacher of await f.db.query('select * from rib.teachers')){assert.deepEqual((await f.s.classes({role:teacher.role,email:teacher.email,teacher},{activityId:activities[0].id})).classes,['108','109']);}
 assert.ok((await f.db.query("select archived,accepting from rib.activities where term='11501'")).every(a=>a.archived&&!a.accepting));
 await assert.rejects(f.s.control(f.teacher,{activityId:'w4-demo',phase:'review',accepting:true,expectedRevision:2}),/已封存/);
 await assert.rejects(f.s.ensureWork(f.people[0],{activityId:'w4-demo'}),/已封存/);
 // Forged activityId cannot hide an archived target work.
 await assert.rejects(f.s.consent(f.people[0],{workId:works[0].id,activityId:activities[0].id,consent:true}),/已封存/);
 const [job]=await f.db.query('select * from rib.term_changes where id=$1',[activation.jobId]);assert.equal(job.snapshot.sha256,job.snapshot_hash);
 const archived=JSON.parse(gunzipSync(await f.store.get(job.summary.backupKey)));assert.equal(archived.sha256,job.snapshot_hash);assert.equal(archived.tables.works.length,3);
 assert.ok((await f.s.termBackup(f.teacher,{jobId:job.id})).url);await assert.rejects(f.s.termBackup(f.people[0],{jobId:job.id}),/管理教師/);
 // The actual R2 pre-switch archive is restorable, not merely a hash record.
 const recovery=new PGlite();t.after(()=>recovery.close());await recovery.exec(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));
 const rw=c=>({query:async(q,p=[])=> (await c.query(q,p)).rows,transaction:fn=>c.transaction(tx=>fn(rw(tx)))});
 await restoreEmpty(rw(recovery),archived);assert.equal(await currentTerm(rw(recovery)),'11501');assert.equal((await recovery.query('select count(*)::int as n from rib.works')).rows[0].n,3);
 // Full maintenance backup includes semester state and can restore to an empty DB.
 const b=await snapshot(f.db),pg=new PGlite();t.after(()=>pg.close());await pg.exec(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));const wrap=c=>({query:async(q,p=[])=> (await c.query(q,p)).rows,transaction:fn=>c.transaction(tx=>fn(wrap(tx)))});await restoreEmpty(wrap(pg),b);assert.equal((await pg.query('select current_term from rib.workspace_state')).rows[0].current_term,'11502');
});
test('activation refuses stale source, failed backup, acceptance-site activation and rolls all changes back on DB failure',async t=>{
 env(t,'false');const f=await setup(t),r=await f.s.termSave(f.teacher,draft),args={term:'11502',expectedRevision:r.draft.revision,confirmTerm:'11502',confirm:true};
 await f.db.query("update rib.students set seat=55 where student_id='11500001'");await assert.rejects(f.s.termActivate(f.teacher,args),/已更新/);
 const r2=await f.s.termSave(f.teacher,{...draft,expectedRevision:1});args.expectedRevision=r2.draft.revision;
 const put=f.store.put;f.store.put=async()=>{throw Error('storage down');};await assert.rejects(f.s.termActivate(f.teacher,args),/storage down/);f.store.put=put;
 assert.equal(await currentTerm(f.db),'11501');assert.equal((await f.db.query("select count(*)::int as n from rib.students where term='11502'"))[0].n,0);
 const corrupt={...f.store,get:async()=>Buffer.from('corrupt')};await assert.rejects(new Workspace(f.db,corrupt).termActivate(f.teacher,args),/備份讀回/);
 const fail=client=>({query:async(q,p)=>{if(q.startsWith('update rib.workspace_state'))throw Error('injected failure');return client.query(q,p);},transaction:fn=>client.transaction(tx=>fn(fail(tx)))});
 await assert.rejects(new Workspace(fail(f.db),f.store).termActivate(f.teacher,args),/injected/);assert.equal(await currentTerm(f.db),'11501');assert.equal((await f.db.query("select count(*)::int as n from rib.students where term='11502'"))[0].n,0);assert.equal((await f.db.query('select count(*)::int as n from rib.term_changes'))[0].n,0);
 process.env.RIB_ACCEPTANCE_ONLY='true';await assert.rejects(f.s.termActivate(f.teacher,args),/驗收站/);
});

test('unsupported historical activity cannot be reopened after cloning into a new semester',async t=>{
 env(t,'false');const f=await setup(t);await f.db.query("update rib.activities set kind='legacy-video' where id='w5-demo'");
 const r=await f.s.termSave(f.teacher,draft),args={term:'11502',expectedRevision:r.draft.revision,confirmTerm:'11502',confirm:true};
 assert.equal(r.draft.summary.unavailable.length,1);await assert.rejects(f.s.termActivate(f.teacher,args),/尚未支援/);
 await f.s.termActivate(f.teacher,{...args,ackUnsupported:true});const [legacy]=await f.db.query("select id,revision from rib.activities where term='11502' and kind='legacy-video'");
 await assert.rejects(f.s.control(f.teacher,{activityId:legacy.id,expectedRevision:legacy.revision,phase:'production',accepting:true}),/歷史模式/);
});
