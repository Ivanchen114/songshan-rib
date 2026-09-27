import test from 'node:test';import assert from 'node:assert/strict';import sharp from 'sharp';
import {fixture} from './support.mjs';import {Workspace} from '../service.mjs';import {setupReadingWeeks} from '../reading-weeks.mjs';import {submissionMetadata} from '../weekly.mjs';import {sha} from '../security.mjs';import {deckEvidence} from '../../workspace/personal-deck.js';import {portfolioHtml} from '../../workspace/portfolio-export.js';
const fields={title:'【虛構】自己的新題目',layout:'slides',purpose:'試讀版',question:'運動飲料適用哪些運動情境？',audience:'參加校內運動的同學',references:'測試資料，不是真實健康建議。https://example.invalid/source',aiUse:'AI提供排版候選；我回原文核對範圍，採用兩欄。'};
async function upload(f,p,w,id='first',extra={}){const b=await sharp({create:{width:480,height:270,channels:3,background:'#eef1ed'}}).png().toBuffer();const r=await f.s.prepare(p,{workId:w.id,requestId:id,expectedRevision:w.revision,...fields,...extra,files:Array.from({length:5},()=>({bytes:b.length,mime:'image/png',sha256:sha(b)}))});if(r.versionId)return r;const [u]=await f.db.query('select files from rib.uploads where id=$1',[r.ticketId]);for(const file of u.files)f.store.objects.set(file.key,b);return f.s.finalize(p,{ticketId:r.ticketId});}
test('individual deck is separate from legacy groups, survives versions, records own topic, and enforces ownership/phase',async t=>{
 const f=await fixture(4);t.after(f.close);f.s=new Workspace(f.db,f.store);await setupReadingWeeks(f.db,{apply:true});
 await f.db.query("insert into rib.activities(id,term,week,title,kind,phase,accepting) values('old-deck','11501',15,'舊小組','w15-deck','production',true)");
 const [p,q]=f.people;const old=await f.s.ensureWork(p,{activityId:'old-deck'});
 const [a]=await f.db.query("select * from rib.activities where kind='w15-personal-deck' and not (legacy->>'testOnly')::boolean");
 assert.equal(a.accepting,false);await assert.rejects(f.s.ensureWork(p,{activityId:a.id}),/開放|交件/);
 await f.db.query('update rib.activities set accepting=true where id=$1',[a.id]);const w=await f.s.ensureWork(p,{activityId:a.id}),other=await f.s.ensureWork(q,{activityId:a.id});assert.notEqual(w.id,other.id);assert.notEqual(w.id,old.id);
 assert.equal((await f.db.query('select * from rib.members where work_id=$1',[w.id])).length,1);
 await assert.rejects(f.s.invitePreview(p,{workId:w.id,seats:[2]}),/小組|活動|支援|不允許/);
 const v=await upload(f,p,w,'v1',{topic:'T1',sourceWorkId:old.id}),m=await f.s.media(p,{versionId:v.versionId});assert.equal(m.images.length,5);assert.equal(m.metadata.question,fields.question);assert.equal(m.metadata.topic,undefined);assert.equal(m.metadata.sourceWorkId,undefined);
 await assert.rejects(upload(f,q,{...w,revision:1},'foreign'),/權限|自己|不能/);await assert.rejects(f.s.media(q,{versionId:v.versionId}),/自己的|權限|展示/);
 const v2=await upload(f,p,{...w,revision:1},'v2',{purpose:'試讀修訂'});assert.equal((await f.s.media(p,{versionId:v.versionId})).ordinal,1);
 await f.s.markCurrent(p,{workId:w.id,versionId:v.versionId,expectedRevision:2});await assert.rejects(f.s.markCurrent(q,{workId:w.id,versionId:v2.versionId,expectedRevision:3}),e=>e.status===403);
 await f.db.query("update rib.activities set phase='exhibit' where id=$1",[a.id]);const wall=await f.s.classWall(q,{activityId:a.id});assert.equal(wall.named,true);assert.equal(wall.items.find(x=>x.id===w.id).versions.length,2);
 const item=(await f.s.journey(p,{})).works.find(x=>x.id===w.id);assert.equal(item.versions[0].metadata.question,fields.question);assert.ok(portfolioHtml({title:'私人',term:p.term,items:[{work:item,version:item.versions[0],images:[]}]}).includes(fields.question));
 const gallery=await f.s.gallery();assert.equal(gallery.items.length,1);assert.ok(!JSON.stringify(gallery).includes(p.studentId));await f.s.consent(p,{workId:w.id,consent:false});assert.equal((await f.s.gallery()).items.length,0);await f.db.query('update rib.activities set accepting=false where id=$1',[a.id]);await assert.rejects(upload(f,p,{...w,revision:3},'closed'),/開放|保存|交件/);
 assert.equal((await f.db.query('select count(*)::int as n from rib.versions where work_id=$1',[old.id]))[0].n,0);
});
test('five-slide format and evidence are mandatory, AI is optional, all displayed text is escaped',()=>{
 const input={...fields,files:Array(5).fill({})};const m=submissionMetadata('w15-personal-deck',{...input,aiUse:''});assert.equal(m.reportFormat,'personal-five-slides-v1');assert.equal(m.aiUse,'');
 for(const k of ['question','audience','references'])assert.throws(()=>submissionMetadata('w15-personal-deck',{...input,[k]:''}),/請填寫/);
 assert.throws(()=>submissionMetadata('w15-personal-deck',{...input,files:[{}]}),/5 張/);assert.throws(()=>submissionMetadata('w15-personal-deck',{...input,layout:'paper'}),/五頁/);
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const s=deckEvidence({...m,question:'<script>alert(1)</script>',references:'https://example.invalid/"onclick="alert(1)'},esc);assert.ok(!s.includes('<script>'));assert.ok(!s.includes('"onclick="'));assert.ok(s.includes('&lt;script&gt;'));
});
