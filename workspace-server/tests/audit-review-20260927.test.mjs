import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './support.mjs';
import {Workspace} from '../service.mjs';
import {rate,refund} from '../security.mjs';
import {timedFetch} from '../../workspace/api-fetch.js';

test('70 simultaneous valid classmates succeed; parallel guessing remains capped and teacher reset unlocks',async t=>{
 const f=await fixture(70);t.after(f.close);const s=new Workspace(f.db,f.store);
 const results=await Promise.allSettled(f.people.map(p=>s.login({term:p.term,studentId:p.studentId,code:'012345'},'shared-school')));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,70);
 assert.equal((await f.db.query("select count from rib.rate_limits where id='ip:shared-school'"))[0].count,0);
 const p=f.people[0],input={term:p.term,studentId:p.studentId,code:'999999'};
 const wrong=await Promise.allSettled(Array.from({length:20},()=>s.login(input,'attack')));
 assert.equal(wrong.filter(r=>r.reason?.status===401).length,8);
 assert.equal(wrong.filter(r=>r.reason?.status===429).length,12);
 await assert.rejects(s.login({...input,code:'012345'},'reset-check'),e=>e.status===429);
 await s.studentAccountUpdate(f.teacher,{term:p.term,studentId:p.studentId,operation:'resetCode',mode:'manual',code:'000007',expectedRevision:1});
 await s.login({...input,code:'000007'},'reset-check');
});

test('a delayed successful login cannot refund a newer rate-limit window',async t=>{
 const f=await fixture(0);t.after(f.close);
 const old=await rate(f.db,'window',2,900);
 await f.db.query("update rib.rate_limits set reset_at=now()-interval '1 second' where id='window'");
 await rate(f.db,'window',2,1800);await refund(f.db,'window',old);
 assert.equal((await f.db.query("select count from rib.rate_limits where id='window'"))[0].count,1);
});

test('semester draft refuses an archived W8 dependency before changing terms',async t=>{
 const f=await fixture(1);t.after(f.close);const s=new Workspace(f.db,f.store);
 await f.db.query("insert into rib.activities(id,term,week,title,kind,archived,legacy) values('m','11501',8,'材料','w8-materials',true,'{}'),('p','11501',8,'提案','w8-proposal',false,'{\"materialsActivityId\":\"m\"}')");
 await assert.rejects(s.termSave(f.teacher,{term:'11502',sourceTerm:'11501',expectedRevision:0,teachers:[f.teacher.email],rosterText:'11500001\t示範同學1\t101\t1'}),/共讀材料/);
 assert.equal((await f.db.query("select * from rib.activities where term='11502'")).length,0);
});

test('API deadline includes response body, releases pending fetch and explains uncertain writes',async t=>{
 let signal;
 t.mock.method(globalThis,'fetch',async(_,options)=>{signal=options.signal;return {arrayBuffer:()=>new Promise(()=>{})};});
 await assert.rejects(timedFetch('/api/workspace',{},20),/確認連線/);assert.equal(signal.aborted,true);
 await assert.rejects(timedFetch('/api/workspace',{method:'POST'},20),/確認是否已保存/);
});

test('API wrapper preserves JSON/errors and honors caller cancellation',async t=>{
 t.mock.method(globalThis,'fetch',async()=>new Response('{"ok":false,"error":"test"}',{status:409,headers:{'Content-Type':'application/json'}}));
 const r=await timedFetch('/api/workspace',{},100);assert.equal(r.status,409);assert.equal(r.ok,false);assert.equal((await r.json()).error,'test');
 globalThis.fetch=async(_,options)=>new Promise((_,reject)=>{options.signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true});});
 const controller=new AbortController(),pending=timedFetch('/api/workspace',{signal:controller.signal},100);controller.abort();await assert.rejects(pending,e=>e.name==='AbortError');
});

test('hidden or abandoned groups do not bias new draws, existing draws remain immutable',async t=>{
 const f=await fixture(3);t.after(f.close);const s=new Workspace(f.db,f.store);
 await f.db.query("insert into rib.activities(id,term,week,title,kind,phase,accepting) values('news','11501',7,'新聞','w7-news','production',true)");
 const works=[];for(const p of f.people)works.push(await s.ensureWork(p,{activityId:'news'}));
 const {W7_TOPICS}=await import('../../workspace/w7-topics.js');const first=W7_TOPICS[0].id;
 // Only the active group's topic counts; all alternatives contain abandoned historical groups.
 await f.db.query('update rib.works set topic=$1 where id=$2',[first,works[0].id]);
 for(const [i,topic] of W7_TOPICS.slice(1).entries()){
  await f.db.query("insert into rib.works(id,activity_id,class_name,topic,hidden) values($1,'news','101',$2,false)",['abandoned-'+i,topic.id]);
  await f.db.query("insert into rib.works(id,activity_id,class_name,topic,hidden) values($1,'news','101',$2,true)",['hidden-'+i,topic.id]);
  await f.db.query("insert into rib.members(work_id,term,student_id,status) values($1,'11501',$2,'confirmed')",['hidden-'+i,f.people[2].studentId]);
 }
 const draw=await s.drawTopic(f.people[1],{workId:works[1].id,expectedRevision:0});assert.notEqual(draw.topic,first);
 assert.equal((await s.drawTopic(f.people[0],{workId:works[0].id,expectedRevision:0})).topic,first);
 await s.leaveGroup(f.people[0],{workId:works[0].id,confirmed:true,expectedRevision:0});
 await assert.rejects(s.invite(f.people[1],{workId:works[1].id,studentIds:[f.people[0].studentId]}),/抽過題/);
});
