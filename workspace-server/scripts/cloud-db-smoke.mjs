// Uses a real isolated database, fictional records, and in-memory images. Entire run rolls back.
import {database} from '../db.mjs';
import {Workspace} from '../service.mjs';
import {authenticate,sha,uid} from '../security.mjs';
import sharp from 'sharp';
import assert from 'node:assert/strict';
if(process.env.RIB_ENABLED==='true')throw Error('Use staging with RIB_ENABLED=false');
const db=database(),run='smoke-'+uid(),term='99901',rollback=new Error('ROLLBACK_SMOKE');let evidence;
try{
 await db.transaction(async tx=>{
  const objects=new Map(),store={put:async(k,b)=>objects.set(k,Buffer.from(b)),get:async k=>objects.get(k),signUpload:async k=>'https://test.invalid/'+k,signRead:async k=>'https://test.invalid/'+k},service=new Workspace(tx,store),people=[];
  await tx.query("insert into rib.activities(id,term,week,title,kind,phase,accepting) values($1,$2,4,'虛構雲端驗證','w4','review',true)",[run,term]);
  for(let i=1;i<=5;i++) {const sid=String(99900000+i);await tx.query("insert into rib.students(term,student_id,name,class_name,seat) values($1,$2,'虛構測試','TEST',$3)",[term,sid,i]);await tx.query("insert into rib.credentials(term,student_id,algorithm,salt,digest) values($1,$2,'gas-sha256',$3,$4)",[term,sid,run,sha(run+':012345')]);const session=await service.login({term,studentId:sid,code:'012345'},run+i);people.push(await authenticate(tx,session.token));}
  const teacher={role:'admin',email:'cloud-test@example.invalid',teacher:{name:'虛構驗證',scopes:[]}};
  const distribution=await service.dispatch(teacher,{activityId:run,className:'TEST',expectedRevision:0});assert.equal(distribution.added,5);
  const late=people[4],[w]=await tx.query('select * from rib.works where activity_id=$1 and owner_id=$2',[run,late.studentId]);const bytes=await sharp({create:{width:64,height:64,channels:3,background:'white'}}).png().toBuffer();const prepared=await service.prepare(late,{workId:w.id,requestId:run,expectedRevision:0,files:[{bytes:bytes.length,mime:'image/png',sha256:sha(bytes)}]});const [ticket]=await tx.query('select files from rib.uploads where id=$1',[prepared.ticketId]);objects.set(ticket.files[0].key,bytes);const version=await service.finalize(late,{ticketId:prepared.ticketId});
  const [r]=await tx.query('select * from rib.reviews where target_work_id=$1',[w.id]);assert.equal(r.status,'assigned');const reader=people.find(p=>p.studentId===r.reviewer_id);await service.review(reader,{reviewId:r.id,expectedRevision:r.revision,situation:'測試白色圖卡。',meaning:'這是虛構系統驗證。'});await service.reply(late,{reviewId:r.id,requestId:run,body:'收到測試回覆。'});const board=await service.board(late,{activityId:run});assert.equal(board.works[0].feedback.length,1);assert.equal((await service.conversation(reader,{reviewId:r.id})).replies.length,1);assert.equal((await service.media(reader,{versionId:version.versionId})).images.length,1);
  evidence={database:'Supabase real transaction pooler',principal:'rib_app',fictionalStudents:5,preallocatedReaders:5,lateSubmissionFeedback:true,reply:true,media:'memory only; R2 not tested'};
  throw rollback;
 });
}catch(e){if(e!==rollback)throw e;}finally{const [left]=await db.query('select count(*)::int as n from rib.activities where id=$1',[run]);assert.equal(left.n,0);await db.close();}
console.log(JSON.stringify({...evidence,rolledBack:true}));
