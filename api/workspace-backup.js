module.exports=async function(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='GET')return res.status(405).json({ok:false});
 if(!process.env.CRON_SECRET||req.headers.authorization!==`Bearer ${process.env.CRON_SECRET}`)return res.status(401).json({ok:false});
 if(process.env.RIB_ENABLED!=='true'||process.env.RIB_ACCEPTANCE_ONLY==='true')return res.status(503).json({ok:false});
 try{const [{dailySnapshot},{database},{storage}]=await Promise.all([import('../workspace-server/maintenance.mjs'),import('../workspace-server/db.mjs'),import('../workspace-server/storage.mjs')]);const r=await dailySnapshot(database(),storage());return res.status(200).json({ok:true,...r});}catch(e){console.error('daily snapshot failed',e.code||e.name);return res.status(500).json({ok:false,error:'備份未完成，請查看維護紀錄。'});}
};
