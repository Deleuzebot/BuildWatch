/** Review metadata only. No project publication or notification is performed. */
import {DatabaseSync,backup} from 'node:sqlite';
import {readFileSync,mkdirSync,chmodSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {Store} from '../server/accounts/store';
import {ResearchService} from '../server/research/service';
if(!process.argv.includes('--review-only'))throw Error('Use --review-only. This importer cannot publish changes.');
const input=process.argv.find(a=>a.endsWith('.json'))||'reports/manual-research/nc-reviewed-proposals.json';
const file=process.env.DATA_FILE||'server/data/projects.json';
const tables=['projects','users','follows','follow_history','history','entitlements','invitations','submissions','notifications','devices','role_audit'];
const digest=(db:DatabaseSync)=>Object.fromEntries(tables.map(t=>[t,createHash('sha256').update(JSON.stringify(db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all())).digest('hex')]));
const connection=new DatabaseSync(file+'.sqlite',{readOnly:true}),before=digest(connection);mkdirSync('server/data/backups',{recursive:true,mode:0o700});const saved=resolve('server/data/backups','before-research-review-'+Date.now()+'.sqlite');await backup(connection,saved);chmodSync(saved,0o600);connection.close();
const store=new Store(file+'.sqlite',file);try{const service=new ResearchService(store),result=service.import(JSON.parse(readFileSync(input,'utf8')));const after=digest(store.db);if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Original data changed unexpectedly; inspect backup.');console.log(JSON.stringify({...result,originalTablesUnchanged:true,publicRecords:store.one('SELECT count(*) AS n FROM map_index').n,backup:saved}));}finally{store.close();}
