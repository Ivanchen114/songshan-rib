import {gzipSync} from 'node:zlib';
import {snapshot} from './backup.mjs';
import {sha,uid,demand,json} from './security.mjs';
export async function dailySnapshot(db,store,{force=false,actor='system:daily-backup'}={}){
 // Taipei calendar day; only a previous scheduled run may skip the schedule (a daytime manual backup must not).
 const day=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'});
 const [previous]=await db.query("select detail,created_at from rib.events where kind='database-backup' and resource=$1 and actor=$2 order by id desc limit 1",[day,actor]);
 if(previous&&!force)return {saved:true,alreadySaved:true,at:previous.created_at};
 try{const backup=await snapshot(db),bytes=gzipSync(Buffer.from(JSON.stringify(backup))),key=`backups/daily/${day}/${uid()}.json.gz`;await store.put(key,bytes,'application/gzip');
 demand(sha(await store.get(key,64*1024*1024))===sha(bytes),409,'備份讀回不一致。');
 const detail={key,sha256:backup.sha256,compressedHash:sha(bytes),bytes:bytes.length,tables:Object.fromEntries(Object.entries(backup.tables).map(([k,v])=>[k,v.length])),mediaIncluded:false};
 await db.query("insert into rib.events(actor,kind,resource,detail) values($1,'database-backup',$2,$3)",[actor,day,json(detail)]);return {saved:true,at:backup.created,sha256:backup.sha256};
 }catch(e){await db.query("insert into rib.events(actor,kind,resource,detail) values($1,'database-backup-failed',$2,$3)",[actor,day,json({reason:'備份未完成或讀回核對失敗；請維護者檢查資料庫與圖片儲存服務。'})]).catch(()=>{});throw e;}
}
export async function maintenanceStatus(db,p){
 demand(['admin','teacher'].includes(p.role),403,'系統維護資訊只供教師查看。');
 const [last]=await db.query("select created_at,detail from rib.events where kind='database-backup' order by id desc limit 1");
 const [failure]=await db.query("select created_at from rib.events where kind='database-backup-failed' order by id desc limit 1");
 return {dailyConfigured:!!process.env.CRON_SECRET,last:last?{at:last.created_at,bytes:last.detail.bytes,sha256:last.detail.sha256}:null,stale:!last||Date.now()-new Date(last.created_at).getTime()>48*3600000,failedAfterSuccess:!!failure&&(!last||new Date(failure.created_at)>new Date(last.created_at)),mediaIncluded:false,canRun:p.role==='admin',tokenReviewDate:'2026-10-23'};
}
