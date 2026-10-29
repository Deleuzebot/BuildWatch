/** Replay downloaded official snapshots with zero network requests. */
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';import {noticeLinks} from '../server/maintenance/notices';
const entries=JSON.parse(readFileSync('config/maintenance/nc-adapter-builds.json','utf8')).entries;
const snapshots=readdirSync('../../work/nc-adapters/cache').map(n=>JSON.parse(readFileSync('../../work/nc-adapters/cache/'+n,'utf8'))),results:any[]=[];
for(const e of entries.filter((v:any)=>v.adapter)){
 const cached=snapshots.find(c=>c.url===e.adapter.url);if(!cached){results.push({name:e.name,status:'missing_fixture'});continue;}
 const links=noticeLinks(e.adapter,cached.body);if(links.some(l=>new URL(l.url).origin!==new URL(e.adapter.url).origin))throw Error('Unapproved source origin');
 results.push({name:e.name,type:e.type,status:links.length?'passed':'no_matching_documents',documentPointers:links.length,url:e.adapter.url,snapshotAt:cached.checkedAt,sourceHash:cached.hash});
}
writeFileSync('config/maintenance/nc-adapter-fixture-results.json',JSON.stringify({checkedAt:new Date().toISOString(),networkRequests:0,results},null,2)+'\n');console.log(JSON.stringify(results));
if(results.some(r=>r.status!=='passed'))process.exitCode=1;
