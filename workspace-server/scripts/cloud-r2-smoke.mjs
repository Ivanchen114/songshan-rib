// Synthetic image only, isolated staging bucket, generated keys cleaned in finally.
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {storage,commitImage} from '../storage.mjs';
import {sha,uid} from '../security.mjs';
if(process.env.RIB_ENABLED==='true'||process.env.RIB_R2_BUCKET!=='rib-private-staging')throw Error('Isolated staging only');
const store=storage(),id='smoke-'+uid(),key=`incoming/${id}/test.jpg`,destination=`incoming/${id}/derived`;
const keys=[key,...['original','display.jpg','thumb.jpg'].map(x=>destination+'/'+x)];
const bytes=await sharp({create:{width:3200,height:2400,channels:3,background:'#9cbca8'}}).jpeg({quality:92}).withMetadata().toBuffer();
const timings={},timed=async(name,fn)=>{const t=performance.now();const result=await fn();timings[name]=Math.round(performance.now()-t);return result;};
try{
 const signed=await store.signUpload(key,'image/jpeg');
 const preflight=await fetch(signed,{method:'OPTIONS',headers:{Origin:process.env.RIB_ORIGIN,'Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'content-type'}});
 assert.equal(preflight.headers.get('access-control-allow-origin'),process.env.RIB_ORIGIN);
 const put=await timed('uploadMs',()=>fetch(signed,{method:'PUT',headers:{'Content-Type':'image/jpeg',Origin:process.env.RIB_ORIGIN},body:bytes}));assert.equal(put.status,200);
 assert.equal(sha(await store.get(key)),sha(bytes));
 const result=await timed('deriveMs',()=>commitImage(store,{key,bytes:bytes.length,sha256:sha(bytes),mime:'image/jpeg'},destination));
 const url=await store.signRead(result.thumbKey);
 const thumb=await timed('thumbnailReadMs',async()=>{const response=await fetch(url);assert.equal(response.status,200);return Buffer.from(await response.arrayBuffer());});
 const tm=await sharp(thumb).metadata(),full=await store.get(result.fullKey),fm=await sharp(full).metadata();
 assert.equal(tm.width,480);assert.equal(fm.width,2400);assert.equal(fm.exif,undefined);assert.equal(tm.exif,undefined);
 assert.equal(sha(await store.get(result.originalKey)),sha(bytes));
 const anonymous=await fetch(url.split('?')[0]),anonymousBody=await anonymous.text();
 assert.ok([401,403].includes(anonymous.status)||(anonymous.status===400&&anonymousBody.includes('<Message>Authorization</Message>')));
 const bad=new URL(url);bad.searchParams.set('X-Amz-Signature','0'.repeat(64));assert.equal((await fetch(bad)).status,403);
 console.log(JSON.stringify({bucket:process.env.RIB_R2_BUCKET,synthetic:true,originalBytes:bytes.length,displayBytes:full.length,thumbnailBytes:thumb.length,hashPreserved:true,anonymousDenied:true,tamperedSignatureDenied:true,corsPreflight:true,exifRemoved:true,timings,note:'Server HTTP test; browser file selection and classroom load remain separate.'}));
}finally{
 await Promise.all(keys.map(k=>store.remove(k)));
 console.log(JSON.stringify({generatedObjectsRemoved:keys.length}));
}
