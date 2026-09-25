import {demand} from './security.mjs';
import {w8Topic} from '../workspace/w8-topics.js';

// Resolve from confirmed membership, never from a browser-supplied topic/group.
export async function proposalSource(db,p,a){
 const sourceId=a.legacy?.materialsActivityId;
 demand(sourceId,409,'個人交件入口尚未連到本週小組題材，請老師確認。');
 const rows=await db.query(`select w.id,w.topic from rib.works w
  join rib.activities a on a.id=w.activity_id
  join rib.members m on m.work_id=w.id
  where a.id=$1 and a.term=$2 and a.kind='w8-materials' and not a.archived
  and coalesce((a.legacy->>'testOnly')::boolean,false)=$3
  and m.student_id=$4 and m.status='confirmed' and not w.hidden`,
 [sourceId,p.term,!!p.student.is_test,p.studentId]);
 demand(rows.length===1&&w8Topic(rows[0].topic),409,'請先在小組題材入口加入正確小組，並完成抽題。');
 return rows[0];
}
