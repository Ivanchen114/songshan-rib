import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './support.mjs';
import {Workspace} from '../service.mjs';
import {authenticate,createSession} from '../security.mjs';
import {handler} from '../http.mjs';

test('reset preserves leading zeroes and work records, revokes old sessions, clears student lockout, never lists or audits codes',async t=>{
 const f=await fixture(2);t.after(f.close);const s=new Workspace(f.db,f.store),p=f.people[0];
 const work=await s.ensureWork(p,{activityId:'w4-demo'}),before=await f.db.query('select * from rib.works');
 const session=await s.login({term:p.term,studentId:p.studentId,code:'012345'},'fixture');
 const list=await s.studentAccounts(f.teacher,{term:p.term});assert.equal(list.students.length,2);assert.equal(list.students[0].canManage,true);
 assert.ok(!/digest|salt|algorithm|012345/.test(JSON.stringify(list)));
 await f.db.query("update rib.rate_limits set count=99,reset_at=now()+interval '1 hour' where id=$1",['login:'+p.term+':'+p.studentId]);
 const r=await s.studentAccountUpdate(f.teacher,{term:p.term,studentId:p.studentId,operation:'resetCode',mode:'manual',code:'000007',expectedRevision:1});
 assert.equal(r.code,'000007');assert.equal(r.revision,2);await assert.rejects(authenticate(f.db,session.token),/到期|失效/);
 await assert.rejects(s.login({term:p.term,studentId:p.studentId,code:'012345'},'fixture'),/不正確/);
 const fresh=await s.login({term:p.term,studentId:p.studentId,code:r.code},'fixture');assert.equal((await authenticate(f.db,fresh.token)).studentId,p.studentId);
 assert.deepEqual(await f.db.query('select * from rib.works'),before);assert.equal((await s.board(p,{activityId:'w4-demo'})).works[0].id,work.id);
 const audit=await f.db.query("select detail from rib.events where kind='student-account'");assert.equal(audit.length,1);assert.ok(!JSON.stringify(audit).includes(r.code));
 await assert.rejects(s.studentAccountUpdate(f.teacher,{term:p.term,studentId:p.studentId,operation:'resetCode',mode:'random',expectedRevision:1}),/已被更新/);
 const random=await s.studentAccountUpdate(f.teacher,{term:p.term,studentId:p.studentId,operation:'resetCode',mode:'random',expectedRevision:2});assert.match(random.code,/^\d{6}$/);
 await s.login({term:p.term,studentId:p.studentId,code:random.code},'fixture');
});

test('disable and restore preserve code but never revive a revoked session',async t=>{
 const f=await fixture(1);t.after(f.close);const s=new Workspace(f.db,f.store),p=f.people[0],session=await s.login({term:p.term,studentId:p.studentId,code:'012345'},'fixture');
 await s.studentAccountUpdate(f.teacher,{term:p.term,studentId:p.studentId,operation:'setActive',active:false,expectedRevision:1});
 await assert.rejects(authenticate(f.db,session.token),/到期|失效/);await assert.rejects(s.login({term:p.term,studentId:p.studentId,code:'012345'},'fixture'),/不正確/);
 await assert.rejects(s.studentAccountUpdate(f.teacher,{term:p.term,studentId:p.studentId,operation:'resetCode',mode:'random',expectedRevision:2}),/停用/);
 await s.studentAccountUpdate(f.teacher,{term:p.term,studentId:p.studentId,operation:'setActive',active:true,expectedRevision:2});
 await assert.rejects(authenticate(f.db,session.token),/到期|失效/);await s.login({term:p.term,studentId:p.studentId,code:'012345'},'fixture');
});

test('account management enforces teacher class scopes, current semester, input validation and test-only acceptance mode',async t=>{
 const f=await fixture(2);t.after(f.close);const s=new Workspace(f.db,f.store),p=f.people[0],q=f.people[1];
 await f.db.query("update rib.students set class_name='102' where student_id=$1",[q.studentId]);
 const teacher={role:'teacher',email:f.teacher.email,teacher:{scopes:[{term:p.term,className:'101'}]}};
 assert.equal((await s.studentAccounts(teacher)).students.length,1);
 const args={term:p.term,studentId:p.studentId,operation:'resetCode',mode:'manual',code:'001122',expectedRevision:1};
 await assert.rejects(s.studentAccounts(p),/教師/);await assert.rejects(s.studentAccountUpdate(p,args),/教師/);
 await assert.rejects(s.studentAccountUpdate(teacher,{...args,studentId:q.studentId}),/權限/);
 await assert.rejects(s.studentAccountUpdate(f.teacher,{...args,code:'12345'}),/六位/);
 await assert.rejects(s.studentAccountUpdate(f.teacher,{...args,code:123456}),/六位/);
 const previous=process.env.RIB_ACCEPTANCE_ONLY;process.env.RIB_ACCEPTANCE_ONLY='true';
 try{assert.equal((await s.studentAccounts(f.teacher)).students[0].canManage,false);await assert.rejects(s.studentAccountUpdate(f.teacher,args),/測試學生/);}finally{if(previous===undefined)delete process.env.RIB_ACCEPTANCE_ONLY;else process.env.RIB_ACCEPTANCE_ONLY=previous;}
 await f.db.query("update rib.workspace_state set current_term='11502'");assert.equal((await s.studentAccounts(f.teacher,{term:p.term})).readOnly,true);
 await assert.rejects(s.studentAccountUpdate(f.teacher,args),/目前學期/);
});

test('account HTTP routes require teacher authentication, POST and same origin, and return no-store reset receipt',async t=>{
 const f=await fixture(1);t.after(f.close);const run=handler({db:f.db,store:f.store,origin:'https://class.invalid',rateSecret:'test',secure:true});
 const teacher=await createSession(f.db,{role:'admin',email:f.teacher.email}),student=await createSession(f.db,f.people[0]);
 async function call(action,{token=teacher.token,method='GET',origin='https://class.invalid',body={}}={}){const result={headers:{}};const req={url:'/api/workspace?action='+action,method,body,headers:{cookie:'rib_session='+token,origin,'content-type':'application/json'}};const res={setHeader:(k,v)=>result.headers[k]=v,end:raw=>{result.status=res.statusCode;result.body=JSON.parse(raw);}};await run(req,res);return result;}
 assert.equal((await call('studentAccounts')).status,200);assert.equal((await call('studentAccounts',{token:student.token})).status,403);
 assert.equal((await call('studentAccountUpdate')).status,405);
 const body={term:'11501',studentId:'11500001',operation:'resetCode',mode:'random',expectedRevision:1};
 assert.equal((await call('studentAccountUpdate',{method:'POST',origin:'https://other.invalid',body})).status,403);
 const result=await call('studentAccountUpdate',{method:'POST',body});assert.equal(result.status,200);assert.match(result.body.data.code,/^\d{6}$/);assert.match(result.headers['Cache-Control'],/no-store/);
});
