import {uid,json} from './security.mjs';
import {currentTerm} from './terms.mjs';
// Dry run by default. Preserve existing rosters, draws and submissions.
export async function setupW8Materials(db,{apply=false}={}){return db.transaction(async tx=>{
 await tx.query('select id from rib.workspace_state where id=1 for update');const term=await currentTerm(tx),created=[],needed=[];
 for(const testOnly of [false,true]){
  const [existing]=await tx.query("select id from rib.activities where term=$1 and kind='w8-materials' and not archived and coalesce((legacy->>'testOnly')::boolean,false)=$2",[term,testOnly]);
  const materialsId=existing?.id||uid();
  if(!existing){needed.push({testOnly,kind:'w8-materials'});if(apply){
   await tx.query("insert into rib.activities(id,term,week,title,kind,phase,accepting,legacy) values($1,$2,8,$3,'w8-materials','production',false,$4)",[materialsId,term,(testOnly?'【測試】 ':'')+'W8 共讀材料 · 個人提案',json({testOnly})]);created.push(materialsId);
   await tx.query("insert into rib.events(actor,activity_id,kind,resource,detail) values('maintenance:w8-materials',$1,'w8-materials-setup',$1,$2)",[materialsId,json({testOnly,topicCount:6})]);
  }}
  const proposals=await tx.query("select id from rib.activities where term=$1 and kind='w8-proposal' and not archived and legacy->>'materialsActivityId'=$2 and coalesce((legacy->>'testOnly')::boolean,false)=$3",[term,materialsId,testOnly]);
  if(!proposals.length){needed.push({testOnly,kind:'w8-proposal'});if(apply){const id=uid();
   await tx.query("insert into rib.activities(id,term,week,title,kind,phase,accepting,legacy) values($1,$2,8,$3,'w8-proposal','production',false,$4)",[id,term,(testOnly?'【測試】 ':'')+'W8 我的提案 · 個人交件',json({testOnly,materialsActivityId:materialsId})]);created.push(id);
   await tx.query("insert into rib.events(actor,activity_id,kind,resource,detail) values('maintenance:w8-materials',$1,'w8-proposal-setup',$1,$2)",[id,json({testOnly,materialsActivityId:materialsId})]);
  }}
 }return {term,applied:apply,needed,created};
});}
