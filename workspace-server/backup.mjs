import {sha,demand} from './security.mjs';
export const TABLES=['students','credentials','teachers','activities','works','members','versions','reviews','replies','decisions','uploads','assessments','publications','events','legacy_records','legacy_files','migration_runs','workspace_state','term_drafts','term_changes','wall_comments','wall_votes','selections','activity_assets','ai_readings','ai_judgments','late_controls','late_checkpoints','late_deliveries','notification_reads'];
// Sessions and rate limits are ephemeral; restored users sign in again.
export async function snapshot(db){return db.transaction(async tx=>{
 await tx.query('set transaction isolation level repeatable read read only');
 const tables={};for(const name of TABLES)tables[name]=await tx.query(`select to_jsonb(t) as row from rib.${name} t`);
 for(const name of TABLES)tables[name]=tables[name].map(x=>x.row);
 const payload={format:'rib-backup-v7',created:new Date().toISOString(),tables};return {...payload,sha256:sha(JSON.stringify(payload))};
});}
export async function restoreEmpty(db,backup){
 const {sha256,...payload}=backup;demand(['rib-backup-v1','rib-backup-v2','rib-backup-v3','rib-backup-v4','rib-backup-v5','rib-backup-v6','rib-backup-v7'].includes(payload.format)&&sha(JSON.stringify(payload))===sha256,409,'備份雜湊不一致。');
 if(payload.format==='rib-backup-v1'){payload.tables.workspace_state=[];payload.tables.term_drafts=[];payload.tables.term_changes=[];}
 if(['rib-backup-v1','rib-backup-v2'].includes(payload.format))for(const name of ['wall_comments','wall_votes','selections','activity_assets'])payload.tables[name]=[];
 // V4 existed separately for published readings and local judgments; preserve either.
 if(!['rib-backup-v5','rib-backup-v6','rib-backup-v7'].includes(payload.format))for(const name of ['ai_readings','ai_judgments'])if(!(name in payload.tables))payload.tables[name]=[];
 if(!['rib-backup-v6','rib-backup-v7'].includes(payload.format))for(const name of ['late_controls','late_checkpoints','late_deliveries'])payload.tables[name]=[];
 if(payload.format!=='rib-backup-v7')payload.tables.notification_reads=[];
 demand(TABLES.every(t=>Array.isArray(payload.tables[t]))&&Object.keys(payload.tables).length===TABLES.length,400,'備份資料表不完整。');
 return db.transaction(async tx=>{
 for(const name of TABLES){if(name==='workspace_state'){const [state]=await tx.query('select * from rib.workspace_state where id=1');demand(!state?.current_term&&!state?.revision,409,'只能還原到獨立空白資料庫。');continue;}const [r]=await tx.query(`select count(*)::int as n from rib.${name}`);demand(r.n===0,409,'只能還原到獨立空白資料庫。');}
 await tx.query("select set_config('rib.restoring','true',true)");
 await tx.query('delete from rib.workspace_state where id=1');
 for(const name of TABLES){const rows=name==='workspace_state'?payload.tables[name].map(row=>({notifications_since:new Date().toISOString(),...row})):name==='publications'?payload.tables[name].map(row=>({featured:false,...row})):name==='works'?payload.tables[name].map(row=>({publication_hold:false,...row,publication_hold:row.publication_hold||false,current_version_id:null})):name==='members'?payload.tables[name].map(row=>({sharing_opt_out:false,...row})):payload.tables[name];for(let i=0;i<rows.length;i+=100)await tx.query(`insert into rib.${name} select * from jsonb_populate_recordset(null::rib.${name},$1::jsonb)`,[JSON.stringify(rows.slice(i,i+100))]);}
 for(const row of payload.tables.works)if(row.current_version_id)await tx.query('update rib.works set current_version_id=$1 where id=$2',[row.current_version_id,row.id]);
 await tx.query("select setval('rib.events_id_seq',greatest(coalesce((select max(id) from rib.events),0),1),exists(select 1 from rib.events))");
 // Stop all accepting activities on recovery; retain the original values in the backup.
 await tx.query('update rib.activities set accepting=false');
 await tx.query('insert into rib.workspace_state(id) values(1) on conflict do nothing');
 return Object.fromEntries(TABLES.map(t=>[t,payload.tables[t].length]));
 });
}
