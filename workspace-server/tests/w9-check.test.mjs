import test from 'node:test';import assert from 'node:assert/strict';import sharp from 'sharp';
import {fixture} from './support.mjs';import {Workspace} from '../service.mjs';import {sha} from '../security.mjs';import {setupW9Check} from '../w9-check.mjs';import {setupW8Materials} from '../w8-materials-setup.mjs';
async function setup(t){const f=await fixture(5);t.after(f.close);assert.equal((await setupW9Check(f.db)).created.length,0);await setupW9Check(f.db,{apply:true});assert.equal((await setupW9Check(f.db,{apply:true})).created.length,0);const [a]=await f.db.query("select * from rib.activities where kind='w9-check' and not (legacy->>'testOnly')::boolean");assert.equal(a.accepting,false);await f.db.query('update rib.activities set accepting=true where id=$1',[a.id]);return {...f,a,s:new Workspace(f.db,f.store)};}
async function upload(f,p,w,n=1,requestId='first'){
 const bytes=await sharp({create:{width:400,height:600,channels:3,background:'#eee'}}).png().toBuffer();const input={workId:w.id,expectedRevision:w.revision,requestId,title:'【測試】查核後提案',evidenceFormat:'digital-v1',candidates:'候選1 https://example.org/a\n候選2 https://example.org/b',references:'機構。（2025）。報告。https://example.org/a',passage:'正文 p.3：提出訓練。',verification:'原文只有做法，沒有成效比較。',proposal:'保留先確認需求，但成效待驗證。',aiUse:'NotebookLM 整理來源與引用。',sourceWorkId:'forged',sourceVersionId:'forged',files:Array.from({length:n},()=>({bytes:bytes.length,mime:'image/png',sha256:sha(bytes)}))};const u=await f.s.prepare(p,input);if(u.versionId)return u;const [ticket]=await f.db.query('select files from rib.uploads where id=$1',[u.ticketId]);for(const file of ticket.files)f.store.objects.set(file.key,bytes);return f.s.finalize(p,{ticketId:u.ticketId});}
const answer={o:'我請工具指出支持語句，回原文發現只有做法。',r:'我懷疑它把建議當成成效。',id:'下次讀歷史資料，先自己看，再請工具比較，最後核對引用。'};
test('W9 one thinking photo with verified digital evidence; own ORID works during production, drafts/private and version binding survive resubmission',async t=>{
 const f=await setup(t),[p,q]=f.people,w=await f.s.ensureWork(p,{activityId:f.a.id});
 await assert.rejects(upload(f,p,w,2),/1 張/);const u=await upload(f,p,w);const media=await f.s.media(p,{versionId:u.versionId});assert.equal(media.images.length,1);assert.equal(media.metadata.sourceWorkId,null);assert.equal(media.metadata.publicDisplay,false);assert.match(media.metadata.references,/example.org/);assert.match(media.metadata.verification,/沒有成效/);assert.equal(media.metadata.evidenceFormat,'digital-v1');assert.deepEqual(media.metadata.pageOrder,['p1-thinking']);
 const model=await f.s.reflection(p,{workId:w.id});assert.equal(model.editable,true);assert.equal(model.reference,null);
 const args={workId:w.id,versionId:u.versionId,status:'draft',answers:{o:answer.o,r:'',id:''},allowPublic:false,expectedRevision:0,requestId:'draft'};
 await f.s.saveReflection(p,args);assert.equal((await f.s.saveReflection(p,args)).revision,1);await assert.rejects(f.s.saveReflection(q,args),/不能保存/);
 await f.db.query("update rib.activities set phase='exhibit' where id=$1",[f.a.id]);assert.equal((await f.s.classWall(q,{activityId:f.a.id})).items[0].reflection,null);await assert.rejects(f.s.reflection(q,{workId:w.id}),/自己的/);
 await f.s.saveReflection(p,{...args,answers:answer,status:'submitted',allowPublic:true,expectedRevision:1,requestId:'submit'});const wall=await f.s.classWall(q,{activityId:f.a.id});assert.equal(wall.items[0].reflection.answers.id,answer.id);assert.equal(wall.items[0].reflection.referenceLabel,null);assert.equal(wall.interactive,false);
 const teacher=await f.s.reflection(f.teacher,{workId:w.id});assert.equal(teacher.reflection.allowPublic,false);assert.equal(teacher.editable,false);assert.equal((await f.s.gallery()).items.length,0);
 await assert.rejects(f.s.reviewReflection(f.teacher,{workId:w.id}),/不產生公開/);
 const u2=await upload(f,p,{...w,revision:1},1,'second');assert.notEqual(u.versionId,u2.versionId);const newer=await f.s.reflection(p,{workId:w.id});assert.equal(newer.reflection.versionId,u.versionId);assert.equal(newer.versionId,u2.versionId);
 await assert.rejects(f.s.saveReflection(p,{...args,answers:answer,status:'submitted',expectedRevision:2,requestId:'stale'}),/版本已更新/);
 await f.s.saveReflection(p,{...args,versionId:u2.versionId,answers:answer,status:'submitted',expectedRevision:2,requestId:'new'});
 await f.db.query('update rib.activities set accepting=false where id=$1',[f.a.id]);assert.equal((await f.s.reflection(p,{workId:w.id})).editable,false);await assert.rejects(f.s.saveReflection(p,{...args,versionId:u2.versionId,expectedRevision:3,requestId:'closed'}),/不能保存/);
});
test('W9 server links only own same-term W8 snapshot; no dependency on retired activity IDs',async t=>{
 const f=await setup(t),[p,q]=f.people;await setupW8Materials(f.db,{apply:true});const [a8]=await f.db.query("select * from rib.activities where kind='w8-proposal' and not (legacy->>'testOnly')::boolean");await f.db.query('update rib.activities set accepting=true where id=any($1::text[])',[[a8.id,a8.legacy.materialsActivityId]]);
 const g=await f.s.ensureWork(p,{activityId:a8.legacy.materialsActivityId});await f.s.drawTopic(p,{workId:g.id,expectedRevision:0});const w8=await f.s.ensureWork(p,{activityId:a8.id}),v8=await upload(f,p,w8,1);const w9=await f.s.ensureWork(p,{activityId:f.a.id}),v9=await upload(f,p,w9),m=(await f.s.media(p,{versionId:v9.versionId})).metadata;assert.equal(m.sourceWorkId,w8.id);assert.equal(m.sourceVersionId,v8.versionId);assert.equal(m.sourceActivityId,a8.id);
 const q9=await f.s.ensureWork(q,{activityId:f.a.id}),qv=await upload(f,q,q9);assert.equal((await f.s.media(q,{versionId:qv.versionId})).metadata.sourceWorkId,null);
 const tester={...q,student:{...q.student,is_test:true}};await assert.rejects(f.s.ensureWork(tester,{activityId:f.a.id}),/測試帳號/);
 q.student.class_name='103';await f.db.query("update rib.students set class_name='103' where student_id=$1",[q.studentId]);await f.db.query("update rib.activities set phase='exhibit' where id=$1",[f.a.id]);await assert.rejects(f.s.media(q,{versionId:v9.versionId}),/共同上課/);
});

test('W9 requires evidence or honest search gap',async()=>{const {submissionMetadata}=await import('../weekly.mjs');const base={title:'提案',evidenceFormat:'digital-v1',candidates:'候選',verification:'尚無成效',proposal:'待驗證',aiUse:'搜尋',files:[{}]};assert.throws(()=>submissionMetadata('w9-check',base),/APA/);assert.throws(()=>submissionMetadata('w9-check',{...base,noSource:true}),/搜尋詞/);const m=submissionMetadata('w9-check',{...base,noSource:true,searchGap:'用先詢問誤判搜尋，只找到措施，缺成效比較。'});assert.equal(m.noSource,true);assert.equal(m.references,'');assert.equal(m.pageOrder.length,1);assert.throws(()=>submissionMetadata('w9-check',{...base,noSource:true,searchGap:'缺口',verification:''}),/核對/);});
test('W9 evidence rejects malformed values and escapes pasted text while linking sources',async()=>{
 const {submissionMetadata}=await import('../weekly.mjs');const {w9Evidence}=await import('../../workspace/w9-evidence.js');
 const base={title:'提案',evidenceFormat:'digital-v1',candidates:'候選',verification:'核對',proposal:'保留',aiUse:'找段落',references:'出處',passage:'原文',files:[{}]};
 for(const field of ['candidates','references','searchGap'])assert.throws(()=>submissionMetadata('w9-check',{...base,[field]:{invalid:true}}),e=>e.status===400);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 assert.equal(w9Evidence({title:'legacy',pageOrder:['p2-proposal','p1-check']},esc),'');
 const html=w9Evidence({...base,proposal:'<img src=x onerror=alert(1)>',references:'https://example.org/report.pdf'},esc);
 assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));assert.ok(html.includes('href="https://example.org/report.pdf"'));
});
