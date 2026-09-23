// One-time, audited conversion of validated legacy invitations. No roster or image writes.
import {demand,json} from './security.mjs';
export async function upgradeGroups(db,{apply=false}={}){return db.transaction(async tx=>{
 await tx.query('select id from rib.workspace_state for update');
 const rows=await tx.query(`select m.work_id,m.student_id,m.term as member_term,w.activity_id,a.term,w.class_name,coalesce((a.legacy->>'testOnly')::boolean,false) as test_only,s.active,s.class_name as student_class,s.is_test,
 (select count(*)::int from rib.members x where x.work_id=w.id and x.status in ('confirmed','invited')) as size,
 (select count(*)::int from rib.members x join rib.works y on y.id=x.work_id where y.activity_id=w.activity_id and x.student_id=m.student_id and x.status in ('confirmed','invited')) as memberships,
 (select count(*)::int from rib.versions v where v.work_id=w.id) as versions
 from rib.members m join rib.works w on w.id=m.work_id join rib.activities a on a.id=w.activity_id left join rib.students s on s.term=m.term and s.student_id=m.student_id
 where m.status='invited' and not a.archived and a.kind in ('w3-rebuild','w5-workshop','w15-deck') order by w.id`);
 const invalid=rows.filter(r=>!r.active||r.member_term!==r.term||r.class_name!==r.student_class||r.test_only!==r.is_test||r.memberships!==1);
 const works=[...new Set(rows.map(r=>r.work_id))],held=works.filter(id=>rows.find(r=>r.work_id===id).versions>0);
 const report={members:rows.length,works:works.length,invalid:invalid.length,preservedOversizedGroups:new Set(rows.filter(r=>r.size>4).map(r=>r.work_id)).size,heldWorks:held.length,applied:apply};
 if(!apply)return report;
 demand(!invalid.length,409,'Legacy group validation failed; no changes applied.');
 for(const id of works){const group=rows.filter(r=>r.work_id===id),r=group[0];
  await tx.query("update rib.members set status='confirmed' where work_id=$1 and status='invited'",[id]);
  await tx.query('update rib.works set revision=revision+1,publication_hold=publication_hold or $2 where id=$1',[id,r.versions>0]);
  if(r.versions>0)await tx.query("update rib.publications set status='withdrawn',featured=false where version_id in (select id from rib.versions where work_id=$1)",[id]);
  await tx.query("insert into rib.events(actor,activity_id,kind,resource,detail) values('maintenance:direct-group-join',$1,'group-join-migration',$2,$3)",[r.activity_id,id,json({studentIds:group.map(m=>m.student_id),previousStatus:'invited',publicationHeld:r.versions>0})]);
 }
 return report;
});}
