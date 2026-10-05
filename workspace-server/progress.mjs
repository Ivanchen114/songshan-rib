import {demand,teacherScope} from './security.mjs';
import {publishedReadings} from './w4-remediation.mjs';
import {supportedKind,activityTitle} from '../workspace/activities.js';
import {classroomClasses} from './classroom-audience.mjs';
import {collectionFor} from '../workspace/collection.js';

// Read-only, roster-first summary. Never return answers, images, grades or credentials.
export async function learningProgress(service,p,input={}){
 const student=p.role==='student',term=student?p.term:input.term;
 demand(/^\d{3}0[12]$/.test(term||''),400,'請選擇學期。');
 if(student)demand((!input.term||input.term===p.term)&&(!input.studentId||input.studentId===p.studentId)&&!input.className,403,'只能查看自己的進度。');
 const collection=collectionFor(term);
 const testOnly=student?!!p.student.is_test:input.testOnly==='true';
 if(!student&&p.role!=='admin')demand(p.teacher.scopes.some(s=>s.term===term),403,'沒有這個學期的查看權限。');
 if(!student&&input.className)teacherScope(p,term,input.className);
 let students=await service.db.query(`select student_id,name,class_name,seat from rib.students where term=$1 and active and is_test=$2 ${student?'and student_id=$3':''} order by class_name,seat,student_id`,[term,testOnly,...(student?[p.studentId]:[])]);
 if(!student)students=students.filter(s=>(!input.className||s.class_name===input.className)&&(p.role==='admin'||p.teacher.scopes.some(x=>x.term===term&&x.className===s.class_name)));
 const activities=(await service.db.query('select id,term,week,title,kind,phase,accepting,archived,legacy from rib.activities where term=$1 and coalesce((legacy->>\'testOnly\')::boolean,false)=$2 order by week,id',[term,testOnly])).filter(a=>supportedKind(a.kind)&&(!student||!a.archived));
 const activityIds=activities.map(a=>a.id),studentIds=students.map(s=>s.student_id);
 if(!studentIds.length)return {term,testOnly,collection,activities:[],students:[]};
 const allowedClasses=[...new Set(students.map(s=>s.class_name))];
 const works=await service.db.query(`select w.id,w.activity_id,w.current_version_id,w.topic,w.reflection,m.student_id from rib.works w join rib.members m on m.work_id=w.id where w.activity_id=any($1::text[]) and m.student_id=any($2::text[]) and m.term=$3 and m.status='confirmed' and not w.hidden ${student?'':'and w.class_name=any($4::text[])'}`,[activityIds,studentIds,term,...(student?[]:[allowedClasses])]);
 const workIds=[...new Set(works.map(w=>w.id))];
 const [versions,reviews,decisions,grades,judgments,materials,peers]=await Promise.all([
  service.db.query('select id,work_id,ordinal from rib.versions where work_id=any($1::text[]) order by ordinal',[workIds]),
  service.db.query("select id,activity_id,target_work_id,reviewer_id,status,exists(select 1 from rib.versions v where v.work_id=r.target_work_id) as target_ready from rib.reviews r where activity_id=any($1::text[]) and status in ('waiting','assigned','requested','done')",[activityIds]),
  service.db.query('select work_id,student_id from rib.decisions where work_id=any($1::text[]) and student_id=any($2::text[])',[workIds,studentIds]),
  service.db.query("select work_id,student_id from rib.assessments where work_id=any($1::text[]) and student_id=any($2::text[]) and status='graded'",[workIds,studentIds]),
  service.db.query('select activity_id,student_id,status from rib.ai_judgments where activity_id=any($1::text[]) and student_id=any($2::text[]) and term=$3',[activityIds,studentIds,term]),
  service.db.query(`select distinct m.student_id from rib.ai_readings r join rib.versions v on v.id=r.version_id join rib.works w on w.id=v.work_id join rib.members m on m.work_id=w.id join rib.activities a on a.id=w.activity_id where a.id=any($1::text[]) and a.kind='w4' and not a.archived and not w.hidden and m.term=$3 and m.status='confirmed' and m.student_id=any($2::text[]) and r.status='published' and btrim(r.comment_a)<>'' and btrim(r.comment_b)<>''`,[activityIds,studentIds,term]),
  service.db.query(`select distinct w.id,w.activity_id,w.class_name,w.topic from rib.works w join rib.members m on m.work_id=w.id join rib.students s using(term,student_id) where w.activity_id=any($1::text[]) and w.current_version_id is not null and not w.hidden and m.status='confirmed' and s.active and s.is_test=$2 and m.term=$3`,[activityIds,testOnly,term])
 ]);
 return {term,testOnly,collection,activities:activities.map(a=>({id:a.id,week:a.week,title:activityTitle(a),kind:a.kind,phase:a.phase,accepting:a.accepting,archived:a.archived})),students:students.map(s=>({studentId:s.student_id,name:s.name,className:s.class_name,seat:s.seat,records:activities.map(a=>{
  const own=works.filter(w=>w.student_id===s.student_id&&w.activity_id===a.id);
  const ownIds=own.map(w=>w.id),current=own.find(w=>w.current_version_id)||own[0];
  const demo=a.legacy?.w5DemoAssignments?.[s.student_id];
  const choices=demo?.choices||[demo];
  return {activityId:a.id,workId:current?.id||null,versionCount:versions.filter(v=>ownIds.includes(v.work_id)).length,
   humanFeedback:reviews.some(r=>ownIds.includes(r.target_work_id)&&r.status==='done')||own.some(w=>publishedReadings(a,w.id).some(r=>r.mode==='human')),
   humanReaderStatus:reviews.find(r=>ownIds.includes(r.target_work_id)&&['waiting','assigned','requested'].includes(r.status))?.status||null,
   decision:decisions.some(d=>ownIds.includes(d.work_id)&&d.student_id===s.student_id),
   graded:grades.some(g=>ownIds.includes(g.work_id)&&g.student_id===s.student_id),
   readerPending:reviews.filter(r=>r.reviewer_id===s.student_id&&r.activity_id===a.id&&['waiting','assigned','requested'].includes(r.status)).length,
   readerTotal:reviews.filter(r=>r.reviewer_id===s.student_id&&r.activity_id===a.id).length,
   readerReady:reviews.filter(r=>r.reviewer_id===s.student_id&&r.activity_id===a.id&&r.status==='assigned'&&r.target_ready).length,
   judgment:judgments.find(j=>j.activity_id===a.id&&j.student_id===s.student_id)?.status||null,
   materials:materials.some(m=>m.student_id===s.student_id)||choices.some(d=>d?.commentA?.trim()&&d?.commentB?.trim()),
   topic:!!current?.topic,peerAvailable:!!current?.topic&&peers.some(w=>w.activity_id===a.id&&w.id!==current.id&&w.topic===current.topic&&classroomClasses(a,s.class_name).includes(w.class_name)),reflection:current?.reflection?{status:current.reflection.status,current:current.reflection.versionId===current.current_version_id}:null};
 })}))};
}
