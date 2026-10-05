import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';import {fixture} from './support.mjs';import {snapshot,restoreEmpty} from '../backup.mjs';
test('backup restores exact account data into an empty database, rejects corruption and refuses overwrite',async t=>{
 const f=await fixture(2);t.after(f.close);const backup=await snapshot(f.db);const pg=new PGlite();t.after(()=>pg.close());await pg.exec(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));const wrap=c=>({query:async(q,p=[])=> (await c.query(q,p)).rows,transaction:fn=>c.transaction(x=>fn(wrap(x)))}),db=wrap(pg);
 const corrupted=structuredClone(backup);corrupted.tables.students[0].name='changed';await assert.rejects(restoreEmpty(db,corrupted),/雜湊/);
 assert.equal((await restoreEmpty(db,backup)).students,2);assert.deepEqual(await db.query('select * from rib.credentials order by student_id'),await f.db.query('select * from rib.credentials order by student_id'));assert.equal((await db.query('select count(*)::int as n from rib.activities where accepting'))[0].n,0);await assert.rejects(restoreEmpty(db,backup),/空白/);
});

test('notification read versions and publication timestamps survive restore; v6 receives a new notification baseline',async t=>{
 const {sha}=await import('../security.mjs');const f=await fixture(2);t.after(f.close);
 await f.db.query("insert into rib.notification_reads(term,student_id,thread_key,version) values('11501','11500001','example','version')");
 const {Workspace}=await import('../service.mjs');const w=await new Workspace(f.db,f.store).ensureWork(f.people[0],{activityId:'w4-demo'});
 await f.db.query("insert into rib.versions(id,work_id,ordinal,media,metadata,request_id) values('restore-version',$1,1,'[]','{}','restore-request')",[w.id]);
 await f.db.query("insert into rib.ai_readings(id,version_id,comment_a,comment_b,source_hash,image_key,teacher_notes,status,created_by,published_at) values('restore-reading','restore-version','甲','乙','hash','private/test','{\"studentRecord\":{\"published\":true,\"kind\":\"joint\",\"teacherReply\":\"老師回覆\"}}','published','fixture',now())");
 const backup=await snapshot(f.db);
 const empty=async()=>{const pg=new PGlite();t.after(()=>pg.close());await pg.exec(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));const wrap=c=>({query:async(q,p=[])=> (await c.query(q,p)).rows,transaction:fn=>c.transaction(x=>fn(wrap(x)))});return wrap(pg);};
 const db=await empty();await restoreEmpty(db,backup);assert.deepEqual(await db.query('select * from rib.notification_reads'),await f.db.query('select * from rib.notification_reads'));assert.deepEqual(await db.query('select student_record_updated_at from rib.ai_readings'),await f.db.query('select student_record_updated_at from rib.ai_readings'));
 const {sha256,...old}=structuredClone(backup);old.format='rib-backup-v6';delete old.tables.notification_reads;for(const row of old.tables.workspace_state)delete row.notifications_since;for(const row of old.tables.ai_readings)delete row.student_record_updated_at;
 const oldDb=await empty();await restoreEmpty(oldDb,{...old,sha256:sha(JSON.stringify(old))});assert.equal((await oldDb.query('select count(*)::int n from rib.notification_reads'))[0].n,0);assert.ok((await oldDb.query('select notifications_since from rib.workspace_state'))[0].notifications_since);assert.equal((await oldDb.query('select count(*)::int n from rib.ai_readings'))[0].n,1);
});
