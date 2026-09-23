// Only course assets are published; server, backups and credentials stay outside public/.
import {cp,mkdir,rm,lstat} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..'),out=path.join(root,'public');
const entries=['index.html','robots.txt','sitemap.xml',...Array.from({length:18},(_,i)=>`W${i+1}`),'_archive_2026-07','assets','course','portfolio','tools','worksheets','workspace'];
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
for(const name of entries)await cp(path.join(root,name),path.join(out,name),{recursive:true,filter:async file=>!path.basename(file).startsWith('.')&&!(await lstat(file)).isSymbolicLink()});
console.log('Built course assets and workspace; server files remain private.');
