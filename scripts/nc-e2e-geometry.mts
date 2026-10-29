/** Bounded cache-first geometry verification for the existing 24-record sample. */
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {loadPostgresEnvironment,PostgresDatabase} from '../server/postgres/connection';
import {Budget,hash} from '../server/maintenance/policy';
import {ResearchReader} from '../server/maintenance/research-reader';
loadPostgresEnvironment();const db=new PostgresDatabase(),budget=new Budget(180,20,100,10_000_000);
const plan=JSON.parse(readFileSync('config/maintenance/nc-five-jurisdiction-plan.json','utf8'));
const scout=JSON.parse(readFileSync('../../work/nc-e2e/scout.json','utf8'));
const reader=new ResearchReader(budget,(url,r)=>writeFileSync('../../work/nc-e2e/'+hash(url)+'.json',JSON.stringify({url,body:r.body,hash:hash(r.body),checkedAt:new Date().toISOString()})));
for(const file of readdirSync('../../work/nc-e2e').filter(f=>f.endsWith('.json'))){try{const s=JSON.parse(readFileSync('../../work/nc-e2e/'+file,'utf8'));if(s.url&&s.hash)reader.seed(s);}catch{}}
try{
 const c=await db.one('SELECT * FROM buildwatch.maintenance_control WHERE id=1');if(c.schedule_enabled||c.writes_enabled)throw Error('Publication must remain off');
 // Includes the three local diagnostic requests from the preceding PDF investigation.
 const reserved=await db.query("UPDATE buildwatch.maintenance_monthly SET requests_reserved=requests_reserved+23 WHERE month=date_trunc('month',now())::date AND requests_reserved+23<=(SELECT monthly_requests FROM buildwatch.maintenance_control WHERE id=1) RETURNING month");if(!reserved.rowCount)throw Error('Approved budget exhausted');
 const rows:any[]=[];
 for(const sample of scout){const s=plan.find((x:any)=>x.source.id===sample.id).source,u=new URL(s.url+'/query');u.search=new URLSearchParams({f:'json',objectIds:sample.rows.map((r:any)=>r[s.config.idField]).join(','),outFields:'*',outSR:'4326',returnGeometry:'true'}).toString();
  try{const r=await reader.get(u.href),data=JSON.parse(r.body);if(data.error||!Array.isArray(data.features)||data.features.length>8)throw Error('Unexpected geometry response');rows.push({sourceId:s.id,url:u.href,retrievedAt:r.snapshotAt||new Date().toISOString(),fromCache:!!r.fromSnapshot,hash:hash(r.body),data});}
  catch(e:any){rows.push({sourceId:s.id,error:e.message});}
 }
 writeFileSync('../../work/nc-e2e/geometry.json',JSON.stringify({rows,usage:budget.snapshot()},null,2));console.log(JSON.stringify({rows:rows.map(r=>({sourceId:r.sourceId,features:r.data?.features.length,error:r.error,fromCache:r.fromCache})),usage:budget.snapshot()}));
}finally{await db.close();}
