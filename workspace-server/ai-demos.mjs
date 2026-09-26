import {demand,teacherScope,json,sha} from './security.mjs';
import {demoCatalog} from './demo-catalog.mjs';
export const demoReference=r=>`${r.id} / DEMO-${r.code} ${r.version}`;
export async function demoPlan(service,p,input,db=service.db){
 demand(p.role!=='student',403,'請使用教師帳號。');
 const a=await service.activity(p,input.activityId,db);teacherScope(p,a.term,input.className);
 demand(a.kind==='w5-personal'&&!a.archived,400,'請選擇未封存的 W5 個人活動。');
 const students=await db.query(`select s.student_id,s.name,s.seat,s.class_name from rib.students s where s.term=$1 and s.class_name=$2 and s.active and s.is_test=$3 and not exists(
 select 1 from rib.works w join rib.activities wa on wa.id=w.activity_id join rib.versions v on v.work_id=w.id
 where wa.term=s.term and wa.kind='w4' and not wa.archived and coalesce((wa.legacy->>'testOnly')::boolean,false)=$3 and w.owner_id=s.student_id and jsonb_array_length(v.media)>0) order by s.seat`,[a.term,input.className,!!a.legacy?.testOnly]);
 const existing=a.legacy?.w5DemoAssignments||{};
 const counts=Object.fromEntries(demoCatalog.map(c=>[c.code,Object.values(existing).filter(x=>x.code===c.code).length]));
 const candidates=students.filter(s=>!existing[s.student_id]).map(s=>{const c=[...demoCatalog].sort((x,y)=>counts[x.code]-counts[y.code]||x.code.localeCompare(y.code))[0];counts[c.code]++;return {...s,code:c.code,title:c.title};});
 return {activityId:a.id,term:a.term,className:input.className,candidates,alreadyAssigned:students.length-candidates.length,token:sha(json({id:a.id,candidates,existing}))};
}
export async function assignDemos(service,p,input){
 return service.db.transaction(async db=>{
  await db.query('select id from rib.activities where id=$1 for update',[input.activityId]);
  const plan=await demoPlan(service,p,input,db);
  demand(plan.token===input.token,409,'名單或分派已更新，請重新預覽。');
  const a=await service.activity(p,input.activityId,db),assignments={...(a.legacy?.w5DemoAssignments||{})};
  for(const s of plan.candidates){const c=demoCatalog.find(x=>x.code===s.code);assignments[s.student_id]={...c,id:`demo-${a.id}-${s.student_id}`,studentId:s.student_id,assignedAt:new Date().toISOString(),assignedBy:p.email};}
  if(plan.candidates.length){await db.query("update rib.activities set legacy=jsonb_set(coalesce(legacy,'{}'::jsonb),'{w5DemoAssignments}',$2::jsonb),revision=revision+1 where id=$1",[a.id,json(assignments)]);await service.event(db,p,a.id,'w5-demo-assigned',input.className,{students:plan.candidates.map(s=>s.student_id),codes:plan.candidates.map(s=>s.code)});}
  return {assigned:plan.candidates.length,alreadyAssigned:plan.alreadyAssigned};
 });
}
export async function demoList(service,p,a,className){
 if(a.kind!=='w5-personal')return [];
 if(p.role!=='student')teacherScope(p,a.term,className);
 const roster=await service.db.query('select student_id,seat from rib.students where term=$1 and class_name=$2 and active and is_test=$3',[a.term,p.role==='student'?p.student.class_name:className,!!a.legacy?.testOnly]);
 return roster.filter(s=>p.role!=='student'||s.student_id===p.studentId).flatMap(s=>{const r=a.legacy?.w5DemoAssignments?.[s.student_id];return r?[{id:r.id,seat:s.seat,status:'published',has_pair:true,isDemo:true,label:`示範 ${r.code}｜${r.title}`,sourceReference:demoReference(r)}]:[];});
}
export async function demoDetail(service,p,id){
 const [row]=await service.db.query(`select a.id as activity_id,d.key as student_id,d.value as card from rib.activities a cross join lateral jsonb_each(coalesce(a.legacy->'w5DemoAssignments','{}'::jsonb)) d where d.value->>'id'=$1`,[id]);
 demand(row,404,'找不到這份示範練習。');
 const a=await service.activity(p,row.activity_id),[s]=await service.db.query('select * from rib.students where term=$1 and student_id=$2',[a.term,row.student_id]);
 demand(s&&s.active&&s.is_test===!!a.legacy?.testOnly,403,'目前無法查看這份練習。');
 if(p.role==='student')demand(p.studentId===row.student_id,403,'只能查看分派給自己的示範。');else teacherScope(p,a.term,s.class_name);
 const r=row.card;
 return {id:r.id,isDemo:true,label:`示範 ${r.code}｜${r.title}`,sourceReference:demoReference(r),commentA:r.commentA,commentB:r.commentB,imageUrl:await service.store.signRead(r.imageKey),taskNote:'這是老師提供的示範練習，不是你的個人作品。完成判讀不代表補交 W4，也不能替代真人初讀；原作品仍須補交。',studentRecord:null,recordLocked:false,...(p.role==='student'?{}:{teacherNotes:r.teacherNotes})};
}
