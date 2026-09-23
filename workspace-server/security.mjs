import {createHash, createHmac, randomBytes, randomUUID, scrypt as rawScrypt, timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt = promisify(rawScrypt);
export const uid = () => randomUUID();
export const sha = value => createHash('sha256').update(value).digest('hex');
export class Problem extends Error {constructor(status,message){super(message);this.status=status;}}
export const demand = (condition,status,message) => {if(!condition)throw new Problem(status,message);};
export function text(value,max=1200) {demand(typeof value==='string'&&value.trim().length>0&&value.length<=max,400,'請填寫完整內容，並確認文字長度。');return value.trim();}
export const json = value => JSON.stringify(value);
export const same = (a,b) => typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export async function verifier(code) {const salt=randomBytes(24).toString('hex');return {algorithm:'scrypt',salt,digest:(await scrypt(code,salt,32)).toString('hex')};}
export async function matches(code,record) {
  const value=record.algorithm==='gas-sha256'?sha(record.salt+':'+code):(await scrypt(code,record.salt,32)).toString('hex');
  return same(value,record.digest);
}
export async function rate(db,key,limit,seconds) {
  const [row]=await db.query(`insert into rib.rate_limits(id,count,reset_at) values($1,1,now()+$2*interval '1 second')
    on conflict(id) do update set count=case when rib.rate_limits.reset_at<=now() then 1 else rib.rate_limits.count+1 end,
    reset_at=case when rib.rate_limits.reset_at<=now() then excluded.reset_at else rib.rate_limits.reset_at end returning count`,[key,seconds]);
  demand(row.count<=limit,429,'嘗試次數較多，請稍後再試。');
}
export function ipKey(ip,secret) {return createHmac('sha256',secret).update(ip).digest('hex');}
export async function createSession(db,principal,remember=false) {
  const token=randomBytes(32).toString('base64url'), seconds=remember?30*86400:21600;
  await db.query(`insert into rib.sessions(token_hash,principal,expires_at) values($1,$2,now()+$3*interval '1 second')`,[sha(token),json(principal),seconds]);
  return {token,seconds};
}
export async function authenticate(db,token) {
  demand(typeof token==='string'&&/^[\w-]{43}$/.test(token),401,'請先登入。');
  const [session]=await db.query('select principal from rib.sessions where token_hash=$1 and expires_at>now()',[sha(token)]);
  demand(session,401,'登入已到期，請重新登入。');const p=session.principal;
  if(p.role==='student') {
    const [s]=await db.query(`select s.*,c.revision from rib.students s join rib.credentials c using(term,student_id) where s.term=$1 and s.student_id=$2 and s.active`,[p.term,p.studentId]);
    demand(s&&s.revision===p.revision,401,'登入已失效，請重新登入。');return {...p,student:s};
  }
  const [t]=await db.query('select * from rib.teachers where email=$1 and active',[p.email]);
  demand(t,403,'此帳號沒有教師權限。');return {...p,role:t.role,teacher:t};
}
export function teacherScope(p,term,className,grading=false) {
  demand(p.role!=='student'&&(p.role==='admin'||p.teacher.scopes.some(x=>x.term===term&&x.className===className&&(!grading||x.grading))),403,'沒有這個班級的操作權限。');
}
