import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fixture} from './support.mjs';
import {Workspace} from '../service.mjs';
import {snapshot} from '../backup.mjs';
import {studentProgress,teacherNextStep} from '../../workspace/progress-model.js';
import {conversationSource} from '../../workspace/conversation-source.js';
import {COLLECTION,collectionFor} from '../../workspace/collection.js';
import {gunzipSync} from 'node:zlib';

test('notification migration grants the existing application role, preserves baseline, and supports both backups',async t=>{
 const f=await fixture(2);t.after(f.close);
 await f.pg.exec('create role rib_app nologin; create role rib_browser nologin;');
 await f.pg.exec(await readFile(new URL('../grant-app-role.sql',import.meta.url),'utf8'));
 await f.pg.exec('drop table rib.notification_reads');
 const migration=await readFile(new URL('../notifications-schema.sql',import.meta.url),'utf8');
 await f.pg.exec(migration);
 const baseline=(await f.db.query('select notifications_since from rib.workspace_state'))[0].notifications_since;
 await f.pg.exec(migration);
 assert.deepEqual((await f.db.query('select notifications_since from rib.workspace_state'))[0].notifications_since,baseline);
 assert.equal((await f.db.query("select relrowsecurity from pg_class where oid='rib.notification_reads'::regclass"))[0].relrowsecurity,true);
 assert.equal((await f.db.query("select has_table_privilege('rib_app','rib.notification_reads','SELECT,INSERT,UPDATE,DELETE') as allowed"))[0].allowed,true);
 assert.equal((await f.db.query("select has_table_privilege('rib_browser','rib.notification_reads','SELECT') as allowed"))[0].allowed,false);
 assert.equal((await f.db.query("select count(*)::int as n from pg_policies where schemaname='rib' and tablename='notification_reads' and policyname='rib_server'"))[0].n,1);
 await f.pg.exec('set role rib_app');
 await f.db.query("insert into rib.notification_reads(term,student_id,thread_key,version) values('11501','11500001','fixture-thread','fixture-version')");
 const backup=await snapshot(f.db);assert.equal(backup.format,'rib-backup-v7');assert.equal(backup.tables.notification_reads.length,1);
 const s=new Workspace(f.db,f.store),saved=await s.termSave(f.teacher,{term:'11502',sourceTerm:'11501',expectedRevision:0,teachers:[f.teacher.email],rosterText:'11500001\t示範同學1\t101\t1\n11500002\t示範同學2\t101\t2'});
 await s.termActivate(f.teacher,{term:'11502',expectedRevision:saved.draft.revision,confirmTerm:'11502',confirm:true});
 const [job]=await f.db.query('select summary from rib.term_changes');
 const termBackup=JSON.parse(gunzipSync(await f.store.get(job.summary.backupKey)));
 assert.equal(termBackup.format,'rib-backup-v7');assert.equal(termBackup.tables.notification_reads.length,1);
});

test('conversation and notification preserve author/reader/teacher perspective, including readonly previews',async t=>{
 const f=await fixture(3);t.after(f.close);const s=new Workspace(f.db,f.store),[author,reader]=f.people,w=await s.ensureWork(author,{activityId:'w4-demo'});
 await f.db.query("insert into rib.versions(id,work_id,ordinal,media,request_id) values('review-v1',$1,1,'[]','review-v1')",[w.id]);
 await f.db.query("insert into rib.reviews(id,activity_id,target_work_id,reviewer_id,term,version_id,status,situation,meaning) values('review-perspective','w4-demo',$1,$2,'11501','review-v1','done','我看見一張椅子','可能有人邀請入座')",[w.id,reader.studentId]);
 await s.reply(author,{reviewId:'review-perspective',body:'作者回應',requestId:'author-one'});
 await s.reply(reader,{reviewId:'review-perspective',body:'讀者回應',requestId:'reader-one'});
 await s.reply(f.teacher,{reviewId:'review-perspective',body:'老師回應',requestId:'teacher-one'});
 for(const [p,viewer] of [[author,'author'],[reader,'reader'],[f.teacher,'teacher'],[{...reader,teacherPreview:true},'reader']])assert.equal((await s.conversation(p,{reviewId:'review-perspective'})).viewer,viewer);
 for(const [p,viewer] of [[author,'author'],[reader,'reader'],[{...reader,teacherPreview:true},'reader']]){
  const n=(await s.notifications(p)).items[0],detail=await s.notification(p,n);assert.equal(detail.conversation.viewer,viewer);assert.equal((await s.notifications(p)).unread,1);
 }
 assert.deepEqual(conversationSource('reader','reader',true),{source:'student',label:'我的初讀 · 原文'});
 assert.equal(conversationSource('author','reader').source,'peer');
 assert.equal(conversationSource('reader','author').source,'peer');
 assert.equal(conversationSource('teacher','teacher').source,'teacher');
});

test('reader responsibilities are actionable but never scored; teacher next step distinguishes dependencies',()=>{
 const data={collection:{id:'fixture'},activities:[{id:'w4',week:4,kind:'w4',phase:'review',accepting:true},{id:'w5',week:5,kind:'w5-personal',phase:'production',accepting:true}]};
 const student={records:[{activityId:'w4',versionCount:1,humanReaderStatus:'assigned',readerPending:1,readerReady:1},{activityId:'w5',materials:true,judgment:'submitted'}]};
 let p=studentProgress(data,student,18);assert.equal(p.actionable.find(i=>i.key==='reader').scored,false);assert.equal(p.items.filter(i=>i.scored).length,4);assert.equal(teacherNextStep(p).label,'等同學初讀');assert.equal(teacherNextStep(p).needsAction,false);
 student.records[0].humanReaderStatus=null;p=studentProgress(data,student,18);assert.equal(teacherNextStep(p).label,'等老師：安排或補初讀');
 student.records[0].humanFeedback=true;p=studentProgress(data,student,18);assert.match(teacherNextStep(p).label,/改留理由/);
 student.records[0].decision=true;p=studentProgress(data,student,18);assert.equal(teacherNextStep(p).label,'可評閱');
 student.records[0].graded=true;p=studentProgress(data,student,18);assert.equal(teacherNextStep(p).label,'已評閱');
});

test('collection scope has one shared configuration and ends only on an explicit teacher-set date',()=>{
 const previous=COLLECTION.endsAt;try{
  assert.equal(collectionFor('11502'),null);assert.deepEqual(collectionFor('11501').weeks,[4,5]);
  COLLECTION.endsAt='2026-10-10T00:00:00+08:00';
  assert.ok(collectionFor('11501',new Date('2026-10-09T23:59:59+08:00')));
  assert.equal(collectionFor('11501',new Date('2026-10-10T00:00:00+08:00')),null);
 }finally{COLLECTION.endsAt=previous;}
});
