import {demoList,demoDetail} from './ai-demos.mjs';
import {demand,teacherScope} from './security.mjs';
// Board lists are scoped independently from exhibit access to W4 works.
export async function readingList(service,p,a,className){
 if(!['w4','w5-personal'].includes(a.kind))return [];
 if(p.role!=='student')teacherScope(p,a.term,className);
 const student=p.role==='student';
 const personal=await service.db.query(`select r.id,r.version_id,v.work_id,v.ordinal,r.status,s.seat,(r.comment_a<>'') as has_pair
 from rib.ai_readings r join rib.versions v on v.id=r.version_id
 join rib.works w on w.id=v.work_id join rib.activities a on a.id=w.activity_id
 join rib.students s on s.term=a.term and s.student_id=w.owner_id
 where a.term=$1 and a.kind='w4' and not w.hidden
 and coalesce((a.legacy->>'testOnly')::boolean,false)=$2
 and ${student?"r.status='published' and not a.archived and s.active and s.student_id=$3 and exists(select 1 from rib.members m where m.work_id=w.id and m.student_id=$3 and m.term=$1 and m.status='confirmed')":"w.class_name=$3"}
 ${a.kind==='w4'?'and a.id=$4':''} order by s.seat,v.ordinal`,
 [a.term,a.legacy?.testOnly===true,student?p.studentId:className,...(a.kind==='w4'?[a.id]:[])]);
 return [...personal,...await demoList(service,p,a,className)];
}
export async function readingDetail(service,p,input){
 demand(typeof input.readingId==='string'&&input.readingId.length<=160,400,'請選擇一份甲乙留言。');
 if(input.readingId.startsWith('demo-'))return demoDetail(service,p,input.readingId);
 const [r]=await service.db.query('select r.*,v.work_id,v.ordinal from rib.ai_readings r join rib.versions v on v.id=r.version_id where r.id=$1',[input.readingId]);
 demand(r,404,'找不到這份甲乙留言。');
 const w=await service.work(p,r.work_id);
 demand(p.role!=='student'||w.own&&r.status==='published',403,'只有作品本人可以讀取這份甲乙留言。');
 // Only the teacher-authorized student record is shared; raw internal notes stay private.
 const record=r.teacher_notes?.studentRecord;
 let canReadRecord=p.role!=='student';
 if(!canReadRecord&&record?.published===true){
  const [submitted]=await service.db.query(`select 1 from rib.ai_judgments j join rib.activities a on a.id=j.activity_id
   where j.term=$1 and j.student_id=$2 and j.status='submitted' and a.kind='w5-personal'
   and a.term=$1 and coalesce((a.legacy->>'testOnly')::boolean,false)=$3
   and j.answers->>'sourceReference'=$4 limit 1`,[w.term,p.studentId,!!w.test_only,`${r.id} / W4 V${r.ordinal}`]);
  canReadRecord=!!submitted;
 }
 const studentRecord=canReadRecord&&record?.published===true?Object.fromEntries(['kind','disclosure','aiObservation','teacherReply','result','basis','limit'].map(k=>[k,typeof record[k]==='string'?record[k]:''])):null;
 return {id:r.id,versionId:r.version_id,ordinal:r.ordinal,commentA:r.comment_a,commentB:r.comment_b,taskNote:r.task_note,
 imageUrl:await service.store.signRead(r.image_key),studentRecord,
 recordLocked:p.role==='student'&&record?.published===true&&!canReadRecord,
 ...(p.role!=='student'?{status:r.status,teacherNotes:r.teacher_notes}:{})};
}
