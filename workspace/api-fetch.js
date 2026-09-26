// JSON API responses are small. Read their entire body within the deadline;
// fetch() alone resolves at headers and does not protect a stalled body.
// Image uploads use the separate R2 transport and are not subject to this limit.
export async function timedFetch(href,options={},timeoutMs=45000){
 const controller=new AbortController(),external=options.signal;
 const abort=()=>controller.abort(external?.reason);
 if(external?.aborted)abort();else external?.addEventListener('abort',abort,{once:true});
 let timer;
 const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{
  reject(Error((options.method||'GET').toUpperCase()==='GET'?'網路回應太慢，請確認連線後再試一次。':'網路回應太慢，請重新整理確認是否已保存，再決定要不要重送。'));
  controller.abort();
 },timeoutMs);});
 try{return await Promise.race([deadline,(async()=>{
  const response=await fetch(href,{...options,signal:controller.signal});
  const body=await response.arrayBuffer();
  return new Response([204,205,304].includes(response.status)?null:body,{status:response.status,statusText:response.statusText,headers:response.headers});
 })()]);}
 finally{clearTimeout(timer);external?.removeEventListener('abort',abort);}
}
