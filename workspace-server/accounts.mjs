import {randomInt} from 'node:crypto';
import {TermManager,currentTerm} from './terms.mjs';
import {demand,teacherScope,verifier} from './security.mjs';
import {hasAgreement} from './agreement.mjs';

const teacher=p=>demand(['admin','teacher'].includes(p.role),403,'學生帳號管理只開放教師。');
const termCode=value=>{demand(typeof value==='string'&&/^\d{3}0[12]$/.test(value),400,'請選擇正確學期。');return value;};

export class Accounts extends TermManager {
 async studentAccounts(p,input={}){
  teacher(p);const current=await currentTerm(this.db),term=termCode(input.term||current);
  const classes=p.role==='admin'?null:p.teacher.scopes.filter(s=>s.term===term).map(s=>s.className);
  demand(classes===null||classes.length,403,'沒有此學期的學生管理權限。');
  const rows=await this.db.query(`select s.term,s.student_id,s.name,s.class_name,s.seat,s.active,s.is_test,s.sharing_agreement,c.revision
   from rib.students s left join rib.credentials c using(term,student_id)
   where s.term=$1 and ($2::text[] is null or s.class_name=any($2::text[])) order by s.is_test,s.class_name,s.seat,s.student_id`,[term,classes]);
  return {term,currentTerm:current,readOnly:term!==current,students:rows.map(s=>({studentId:s.student_id,name:s.name,className:s.class_name,seat:s.seat,active:s.active,isTest:s.is_test,agreementAccepted:hasAgreement(s),revision:s.revision,canManage:term===current&&!!s.revision&&(process.env.RIB_ACCEPTANCE_ONLY!=='true'||s.is_test)}))};
 }
 async studentAccountUpdate(p,input){
  teacher(p);const term=termCode(input.term),studentId=input.studentId;
  demand(typeof studentId==='string'&&/^\d{8}$/.test(studentId),400,'請核對八碼學號。');
  demand(['resetCode','setActive'].includes(input.operation),400,'請選擇帳號操作。');
  demand(Number.isInteger(input.expectedRevision)&&input.expectedRevision>0,400,'請重新載入學生名單。');
  return this.db.transaction(async db=>{
   await db.query('select id from rib.workspace_state where id=1 for share');
   demand(term===await currentTerm(db),409,'只可管理目前學期的帳號，請重新載入。');
   const [s]=await db.query('select * from rib.students where term=$1 and student_id=$2 for update',[term,studentId]);
   demand(s,404,'找不到這位學生。');teacherScope(p,term,s.class_name);
   demand(process.env.RIB_ACCEPTANCE_ONLY!=='true'||s.is_test,403,'驗收站只能調整測試學生帳號。');
   const [c]=await db.query('select revision from rib.credentials where term=$1 and student_id=$2 for update',[term,studentId]);
   demand(c?.revision===input.expectedRevision,409,'帳號已被更新，請重新載入名單後核對。');
   let code;
   if(input.operation==='resetCode'){
    demand(s.active,409,'帳號已停用，請先恢復使用再重設六碼。');
    demand(['random','manual'].includes(input.mode),400,'請選擇產生或指定六碼。');
    if(input.mode==='manual')demand(typeof input.code==='string'&&/^\d{6}$/.test(input.code),400,'登入碼須為六位數字，可含開頭的 0。');
    code=input.mode==='random'?String(randomInt(1000000)).padStart(6,'0'):input.code;
    const v=await verifier(code);
    await db.query('update rib.credentials set algorithm=$1,salt=$2,digest=$3,revision=revision+1 where term=$4 and student_id=$5',[v.algorithm,v.salt,v.digest,term,studentId]);
    await db.query('delete from rib.rate_limits where id=$1',['login:'+term+':'+studentId]);
   }else{
    demand(typeof input.active==='boolean'&&input.active!==s.active,409,'帳號狀態已變更，請重新載入名單。');
    await db.query('update rib.students set active=$1 where term=$2 and student_id=$3',[input.active,term,studentId]);
    await db.query('update rib.credentials set revision=revision+1 where term=$1 and student_id=$2',[term,studentId]);
   }
   await db.query("delete from rib.sessions where principal->>'role'='student' and principal->>'term'=$1 and principal->>'studentId'=$2",[term,studentId]);
   // Audit the action, never the six digits or their verifier.
   await this.event(db,p,null,'student-account',studentId,{term,operation:input.operation,...(input.operation==='resetCode'?{mode:input.mode}:{active:input.active})});
   return {saved:true,term,studentId,revision:c.revision+1,...(code?{code}:{})};
  });
 }
}
