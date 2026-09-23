import {uid,json} from './security.mjs';
export async function upgradeW5Personal(db,{apply=false}={}){return db.transaction(async tx=>{
 await tx.query('select id from rib.workspace_state where id=1 for update');
 const rows=await tx.query("select a.*,(select count(*)::int from rib.works w where w.activity_id=a.id) as works from rib.activities a where kind='w5-workshop' and not archived");
 const report={activities:rows.length,inPlace:rows.filter(a=>!a.works).length,preserveHistory:rows.filter(a=>a.works).length,applied:apply};if(!apply)return report;
 for(const a of rows){const title=(a.legacy?.testOnly?'【測試】':'')+'W5 個人文字轉圖';
 if(!a.works)await tx.query("update rib.activities set kind='w5-personal',title=$2,revision=revision+1 where id=$1",[a.id,title]);
 else{await tx.query("update rib.activities set archived=true,accepting=false,title=$2,revision=revision+1 where id=$1",[a.id,a.title+'（舊小組歷程）']);await tx.query("insert into rib.activities(id,term,week,title,kind,phase,accepting,legacy) values($1,$2,5,$3,'w5-personal',$4,$5,$6)",[uid(),a.term,title,a.phase,a.accepting,json({...a.legacy,previousGroupActivity:a.id})]);}
 await tx.query("insert into rib.events(actor,activity_id,kind,resource,detail) values('maintenance:w5-personal',$1,'w5-personal-upgrade',$1,$2)",[a.id,json({keptGroupHistory:!!a.works})]);
 }
 return report;
});}
