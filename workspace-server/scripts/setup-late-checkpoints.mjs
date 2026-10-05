import {database} from '../db.mjs';
import {setupLateCheckpoints} from '../late-setup.mjs';
const db=database();try{console.log(JSON.stringify(await setupLateCheckpoints(db,{apply:process.argv.includes('--apply')}),null,2));}finally{await db.close();}
