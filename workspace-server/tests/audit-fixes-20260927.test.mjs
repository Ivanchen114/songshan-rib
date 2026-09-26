// Regression tests for the 2026-09-27 bug audit fixes. All data is fictional.
import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './support.mjs';import {Workspace} from '../service.mjs';
import {galleryDetail,galleryList} from '../publication.mjs';import {dailySnapshot} from '../maintenance.mjs';
function env(t,value){const old=process.env.RIB_ACCEPTANCE_ONLY;process.env.RIB_ACCEPTANCE_ONLY=value;t.after(()=>old===undefined?delete process.env.RIB_ACCEPTANCE_ONLY:process.env.RIB_ACCEPTANCE_ONLY=old);}
const count=async(db,id)=>((await db.query('select count from rib.rate_limits where id=$1',[id]))[0]?.count)??0;

test('successful logins refund the shared IP budget and clear the student failure counter',async t=>{
 env(t,'false');const f=await fixture(1);t.after(f.close);const s=new Workspace(f.db,f.store),p=f.people[0];
 // 70 classmates behind one school IP: correct logins must not exhaust the 60-per-IP window.
 for(let i=0;i<70;i++)await s.login({term:p.term,studentId:p.studentId,code:'012345'},'school-nat');
 assert.equal(await count(f.db,'ip:school-nat'),0);
 // Mistyped twice, then correct: the student's counter is cleared, failures stay counted on the IP.
 for(let i=0;i<2;i++)await assert.rejects(s.login({term:p.term,studentId:p.studentId,code:'999999'},'school-nat'),/不正確/);
 assert.equal(await count(f.db,'login:11501:'+p.studentId),2);
 await s.login({term:p.term,studentId:p.studentId,code:'012345'},'school-nat');
 assert.equal(await count(f.db,'login:11501:'+p.studentId),0);assert.equal(await count(f.db,'ip:school-nat'),2);
 // Brute force is still capped: 8 wrong codes lock this student for the window.
 for(let i=0;i<8;i++)await assert.rejects(s.login({term:p.term,studentId:p.studentId,code:'999999'},'other-'+i),/不正確/);
 await assert.rejects(s.login({term:p.term,studentId:p.studentId,code:'012345'},'other-x'),/次數/);
});

async function namedVersion(f,kind,metadata){
 await f.db.query("insert into rib.activities(id,term,week,title,kind,phase,accepting) values('named','11501',8,'W8','"+kind+"','production',true)");
 await f.db.query("insert into rib.works(id,activity_id,class_name,owner_id) values('wk','named','101','11500001')");
 await f.db.query("insert into rib.members(work_id,term,student_id,status) values('wk','11501','11500001','confirmed')");
 await f.db.query("insert into rib.versions(id,work_id,ordinal,media,metadata,request_id) values('v1','wk',1,$1,$2,'r')",[JSON.stringify([{fullKey:'f',thumbKey:'t',displayHash:'h'}]),JSON.stringify(metadata)]);
 await f.db.query("insert into rib.publications(id,version_id) values('pub1','v1')");
}
test('W8/W9 works marked publicDisplay=false cannot be published manually nor served anonymously',async t=>{
 env(t,'false');const f=await fixture(1);t.after(f.close);const s=new Workspace(f.db,f.store);
 await namedVersion(f,'w8-proposal',{publicDisplay:false,title:'含姓名的提案'});
 await assert.rejects(s.publish(f.teacher,{publicationId:'pub1',publish:true,reviewed:true,title:'x'}),/匿名展廳/);
 // Even a row already marked published (e.g. before this fix) must not reach anonymous visitors.
 await f.db.query("update rib.publications set status='published' where id='pub1'");
 await assert.rejects(galleryDetail(f.db,f.store,{publicationId:'pub1'}));
 assert.equal((await galleryList(f.db,f.store,{})).items.length,0);
});

test('a daytime manual backup does not cancel that night\'s scheduled backup; a repeated schedule still skips',async t=>{
 const f=await fixture(1);t.after(f.close);
 await dailySnapshot(f.db,f.store,{force:true,actor:'teacher@example.invalid'});
 const nightly=await dailySnapshot(f.db,f.store);assert.notEqual(nightly.alreadySaved,true);
 assert.equal((await dailySnapshot(f.db,f.store)).alreadySaved,true);
});

test('semester activation re-links W8 proposal to the new W8 materials and carries joint classes',async t=>{
 env(t,'false');const f=await fixture(2);t.after(f.close);const s=new Workspace(f.db,f.store);
 await f.db.query("insert into rib.activities(id,term,week,title,kind,phase,accepting) values('m1','11501',8,'W8 共讀材料','w8-materials','production',true)");
 await f.db.query("insert into rib.activities(id,term,week,title,kind,phase,accepting,legacy) values('p1','11501',8,'W8 我的提案','w8-proposal','production',true,$1)",[JSON.stringify({materialsActivityId:'m1'})]);
 const draft={term:'11502',sourceTerm:'11501',expectedRevision:0,teachers:['teacher@example.invalid'],rosterText:'學號\t姓名\t班級\t座號\n11500001\t示範同學1\t108\t1\n11500002\t示範同學2\t109\t2'};
 const r=await s.termSave(f.teacher,draft);await s.termActivate(f.teacher,{term:'11502',expectedRevision:r.draft.revision,confirmTerm:'11502',confirm:true});
 const rows=await f.db.query("select id,kind,legacy from rib.activities where term='11502' and kind in ('w8-materials','w8-proposal')");
 const materials=rows.find(a=>a.kind==='w8-materials'),proposal=rows.find(a=>a.kind==='w8-proposal');
 assert.ok(materials&&proposal);assert.equal(proposal.legacy.materialsActivityId,materials.id);assert.notEqual(proposal.legacy.materialsActivityId,'m1');
 // 11501 joint 108/109 course carried into the new term, limited to classes that still exist.
 assert.deepEqual(proposal.legacy.classroomGroups,[['108','109']]);
});
