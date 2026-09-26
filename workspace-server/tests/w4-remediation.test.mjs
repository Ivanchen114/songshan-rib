import {test} from 'node:test';import assert from 'node:assert/strict';import sharp from 'sharp';
import {fixture} from './support.mjs';import {Workspace} from '../service.mjs';import {sha} from '../security.mjs';import {canUpload} from '../../workspace/activities.js';import {portfolioHtml} from '../../workspace/portfolio-export.js';
async function upload(f,s,p,w,requestId,reason){const bytes=await sharp({create:{width:80,height:80,channels:3,background:'white'}}).png().toBuffer();const [current]=await f.db.query('select revision from rib.works where id=$1',[w.id]);const u=await s.prepare(p,{workId:w.id,requestId,expectedRevision:current.revision,files:[{bytes:bytes.length,mime:'image/png',sha256:sha(bytes)}]});const [row]=await f.db.query('select files from rib.uploads where id=$1',[u.ticketId]);f.store.objects.set(row.files[0].key,bytes);return s.finalize(p,{ticketId:u.ticketId,reason});}
test('reminders are scoped, private, repeat-safe, resolved by upload and guarded against stale roster',async t=>{
 const f=await fixture(3);t.after(f.close);const s=new Workspace(f.db,f.store),a={activityId:'w4-demo',className:'101'};
 await assert.rejects(s.reminderPlan(f.people[0],a),e=>e.status===403);
 const other={role:'teacher',email:'other',teacher:{scopes:[{term:'11501',className:'102'}]}};await assert.rejects(s.reminderPlan(other,a),e=>e.status===403);
 await assert.rejects(s.reminderPlan(f.teacher,{...a,deadline:'2026-99-99'}),e=>e.status===400);
 const old=await s.reminderPlan(f.teacher,a),w=await s.ensureWork(f.people[0],a);await upload(f,s,f.people[0],w,'v1');
 await assert.rejects(s.sendReminders(f.teacher,old),e=>e.status===409);
 const plan=await s.reminderPlan(f.teacher,a);assert.equal(plan.candidates.length,2);assert.equal((await s.sendReminders(f.teacher,plan)).sent,2);
 assert.equal((await s.sendReminders(f.teacher,await s.reminderPlan(f.teacher,a))).sent,0);
 assert.equal((await s.home(f.people[0])).reminders.length,0);const h=await s.home(f.people[1]);assert.equal(h.reminders.length,1);assert.ok(!JSON.stringify(h.reminders).includes('sentBy'));assert.ok(!JSON.stringify(h.reminders).includes(f.people[2].studentId));
 const unagreed={...f.people[1],student:{...f.people[1].student,sharing_agreement:null}};assert.equal((await s.home(unagreed)).agreementRequired,true);assert.equal((await s.home(unagreed)).reminders.length,1);
 const late=await s.ensureWork(f.people[1],a);await upload(f,s,f.people[1],late,'late');assert.equal((await s.home(f.people[1])).reminders.length,0);
 await f.db.query("update rib.activities set archived=true where id='w4-demo'");assert.equal((await s.home(f.people[2])).reminders.length,0);await assert.rejects(s.sendReminders(f.teacher,plan),e=>e.status===403);
});
test('teacher drafts stay private; simulation never unlocks author decision; personal confirmation preserves peers and enables keep/V2',async t=>{
 const f=await fixture(3);t.after(f.close);const s=new Workspace(f.db,f.store),p=f.people[0];await s.dispatch(f.teacher,{activityId:'w4-demo',className:'101',expectedRevision:0});const [w]=await f.db.query('select * from rib.works where owner_id=$1',[p.studentId]);const v=await upload(f,s,p,w,'v1');
 const [peer]=await f.db.query('select * from rib.reviews where target_work_id=$1',[w.id]);const reader=f.people.find(p=>p.studentId===peer.reviewer_id);
 const base={workId:w.id,versionId:v.versionId,expectedRevision:0,mode:'human',aiAssisted:true,situation:'第一格有人在門口。',meaning:'他可能在等人，門口是依據。',sourceNote:'AI 整理草稿，老師看圖後保留不確定語氣。'};
 const initialKey=await s.evidence(w.id);await s.saveTeacherReading(f.teacher,{...base,status:'draft'});
 assert.equal(await s.evidence(w.id),initialKey);assert.deepEqual((await s.board(p,{activityId:'w4-demo'})).works[0].teacherReadings,[]);assert.deepEqual((await s.journey(p,{})).works[0].teacherReadings,[]);
 await assert.rejects(s.teacherReading(p,{workId:w.id}),e=>e.status===403);await assert.rejects(s.saveTeacherReading(p,{...base,status:'published',personallyRead:true}),e=>e.status===403);
 await assert.rejects(s.saveTeacherReading(f.teacher,{...base,expectedRevision:1,status:'published'}),e=>e.status===400);
 await s.saveTeacherReading(f.teacher,{...base,expectedRevision:1,status:'published',mode:'ai-simulation',reviewed:true});
 assert.notEqual(await s.evidence(w.id),initialKey);
 assert.equal((await s.board(p,{activityId:'w4-demo'})).works[0].hasHumanFeedback,false);
 await assert.rejects(s.decision(p,{workId:w.id,versionId:v.versionId,reason:'我決定保留'}),/真人/);
 await assert.rejects(upload(f,s,p,w,'blocked-v2','加箭頭'),/真人/);
 await s.saveTeacherReading(f.teacher,{...base,expectedRevision:2,status:'published',personallyRead:true});
 let b=await s.board(p,{activityId:'w4-demo'});assert.equal(b.works[0].hasHumanFeedback,true);assert.equal(b.works[0].teacherReadings.length,2);assert.equal(b.works[0].teacherReadings[1].attribution,'老師初讀，AI 協助整理');assert.ok(!JSON.stringify(b.works[0].teacherReadings).includes('updatedBy'));assert.ok(canUpload(b.activity,b.works[0]));const journey=await s.journey(p,{});const jw=journey.works[0];assert.equal(jw.teacherReadings.length,2);assert.ok(!JSON.stringify(jw).includes('updatedBy'));const item={work:jw,version:jw.versions[0],images:[]};assert.match(portfolioHtml({title:'test',term:p.term,items:[item],includeFeedback:true}),/老師初讀，AI 協助整理/);assert.ok(!portfolioHtml({title:'test',term:p.term,items:[item]}).includes('老師初讀，AI 協助整理'));
 assert.deepEqual((await f.db.query('select * from rib.reviews where id=$1',[peer.id]))[0],peer);
 const task=(await s.board(reader,{activityId:'w4-demo'})).reviews.find(r=>r.id===peer.id);assert.equal(task.teacherCovered,true);assert.equal(task.status,'assigned');assert.equal(task.situation,undefined);
 await s.decision(p,{workId:w.id,versionId:v.versionId,reason:'老師讀到等人；我本來想畫等待，門口和時鐘已有線索，因此保留。'});
 await s.review(reader,{reviewId:peer.id,expectedRevision:peer.revision,situation:'人物站在門邊。',meaning:'像是在等人。'});
 await upload(f,s,p,w,'v2','加上時鐘，讓等待的線索更清楚。');
 await assert.rejects(s.saveTeacherReading(f.teacher,{...base,expectedRevision:3,status:'published',personallyRead:true}),/版本已更新/);
 assert.equal((await s.board(p,{activityId:'w4-demo'})).works[0].decisions.length,2);
 await f.db.query("update rib.activities set archived=true where id='w4-demo'");await assert.rejects(s.saveTeacherReading(f.teacher,{...base,expectedRevision:3,status:'draft'}),e=>e.status===403);
});
test('teacher human reading alone allows V2; publication invalidates a previously opened grade',async t=>{
 const f=await fixture(1);t.after(f.close);const s=new Workspace(f.db,f.store),p=f.people[0],w=await s.ensureWork(p,{activityId:'w4-demo'}),v=await upload(f,s,p,w,'first'),evidenceKey=await s.evidence(w.id);
 await s.saveTeacherReading(f.teacher,{workId:w.id,versionId:v.versionId,expectedRevision:0,status:'published',mode:'human',personallyRead:true,situation:'第一格站在門口。',meaning:'從時鐘讀到等待。'});
 await assert.rejects(s.assess(f.teacher,{workId:w.id,studentId:p.studentId,criteria:[2,2,2,2],comment:'已核對',status:'graded',evidenceReviewed:true,evidenceKey,expectedRevision:0}),/更新/);
 await upload(f,s,p,w,'second','老師讀到等待，但我想畫趕時間，所以加上奔跑的動作。');assert.equal((await s.board(p,{activityId:'w4-demo'})).works[0].decisions[0].choice,'revise');assert.equal((await f.db.query('select * from rib.reviews')).length,0);
});
