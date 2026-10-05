import {demand,sha} from './security.mjs';
import {publishedReadings} from './w4-remediation.mjs';

// Read-only projection of messages the caller can currently read. No shadow copy
// of private content: withdrawal, hidden works and membership are rechecked.
async function messages(service,p){
 demand(p.role==='student',403,'請使用本人帳號或教師唯讀學生視角。');
 const db=service.db,[state]=await db.query('select notifications_since from rib.workspace_state where id=1');
 const since=new Date(state?.notifications_since||Date.now()).getTime(),out=[];
 const add=(key,activity,kind,sourceId,title,at,body,target,context=[])=>{
  if(!at||new Date(at).getTime()<since)return;
  out.push({id:key,activityId:activity.id,week:activity.week,kind,sourceId,title,at,body,target,context,version:sha(JSON.stringify([kind,sourceId,body,at,context]))});
 };
 const activities=await db.query("select id,week,legacy from rib.activities where term=$1 and not archived and coalesce((legacy->>'testOnly')::boolean,false)=$2",[p.term,!!p.student.is_test]);
 const ids=activities.map(a=>a.id);if(!ids.length)return [];
 const works=await db.query("select w.id,w.activity_id from rib.works w join rib.members m on m.work_id=w.id where w.activity_id=any($1::text[]) and not w.hidden and m.term=$2 and m.student_id=$3 and m.status='confirmed'",[ids,p.term,p.studentId]);
 const ownIds=works.map(w=>w.id);
 for(const a of activities){
  for(const w of works.filter(w=>w.activity_id===a.id)){
   const r=publishedReadings(a,w.id).filter(r=>r.mode==='human').sort((x,y)=>new Date(y.publishedAt)-new Date(x.publishedAt))[0];
   if(r)add('reading:'+w.id,a,'reading',r.id,'老師已留下真人初讀',r.publishedAt,[r.situation,r.meaning].join('\n\n'),{workId:w.id});
  }
  const r=a.legacy?.w4Reminders?.[p.studentId]?.at(-1);
  if(r)add('reminder:'+a.id,a,'reminder',r.id,'老師的補齊提醒',r.sentAt,r.message,{},{deadline:r.deadline||''});
 }
 const replies=await db.query(`select distinct on (r.id) r.id as review_id,r.target_work_id,r.activity_id,t.id,t.body,t.created_at
 from rib.reviews r join rib.works w on w.id=r.target_work_id join rib.replies t on t.review_id=r.id
 where r.activity_id=any($1::text[]) and not w.hidden and r.term=$2 and r.status='done' and t.label='teacher'
 and (r.target_work_id=any($3::text[]) or r.reviewer_id=$4)
 order by r.id,t.created_at desc,t.id desc`,[ids,p.term,ownIds,p.studentId]);
 for(const r of replies){
  // Mirrors conversation access, including classroom visibility and assignment.
  try{await service.conversation(p,{reviewId:r.review_id});}catch(e){if([403,404].includes(e.status))continue;throw e;}
  add('conversation:'+r.review_id,activities.find(a=>a.id===r.activity_id),'conversation',r.id,ownIds.includes(r.target_work_id)?'老師回覆了我的作品對話':'老師回覆了我給同學的初讀',r.created_at,r.body,{reviewId:r.review_id});
 }
 const assessments=await db.query("select g.work_id,g.rubric,g.comment,g.updated_at from rib.assessments g where g.work_id=any($1::text[]) and g.student_id=$2 and g.status='graded' and btrim(g.comment)<>''",[ownIds,p.studentId]);
 for(const g of assessments){const w=works.find(w=>w.id===g.work_id);add('assessment:'+g.work_id+':'+g.rubric,activities.find(a=>a.id===w.activity_id),'assessment',g.rubric,'老師已發布評閱留言',g.updated_at,g.comment,{workId:g.work_id});}
 const records=await db.query(`select r.id,r.published_at,r.student_record_updated_at,r.teacher_notes->'studentRecord' as record,v.ordinal,w.activity_id,
 max(j.updated_at) as unlocked_at from rib.ai_readings r join rib.versions v on v.id=r.version_id join rib.works w on w.id=v.work_id
 join rib.ai_judgments j on j.term=$2 and j.student_id=$3 and j.status='submitted'
 and j.answers->>'sourceReference'=r.id||' / W4 V'||v.ordinal
 join rib.activities a on a.id=j.activity_id and a.term=$2 and a.kind='w5-personal' and not a.archived and coalesce((a.legacy->>'testOnly')::boolean,false)=$4
 where w.id=any($1::text[]) and r.status='published' and r.teacher_notes->'studentRecord'->>'published'='true'
 and r.teacher_notes->'studentRecord'->>'kind'='joint' and btrim(coalesce(r.teacher_notes->'studentRecord'->>'teacherReply',''))<>''
 group by r.id,v.ordinal,w.activity_id`,[ownIds,p.term,p.studentId,!!p.student.is_test]);
 for(const r of records){const at=new Date(Math.max(...[r.published_at,r.student_record_updated_at,r.unlocked_at].filter(Boolean).map(x=>new Date(x).getTime()))).toISOString();
  // Unlock time determines eligibility, not version: re-saving the same answer
  // must not create a second notification for the same teacher message.
  const publishedAt=r.student_record_updated_at||r.published_at;
  if(new Date(at).getTime()>=since){add('record:'+r.id,activities.find(a=>a.id===r.activity_id),'record',r.id,'老師的判讀回覆可以查看了',at,r.record.teacherReply,{readingId:r.id});const item=out.at(-1);item.version=sha(JSON.stringify([r.id,publishedAt,r.record.teacherReply]));}
 }
 const reads=await db.query('select thread_key,version from rib.notification_reads where term=$1 and student_id=$2',[p.term,p.studentId]);
 return out.map(n=>({...n,unread:!reads.some(r=>r.thread_key===n.id&&r.version===n.version)})).sort((a,b)=>new Date(b.at)-new Date(a.at)||a.id.localeCompare(b.id));
}
export async function notifications(service,p){const items=await messages(service,p);return {unread:items.filter(n=>n.unread).length,items:items.map(({body,context,...n})=>n)};}
export async function notification(service,p,input){
 demand(typeof input.id==='string'&&input.id.length<=200,400,'請選擇訊息。');
 const n=(await messages(service,p)).find(n=>n.id===input.id);demand(n,404,'訊息目前不可讀，請更新列表。');
 if(n.kind==='conversation'){const c=await service.conversation(p,n.target);return {...n,conversation:{viewer:c.viewer,review:c.review,replies:c.replies}};}
 if(n.kind==='record'){const r=await service.aiReading(p,n.target);demand(r.studentRecord?.kind==='joint'&&r.studentRecord.teacherReply,404,'這則回覆目前不可讀。');}
 return n;
}
export async function readNotification(service,p,input){
 demand(p.role==='student'&&!p.teacherPreview,403,'只能由學生本人標示已讀。');
 demand(typeof input.version==='string'&&/^[a-f0-9]{64}$/.test(input.version),400,'請重新開啟訊息。');
 const n=await notification(service,p,input);demand(n.version===input.version,409,'老師有更新訊息，請重新開啟後閱讀。');
 await service.db.query('insert into rib.notification_reads(term,student_id,thread_key,version) values($1,$2,$3,$4) on conflict do nothing',[p.term,p.studentId,n.id,n.version]);
 return {saved:true};
}
