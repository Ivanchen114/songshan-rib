import {supportedKind} from '../workspace/activities.js';
import {TABLES} from './backup.mjs';
import {randomInt} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {demand,sha,json,uid,verifier} from './security.mjs';
const termCode=x=>{demand(typeof x==='string'&&/^\d{3}0[12]$/.test(x),400,'學期代碼請用五碼，例如 11502。');return x;};
const admin=p=>demand(p.role==='admin',403,'學期管理只開放管理教師。');
const brief=d=>({term:d.term,sourceTerm:d.source_term,revision:d.revision,status:d.status,updatedAt:d.updated_at,actor:d.actor,summary:d.payload.summary,students:d.payload.students.map(({credential,...s})=>s),teachers:d.payload.teachers,templates:d.payload.templates});
export async function currentTerm(db){const [s]=await db.query('select current_term from rib.workspace_state where id=1');if(s?.current_term)return s.current_term;return (await db.query('select max(term) as term from rib.activities'))[0]?.term||null;}
async function sourceState(db,term){
 const roster=await db.query('select * from rib.students where term=$1 order by student_id',[term]);
 const credentials=await db.query('select * from rib.credentials where term=$1 order by student_id',[term]);
 const teachers=await db.query('select email,name,role,scopes from rib.teachers where active order by email');
 const activities=await db.query("select id,week,title,kind,archived,legacy from rib.activities where term=$1 and not coalesce((legacy->>'testOnly')::boolean,false) order by week,id",[term]);
 // Hash upgrades do not change a six-digit code; explicit code resets change revision.
 const digest=sha(json({roster:roster.map(({sharing_agreement,...s})=>s),credentials:credentials.map(c=>({studentId:c.student_id,revision:c.revision})),teachers,activities}));
 return {roster,credentials,teachers,activities,digest};
}
export function parseRoster(value){
 demand(typeof value==='string'&&value.length<=26000,400,'請貼上名單，最多 200 人。');
 const lines=value.replace(/^\uFEFF/,'').trim().split(/\r?\n/).filter(x=>x.trim());
 if(lines[0]?.includes('學號'))lines.shift();
 demand(lines.length>0&&lines.length<=200,400,'名單須有 1–200 人。');
 const ids=new Set(),seats=new Set();return lines.map((line,i)=>{
  const cells=line.split('\t').map(x=>x.trim());demand(cells.length===4,400,`第 ${i+1} 列須為四欄，以 Tab 分隔：學號、姓名、班級、座號。可直接從試算表複製。`);
  const [studentId,name,className,seatText]=cells,seat=Number(seatText);
  demand(/^\d{8}$/.test(studentId)&&name.length>0&&name.length<=60&&/^\d{3}$/.test(className)&&/^\d{1,3}$/.test(seatText)&&seat>0&&seat<1000,400,`第 ${i+1} 列格式不正確，請核對八碼學號、姓名、三碼班級及座號。`);
  demand(!ids.has(studentId)&&!seats.has(className+':'+seat),400,`第 ${i+1} 列學號或班級座號重複。`);ids.add(studentId);seats.add(className+':'+seat);
  return {studentId,name,className,seat};
 });
}
export class TermManager {
 async terms(p){
  demand(p.role!=='student',403,'請使用教師帳號。');
  const rows=await this.db.query('select term,count(*)::int as activities,bool_and(archived) as archived from rib.activities group by term order by term desc');
  const visible=rows.filter(r=>p.role==='admin'||p.teacher.scopes.some(s=>s.term===r.term));
  const result={currentTerm:await currentTerm(this.db),terms:visible,activationAllowed:process.env.RIB_ACCEPTANCE_ONLY!=='true'};
  if(p.role==='admin'){
   const term=result.currentTerm,source=term?await sourceState(this.db,term):null;
   result.roster=source?.roster.filter(s=>s.active&&!s.is_test).map(s=>({studentId:s.student_id,name:s.name,className:s.class_name,seat:s.seat}))||[];
   result.teachers=source?.teachers.map(t=>({email:t.email,name:t.name,role:t.role}))||[];
   result.drafts=(await this.db.query('select * from rib.term_drafts order by term desc')).map(brief);
   result.history=await this.db.query('select id,from_term,to_term,actor,summary,snapshot_hash,created_at from rib.term_changes order by created_at desc limit 20');
  }
  return result;
 }
 async termSave(p,input){
  admin(p);const term=termCode(input.term),sourceTerm=termCode(input.sourceTerm);demand(term>sourceTerm,400,'新學期必須晚於目前學期。');
  const students=parseRoster(input.rosterText);demand(Array.isArray(input.teachers)&&input.teachers.length>0&&input.teachers.every(x=>typeof x==='string'),400,'請指定共同授課教師。');
  return this.db.transaction(async db=>{
   await db.query('select id from rib.workspace_state where id=1 for update');
   demand(await currentTerm(db)===sourceTerm,409,'目前學期已改變，請重新開啟管理畫面。');
   demand(!(await db.query('select 1 from rib.activities where term=$1 limit 1',[term])).length,409,'這個學期已有活動，不能用新草稿覆蓋。');
   const [old]=await db.query('select * from rib.term_drafts where term=$1 for update',[term]);demand((old?.revision||0)===input.expectedRevision&&(!old||old.status==='draft'),409,'另一位老師已更新草稿，請重新載入。');
   const source=await sourceState(db,sourceTerm),teachers=[...new Set(input.teachers)].sort();
   demand(teachers.every(e=>source.teachers.some(t=>t.email===e)),400,'只能指定目前有效教師，不會在換學期時新增管理員。');
   const issued=[],added=[],moved=[],retained=[];
   for(const s of students){
    const previous=source.roster.find(r=>r.student_id===s.studentId),c=source.credentials.find(r=>r.student_id===s.studentId);
    demand(!previous?.is_test,400,'測試帳號不能放進正式名單。');
    if(previous){demand(previous.name===s.name,409,`學號 ${s.studentId} 與原姓名不同，請先核對身分；換學期不會自動把作品轉給另一人。`);demand(c,409,'原學生缺少登入資料，請先修復。');retained.push(s.studentId);if(previous.class_name!==s.className||previous.seat!==s.seat)moved.push(s.studentId);}
    else{
     added.push(s.studentId);
     // Reuse an unchanged saved draft hash. Newly issued plaintext appears only in this response.
     const existing=old?.payload.students.find(x=>x.studentId===s.studentId&&x.name===s.name&&x.credential);
     if(existing&&input.reissueNewCodes!==true)s.credential=existing.credential;
     else{const code=String(randomInt(1000000)).padStart(6,'0');s.credential=await verifier(code);issued.push({...s,credential:undefined,code});}
    }
   }
   const removed=source.roster.filter(r=>r.active&&!r.is_test&&!students.some(s=>s.studentId===r.student_id)).map(r=>r.student_id);
   const templates=source.activities.filter(a=>!a.archived).map(a=>({sourceId:a.id,week:a.week,title:a.title,kind:a.kind}));demand(templates.length>0,409,'來源學期沒有可沿用的活動設定。');
   const summary={total:students.length,classes:[...new Set(students.map(s=>s.className))].sort(),added,retained,moved,removed,activityCount:templates.length,unavailable:templates.filter(a=>!supportedKind(a.kind)).map(a=>a.title)};
   const payload={students,teachers,templates,summary};
   const [draft]=await db.query("insert into rib.term_drafts(term,source_term,payload,source_digest,actor) values($1,$2,$3,$4,$5) on conflict(term) do update set payload=excluded.payload,source_digest=excluded.source_digest,actor=excluded.actor,revision=rib.term_drafts.revision+1,updated_at=now() returning *",[term,sourceTerm,json(payload),source.digest,p.email]);
   await this.event(db,p,null,'term-draft',term,{revision:draft.revision,total:students.length});
   return {draft:brief(draft),issuedCodes:issued};
  });
 }
 async termBackup(p,input){admin(p);const [job]=await this.db.query('select summary from rib.term_changes where id=$1',[String(input.jobId||'')]);demand(job?.summary.backupKey,404,'找不到切換前備份。');return {url:await this.store.signRead(job.summary.backupKey)};}
 async termActivate(p,input){
  admin(p);demand(process.env.RIB_ACCEPTANCE_ONLY!=='true',403,'驗收站可準備草稿，但不能啟用正式新學期。');
  const term=termCode(input.term);demand(input.confirmTerm===term&&input.confirm===true,400,'請核對摘要、備份及名單，輸入完整新學期代碼確認。');
  return this.db.transaction(async db=>{
   // Every ordinary workspace mutation takes a shared lock on this same row.
   await db.query('select id from rib.workspace_state where id=1 for update');
   const [d]=await db.query('select * from rib.term_drafts where term=$1 for update',[term]);demand(d,404,'找不到學期草稿。');
   if(d.status==='activated'){const [job]=await db.query('select id,to_term from rib.term_changes where to_term=$1',[term]);return {saved:true,alreadyActivated:true,term,jobId:job.id};}
   demand(d.revision===input.expectedRevision,409,'草稿已更新，請重新核對摘要。');
   demand(await currentTerm(db)===d.source_term,409,'目前學期已改變，請重新準備。');
   demand(!d.payload.summary.unavailable.length||input.ackUnsupported===true,400,'請確認尚未支援的活動仍需原入口，不能視為全功能替代。');
   const source=await sourceState(db,d.source_term);demand(source.digest===d.source_digest,409,'名單、教師權限、登入碼或活動設定已更新，請重新儲存草稿並核對。');
   demand(!(await db.query('select 1 from rib.students where term=$1 union all select 1 from rib.activities where term=$1 limit 1',[term])).length,409,'新學期已有資料，不能覆蓋。');
   // Preserve all non-ephemeral data before any semester mutation. Existing media are immutable.
   const tables={};for(const name of TABLES)tables[name]=(await db.query(`select to_jsonb(t) as row from rib.${name} t`)).map(x=>x.row);
   const backup={format:'rib-backup-v3',created:new Date().toISOString(),tables},snapshotHash=sha(json(backup)),jobId=uid();
   const backupKey='backups/terms/'+jobId+'.json.gz',packed=gzipSync(Buffer.from(json({...backup,sha256:snapshotHash})));
   await this.store.put(backupKey,packed,'application/gzip');
   demand(sha(await this.store.get(backupKey,64*1024*1024))===sha(packed),503,'切換前備份讀回核對失敗，學期尚未切換。');
   const students=d.payload.students.map(s=>({term,student_id:s.studentId,name:s.name,class_name:s.className,seat:s.seat,active:true,is_test:false}));
   const credentials=d.payload.students.map(s=>{const c=source.credentials.find(c=>c.student_id===s.studentId)||s.credential;demand(c,409,'新生登入資料不完整。');return {term,student_id:s.studentId,algorithm:c.algorithm,salt:c.salt,digest:c.digest,revision:c.revision||1};});
   await db.query('insert into rib.students select * from jsonb_populate_recordset(null::rib.students,$1::jsonb)',[json(students)]);
   await db.query('insert into rib.credentials select * from jsonb_populate_recordset(null::rib.credentials,$1::jsonb)',[json(credentials)]);
   for(const a of d.payload.templates)await db.query("insert into rib.activities(id,term,week,title,kind,phase,accepting,legacy) values($1,$2,$3,$4,$5,'production',false,$6)",[uid(),term,a.week,a.title,a.kind,json({sourceActivityId:a.sourceId,termJob:jobId})]);
   for(const email of d.payload.teachers){const t=source.teachers.find(t=>t.email===email),scopes=t.scopes.filter(s=>s.term!==term);for(const className of d.payload.summary.classes)scopes.push({term,className,grading:true});await db.query('update rib.teachers set scopes=$1 where email=$2',[json(scopes),email]);}
   await db.query('update rib.activities set accepting=false,archived=true,revision=revision+1 where term=$1',[d.source_term]);
   await db.query('update rib.workspace_state set current_term=$1,revision=revision+1 where id=1',[term]);
   await db.query("update rib.term_drafts set status='activated',revision=revision+1,updated_at=now() where term=$1",[term]);
   await db.query('insert into rib.term_changes(id,from_term,to_term,actor,snapshot,snapshot_hash,summary) values($1,$2,$3,$4,$5,$6,$7)',[jobId,d.source_term,term,p.email,json({format:'rib-term-snapshot-index-v1',backupKey,sha256:snapshotHash,tableCounts:Object.fromEntries(Object.entries(tables).map(([k,v])=>[k,v.length]))}),snapshotHash,json({...d.payload.summary,backupKey,backupBytes:packed.length})]);
   await this.event(db,p,null,'term-activated',term,{from:d.source_term,jobId,snapshotHash});return {saved:true,term,jobId,snapshotHash};
  });
 }
}

export const activityWrites=['testFeedback','assignReader','reply','ensureWork','invite','leaveGroup','invitation','prepare','finalize','dispatch','review','requestReplacement','replace','decision','control','consent','publish','assess','wallComment','wallVote','moderateComment','markCurrent','paperKeep','selectionSave','selectionFeature','referencePrepare','referenceFinalize'];
export async function guardActivityWrite(db,action,input){
 let activityId=['ensureWork','invitation','dispatch','control','referencePrepare'].includes(action)?input.activityId:null;
 if(['testFeedback','assignReader','invite','leaveGroup','prepare','decision','consent','assess','wallComment','wallVote','markCurrent','paperKeep'].includes(action)&&input.workId)activityId=(await db.query('select activity_id from rib.works where id=$1',[input.workId]))[0]?.activity_id;
 if(['review','requestReplacement','replace','reply'].includes(action)&&input.reviewId)activityId=(await db.query('select activity_id from rib.reviews where id=$1',[input.reviewId]))[0]?.activity_id;
 if(action==='finalize'&&input.ticketId)activityId=(await db.query('select w.activity_id from rib.uploads u join rib.works w on w.id=u.work_id where u.id=$1',[input.ticketId]))[0]?.activity_id;
 if(['publish','selectionFeature'].includes(action)&&input.publicationId)activityId=(await db.query('select w.activity_id from rib.publications p join rib.versions v on v.id=p.version_id join rib.works w on w.id=v.work_id where p.id=$1',[input.publicationId]))[0]?.activity_id;
 if(action==='referenceFinalize'&&input.ticketId)activityId=(await db.query('select activity_id from rib.activity_assets where id=$1',[input.ticketId]))[0]?.activity_id;
 if(action==='moderateComment'&&input.commentId)activityId=(await db.query('select activity_id from rib.wall_comments where id=$1',[input.commentId]))[0]?.activity_id;
 if(activityId){const [a]=await db.query('select archived from rib.activities where id=$1',[activityId]);const withdrawal=(action==='consent'&&input.consent===false)||(action==='publish'&&input.publish===false);demand(!a?.archived||withdrawal,403,'舊學期已封存，只能查閱；不能再交件、配對、評閱或重開活動。');}
}
