import {demand,teacherScope,json,sha,text,uid} from './security.mjs';
export const W4_REMINDER='你尚未在平台繳交 W4 個人三格圖卡。請依老師公告的期限補交自己的作品；W5 示範練習不能代替 W4 交件。補交後，先取得同學或老師親自看圖的回饋，再由你自己對照原意與畫面，於平台留下修改或保留的決定與依據。若讀者遲未回覆，請告訴老師安排補讀。證據未齊會標示待補，仍由老師核對評分。';
const readings=a=>a.legacy?.w4TeacherReadings||{};
export const publishedReadings=(a,workId)=>(readings(a)[workId]?.published||[]).map(({id,versionId,situation,meaning,attribution,mode,publishedAt,sourceNote})=>({id,versionId,situation,meaning,attribution,mode,publishedAt,sourceNote}));
export const teacherCovered=(a,workId)=>publishedReadings(a,workId).some(r=>r.mode==='human');
export async function humanFeedback(db,w){
 const peer=await db.query("select id from rib.reviews where target_work_id=$1 and status='done' limit 1",[w.id]);
 if(peer.length)return true;
 const [a]=await db.query('select legacy from rib.activities where id=$1',[w.activity_id]);return teacherCovered(a,w.id);
}
async function missing(db,a,className){return db.query(`select s.student_id,s.name,s.seat from rib.students s where s.term=$1 and s.class_name=$2 and s.active and s.is_test=$3 and not exists(select 1 from rib.works w join rib.members m on m.work_id=w.id join rib.versions v on v.work_id=w.id where w.activity_id=$4 and m.student_id=s.student_id and m.status='confirmed' and jsonb_array_length(v.media)>0) order by s.seat`,[a.term,className,!!a.legacy?.testOnly,a.id]);}
export async function reminderPlan(service,p,input,db=service.db){
 demand(p.role!=='student',403,'請使用教師帳號。');const a=await service.activity(p,input.activityId,db);teacherScope(p,a.term,input.className);
 demand(a.kind==='w4'&&!a.archived&&a.accepting,409,'請先開放這個學期的 W4 補交。');
 const message=text(input.message||W4_REMINDER,1600),deadline=String(input.deadline||'');
 demand(!deadline||/^\d{4}-\d{2}-\d{2}$/.test(deadline)&&Number.isFinite(Date.parse(deadline))&&new Date(deadline).toISOString().slice(0,10)===deadline,400,'請填有效的補交日期。');
 const signature=sha(json({message,deadline})),students=await missing(db,a,input.className),old=a.legacy?.w4Reminders||{};
 const candidates=students.filter(s=>old[s.student_id]?.at(-1)?.signature!==signature);
 return {activityId:a.id,className:input.className,term:a.term,message,deadline,candidates,alreadySent:students.length-candidates.length,missing:students.map(s=>({...s,lastSentAt:old[s.student_id]?.at(-1)?.sentAt||null})),token:sha(json({activityId:a.id,className:input.className,signature,candidates,old}))};
}
export async function sendReminders(service,p,input){return service.db.transaction(async db=>{
 await db.query('select id from rib.activities where id=$1 for update',[input.activityId]);
 const plan=await reminderPlan(service,p,input,db);demand(plan.token===input.token,409,'未交名單或提醒內容已更新，請重新預覽。');
 const a=await service.activity(p,input.activityId,db),reminders={...(a.legacy?.w4Reminders||{})},sentAt=new Date().toISOString(),signature=sha(json({message:plan.message,deadline:plan.deadline}));
 for(const s of plan.candidates)reminders[s.student_id]=[...(reminders[s.student_id]||[]),{id:uid(),message:plan.message,deadline:plan.deadline,sentAt,signature,sentBy:p.email}];
 if(plan.candidates.length){await db.query("update rib.activities set legacy=jsonb_set(coalesce(legacy,'{}'::jsonb),'{w4Reminders}',$2::jsonb) where id=$1",[a.id,json(reminders)]);await service.event(db,p,a.id,'w4-reminder-sent',input.className,{students:plan.candidates.map(s=>s.student_id),message:plan.message,deadline:plan.deadline});}
 return {sent:plan.candidates.length,alreadySent:plan.alreadySent};
});}
export async function studentReminders(service,p){
 if(p.role!=='student')return [];
 const rows=await service.db.query(`select a.id,a.title,a.legacy->'w4Reminders'->$2 as reminders from rib.activities a where a.term=$1 and a.kind='w4' and not a.archived and coalesce((a.legacy->>'testOnly')::boolean,false)=$3 and not exists(select 1 from rib.works w join rib.members m on m.work_id=w.id join rib.versions v on v.work_id=w.id where w.activity_id=a.id and m.student_id=$2 and m.status='confirmed' and jsonb_array_length(v.media)>0)`,[p.term,p.studentId,!!p.student.is_test]);
 return rows.flatMap(a=>{const r=a.reminders?.at(-1);return r?[{activityId:a.id,title:a.title,message:r.message,deadline:r.deadline,sentAt:r.sentAt}]:[];});
}
export async function teacherReading(service,p,input,db=service.db){
 demand(p.role!=='student',403,'只有老師能查看補讀草稿。');const w=await service.work(p,input.workId,{db}),a=await service.activity(p,w.activity_id,db);
 demand(w.kind==='w4',400,'請選 W4 圖卡。');const versions=await db.query('select id,ordinal from rib.versions where work_id=$1 order by ordinal',[w.id]);
 const record=readings(a)[w.id]||{revision:0,draft:null,published:[]};
 return {workId:w.id,versions,...record};
}
export async function saveTeacherReading(service,p,input){return service.db.transaction(async db=>{
 demand(p.role!=='student',403,'請使用教師帳號。');await db.query('select id from rib.works where id=$1 for update',[input.workId]);
 const w=await service.work(p,input.workId,{db});await db.query('select id from rib.activities where id=$1 for update',[w.activity_id]);
 const a=await service.activity(p,w.activity_id,db);demand(a.kind==='w4'&&!a.archived&&a.accepting&&['review','exhibit'].includes(a.phase)&&!w.hidden,409,'請在 W4 初讀或展示階段補上回饋。');
 const record=readings(a)[w.id]||{revision:0,draft:null,published:[]};demand(record.revision===input.expectedRevision,409,'補讀紀錄已更新，請重新開啟。');
 const [version]=await db.query('select id from rib.versions where work_id=$1 order by ordinal desc limit 1',[w.id]);demand(version&&version.id===input.versionId,409,'圖卡版本已更新，請重新看圖再確認。');
 demand(['draft','published'].includes(input.status)&&['human','ai-simulation'].includes(input.mode),400,'請選擇保存方式與回饋來源。');
 const publishing=input.status==='published';
 if(publishing)demand(input.mode==='human'?input.personallyRead===true:input.reviewed===true,400,input.mode==='human'?'請親自看圖並確認這是你的判讀，再發布老師初讀。':'請先審閱 AI 模擬內容。');
 const field=value=>publishing?text(value):typeof value==='string'&&value.length<=1200?value.trim():'';
 const draft={versionId:version.id,situation:field(input.situation),meaning:field(input.meaning),sourceNote:typeof input.sourceNote==='string'?input.sourceNote.trim().slice(0,1200):'',mode:input.mode,aiAssisted:input.aiAssisted===true,updatedBy:p.email};
 const attribution=input.mode==='human'?`老師初讀${input.aiAssisted===true?'，AI 協助整理':''}`:'AI 模擬初讀，教師已審閱';
 const next={revision:record.revision+1,draft:publishing?null:draft,published:publishing?[...record.published,{...draft,id:uid(),attribution,publishedAt:new Date().toISOString()}]:record.published};
 const all={...readings(a),[w.id]:next};await db.query("update rib.activities set legacy=jsonb_set(coalesce(legacy,'{}'::jsonb),'{w4TeacherReadings}',$2::jsonb) where id=$1",[a.id,json(all)]);
 await service.event(db,p,a.id,publishing?'w4-teacher-reading-published':'w4-teacher-reading-draft',w.id,{versionId:version.id,mode:input.mode,revision:next.revision});
 return {saved:true,revision:next.revision};
});}
