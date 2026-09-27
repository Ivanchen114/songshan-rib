import {database} from '../db.mjs';
import {setupReadingWeeks} from '../reading-weeks.mjs';
const db=database();try{console.log(JSON.stringify(await setupReadingWeeks(db,{apply:process.argv.includes('--apply')}),null,2));}finally{await db.close();}
