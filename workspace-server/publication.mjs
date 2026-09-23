import {AGREEMENT_VERSION,AGREEMENT_HASH} from './agreement.mjs';
import {demand} from './security.mjs';
// Shared by listing and detail: a withdrawn/held/test work must never yield fresh image URLs.
export const publicWhere=`p.status='published' and not w.hidden and not w.publication_hold
 and not coalesce((a.legacy->>'testOnly')::boolean,false)
 and exists(select 1 from rib.members where work_id=w.id and status='confirmed')
 and not exists(select 1 from rib.members m join rib.students s using(term,student_id)
  where m.work_id=w.id and m.status<>'declined' and (m.sharing_opt_out or coalesce(s.sharing_agreement->>'version','')<>'${AGREEMENT_VERSION}' or coalesce(s.sharing_agreement->>'documentHash','')<>'${AGREEMENT_HASH}' or m.status<>'confirmed' or s.is_test))`;
export const publicFrom='rib.publications p join rib.versions v on v.id=p.version_id join rib.works w on w.id=v.work_id join rib.activities a on a.id=w.activity_id';
export async function autoPublish(db,workId){
 if(process.env.RIB_ACCEPTANCE_ONLY==='true')return false;
 const [r]=await db.query(`select p.id,v.media from ${publicFrom} where w.id=$1 and not w.hidden and not w.publication_hold and not a.archived
  and not coalesce((a.legacy->>'testOnly')::boolean,false) and v.metadata->>'publicDisplay'='true'
  and v.ordinal=(select max(ordinal) from rib.versions where work_id=w.id)
  and exists(select 1 from rib.members where work_id=w.id and status='confirmed')
  and not exists(select 1 from rib.members m join rib.students s using(term,student_id) where m.work_id=w.id and m.status<>'declined' and (m.sharing_opt_out or coalesce(s.sharing_agreement->>'version','')<>'${AGREEMENT_VERSION}' or coalesce(s.sharing_agreement->>'documentHash','')<>'${AGREEMENT_HASH}' or m.status<>'confirmed' or s.is_test))`,[workId]);
 if(!r?.media.length||!r.media.every(m=>m.displayHash&&m.fullKey&&m.thumbKey))return false;
 await db.query("update rib.publications set status='withdrawn' where version_id in(select id from rib.versions where work_id=$1) and id<>$2 and status='published'",[workId,r.id]);
 await db.query("update rib.publications set status='published',title='匿名作品' where id=$1",[r.id]);return true;
}
export async function galleryList(db,store,input={}){
 if(process.env.RIB_ACCEPTANCE_ONLY==='true')return {items:[],hasMore:false};
 const page=Number(input.page||0);demand(Number.isInteger(page)&&page>=0&&page<=1000,400,'頁碼不正確。');
 const rows=await db.query(`select p.id,p.title,a.week,v.media from ${publicFrom} where ${publicWhere} order by p.created_at desc,p.id desc limit 25 offset $1`,[page*24]);
 return {items:await Promise.all(rows.slice(0,24).map(async r=>({id:r.id,title:r.title,week:r.week,thumbnails:await Promise.all(r.media.map(m=>store.signRead(m.thumbKey)))}))),hasMore:rows.length>24};
}
export async function galleryDetail(db,store,input){
 demand(process.env.RIB_ACCEPTANCE_ONLY!=='true',404,'這件作品目前沒有公開。');
 const [r]=await db.query(`select p.id,p.title,a.week,v.media from ${publicFrom} where p.id=$1 and ${publicWhere}`,[String(input.publicationId||'')]);
 demand(r,404,'這件作品目前沒有公開。');return {id:r.id,title:r.title,week:r.week,images:await Promise.all(r.media.map(m=>store.signRead(m.fullKey)))};
}
