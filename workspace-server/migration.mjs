import {readFile,stat,realpath} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {sha,uid,json,demand} from './security.mjs';
// Migration is deliberately independent of the public API. Never run against active writers.
export function analyze(manifest) {
  demand(manifest?.format==='rib-migration-v1',400,'需要完整 rib-migration-v1 匯出；一般備份缺少登入驗證資料。');
  const errors=[...(manifest.issues||[])],tables=manifest.tables||{},map={};
  for(const [name,rows] of Object.entries(tables)){demand(Array.isArray(rows),400,'資料表格式不正確。');map[name]=new Map();for(const row of rows){if(!row.id||map[name].has(String(row.id)))errors.push({table:name,id:row.id,problem:'duplicate_or_missing_id'});map[name].set(String(row.id),row);}}
  const students=new Map();for(const roster of tables.TermRosters||[])for(const s of roster.students||[]){const key=roster.id+':'+s.studentId;if(students.has(key))errors.push({problem:'duplicate_student',key});students.set(key,{...s,term:String(roster.id)});}
  const members=new Map();for(const t of tables.Teams||[]){const a=map.Activities?.get(t.activityId);if(!a){errors.push({problem:'missing_activity',teamId:t.id});continue;}const root=map.Activities.get(a.parentActivityId)||a;
    const ids=t.confirmedMemberIds||root.memberBindings?.[t.id]||a.memberBindings?.[t.id]||(t.members||[]).map(m=>m.studentId).filter(Boolean);
    const pending=t.pendingMemberIds||[];members.set(t.id,{confirmed:ids,pending});
    for(const sid of [...ids,...pending])if(!students.has(a.term+':'+sid))errors.push({problem:'missing_roster_member',teamId:t.id,studentId:sid});
    if(!ids.length&&(tables.Versions||[]).some(v=>v.teamId===t.id))errors.push({problem:'unmapped_author',teamId:t.id});
  }
  for(const c of manifest.credentials||[])if(!students.has(c.term+':'+c.studentId)||!c.salt||!/^[a-f0-9]{64}$/.test(c.digest))errors.push({problem:'invalid_credential',studentId:c.studentId});
  for(const s of students.values())if(s.status==='active'&&!(manifest.credentials||[]).some(c=>c.term===s.term&&c.studentId===s.studentId))errors.push({problem:'missing_credential',studentId:s.studentId});
  for(const v of tables.Versions||[])if(v.teamId!=='teacher'&&!map.Teams?.has(v.teamId))errors.push({problem:'missing_version_owner',versionId:v.id});
  const refs=new Set();const walk=x=>{if(!x||typeof x!=='object')return;for(const [k,v] of Object.entries(x)){if(['fileId','thumbId','projectId','previewId'].includes(k)&&typeof v==='string'&&v)refs.add(v);else walk(v);}};walk(tables);
  for(const id of refs)if(!(manifest.files||[]).some(f=>f.sourceId===id))errors.push({problem:'missing_file_inventory',fileId:id});
  return {errors,map,students,members,summary:{tables:Object.fromEntries(Object.entries(tables).map(([k,v])=>[k,v.length])),students:students.size,credentials:(manifest.credentials||[]).length,files:(manifest.files||[]).length,bytes:(manifest.files||[]).reduce((n,f)=>n+Number(f.bytes||0),0)}};
}
export async function verifyFiles(manifest,directory) {
  const base=await realpath(directory),results=[];
  for(const f of manifest.files){demand(/^[\w-]+$/.test(f.sourceId),400,'來源檔案識別不正確。');const filename=await realpath(path.join(base,f.sourceId));demand(filename.startsWith(base+path.sep),400,'媒體路徑超出資料夾。');const info=await stat(filename);demand(info.isFile()&&info.size===Number(f.bytes),409,'媒體大小不一致：'+f.sourceId);const bytes=await readFile(filename);const hash=sha(bytes);if(f.sha256)demand(f.sha256===hash,409,'媒體雜湊不一致：'+f.sourceId);results.push({...f,sha256:hash,filename});}
  return results;
}
const kindOf=a=>a.template?.id==='w5-structure-workshop'?'w5-workshop':a.template?.workflow==='reader-check'?'w4':'legacy';
export async function importSnapshot(db,store,manifest,files) {
  const report=analyze(manifest);demand(!report.errors.length,409,'有未解決的對應問題，停止匯入。');
  const [count]=await db.query('select count(*)::int as n from rib.legacy_records');demand(count.n===0,409,'此目標已有搬遷資料；不可直接覆寫，請使用獨立空白驗證資料庫。');
  const [live]=await db.query('select count(*)::int as n from rib.works');demand(live.n===0,409,'目標已有作品，停止全量匯入。');
  demand(files.length===manifest.files.length,409,'媒體尚未全部核對。');const runId=uid(),mapped=new Map();
  let nextFile=0;
  await Promise.all(Array.from({length:4},async()=>{while(nextFile<files.length){
    const file=files[nextFile++],bytes=await readFile(file.filename);demand(sha(bytes)===file.sha256,409,'檔案在驗證後變動。');
    const objectKey=`migration/${runId}/${file.sourceId}`;await store.put(objectKey,bytes,file.mime);const copied=await store.get(objectKey,file.bytes);demand(sha(copied)===file.sha256,409,'目標媒體雜湊不一致，停止切換。');
    let display={};
    if(['image/jpeg','image/png','image/webp'].includes(file.mime)){
      const full=await sharp(bytes,{limitInputPixels:40000000}).rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).jpeg({quality:86}).toBuffer();
      const thumb=await sharp(full).resize({width:480,height:480,fit:'inside',withoutEnlargement:true}).jpeg({quality:76}).toBuffer();
      const fullKey=objectKey+'-display.jpg',thumbKey=objectKey+'-thumb.jpg';
      await Promise.all([store.put(fullKey,full,'image/jpeg'),store.put(thumbKey,thumb,'image/jpeg')]);
      demand(sha(await store.get(fullKey,full.length))===sha(full)&&sha(await store.get(thumbKey,thumb.length))===sha(thumb),409,'展示副本核對失敗。');
      display={fullKey,thumbKey,displayHash:sha(full)};
    }
    mapped.set(file.sourceId,{...file,objectKey,...display});
  }}));
  const {tables}=manifest,{map,members,students}=report;
  return db.transaction(async tx=>{
    const provenance={created:manifest.created,sourceSpreadsheetId:manifest.sourceSpreadsheetId,settings:manifest.settings||{},files:manifest.files};
    await tx.query('insert into rib.legacy_records(source_table,source_id,source_hash,payload) values($1,$2,$3,$4)',['manifest','provenance',sha(json(provenance)),json(provenance)]);
    for(const sheet of manifest.rawSheets||[])for(let i=0;i<sheet.rows.length;i++)await tx.query('insert into rib.legacy_records(source_table,source_id,source_hash,payload) values($1,$2,$3,$4)',[sheet.name,'row:'+i,sha(json(sheet.rows[i])),json(sheet.rows[i])]);
    // Preserve every logical record too, including assessments, deleted/hidden history and publication events.
    for(const [table,rows] of Object.entries(tables))for(const r of rows)await tx.query('insert into rib.legacy_records(source_table,source_id,source_hash,payload) values($1,$2,$3,$4) on conflict do nothing',['logical:'+table,String(r.id),sha(json(r)),json(r)]);
    for(const s of students.values())await tx.query('insert into rib.students(term,student_id,name,class_name,seat,active,is_test) values($1,$2,$3,$4,$5,$6,$7)',[s.term,s.studentId,s.name,s.className,Number(s.seat),s.status==='active',s.isTest===true]);
    for(const c of manifest.credentials)await tx.query("insert into rib.credentials(term,student_id,algorithm,salt,digest,revision) values($1,$2,'gas-sha256',$3,$4,$5)",[c.term,c.studentId,c.salt,c.digest,c.revision]);
    const cfg=(tables.Platform||[]).find(p=>p.id==='config');
    for(const t of cfg?.teachers||[]){const scopes=(cfg.assignments||[]).filter(a=>(a.teaching||[]).includes(t.email)||(a.grading||[]).includes(t.email)).map(a=>({term:a.term,className:a.className,grading:(a.grading||[]).includes(t.email)}));await tx.query('insert into rib.teachers(email,name,role,active,scopes) values($1,$2,$3,$4,$5)',[t.email,t.name,t.role,t.active===true,json(scopes)]);}
    for(const a of tables.Activities||[])await tx.query('insert into rib.activities(id,term,week,title,kind,phase,accepting,archived,legacy) values($1,$2,$3,$4,$5,$6,false,$7,$8)',[a.id,a.term,kindOf(a)==='w5-workshop'?5:kindOf(a)==='w4'?4:Number(/w(\d+)/i.exec(a.template?.id||a.title||'')?.[1]||0),a.title,kindOf(a),a.readerPhase==='exhibit'?'exhibit':a.revealed?'review':'production',!!(a.archived||a.termRevertedJob),json(a)]);
    for(const t of tables.Teams||[]){const a=map.Activities.get(t.activityId),m=members.get(t.id);const first=students.get(a.term+':'+m.confirmed[0]);await tx.query('insert into rib.works(id,activity_id,class_name,owner_id,revision,hidden,created_at) values($1,$2,$3,$4,$5,$6,$7)',[t.id,a.id,first?.className||t.members?.[0]?.className||'未對應',kindOf(a)==='w4'&&m.confirmed.length===1?m.confirmed[0]:null,(tables.Versions||[]).filter(v=>v.teamId===t.id).length,!!t.hidden,t.created||new Date().toISOString()]);
      for(const sid of [...new Set([...m.confirmed,...m.pending])])await tx.query('insert into rib.members(work_id,term,student_id,status) values($1,$2,$3,$4)',[t.id,a.term,sid,m.confirmed.includes(sid)?'confirmed':'invited']);}
    const image=f=>{const full=mapped.get(f.fileId);return full?{originalKey:full.objectKey,fullKey:full.fullKey||full.objectKey,thumbKey:full.thumbKey||full.objectKey,displayHash:full.displayHash,sha256:full.sha256,bytes:full.bytes}:null;};
    for(const v of tables.Versions||[]){if(v.teamId==='teacher')continue;const media=(v.pages||[v]).map(image).filter(Boolean);await tx.query('insert into rib.versions(id,work_id,ordinal,media,metadata,request_id,created_at) values($1,$2,$3,$4,$5,$6,$7)',[v.id,v.teamId,Number(v.stage),json(media),json({topics:v.topics||[],legacyMedia:v.media||'image',legacy:true}),v.requestId||'legacy-'+v.id,v.created||new Date().toISOString()]);}
    // Import only unambiguous current W4 initial reads into the live workflow; all other records remain losslessly archived above.
    for(const a of tables.Activities||[]){if(kindOf(a)!=='w4')continue;const feedback=(tables.Comments||[]).filter(c=>c.activityId===a.id&&c.kind==='reader'&&!c.hidden),seen=new Set();
      for(const c of feedback){demand(!seen.has(c.targetId),409,'同一作品有多份有效初讀，需人工核對。');seen.add(c.targetId);const sid=members.get(c.teamId)?.confirmed;if(!sid||sid.length!==1)throw Error('unmapped reviewer');const v=(tables.Versions||[]).find(v=>v.teamId===c.targetId&&Number(v.stage)===1);demand(v,409,'初讀的原版本找不到。');await tx.query("insert into rib.reviews(id,activity_id,target_work_id,reviewer_id,term,version_id,status,situation,meaning,submitted_at) values($1,$2,$3,$4,$5,$6,'done',$7,$8,$9)",[c.id,a.id,c.targetId,sid[0],a.term,v.id,c.reports?.[0]||c.text||'',c.reports?.[1]||'',c.created||new Date().toISOString()]);}
      for(const r of a.readerAllocation?.items||[]){if(r.status==='cancelled'||seen.has(r.targetId))continue;const sid=members.get(r.readerId)?.confirmed;demand(sid?.length===1,409,'分派讀者無法對應。');const v=map.Versions?.get(r.versionId);await tx.query('insert into rib.reviews(id,activity_id,target_work_id,reviewer_id,term,version_id,status,reason) values($1,$2,$3,$4,$5,$6,$7,$8)',[r.id,a.id,r.targetId,sid[0],a.term,v?.id||null,r.status==='requested'?'requested':v?'assigned':'waiting',r.reason||null]);seen.add(r.targetId);}
    }
    // Keep historical assessments intact. Never reinterpret an old rubric as the current one.
    for(const g of tables.Assessments||[]){
      const work=(tables.Teams||[]).find(t=>t.activityId===g.activityId&&members.get(t.id)?.confirmed.includes(g.studentId)&&!t.hidden);
      if(!work)continue; // Exact record remains in legacy_records, including pre-submission grades.
      await tx.query('insert into rib.assessments(work_id,student_id,rubric,criteria,comment,status,evidence_key,teacher,revision,updated_at,legacy_score,legacy_max,legacy_payload) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',[work.id,g.studentId,g.rubric||'legacy-formative',json(g.criteria||[]),g.note||'',g.status,'legacy:'+g.workKey,g.actor||'legacy',g.revision||1,g.updated||manifest.created,g.score??null,g.max??null,json(g)]);
    }
    for(const t of tables.Teams||[]){if(!['keep','revise'].includes(t.decision))continue;const version=(tables.Versions||[]).filter(v=>v.teamId===t.id&&Number(v.stage)>0).sort((a,b)=>Number(b.stage)-Number(a.stage))[0];if(!version)continue;
      for(const sid of members.get(t.id).confirmed)await tx.query('insert into rib.decisions(id,work_id,student_id,choice,reason,version_id,created_at) values($1,$2,$3,$4,$5,$6,$7)',[uid(),t.id,sid,t.decision,t.decisionReason||'舊系統僅保存改留選擇；依據請核對原歷程本。',version.id,t.decisionAt||manifest.created]);
    }
    for(const c of tables.Consents||[]){const work=(tables.Teams||[]).find(t=>(members.get(t.id)?.confirmed||[]).some(sid=>c.id===t.id+':'+sid));if(!work)continue;const sid=members.get(work.id).confirmed.find(sid=>c.id===work.id+':'+sid);await tx.query('update rib.members set consent=$1 where work_id=$2 and student_id=$3',[c.allowed===true,work.id,sid]);}
    // Existing publication snapshots remain archived. Reopening public access requires inspection of migrated display copies.
    for(const v of tables.Versions||[])if(v.teamId!=='teacher')await tx.query('insert into rib.publications(id,version_id) values($1,$2)',[uid(),v.id]);
    for(const f of mapped.values())await tx.query('insert into rib.legacy_files(source_id,object_key,sha256,bytes,mime) values($1,$2,$3,$4,$5)',[f.sourceId,f.objectKey,f.sha256,f.bytes,f.mime]);
    await tx.query('insert into rib.migration_runs(id,source_hash,summary) values($1,$2,$3)',[runId,sha(json(manifest)),json({...report.summary,mode:'staging',accepting:false,unmappedWorkflows:'legacy-read-only'})]);
    return {runId,...report.summary,accepting:false};
  });
}
