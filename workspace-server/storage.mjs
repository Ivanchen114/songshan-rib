import {S3Client,PutObjectCommand,GetObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';
import {demand,sha} from './security.mjs';
export const MAX_IMAGE=8*1024*1024;
export function storage() {
  const bucket=process.env.RIB_R2_BUCKET;
  const client=new S3Client({region:'auto',endpoint:`https://${process.env.RIB_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials:{accessKeyId:process.env.RIB_R2_ACCESS_KEY_ID,secretAccessKey:process.env.RIB_R2_SECRET_ACCESS_KEY},
    requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED'});
  return {
    signUpload: (key,mime) => getSignedUrl(client,new PutObjectCommand({Bucket:bucket,Key:key,ContentType:mime}),{expiresIn:600}),
    signRead: key => getSignedUrl(client,new GetObjectCommand({Bucket:bucket,Key:key,ResponseCacheControl:'private, max-age=60',ResponseContentDisposition:'inline'}),{expiresIn:120}),
    get: async (key,maxBytes=MAX_IMAGE) => {const r=await client.send(new GetObjectCommand({Bucket:bucket,Key:key}));demand(r.ContentLength<=maxBytes,400,'圖片超過大小限制。');const chunks=[];let bytes=0;for await(const chunk of r.Body){bytes+=chunk.length;demand(bytes<=maxBytes,400,'圖片超過大小限制。');chunks.push(chunk);}return Buffer.concat(chunks);},
    put: (key,body,mime) => client.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:body,ContentType:mime,CacheControl:'private, max-age=60'})),
    remove: key => client.send(new DeleteObjectCommand({Bucket:bucket,Key:key}))
  };
}
export async function commitImage(store,file,destination) {
  const bytes=await store.get(file.key);
  demand(bytes.length===file.bytes&&sha(bytes)===file.sha256,409,'圖片內容與上傳前不同，請重新選圖。');
  const meta=await sharp(bytes,{limitInputPixels:40000000,animated:false}).metadata();
  demand(['jpeg','png','webp'].includes(meta.format)&&(!meta.pages||meta.pages===1),400,'請使用單張 JPG、PNG 或 WebP 圖片。');
  const full=await sharp(bytes,{limitInputPixels:40000000}).rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).jpeg({quality:86}).toBuffer();
  const thumbnail=await sharp(full).resize({width:480,height:480,fit:'inside',withoutEnlargement:true}).jpeg({quality:76}).toBuffer();
  const originalKey=destination+'/original',fullKey=destination+'/display.jpg',thumbKey=destination+'/thumb.jpg';
  // Original retained privately; display files remove EXIF and cannot be overwritten by a signed PUT.
  await Promise.all([store.put(originalKey,bytes,file.mime),store.put(fullKey,full,'image/jpeg'),store.put(thumbKey,thumbnail,'image/jpeg')]);
  return {originalKey,fullKey,thumbKey,sha256:sha(bytes),displayHash:sha(full),bytes:bytes.length,width:meta.width,height:meta.height};
}
