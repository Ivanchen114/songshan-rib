// Local fictional-data server only. Binds loopback; no production demo login route.
import http from 'node:http';
import {readFile,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fixture} from './tests/support.mjs';
import {handler} from './http.mjs';
import {Workspace} from './service.mjs';
import {createSession,sha} from './security.mjs';
import sharp from 'sharp';
const f=await fixture(5),port=Number(process.env.PORT||8946),origin=`http://127.0.0.1:${port}`,root=path.resolve(import.meta.dirname,'..');
if(process.env.RIB_DEMO_UI==='true'){await f.db.query("update rib.students set class_name='102' where student_id='11500005'");f.people[4].student.class_name='102';}
const tokens=new Map();f.store.signUpload=async key=>{const token=sha('put:'+key);tokens.set(token,{key,put:true});return origin+'/__media/'+token;};f.store.signRead=async key=>{const token=sha('get:'+key);tokens.set(token,{key,put:false});return origin+'/__media/'+token;};
if(process.env.RIB_DEMO_AGREEMENT==='true')await f.db.query('update rib.students set sharing_agreement=null');
const run=handler({db:f.db,store:f.store,origin,rateSecret:'fictional-local-only',secure:false});
const demoDir=await mkdtemp(path.join(tmpdir(),'rib-workspace-'));const demoPath=path.join(demoDir,'fictional-card.png');await writeFile(demoPath,await sharp({create:{width:800,height:500,channels:3,background:'#b8d0bf'}}).png().toBuffer());
if(process.env.RIB_DEMO_GALLERY==='true'){
 const s=new Workspace(f.db,f.store),p=f.people[0],w=await s.ensureWork(p,{activityId:'w4-demo'}),bytes=await readFile(demoPath);
 const u=await s.prepare(p,{workId:w.id,requestId:'local-gallery-demo',expectedRevision:0,publicDisplay:true,privacyChecked:true,files:[{bytes:bytes.length,mime:'image/png',sha256:sha(bytes)}]});
 const [ticket]=await f.db.query('select files from rib.uploads where id=$1',[u.ticketId]);f.store.objects.set(ticket.files[0].key,bytes);await s.finalize(p,{ticketId:u.ticketId});
 if(process.env.RIB_DEMO_UI==='true')await s.assignReader(f.teacher,{workId:w.id,studentId:'11500002'});
}
http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,origin);
  if(url.pathname==='/__demo/teacher'&&req.method==='GET'){const s=await createSession(f.db,{role:'admin',email:f.teacher.email});res.setHeader('Set-Cookie',`rib_session=${s.token}; HttpOnly; SameSite=Lax; Path=/`);res.writeHead(302,{Location:'/workspace/'});return res.end();}
  if(url.pathname.startsWith('/__media/')){const entry=tokens.get(url.pathname.split('/').at(-1));if(!entry){res.writeHead(404);return res.end();}if(req.method==='PUT'&&entry.put){const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>8*1024*1024)throw Error('too big');chunks.push(c);}f.store.objects.set(entry.key,Buffer.concat(chunks));res.writeHead(200);return res.end();}if(req.method==='GET'&&!entry.put){res.setHeader('Content-Type','image/jpeg');return res.end(await f.store.get(entry.key));}res.writeHead(405);return res.end();}
  if(url.pathname==='/api/workspace'){if(req.method==='POST'){const chunks=[];let n=0;for await(const c of req){n+=c.length;if(n>32000){res.writeHead(413);return res.end();}chunks.push(c);}req.body=JSON.parse(Buffer.concat(chunks).toString());}return run(req,res);}
  if(url.pathname==='/__demo'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(`<h1>作品工作區 · 本機虛構資料</h1><p>每次重啟清除，無真實學生。</p><p><a href="/__demo/teacher">示範老師</a> · <a href="/workspace/">學生登入</a></p><p>學期 11501；學號 11500001 至 11500005；六碼 012345。</p><p>測試圖片：${demoPath}</p>`);}
  const relative=url.pathname==='/'?'/workspace/index.html':url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname;
  if(!relative.startsWith('/workspace/')&&!relative.startsWith('/assets/')&&!['/portfolio/','/portfolio/index.html'].includes(relative)){res.writeHead(404);return res.end();}
  const file=path.resolve(root,'.'+decodeURIComponent(relative));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}const ext=path.extname(file);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}[ext]||'application/octet-stream'));res.end(await readFile(file));
 }catch{res.writeHead(500);res.end('local development error');}}).listen(port,'127.0.0.1',()=>console.log(JSON.stringify({url:origin+'/__demo',fixture:demoPath,accounts:'fictional only'})));
