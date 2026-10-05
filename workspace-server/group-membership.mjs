import {isDeepStrictEqual} from 'node:util';
import {Journey} from './journey.mjs';
import {ACTIVITY,isLate,isGroup} from '../workspace/activities.js';
import {demand,json} from './security.mjs';
const one=async(db,q,args)=>(await db.query(q,args))[0];
const occupiedMessage='目前已在其他小組（或已自行建立小組）。若分組有誤，請這位同學登入本週活動，按「離開這個小組」，再由正確小組的代表重新加入。';
export class GroupMembership extends Journey {
 async inviteSeats(p,w,seats,db=this.db){
  demand(p.role==='student'&&isGroup(w.kind)&&w.class_name===p.student.class_name&&p.student.is_test===w.test_only,403,'請在自己的同班小組加入組員。');
  demand(Array.isArray(seats)&&seats.length>0&&seats.length<=3&&seats.every(n=>Number.isInteger(n)&&n>0&&n<=999)&&new Set(seats).size===seats.length,400,'請填一至三位不重複的同班座號。');
  const rows=await db.query('select student_id,name,seat from rib.students where term=$1 and class_name=$2 and seat=any($3::int[]) and active and is_test=$4 for share',[w.term,w.class_name,seats,w.test_only]);
  const students=seats.map(seat=>{const found=rows.filter(s=>s.seat===seat);demand(found.length===1,400,`${seat} 號無法唯一對應到可加入的同班同學，請核對座號或洽老師。`);demand(found[0].student_id!==p.studentId,400,'不用加入自己，請只填其他組員的座號。');return found[0];});
  demand(!(await one(db,'select id from rib.versions where work_id=$1',[w.id])),409,'已有共同作品，請老師核對作者後再調整。');
  const count=await one(db,"select count(*)::int as n from rib.members where work_id=$1 and status<>'declined'",[w.id]);demand(count.n+students.length<=(ACTIVITY[w.kind]?.maxMembers||4),400,`每組最多 ${ACTIVITY[w.kind]?.maxMembers||4} 人（含自己）。`);
  const occupied=await one(db,`select m.student_id from rib.members m join rib.works x on x.id=m.work_id where x.activity_id=$1 and m.student_id=any($2::text[]) and m.status in ('confirmed','invited')`,[w.activity_id,students.map(s=>s.student_id)]);
  const who=students.find(s=>s.student_id===occupied?.student_id);demand(!occupied,409,`${who?.seat||''} 號${occupiedMessage}`);
  return students;
 }
 async invitePreview(p,input){const w=await this.work(p,input.workId,{write:true});const students=await this.inviteSeats(p,w,input.seats);return {className:w.class_name,students:students.map(s=>({studentId:s.student_id,name:s.name,seat:s.seat}))};}
 async invite(p,input){
  demand(p.role==='student',403,'請使用學生帳號。');
  const initial=await this.work(p,input.workId,{write:true});
  return this.db.transaction(async db=>{
   await db.query('select id from rib.activities where id=$1 for update',[initial.activity_id]);
   await db.query('select id from rib.works where id=$1 for update',[initial.id]);
   // Recheck membership after the lock: a stale page must not add people after leaving.
   const w=await this.work(p,initial.id,{write:true,db});demand(isGroup(w.kind)&&p.student.is_test===w.test_only,403,'此區不使用小組加入。');
   let ids=input.studentIds;
   if(input.seats!==undefined){demand(ids===undefined,400,'請使用同一種加入方式。');const students=await this.inviteSeats(p,w,input.seats,db);ids=students.map(s=>s.student_id);demand(isDeepStrictEqual(ids,input.expectedStudentIds),409,'座號名單已變更，請重新核對姓名後再加入。');}
   else demand(Array.isArray(ids)&&ids.length>0&&ids.length<=3&&new Set(ids).size===ids.length,400,'請填一至三位不重複的同組學號。');
   demand(!(await one(db,'select id from rib.versions where work_id=$1',[w.id])),409,'已有共同作品，請老師核對作者後再調整。');
   const count=await one(db,"select count(*)::int as n from rib.members where work_id=$1 and status<>'declined'",[w.id]);demand(count.n+ids.length<=(ACTIVITY[w.kind]?.maxMembers||4),400,`每組最多 ${ACTIVITY[w.kind]?.maxMembers||4} 人。`);
   for(const sid of ids){
    demand(/^\d{8}$/.test(sid)&&sid!==p.studentId,400,'請核對組員學號。');const s=await one(db,'select * from rib.students where term=$1 and student_id=$2 and active and is_test=$3 for share',[w.term,sid,w.test_only]);demand(s&&s.class_name===w.class_name,400,'請加入同班有效學生。');
    const occupied=await one(db,`select m.work_id from rib.members m join rib.works x on x.id=m.work_id where x.activity_id=$1 and m.student_id=$2 and m.status in ('confirmed','invited')`,[w.activity_id,sid]);demand(!occupied,409,`${s.seat} 號${occupiedMessage}`);
    if(['w7-news','w8-materials'].includes(w.kind)){const drawn=await one(db,`select old.id from rib.works old join rib.members m on m.work_id=old.id where old.activity_id=$1 and old.id<>$2 and m.student_id=$3 and old.topic is not null and old.topic<>'' limit 1`,[w.activity_id,w.id,sid]);demand(!drawn,409,'這位同學已在另一組抽過題，請老師核對分組；離組不能換題。');}
    // Existing privacy preferences remain unchanged when a student rejoins.
    await db.query(`insert into rib.members(work_id,term,student_id,status) values($1,$2,$3,$4) on conflict(work_id,student_id) do update set status=excluded.status`,[w.id,w.term,sid,isLate(w.kind)?'invited':'confirmed']);
   }
   await this.event(db,p,w.activity_id,'group-join',w.id,{studentIds:ids});return {saved:true,joined:ids.length};
  });
 }
 async invitation(p,input){if(!input.activityId)demand(false,409,'分組已改為代表核對後直接加入；新封存活動請從邀請卡確認。');return this.db.transaction(async db=>{
  demand(p.role==='student'&&typeof input.accept==='boolean',403,'請本人確認小組。');
  await db.query('select id from rib.activities where id=$1 for update',[input.activityId]);
  const a=await this.activity(p,input.activityId,db);demand(isLate(a.kind)&&a.accepting,409,'這個活動目前不接受小組確認。');
  const [w]=await db.query("select w.* from rib.works w join rib.members m on m.work_id=w.id where w.id=$1 and w.activity_id=$2 and m.student_id=$3 and m.status='invited' for update of w",[input.workId,a.id,p.studentId]);
  demand(w&&w.class_name===p.student.class_name&&!!a.legacy?.testOnly===!!p.student.is_test,403,'找不到自己的小組邀請。');
  demand(!(await one(db,'select id from rib.versions where work_id=$1',[w.id])),409,'已有共同成果，請老師核對。');
  await db.query('update rib.members set status=$1 where work_id=$2 and student_id=$3',[input.accept?'confirmed':'declined',w.id,p.studentId]);
  await db.query('update rib.works set revision=revision+1 where id=$1',[w.id]);
  await this.event(db,p,a.id,'author-confirmation',w.id,{accepted:input.accept});return {saved:true};
 });}
 async leaveGroup(p,input){
  demand(p.role==='student',403,'請由學生本人離開小組。');demand(input.confirmed===true,400,'請先確認離開小組的影響。');
  const initial=await this.work(p,input.workId);
  return this.db.transaction(async db=>{
   await db.query('select id from rib.activities where id=$1 for update',[initial.activity_id]);
   await db.query('select id from rib.works where id=$1 for update',[initial.id]);
   const w=await this.work(p,initial.id,{db});demand(isGroup(w.kind)&&w.own&&p.student.is_test===w.test_only,403,'只能離開自己目前的小組。');
   demand(w.revision===input.expectedRevision,409,'作品或小組已更新，請重新整理後再離開。');
   await db.query('select student_id from rib.students where term=$1 and student_id=$2 for update',[p.term,p.studentId]);
   const versions=await db.query('select id from rib.versions where work_id=$1',[w.id]);demand(!isLate(w.kind)||!versions.length,409,'共同成果已交件；原組保留補件責任，分組有誤請老師核對。');
   await db.query("update rib.members set status='declined' where work_id=$1 and student_id=$2 and status='confirmed'",[w.id,p.studentId]);
   await db.query('update rib.works set revision=revision+1,publication_hold=publication_hold or $2 where id=$1',[w.id,versions.length>0]);
   if(versions.length){
    // Do not silently publish previously blocked work when its membership changes.
    await db.query("update rib.publications set status='withdrawn',featured=false where version_id=any($1::text[])",[versions.map(v=>v.id)]);
    const selected=await one(db,'select version_ids from rib.selections where term=$1 and student_id=$2 for update',[p.term,p.studentId]);
    if(selected){const ids=selected.version_ids.filter(id=>!versions.some(v=>v.id===id));await db.query('update rib.selections set version_ids=$1,revision=revision+1 where term=$2 and student_id=$3',[json(ids),p.term,p.studentId]);}
   }
   await this.event(db,p,w.activity_id,'group-leave',w.id,{studentId:p.studentId,hadVersions:versions.length>0,publicationHeld:versions.length>0});
   return {saved:true,keptVersions:versions.length};
  });
 }
}
