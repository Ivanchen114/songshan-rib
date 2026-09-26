import {demand,teacherScope} from './security.mjs';

// Request-local identity only: never create a student session or change credentials.
export const previewReads=new Set(['home','board','media','updates','aiReading','aiJudgments','conversation','reflection','classWall','original','journey','journeyMedia','selections']);
export async function previewPrincipal(service,teacher,input){
  demand(['admin','teacher'].includes(teacher.role),403,'只有授課教師可以查看學生視角。');
  const activity=await service.activity(teacher,input.previewActivity);
  demand(!activity.archived,403,'此學期已封存，請使用教師歷程查閱。');
  demand(typeof input.previewStudent==='string'&&/^\d{8}$/.test(input.previewStudent),400,'請選擇學生。');
  const [student]=await service.db.query('select * from rib.students where term=$1 and student_id=$2 and active',[activity.term,input.previewStudent]);
  demand(student,404,'此學生目前不在有效名單中。');
  teacherScope(teacher,activity.term,student.class_name);
  demand(!!student.is_test===!!activity.legacy?.testOnly,403,'請在對應的正式或測試活動查看學生。');
  demand(process.env.RIB_ACCEPTANCE_ONLY!=='true'||student.is_test,403,'驗收站只開放測試學生視角。');
  return {role:'student',term:activity.term,studentId:student.student_id,student};
}
export async function previewContext(service,teacher,input){
  const p=await previewPrincipal(service,teacher,input);
  const students=await service.db.query('select student_id,name,seat from rib.students where term=$1 and class_name=$2 and active and is_test=$3 order by seat,student_id',[p.term,p.student.class_name,p.student.is_test]);
  return {activityId:input.previewActivity,term:p.term,className:p.student.class_name,studentId:p.studentId,students};
}
