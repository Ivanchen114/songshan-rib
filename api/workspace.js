let runtime;
module.exports=async function(req,res){
  if(process.env.RIB_ENABLED!=='true'){
    res.setHeader('Cache-Control','private, no-store');
    const config=req.query?.action==='config';
    return res.status(config?200:503).json(config?{ok:true,data:{enabled:false}}:{ok:false,error:'新作品區尚未開放，請使用原作品牆入口。'});
  }
  if(!runtime)runtime=Promise.all([import('../workspace-server/http.mjs'),import('../workspace-server/db.mjs'),import('../workspace-server/storage.mjs')]).then(([{handler},{database},{storage}])=>handler({db:database(),store:storage(),origin:process.env.RIB_ORIGIN,rateSecret:process.env.RIB_RATE_SECRET,enabled:true})).catch(e=>{runtime=undefined;throw e;});
  return (await runtime)(req,res);
};
