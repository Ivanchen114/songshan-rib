import {publishedReadings} from './w4-remediation.mjs';
import sharp from 'sharp';
import {Weekly} from './weekly.mjs';
import {demand,teacherScope,rate} from './security.mjs';
export class Journey extends Weekly {
 async journeyStudent(p,input,db=this.db){
 const term=p.role==='student'?p.term:input.term,studentId=p.role==='student'?p.studentId:input.studentId;
 demand(/^\d{3}0[12]$/.test(term||'')&&/^\d{8}$/.test(studentId||''),400,'請選擇學期與學生。');
 if(p.role==='student')demand((!input.term||input.term===term)&&(!input.studentId||input.studentId===studentId),403,'只能查看自己的學期作品。');
 const [s]=await db.query('select term,student_id,name,class_name,seat,is_test from rib.students where term=$1 and student_id=$2',[term,studentId]);demand(s,404,'找不到學生。');if(p.role!=='student')teacherScope(p,term,s.class_name);return s;
 }
 async journey(p,input){
 const s=await this.journeyStudent(p,input),works=await this.db.query(`select w.id,w.class_name,w.current_version_id,a.id as activity_id,a.week,a.title,a.kind,a.archived from rib.works w join rib.activities a on a.id=w.activity_id join rib.members m on m.work_id=w.id where m.term=$1 and m.student_id=$2 and m.status='confirmed' and a.term=$1 and not w.hidden and coalesce((a.legacy->>'testOnly')::boolean,false)=$3 order by a.week,w.created_at`,[s.term,s.student_id,s.is_test]);
 const allowed=works.filter(w=>{if(p.role==='student')return true;try{teacherScope(p,s.term,w.class_name);return true;}catch{return false;}}),ids=allowed.map(w=>w.id);
 const activities=await this.db.query('select id,legacy from rib.activities where id=any($1::text[])',[allowed.map(w=>w.activity_id)]);
 const [versions,reviews,decisions]=await Promise.all([
 this.db.query('select id,work_id,ordinal,metadata,created_at,jsonb_array_length(media) as image_count from rib.versions where work_id=any($1::text[]) order by ordinal',[ids]),
 this.db.query("select id,target_work_id,version_id,situation,meaning,submitted_at from rib.reviews where target_work_id=any($1::text[]) and status='done' order by submitted_at",[ids]),
 this.db.query('select work_id,choice,reason,version_id,created_at from rib.decisions where work_id=any($1::text[]) and student_id=$2 order by created_at',[ids,s.student_id])]);
 return {term:s.term,person:{studentId:s.student_id,name:s.name,className:s.class_name,seat:s.seat},works:allowed.map(w=>({...w,teacherReadings:publishedReadings(activities.find(a=>a.id===w.activity_id),w.id),versions:versions.filter(v=>v.work_id===w.id).map(v=>({...v,metadata:{text:v.metadata.text||'',topics:v.metadata.topics||[],topic:v.metadata.topic||'',purpose:v.metadata.purpose||''}})),reviews:reviews.filter(r=>r.target_work_id===w.id),decisions:decisions.filter(d=>d.work_id===w.id)}))};
 }
 async journeyMedia(p,input){
 const s=await this.journeyStudent(p,input),[v]=await this.db.query(`select v.media,w.class_name,a.legacy from rib.versions v join rib.works w on w.id=v.work_id join rib.activities a on a.id=w.activity_id join rib.members m on m.work_id=w.id where v.id=$1 and m.student_id=$2 and m.term=$3 and m.status='confirmed' and a.term=$3 and not w.hidden`,[input.versionId,s.student_id,s.term]);
 demand(v&&!!v.legacy?.testOnly===s.is_test,403,'只能查看自己的作品版本。');if(p.role!=='student')teacherScope(p,s.term,v.class_name);
 if(input.export==='true'){await rate(this.db,'portfolio-export:'+s.term+':'+s.student_id,60,60);const n=Number(input.index);demand(Number.isInteger(n)&&n>=0&&n<v.media.length,400,'請選擇圖片。');demand(v.media[n].fullKey,409,'這張圖片尚未完成搬遷。');const bytes=await this.store.get(v.media[n].fullKey),display=await sharp(bytes).rotate().resize({width:1400,height:1400,fit:'inside',withoutEnlargement:true}).jpeg({quality:85}).toBuffer();return {dataUrl:'data:image/jpeg;base64,'+display.toString('base64')};}
 return {images:await Promise.all(v.media.map(async m=>({url:await this.store.signRead(m.thumbKey||m.fullKey)})))};
 }
}
