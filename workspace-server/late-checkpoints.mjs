import {Reflection} from './reflection.mjs';
import {isLate} from '../workspace/activities.js';
import {demand,text,json,uid,teacherScope,rate} from './security.mjs';
import {MAX_IMAGE,commitImage} from './storage.mjs';
import {isDeepStrictEqual} from 'node:util';
import {lateDefaults,lateState,contentAllowed,evidenceAllowed,lateContentGuard,lateReadGuard,lateVersionGuard} from './late-guards.mjs';
export {lateContentGuard,lateReadGuard,lateVersionGuard};
const one=async(db,q,p=[])=>(await db.query(q,p))[0];
const actor=p=>p.role==='student'?p.term+':'+p.studentId:p.email;
const optional=(x,n)=>typeof x==='string'&&x.trim()?text(x,n):'';
const date=x=>{demand(!x||typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(new Date(x).getTime())&&new Date(x).toISOString().slice(0,10)===x,400,'請核對投遞日期。');return x||'';};
const url=x=>{if(!x)return '';const s=text(x,1500);let u;try{u=new URL(s);}catch{demand(false,400,'請填完整的受理通知或提案頁網址。');}demand(['https:','http:'].includes(u.protocol)&&!u.username&&!u.password,400,'請填一般網頁連結。');return s;};
async function row(db,w){await db.query('insert into rib.late_checkpoints(work_id) values($1) on conflict do nothing',[w.id]);return one(db,'select * from rib.late_checkpoints where work_id=$1 for update',[w.id]);}
export async function lateBoard(service,p,a,works,cls){
 if(!isLate(a.kind))return;
 const className=p.role==='student'?p.student.class_name:cls;
 const [c]=await service.db.query('select * from rib.late_controls where activity_id=$1 and class_name=$2',[a.id,className]);a.lateControl=c||{...lateDefaults};
 const ids=works.map(w=>w.id);
 const [seals,receipts]=await Promise.all([
  service.db.query('select * from rib.late_checkpoints where work_id=any($1::text[])',[ids]),
  service.db.query("select work_id,count(*)::int as n,max(completed_at) as at,sum(jsonb_array_length(media))::int as images,bool_or(payload->>'sent'='true') as sent from rib.late_deliveries where work_id=any($1::text[]) and completed group by work_id",[ids])]);
 for(const w of works){const k=seals.find(k=>k.work_id===w.id)||{revision:0,delivery_status:'pending'},s={control:a.lateControl,checkpoint:k},r=receipts.find(r=>r.work_id===w.id)||{n:0,images:0};
  w.checkpoint={proposalVersionId:k.proposal_version_id||null,v1VersionId:k.v1_version_id||null,finalVersionId:k.final_version_id||null,proposalAt:k.proposal_at||null,v1At:k.v1_at||null,finalAt:k.final_at||null,canContent:a.accepting&&!a.archived&&contentAllowed({kind:a.kind},s),canEvidence:a.kind==='w14-public-proposal'&&a.accepting&&!a.archived&&evidenceAllowed(s),deliveryStatus:k.delivery_status,receiptRecords:r.n,receiptImages:r.images,provisional:r.images?'有證據，待教師核對':r.sent?'自報已投遞，待核對':'尚無投遞紀錄',lastReceiptAt:r.at||null,revision:k.revision||0,...(p.role!=='student'?{teacherReason:k.teacher_reason||'',verified:k.verified,extensionReason:k.extension_reason||'',contentUntil:k.content_until,evidenceUntil:k.evidence_until,sealedMembers:k.sealed_members||[]}:{})};
 }
}
export class LateCheckpoints extends Reflection {
 async lateControl(p,input){
  demand(p.role!=='student',403,'請使用教師帳號。');const initial=await this.activity(p,input.activityId),cls=text(input.className,20);teacherScope(p,initial.term,cls);demand(isLate(initial.kind)&&!initial.archived,400,'請選後段封存活動。');
  const op=input.operation;demand(['proposal','evidence','v1','final','classroom'].includes(op)&&input.confirm===true,400,'請確認這次封存或展示操作。');
  const proposal=initial.kind==='w14-public-proposal';demand(proposal?['proposal','evidence'].includes(op):['v1','final','classroom'].includes(op),400,'此活動不使用這個操作。');
  return this.db.transaction(async db=>{
   let sealed=0,missing=0;
   await db.query('select id from rib.activities where id=$1 for update',[initial.id]);
   const a=await this.activity(p,initial.id,db);demand(!a.archived,403,'活動已封存。');
   await db.query('insert into rib.late_controls(activity_id,class_name) values($1,$2) on conflict do nothing',[a.id,cls]);
   const c=await one(db,'select * from rib.late_controls where activity_id=$1 and class_name=$2 for update',[a.id,cls]);demand(c.revision===input.expectedRevision,409,'本班封存設定已更新，請重新整理。');
   if(op==='classroom'){demand(typeof input.open==='boolean',400,'請選展示狀態。');demand(!input.open||c.v1_closed,409,'請先封存送印版，再開放本班海報。');await db.query('update rib.late_controls set classroom_open=$1,revision=revision+1,updated_at=now() where activity_id=$2 and class_name=$3',[input.open,a.id,cls]);}
   else {
    const field={proposal:'proposal',evidence:'evidence',v1:'v1',final:'final'}[op];
    demand(op!=='evidence'||c.proposal_closed,409,'請先封存公共提案收件版。');demand(op!=='final'||c.v1_closed,409,'請先封存 W15 送印版。');
    demand(!c[field+'_closed'],409,'這個截止點已封存，不能重新挑選版本。');
    const works=await db.query('select * from rib.works where activity_id=$1 and class_name=$2 order by id for update',[a.id,cls]);
    for(const w of works){await row(db,w);if(op==='evidence')continue;
     const v=await one(db,'select id from rib.versions where work_id=$1 order by ordinal desc limit 1',[w.id]);if(!v){missing++;continue;}
     const members=await db.query("select m.student_id,s.seat,s.name from rib.members m join rib.students s using(term,student_id) where m.work_id=$1 and m.status='confirmed' order by s.seat",[w.id]);
     demand(members.length>=1&&members.length<=3&&!(await one(db,"select work_id from rib.members where work_id=$1 and status='invited'",[w.id])),409,'請先核對尚未確認的共同作者。');
     await db.query(`update rib.late_checkpoints set ${field}_version_id=$1,${field}_at=now(),sealed_members=$2,revision=revision+1,updated_at=now() where work_id=$3 and ${field}_version_id is null`,[v.id,json(members),w.id]);sealed++;
    }
    await db.query(`update rib.late_controls set ${field}_closed=true,revision=revision+1,updated_at=now() where activity_id=$1 and class_name=$2`,[a.id,cls]);
   }
   await this.event(db,p,a.id,'late-control',a.id,{className:cls,operation:op,...(op==='classroom'?{open:input.open}:{})});return {saved:true,sealed,missing};
  });
 }
 async lateExtension(p,input){
  demand(p.role!=='student',403,'由教師確認障礙及延長期限。');const w=await this.work(p,input.workId);demand(isLate(w.kind)&&!w.archived,400,'請選後段作品。');
  const type=input.type;demand(['content','evidence'].includes(type)&&(type!=='evidence'||w.kind==='w14-public-proposal'),400,'請分清內容與投遞證據期限。');
  const until=new Date(input.until);demand(Number.isFinite(until.getTime())&&until.getTime()>Date.now()&&until.getTime()<Date.now()+31*86400000,400,'請設定未來 31 天內的補件截止時間。');const reason=text(input.reason,1000);
  return this.db.transaction(async db=>{await db.query('select id from rib.activities where id=$1 for update',[w.activity_id]);await db.query('select id from rib.works where id=$1 for update',[w.id]);const k=await row(db,w);demand(k.revision===input.expectedRevision,409,'作品設定已更新，請重新整理。');demand(type!=='content'||!(w.kind==='w14-public-proposal'?k.proposal_version_id:k.final_version_id),409,'已封存內容不可換版；只能延長尚未交件組的期限。');await db.query(`update rib.late_checkpoints set ${type}_until=$1,extension_reason=$2,revision=revision+1,updated_at=now() where work_id=$3`,[until.toISOString(),reason,w.id]);await this.event(db,p,w.activity_id,'late-extension',w.id,{type,until:until.toISOString(),reason});return {saved:true};});
 }
 async lateStatus(p,input){
  demand(p.role!=='student',403,'投遞結果由教師核對。');const w=await this.work(p,input.workId);demand(w.kind==='w14-public-proposal'&&!w.archived,400,'請選公共提案。');demand(['pending','completed','missing','obstacle'].includes(input.status)&&typeof input.verified==='boolean',400,'請選核對狀態。');const reason=optional(input.reason,1500);
  demand(input.status!=='completed'||input.verified,400,'完成須由教師核對送達紀錄。');demand(!['missing','obstacle'].includes(input.status)||reason,400,'請說明未完成或障礙原因。');
  return this.db.transaction(async db=>{await db.query('select id from rib.activities where id=$1 for update',[w.activity_id]);await db.query('select id from rib.works where id=$1 for update',[w.id]);const k=await row(db,w),s=await lateState(db,w);demand(k.revision===input.expectedRevision,409,'投遞紀錄已更新，請重新核對。');demand(input.status!=='missing'||s.control.evidence_closed&&!(k.evidence_until&&new Date(k.evidence_until)>new Date()),409,'補投遞期限尚未結束，不能先判未完成。');await db.query('update rib.late_checkpoints set delivery_status=$1,verified=$2,teacher_reason=$3,revision=revision+1,updated_at=now() where work_id=$4',[input.status,input.verified,reason,w.id]);await this.event(db,p,w.activity_id,'late-status',w.id,{status:input.status,verified:input.verified,reason});return {saved:true};});
 }
 async lateEvidencePrepare(p,input){
  demand(p.role==='student',403,'請由原提案組補投遞紀錄。');const w=await this.work(p,input.workId);demand(w.own&&w.kind==='w14-public-proposal'&&w.accepting&&!w.archived,403,'請在原提案組的活動補件。');
  demand(evidenceAllowed(await lateState(this.db,w)),403,'本班投遞補件已關閉。');
  const files=input.files;demand(Array.isArray(files)&&files.length<=3,400,'投遞證據最多三張。');for(const f of files)demand(Number.isInteger(f.bytes)&&f.bytes>0&&f.bytes<=MAX_IMAGE&&/^[a-f0-9]{64}$/.test(f.sha256)&&['image/jpeg','image/png','image/webp'].includes(f.mime),400,'請選 8 MB 以內的 JPG、PNG 或 WebP 證據圖片。');
  const payload={sent:input.sent===true,date:date(input.date),caseNumber:optional(input.caseNumber,160),receiptUrl:url(input.receiptUrl),reply:optional(input.reply,2000)};
  demand(payload.sent||payload.reply||files.length,400,'請留下實際投遞或回覆紀錄。');demand(!payload.sent||payload.date,400,'已投遞請填實際日期。');const requestId=text(input.requestId,160);
  await rate(this.db,'late-evidence:'+actor(p),24,3600);
  return this.db.transaction(async db=>{await db.query('select id from rib.activities where id=$1 for update',[w.activity_id]);await db.query('select id from rib.works where id=$1 for update',[w.id]);const now=await this.work(p,w.id,{db});demand(now.own&&now.accepting&&evidenceAllowed(await lateState(db,now)),403,'目前不能補投遞紀錄。');
   let t=await one(db,'select * from rib.late_deliveries where work_id=$1 and request_id=$2',[w.id,requestId]);
   if(t){demand(t.actor===actor(p)&&isDeepStrictEqual(t.payload,payload)&&isDeepStrictEqual(t.files.map(({key,...f})=>f),files),409,'重送內容不同，請重新核對。');if(t.completed)return {saved:true,ticketId:t.id};demand(new Date(t.created_at).getTime()>Date.now()-1800000,409,'這次上傳已到期，請重新選圖。');}
   else{const ticketId=uid();t=await one(db,'insert into rib.late_deliveries(id,work_id,actor,request_id,payload,files) values($1,$2,$3,$4,$5,$6) returning *',[ticketId,w.id,actor(p),requestId,json(payload),json(files.map((f,i)=>({...f,key:`incoming/${ticketId}/${i}`})))]);}
   return {ticketId:t.id,files:await Promise.all(t.files.map(async f=>({url:await this.store.signUpload(f.key,f.mime),mime:f.mime})))};
  });
 }
 async lateEvidenceFinalize(p,input){
  const t=await one(this.db,'select * from rib.late_deliveries where id=$1',[String(input.ticketId)]);demand(p.role==='student'&&t?.actor===actor(p),403,'請由上傳者保存這次證據。');const w=await this.work(p,t.work_id);demand(w.own,403,'請由原上傳者核對作品。');if(t.completed)return {saved:true};demand(w.accepting&&evidenceAllowed(await lateState(this.db,w)),403,'目前不能補投遞紀錄。');demand(new Date(t.created_at).getTime()>Date.now()-1800000,409,'這次上傳已到期。');
  const media=[];for(let i=0;i<t.files.length;i++)media.push(await commitImage(this.store,t.files[i],`private-delivery/${w.id}/${uid()}/${i}`));
  return this.db.transaction(async db=>{await db.query('select id from rib.activities where id=$1 for update',[w.activity_id]);await db.query('select id from rib.works where id=$1 for update',[w.id]);const now=await this.work(p,w.id,{db}),latest=await one(db,'select * from rib.late_deliveries where id=$1 for update',[t.id]);demand(now.own&&now.accepting&&evidenceAllowed(await lateState(db,now)),403,'補件已關閉，這次暫存未列入交件。');if(latest.completed)return {saved:true};await row(db,w);
   await db.query('update rib.late_deliveries set completed=true,completed_at=now(),media=$1 where id=$2',[json(media),t.id]);await db.query("update rib.late_checkpoints set delivery_status='pending',verified=false,revision=revision+1,updated_at=now() where work_id=$1",[w.id]);await this.event(db,p,w.activity_id,'late-evidence',w.id,{receiptId:t.id,imageCount:media.length});return {saved:true};
  });
 }
 async lateEvidence(p,input){
  demand(p.role!=='student',403,'投遞證據只供教師查看。');const w=await this.work(p,input.workId);demand(w.kind==='w14-public-proposal',400,'請選公共提案。');
  const rows=await this.db.query('select id,actor,payload,media,completed_at from rib.late_deliveries where work_id=$1 and completed order by completed_at,id',[w.id]);
  return {items:await Promise.all(rows.map(async r=>({...r,media:undefined,images:await Promise.all(r.media.map(m=>this.store.signRead(m.fullKey)))})))};
 }
 async lateExport(p,input){
  demand(p.role!=='student',403,'只供教師下載班級投遞清單。');const a=await this.activity(p,input.activityId),cls=text(input.className,20);teacherScope(p,a.term,cls);demand(a.kind==='w14-public-proposal',400,'請選公共提案。');
  const rows=await this.db.query(`select w.id,c.proposal_at,c.delivery_status,c.teacher_reason,c.verified,v.metadata,
   coalesce(nullif(c.sealed_members,'[]'::jsonb),(select jsonb_agg(jsonb_build_object('student_id',m.student_id,'name',s.name,'seat',s.seat)) from rib.members m join rib.students s using(term,student_id) where m.work_id=w.id and m.status='confirmed')) as members
   from rib.works w left join rib.late_checkpoints c on c.work_id=w.id left join rib.versions v on v.id=coalesce(c.proposal_version_id,w.current_version_id) where w.activity_id=$1 and w.class_name=$2 order by w.created_at`,[a.id,cls]);
  const cell=x=>{let s=String(x??'');if(/^[\s]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  const lines=[['班級','作品代號','成員','收件單位','投遞管道','投遞日期','證據張數','投遞狀態','核對','教師原因','封存時間']];
  for(const r of rows){const receipts=await this.db.query('select payload,jsonb_array_length(media) as n from rib.late_deliveries where work_id=$1 and completed order by completed_at,id',[r.id]);lines.push([cls,r.id,(r.members||[]).map(m=>`${m.seat}號 ${m.name}`).join('、'),r.metadata?.recipient,r.metadata?.channel,receipts.at(-1)?.payload.date,receipts.reduce((n,r)=>n+r.n,0),{pending:'待核',completed:'已完成',missing:'完成條件未達 −4',obstacle:'障礙經確認（不扣分）'}[r.delivery_status||'pending'],r.verified?'已核對':'未核對',r.teacher_reason,r.proposal_at]);}
  return {filename:`W14-公共提案-${cls}.csv`,csv:'\uFEFF'+lines.map(r=>r.map(cell).join(',')).join('\r\n')};
 }
}
// A teacher-approved late submission fills an EMPTY seal, never replaces an existing seal.
export async function lateSealOnSubmit(db,w,versionId){
 if(!isLate(w.kind))return;const {control:c}=await lateState(db,w),field=w.kind==='w14-public-proposal'&&c.proposal_closed?'proposal':w.kind==='w15-argument-poster'&&c.final_closed?'final':null;if(!field)return;
 await row(db,w);const members=await db.query("select m.student_id,s.seat,s.name from rib.members m join rib.students s using(term,student_id) where m.work_id=$1 and m.status='confirmed' order by s.seat",[w.id]);
 await db.query(`update rib.late_checkpoints set ${field}_version_id=$1,${field}_at=now(),sealed_members=$2,revision=revision+1,updated_at=now() where work_id=$3 and ${field}_version_id is null`,[versionId,json(members),w.id]);
}
