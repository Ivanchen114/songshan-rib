import {isLate} from '../workspace/activities.js';
import {demand} from './security.mjs';
export const lateDefaults={proposal_closed:false,evidence_closed:false,v1_closed:false,final_closed:false,classroom_open:false,revision:0};
export async function lateState(db,w){
 const [control]=await db.query('select * from rib.late_controls where activity_id=$1 and class_name=$2',[w.activity_id,w.class_name]);
 const [checkpoint]=w.id?await db.query('select * from rib.late_checkpoints where work_id=$1',[w.id]):[];
 return {control:control||{...lateDefaults},checkpoint:checkpoint||{revision:0,delivery_status:'pending'}};
}
const future=x=>x&&new Date(x).getTime()>Date.now();
export function contentAllowed(w,{control:c,checkpoint:k}){
 const proposal=w.kind==='w14-public-proposal';
 return !(proposal?k.proposal_version_id:k.final_version_id)&&(!(proposal?c.proposal_closed:c.final_closed)||future(k.content_until));
}
export function evidenceAllowed({control:c,checkpoint:k}){return !c.evidence_closed||future(k.evidence_until);}
export async function lateContentGuard(db,w){if(isLate(w.kind))demand(contentAllowed(w,await lateState(db,w)),403,'本班內容已封存，不能替換；公共提案只可從「補投遞紀錄」補證據。');}
export async function lateReadGuard(db,p,w,own){
 if(!isLate(w.kind)||p.role!=='student'||own)return;
 demand(w.kind==='w15-argument-poster'&&w.class_name===p.student.class_name&&(await lateState(db,w)).control.classroom_open,403,'教師尚未開放本班海報；公共提案只供本組與教師查看。');
}
export async function lateVersionGuard(db,p,w,versionId,{publicUse=false}={}){
 if(!isLate(w.kind))return;
 if(publicUse){demand(w.kind==='w15-argument-poster',403,'公共提案目前只供課內查看。');demand((await lateState(db,w)).control.classroom_open,403,'請在第三輪試讀後開放本班海報，再審查對外展示。');}
 if(publicUse||p.role==='student'&&!w.own){const {checkpoint:k}=await lateState(db,w);demand([k.v1_version_id,k.final_version_id].includes(versionId),403,'只能展示教師已封存的海報版本。');}
}
export async function lateClassGuard(db,p,a){
 if(!isLate(a.kind))return;
 demand(a.kind==='w15-argument-poster',403,'公共提案不開放班內展覽。');
 if(p.role==='student'){const [c]=await db.query('select classroom_open from rib.late_controls where activity_id=$1 and class_name=$2',[a.id,p.student.class_name]);demand(c?.classroom_open,403,'老師尚未開放本班海報展示。');}
}
export async function lateEligible(db,rows){
 const ids=rows.filter(v=>v.kind==='w15-argument-poster').map(v=>v.work_id);
 const seals=ids.length?await db.query('select * from rib.late_checkpoints where work_id=any($1::text[])',[ids]):[];
 return rows.filter(v=>v.kind!=='w14-public-proposal'&&(v.kind!=='w15-argument-poster'||seals.some(k=>k.work_id===v.work_id&&[k.v1_version_id,k.final_version_id].includes(v.id))));
}
