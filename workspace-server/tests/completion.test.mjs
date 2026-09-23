import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {fixture} from './support.mjs';
import {Workspace} from '../service.mjs';
import {sha,authenticate} from '../security.mjs';
import {dailySnapshot,maintenanceStatus} from '../maintenance.mjs';
import {portfolioHtml} from '../../workspace/portfolio-export.js';
import {parseRoster} from '../roster.mjs';
test('roster previews additive changes, rejects collisions/stale drafts, preserves credentials and enforces scopes',async t=>{
 const f=await fixture(2);t.after(f.close);const s=new Workspace(f.db,f.store),before=await f.db.query('select * from rib.credentials');
 const args={term:'11501',text:'學號\t姓名\t班級\t座號\n11500001\t示範同學1\t101\t1\n11500003\t新同學\t101\t3'};
 const plan=await s.rosterPreview(f.teacher,args);assert.equal(plan.added.length,1);assert.equal(plan.skipped.length,1);
 await assert.rejects(s.rosterPreview(f.people[0],args),/教師/);await assert.rejects(s.rosterPreview({...f.teacher,role:'teacher',teacher:{scopes:[{term:'11501',className:'102'}]}},args),/權限/);
 await assert.rejects(s.rosterPreview(f.teacher,{...args,text:'11500003\t新同學\t101\t1'}),/已有/);
 await assert.rejects(s.rosterImport(f.teacher,{...args,confirmed:true,fingerprint:'stale'}),/已變更/);
 const result=await s.rosterImport(f.teacher,{...args,confirmed:true,fingerprint:plan.fingerprint});assert.match(result.codes[0].code,/^\d{6}$/);await s.login({term:'11501',studentId:'11500003',code:result.codes[0].code},'test');
 assert.deepEqual((await f.db.query('select * from rib.credentials order by student_id')).slice(0,2),before);
 await assert.rejects(s.rosterImport(f.teacher,{...args,confirmed:true,fingerprint:plan.fingerprint}),/已變更/);
 assert.equal((await s.rosterPreview(f.teacher,args)).added.length,0);assert.ok(!JSON.stringify(await f.db.query('select detail from rib.events')).includes(result.codes[0].code));
 assert.throws(()=>parseRoster('11500009\t甲\t101\t9\n11500010\t乙\t101\t9'),/重複/);
});
test('profile corrections preserve student and work identities, revoke stale sessions and reject taken seats',async t=>{
 const f=await fixture(2);t.after(f.close);const s=new Workspace(f.db,f.store),p=f.people[0],work=await s.ensureWork(p,{activityId:'w4-demo'}),session=await s.login({term:p.term,studentId:p.studentId,code:'012345'},'test');
 const input={term:p.term,studentId:p.studentId,name:'修正姓名',seat:7,expectedRevision:1};
 await assert.rejects(s.studentProfile(f.teacher,{...input,seat:2}),/已有人/);await s.studentProfile(f.teacher,input);
 assert.equal((await s.board(p,{activityId:'w4-demo'})).works[0].id,work.id);await assert.rejects(authenticate(f.db,session.token),/到期|失效/);await s.login({term:p.term,studentId:p.studentId,code:'012345'},'test');
 await assert.rejects(s.studentProfile(f.teacher,input),/已更新/);
});
test('journeys include own confirmed works across weeks, allow own archived media, reject cross-student access and sanitize fields',async t=>{
 const f=await fixture(2);t.after(f.close);const s=new Workspace(f.db,f.store),p=f.people[0],work=await s.ensureWork(p,{activityId:'w4-demo'}),bytes=await sharp({create:{width:60,height:60,channels:3,background:'#fff'}}).png().toBuffer();
 const u=await s.prepare(p,{workId:work.id,requestId:'journey-upload',expectedRevision:0,files:[{bytes:bytes.length,mime:'image/png',sha256:sha(bytes)}]});const [ticket]=await f.db.query('select files from rib.uploads where id=$1',[u.ticketId]);f.store.objects.set(ticket.files[0].key,bytes);const {versionId}=await s.finalize(p,{ticketId:u.ticketId});
 await f.db.query("update rib.activities set archived=true where id='w4-demo'");
 const j=await s.journey(p,{});assert.equal(j.works.length,1);assert.equal(j.works[0].versions[0].image_count,1);assert.ok(!JSON.stringify(j).includes('originalKey'));
 const media=await s.journeyMedia(p,{versionId,index:'0',export:'true'});assert.match(media.dataUrl,/^data:image\/jpeg;base64,/);
 await assert.rejects(s.journey(p,{studentId:f.people[1].studentId}),/自己/);await assert.rejects(s.journeyMedia(f.people[1],{versionId}),/自己/);
 const teacher={...f.teacher,role:'teacher',teacher:{scopes:[{term:p.term,className:'102'}]}};await assert.rejects(s.journey(teacher,{term:p.term,studentId:p.studentId}),/權限/);
 assert.equal((await s.journey(f.teacher,{term:p.term,studentId:p.studentId})).works.length,1);
 await f.db.query('update rib.works set hidden=true where id=$1',[work.id]);assert.equal((await s.journey(p,{})).works.length,0);await assert.rejects(s.journeyMedia(p,{versionId}),/自己/);
});
test('offline portfolio escapes authored content and excludes feedback by default, embeds images without remote dependencies',()=>{
 const items=[{work:{title:'<script>bad</script>',kind:'w4',decisions:[],reviews:[{version_id:'v1',situation:'PRIVATE',meaning:'read'}]},version:{id:'v1',ordinal:1,created_at:'today',metadata:{text:'<img src=x onerror=bad>'}},images:['data:image/jpeg;base64,AAAA','https://bad.invalid/image']}];
 const html=portfolioHtml({title:'Sample',term:'11501',items});assert.ok(!html.includes('PRIVATE'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('data:image/jpeg;base64,AAAA'));assert.ok(!html.includes('https://bad.invalid'));
 assert.ok(portfolioHtml({title:'Sample',term:'11501',items,includeFeedback:true}).includes('PRIVATE'));
});
test('daily snapshots verify stored bytes, are idempotent, keep failure status and restrict maintenance to teachers',async t=>{
 const f=await fixture(1);t.after(f.close);await dailySnapshot(f.db,f.store);assert.equal((await dailySnapshot(f.db,f.store)).alreadySaved,true);const m=await maintenanceStatus(f.db,f.teacher);assert.ok(m.last);assert.equal(m.mediaIncluded,false);assert.equal(m.stale,false);
 await assert.rejects(maintenanceStatus(f.db,f.people[0]),/教師/);
 await assert.rejects(dailySnapshot(f.db,{...f.store,get:async()=>Buffer.from('bad')},{force:true}),/不一致/);assert.equal((await maintenanceStatus(f.db,f.teacher)).failedAfterSuccess,true);
});

test('new HTTP routes deny anonymous requests, student administration, cross-origin writes and GET mutations',async t=>{
 const {handler}=await import('../http.mjs'),{createSession}=await import('../security.mjs');
 const f=await fixture(1);t.after(f.close);const run=handler({db:f.db,store:f.store,origin:'https://class.invalid',rateSecret:'test'}),session=await createSession(f.db,f.people[0]);
 async function call(action,{method='GET',origin='https://class.invalid',token=session.token,body={}}={}){const result={};const res={setHeader(){},end(raw){result.status=this.statusCode;result.body=JSON.parse(raw);}};await run({url:'/api/workspace?action='+action,method,body,headers:{cookie:'rib_session='+token,origin,'content-type':'application/json'}},res);return result;}
 assert.equal((await call('journey',{token:''})).status,401);assert.equal((await call('journey')).status,200);
 for(const action of ['rosterPreview','rosterImport','studentProfile','backupRun']){assert.equal((await call(action)).status,405);assert.equal((await call(action,{method:'POST'})).status,403);assert.equal((await call(action,{method:'POST',origin:'https://other.invalid'})).status,403);}
});
