import {randomInt} from 'node:crypto';
import {W7_TOPICS,w7Topic} from '../workspace/w7-topics.js';
import {W8_TOPICS,w8Topic} from '../workspace/w8-topics.js';
import {GroupMembership} from './group-membership.mjs';
import {w5SelectableTopic} from '../workspace/w5-topics.js';
import {demand} from './security.mjs';
export class TopicSelection extends GroupMembership{
 // Serialize on the activity before reading counts. Repeated draws return the saved choice.
 async drawTopic(p,input){
  demand(p.role==='student',403,'請由本組學生抽題。');
  const initial=await this.work(p,input.workId,{write:true});
  return this.db.transaction(async db=>{
   await db.query('select id from rib.activities where id=$1 for update',[initial.activity_id]);
   await db.query('select id from rib.works where id=$1 for update',[initial.id]);
   const w=await this.work(p,initial.id,{write:true,db});
   demand(['w7-news','w8-materials'].includes(w.kind)&&p.student.is_test===w.test_only,403,'請在自己的新聞與研究小組或 W8 共讀小組抽題。');
   const pool=w.kind==='w8-materials'?W8_TOPICS:W7_TOPICS,lookup=w.kind==='w8-materials'?w8Topic:w7Topic;
   if(lookup(w.topic))return {saved:true,workId:w.id,topic:w.topic};
   demand(w.revision===input.expectedRevision,409,'小組已更新，請重新整理再抽題。');
   demand(!(await db.query('select id from rib.versions where work_id=$1',[w.id])).length,409,'已有作品，請老師核對題材。');
   // Leaving and recreating a group must not become a reroll mechanism.
   const prior=await db.query(`select old.id from rib.works old join rib.members om on om.work_id=old.id
    join rib.members current on current.student_id=om.student_id and current.term=om.term
    where old.activity_id=$1 and old.id<>$2 and old.topic=any($3::text[])
    and current.work_id=$2 and current.status='confirmed' limit 1`,[w.activity_id,w.id,pool.map(t=>t.id)]);
   demand(!prior.length,409,'有組員已在另一組抽過題，請老師先核對分組；重新組隊不會重新抽題。');
   const counts=await db.query(`select topic,count(*)::int as total,count(*) filter(where class_name=$2)::int as class_total
    from rib.works where activity_id=$1 and topic=any($3::text[]) and not hidden
    and exists(select 1 from rib.members m where m.work_id=rib.works.id and m.status='confirmed') group by topic`,[w.activity_id,w.class_name,pool.map(t=>t.id)]);
   const all=pool.map(t=>({id:t.id,...counts.find(c=>c.topic===t.id)}));
   const minimum=Math.min(...all.map(t=>t.total||0)),least=all.filter(t=>(t.total||0)===minimum);
   const classMinimum=Math.min(...least.map(t=>t.class_total||0)),choices=least.filter(t=>(t.class_total||0)===classMinimum);
   const topic=choices[randomInt(choices.length)].id;
   await db.query('update rib.works set topic=$2,revision=revision+1 where id=$1',[w.id,topic]);
   await this.event(db,p,w.activity_id,'draw-topic',w.id,{topic,method:'minimum-total-then-class-random-v1'});
   return {saved:true,workId:w.id,topic};
  });
 }

 async chooseTopic(p,input){
  demand(p.role==='student',403,'請使用學生帳號選題。');const a=await this.activity(p,input.activityId);demand(a.kind==='w5-personal',400,'這個活動不使用此選題表單。');demand(w5SelectableTopic(input.topic),400,'請從本週自選題中選一題。');
  const work=await this.ensureWork(p,{activityId:a.id});return this.db.transaction(async db=>{
   await db.query('select id from rib.works where id=$1 for update',[work.id]);const w=await this.work(p,work.id,{write:true,db});
   demand(w.revision===input.expectedRevision,409,'選題或作品已更新，請重新整理後再選。');
   const versions=await db.query('select id from rib.versions where work_id=$1',[w.id]);demand(!versions.length||w.topic===input.topic,409,'已交件後保留同一題，修訂請延續原作品。');
   if(w.topic===input.topic)return {saved:true,workId:w.id,topic:w.topic};
   await db.query('update rib.works set topic=$2,revision=revision+1 where id=$1',[w.id,input.topic]);await this.event(db,p,a.id,'choose-topic',w.id,{topic:input.topic});return {saved:true,workId:w.id,topic:input.topic};
  });
 }
}
