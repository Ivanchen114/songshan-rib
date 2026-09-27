import {demand,uid,json} from './security.mjs';
import {currentTerm} from './terms.mjs';
import {ACTIVITY} from '../workspace/activities.js';
import {READING_KINDS} from '../workspace/reading-evidence.js';
export const READING_SETUP_KINDS=[...READING_KINDS,'w15-personal-deck'];
// Repeatable setup; a normal invocation is read-only and new activities are closed.
export async function setupReadingWeeks(db,{apply=false}={}){return db.transaction(async tx=>{
 await tx.query('select id from rib.workspace_state where id=1 for update');
 const term=await currentTerm(tx),needed=[],created=[];
 for(const kind of READING_SETUP_KINDS)for(const testOnly of [false,true]){
  const rows=await tx.query("select id from rib.activities where term=$1 and kind=$2 and not archived and coalesce((legacy->>'testOnly')::boolean,false)=$3",[term,kind,testOnly]);
  demand(rows.length<=1,409,'本週活動重複，請先確認。');if(rows.length)continue;
  needed.push({kind,testOnly});if(!apply)continue;
  const id=uid(),def=ACTIVITY[kind];
  await tx.query("insert into rib.activities(id,term,week,title,kind,phase,accepting,legacy) values($1,$2,$3,$4,$5,'production',false,$6)",[id,term,def.week,(testOnly?'【測試】 ':'')+def.title,kind,json({testOnly})]);
  await tx.query("insert into rib.events(actor,activity_id,kind,resource,detail) values('maintenance:reading-weeks',$1,'reading-weeks-setup',$1,$2)",[id,json({kind,testOnly})]);created.push(id);
 }return {term,applied:apply,needed,created};
});}
