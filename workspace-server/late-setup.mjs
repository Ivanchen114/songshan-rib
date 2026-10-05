import {demand,uid,json} from './security.mjs';
import {currentTerm} from './terms.mjs';
import {ACTIVITY,LATE_KINDS} from '../workspace/activities.js';
export async function setupLateCheckpoints(db,{apply=false}={}){return db.transaction(async tx=>{
 await tx.query('select id from rib.workspace_state where id=1 for update');const term=await currentTerm(tx);demand(term,409,'請先確認現行學期。');const needed=[],created=[];
 for(const kind of LATE_KINDS)for(const testOnly of [false,true]){
  const found=await tx.query("select id from rib.activities where term=$1 and kind=$2 and not archived and coalesce((legacy->>'testOnly')::boolean,false)=$3",[term,kind,testOnly]);demand(found.length<=1,409,'同一活動出現重複，請先核對。');if(found.length)continue;
  needed.push({kind,testOnly});if(!apply)continue;const id=uid(),def=ACTIVITY[kind];
  await tx.query("insert into rib.activities(id,term,week,title,kind,phase,accepting,legacy) values($1,$2,$3,$4,$5,'production',false,$6)",[id,term,def.week,(testOnly?'【測試】 ':'')+def.title,kind,json({testOnly})]);created.push(id);
  await tx.query("insert into rib.events(actor,activity_id,kind,resource,detail) values('maintenance:late-checkpoints',$1,'late-setup',$1,$2)",[id,json({kind,testOnly})]);
 }return {term,applied:apply,needed,created};
});}
