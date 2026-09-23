import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {fixture} from './support.mjs';
import {Workspace} from '../service.mjs';
import {authenticate,sha} from '../security.mjs';
const picture=()=>sharp({create:{width:240,height:160,channels:3,background:'#b8d0bf'}}).png().toBuffer();
async function upload(f,service,p,workId,requestId,expectedRevision=0,extras={}){
 const bytes=await picture(),prepared=await service.prepare(p,{workId,requestId,expectedRevision,files:[{bytes:bytes.length,mime:'image/png',sha256:sha(bytes)}],...extras});
 if(prepared.versionId)return prepared;const [t]=await f.db.query('select files from rib.uploads where id=$1',[prepared.ticketId]);f.store.objects.set(t.files[0].key,bytes);return service.finalize(p,{ticketId:prepared.ticketId,...extras});
}
test('original six digits, leading zero, hash upgrade, expiration and revision revoke',async t=>{const f=await fixture();t.after(f.close);const s=new Workspace(f.db,f.store),p=f.people[0];await assert.rejects(s.login({term:p.term,studentId:p.studentId,code:'123456'},'a'),/不正確/);const session=await s.login({term:p.term,studentId:p.studentId,code:'012345'},'a');assert.equal((await authenticate(f.db,session.token)).studentId,p.studentId);const [c]=await f.db.query('select algorithm from rib.credentials where student_id=$1',[p.studentId]);assert.equal(c.algorithm,'scrypt');await f.db.query('update rib.credentials set revision=2 where student_id=$1',[p.studentId]);await assert.rejects(authenticate(f.db,session.token),/失效/);});
test('allocation before uploads gives last submitter a reader and permits reading before own upload',async t=>{const f=await fixture(5);t.after(f.close);const s=new Workspace(f.db,f.store);const r=await s.dispatch(f.teacher,{activityId:'w4-demo',className:'101',expectedRevision:0});assert.equal(r.added,5);let assignments=await f.db.query('select * from rib.reviews');assert.equal(assignments.filter(x=>x.status==='waiting').length,5);const works=await f.db.query('select * from rib.works');for(const a of assignments)assert.notEqual(works.find(w=>w.id===a.target_work_id).owner_id,a.reviewer_id);
 const late=f.people[4],lateWork=works.find(w=>w.owner_id===late.studentId);for(const p of f.people.slice(0,4))await upload(f,s,p,works.find(w=>w.owner_id===p.studentId).id,'first-'+p.studentId);
 const [lateTask]=await f.db.query('select * from rib.reviews where reviewer_id=$1',[late.studentId]);assert.equal(lateTask.status,'assigned');await s.media(late,{versionId:lateTask.version_id});await s.review(late,{reviewId:lateTask.id,expectedRevision:lateTask.revision,situation:'人物把椅子移開，手伸向旁邊。',meaning:'像是在讓出位置，根據是空出的椅子。'});
 await upload(f,s,late,lateWork.id,'last-person');const [target]=await f.db.query('select * from rib.reviews where target_work_id=$1',[lateWork.id]);assert.equal(target.status,'assigned');assert.ok(target.version_id);
 await s.dispatch(f.teacher,{activityId:'w4-demo',className:'101',expectedRevision:1});assert.equal((await f.db.query('select * from rib.reviews')).length,5);
});
test('image access isolation, no V2 before feedback, idempotent retry and immutable feedback',async t=>{const f=await fixture();t.after(f.close);const s=new Workspace(f.db,f.store);await s.dispatch(f.teacher,{activityId:'w4-demo',className:'101',expectedRevision:0});const p=f.people[0],[w]=await f.db.query('select * from rib.works where owner_id=$1',[p.studentId]);const v=await upload(f,s,p,w.id,'same-id');assert.equal((await upload(f,s,p,w.id,'same-id')).versionId,v.versionId);assert.equal((await f.db.query('select * from rib.versions')).length,1);
 const [r]=await f.db.query('select * from rib.reviews where target_work_id=$1',[w.id]),reader=f.people.find(p=>p.studentId===r.reviewer_id),outsider=f.people.find(x=>x!==p&&x!==reader);await assert.rejects(s.media(outsider,{versionId:v.versionId}),/指定/);
 await assert.rejects(upload(f,s,p,w.id,'v2',1,{reason:'有依據的修改'}),/真人回饋/);
 const feedback={reviewId:r.id,expectedRevision:r.revision,situation:'看見人物移動椅子。',meaning:'可能是在讓位。'};await s.review(reader,feedback);await s.review(reader,feedback);await assert.rejects(s.review(reader,{...feedback,meaning:'改成另一種說法'}),/不能覆蓋/);
 const second=await upload(f,s,p,w.id,'v2',1,{reason:'讓移動方向更清楚。'});await assert.rejects(s.media(reader,{versionId:second.versionId}),/初讀版本/);assert.equal((await s.board(p,{activityId:'w4-demo'})).works[0].feedback.length,1);
});
test('tampered media hash, invalid formats and public review/consent gates',async t=>{const f=await fixture();t.after(f.close);const s=new Workspace(f.db,f.store),p=f.people[0],w=await s.ensureWork(p,{activityId:'w4-demo'});const bad=await s.prepare(p,{workId:w.id,requestId:'tamper',expectedRevision:0,files:[{bytes:3,mime:'image/png',sha256:sha('abc')}]});const [ticket]=await f.db.query('select * from rib.uploads where id=$1',[bad.ticketId]);f.store.objects.set(ticket.files[0].key,Buffer.from('xyz'));await assert.rejects(s.finalize(p,{ticketId:bad.ticketId}),/內容/);
 const v=await upload(f,s,p,w.id,'good');const [pub]=await f.db.query('select * from rib.publications where version_id=$1',[v.versionId]);await s.consent(p,{workId:w.id,consent:false});await assert.rejects(s.publish(f.teacher,{publicationId:pub.id,publish:true,reviewed:true}),/作者/);await s.consent(p,{workId:w.id,consent:true});await assert.rejects(s.publish(f.teacher,{publicationId:pub.id,publish:true}),/逐張/);await s.publish(f.teacher,{publicationId:pub.id,publish:true,reviewed:true,title:'故事圖卡'});const gallery=await s.gallery();assert.equal(gallery.items.length,1);assert.ok(!JSON.stringify(gallery).includes(p.studentId));await s.consent(p,{workId:w.id,consent:false});assert.equal((await s.gallery()).items.length,0);
});
test('W5 invitation requires own confirmation and pending members cannot upload',async t=>{const f=await fixture();t.after(f.close);const s=new Workspace(f.db,f.store),[a,b]=f.people,w=await s.ensureWork(a,{activityId:'w5-demo'});await s.invite(a,{workId:w.id,studentIds:[b.studentId]});await assert.rejects(s.work(b,w.id,{write:true}),/不能保存/);await s.invitation(b,{activityId:'w5-demo',workId:w.id,accept:true});await s.work(b,w.id,{write:true});assert.equal((await s.ensureWork(b,{activityId:'w5-demo'})).id,w.id);await assert.rejects(s.invite(a,{workId:w.id,studentIds:[b.studentId]}),/小組/);});
test('class scopes and assessment evidence/revision guard',async t=>{const f=await fixture();t.after(f.close);const s=new Workspace(f.db,f.store),p=f.people[0],w=await s.ensureWork(p,{activityId:'w4-demo'});await upload(f,s,p,w.id,'grade-v1');const other={role:'teacher',email:'other@example.invalid',teacher:{scopes:[{term:'11501',className:'102',grading:true}]}};await assert.rejects(s.board(other,{activityId:'w4-demo',className:'101'}),/權限/);
 const data={workId:w.id,studentId:p.studentId,criteria:[2,2,2,2],comment:'已核對本人證據。',status:'graded',evidenceReviewed:true,evidenceKey:await s.evidence(w.id),expectedRevision:0};await s.assess(f.teacher,data);await assert.rejects(s.assess(f.teacher,data),/另一位/);await assert.rejects(s.assess(f.teacher,{...data,expectedRevision:1,evidenceKey:'old'}),/更新/);
});
test('late arrival gets an explicit extra reader; conversations stay private and keep original first read',async t=>{const f=await fixture(5);t.after(f.close);const s=new Workspace(f.db,f.store);await s.dispatch(f.teacher,{activityId:'w4-demo',className:'101',expectedRevision:0,absentIds:[f.people[4].studentId]});
 const works=await f.db.query('select * from rib.works');for(const p of f.people.slice(0,4))await upload(f,s,p,works.find(w=>w.owner_id===p.studentId).id,'early-'+p.studentId);
 const assignments=await f.db.query('select * from rib.reviews');for(const r of assignments)await s.review(f.people.find(p=>p.studentId===r.reviewer_id),{reviewId:r.id,expectedRevision:r.revision,situation:'畫面中有椅子。',meaning:'椅子空著，像在等待。'});
 const late=f.people[4],w=await s.ensureWork(late,{activityId:'w4-demo'});await upload(f,s,late,w.id,'late');const extra={workId:w.id,studentId:f.people[0].studentId};await assert.rejects(s.assignReader(f.teacher,extra),/確認/);await s.assignReader(f.teacher,{...extra,confirmExtra:true});const [r]=await f.db.query('select * from rib.reviews where target_work_id=$1',[w.id]);await s.review(f.people[0],{reviewId:r.id,expectedRevision:r.revision,situation:'畫面有人推椅子。',meaning:'看起來邀請對方坐下。'});
 const reply={reviewId:r.id,body:'你注意到椅子的方向，這正是我想問的。',requestId:'reply-once'};await s.reply(late,reply);await s.reply(late,reply);await s.reply(f.people[0],{...reply,body:'我根據手的位置判斷。',requestId:'reader-answer'});const c=await s.conversation(late,{reviewId:r.id});assert.equal(c.replies.length,2);assert.equal(c.review.situation,'畫面有人推椅子。');await assert.rejects(s.conversation(f.people[1],{reviewId:r.id}),/指定|參與/);
});
test('acceptance activity isolates test readers and blocks real-student entry and public publication',async t=>{
 const f=await fixture(4);t.after(f.close);const s=new Workspace(f.db,f.store);
 for(const p of f.people.slice(0,2)){await f.db.query('update rib.students set is_test=true where student_id=$1',[p.studentId]);p.student.is_test=true;}
 await f.db.query(`insert into rib.activities(id,term,week,title,kind,phase,accepting,legacy) values('test-only','11501',4,'驗收活動','w4','review',true,'{"testOnly":true}')`);
 assert.ok(!(await s.home(f.people[2])).activities.some(a=>a.id==='test-only'));
 assert.equal((await s.home(f.people[0])).person.isTest,true);
 await assert.rejects(s.ensureWork(f.people[0],{activityId:'w4-demo'}),/測試帳號請使用測試活動/);
 await assert.rejects(s.activity(f.people[2],'test-only'),/只供測試/);
 assert.equal((await s.dispatch(f.teacher,{activityId:'test-only',className:'101',expectedRevision:0})).added,2);
 const works=await f.db.query("select * from rib.works where activity_id='test-only'");assert.equal(works.length,2);
 const a=f.people[0],w=works.find(w=>w.owner_id===a.studentId);const v=await upload(f,s,a,w.id,'test-picture');
 const [r]=await f.db.query('select * from rib.reviews where target_work_id=$1',[w.id]);await s.media(f.people[1],{versionId:v.versionId});await s.review(f.people[1],{reviewId:r.id,expectedRevision:r.revision,situation:'示範讀者看見椅子。',meaning:'示範讀者認為在等待。'});
 await assert.rejects(s.media(f.people[2],{versionId:v.versionId}),/無法查看/);
 await assert.rejects(s.testFeedback(f.people[0],{workId:w.id}),/管理教師/);const otherWork=works.find(w=>w.owner_id===f.people[1].studentId);await upload(f,s,f.people[1],otherWork.id,'other-test-picture');await s.testFeedback(f.teacher,{workId:otherWork.id});assert.match((await f.db.query('select situation from rib.reviews where target_work_id=$1',[otherWork.id]))[0].situation,/系統測試回饋/);
 await s.consent(a,{workId:w.id,consent:true});const [pub]=await f.db.query('select id from rib.publications where version_id=$1',[v.versionId]);await assert.rejects(s.publish(f.teacher,{publicationId:pub.id,publish:true,reviewed:true}),/作者/);
 process.env.RIB_ACCEPTANCE_ONLY='true';t.after(()=>delete process.env.RIB_ACCEPTANCE_ONLY);
 await assert.rejects(s.login({term:'11501',studentId:f.people[2].studentId,code:'012345'},'test-only'),/只開放測試/);
 assert.ok((await s.login({term:'11501',studentId:a.studentId,code:'012345'},'test-only')).token);
 await assert.rejects(s.control(f.teacher,{activityId:'w4-demo',expectedRevision:0,phase:'review',accepting:true}),/只能開放測試/);
});

test('exhibit auto-fills late work using a finished reader and permits feedback, keep and V2',async t=>{
 const f=await fixture(5);t.after(f.close);const s=new Workspace(f.db,f.store),late=f.people[4];
 await s.dispatch(f.teacher,{activityId:'w4-demo',className:'101',expectedRevision:0,absentIds:[late.studentId]});
 for(const p of f.people.slice(0,4)){const [w]=await f.db.query('select * from rib.works where owner_id=$1',[p.studentId]);await upload(f,s,p,w.id,'early-'+p.studentId);}
 const old=await f.db.query('select * from rib.reviews');for(const r of old)await s.review(f.people.find(p=>p.studentId===r.reviewer_id),{reviewId:r.id,expectedRevision:r.revision,situation:'測試看見椅子。',meaning:'測試像在讓位。'});
 await s.control(f.teacher,{activityId:'w4-demo',expectedRevision:1,phase:'exhibit',accepting:true});
 const w=await s.ensureWork(late,{activityId:'w4-demo'}),v=await upload(f,s,late,w.id,'late');
 const before=await f.db.query('select * from rib.reviews order by id');
 const r=await s.dispatch(f.teacher,{activityId:'w4-demo',className:'101',expectedRevision:2});assert.equal(r.added,1);assert.equal(r.extra,1);assert.equal(r.waiting,0);
 assert.deepEqual(await f.db.query('select * from rib.reviews where id=any($1) order by id',[before.map(r=>r.id)]),before);
 assert.equal((await s.activity(f.teacher,'w4-demo')).phase,'exhibit');
 const [task]=await f.db.query('select * from rib.reviews where target_work_id=$1',[w.id]),reader=f.people.find(p=>p.studentId===task.reviewer_id);await s.media(reader,{versionId:task.version_id});
 await s.review(reader,{reviewId:task.id,expectedRevision:task.revision,situation:'測試圖中留了一個空位。',meaning:'測試像邀請別人加入。'});
 await s.decision(late,{workId:w.id,versionId:v.versionId,reason:'讀者有注意到空位，先保留。'});
 const v2=await upload(f,s,late,w.id,'late-v2',1,{reason:'再把空位位置畫得更清楚。'});assert.ok(v2.versionId);
 assert.equal((await s.dispatch(f.teacher,{activityId:'w4-demo',className:'101',expectedRevision:3})).added,0);
 await assert.rejects(s.dispatch(f.teacher,{activityId:'w4-demo',className:'101',expectedRevision:3}),/更新/);
});

test('busy readers leave named late work unfilled until one completes, without reshuffling',async t=>{
 const f=await fixture(5);t.after(f.close);const s=new Workspace(f.db,f.store),late=f.people[4];
 await s.dispatch(f.teacher,{activityId:'w4-demo',className:'101',expectedRevision:0,absentIds:[late.studentId]});
 const w=await s.ensureWork(late,{activityId:'w4-demo'});await upload(f,s,late,w.id,'late');await s.control(f.teacher,{activityId:'w4-demo',expectedRevision:1,phase:'exhibit',accepting:true});
 const original=await f.db.query('select * from rib.reviews order by id'),r=await s.dispatch(f.teacher,{activityId:'w4-demo',className:'101',expectedRevision:2});assert.equal(r.added,0);assert.equal(r.waiting,1);assert.equal(r.unmatched[0].seat,5);assert.match(r.unmatched[0].reason,/仍有任務/);assert.deepEqual(await f.db.query('select * from rib.reviews order by id'),original);
 const task=original[0],[target]=await f.db.query('select * from rib.works where id=$1',[task.target_work_id]);await upload(f,s,f.people.find(p=>p.studentId===target.owner_id),target.id,'first-ready');const [ready]=await f.db.query('select * from rib.reviews where id=$1',[task.id]);
 const reader=f.people.find(p=>p.studentId===ready.reviewer_id),input={reviewId:ready.id,expectedRevision:ready.revision,situation:'看見椅子。',meaning:'像在等待。'};
 await s.control(f.teacher,{activityId:'w4-demo',expectedRevision:3,phase:'exhibit',accepting:false});await assert.rejects(s.review(reader,input),/暫停/);
 await s.control(f.teacher,{activityId:'w4-demo',expectedRevision:4,phase:'exhibit',accepting:true});await s.review(reader,input);
 const filled=await s.dispatch(f.teacher,{activityId:'w4-demo',className:'101',expectedRevision:5});assert.equal(filled.added,1);assert.equal(filled.extra,1);assert.equal(filled.waiting,0);
});

test('one click repairs requested reader after another reader finishes, retaining done history',async t=>{
 const f=await fixture(5);t.after(f.close);const s=new Workspace(f.db,f.store);await s.dispatch(f.teacher,{activityId:'w4-demo',className:'101',expectedRevision:0});
 for(const p of f.people){const [w]=await f.db.query('select * from rib.works where owner_id=$1',[p.studentId]);await upload(f,s,p,w.id,'ready-'+p.studentId);}
 const reviews=await f.db.query('select r.*,w.owner_id from rib.reviews r join rib.works w on w.id=r.target_work_id'),requested=reviews[0],helper=reviews.find(r=>r.reviewer_id!==requested.reviewer_id&&r.reviewer_id!==requested.owner_id);
 await s.requestReplacement(f.people.find(p=>p.studentId===requested.reviewer_id),{reviewId:requested.id,reason:'已知原意'});await s.review(f.people.find(p=>p.studentId===helper.reviewer_id),{reviewId:helper.id,expectedRevision:helper.revision,situation:'看見測試椅子。',meaning:'推測測試讓位。'});
 await s.control(f.teacher,{activityId:'w4-demo',expectedRevision:1,phase:'exhibit',accepting:true});const r=await s.dispatch(f.teacher,{activityId:'w4-demo',className:'101',expectedRevision:2});assert.equal(r.replaced,1);assert.equal(r.extra,1);assert.equal(r.waiting,0);
 assert.equal((await f.db.query('select status from rib.reviews where id=$1',[requested.id]))[0].status,'cancelled');assert.equal((await f.db.query('select status from rib.reviews where id=$1',[helper.id]))[0].status,'done');
 const [replacement]=await f.db.query("select * from rib.reviews where target_work_id=$1 and status='assigned'",[requested.target_work_id]);assert.equal(replacement.reviewer_id,helper.reviewer_id);
});
