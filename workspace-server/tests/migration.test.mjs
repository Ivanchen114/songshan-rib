import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {fixture} from './support.mjs';
import {analyze,verifyFiles,importSnapshot} from '../migration.mjs';
import {sha,authenticate} from '../security.mjs';
import {Workspace} from '../service.mjs';
function snapshot(){const studentId='11500999',term='11501';return {format:'rib-migration-v1',created:'2026-09-23T01:00:00Z',issues:[],rawSheets:[{name:'自訂備註',rows:[['保留欄位'],['不得遺失']]}],credentials:[{term,studentId,salt:'old-salt',digest:sha('old-salt:012345'),revision:7}],files:[{sourceId:'current-file',bytes:3,mime:'image/png'},{sourceId:'replaced-file',bytes:3,mime:'image/png'}],tables:{TermRosters:[{id:term,students:[{studentId,name:'虛構測試',className:'101',seat:1,status:'active'}]}],Activities:[{id:'old-activity',term,title:'舊 W4',template:{workflow:'reader-check'}}],Teams:[{id:'old-team',activityId:'old-activity',confirmedMemberIds:[studentId],decision:'keep',decisionAt:'2026-09-22T02:00:00Z'}],Versions:[{id:'old-version',activityId:'old-activity',teamId:'old-team',stage:1,fileId:'current-file',replacements:[{fileId:'replaced-file'}]}],Assessments:[{id:'old-grade',activityId:'old-activity',studentId,criteria:[2,2,2,2],score:13.333333333333334,max:20,status:'graded',rubric:'w45-v104',workKey:'old-evidence',note:'原始評語',revision:4,actor:'teacher@example.invalid'}],Consents:[{id:'old-team:'+studentId,allowed:true}],History:[{id:'history1',nested:{anything:'原樣保留'}}]}};}
test('migration preserves six-code verifier, exact grade, consent, replacements and raw records; imports closed',async t=>{
 const f=await fixture(0);t.after(f.close);const dir=await mkdtemp(path.join(tmpdir(),'rib-migration-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));const m=snapshot();const picture=await sharp({create:{width:3000,height:2000,channels:3,background:'#e3cfb6'}}).png().withMetadata().toBuffer();for(const file of m.files){file.bytes=picture.length;await writeFile(path.join(dir,file.sourceId),picture);}
 assert.equal(analyze(m).errors.length,0);const files=await verifyFiles(m,dir);const result=await importSnapshot(f.db,f.store,m,files);assert.equal(result.accepting,false);assert.equal((await f.db.query('select * from rib.legacy_files')).length,2);
 const [version]=await f.db.query('select media from rib.versions');const image=version.media[0];assert.equal(sha(await f.store.get(image.originalKey)),sha(picture));const displayed=await f.store.get(image.fullKey);assert.equal(sha(displayed),image.displayHash);assert.equal((await sharp(displayed).metadata()).width,2400);assert.equal((await sharp(displayed).metadata()).exif,undefined);
 const [grade]=await f.db.query('select * from rib.assessments');assert.equal(Number(grade.legacy_score),m.tables.Assessments[0].score);assert.deepEqual(grade.legacy_payload,m.tables.Assessments[0]);
 const [history]=await f.db.query("select * from rib.legacy_records where source_table='logical:History'");assert.deepEqual(history.payload,m.tables.History[0]);assert.equal(history.source_hash,sha(JSON.stringify(m.tables.History[0])));
 const s=new Workspace(f.db,f.store),session=await s.login({term:'11501',studentId:'11500999',code:'012345'},'migration-test');const p=await authenticate(f.db,session.token);const b=await s.board(p,{activityId:'old-activity'});assert.equal(b.works[0].decisions[0].choice,'keep');assert.equal(b.works[0].members[0].consent,true);assert.equal(b.works[0].publications[0].status,'pending');await assert.rejects(s.prepare(p,{workId:'old-team'}),/不能保存/);await assert.rejects(s.archive(p,{}),/管理教師/);await assert.rejects(importSnapshot(f.db,f.store,m,files),/已有搬遷/);
});
test('migration refuses missing authors, missing historical media and changed files',async t=>{
 const m=snapshot();m.files.pop();m.tables.Teams[0].confirmedMemberIds=[];const errors=analyze(m).errors;assert.ok(errors.some(x=>x.problem==='missing_file_inventory'));assert.ok(errors.some(x=>x.problem==='unmapped_author'));
 const dir=await mkdtemp(path.join(tmpdir(),'rib-migration-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));const valid=snapshot();await writeFile(path.join(dir,'current-file'),'short');await assert.rejects(verifyFiles(valid,dir),/大小不一致/);
});
test('migration reads copied bytes back and rejects corrupt target storage before database import',async t=>{
 const f=await fixture(0);t.after(f.close);const dir=await mkdtemp(path.join(tmpdir(),'rib-migration-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));const m=snapshot();await writeFile(path.join(dir,'current-file'),'abc');await writeFile(path.join(dir,'replaced-file'),'xyz');const files=await verifyFiles(m,dir);f.store.get=async()=>Buffer.from('bad');await assert.rejects(importSnapshot(f.db,f.store,m,files),/目標媒體/);assert.equal((await f.db.query('select * from rib.legacy_records')).length,0);
});
