// Loopback only: fictional in-memory database + real private staging R2.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {fixture} from '../tests/support.mjs';
import {storage} from '../storage.mjs';
import {handler} from '../http.mjs';
import {Workspace} from '../service.mjs';
if(process.env.RIB_ENABLED==='true'||process.env.RIB_R2_BUCKET!=='rib-private-staging')throw Error('Isolated staging only');
const origin='http://127.0.0.1:8947';
if(process.env.RIB_ORIGIN!==origin)throw Error('Exact loopback origin required');
const f=await fixture(5),real=storage(),created=new Set(),store={...real,
 signUpload:async(...args)=>{created.add(args[0]);return real.signUpload(...args);},
 put:async(...args)=>{created.add(args[0]);return real.put(...args);}};
await new Workspace(f.db,store).dispatch(f.teacher,{activityId:'w4-demo',className:'101',expectedRevision:0});
const run=handler({db:f.db,store,origin,rateSecret:'isolated-fictional-r2-test',secure:false});
const root=path.resolve(import.meta.dirname,'../..');
const sample=await sharp({create:{width:3200,height:2400,channels:3,background:'#8faa98'}}).composite([{input:Buffer.from('<svg width="3200" height="2400"><rect x="300" y="300" width="2600" height="1800" rx="150" fill="#eee9dc"/><circle cx="1600" cy="1050" r="400" fill="#264739"/><path d="M600 1800L1200 1400L1600 1700L2500 1100" stroke="#b48d55" stroke-width="60" fill="none"/></svg>')}]).jpeg({quality:90}).toBuffer();
const helper=`const button=document.createElement('button');button.textContent='測試專用：填入虛構圖片';button.id='fixture-image';document.getElementById('detail').prepend(button);button.onclick=async()=>{const input=document.querySelector('input[type=file]');if(!input){alert('先開啟上傳 V1');return;}const r=await fetch('/__fixture.jpg'),blob=await r.blob(),transfer=new DataTransfer();transfer.items.add(new File([blob],'fictional-card.jpg',{type:'image/jpeg'}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));};`;
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,origin);res.setHeader('Cache-Control','no-store');
 if(url.pathname==='/__fixture.jpg'){res.setHeader('Content-Type','image/jpeg');return res.end(sample);}
 if(url.pathname==='/__fixture-helper.js'){res.setHeader('Content-Type','application/javascript');return res.end(helper);}
 if(url.pathname==='/api/workspace'){if(req.method==='POST'){const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>32000){res.writeHead(413);return res.end();}chunks.push(c);}req.body=JSON.parse(Buffer.concat(chunks).toString());}return run(req,res);}
 const relative=url.pathname==='/'?'/workspace/index.html':url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname;
 if(!relative.startsWith('/workspace/')){res.writeHead(404);return res.end();}
 const file=path.resolve(root,'.'+decodeURIComponent(relative));if(!file.startsWith(path.join(root,'workspace')+path.sep)){res.writeHead(403);return res.end();}
 const ext=path.extname(file);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css'}[ext]||'application/octet-stream'));
 let body=await readFile(file);if(ext==='.html')body=body.toString().replace('</body>','<script type="module" src="/__fixture-helper.js"></script></body>');res.end(body);
 }catch{res.writeHead(500);res.end('Isolated browser test error');}});
server.listen(8947,'127.0.0.1',()=>console.log(JSON.stringify({url:origin+'/workspace/',database:'fictional PGlite',media:'real R2 staging',term:'11501',student:'11500005',code:'012345'})));
let stopping=false;
async function stop(){if(stopping)return;stopping=true;server.close();const results=await Promise.allSettled([...created].map(k=>real.remove(k)));await f.close();console.log(JSON.stringify({removed:results.filter(r=>r.status==='fulfilled').length,failed:results.filter(r=>r.status==='rejected').length}));process.exit(results.some(r=>r.status==='rejected')?1:0);}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
