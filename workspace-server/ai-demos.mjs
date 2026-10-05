import {demand,teacherScope,json,sha} from './security.mjs';
import {demoCatalog} from './demo-catalog.mjs';
export const demoOptions=r=>r?.choices|| (r?[r]:[]);
export const demoReference=r=>`${r.id} / DEMO-${r.code} ${r.version}`;
export async function demoPlan(service,p,input,db=service.db){
 demand(p.role!=='student',403,'請使用教師帳號。');
 const a=await service.activity(p,input.activityId,db);teacherScope(p,a.term,input.className);
 demand(a.kind==='w5-personal'&&!a.archived,400,'請選擇未封存的 W5 個人活動。');
 const students=await db.query(`select s.student_id,s.name,s.seat,s.class_name,
 exists(select 1 from rib.works w join rib.activities wa on wa.id=w.activity_id join rib.versions v on v.work_id=w.id join rib.ai_readings r on r.version_id=v.id
 where wa.term=s.term and wa.kind='w4' and not wa.archived and not w.hidden and coalesce((wa.legacy->>'testOnly')::boolean,false)=$3 and w.owner_id=s.student_id
 and r.status='published' and btrim(r.comment_a)<>'' and btrim(r.comment_b)<>''
 and exists(select 1 from rib.members m where m.work_id=w.id and m.student_id=s.student_id and m.term=s.term and m.status='confirmed')) as has_pair,
 exists(select 1 from rib.ai_judgments j where j.activity_id=$4 and j.term=s.term and j.student_id=s.student_id) as has_response,
 exists(select 1 from rib.works w join rib.activities wa on wa.id=w.activity_id join rib.versions v on v.work_id=w.id where wa.term=s.term and wa.kind='w4' and not wa.archived and coalesce((wa.legacy->>'testOnly')::boolean,false)=$3 and w.owner_id=s.student_id and jsonb_array_length(v.media)>0) as has_upload,
 (select r.task_note from rib.works w join rib.activities wa on wa.id=w.activity_id join rib.versions v on v.work_id=w.id join rib.ai_readings r on r.version_id=v.id
 where wa.term=s.term and wa.kind='w4' and not wa.archived and not w.hidden and coalesce((wa.legacy->>'testOnly')::boolean,false)=$3 and w.owner_id=s.student_id and r.status='published' and r.task_note<>''
 and exists(select 1 from rib.members m where m.work_id=w.id and m.student_id=s.student_id and m.term=s.term and m.status='confirmed') order by r.created_at desc limit 1) as task_note
 from rib.students s where s.term=$1 and s.class_name=$2 and s.active and s.is_test=$3 order by s.seat`,[a.term,input.className,!!a.legacy?.testOnly,a.id]);
 const existing=a.legacy?.w5DemoAssignments||{};
 const missing=students.filter(s=>!s.has_pair&&!demoOptions(existing[s.student_id]).some(c=>c.id&&c.commentA?.trim()&&c.commentB?.trim()));
 const reason=s=>s.task_note?'原圖目前只有提醒，沒有可用甲乙。':s.has_upload?'已有上傳紀錄，但尚無可讀且已發布的完整甲乙。':'尚未上傳 W4 圖卡，也沒有可用甲乙。';
 const candidates=missing.filter(s=>!s.has_response&&!existing[s.student_id]).map(s=>({...s,reason:reason(s)}));
 const needsReview=missing.filter(s=>s.has_response||existing[s.student_id]).map(s=>({...s,reason:'已有作答或分派紀錄，但目前沒有可用材料；請教師核對，系統不自動換題。'}));
 const coverage={total:students.length,covered:students.length-missing.length,missing:missing.length};
 return {activityId:a.id,term:a.term,className:input.className,candidates,needsReview,coverage,alreadyAssigned:students.filter(s=>existing[s.student_id]).length,token:sha(json({id:a.id,candidates,needsReview,existing}))};
}
export async function assignDemos(service,p,input){
 return service.db.transaction(async db=>{
  await db.query('select id from rib.activities where id=$1 for update',[input.activityId]);
  const plan=await demoPlan(service,p,input,db);
  demand(plan.token===input.token,409,'名單或分派已更新，請重新預覽。');
  const a=await service.activity(p,input.activityId,db),assignments={...(a.legacy?.w5DemoAssignments||{})};
  for(const s of plan.candidates){const assignedAt=new Date().toISOString();
   const taskNote=`${s.reason}${s.task_note?' 原圖提醒：'+s.task_note:''} 請先查看 A、B、C 三份範例，再自選一份完成 W5 判讀，不用三份都做。這是示範圖卡與 AI 模擬留言，不是對你作品的評語；完成判讀不代表補交或修正 W4，也不能替代真人初讀。原作品請依老師提醒處理。`;
   assignments[s.student_id]={selectionMode:'choose-one',assignedAt,assignedBy:p.email,choices:demoCatalog.map(c=>({...c,id:`demo-${a.id}-${s.student_id}-${c.code}`,studentId:s.student_id,assignedAt,assignedBy:p.email,taskNote}))};
  }
  if(plan.candidates.length){await db.query("update rib.activities set legacy=jsonb_set(coalesce(legacy,'{}'::jsonb),'{w5DemoAssignments}',$2::jsonb),revision=revision+1 where id=$1",[a.id,json(assignments)]);await service.event(db,p,a.id,'w5-demo-assigned',input.className,{students:plan.candidates.map(s=>s.student_id),choices:demoCatalog.map(c=>c.code)});}
  return {assigned:plan.candidates.length,alreadyAssigned:plan.alreadyAssigned};
 });
}
export async function demoList(service,p,a,className){
 if(a.kind!=='w5-personal')return [];
 if(p.role!=='student')teacherScope(p,a.term,className);
 const roster=await service.db.query('select student_id,seat from rib.students where term=$1 and class_name=$2 and active and is_test=$3',[a.term,p.role==='student'?p.student.class_name:className,!!a.legacy?.testOnly]);
 return roster.filter(s=>p.role!=='student'||s.student_id===p.studentId).flatMap(s=>{const r=a.legacy?.w5DemoAssignments?.[s.student_id];return demoOptions(r).map(c=>({id:c.id,seat:s.seat,status:'published',has_pair:true,isDemo:true,label:`示範 ${c.code}｜${c.title}`,sourceReference:demoReference(c)}));});
}
export async function demoDetail(service,p,id){
 const [row]=await service.db.query(`select a.id as activity_id,d.key as student_id,c.value as card from rib.activities a cross join lateral jsonb_each(coalesce(a.legacy->'w5DemoAssignments','{}'::jsonb)) d cross join lateral jsonb_array_elements(case when jsonb_typeof(d.value->'choices')='array' then d.value->'choices' else jsonb_build_array(d.value) end) c where c.value->>'id'=$1`,[id]);
 demand(row,404,'找不到這份示範練習。');
 const a=await service.activity(p,row.activity_id),[s]=await service.db.query('select * from rib.students where term=$1 and student_id=$2',[a.term,row.student_id]);
 demand(s&&s.active&&s.is_test===!!a.legacy?.testOnly,403,'目前無法查看這份練習。');
 if(p.role==='student')demand(p.studentId===row.student_id,403,'只能查看分派給自己的示範。');else teacherScope(p,a.term,s.class_name);
 const r=row.card;
 return {id:r.id,isDemo:true,label:`示範 ${r.code}｜${r.title}`,sourceReference:demoReference(r),commentA:r.commentA,commentB:r.commentB,imageUrl:await service.store.signRead(r.imageKey),taskNote:r.taskNote||'這是老師提供的示範練習，不是你的個人作品。完成判讀不代表補交 W4，也不能替代真人初讀；原作品仍須補交。',studentRecord:null,recordLocked:false,...(p.role==='student'?{}:{teacherNotes:r.teacherNotes})};
}
