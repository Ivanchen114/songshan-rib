import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './support.mjs';import {Workspace} from '../service.mjs';import {W8_TOPICS} from '../../workspace/w8-topics.js';import {setupW8Materials} from '../w8-materials-setup.mjs';
import {studentNext} from '../../workspace/ui-model.js';import {canUpload} from '../../workspace/activities.js';
async function setup(t,n=4){const f=await fixture(n);t.after(f.close);await f.db.query("insert into rib.activities(id,term,week,title,kind,phase,accepting) values('w8','11501',8,'W8','w8-materials','production',true)");return {...f,s:new Workspace(f.db,f.store)};}
const draw=(f,p,w)=>f.s.drawTopic(p,{workId:w.id,expectedRevision:w.revision});
test('18 concurrent groups across two classes receive exactly three each; peers and reloads keep assignment',async t=>{
 const f=await setup(t,36),groups=[];
 for(let i=0;i<18;i++){const p=f.people[2*i],q=f.people[2*i+1];if(i>=9)for(const x of [p,q]){x.student.class_name='102';await f.db.query("update rib.students set class_name='102',seat=$2 where student_id=$1",[x.studentId,i*2+(x===q?2:1)-18]);}const w=await f.s.ensureWork(p,{activityId:'w8'});await f.s.invite(p,{workId:w.id,studentIds:[q.studentId]});groups.push({p,q,w});}
 const assigned=await Promise.all(groups.map(({p,w})=>draw(f,p,w)));for(const topic of W8_TOPICS)assert.equal(assigned.filter(x=>x.topic===topic.id).length,3);
 for(const cls of ['101','102']){const counts=await f.db.query('select topic,count(*)::int as n from rib.works where class_name=$1 group by topic',[cls]);assert.ok(counts.every(x=>[1,2].includes(x.n)));}
 const {p,q,w}=groups[0];assert.equal((await draw(f,q,w)).topic,assigned[0].topic);assert.equal((await draw(f,p,w)).topic,assigned[0].topic);assert.equal((await new Workspace(f.db,f.store).board(q,{activityId:'w8'})).works[0].topic,assigned[0].topic);assert.equal((await f.db.query("select * from rib.events where kind='draw-topic'")).length,18);
});
test('permissions, stale requests, closed activity and recreation cannot draw; no upload accepted',async t=>{
 const f=await setup(t),[p,q]=f.people,w=await f.s.ensureWork(p,{activityId:'w8'});
 await assert.rejects(draw(f,q,w),/不能保存/);await assert.rejects(draw(f,f.teacher,w),/學生/);await assert.rejects(draw(f,p,{...w,revision:9}),/更新/);await assert.rejects(draw(f,{...p,student:{...p.student,is_test:true}},w),/自己/);
 await f.db.query("update rib.activities set accepting=false where id='w8'");await assert.rejects(draw(f,p,w),/不能保存/);await f.db.query("update rib.activities set accepting=true where id='w8'");await draw(f,p,w);
 await assert.rejects(f.s.prepare(p,{workId:w.id,files:[]}),/只分配材料/);
 await f.s.leaveGroup(p,{workId:w.id,expectedRevision:1,confirmed:true});const next=await f.s.ensureWork(p,{activityId:'w8'});await assert.rejects(draw(f,p,next),/已在另一組抽過/);
 const other=await f.s.ensureWork(q,{activityId:'w8'});await draw(f,q,other);await f.s.leaveGroup(p,{workId:next.id,expectedRevision:0,confirmed:true});await assert.rejects(f.s.invite(q,{workId:other.id,studentIds:[p.studentId]}),/已在另一組抽過/);
});
test('setup defaults to dry-run, makes closed formal and test activities without changing other weeks, and is idempotent',async t=>{
 const f=await fixture();t.after(f.close);const original=await f.db.query('select * from rib.activities order by id');assert.equal((await setupW8Materials(f.db)).needed.length,4);assert.deepEqual(await f.db.query('select * from rib.activities order by id'),original);
 const r=await setupW8Materials(f.db,{apply:true});assert.equal(r.created.length,4);const rows=await f.db.query("select * from rib.activities where kind='w8-materials'");assert.ok(rows.every(x=>x.accepting===false));assert.deepEqual(rows.map(x=>x.legacy.testOnly).sort(),[false,true]);assert.deepEqual(await f.db.query("select * from rib.activities where kind not in ('w8-materials','w8-proposal') order by id"),original);assert.equal((await setupW8Materials(f.db,{apply:true})).created.length,0);
});
test('student source contract contains only reading links, not teacher interpretation or a group submission',()=>{
 assert.equal(W8_TOPICS.length,6);for(const t of W8_TOPICS){assert.equal(t.paras,undefined);assert.equal(t.limit,undefined);for(const s of t.sources){assert.equal(s.paras,undefined);assert.ok(s.reading&&s.url.startsWith('https://'));}}
 const b={activity:{kind:'w8-materials',accepting:true},works:[{topic:'T4',versions:[]}],reviews:[],invitations:[]};assert.match(studentNext(b).join(''),/每人/);assert.equal(canUpload(b.activity,b.works[0]),false);
});
