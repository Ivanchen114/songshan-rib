// Additive normalization of the already-preserved source records. Never reimports a roster.
import {sha,json,uid,demand} from './security.mjs';
import {ACTIVITY} from '../workspace/activities.js';
export async function upgradeCourse(db,{enable=false,tests=false}={}){
 return db.transaction(async tx=>{
  await tx.query('select id from rib.workspace_state where id=1 for update');
  const activities=await tx.query('select * from rib.activities'),records=await tx.query("select * from rib.legacy_records where source_table like 'logical:%'");
  for(const row of records)demand(/^[a-f0-9]{64}$/.test(row.source_hash),409,'原始封存紀錄雜湊不符，停止整合。');
  const logical=table=>records.filter(r=>r.source_table==='logical:'+table).map(r=>r.payload);
  const kindOf=a=>({'w3-rebuild':'w3-rebuild','w3-personal-art':'w3-personal','w7-media-card':'w7','w15-public-deck':'w15-deck'}[a.legacy?.template?.id]||(a.kind==='legacy'&&a.week===3&&!a.legacy?.parentActivityId?'w3-rebuild':null));
  let normalized=0;
  for(const a of activities){const kind=kindOf(a);if(kind&&a.kind==='legacy'){await tx.query('update rib.activities set kind=$1,phase=$2,accepting=$3,revision=revision+1 where id=$4',[kind,a.legacy?.revealed?'exhibit':'production',enable&&!a.archived&&a.legacy?.accepting===true&&!a.legacy?.closed,a.id]);normalized++;}
   if(a.kind==='legacy'&&a.legacy?.template?.id==='w5-story-film')await tx.query('update rib.activities set accepting=false,archived=true where id=$1',[a.id]);
  }
  const files=await tx.query('select * from rib.legacy_files'),sourceVersions=logical('Versions');
  for(const source of sourceVersions){const [v]=await tx.query('select * from rib.versions where id=$1',[source.id]);if(!v)continue;
   const a=activities.find(a=>a.id===source.activityId);const metadata={...v.metadata,...(['w3-rebuild','w3-personal'].includes(kindOf(a||{}))?{text:source.prompt||''}:{}),topic:source.topic||null,purpose:source.purpose||null,layout:source.layout||null};
   if(source.projectId){const f=files.find(f=>f.source_id===source.projectId);demand(f,409,'缺少已搬遷的舊專案。');metadata.legacyProjectKey=f.object_key;}
   await tx.query('update rib.versions set metadata=$1 where id=$2',[json(metadata),v.id]);
  }
  for(const t of logical('Teams'))if(t.currentVersionId){const [v]=await tx.query('select id from rib.versions where id=$1 and work_id=$2',[t.currentVersionId,t.id]);if(v)await tx.query('update rib.works set current_version_id=$1 where id=$2 and current_version_id is null',[v.id,t.id]);}
  for(const c of logical('Comments')){if(c.kind==='reader'||c.kind?.startsWith('w45'))continue;const [a]=await tx.query('select kind from rib.activities where id=$1',[c.activityId]);if(!['w3-rebuild','w3-personal','w4'].includes(a?.kind))continue;
   const works=await tx.query('select id from rib.works where activity_id=$1 and id=any($2::text[])',[c.activityId,[c.teamId,c.targetId]]);if(!works.some(w=>w.id===c.teamId)||!works.some(w=>w.id===c.targetId))continue;
   await tx.query('insert into rib.wall_comments(id,activity_id,target_work_id,actor_work_id,body,request_id,hidden,created_at) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict do nothing',[c.id,c.activityId,c.targetId,c.teamId,c.text||'',c.requestId||'legacy-'+c.id,!!c.hidden,c.created||new Date().toISOString()]);
  }
  for(const v of logical('Votes')){await tx.query('insert into rib.wall_votes(activity_id,actor_work_id,target_work_id,active) select $1,$2,$3,$4 where exists(select 1 from rib.works where id=$2) and exists(select 1 from rib.works where id=$3) on conflict do nothing',[v.activityId,v.teamId,v.targetId,v.active===true]);}
  for(const a of activities){if(kindOf(a)!=='w3-rebuild'||!a.legacy?.originalId)continue;const original=sourceVersions.find(v=>v.id===a.legacy.originalId),f=original&&files.find(f=>f.source_id===original.fileId);demand(f,409,'缺少 W3 教師原圖的私人副本。');
   await tx.query('insert into rib.activity_assets(id,activity_id,actor,request_id,file,media,completed,created_at) values($1,$2,$3,$4,$5,$6,true,$7) on conflict do nothing',['legacy-original-'+a.id,a.id,'legacy','legacy-original',json({}),json([{originalKey:f.object_key,fullKey:f.object_key+'-display.jpg',thumbKey:f.object_key+'-thumb.jpg'}]),original.created||new Date().toISOString()]);
  }
  for(const s of logical('Selections'))await tx.query('insert into rib.selections(term,student_id,version_ids,revision) values($1,$2,$3,$4) on conflict do nothing',[s.term,s.studentId,json(s.versionIds||[]),s.revision||1]);
  const [current]=await tx.query('select current_term from rib.workspace_state where id=1');const term=current?.current_term||activities.map(a=>a.term).sort().at(-1);demand(term,409,'找不到目前學期。');
  if(!(await tx.query("select id from rib.activities where term=$1 and kind='w15-deck' and not coalesce((legacy->>'testOnly')::boolean,false)",[term])).length)await tx.query("insert into rib.activities(id,term,week,title,kind,accepting,legacy) values($1,$2,15,'W15–W16 公共說明作品','w15-deck',false,$3)",[uid(),term,json({courseUpgrade:1})]);
  if(tests)for(const kind of ['w3-rebuild','w3-personal','w7','w15-deck'])if(!(await tx.query('select id from rib.activities where term=$1 and kind=$2 and legacy->>\'testOnly\'=\'true\'',[term,kind])).length)await tx.query("insert into rib.activities(id,term,week,title,kind,phase,accepting,legacy) values($1,$2,$3,$4,$5,'exhibit',true,$6)",[uid(),term,ACTIVITY[kind].week,'【測試】'+ACTIVITY[kind].title,kind,json({testOnly:true,courseUpgrade:1})]);
  return {normalized,comments:(await tx.query('select count(*)::int as n from rib.wall_comments'))[0].n,term};
 });
}
