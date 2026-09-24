import {TopicSelection} from './topic-selection.mjs';
import {demand,teacherScope,json} from './security.mjs';

const limits={sourceReference:160,comment:'',quote:1200,color:'',evidence:1600,rewritten:1600};
const choices={comment:['甲','乙'],color:['yellow','red']};
export class AiJudgment extends TopicSelection {
 async aiJudgments(p,input){
  const a=await this.activity(p,input.activityId);
  demand(a.kind==='w5-personal',400,'請從 W5 個人活動開啟判讀。');
  if(p.role==='student'){
   demand(!input.studentId||input.studentId===p.studentId,403,'只能查看自己的判讀。');
   demand(!!p.student.is_test===!!a.legacy?.testOnly,403,'請使用自己的課堂活動。');
  }else teacherScope(p,a.term,input.className);
  const rows=await this.db.query(`select j.*,s.name,s.seat,s.class_name from rib.ai_judgments j join rib.students s using(term,student_id) where j.activity_id=$1 and ${p.role==='student'?'j.student_id=$2':'s.class_name=$2'} order by s.seat`,[a.id,p.role==='student'?p.studentId:input.className]);
  return {responses:rows};
 }
 async saveAiJudgment(p,input){
  demand(p.role==='student',403,'判讀由學生本人填寫。');
  demand(!input.studentId||input.studentId===p.studentId,403,'只能保存自己的判讀。');
  demand(['draft','submitted'].includes(input.status),400,'請選擇保存草稿或送出判讀。');
  const answers={};
  for(const [key,max] of Object.entries(limits)){
   const value=input.answers?.[key];
   demand(typeof value==='string'&&value.length<=(max||30),400,'請核對判讀內容與文字長度。');
   answers[key]=value.trim();
   demand(!choices[key]||value===''||choices[key].includes(value),400,'請核對判讀選項。');
   if(input.status==='submitted')demand(answers[key],400,'送出前請完成圖卡編號／版本、判讀及改寫。');
  }
  return this.db.transaction(async db=>{
   await db.query('select id from rib.activities where id=$1 for update',[input.activityId]);
   const a=await this.activity(p,input.activityId,db);
   demand(a.kind==='w5-personal'&&a.accepting&&!a.archived,403,'老師尚未開放 W5 保存。');
   demand(!!p.student.is_test===!!a.legacy?.testOnly,403,'請使用自己的課堂活動。');
   // Serialize with W4 grading: an edited judgment must invalidate an open assessment.
   await db.query(`select w.id from rib.works w join rib.activities a on a.id=w.activity_id where a.term=$1 and a.kind='w4' and w.owner_id=$2 order by w.id for update of w`,[p.term,p.studentId]);
   const [old]=await db.query('select * from rib.ai_judgments where activity_id=$1 and student_id=$2',[a.id,p.studentId]);
   demand((old?.revision||0)===input.expectedRevision,409,'判讀已在另一個視窗更新。請保留目前文字，關閉後重新開啟核對。');
   await db.query(`insert into rib.ai_judgments(activity_id,term,student_id,answers,status,revision) values($1,$2,$3,$4,$5,1) on conflict(activity_id,student_id) do update set answers=excluded.answers,status=excluded.status,revision=rib.ai_judgments.revision+1,updated_at=now()`,[a.id,p.term,p.studentId,json(answers),input.status]);
   await this.event(db,p,a.id,'ai-judgment',p.studentId,{revision:(old?.revision||0)+1,status:input.status,answers});
   return {saved:true,revision:(old?.revision||0)+1};
  });
 }
 async judgmentsForWork(workId,db=this.db){
  return db.query(`select j.activity_id,j.answers,j.status,j.revision,j.updated_at from rib.works w join rib.activities wa on wa.id=w.activity_id join rib.ai_judgments j on j.term=wa.term and j.student_id=w.owner_id join rib.activities a on a.id=j.activity_id where w.id=$1 and wa.kind='w4' and coalesce((a.legacy->>'testOnly')::boolean,false)=coalesce((wa.legacy->>'testOnly')::boolean,false) order by j.updated_at`,[workId]);
 }
}
