import {portfolioHtml} from '../../workspace/portfolio-export.js';
import test from 'node:test';import assert from 'node:assert/strict';import sharp from 'sharp';
import {fixture} from './support.mjs';import {Workspace} from '../service.mjs';import {sha} from '../security.mjs';
import {setupReadingWeeks,READING_SETUP_KINDS} from '../reading-weeks.mjs';import {submissionMetadata} from '../weekly.mjs';
import {readingEvidence,READING_PAGES,READING_KINDS} from '../../workspace/reading-evidence.js';
const evidence=kind=>['w10-priority','w13-synthesis'].includes(kind)?{...(kind==='w10-priority'?{claim:'第一順位的精確原句'}:{}),references:'發布機關。（2025）。原始公告。https://example.org/source',passage:'第2段：適用本路線；另有例外。',searchPath:'搜尋年度、路線與時段，開公告對照。'}:{sourceNotes:'發言者／日期，https://example.org/article，第3段。'};
async function upload(f,p,w,kind,count,id='first'){
 const bytes=await sharp({create:{width:400,height:600,channels:3,background:'#eee'}}).png().toBuffer();
 const u=await f.s.prepare(p,{workId:w.id,requestId:id,expectedRevision:w.revision,title:'【本機虛構】閱讀紀錄',evidenceFormat:'paper-judgment-v1',...evidence(kind),sourceWorkId:'forged',publicDisplay:true,files:Array.from({length:count},()=>({bytes:bytes.length,mime:'image/png',sha256:sha(bytes)}))});
 if(u.versionId)return u;const [ticket]=await f.db.query('select files from rib.uploads where id=$1',[u.ticketId]);for(const file of ticket.files)f.store.objects.set(file.key,bytes);return f.s.finalize(p,{ticketId:u.ticketId});
}
test('reading-week setup is repeatable, creates formal/test activities closed, leaves existing phases alone',async t=>{
 const f=await fixture(3);t.after(f.close);assert.equal((await setupReadingWeeks(f.db)).needed.length,READING_SETUP_KINDS.length*2);assert.equal((await setupReadingWeeks(f.db)).created.length,0);
 assert.equal((await setupReadingWeeks(f.db,{apply:true})).created.length,READING_SETUP_KINDS.length*2);assert.equal((await setupReadingWeeks(f.db,{apply:true})).created.length,0);
 const rows=await f.db.query("select * from rib.activities where kind in ('w10-priority','w11-response')");assert.ok(rows.every(x=>x.accepting===false&&x.phase==='production'));
 await f.db.query('update rib.activities set accepting=true where id=$1',[rows[0].id]);await setupReadingWeeks(f.db,{apply:true});assert.equal((await f.db.query('select accepting from rib.activities where id=$1',[rows[0].id]))[0].accepting,true);
});
for(const kind of READING_KINDS)test(kind+' keeps paper judgment with versioned evidence, protects ownership and display',async t=>{
 const f=await fixture(3);t.after(f.close);await setupReadingWeeks(f.db,{apply:true});f.s=new Workspace(f.db,f.store);
 const [a]=await f.db.query("select * from rib.activities where kind=$1 and not (legacy->>'testOnly')::boolean",[kind]);const [p,q]=f.people;
 await assert.rejects(f.s.ensureWork(p,{activityId:a.id}),/開放|關閉|不能|交件/);
 await f.db.query('update rib.activities set accepting=true where id=$1',[a.id]);const w=await f.s.ensureWork(p,{activityId:a.id}),n=READING_PAGES[kind].length;
 await assert.rejects(upload(f,p,w,kind,1),new RegExp(n+' 張'));
 const v=await upload(f,p,w,kind,n),m=await f.s.media(p,{versionId:v.versionId});assert.equal(m.images.length,n);assert.equal(m.metadata.publicDisplay,false);assert.equal(m.metadata.sourceWorkId,null);assert.equal(m.metadata.readingKind,kind);assert.equal(m.metadata.verification,undefined);assert.equal(m.metadata.judgment,undefined);
 await assert.rejects(f.s.media(q,{versionId:v.versionId}),/權限|自己|尚未|開放|不能/);
 const [pub]=await f.db.query('select id from rib.publications where version_id=$1',[v.versionId]);await assert.rejects(f.s.publish(f.teacher,{publicationId:pub.id,publish:true,reviewed:true}),/不能公開|只在登入/);
 const journey=await f.s.journey(p,{});assert.equal(journey.works.find(x=>x.id===w.id).versions[0].metadata.readingKind,kind);assert.equal(journey.works.find(x=>x.id===w.id).versions[0].metadata[Object.keys(evidence(kind))[0]],evidence(kind)[Object.keys(evidence(kind))[0]]);
 const item=journey.works.find(x=>x.id===w.id);assert.ok(portfolioHtml({title:'test',term:p.term,items:[{work:item,version:item.versions[0],images:[]}]}).replace(/<[^>]*>/g,'').includes(evidence(kind)[Object.keys(evidence(kind))[0]]));
 const selection=await f.s.selections(p);assert.ok(!selection.candidates.some(x=>x.id===v.versionId));await assert.rejects(f.s.selectionSave(p,{versionIds:[v.versionId],expectedRevision:selection.revision}),/可自願/);
 assert.equal((await f.s.gallery()).items.length,0);assert.equal((await f.s.media(f.teacher,{versionId:v.versionId})).images.length,n);
 await assert.rejects(f.s.reflection(p,{workId:w.id}),/自己的|反思/);
 const v2=await upload(f,p,{...w,revision:1},kind,n,'second');assert.notEqual(v2.versionId,v.versionId);assert.equal((await f.s.media(p,{versionId:v.versionId})).images.length,n);
 await assert.rejects(upload(f,q,{...w,revision:2},kind,n,'foreign'),/權限|自己|不能/);
 await f.db.query('update rib.activities set accepting=false where id=$1',[a.id]);await assert.rejects(upload(f,p,{...w,revision:2},kind,n,'closed'),/開放|關閉|不能|保存/);
});
test('W10 allows honest unresolved search without inventing references; rejects malformed values',()=>{
 const b={title:'紀錄',evidenceFormat:'paper-judgment-v1',claim:'原句',searchPath:'實際搜尋詞；仍缺原始成效資料',files:[{},{}]};
 assert.throws(()=>submissionMetadata('w10-priority',b),/來源/);assert.equal(submissionMetadata('w10-priority',{...b,noSource:true}).references,'');
 assert.throws(()=>submissionMetadata('w10-priority',{...b,noSource:true,searchPath:''}),/實際怎麼找/);
 assert.throws(()=>submissionMetadata('w10-priority',{...b,noSource:true,claim:{bad:true}}),e=>e.status===400);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const m=submissionMetadata('w10-priority',{...b,noSource:true,claim:'<img src=x onerror=alert(1)>'});assert.ok(!readingEvidence(m,esc).includes('<img'));assert.ok(readingEvidence(m,esc).includes('&lt;img'));
});
