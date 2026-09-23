import {mkdir,writeFile,realpath} from 'node:fs/promises';import path from 'node:path';
import {database} from '../db.mjs';import {snapshot} from '../backup.mjs';
const folder=process.argv[2];if(!folder)throw Error('Provide a private output directory outside the website.');
await mkdir(folder,{recursive:true,mode:0o700});const target=await realpath(folder),site=path.resolve(import.meta.dirname,'../..');if(target===site||target.startsWith(site+path.sep))throw Error('Backup must not be inside the website.');
const db=database();try{const backup=await snapshot(db),filename=path.join(target,`rib-backup-${Date.now()}.json`);await writeFile(filename,JSON.stringify(backup),{mode:0o600,flag:'wx'});console.log(JSON.stringify({filename,sha256:backup.sha256,counts:Object.fromEntries(Object.entries(backup.tables).map(([k,v])=>[k,v.length])),media:'Object keys and hashes included; preserve R2 objects separately.'}));}finally{await db.close();}
