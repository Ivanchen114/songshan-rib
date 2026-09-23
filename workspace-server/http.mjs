import {dailySnapshot,maintenanceStatus} from './maintenance.mjs';
import {hasAgreement} from './agreement.mjs';
import {createClient} from '@supabase/supabase-js';
import {Workspace} from './service.mjs';
import {currentTerm} from './terms.mjs';
import {authenticate,createSession,demand,ipKey,Problem,sha,uid,rate} from './security.mjs';
const reads=new Set(['maintenance','journey','journeyMedia','studentAccounts','conversation','archive','home','board','classes','roster','media','evidence','gallery','updates','terms','termBackup','classWall','selections','selectionTeacher','original']);
const writes=new Set(['backupRun','rosterPreview','rosterImport','studentProfile','studentAccountUpdate','testFeedback','assignReader','reply','ensureWork','invitePreview','invite','invitation','prepare','finalize','dispatch','review','requestReplacement','replace','decision','control','consent','publish','assess','termSave','termActivate','agreement','wallComment','wallVote','moderateComment','markCurrent','paperKeep','selectionSave','selectionFeature','referencePrepare','referenceFinalize']);
const cookies=req=>Object.fromEntries(String(req.headers.cookie||'').split(';').map(x=>x.trim().split('=')));
export function handler({db,store,origin,enabled=true,rateSecret,secure=true,authClientFactory=createClient}) {
  const service=new Workspace(db,store);
  const cookie=(name,value,seconds)=>`${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure?'; Secure':''}`;
  return async(req,res)=>{
    res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    const reply=(status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(data));};
    try{
      const url=new URL(req.url,origin),action=url.searchParams.get('action')||req.body?.action;
      if(action==='config')return reply(200,{ok:true,data:{enabled,teacherLogin:process.env.RIB_GOOGLE_ENABLED==='true',acceptanceOnly:process.env.RIB_ACCEPTANCE_ONLY==='true',currentTerm:enabled?await currentTerm(db):null}});
      demand(enabled,503,'新作品區尚未開放，請使用原作品牆入口。');
      demand(['GET','POST'].includes(req.method),405,'不支援此操作。');
      if(req.method==='POST'){
        demand(req.headers.origin===origin&&String(req.headers['content-type']||'').startsWith('application/json'),403,'請從課程網站操作。');
        demand(Number(req.headers['content-length']||0)<=32000&&Buffer.byteLength(JSON.stringify(req.body||{}))<=32000,413,'內容過大，圖片請使用直接上傳。');
      }
      const input=req.method==='POST'?req.body:Object.fromEntries(url.searchParams);
      demand(input&&typeof input==='object',400,'請重新操作。');
      if(action==='teacher-start'){
        demand(process.env.RIB_GOOGLE_ENABLED==='true',503,'教師 Google 登入尚在設定中，請稍後再試。');
        demand(req.method==='GET',405,'請從登入入口操作。');
        await rate(db,'oauth:'+ipKey(req.headers['x-real-ip']||req.socket?.remoteAddress||'unknown',rateSecret),20,600);
        const oauthId=uid(),memory=new Map(),client=authClientFactory(process.env.RIB_SUPABASE_URL,process.env.RIB_SUPABASE_PUBLISHABLE_KEY,{auth:{flowType:'pkce',autoRefreshToken:false,detectSessionInUrl:false,storage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)}}});
        const {data,error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:origin+'/api/workspace?action=teacher-callback',skipBrowserRedirect:true}});
        demand(!error&&data.url,503,'教師登入暫時無法連線。');
        await db.query('insert into rib.sessions(token_hash,principal,expires_at) values($1,$2,now()+interval \'10 minutes\')',[sha(oauthId),JSON.stringify({role:'oauth',storage:[...memory]})]);
        res.setHeader('Set-Cookie',cookie('rib_oauth',oauthId,600));res.writeHead(302,{Location:data.url});return res.end();
      }
      if(action==='teacher-callback'){
        demand(process.env.RIB_GOOGLE_ENABLED==='true',503,'教師 Google 登入尚在設定中，請稍後再試。');
        demand(req.method==='GET',405,'請從登入入口操作。');
        const oauthId=cookies(req).rib_oauth,rows=await db.query('delete from rib.sessions where token_hash=$1 and expires_at>now() returning principal',[sha(oauthId||'')]);
        demand(rows[0]?.principal.role==='oauth',401,'教師登入已到期，請重新登入。');
        const memory=new Map(rows[0].principal.storage),client=authClientFactory(process.env.RIB_SUPABASE_URL,process.env.RIB_SUPABASE_PUBLISHABLE_KEY,{auth:{flowType:'pkce',autoRefreshToken:false,detectSessionInUrl:false,storage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)}}});
        const {data,error}=await client.auth.exchangeCodeForSession(url.searchParams.get('code')||'');
        demand(!error&&data.session,401,'教師登入失敗。');const verified=await client.auth.getUser(data.session.access_token);
        const email=verified.data.user?.email?.toLowerCase();demand(!verified.error&&email&&verified.data.user.email_confirmed_at,403,'無法核對教師帳號。');
        const [t]=await db.query('select * from rib.teachers where email=$1 and active',[email]);demand(t,403,'此帳號不在教師名單。');
        const session=await createSession(db,{role:t.role,email});res.setHeader('Set-Cookie',[cookie('rib_session',session.token,session.seconds),cookie('rib_oauth','',0)]);res.writeHead(302,{Location:'/workspace/'});return res.end();
      }
      if(action==='login'){demand(req.method==='POST',405,'請從登入表單操作。');const ip=ipKey(req.headers['x-real-ip']||req.socket?.remoteAddress||'unknown',rateSecret);const session=await service.login(input,ip);res.setHeader('Set-Cookie',cookie('rib_session',session.token,session.seconds));return reply(200,{ok:true,data:{saved:true}});}
      if(['gallery','galleryItem'].includes(action)){demand(req.method==='GET',405,'請重新整理。');return reply(200,{ok:true,data:await service[action](input)});}
      const token=cookies(req).rib_session,p=await authenticate(db,token);
      if(action==='logout'){demand(req.method==='POST',405,'請按登出。');await db.query('delete from rib.sessions where token_hash=$1',[sha(token)]);res.setHeader('Set-Cookie',cookie('rib_session','',0));return reply(200,{ok:true,data:{saved:true}});}
      demand(p.role!=='student'||hasAgreement(p.student)||['home','agreement'].includes(action)||(action==='consent'&&input.consent===false),403,'請先閱讀並勾選匿名展示與個資保護說明。');
      demand(reads.has(action)||writes.has(action),404,'找不到此操作。');demand(reads.has(action)?req.method==='GET':req.method==='POST',405,'請使用正確的操作方式。');
      if(writes.has(action))await rate(db,'write:'+sha(token),180,60);
      let data;
      if(action==='maintenance')data=await maintenanceStatus(db,p);
      else if(action==='backupRun'){demand(p.role==='admin'&&process.env.RIB_ACCEPTANCE_ONLY!=='true',403,'只有正式管理員可建立資料快照。');await rate(db,'backup:'+p.email,3,3600);data=await dailySnapshot(db,store,{force:true,actor:p.email});}
      else if(action==='conversation'){const c=await service.conversation(p,input);data={review:c.review,replies:c.replies};}
      else if(action==='evidence'){await service.work(p,input.workId,{grading:true});demand(p.role!=='student',403,'請使用教師帳號。');data={key:await service.evidence(input.workId)};}
      else if(action==='updates'){
        const a=await service.activity(p,input.activityId);
        if(p.role!=='student')demand(p.role==='admin'||p.teacher.scopes.some(s=>s.term===a.term),403,'沒有此學期權限。');
        const [row]=await db.query('select coalesce(max(id),0)::text as cursor from rib.events where activity_id=$1',[a.id]);data={cursor:row.cursor};
      }else data=await service[action](p,input);
      return reply(200,{ok:true,data});
    }catch(error){if(!(error instanceof Problem))console.error('workspace request failed',error.code||error.name);return reply(error.status||500,{ok:false,error:error instanceof Problem?error.message:'暫時無法完成，請保留畫面稍後再試。'});}
  };
}
