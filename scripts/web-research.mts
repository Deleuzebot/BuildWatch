import {Store} from '../server/accounts/store';
import {WebResearch} from '../server/research/web';
import {readFileSync} from 'node:fs';
const [command,...args]=process.argv.slice(2);
if(!['plan','record','summary'].includes(command))throw Error('Use plan <area...>, record <query-id> <findings.json>, or summary. This script cannot publish projects.');
const file=process.env.DATA_FILE||'server/data/projects.json';const store=new Store(file+'.sqlite',file);
try{const web=new WebResearch(store);console.log(JSON.stringify(command==='plan'?web.plan(args):command==='record'?web.record(args[0],JSON.parse(readFileSync(args[1],'utf8'))):web.summary(),null,2));}finally{store.close();}
