import {ACTIVITY,isGroup,supportedKind} from '../workspace/activities.js';
import {Weekly,submissionMetadata} from './weekly.mjs';
import {SHARING_AGREEMENT,AGREEMENT_VERSION,AGREEMENT_HASH,hasAgreement} from './agreement.mjs';
import {isDeepStrictEqual} from 'node:util';
import {autoPublish,galleryList,galleryDetail} from './publication.mjs';
import {planReaders} from './reader-allocation.mjs';
import {TermManager,activityWrites,guardActivityWrite,currentTerm} from './terms.mjs';
import {uid,sha,demand,text,json,matches,verifier,rate,createSession,teacherScope} from './security.mjs';
import {MAX_IMAGE,commitImage} from './storage.mjs';
const id = value => {demand(typeof value==='string'&&/^[a-zA-Z0-9:_-]{1,160}$/.test(value),400,'項目識別不正確。');return value;};
const actor = p => p.role==='student'?p.term+':'+p.studentId:p.email;
const one = async(db,q,args) => (await db.query(q,args))[0];
export class Workspace extends Weekly {
  constructor(db,store){super();this.db=db;this.store=store;}
  async event(db,p,a,kind,resource,detail={}){await db.query('insert into rib.events(activity_id,actor,kind,resource,detail) values($1,$2,$3,$4,$5)',[a,actor(p),kind,resource,json(detail)]);}
  async login(input,ip) {
    const {term,studentId,code}=input;
    demand(/^\d{3}0[12]$/.test(term)&&/^\d{8}$/.test(studentId)&&/^\d{6}$/.test(code),400,'請核對學期、八碼學號與六碼。');
    await rate(this.db,'ip:'+ip,60,900);await rate(this.db,'login:'+term+':'+studentId,8,900);
    const c=await one(this.db,`select c.*,s.is_test from rib.credentials c join rib.students s using(term,student_id) where c.term=$1 and c.student_id=$2 and s.active`,[term,studentId]);
    demand(c&&await matches(code,c),401,'學期、學號或六碼不正確。');
    demand(process.env.RIB_ACCEPTANCE_ONLY!=='true'||c.is_test,403,'驗收站目前只開放測試學生帳號，正式上課請使用原入口。');
    // Upgrade on successful login, retaining the exact same user-facing six digits.
    if(c.algorithm==='gas-sha256') {const v=await verifier(code);await this.db.query(`update rib.credentials set algorithm=$1,salt=$2,digest=$3 where term=$4 and student_id=$5 and revision=$6 and digest=$7`,[v.algorithm,v.salt,v.digest,term,studentId,c.revision,c.digest]);}
    return createSession(this.db,{role:'student',term,studentId,revision:c.revision},input.remember===true);
  }
  async activity(p,activityId,db=this.db) {
    const a=await one(db,'select * from rib.activities where id=$1',[id(activityId)]);demand(a,404,'找不到活動。');
    if(p.role==='student'){demand(a.term===p.term&&!a.archived,403,'這不是目前可使用的學期。');demand(!a.legacy?.testOnly||p.student.is_test,403,'此活動只供測試帳號驗收。');}return a;
  }
  async work(p,workId,{write=false,db=this.db,grading=false}={}) {
    const w=await one(db,`select w.*,a.term,a.week,a.kind,a.phase,a.accepting,a.archived,coalesce((a.legacy->>'testOnly')::boolean,false) as test_only from rib.works w join rib.activities a on a.id=w.activity_id where w.id=$1`,[id(workId)]);
    demand(w,404,'找不到作品。');
    if(p.role!=='student'){teacherScope(p,w.term,w.class_name,grading);return w;}
    demand(p.term===w.term&&!w.archived&&!w.hidden&&(!w.test_only||p.student.is_test),403,'目前無法查看這份作品。');
    const own=await one(db,`select * from rib.members where work_id=$1 and student_id=$2 and status='confirmed'`,[w.id,p.studentId]);
    if(write){demand(own&&w.accepting,403,'目前不能保存這份作品。');return {...w,own:true};}
    const review=await one(db,`select * from rib.reviews where target_work_id=$1 and reviewer_id=$2 and term=$3 and status in ('assigned','done')`,[w.id,p.studentId,p.term]);
    const hasTest=await one(db,`select 1 from rib.members m join rib.students s using(term,student_id) where m.work_id=$1 and s.is_test`,[w.id]);
    demand(own||(!hasTest||w.test_only)&&((review&&w.phase==='review')||(w.phase==='exhibit'&&w.class_name===p.student.class_name)),403,'請查看自己的作品或指定試讀作品。');
    return {...w,own:!!own,review};
  }
  async agreement(p,input){
    demand(p.role==='student',403,'這是學生的展示設定。');demand(input.accepted===true&&input.version===AGREEMENT_VERSION,400,'請閱讀並勾選目前的匿名展示說明。');
    return this.db.transaction(async db=>{
      await db.query('select id from rib.workspace_state where id=1 for share');
      const [student]=await db.query('select * from rib.students where term=$1 and student_id=$2 for update',[p.term,p.studentId]);
      demand(student?.active,403,'此學生帳號目前未啟用。');
      if(!hasAgreement(student)){const record={version:AGREEMENT_VERSION,documentHash:AGREEMENT_HASH,acceptedAt:new Date().toISOString()};await db.query('update rib.students set sharing_agreement=$1 where term=$2 and student_id=$3',[json(record),p.term,p.studentId]);await this.event(db,p,null,'sharing-agreement',p.studentId,{...record,document:SHARING_AGREEMENT});}
      return {saved:true};
    });
  }
  async home(p) {
    const agreementRequired=p.role==='student'&&!hasAgreement(p.student);
    let activities=await this.db.query("select id,term,week,title,kind,phase,accepting,archived,revision,coalesce((legacy->>'testOnly')::boolean,false) as test_only from rib.activities order by term desc,week");
    if(p.role==='student')activities=activities.filter(a=>a.term===p.term&&!a.archived&&(!a.test_only||p.student.is_test));
    else if(p.role!=='admin')activities=activities.filter(a=>p.teacher.scopes.some(s=>s.term===a.term));
    return {person:p.role==='student'?{role:p.role,name:p.student.name,className:p.student.class_name,seat:p.student.seat,studentId:p.studentId,isTest:p.student.is_test}:{role:p.role,name:p.teacher.name},activities:agreementRequired?[]:activities,agreementRequired,sharingAgreement:p.role==='student'?SHARING_AGREEMENT:null,currentTerm:await currentTerm(this.db)};
  }
  async board(p,input) {
    const a=await this.activity(p,input.activityId);let works,reviews;
    if(p.role==='student'){
      works=await this.db.query(`select w.* from rib.works w join rib.members m on m.work_id=w.id where w.activity_id=$1 and m.student_id=$2 and m.status='confirmed' and not w.hidden`,[a.id,p.studentId]);
      reviews=await this.db.query(`select id,target_work_id,version_id,status,revision,reason from rib.reviews where activity_id=$1 and reviewer_id=$2 and term=$3 and status<>'cancelled' order by created_at`,[a.id,p.studentId,p.term]);
    }else{
      const cls=text(input.className,20);teacherScope(p,a.term,cls);
      works=await this.db.query('select * from rib.works where activity_id=$1 and class_name=$2 order by created_at',[a.id,cls]);
      reviews=await this.db.query(`select r.* from rib.reviews r join rib.works w on w.id=r.target_work_id where r.activity_id=$1 and w.class_name=$2 and r.status<>'cancelled'`,[a.id,cls]);
    }
    // Six bounded queries for the whole class, rather than six additional requests per work.
    const workIds=works.map(w=>w.id);
    const [versions,feedback,decisions,members,publications,grades]=await Promise.all([
      this.db.query('select id,work_id,ordinal,created_at,metadata from rib.versions where work_id=any($1::text[]) order by ordinal',[workIds]),
      this.db.query("select id,target_work_id,version_id,situation,meaning,submitted_at from rib.reviews where target_work_id=any($1::text[]) and status='done'",[workIds]),
      this.db.query('select * from rib.decisions where work_id=any($1::text[]) order by created_at',[workIds]),
      this.db.query('select m.work_id,m.student_id,m.status,m.consent,s.name,s.seat,m.sharing_opt_out from rib.members m join rib.students s using(term,student_id) where m.work_id=any($1::text[]) order by s.seat',[workIds]),
      this.db.query('select p.id,p.status,p.version_id,p.reviewed_by,p.reviewed_at,v.work_id from rib.publications p join rib.versions v on v.id=p.version_id where v.work_id=any($1::text[])',[workIds]),
      this.db.query(`select * from rib.assessments where work_id=any($1::text[]) ${p.role==='student'?"and student_id=$2 and status='graded'":''}`,p.role==='student'?[workIds,p.studentId]:[workIds])]);
    const items=works.map(w=>({...w,versions:versions.filter(v=>v.work_id===w.id),feedback:feedback.filter(r=>r.target_work_id===w.id),decisions:decisions.filter(d=>d.work_id===w.id),members:members.filter(m=>m.work_id===w.id),publications:publications.filter(v=>v.work_id===w.id),grades:grades.filter(g=>g.work_id===w.id)}));
    const invitations=p.role==='student'?await this.db.query(`select w.id from rib.members m join rib.works w on w.id=m.work_id where w.activity_id=$1 and m.student_id=$2 and m.status='invited'`,[a.id,p.studentId]):[];
    return {activity:{id:a.id,title:a.title,kind:a.kind,phase:a.phase,revision:a.revision,accepting:a.accepting,archived:a.archived,week:a.week,testOnly:a.legacy?.testOnly===true},works:items,reviews,invitations};
  }
  async ensureWork(p,input) {
    demand(p.role==='student',403,'請使用學生帳號。');const a=await this.activity(p,input.activityId);demand(supportedKind(a.kind),409,'此歷史活動僅供查閱。');demand(a.accepting&&!a.archived,403,'老師尚未開放交件。');demand(!!p.student.is_test===!!a.legacy?.testOnly,403,'測試帳號請使用測試活動，正式帳號請使用課堂活動。');
    return this.db.transaction(async db=>{
      await db.query('select id from rib.activities where id=$1 for update',[a.id]);
      const existing=await one(db,`select w.* from rib.works w join rib.members m on m.work_id=w.id where w.activity_id=$1 and m.student_id=$2 and m.status in ('confirmed','invited')`,[a.id,p.studentId]);
      if(existing)return existing;
      const workId=uid();await db.query(`insert into rib.works(id,activity_id,class_name,owner_id) values($1,$2,$3,$4)`,[workId,a.id,p.student.class_name,isGroup(a.kind)?null:p.studentId]);
      await db.query(`insert into rib.members(work_id,term,student_id,status) values($1,$2,$3,'confirmed')`,[workId,p.term,p.studentId]);
      return {id:workId,revision:0};
    });
  }
  async inviteSeats(p,w,seats,db=this.db) {
    demand(p.role==='student'&&isGroup(w.kind)&&w.class_name===p.student.class_name&&p.student.is_test===w.test_only,403,'請在自己的同班小組邀請。');
    demand(Array.isArray(seats)&&seats.length>0&&seats.length<=3&&seats.every(n=>Number.isInteger(n)&&n>0&&n<=999)&&new Set(seats).size===seats.length,400,'請填一至三位不重複的同班座號。');
    const rows=await db.query('select student_id,name,seat from rib.students where term=$1 and class_name=$2 and seat=any($3::int[]) and active and is_test=$4 for share',[w.term,w.class_name,seats,w.test_only]);
    const students=seats.map(seat=>{const found=rows.filter(s=>s.seat===seat);demand(found.length===1,400,`${seat} 號無法唯一對應到可邀請的同班同學，請核對座號或洽老師。`);demand(found[0].student_id!==p.studentId,400,'不用邀請自己，請只填其他組員的座號。');return found[0];});
    demand(!(await one(db,'select id from rib.versions where work_id=$1',[w.id])),409,'已有共同作品，請老師核對作者後再調整。');
    const count=await one(db,"select count(*)::int as n from rib.members where work_id=$1 and status<>'declined'",[w.id]);demand(count.n+students.length<=4,400,'每組最多四人（含自己）。');
    const occupied=await one(db,`select m.student_id from rib.members m join rib.works x on x.id=m.work_id where x.activity_id=$1 and m.student_id=any($2::text[]) and m.status in ('confirmed','invited')`,[w.activity_id,students.map(s=>s.student_id)]);
    demand(!occupied,409,'選擇的同學已有小組或待確認邀請，請重新核對。');
    return students;
  }
  async invitePreview(p,input) {
    const w=await this.work(p,input.workId,{write:true});
    const students=await this.inviteSeats(p,w,input.seats);
    return {className:w.class_name,students:students.map(s=>({studentId:s.student_id,name:s.name,seat:s.seat}))};
  }
  async invite(p,input) {
    const w=await this.work(p,input.workId,{write:true});demand(p.role==='student'&&isGroup(w.kind)&&p.student.is_test===w.test_only,403,'此區不使用小組邀請。');
    let ids=input.studentIds;if(input.seats===undefined)demand(Array.isArray(ids)&&ids.length>0&&ids.length<=3&&new Set(ids).size===ids.length,400,'請填一至三位不重複的同組學號。');
    return this.db.transaction(async db=>{
      await db.query('select id from rib.activities where id=$1 for update',[w.activity_id]);
      await db.query('select id from rib.works where id=$1 for update',[w.id]);
      if(input.seats!==undefined){demand(input.studentIds===undefined,400,'請使用同一種邀請方式。');const students=await this.inviteSeats(p,w,input.seats,db);ids=students.map(s=>s.student_id);demand(isDeepStrictEqual(ids,input.expectedStudentIds),409,'座號名單已變更，請重新核對姓名後再邀請。');}
      demand(!(await one(db,'select id from rib.versions where work_id=$1',[w.id])),409,'已有共同作品，請老師核對作者後再調整。');
      const count=await one(db,"select count(*)::int as n from rib.members where work_id=$1 and status<>'declined'",[w.id]);demand(count.n+ids.length<=4,400,'每組最多四人。');
      for(const sid of ids){demand(/^\d{8}$/.test(sid)&&sid!==p.studentId,400,'請核對組員學號。');const s=await one(db,'select * from rib.students where term=$1 and student_id=$2 and active and is_test=$3',[w.term,sid,w.test_only]);demand(s&&s.class_name===w.class_name,400,'請邀請同班有效學生。');
        const occupied=await one(db,`select m.work_id from rib.members m join rib.works x on x.id=m.work_id where x.activity_id=$1 and m.student_id=$2 and m.status in ('confirmed','invited')`,[w.activity_id,sid]);demand(!occupied,409,'這位同學已有小組或待確認邀請。');
        await db.query(`insert into rib.members(work_id,term,student_id,status) values($1,$2,$3,'invited') on conflict(work_id,student_id) do update set status='invited'`,[w.id,w.term,sid]);}
      await this.event(db,p,w.activity_id,'invite',w.id,{studentIds:ids});return {saved:true};
    });
  }
  async invitation(p,input){demand(p.role==='student',403,'請使用學生帳號。');const a=await this.activity(p,input.activityId);demand(a.accepting,403,'目前暫停分組。');const choice=input.accept===true?'confirmed':'declined';
    const rows=await this.db.query(`update rib.members set status=$1 where work_id=$2 and term=$3 and student_id=$4 and status='invited' and exists(select 1 from rib.works where id=$2 and activity_id=$5) returning work_id`,[choice,id(input.workId),p.term,p.studentId,a.id]);demand(rows.length,409,'邀請已更新，請重新整理。');await this.event(this.db,p,a.id,'invitation',input.workId,{choice});return {saved:true};}
  async prepare(p,input) {
    demand(p.role==='student',403,'請使用學生交件入口。');const w=await this.work(p,input.workId,{write:true});
    demand(supportedKind(w.kind),409,'此歷史活動目前僅供查閱，請沿用原入口交件。');
    const previous=await this.db.query('select id,ordinal,metadata from rib.versions where work_id=$1 order by ordinal',[w.id]);const extra=submissionMetadata(w.kind,input,previous);const files=input.files;
    for(const f of files)demand(Number.isInteger(f.bytes)&&f.bytes>0&&f.bytes<=MAX_IMAGE&&/^[a-f0-9]{64}$/.test(f.sha256)&&['image/jpeg','image/png','image/webp'].includes(f.mime),400,'圖片需為 JPG、PNG 或 WebP，每張最多 8 MB。');
    const [student]=await this.db.query('select sharing_agreement from rib.students where term=$1 and student_id=$2',[p.term,p.studentId]);demand(hasAgreement(student),403,'請先閱讀登入後的匿名展示說明。');const metadata={publicDisplay:true,sharingAgreementVersion:AGREEMENT_VERSION,...extra};if(w.kind==='w5-workshop'){demand(/^A0[2-5]$/.test(input.topics?.[0])&&/^B(?:0[2356789]|10)$/.test(input.topics?.[1]),400,'請選 A、B 區各一題。');metadata.topics=input.topics;}
    const requestId=id(input.requestId);
    let ticket=await one(this.db,'select * from rib.uploads where work_id=$1 and request_id=$2',[w.id,requestId]);
    if(ticket){demand(ticket.actor===actor(p)&&ticket.files.length===files.length&&ticket.files.every((f,i)=>f.bytes===files[i].bytes&&f.mime===files[i].mime&&f.sha256===files[i].sha256)&&isDeepStrictEqual(ticket.metadata,metadata),409,'重送內容不同，請重新選圖。');if(ticket.version_id)return {versionId:ticket.version_id};demand(new Date(ticket.expires_at)>new Date(),409,'上傳已到期，請重新選圖。');}
    else {await rate(this.db,'upload:'+actor(p),24,3600);demand(input.expectedRevision===w.revision,409,'作品已有新版本，請先重新整理。');const ticketId=uid();ticket={id:ticketId,files:files.map((f,i)=>({...f,key:`incoming/${ticketId}/${i}`}))};
      await this.db.query(`insert into rib.uploads(id,work_id,actor,request_id,expected_revision,files,metadata,expires_at) values($1,$2,$3,$4,$5,$6,$7,now()+interval '30 minutes')`,[ticket.id,w.id,actor(p),requestId,w.revision,json(ticket.files),json(metadata)]);}
    return {ticketId:ticket.id,files:await Promise.all(ticket.files.map(async f=>({url:await this.store.signUpload(f.key,f.mime),mime:f.mime})))};
  }
  async finalize(p,input) {
    const ticket=await one(this.db,'select * from rib.uploads where id=$1',[id(input.ticketId)]);demand(ticket&&ticket.actor===actor(p),404,'找不到這次上傳。');
    const w=await this.work(p,ticket.work_id,{write:true});if(ticket.version_id)return {versionId:ticket.version_id};demand(new Date(ticket.expires_at)>new Date(),409,'上傳已到期，請重新選圖。');
    const attempt=uid(),media=[];for(let i=0;i<ticket.files.length;i++)media.push(await commitImage(this.store,ticket.files[i],`works/${w.id}/${attempt}/${i}`));
    return this.db.transaction(async db=>{
      await db.query('select id from rib.works where id=$1 for update',[w.id]);
      const current=await this.work(p,w.id,{write:true,db});
      const t=await one(db,'select * from rib.uploads where id=$1',[ticket.id]);if(t.version_id)return {versionId:t.version_id};
      demand(current.revision===ticket.expected_revision,409,'作品已有新版本，請先核對。已上傳圖片暫存保留。');
      demand(!(await one(db,"select student_id from rib.members where work_id=$1 and status='invited'",[w.id])),409,'請先讓同組同學確認加入。');
      const versions=await db.query('select * from rib.versions where work_id=$1 order by ordinal',[w.id]);
      if(w.kind==='w4'&&versions.length){demand(versions.length<2&&['review','exhibit'].includes(current.phase),409,'這份圖卡已有 V2，或尚未開放改留。');demand(await one(db,"select id from rib.reviews where target_work_id=$1 and status='done'",[w.id]),409,'請先取得真人回饋，再保存 V2。');demand(typeof input.reason==='string'&&input.reason.trim(),400,'請說明修改依據。');}
      demand(versions.length<ACTIVITY[w.kind].maxVersions,409,'本週版本已保存完成。');
      const versionId=uid(),ordinal=versions.length?Math.max(...versions.map(v=>v.ordinal))+1:1;
      await db.query('insert into rib.versions(id,work_id,ordinal,media,metadata,request_id) values($1,$2,$3,$4,$5,$6)',[versionId,w.id,ordinal,json(media),json(ticket.metadata),ticket.request_id]);
      await db.query('update rib.works set revision=revision+1,current_version_id=$2 where id=$1',[w.id,versionId]);await db.query('update rib.uploads set version_id=$1 where id=$2',[versionId,ticket.id]);
      await db.query("update rib.reviews set version_id=$1,status='assigned',revision=revision+1 where target_work_id=$2 and status='waiting'",[versionId,w.id]);
      if(w.kind==='w7'&&ordinal===2)await db.query("insert into rib.decisions(id,work_id,student_id,choice,reason,version_id) values($1,$2,$3,'revise','修改依據記在歷程本。',$4)",[uid(),w.id,p.studentId,versionId]);
      if(w.kind==='w4'&&ordinal===2)await db.query("insert into rib.decisions(id,work_id,student_id,choice,reason,version_id) values($1,$2,$3,'revise',$4,$5)",[uid(),w.id,p.studentId,text(input.reason),versionId]);
      await db.query('insert into rib.publications(id,version_id) values($1,$2)',[uid(),versionId]);await autoPublish(db,w.id);await this.event(db,p,w.activity_id,'submission',versionId);return {versionId};
    });
  }
  async media(p,input) {
    const v=await one(this.db,'select * from rib.versions where id=$1',[id(input.versionId)]);demand(v,404,'找不到版本。');const w=await this.work(p,v.work_id);
    if(p.role==='student'&&!w.own&&w.phase!=='exhibit')demand(w.review?.version_id===v.id,403,'請查看指定的初讀版本。');
    const images=[];for(const m of v.media){demand(m.fullKey,409,'此媒體尚未完成搬遷，請使用原入口。');images.push({url:await this.store.signRead(input.size==='thumb'?m.thumbKey:m.fullKey)});}
    const projectUrl=v.metadata.legacyProjectKey&&(p.role!=='student'||w.own)?await this.store.signRead(v.metadata.legacyProjectKey):null;
    const contextImages=[];if(w.kind==='w7'&&v.ordinal===2){const first=await one(this.db,'select media from rib.versions where work_id=$1 and ordinal=1',[w.id]);for(const m of first?.media||[])contextImages.push({url:await this.store.signRead(m.fullKey)});}
    return {images,contextImages,ordinal:v.ordinal,metadata:{...v.metadata,legacyProjectKey:undefined},projectUrl};
  }
  async dispatch(p,input) {
    const a=await this.activity(p,input.activityId);const cls=text(input.className,20);teacherScope(p,a.term,cls);demand(a.kind==='w4'&&!a.archived,409,'目前不能分派。');
    return this.db.transaction(async db=>{
      const current=await one(db,'select * from rib.activities where id=$1 for update',[a.id]);demand(current.revision===input.expectedRevision,409,'分派已更新，請重新整理。');
      const students=await db.query('select * from rib.students where term=$1 and class_name=$2 and active and is_test=$3 order by seat',[a.term,cls,a.legacy?.testOnly===true]);
      const absent=Array.isArray(input.absentIds)?input.absentIds:[];demand(absent.every(s=>students.some(x=>x.student_id===s)),400,'缺席名單不正確。');const present=students.filter(s=>!absent.includes(s.student_id));
      for(const student of present){await db.query('insert into rib.works(id,activity_id,class_name,owner_id) values($1,$2,$3,$4) on conflict(activity_id,owner_id) do nothing',[uid(),a.id,cls,student.student_id]);const w=await one(db,'select id from rib.works where activity_id=$1 and owner_id=$2',[a.id,student.student_id]);await db.query("insert into rib.members(work_id,term,student_id,status) values($1,$2,$3,'confirmed') on conflict do nothing",[w.id,a.term,student.student_id]);}
      // Match the upload lock order, so a just-finished V1 cannot be left waiting.
      const works=await db.query('select * from rib.works where activity_id=$1 and class_name=$2 and not hidden order by id for update',[a.id,cls]);
      const reviews=await db.query('select r.* from rib.reviews r join rib.works w on w.id=r.target_work_id where r.activity_id=$1 and w.class_name=$2 for update of r',[a.id,cls]);
      const firstVersions=new Map((await db.query('select v.work_id,v.id from rib.versions v join rib.works w on w.id=v.work_id where w.activity_id=$1 and w.class_name=$2 and v.ordinal=1',[a.id,cls])).map(v=>[v.work_id,v.id]));
      const plan=planReaders(students,works,reviews,firstVersions,absent);let replaced=0;
      for(const [workId,reader] of plan.matches){
        for(const r of plan.releasing.filter(r=>r.target_work_id===workId)){await db.query("update rib.reviews set status='cancelled',revision=revision+1 where id=$1",[r.id]);replaced++;}
        const versionId=firstVersions.get(workId);await db.query('insert into rib.reviews(id,activity_id,target_work_id,reviewer_id,term,version_id,status) values($1,$2,$3,$4,$5,$6,$7)',[uid(),a.id,workId,reader,a.term,versionId||null,versionId?'assigned':'waiting']);
      }
      await db.query('update rib.activities set revision=revision+1 where id=$1',[a.id]);await this.event(db,p,a.id,'dispatch',a.id,{className:cls,added:plan.matches.size,extra:plan.extra,replaced,waiting:plan.unmatched.length});return {added:plan.matches.size,extra:plan.extra,replaced,waiting:plan.unmatched.length,unmatched:plan.unmatched};
    });
  }
  async review(p,input) {
    demand(p.role==='student',403,'請使用學生帳號。');
    return this.db.transaction(async db=>{const lookup=await one(db,'select target_work_id from rib.reviews where id=$1',[id(input.reviewId)]);demand(lookup,404,'找不到試讀任務。');await db.query('select id from rib.works where id=$1 for update',[lookup.target_work_id]);const r=await one(db,'select * from rib.reviews where id=$1 for update',[id(input.reviewId)]);demand(r&&r.reviewer_id===p.studentId&&r.term===p.term,403,'這不是你的試讀任務。');
      const a=await this.activity(p,r.activity_id,db);demand(!p.student.is_test||a.legacy?.testOnly,403,'測試帳號不能參與正式初讀。');demand(a.accepting&&['review','exhibit'].includes(a.phase),409,'目前已暫停初讀。');
      const situation=text(input.situation),meaning=text(input.meaning);
      if(r.status==='done'){demand(r.situation===situation&&r.meaning===meaning,409,'這份初讀已送出，不能覆蓋原紀錄。');return {saved:true};}
      demand(r.status==='assigned'&&r.revision===input.expectedRevision,409,'任務已更新，請重新整理。');
      await db.query("update rib.reviews set situation=$1,meaning=$2,status='done',revision=revision+1,submitted_at=now() where id=$3",[situation,meaning,r.id]);await this.event(db,p,a.id,'feedback',r.target_work_id);return {saved:true};});
  }
  async requestReplacement(p,input){demand(p.role==='student',403,'請使用學生帳號。');const rows=await this.db.query("update rib.reviews set status='requested',reason=$1,revision=revision+1 where id=$2 and reviewer_id=$3 and term=$4 and status in ('waiting','assigned') returning activity_id",[text(input.reason,200),id(input.reviewId),p.studentId,p.term]);demand(rows.length,409,'任務已完成或已更新。');await this.event(this.db,p,rows[0].activity_id,'replacement-request',input.reviewId);return {saved:true};}
  async testFeedback(p,input){
    demand(p.role==='admin',403,'請使用管理教師帳號。');
    const w=await this.work(p,input.workId);demand(w.test_only&&w.kind==='w4',403,'只有隔離測試活動可產生示範回饋。');
    const r=await one(this.db,"select * from rib.reviews where target_work_id=$1 and status='assigned'",[w.id]);demand(r,409,'請先完成配對並上傳測試圖卡。');
    const student=await one(this.db,'select * from rib.students where term=$1 and student_id=$2 and active and is_test',[w.term,r.reviewer_id]);demand(student,403,'示範讀者必須是測試帳號。');
    await this.review({role:'student',studentId:student.student_id,term:student.term,student},{reviewId:r.id,expectedRevision:r.revision,situation:'【系統測試回饋】這是用來測試保存與回覆的示範文字，不代表真人判讀。',meaning:'【系統測試回饋】請用作者帳號回覆，再測試有理由保留或另存 V2。'});
    await this.event(this.db,p,w.activity_id,'synthetic-test-feedback',r.id);return {saved:true};
  }
  async replace(p,input){return this.db.transaction(async db=>{const lookup=await one(db,'select activity_id,target_work_id from rib.reviews where id=$1',[id(input.reviewId)]);demand(lookup,404,'找不到分派。');await db.query('select id from rib.activities where id=$1 for update',[lookup.activity_id]);await db.query('select id from rib.works where id=$1 for update',[lookup.target_work_id]);const r=await one(db,'select * from rib.reviews where id=$1 for update',[id(input.reviewId)]);demand(r,404,'找不到分派。');const w=await this.work(p,r.target_work_id,{db});teacherScope(p,w.term,w.class_name);demand(['assigned','waiting','requested'].includes(r.status),409,'已完成的回饋保留，不重抽。');
    const s=await one(db,'select * from rib.students where term=$1 and student_id=$2 and active and is_test=$3',[w.term,input.studentId,w.test_only]);demand(s&&s.class_name===w.class_name&&s.student_id!==w.owner_id&&s.student_id!==r.reviewer_id,400,'請選其他同班讀者。');
    demand(!(await one(db,"select id from rib.reviews where target_work_id=$1 and reviewer_id=$2",[w.id,s.student_id])),400,'這位讀者已有此作品的試讀紀錄。');
    const busy=await db.query("select status from rib.reviews where activity_id=$1 and reviewer_id=$2 and status<>'cancelled'",[w.activity_id,s.student_id]);demand(!busy.some(x=>x.status!=='done'),409,'這位讀者仍有待完成任務。');demand(!busy.length||input.confirmExtra===true,400,'請確認已安排這位同學補位。');
    await db.query("update rib.reviews set status='cancelled',revision=revision+1 where id=$1",[r.id]);await db.query('insert into rib.reviews(id,activity_id,target_work_id,reviewer_id,term,version_id,status) values($1,$2,$3,$4,$5,$6,$7)',[uid(),w.activity_id,w.id,s.student_id,w.term,r.version_id,r.version_id?'assigned':'waiting']);await this.event(db,p,w.activity_id,'replace-reader',w.id);return {saved:true};});}
  async assignReader(p,input){return this.db.transaction(async db=>{
    const w=await this.work(p,input.workId,{db});teacherScope(p,w.term,w.class_name);demand(w.kind==='w4'&&!w.archived,409,'目前不能分派。');
    await db.query('select id from rib.activities where id=$1 for update',[w.activity_id]);await db.query('select id from rib.works where id=$1 for update',[w.id]);
    demand(!(await one(db,"select id from rib.reviews where target_work_id=$1 and status<>'cancelled'",[w.id])),409,'此作品已有讀者，請使用換讀者。');
    const reader=await one(db,'select * from rib.students where term=$1 and student_id=$2 and active and is_test=$3',[w.term,input.studentId,w.test_only]);demand(reader&&reader.class_name===w.class_name&&reader.student_id!==w.owner_id,400,'請選其他同班讀者。');
    const previous=await db.query('select * from rib.reviews where activity_id=$1 and reviewer_id=$2',[w.activity_id,reader.student_id]);demand(!previous.some(r=>r.target_work_id===w.id),409,'這位讀者曾看過此作品，請選另一位。');demand(!previous.some(r=>!['done','cancelled'].includes(r.status)),409,'這位讀者仍有待完成任務。');demand(!previous.some(r=>r.status==='done')||input.confirmExtra===true,400,'請確認已安排這位同學補位。');
    const version=await one(db,'select id from rib.versions where work_id=$1 and ordinal=1',[w.id]);await db.query('insert into rib.reviews(id,activity_id,target_work_id,reviewer_id,term,version_id,status) values($1,$2,$3,$4,$5,$6,$7)',[uid(),w.activity_id,w.id,reader.student_id,w.term,version?.id||null,version?'assigned':'waiting']);await this.event(db,p,w.activity_id,'assign-reader',w.id);return {saved:true};});}
  async conversation(p,input,db=this.db){const review=await one(db,'select * from rib.reviews where id=$1',[id(input.reviewId)]);demand(review&&review.status==='done',404,'初讀完成後才開放對話。');const w=await this.work(p,review.target_work_id,{db});demand(p.role!=='student'||w.own||review.reviewer_id===p.studentId&&review.term===p.term,403,'只有作者與指定讀者能參與。');
    const replies=await db.query('select id,label,body,created_at from rib.replies where review_id=$1 order by created_at,id',[review.id]);return {review:{id:review.id,situation:review.situation,meaning:review.meaning},replies,work:w};}
  async reply(p,input){return this.db.transaction(async db=>{
    const c=await this.conversation(p,input,db);demand(c.work.accepting,403,'目前暫停回覆。');const label=p.role!=='student'?'teacher':c.work.own?'author':'reader',body=text(input.body),requestId=id(input.requestId);
    const old=await one(db,'select body from rib.replies where review_id=$1 and actor=$2 and request_id=$3',[c.review.id,actor(p),requestId]);if(old){demand(old.body===body,409,'重送內容不同，請重新開啟對話。');return {saved:true};}
    await db.query('insert into rib.replies(id,review_id,actor,label,body,request_id) values($1,$2,$3,$4,$5,$6)',[uid(),c.review.id,actor(p),label,body,requestId]);await this.event(db,p,c.work.activity_id,'reply',c.review.id);return {saved:true};});}
  async decision(p,input){return this.db.transaction(async db=>{
    await db.query('select id from rib.works where id=$1 for update',[id(input.workId)]);
    const w=await this.work(p,input.workId,{write:true,db});demand(p.role==='student'&&w.kind==='w4'&&['review','exhibit'].includes(w.phase),403,'請在初讀或展示階段回應自己的圖卡。');
    demand(await one(db,"select id from rib.reviews where target_work_id=$1 and status='done'",[w.id]),409,'請先取得真人初讀。');
    const v=await one(db,'select * from rib.versions where work_id=$1 order by ordinal desc limit 1',[w.id]);demand(v&&input.versionId===v.id,409,'版本已更新，請先核對。');const reason=text(input.reason);
    const last=await one(db,'select * from rib.decisions where work_id=$1 and student_id=$2 order by created_at desc limit 1',[w.id,p.studentId]);
    if(last?.choice==='keep'&&last.version_id===v.id&&last.reason===reason)return {saved:true};
    await db.query("insert into rib.decisions(id,work_id,student_id,choice,reason,version_id) values($1,$2,$3,'keep',$4,$5)",[uid(),w.id,p.studentId,reason,v.id]);await this.event(db,p,w.activity_id,'decision',w.id);return {saved:true};});}
  async archive(p,input){demand(p.role==='admin',403,'完整搬遷封存僅管理教師可查閱。');
    if(!input.table)return {tables:await this.db.query("select source_table,count(*)::int as count from rib.legacy_records where source_table like 'logical:%' group by source_table order by source_table")};
    demand(typeof input.table==='string'&&/^logical:[A-Za-z]+$/.test(input.table),400,'請選資料表。');
    const offset=Number(input.offset||0);demand(Number.isInteger(offset)&&offset>=0&&offset<=100000,400,'頁碼不正確。');
    const records=await this.db.query('select source_id,source_hash,payload from rib.legacy_records where source_table=$1 order by source_id limit 30 offset $2',[input.table,offset]);return {records,next:records.length===30?offset+30:null};}
  async classes(p,input){demand(p.role!=='student',403,'請使用教師帳號。');const a=await this.activity(p,input.activityId);const rows=await this.db.query('select distinct class_name from rib.students where term=$1 and is_test=$2 order by class_name',[a.term,a.legacy?.testOnly===true]);return {classes:rows.map(r=>r.class_name).filter(c=>p.role==='admin'||p.teacher.scopes.some(s=>s.term===a.term&&s.className===c))};}
  async roster(p,input){const a=await this.activity(p,input.activityId);teacherScope(p,a.term,input.className);return {students:await this.db.query('select student_id,name,seat,is_test,active from rib.students where term=$1 and class_name=$2 order by seat',[a.term,input.className])};}
  async control(p,input){const a=await this.activity(p,input.activityId);demand(p.role==='admin',403,'全活動開關由管理教師操作。');demand(input.accepting!==true||supportedKind(a.kind),409,'此歷史模式尚未開放新流程，請使用原入口。');demand(['production','review','exhibit'].includes(input.phase),400,'請選有效階段。');demand(process.env.RIB_ACCEPTANCE_ONLY!=='true'||a.legacy?.testOnly||input.accepting!==true,403,'驗收期間只能開放測試活動，原活動保持查閱。');
    const rows=await this.db.query('update rib.activities set phase=$1,accepting=$2,revision=revision+1 where id=$3 and revision=$4 returning id',[input.phase,input.accepting===true,a.id,input.expectedRevision]);demand(rows.length,409,'設定已更新，請重新整理。');await this.event(this.db,p,a.id,'control',a.id,{phase:input.phase,accepting:input.accepting});return {saved:true};}
  async consent(p,input){return this.db.transaction(async db=>{
    await db.query('select id from rib.works where id=$1 for update',[id(input.workId)]);
    const w=await this.work(p,input.workId,{db});demand(p.role==='student'&&w.own,403,'只有本人能設定展示意願。');
    demand(typeof input.consent==='boolean',400,'請選擇是否公開。');await db.query('update rib.members set sharing_opt_out=$1,consent=$2 where work_id=$3 and student_id=$4',[input.consent===false,input.consent===true,w.id,p.studentId]);
    if(input.consent===true)await autoPublish(db,w.id);
    if(input.consent!==true)await db.query("update rib.publications set status='withdrawn' where version_id in(select id from rib.versions where work_id=$1)",[w.id]);
    await this.event(db,p,w.activity_id,'consent',w.id,{consent:input.consent===true});return {saved:true};});}
  async publish(p,input){return this.db.transaction(async db=>{
    const pub=await one(db,'select p.*,v.work_id,v.media from rib.publications p join rib.versions v on v.id=p.version_id where p.id=$1',[id(input.publicationId)]);demand(pub,404,'找不到展示版本。');
    await db.query('select id from rib.works where id=$1 for update',[pub.work_id]);
    const w=await this.work(p,pub.work_id,{db});teacherScope(p,w.term,w.class_name);demand(!w.hidden,409,'此作品已隱藏。');
    if(input.publish===true){demand(process.env.RIB_ACCEPTANCE_ONLY!=='true',403,'驗收站不向外公開學生作品。');demand(input.reviewed===true,400,'請先逐張檢查作品內容與個資。');demand(pub.media.length&&pub.media.every(m=>m.displayHash&&m.fullKey&&m.thumbKey),409,'舊圖片需先完成去除中繼資料及展示圖轉換。');const m=await db.query("select m.*,s.is_test,s.sharing_agreement from rib.members m join rib.students s using(term,student_id) where work_id=$1 and m.status<>'declined'",[w.id]);demand(m.length&&m.every(x=>x.status==='confirmed'&&!x.sharing_opt_out&&hasAgreement(x)&&!x.is_test),409,'作者尚未完成登入說明、已選擇不公開，或屬測試帳號。');}
    if(input.publish===true){await db.query('update rib.works set publication_hold=false where id=$1',[w.id]);await db.query("update rib.publications set status='withdrawn' where version_id in(select id from rib.versions where work_id=$1) and id<>$2 and status='published'",[w.id,pub.id]);}
    else{await db.query('update rib.works set publication_hold=true where id=$1',[w.id]);await db.query("update rib.publications set status='withdrawn' where version_id in(select id from rib.versions where work_id=$1)",[w.id]);}
    await db.query('update rib.publications set status=$1,title=$2,reviewed_by=$3,reviewed_at=now() where id=$4',[input.publish===true?'published':'withdrawn',text(input.title||'匿名作品',80),p.email,pub.id]);await this.event(db,p,w.activity_id,'publication',pub.id,{publish:input.publish===true});return {saved:true};});}
  async gallery(input={}){return galleryList(this.db,this.store,input);}
  async galleryItem(input){return galleryDetail(this.db,this.store,input);}
  async evidence(workId,db=this.db){const versions=await db.query('select id,media from rib.versions where work_id=$1 order by ordinal',[workId]);const reviews=await db.query("select id,revision from rib.reviews where target_work_id=$1 and status='done' order by id",[workId]);const decisions=await db.query('select id from rib.decisions where work_id=$1 order by created_at',[workId]);return sha(json({versions,reviews,decisions}));}
  async assess(p,input){const w=await this.work(p,input.workId,{grading:true});demand(p.role!=='student'&&w.kind==='w4',403,'此區不另評分。');const criteria=input.criteria;demand(Array.isArray(criteria)&&criteria.length===4&&criteria.every(x=>x===null||Number.isInteger(x)&&x>=0&&x<=3),400,'四項規準各為 0–3 分或尚未評定。');demand(['draft','needs-evidence','graded'].includes(input.status),400,'評閱狀態不正確。');demand(input.status==='draft'||typeof input.comment==='string'&&input.comment.trim(),400,'請填寫評閱依據或補件說明。');demand(input.status!=='graded'||criteria.every(x=>x!==null)&&input.evidenceReviewed===true,400,'正式判分前，請確認已合看兩週本人證據。');
    const member=await one(this.db,"select student_id from rib.members where work_id=$1 and student_id=$2 and status='confirmed'",[w.id,input.studentId]);demand(member,400,'這位學生不是作品作者。');
    return this.db.transaction(async db=>{await db.query('select id from rib.works where id=$1 for update',[w.id]);demand(input.evidenceKey===await this.evidence(w.id,db),409,'作品或回饋已更新，請先重新核對。');const old=await one(db,"select revision from rib.assessments where work_id=$1 and student_id=$2 and rubric='w45-v104'",[w.id,input.studentId]);demand((old?.revision||0)===input.expectedRevision,409,'另一位老師已更新評閱。');await db.query(`insert into rib.assessments(work_id,student_id,rubric,criteria,comment,status,evidence_key,teacher,revision) values($1,$2,'w45-v104',$3,$4,$5,$6,$7,1) on conflict(work_id,student_id,rubric) do update set legacy_score=null,legacy_max=null,legacy_payload=null,criteria=excluded.criteria,comment=excluded.comment,status=excluded.status,evidence_key=excluded.evidence_key,teacher=excluded.teacher,revision=rib.assessments.revision+1,updated_at=now()`,[w.id,input.studentId,json(criteria),String(input.comment||'').slice(0,2000),input.status,input.evidenceKey,p.email]);await this.event(db,p,w.activity_id,'assessment',w.id,{studentId:input.studentId,status:input.status});return {saved:true};});}
}

// Shared transaction lock lets uploads/reviews finish before activation, then blocks stale writes.
for(const name of activityWrites){const original=Workspace.prototype[name];Workspace.prototype[name]=async function(p,input){
 if(this.termWriteLocked)return original.call(this,p,input);
 return this.db.transaction(async db=>{await db.query('select id from rib.workspace_state where id=1 for share');await guardActivityWrite(db,name,input);const service=new Workspace(db,this.store);service.termWriteLocked=true;return original.call(service,p,input);});
};}
