import {randomInt} from 'node:crypto';
import {Accounts} from './accounts.mjs';
import {currentTerm} from './terms.mjs';
import {demand,teacherScope,sha,json,verifier,text} from './security.mjs';
export function parseRoster(raw){
 demand(typeof raw==='string'&&raw.length<=20000,400,'請貼上學號、姓名、班級、座號四欄。');
 const lines=raw.trim().split(/\r?\n/).filter(x=>x.trim());if(lines[0]?.includes('學號'))lines.shift();
 demand(lines.length>0&&lines.length<=100,400,'每批請輸入 1–100 位學生。');
 const rows=lines.map(line=>{const cells=line.split('\t').map(x=>x.trim());demand(cells.length===4,400,'請從試算表複製四欄：學號、姓名、班級、座號。');const [studentId,name,className,seatText]=cells,seat=Number(seatText);demand(/^\d{8}$/.test(studentId)&&name.length>0&&name.length<=60&&className.length>0&&className.length<=20&&/^\d{1,3}$/.test(seatText)&&seat>0,400,'請核對八碼學號、姓名、班級及 1–999 的座號。');return {studentId,name,className,seat};});
 demand(new Set(rows.map(x=>x.studentId)).size===rows.length&&new Set(rows.map(x=>x.className+':'+x.seat)).size===rows.length,400,'本批有重複學號或班級座號。');return rows;
}
export class Roster extends Accounts {
 async rosterPlan(p,input,db=this.db){
 demand(['teacher','admin'].includes(p.role),403,'名單維護只開放教師。');
 const term=await currentTerm(db);demand(input.term===term,409,'只能維護目前學期名單。');demand(process.env.RIB_ACCEPTANCE_ONLY!=='true',403,'驗收站不能新增正式學生。');
 const rows=parseRoster(input.text);for(const s of rows)teacherScope(p,term,s.className);
 const existing=await db.query('select student_id,name,class_name,seat,is_test from rib.students where term=$1 order by student_id',[term]);
 const added=[],skipped=[];
 for(const s of rows){const old=existing.find(x=>x.student_id===s.studentId);if(old){demand(old.name===s.name&&old.class_name===s.className&&old.seat===s.seat&&!old.is_test,409,'已有相同學號但資料不同，請先在帳號管理核對，不會覆蓋既有學生。');skipped.push(s);}else{demand(!existing.some(x=>x.class_name===s.className&&x.seat===s.seat&&!x.is_test),409,`${s.className} 班 ${s.seat} 號已有人使用。`);added.push(s);}}
 return {term,added,skipped,fingerprint:sha(json({term,rows,existing}))};
 }
 async rosterPreview(p,input){return this.rosterPlan(p,input);}
 async rosterImport(p,input){
 demand(['teacher','admin'].includes(p.role),403,'名單維護只開放教師。');
 demand(input.confirmed===true,400,'請核對後確認新增名單。');
 return this.db.transaction(async db=>{
 await db.query('select id from rib.workspace_state where id=1 for update');
 const plan=await this.rosterPlan(p,input,db);
 demand(plan.fingerprint===input.fingerprint,409,'名單已變更，請重新預覽。若剛才連線中斷，先重新載入帳號列表，已新增者勿重複新增；遺失新碼可個別重設。');
 demand(plan.added.length>0,409,'本批沒有需要新增的學生。');const codes=[];
 for(const s of plan.added){const code=String(randomInt(1000000)).padStart(6,'0'),v=await verifier(code);await db.query('insert into rib.students(term,student_id,name,class_name,seat) values($1,$2,$3,$4,$5)',[plan.term,s.studentId,s.name,s.className,s.seat]);await db.query('insert into rib.credentials(term,student_id,algorithm,salt,digest) values($1,$2,$3,$4,$5)',[plan.term,s.studentId,v.algorithm,v.salt,v.digest]);codes.push({...s,code});}
 await this.event(db,p,null,'roster-import',plan.term,{studentIds:plan.added.map(s=>s.studentId),count:codes.length});
 return {term:plan.term,codes};
 });
 }
 async studentProfile(p,input){
 demand(['admin','teacher'].includes(p.role),403,'名單維護只開放教師。');const name=text(input.name,60),seat=Number(input.seat);demand(Number.isInteger(seat)&&seat>0&&seat<=999,400,'座號須為 1–999。');
 return this.db.transaction(async db=>{
 await db.query('select id from rib.workspace_state where id=1 for update');demand(input.term===await currentTerm(db),409,'只可維護目前學期。');
 const [s]=await db.query('select * from rib.students where term=$1 and student_id=$2 for update',[input.term,input.studentId]);demand(s,404,'找不到學生。');teacherScope(p,s.term,s.class_name);demand(process.env.RIB_ACCEPTANCE_ONLY!=='true'||s.is_test,403,'驗收站只能調整測試帳號。');
 const [c]=await db.query('select revision from rib.credentials where term=$1 and student_id=$2 for update',[s.term,s.student_id]);demand(c?.revision===input.expectedRevision,409,'名單已更新，請重新載入。');
 const [taken]=await db.query('select 1 from rib.students where term=$1 and class_name=$2 and seat=$3 and student_id<>$4 and is_test=$5',[s.term,s.class_name,seat,s.student_id,s.is_test]);demand(!taken,409,'這個座號已有人使用，請先核對。');
 await db.query('update rib.students set name=$1,seat=$2 where term=$3 and student_id=$4',[name,seat,s.term,s.student_id]);await db.query('update rib.credentials set revision=revision+1 where term=$1 and student_id=$2',[s.term,s.student_id]);
 await db.query("delete from rib.sessions where principal->>'role'='student' and principal->>'term'=$1 and principal->>'studentId'=$2",[s.term,s.student_id]);
 await this.event(db,p,null,'student-profile',s.student_id,{term:s.term,before:{name:s.name,seat:s.seat},after:{name,seat}});return {saved:true};
 });
 }
}
