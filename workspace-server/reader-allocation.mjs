import {randomInt} from 'node:crypto';
const shuffle=xs=>{const a=[...xs];for(let i=a.length-1;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
// Directed reading assignments; odd-sized classes do not require pairs.
export function planReaders(students,works,reviews,firstVersions,absentIds=[]){
 const absent=new Set(absentIds),present=students.filter(s=>!absent.has(s.student_id)),presentIds=new Set(present.map(s=>s.student_id));
 const active=reviews.filter(r=>r.status!=='cancelled'),repairable=r=>r.status==='requested'||(!presentIds.has(r.reviewer_id)&&r.status!=='done');
 const targets=works.filter(w=>presentIds.has(w.owner_id)&&!active.some(r=>r.target_work_id===w.id&&!repairable(r)));
 const targetIds=new Set(targets.map(w=>w.id)),releasing=active.filter(r=>targetIds.has(r.target_work_id)&&repairable(r));
 const completed=sid=>active.filter(r=>r.reviewer_id===sid&&r.status==='done').length;
 const readers=shuffle(present.filter(s=>!active.some(r=>r.reviewer_id===s.student_id&&r.status!=='done'&&!releasing.includes(r)))).sort((a,b)=>completed(a.student_id)-completed(b.student_id));
 const seen=(sid,w)=>reviews.some(r=>r.reviewer_id===sid&&r.target_work_id===w.id),eligible=(s,w)=>s.student_id!==w.owner_id&&!seen(s.student_id,w);
 const matches=new Map();
 // Complete submitted targets first. Later augmenting paths may move their readers,
 // but never remove their coverage, avoiding avoidable gaps in odd/sparse graphs.
 for(const readyOnly of [true,false]){
  const group=targets.filter(w=>!readyOnly||firstVersions.has(w.id));
  const edges=new Map(readers.map(s=>[s.student_id,shuffle(group.filter(w=>eligible(s,w)))]));
  const assign=(sid,visited)=>{for(const w of edges.get(sid)||[]){if(visited.has(w.id))continue;visited.add(w.id);if(!matches.has(w.id)||assign(matches.get(w.id),visited)){matches.set(w.id,sid);return true;}}return false;};
  for(const s of readers)if(![...matches.values()].includes(s.student_id))assign(s.student_id,new Set());
 }
 const unmatched=targets.filter(w=>!matches.has(w.id)).map(w=>{const owner=present.find(s=>s.student_id===w.owner_id),others=present.filter(s=>s.student_id!==w.owner_id),possible=others.filter(s=>eligible(s,w));return {workId:w.id,seat:owner.seat,name:owner.name,reason:!others.length?'沒有其他可參與的同班讀者':!possible.length?'其他可參與同學都已有此作品的閱讀或換件紀錄':'合適讀者仍有任務，或本輪已補讀另一份；完成後可再按補齊缺額'};});
 return {matches,releasing,unmatched,extra:[...matches.values()].filter(sid=>completed(sid)>0).length};
}
