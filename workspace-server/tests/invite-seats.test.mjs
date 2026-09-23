import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './support.mjs';
import {Workspace} from '../service.mjs';
import {handler} from '../http.mjs';
import {createSession} from '../security.mjs';

test('seat preview is read-only, bounded to own class and invite requires matching preview for direct membership',async t=>{
 const f=await fixture(6);t.after(f.close);const s=new Workspace(f.db,f.store),[a,b,c]=f.people,w=await s.ensureWork(a,{activityId:'w5-demo'});
 await f.db.query("update rib.students set class_name='102',seat=2 where student_id=$1",[f.people[5].studentId]);
 const preview=await s.invitePreview(a,{workId:w.id,seats:[2,3],className:'102'});
 assert.deepEqual(preview,{className:'101',students:[{studentId:b.studentId,name:b.student.name,seat:2},{studentId:c.studentId,name:c.student.name,seat:3}]});
 assert.equal((await f.db.query('select * from rib.members where work_id=$1',[w.id])).length,1);
 await assert.rejects(s.invite(a,{workId:w.id,seats:[2,3]}),/重新核對/);
 await assert.rejects(s.invitePreview(b,{workId:w.id,seats:[3]}),/不能保存/);
 await assert.rejects(s.invitePreview(f.teacher,{workId:w.id,seats:[2]}),/自己的同班/);
 await s.invite(a,{workId:w.id,seats:[2,3],expectedStudentIds:preview.students.map(s=>s.studentId)});
 assert.equal((await f.db.query("select * from rib.members where work_id=$1 and status='confirmed'",[w.id])).length,3);
 assert.equal((await s.work(b,w.id,{write:true})).own,true);
});
test('seat invitations reject self, duplicates, inactive/test peers, missing or ambiguous seats, occupied group, changed roster and capacity',async t=>{
 const f=await fixture(6);t.after(f.close);const s=new Workspace(f.db,f.store),[a,b,c,d,e,g]=f.people,w=await s.ensureWork(a,{activityId:'w5-demo'});
 for(const seats of [[1],[2,2],[],[2,3,4,5],[0],['2'],[1000]])await assert.rejects(s.invitePreview(a,{workId:w.id,seats}));
 await f.db.query('update rib.students set active=false where student_id=$1',[d.studentId]);await assert.rejects(s.invitePreview(a,{workId:w.id,seats:[4]}),/無法唯一/);
 await f.db.query('update rib.students set is_test=true where student_id=$1',[e.studentId]);await assert.rejects(s.invitePreview(a,{workId:w.id,seats:[5]}),/無法唯一/);
 await f.db.query('update rib.students set seat=2 where student_id=$1',[g.studentId]);await assert.rejects(s.invitePreview(a,{workId:w.id,seats:[2]}),/無法唯一/);
 await f.db.query('update rib.students set seat=6 where student_id=$1',[g.studentId]);
 const preview=await s.invitePreview(a,{workId:w.id,seats:[2]});await f.db.query('update rib.students set seat=case when student_id=$1 then 3 else 2 end where student_id=any($2::text[])',[b.studentId,[b.studentId,c.studentId]]);
 await assert.rejects(s.invite(a,{workId:w.id,seats:[2],expectedStudentIds:preview.students.map(s=>s.studentId)}),/名單已變更/);
 assert.equal((await f.db.query('select * from rib.members where work_id=$1',[w.id])).length,1);
 await s.ensureWork(c,{activityId:'w5-demo'});await assert.rejects(s.invitePreview(a,{workId:w.id,seats:[2]}),/已在其他小組/);
 await s.invite(a,{workId:w.id,studentIds:[b.studentId,g.studentId]});
 await f.db.query('update rib.students set active=true,is_test=false where student_id=any($1::text[])',[[d.studentId,e.studentId]]);
 await assert.rejects(s.invitePreview(a,{workId:w.id,seats:[4,5]}),/最多四人/);
 await f.db.query("update rib.activities set accepting=false where id='w5-demo'");await assert.rejects(s.invitePreview(a,{workId:w.id,seats:[4]}),/不能保存/);
});
test('seat preview endpoint requires session, same-origin POST, agreement and work membership',async t=>{
 const f=await fixture();t.after(f.close);const s=new Workspace(f.db,f.store),p=f.people[0],w=await s.ensureWork(p,{activityId:'w5-demo'}),session=await createSession(f.db,{role:'student',term:p.term,studentId:p.studentId,revision:1});
 const run=handler({db:f.db,store:f.store,origin:'https://class.invalid',rateSecret:'test'});
 const request=async(method='POST',origin='https://class.invalid',token=session.token)=>{const result={};await run({url:'/api/workspace?action=invitePreview',method,body:{workId:w.id,seats:[2]},headers:{origin,'content-type':'application/json',cookie:'rib_session='+token}}, {setHeader:()=>{},set statusCode(v){result.status=v},end:b=>result.body=JSON.parse(b)});return result;};
 assert.equal((await request()).status,200);assert.equal((await request('GET')).status,405);assert.equal((await request('POST','https://attacker.invalid')).status,403);assert.equal((await request('POST','https://class.invalid','')).status,401);
 await f.db.query('update rib.students set sharing_agreement=null where student_id=$1',[p.studentId]);assert.equal((await request()).status,403);
});
