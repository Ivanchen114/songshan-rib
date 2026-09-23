import {readFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {analyze,verifyFiles,importSnapshot} from '../migration.mjs';
import {database} from '../db.mjs';
import {storage} from '../storage.mjs';
const args=process.argv.slice(2),get=name=>args[args.indexOf(name)+1];
if(!args.includes('--manifest'))throw Error('Usage: npm run migrate:workspace -- --manifest /private/path/manifest.json [--media-dir /private/path/files] [--apply-to-empty-staging]');
const filename=await realpath(get('--manifest')),siteRoot=path.resolve(import.meta.dirname,'../..');
if(filename.startsWith(siteRoot+path.sep))throw Error('私人匯出不可放在網站目錄，請移到網站外的私人資料夾。');
const manifest=JSON.parse(await readFile(filename,'utf8')),report=analyze(manifest);
// Logs contain counts and issue types only. Identifiers are kept inside the private source file.
console.log(JSON.stringify({summary:report.summary,issues:report.errors.reduce((m,e)=>(m[e.problem]=(m[e.problem]||0)+1,m),{})},null,2));
if(report.errors.length)process.exitCode=1;
else if(args.includes('--media-dir')){const mediaDir=await realpath(get('--media-dir'));if(mediaDir.startsWith(siteRoot+path.sep))throw Error('媒體原件不可放在網站目錄。');const files=await verifyFiles(manifest,mediaDir);console.log(JSON.stringify({verifiedFiles:files.length}));if(args.includes('--apply-to-empty-staging')){if(process.env.RIB_ENABLED==='true')throw Error('正式服務啟用中，禁止全量搬遷。');const db=database();try{console.log(JSON.stringify(await importSnapshot(db,storage(),manifest,files)));}finally{await db.close();}}}
else if(args.includes('--apply-to-empty-staging'))throw Error('需要完整媒體資料夾，不能只搬主表。');
