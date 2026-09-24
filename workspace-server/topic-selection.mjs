import {GroupMembership} from './group-membership.mjs';
import {w5SelectableTopic} from '../workspace/w5-topics.js';
import {demand} from './security.mjs';
export class TopicSelection extends GroupMembership{
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
