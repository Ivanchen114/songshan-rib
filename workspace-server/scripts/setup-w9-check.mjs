// Maintenance command: dry run unless --apply is explicitly supplied.
import {database} from '../db.mjs';
import {setupW9Check} from '../w9-check.mjs';
const db=database();try{console.log(JSON.stringify(await setupW9Check(db,{apply:process.argv.includes('--apply')}),null,2));}finally{await db.close();}
