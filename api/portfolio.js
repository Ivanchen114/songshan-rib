const {gasUrl}=require('../portfolio/config.json');
// Fixed upstream; query parameters cannot change its URL or select another action.
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'method_not_allowed'});}
 try{
  const url=new URL(gasUrl);url.searchParams.set('view','catalog');
  const upstream=await fetch(url,{signal:AbortSignal.timeout(10000),redirect:'follow',headers:{Accept:'application/json'}});
  if(!upstream.ok)throw Error('upstream');const raw=await upstream.text();if(raw.length>1000000)throw Error('size');
  const payload=JSON.parse(raw),d=payload.data;if(!payload.ok||!Array.isArray(d?.courses)||!Array.isArray(d?.collections))throw Error('schema');
  const str=(v,n)=>typeof v==='string'?v.slice(0,n):'';const week=v=>Number.isInteger(v)&&v>=1&&v<=18?v:null;
  const courses=[...new Map(d.courses.filter(x=>week(x.week)&&(x.code===''||/^[A-F0-9]{6}$/.test(x.code))).map(x=>[x.week,{code:x.code,title:str(x.title,60),term:str(x.term,40),week:week(x.week),accepting:x.accepting===true}])).values()];
  const collections=d.collections.filter(x=>/^[a-f0-9]{64}$/.test(x.id)&&Number.isInteger(x.count)&&x.count>0).map(x=>({id:x.id,title:str(x.title,60),term:str(x.term,40),week:week(x.week),count:x.count}));
  return res.status(200).json({ok:true,data:{courses,collections}});
 }catch{return res.status(502).json({ok:false,error:'catalog_unavailable'});}
};
