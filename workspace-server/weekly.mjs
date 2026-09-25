import {namedClassroom,classroomClasses,classroomLabel} from './classroom-audience.mjs';
import {w8Topic} from '../workspace/w8-topics.js';
import {w7Topic} from '../workspace/w7-topics.js';
import {w5Topic} from '../workspace/w5-topics.js';
import {ACTIVITY,isGroup,supportedKind} from '../workspace/activities.js';
import {uid,text,demand,json,sha,teacherScope} from './security.mjs';
import {currentTerm} from './terms.mjs';
import {Roster} from './roster.mjs';
import {publicFrom,publicWhere} from './publication.mjs';
import {MAX_IMAGE,commitImage} from './storage.mjs';
const one=async(db,q,p=[]) => (await db.query(q,p))[0];
export function submissionMetadata(kind,input,previous=[]){
 const meta={};
 if(kind==='w8-proposal'){
  demand(w8Topic(input.topic),409,'請先確認本組題材。');
  meta.topic=input.topic;meta.title=text(input.title,100);meta.sourceGroupId=input.sourceGroupId;
  // Full paper includes author/questioner names. Keep it in the logged-in course.
  meta.publicDisplay=false;
 }

 if(kind==='w5-personal'){demand(w5Topic(input.topic),400,'請從題庫選一題，標明自己的題號。');meta.topic=input.topic;}
 if(['w3-rebuild','w3-personal'].includes(kind))meta.text=text(input.text,3000);
 if(kind==='w7-news'){demand(w7Topic(input.topic),409,'請先完成本組抽題。');meta.topic=input.topic;meta.text=text(input.text,1200);}
 if(kind==='w7'){const topic=previous[0]?.metadata.topic||input.topic;demand(['Z','M'].includes(topic),400,'請選動物園或校園手機。');meta.topic=topic;}
 if(kind==='w15-deck'){
  demand(['slides','paper'].includes(input.layout),400,'請選五張投影片或一張完整 A3。');
  demand(['試讀版','試讀修訂','發表定稿','提問後修訂'].includes(input.purpose),400,'請選這一版的用途。');meta.layout=input.layout;meta.purpose=input.purpose;
 }
 const n=kind==='w5-workshop'?2:kind==='w15-deck'&&input.layout==='slides'?5:1;
 demand(Array.isArray(input.files)&&input.files.length===n,400,`本次需要 ${n} 張圖片，請依序選取。`);
 return meta;
}
export class Weekly extends Roster {
 async classWall(p,input){
  const a=await this.activity(p,input.activityId);
  const named=namedClassroom(a);
  const classes=p.role==='teacher'?p.teacher.scopes.filter(s=>s.term===a.term).map(s=>s.className):named?classroomClasses(a,p.student.class_name):null;
  if(p.role==='student'){demand(a.phase==='exhibit',403,'老師尚未開放課程展示。');demand(!!p.student.is_test===!!a.legacy?.testOnly,403,'請進入自己的課堂活動。');}
  else demand(p.role==='admin'||classes?.length,403,'沒有此學期權限。');
  const works=await this.db.query(`select w.id,w.current_version_id,w.class_name from rib.works w where w.activity_id=$1 and ($2::text[] is null or w.class_name=any($2::text[])) and not w.hidden
   and exists(select 1 from rib.members m join rib.students s using(term,student_id) where m.work_id=w.id and m.status='confirmed' and s.is_test=$3)
   and not exists(select 1 from rib.members m join rib.students s using(term,student_id) where m.work_id=w.id and s.is_test<>$3)
   order by md5(w.id),w.id`,[a.id,classes,!!a.legacy?.testOnly]);
  const ids=works.map(w=>w.id);
  const authors=named?await this.db.query("select m.work_id,s.name,s.class_name from rib.members m join rib.students s using(term,student_id) where m.work_id=any($1::text[]) and m.status='confirmed' order by s.class_name,s.seat",[ids]):[];
  const [versions,comments,votes]=await Promise.all([
   this.db.query('select id,work_id,ordinal,metadata from rib.versions where work_id=any($1::text[]) order by ordinal',[ids]),
   this.db.query(`select id,target_work_id,actor_work_id,body,hidden,created_at from rib.wall_comments where target_work_id=any($1::text[]) ${p.role==='student'?'and not hidden':''} order by created_at,id`,[ids]),
   this.db.query('select target_work_id,actor_work_id from rib.wall_votes where target_work_id=any($1::text[]) and active',[ids])]);
  const own=p.role==='student'?await one(this.db,"select w.id from rib.works w join rib.members m on m.work_id=w.id where w.activity_id=$1 and m.student_id=$2 and m.status='confirmed'",[a.id,p.studentId]):null;
  return {activityId:a.id,title:a.title,week:a.week,term:a.term,teacher:p.role!=='student',canComment:p.role==='student'&&!!own,kind:a.kind,interactive:a.accepting&&!a.archived&&a.phase==='exhibit'&&['w3-rebuild','w3-personal','w4'].includes(a.kind),items:works.map((w,i)=>({id:w.id,label:named?classroomLabel(authors.filter(m=>m.work_id===w.id))||'作品 '+String(i+1).padStart(2,'0'):'作品 '+String(i+1).padStart(2,'0'),own:w.id===own?.id,canInteract:p.role==='student'&&!!own&&w.class_name===p.student.class_name,currentVersionId:w.current_version_id,versions:versions.filter(v=>v.work_id===w.id),comments:comments.filter(c=>c.target_work_id===w.id).map(c=>({...c,actor_work_id:undefined,label:c.actor_work_id===own?.id?'我／本組':'同學'})),votes:votes.filter(v=>v.target_work_id===w.id).length,liked:votes.some(v=>v.target_work_id===w.id&&v.actor_work_id===own?.id)})).filter(w=>w.versions.length)};
 }
 async wallContext(p,input,db=this.db){
  demand(p.role==='student',403,'請使用學生帳號。');const w=await this.work(p,input.workId,{db}),a=await this.activity(p,w.activity_id,db);
  demand(a.accepting&&!a.archived&&a.phase==='exhibit'&&['w3-rebuild','w3-personal','w4'].includes(a.kind),403,'老師尚未開放班內交流。');
  demand(!!p.student.is_test===!!a.legacy?.testOnly&&w.class_name===p.student.class_name,403,'請在同班課堂交流。');
  const own=await one(db,"select w.id from rib.works w join rib.members m on m.work_id=w.id where w.activity_id=$1 and m.student_id=$2 and m.status='confirmed'",[a.id,p.studentId]);demand(own,403,'請先建立自己的作品或由代表加入小組。');
  demand(await one(db,'select id from rib.versions where work_id=$1',[w.id]),409,'作品尚未交件。');return {w,a,own};
 }
 async wallComment(p,input){return this.db.transaction(async db=>{
  const {w,a,own}=await this.wallContext(p,input,db),body=text(input.body,240),requestId=text(input.requestId,160);
  await db.query('select id from rib.works where id=$1 for update',[own.id]);
  const old=await one(db,'select body from rib.wall_comments where actor_work_id=$1 and request_id=$2',[own.id,requestId]);if(old){demand(old.body===body,409,'重送內容不同。');return {saved:true};}
  const count=await one(db,'select count(*)::int as n from rib.wall_comments where actor_work_id=$1 and target_work_id=$2',[own.id,w.id]);demand(count.n<10,409,'本組在這份作品的留言已達十則。');
  await db.query('insert into rib.wall_comments(id,activity_id,target_work_id,actor_work_id,body,request_id) values($1,$2,$3,$4,$5,$6)',[uid(),a.id,w.id,own.id,body,requestId]);await this.event(db,p,a.id,'wall-comment',w.id);return {saved:true};});}
 async wallVote(p,input){return this.db.transaction(async db=>{const {w,a,own}=await this.wallContext(p,input,db);demand(a.kind==='w3-rebuild'&&own.id!==w.id,403,'欣賞票只留給其他小組的文字重建作品。');demand(typeof input.active==='boolean',400,'請重新選擇。');await db.query('insert into rib.wall_votes(activity_id,actor_work_id,target_work_id,active) values($1,$2,$3,$4) on conflict(actor_work_id,target_work_id) do update set active=excluded.active',[a.id,own.id,w.id,input.active]);await this.event(db,p,a.id,'wall-vote',w.id);return {saved:true};});}
 async moderateComment(p,input){demand(p.role!=='student',403,'請使用教師帳號。');const c=await one(this.db,'select * from rib.wall_comments where id=$1',[String(input.commentId)]);demand(c,404,'找不到留言。');const w=await this.work(p,c.target_work_id);teacherScope(p,w.term,w.class_name);demand(typeof input.hidden==='boolean',400,'請選擇留言狀態。');await this.db.query('update rib.wall_comments set hidden=$1 where id=$2',[input.hidden,c.id]);await this.event(this.db,p,w.activity_id,'moderate-comment',c.id,{hidden:input.hidden});return {saved:true};}
 async markCurrent(p,input){return this.db.transaction(async db=>{
  await db.query('select id from rib.works where id=$1 for update',[String(input.workId)]);const w=await this.work(p,input.workId,{write:true,db});demand(p.role==='student'&&w.kind==='w15-deck',403,'請在自己的公共說明作品選用版本。');demand(w.revision===input.expectedRevision,409,'組員已更新，請重新核對。');
  demand(await one(db,'select id from rib.versions where id=$1 and work_id=$2',[String(input.versionId),w.id]),400,'只能沿用本組既有版本。');await db.query('update rib.works set current_version_id=$1,revision=revision+1 where id=$2',[input.versionId,w.id]);await this.event(db,p,w.activity_id,'current-version',w.id,{versionId:input.versionId});return {saved:true};});}
 async paperKeep(p,input){return this.db.transaction(async db=>{const w=await this.work(p,input.workId,{write:true,db});demand(p.role==='student'&&['w7','w7-news'].includes(w.kind),403,'請在本人的 W7 作品操作。');await db.query('select id from rib.works where id=$1 for update',[w.id]);const v=await one(db,'select id from rib.versions where work_id=$1 order by ordinal desc limit 1',[w.id]);demand(v&&v.id===input.versionId,409,'請先保存並核對版本。');const old=await one(db,"select id from rib.decisions where work_id=$1 and version_id=$2 and choice='keep'",[w.id,v.id]);if(!old)await db.query("insert into rib.decisions(id,work_id,student_id,choice,reason,version_id) values($1,$2,$3,'keep','保留依據記在歷程本。',$4)",[uid(),w.id,p.studentId,v.id]);await this.event(db,p,w.activity_id,'paper-keep',w.id);return {saved:true};});}
 async selections(p,input={}){
  demand(p.role==='student',403,'請使用本人帳號。');const rows=await this.db.query(`select v.id,v.ordinal,v.metadata,a.week,a.title,w.id as work_id from rib.versions v join rib.works w on w.id=v.work_id join rib.activities a on a.id=w.activity_id join rib.members m on m.work_id=w.id where m.term=$1 and m.student_id=$2 and m.status='confirmed' and not w.hidden and coalesce((a.legacy->>'testOnly')::boolean,false)=$3 order by a.week,w.id,v.ordinal`,[p.term,p.studentId,!!p.student.is_test]);
  const s=await one(this.db,'select * from rib.selections where term=$1 and student_id=$2',[p.term,p.studentId]);return {term:p.term,candidates:rows,selected:s?.version_ids||[],revision:s?.revision||0,readOnly:await currentTerm(this.db)!==p.term};
 }
 async selectionSave(p,input){return this.db.transaction(async db=>{
  await db.query('select id from rib.workspace_state where id=1 for share');demand(p.role==='student'&&await currentTerm(db)===p.term,403,'請在目前學期選件。');
  await db.query('select student_id from rib.students where term=$1 and student_id=$2 for update',[p.term,p.studentId]);const s=await this.selections(p),ids=input.versionIds;
  demand(Array.isArray(ids)&&ids.length<=3&&new Set(ids).size===ids.length&&ids.every(id=>s.candidates.some(v=>v.id===id)),400,'可自願選零至三份自己的既有版本。');demand(s.revision===input.expectedRevision,409,'選件已更新，請重新載入。');
  await db.query('insert into rib.selections(term,student_id,version_ids) values($1,$2,$3) on conflict(term,student_id) do update set version_ids=excluded.version_ids,revision=rib.selections.revision+1,updated_at=now()',[p.term,p.studentId,json(ids)]);
  await db.query('update rib.publications set featured=false where version_id=any($1::text[])',[s.selected.filter(id=>!ids.includes(id))]);await this.event(db,p,null,'selection',p.studentId,{count:ids.length});return {saved:true};});}
 async selectionTeacher(p,input){demand(p.role!=='student',403,'請使用教師帳號。');const term=String(input.term||await currentTerm(this.db));if(p.role!=='admin')demand(p.teacher.scopes.some(s=>s.term===term),403,'沒有此學期權限。');const rows=await this.db.query(`select p.id as publication_id,p.status,p.featured,p.reviewed_by,v.id as version_id,v.ordinal,a.title,a.week,w.class_name,w.id as work_id from rib.versions v join rib.works w on w.id=v.work_id join rib.activities a on a.id=w.activity_id left join rib.publications p on p.version_id=v.id where a.term=$1 and coalesce((a.legacy->>'testOnly')::boolean,false)=$2 and exists(select 1 from rib.selections s where s.term=a.term and s.version_ids ? v.id) order by w.class_name,a.week,v.id`,[term,input.testOnly==='true']);return {term,items:rows.filter(r=>p.role==='admin'||p.teacher.scopes.some(s=>s.term===term&&s.className===r.class_name))};}
 async selectionFeature(p,input){demand(p.role!=='student',403,'請使用教師帳號。');const pub=await one(this.db,`select p.*,v.work_id from rib.publications p join rib.versions v on v.id=p.version_id where p.id=$1`,[String(input.publicationId)]);demand(pub,404,'找不到作品。');const w=await this.work(p,pub.work_id);teacherScope(p,w.term,w.class_name);demand(typeof input.featured==='boolean',400,'請選擇精選狀態。');
  if(input.featured){demand(pub.reviewed_by,409,'請先逐張檢查匿名展示內容。');demand(await one(this.db,`select p.id from ${publicFrom} where p.id=$1 and ${publicWhere} and exists(select 1 from rib.selections s where s.term=a.term and s.version_ids ? v.id)`,[pub.id]),409,'須由作者自願選件且目前可公開，才能列入精選。');}
  await this.db.query('update rib.publications set featured=$1 where id=$2',[input.featured,pub.id]);await this.event(this.db,p,w.activity_id,'selection-feature',pub.id,{featured:input.featured});return {saved:true};
 }
 async original(p,input){const a=await this.activity(p,input.activityId);demand(a.kind==='w3-rebuild',400,'本活動沒有教師原圖。');if(p.role!=='student')demand(p.role==='admin'||p.teacher.scopes.some(s=>s.term===a.term),403,'沒有此學期權限。');else demand(!!p.student.is_test===!!a.legacy?.testOnly,403,'請進入自己的活動。');const r=await one(this.db,'select media from rib.activity_assets where activity_id=$1 and completed order by created_at desc,id desc limit 1',[a.id]);return {images:r?await Promise.all(r.media.map(m=>this.store.signRead(m.fullKey))):[]};}
 async referencePrepare(p,input){const a=await this.activity(p,input.activityId);demand(p.role==='admin'&&a.kind==='w3-rebuild'&&!a.archived,403,'請由管理教師設定本期文字重建原圖。');const f=input.file;demand(f&&f.bytes>0&&f.bytes<=MAX_IMAGE&&['image/jpeg','image/png','image/webp'].includes(f.mime)&&/^[a-f0-9]{64}$/.test(f.sha256),400,'請選 8 MB 以內的 JPG、PNG 或 WebP。');const requestId=text(input.requestId,160);let r=await one(this.db,'select * from rib.activity_assets where activity_id=$1 and request_id=$2',[a.id,requestId]);if(r){demand(r.actor===p.email&&r.file.sha256===f.sha256,409,'重送內容不同。');if(r.completed)return {saved:true};demand(new Date(r.created_at).getTime()>Date.now()-1800000,409,'上傳已到期。');}else{const assetId=uid(),file={...f,key:'incoming/'+assetId+'/original'};r=await one(this.db,'insert into rib.activity_assets(id,activity_id,actor,request_id,file) values($1,$2,$3,$4,$5) returning *',[assetId,a.id,p.email,requestId,json(file)]);}return {ticketId:r.id,url:await this.store.signUpload(r.file.key,r.file.mime)};}
 async referenceFinalize(p,input){const r=await one(this.db,'select * from rib.activity_assets where id=$1',[String(input.ticketId)]);demand(r&&r.actor===p.email&&p.role==='admin',403,'請由上傳原圖的教師保存。');const a=await this.activity(p,r.activity_id);demand(!a.archived,403,'此學期已封存。');if(r.completed)return {saved:true};demand(new Date(r.created_at).getTime()>Date.now()-1800000,409,'上傳已到期。');const m=await commitImage(this.store,r.file,'references/'+r.id+'/'+uid());await this.db.query('update rib.activity_assets set media=$1,completed=true where id=$2 and not completed',[json([m]),r.id]);await this.event(this.db,p,a.id,'reference',r.id);return {saved:true};}
}
