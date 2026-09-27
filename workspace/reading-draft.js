// Local, per-student/per-work source notes. Never a submission or teacher-preview write.
export const DRAFT_KEYS=['title','references','passage','searchPath','noSource'];
export function draftScope({person,activity,work,preview=false}){
 if(preview||person?.role!=='student'||activity?.kind!=='w13-synthesis'||activity.archived||!activity.accepting||!person.studentId||work?.activity_id!==activity.id||!work.members?.some(m=>m.student_id===person.studentId&&m.status==='confirmed'))return null;
 return {key:'rib-w13-source-draft:'+JSON.stringify([activity.term,activity.id,person.studentId,work.id]),baseVersion:work.versions?.at(-1)?.id||null};
}
export function readDraft(storage,scope){
 if(!scope)return null;
 try{const d=JSON.parse(storage.getItem(scope.key));return d?.format===1&&d.baseVersion===scope.baseVersion&&d.values&&typeof d.values==='object'?d:null;}catch{return null;}
}
export function saveDraft(storage,scope,values){
 if(!scope)throw Error('這個畫面不能儲存來源草稿。');
 const clean={};for(const k of DRAFT_KEYS)clean[k]=k==='noSource'?values[k]===true:String(values[k]||'').slice(0,k==='title'?100:k==='searchPath'?3000:5000);
 const d={format:1,baseVersion:scope.baseVersion,savedAt:new Date().toISOString(),values:clean};storage.setItem(scope.key,JSON.stringify(d));return d;
}
export function clearDraft(storage,scope){if(scope)storage.removeItem(scope.key);}
