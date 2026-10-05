import {sha} from './security.mjs';
// Explicit shared-course boundary; never infer classmates from a shared activity ID.
const COURSES={'11501':[['108','109']]};
export const courseGroups=term=>COURSES[term]||[];
export const sharedClassroom=a=>[3,4,5].includes(Number(a.week))||['w8-proposal','w9-check','w10-priority','w11-response',"w12-question","w13-synthesis","w14-expression","w15-decision","w16-response","w15-personal-deck"].includes(a.kind);
export function classroomClasses(a,className){
 const configured=Array.isArray(a.legacy?.classroomGroups)?a.legacy.classroomGroups:COURSES[a.term]||[];
 const groups=configured.filter(g=>Array.isArray(g)&&g.length>0&&g.every(c=>typeof c==='string'));
 const matches=groups.filter(g=>g.includes(className));
 return matches.length===1?[...new Set(matches[0])]:[className];
}

// Stable across sorting/filtering; never derived from a student's identity.
export const anonymousWorkLabel=workId=>'作品 '+sha(String(workId)).slice(0,8).toUpperCase();
// Filter known roster identifiers in shared prose without rewriting original records.
// This does not inspect pixels or identify names outside the course roster.
export async function classroomTextFilter(db,term){
 const roster=await db.query('select name,student_id from rib.students where term=$1',[term]);
 const words=[...new Set(roster.flatMap(s=>[s.name,s.student_id]).filter(s=>typeof s==='string'&&s.length>=2))].sort((a,b)=>b.length-a.length);
 const pattern=words.length?new RegExp(words.map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'gu'):null;
 function clean(value){
  if(typeof value==='string')return pattern?value.replace(pattern,'同學'):value;
  if(Array.isArray(value))return value.map(clean);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,clean(v)]));
  return value;
 }
 return clean;
}
