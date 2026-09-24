import {uid,json} from './security.mjs';
import {currentTerm} from './terms.mjs';
// Called only during an explicitly authorized release, after backup and dry-run review.
export async function setupW7News(db,{apply=false}={}){return db.transaction(async tx=>{
 await tx.query('select id from rib.workspace_state where id=1 for update');
 const term=await currentTerm(tx);
 const rows=await tx.query("select * from rib.activities where kind='w7' and term=$1 and not archived",[term]);
 const report={term,activities:rows.length,applied:apply,created:[]};if(!apply)return report;
 for(const a of rows){
 const testOnly=!!a.legacy?.testOnly;
 let [existing]=await tx.query("select id from rib.activities where term=$1 and kind='w7-news' and not archived and coalesce((legacy->>'testOnly')::boolean,false)=$2",[a.term,testOnly]);
 const id=existing?.id||uid();
 if(!existing){await tx.query(`insert into rib.activities(id,term,week,title,kind,phase,accepting,legacy)
 values($1,$2,7,$3,'w7-news','production',false,$4)`,[id,a.term,(testOnly?'【測試】 ':'')+'W7 新聞 × 研究',json({testOnly,previousActivity:a.id})]);report.created.push(id);}
 // Retain every legacy work/version as read-only history, with no member conversion.
 await tx.query('update rib.activities set archived=true,accepting=false,revision=revision+1 where id=$1',[a.id]);
 await tx.query("insert into rib.events(actor,activity_id,kind,resource,detail) values('maintenance:w7-news',$1,'w7-news-setup',$1,$2)",[id,json({previousActivity:a.id})]);
 }return report;
});}
