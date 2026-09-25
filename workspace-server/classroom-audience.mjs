// Explicit shared-course boundary; never infer classmates from a shared activity ID.
const COURSES={'11501':[['108','109']]};
export const namedClassroom=a=>a.kind==='w8-proposal';
export function classroomClasses(a,className){
 const configured=Array.isArray(a.legacy?.classroomGroups)?a.legacy.classroomGroups:COURSES[a.term]||[];
 const groups=configured.filter(g=>Array.isArray(g)&&g.length>0&&g.every(c=>typeof c==='string'));
 const matches=groups.filter(g=>g.includes(className));
 return matches.length===1?[...new Set(matches[0])]:[className];
}
export function classroomLabel(members){return members.map(m=>m.class_name+' 班 '+m.name).join('、');}
