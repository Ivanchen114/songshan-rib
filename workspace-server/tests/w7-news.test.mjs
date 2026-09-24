import test from 'node:test';import assert from 'node:assert/strict';import sharp from 'sharp';
import {fixture} from './support.mjs';import {Workspace} from '../service.mjs';import {sha} from '../security.mjs';import {setupW7News} from '../w7-news-setup.mjs';import {W7_TOPICS} from '../../workspace/w7-topics.js';
import {activityFlow} from '../../workspace/activity-flow.js';import {studentNext} from '../../workspace/ui-model.js';
async function setup(t,n=4){const f=await fixture(n);t.after(f.close);await f.db.query("insert into rib.activities(id,term,week,title,kind,phase,accepting) values('news','11501',7,'W7 新聞 × 研究','w7-news','exhibit',true)");return {...f,s:new Workspace(f.db,f.store)};}
const 交流決定='看到第3組指出研究只測腦部連結，我們改寫成研究觀察的結果，因為原文未直接測成績。';
const draw=(f,p,w)=>f.s.drawTopic(p,{workId:w.id,expectedRevision:w.revision});
async function upload(f,p,w,topic=w.topic){const bytes=await sharp({create:{width:40,height:40,channels:3,background:'#5f846c'}}).png().toBuffer();const u=await f.s.prepare(p,{workId:w.id,expectedRevision:w.revision,requestId:crypto.randomUUID(),topic,text:交流決定,files:[{bytes:bytes.length,mime:'image/png',sha256:sha(bytes)}]});const [ticket]=await f.db.query('select files from rib.uploads where id=$1',[u.ticketId]);for(const file of ticket.files)f.store.objects.set(file.key,bytes);return f.s.finalize(p,{ticketId:u.ticketId});}
test('18 groups across two classes get 5/5/4/4; repeat requests and peer login never redraw',async t=>{
 const f=await setup(t,36),requests=[];
 for(let i=0;i<18;i++){const p=f.people[i*2],q=f.people[i*2+1];if(i>=9){for(const x of [p,q]){x.student.class_name='102';await f.db.query("update rib.students set class_name='102',seat=$2 where student_id=$1",[x.studentId,i*2+(x===q?2:1)-18]);}}
  const w=await f.s.ensureWork(p,{activityId:'news'});await f.s.invite(p,{workId:w.id,studentIds:[q.studentId]});requests.push({p,q,w});}
 const results=await Promise.all(requests.map(({p,w})=>draw(f,p,w)));
 const counts=Object.values(results.reduce((o,r)=>(o[r.topic]=(o[r.topic]||0)+1,o),{})).sort();assert.deepEqual(counts,[4,4,5,5]);
 const {p,q,w}=requests[0],retry=await Promise.all([draw(f,p,w),draw(f,q,w),draw(f,p,w)]);assert.ok(retry.every(r=>r.topic===results[0].topic));
 const fresh=new Workspace(f.db,f.store);assert.equal((await fresh.board(q,{activityId:'news'})).works[0].topic,results[0].topic);
 assert.equal((await f.db.query("select * from rib.events where kind='draw-topic'")).length,18);
 const memberRows=await f.db.query("select count(*)::int as n from rib.members where status='confirmed'");assert.equal(memberRows[0].n,36);
});
test('only an active member can draw; stale pages, wrong activity, test account and archived writes fail',async t=>{
 const f=await setup(t),[p,q]=f.people,w=await f.s.ensureWork(p,{activityId:'news'});
 await assert.rejects(draw(f,q,w),/不能保存/);await assert.rejects(draw(f,f.teacher,w),/學生/);
 await assert.rejects(draw(f,p,{...w,revision:9}),/更新/);
 await assert.rejects(draw(f,{...p,student:{...p.student,is_test:true}},w),/自己的新聞/);
 const other=await f.s.ensureWork(p,{activityId:'w4-demo'});await assert.rejects(draw(f,p,other),/新聞/);
 await f.db.query("update rib.activities set accepting=false where id='news'");await assert.rejects(draw(f,p,w),/不能保存/);
 await f.db.query("update rib.activities set accepting=true where id='news'");await draw(f,p,w);
 await f.db.query("update rib.activities set archived=true where id='news'");await assert.rejects(draw(f,p,w),/封存/);
});
test('leaving and recreating a group cannot reroll, and no assignment event is added',async t=>{
 const f=await setup(t),p=f.people[0],w=await f.s.ensureWork(p,{activityId:'news'});await draw(f,p,w);
 await f.s.leaveGroup(p,{workId:w.id,expectedRevision:1,confirmed:true});const next=await f.s.ensureWork(p,{activityId:'news'});assert.notEqual(next.id,w.id);
 await assert.rejects(draw(f,p,next),/已在另一組抽過/);assert.equal((await f.db.query("select * from rib.events where kind='draw-topic'")).length,1);
});
test('uploads use saved topic; same-topic exhibition and anonymous filters preserve group privacy',async t=>{
 const f=await setup(t),[p,q]=f.people,w=await f.s.ensureWork(p,{activityId:'news'});await f.s.invite(p,{workId:w.id,studentIds:[q.studentId]});
 await assert.rejects(upload(f,p,w,'N01'),/先完成/);const assigned=await draw(f,p,w),current=await f.s.work(p,w.id);
 await assert.rejects(upload(f,p,current,W7_TOPICS.find(t=>t.id!==assigned.topic).id),/已分配/);
 const first=await upload(f,p,current),gallery=await f.s.gallery({topic:assigned.topic});assert.equal(gallery.items.length,1);assert.equal(gallery.items[0].topic,assigned.topic);assert.equal((await f.s.galleryItem({publicationId:gallery.items[0].id})).topic,assigned.topic);
 assert.ok(!JSON.stringify(gallery).includes(p.studentId));assert.equal((await f.s.gallery({topic:'A02'})).items.length,0);
 assert.equal((await f.s.classWall(q,{activityId:'news'})).items[0].versions[0].metadata.topic,assigned.topic);assert.equal((await f.s.classWall(q,{activityId:'news'})).items[0].versions[0].metadata.text,交流決定);assert.equal((await f.s.media(q,{versionId:first.versionId})).metadata.text,交流決定);assert.equal((await f.s.board(q,{activityId:'news'})).works[0].versions[0].metadata.text,交流決定);
 const next=await f.s.work(q,w.id),second=await upload(f,q,next);assert.equal((await f.s.media(q,{versionId:second.versionId})).contextImages.length,1);
 await f.s.paperKeep(q,{workId:w.id,versionId:second.versionId});await f.s.consent(q,{workId:w.id,consent:false});assert.equal((await f.s.gallery({topic:assigned.topic})).items.length,0);assert.equal((await f.s.classWall(q,{activityId:'news'})).items.length,1);
});
test('setup is dry-run by default, preserves old works and creates one closed group activity',async t=>{
 const f=await fixture();t.after(f.close);const s=new Workspace(f.db,f.store);await f.db.query("insert into rib.activities(id,term,week,title,kind,phase,accepting) values('old','11501',7,'old W7','w7','exhibit',true)");
 const w=await s.ensureWork(f.people[0],{activityId:'old'}),members=await f.db.query('select * from rib.members');
 assert.equal((await setupW7News(f.db)).activities,1);assert.equal((await f.db.query("select * from rib.activities where kind='w7-news'")).length,0);
 const report=await setupW7News(f.db,{apply:true}),[a]=await f.db.query('select * from rib.activities where id=$1',[report.created[0]]);assert.equal(a.accepting,false);assert.equal(a.kind,'w7-news');assert.deepEqual(await f.db.query('select * from rib.members'),members);assert.equal((await f.db.query('select * from rib.works where id=$1',[w.id])).length,1);assert.equal((await setupW7News(f.db,{apply:true})).activities,0);
});
test('student flow is group draw, one diagram, then compare same-topic work',()=>{const b={activity:{kind:'w7-news',accepting:true},works:[],invitations:[],reviews:[]};assert.match(activityFlow(b),/抽題/);assert.match(studentNext(b)[0],/本組/);b.works=[{topic:'N01',versions:[]}];assert.match(studentNext(b)[0],/一張/);b.works[0].versions=[{}];assert.match(studentNext(b)[0],/同題/);assert.equal(W7_TOPICS.length,4);});

test('W7 news requires one nonblank exchange decision; legacy W7 remains unchanged', async()=>{const {submissionMetadata}=await import('../weekly.mjs');for(const text of [undefined,'   ','字'.repeat(1201)])assert.throws(()=>submissionMetadata('w7-news',{topic:'N01',text,files:[{}]}),/完整內容/);assert.equal(submissionMetadata('w7-news',{topic:'N01',text:交流決定,files:[{}]}).text,交流決定);assert.equal(submissionMetadata('w7',{topic:'M',files:[{}]}).text,undefined);});
