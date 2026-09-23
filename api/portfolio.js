// Retired GAS proxy. Old API bookmarks resolve to the new anonymous catalog only.
module.exports=async function(req,res){res.setHeader('Cache-Control','no-store');res.writeHead(307,{Location:'/api/workspace?action=gallery'});res.end();};
