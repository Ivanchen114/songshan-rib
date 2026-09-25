import {AiJudgment} from './ai-judgment.mjs';
import {demand,json,sha,teacherScope} from './security.mjs';
import {classroomLabel} from './classroom-audience.mjs';
const one=async(db,q,args)=>(await db.query(q,args))[0];
function answers(input,required){
 const out={};for(const k of ['o','r','id']){demand(typeof input?.[k]==='string'&&input[k].length<=800,400,'每題請在 800 字內。');out[k]=input[k].trim();if(required)demand(out[k],400,'請完成 O、R、I＋D 三問；沒有特別感受也可以如實寫。');}return out;
}
export class Reflection extends AiJudgment{
 async reflection(p,input){
  const w=await this.work(p,input.workId);
  demand(w.kind==='w5-personal'&&(p.role!=='student'||w.own),403,'請回自己的 W5 作品寫反思。');
  const referenceVersionId=input.referenceVersionId||w.reflection?.referenceVersionId;
  let reference=null;
  if(referenceVersionId){
   const v=await one(this.db,'select id,work_id,ordinal from rib.versions where id=$1',[String(referenceVersionId)]);
   demand(v&&v.work_id!==w.id,400,'請引用另一位同學的作品。');
   // Saved reflections remain readable when a cited work is later hidden/closed.
   try{const target=await this.work(p,v.work_id);demand(target.activity_id===w.activity_id&&target.topic===w.topic,400,'請選同一活動、同一題的作品。');
    const members=await this.db.query("select s.name,s.class_name from rib.members m join rib.students s using(term,student_id) where m.work_id=$1 and m.status='confirmed' order by s.seat",[target.id]);
    reference={versionId:v.id,workId:v.work_id,ordinal:v.ordinal,label:classroomLabel(members)};
   }catch(e){if(input.referenceVersionId||!w.reflection)throw e;reference={unavailable:true,label:'參考作品（目前不開放）'};}
  }
  return {workId:w.id,versionId:w.current_version_id,reflection:w.reflection,reference,editable:p.role==='student'&&w.accepting&&!w.archived&&w.phase==='exhibit'};
 }
 async saveReflection(p,input){
  demand(p.role==='student',403,'反思由作品本人填寫。');
  demand(['draft','submitted'].includes(input.status),400,'請選草稿或送出。');
  const value=answers(input.answers,input.status==='submitted');
  demand(typeof input.allowPublic==='boolean'&&typeof input.requestId==='string'&&input.requestId.length>0&&input.requestId.length<=160,400,'請重新開啟反思表單。');
  const digest=sha(json({value,status:input.status,reference:input.referenceVersionId,version:input.versionId,allowPublic:input.allowPublic}));
  return this.db.transaction(async db=>{
   await db.query('select id from rib.works where id=$1 for update',[String(input.workId)]);
   const w=await this.work(p,input.workId,{write:true,db});
   demand(w.kind==='w5-personal'&&w.phase==='exhibit'&&!!p.student.is_test===!!w.test_only,403,'請等老師開放 W5 課程展廳。');
   if(w.reflection?.requestId===input.requestId){demand(w.reflection.digest===digest,409,'重送內容不同，請重新核對。');return {saved:true,revision:w.reflection.revision};}
   demand((w.reflection?.revision||0)===input.expectedRevision,409,'反思已在另一個視窗更新，請保留文字並重新開啟核對。');
   demand(w.current_version_id&&w.current_version_id===input.versionId,409,'自己的作品版本已更新，請重新開啟反思。');
   const v=await one(db,'select id,work_id from rib.versions where id=$1',[String(input.referenceVersionId||'')]);
   demand(v&&v.work_id!==w.id,400,'先到同題展廳引用一件同學作品。');
   const target=await this.work(p,v.work_id,{db});
   demand(target.activity_id===w.activity_id&&target.topic===w.topic,400,'請選同一活動、同一題的作品。');
   const reflection={answers:value,status:input.status,referenceVersionId:v.id,referenceWorkId:v.work_id,versionId:w.current_version_id,allowPublic:input.allowPublic,revision:(w.reflection?.revision||0)+1,requestId:input.requestId,digest,updatedAt:new Date().toISOString()};
   await db.query('update rib.works set reflection=$2 where id=$1',[w.id,json(reflection)]);
   // Changing any text withdraws its reviewed public copy, never the original image.
   await db.query('update rib.publications set reflection=null where version_id in(select id from rib.versions where work_id=$1)',[w.id]);
   await this.event(db,p,w.activity_id,'orid-reflection',w.id,reflection);
   return {saved:true,revision:reflection.revision};
  });
 }
 async reviewReflection(p,input){
  demand(p.role!=='student',403,'請由授課教師檢查對外展示。');
  return this.db.transaction(async db=>{
   await db.query('select id from rib.works where id=$1 for update',[String(input.workId)]);
   const w=await this.work(p,input.workId,{db});teacherScope(p,w.term,w.class_name);
   const r=w.reflection;demand(r&&r.status==='submitted'&&r.allowPublic&&r.revision===input.expectedRevision,409,'反思已更新或作者未同意公開，請重新核對。');
   demand(w.current_version_id===r.versionId&&input.reviewed===true,409,'請檢查目前作品版本及匿名反思。');
   const clean={answers:answers(input.answers,true),referenceLabel:'參考作品 A',reviewedRevision:r.revision};
   // Snapshot is deliberately limited to reviewed prose and an anonymous local label.
   await db.query('update rib.publications set reflection=$2 where version_id=$1',[r.versionId,json(clean)]);
   await this.event(db,p,w.activity_id,'orid-public-review',w.id,{revision:r.revision,publicCopy:clean});
   return {saved:true};
  });
 }
}
