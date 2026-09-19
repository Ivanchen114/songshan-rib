const {gasUrl}=require('../portfolio/config.json');
// Only public catalog/page/preview/revalidation reads. No credentials or arbitrary upstream URLs.
const str=(v,n)=>typeof v==='string'?v.slice(0,n):'';
const week=v=>Number.isInteger(v)&&v>=1&&v<=18?v:null;
const item=x=>({id:x.id,title:str(x.title,80),term:str(x.term,40),week:week(x.week),hash:x.hash,hasPreview:x.hasPreview===true});
const validId=v=>/^[a-f0-9]{32}$/.test(v||'');
const validCursor=v=>typeof v==='string'&&/^(?:\d{1,9}_[a-f0-9]{12}|r\d{1,9}_\d{1,9}_[a-f0-9]{12})$/.test(v||'');
const validHash=v=>/^[a-f0-9]{64}$/.test(v||'');
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'method_not_allowed'});}
 const q=req.query||{},view=['gallery','preview','check'].includes(q.view)?q.view:'catalog';
 const url=new URL(gasUrl);url.searchParams.set('view',view);
 if(view==='gallery'){
  if(q.featured&&q.featured!=='1')return res.status(400).json({ok:false,error:'invalid_page'});
  if((q.term&&!/^\d{3}0[12]$/.test(q.term))||(q.week&&(!/^\d{1,2}$/.test(q.week)||!week(Number(q.week))))||(q.cursor&&!validCursor(q.cursor))||(q.seed&&(typeof q.seed!=='string'||!/^[a-f0-9]{32}$/.test(q.seed)))||(q.cursor?.startsWith('r')&&!q.seed)||(q.limit&&(!/^\d{1,2}$/.test(q.limit)||Number(q.limit)<1||Number(q.limit)>24)))return res.status(400).json({ok:false,error:'invalid_page'});
  for(const k of ['term','week','cursor','limit','seed','featured'])if(q[k])url.searchParams.set(k,q[k]);
 }
 if(view==='preview'){
  if(!validId(q.id)||!validHash(q.hash))return res.status(400).json({ok:false,error:'invalid_preview'});
  url.searchParams.set('id',q.id);url.searchParams.set('hash',q.hash);
 }
 if(view==='check'){
  if(q.featured==='1')url.searchParams.set('featured','1');
  const ids=typeof q.ids==='string'?q.ids.split(','):[];if(!ids.length||ids.length>24||ids.some(id=>!validId(id)))return res.status(400).json({ok:false,error:'invalid_check'});url.searchParams.set('ids',ids.join(','));
 }
 try{
  const upstream=await fetch(url,{signal:AbortSignal.timeout(25000),redirect:'follow',headers:{Accept:'application/json'}});
  if(!upstream.ok)throw Error('upstream');const raw=await upstream.text();if(raw.length>1000000)throw Error('size');const payload=JSON.parse(raw),d=payload.data;if(!payload.ok||!d)throw Error('schema');
  let data;
  if(view==='gallery'){
   if(!Array.isArray(d.items)||d.items.length>24||(d.nextCursor!==null&&!validCursor(d.nextCursor)))throw Error('page');
   if(d.items.some(x=>!validId(x.id)||!validHash(x.hash)||!week(x.week)))throw Error('item');data={items:d.items.map(item),nextCursor:d.nextCursor};
  }else if(view==='preview'){
   if(d.available===false)data={available:false};else{if(d.hash!==q.hash||typeof d.src!=='string'||d.src.length>90000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(d.src))throw Error('preview');data={available:true,hash:d.hash,src:d.src};}
  }else if(view==='check'){
   if(!Array.isArray(d.items)||d.items.length>24||d.items.some(x=>!validId(x.id)||!validHash(x.hash)))throw Error('check');data={items:d.items.map(x=>({id:x.id,hash:x.hash}))};
  }else{
   if(!Array.isArray(d.courses)||!Array.isArray(d.collections))throw Error('schema');
   const courses=[...new Map(d.courses.filter(x=>week(x.week)&&(x.code===''||/^[A-F0-9]{6}$/.test(x.code))).map(x=>[x.week,{code:x.code,title:str(x.title,60),term:str(x.term,40),week:week(x.week),accepting:x.accepting===true}])).values()];
   const collections=d.collections.filter(x=>/^[a-f0-9]{64}$/.test(x.id)&&Number.isInteger(x.count)&&x.count>0).map(x=>({id:x.id,title:str(x.title,60),term:str(x.term,40),week:week(x.week),count:x.count}));
   const exhibits=(Array.isArray(d.exhibits)?d.exhibits:[]).filter(x=>validId(x.id)).map(x=>({id:x.id,title:str(x.title,80),term:str(x.term,40),week:week(x.week)}));data={courses,collections,exhibits};
  }
  return res.status(200).json({ok:true,data});
 }catch{return res.status(502).json({ok:false,error:'catalog_unavailable'});}
};
