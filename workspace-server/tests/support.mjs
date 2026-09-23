import {AGREEMENT_VERSION,AGREEMENT_HASH} from '../agreement.mjs';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {sha} from '../security.mjs';
export async function fixture(count=4) {
  const pg=new PGlite();await pg.exec(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));
  let savepoint=0;const wrap=client=>({query:async(q,p=[])=> (await client.query(q,p)).rows,transaction:async fn=>{if(client.transaction)return client.transaction(tx=>fn(wrap(tx)));const name='fixture_'+(++savepoint);await client.query('savepoint '+name);try{const result=await fn(wrap(client));await client.query('release savepoint '+name);return result;}catch(e){await client.query('rollback to savepoint '+name);await client.query('release savepoint '+name);throw e;}}});
  const db=wrap(pg),objects=new Map();const store={objects,put:async(k,b)=>objects.set(k,Buffer.from(b)),get:async k=>{if(!objects.has(k))throw Error('missing object');return objects.get(k);},remove:async k=>objects.delete(k),signRead:async k=>'https://storage.invalid/'+k,signUpload:async k=>'https://storage.invalid/'+k};
  const people=[];for(let i=1;i<=count;i++){
    const studentId=String(11500000+i),s={term:'11501',student_id:studentId,name:`示範同學${i}`,class_name:'101',seat:i,active:true,is_test:false,sharing_agreement:{version:AGREEMENT_VERSION,documentHash:AGREEMENT_HASH,acceptedAt:new Date().toISOString()}};
    await db.query('insert into rib.students(term,student_id,name,class_name,seat) values($1,$2,$3,$4,$5)',[s.term,s.student_id,s.name,s.class_name,s.seat]);await db.query('update rib.students set sharing_agreement=$1 where term=$2 and student_id=$3',[JSON.stringify(s.sharing_agreement),s.term,s.student_id]);await db.query("insert into rib.credentials(term,student_id,algorithm,salt,digest) values($1,$2,'gas-sha256',$3,$4)",[s.term,s.student_id,'fixture-'+i,sha('fixture-'+i+':012345')]);people.push({role:'student',term:s.term,studentId,revision:1,student:s});
  }
  await db.query("insert into rib.teachers(email,name,role) values('teacher@example.invalid','示範老師','admin')");
  const teacher={role:'admin',email:'teacher@example.invalid',teacher:{name:'示範老師',scopes:[]}};
  await db.query("insert into rib.activities(id,term,week,title,kind,phase,accepting) values('w4-demo','11501',4,'W4 讓你看見這一刻','w4','review',true),('w5-demo','11501',5,'W5 小組文字轉圖','w5-workshop','production',true)");
  return {pg,db,store,people,teacher,close:()=>pg.close()};
}
