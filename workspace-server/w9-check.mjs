import {demand,uid,json} from './security.mjs';
import {currentTerm} from './terms.mjs';
// Resolve only the learner's own W8 evidence in this term and test scope.
// A paper-only W8 proposal remains usable; missing digital work is labelled explicitly.
export async function w9Source(db,p,a){
 const rows=await db.query(`select w.id,w.topic,w.activity_id,w.current_version_id from rib.works w join rib.activities a on a.id=w.activity_id join rib.members m on m.work_id=w.id where a.kind='w8-proposal' and a.term=$1 and not a.archived and not w.hidden and m.student_id=$2 and m.term=$1 and m.status='confirmed' and coalesce((a.legacy->>'testOnly')::boolean,false)=$3 and w.current_version_id is not null`,[a.term,p.studentId,!!a.legacy?.testOnly]);
 demand(rows.length<=1,409,'找到兩份 W8 提案，請老師先確認要接續的作品。');
 return rows[0]||null;
}
export async function setupW9Check(db,{apply=false}={}){return db.transaction(async tx=>{
 await tx.query('select id from rib.workspace_state where id=1 for update');const term=await currentTerm(tx),needed=[],created=[];
 for(const testOnly of [false,true]){
  const rows=await tx.query("select id from rib.activities where term=$1 and kind='w9-check' and not archived and coalesce((legacy->>'testOnly')::boolean,false)=$2",[term,testOnly]);
  demand(rows.length<=1,409,'W9 活動重複，請先確認。');if(rows.length)continue;
  needed.push({kind:'w9-check',testOnly});if(!apply)continue;const id=uid();
  await tx.query("insert into rib.activities(id,term,week,title,kind,phase,accepting,legacy) values($1,$2,9,$3,'w9-check','production',false,$4)",[id,term,(testOnly?'【測試】 ':'')+'W9 查核後提案 · 學習反思',json({testOnly})]);created.push(id);
  await tx.query("insert into rib.events(actor,activity_id,kind,resource,detail) values('maintenance:w9-check',$1,'w9-check-setup',$1,$2)",[id,json({testOnly})]);
 }return {term,applied:apply,needed,created};
});}
