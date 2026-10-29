/** Read-only official source cardinalities, with a reservation against the existing cap. */
import {writeFileSync} from 'node:fs';import {loadPostgresEnvironment,PostgresDatabase} from '../server/postgres/connection';import {SourceHTTP} from '../server/maintenance/http';import {Budget} from '../server/maintenance/policy';import {robotsAllows,robotsUnavailableAllows} from '../server/maintenance/worker';
loadPostgresEnvironment();const db=new PostgresDatabase(),budget=new Budget(180,32,1),rows:any[]=[],policies=new Map<string,string>();
try{
 const pending=await db.rows("SELECT DISTINCT ON(s.id) s.*,r.status run_status,r.checkpoint FROM buildwatch.maintenance_sources s JOIN buildwatch.maintenance_runs r ON right(r.request_key,length(s.id))=s.id WHERE r.dry_run AND r.request_key LIKE 'nc-source-repair:%' ORDER BY s.id,r.created DESC");
 const sources=pending.filter(s=>s.run_status==='partially_completed'&&s.checkpoint?.cursors?.[s.id]>=50);
 const reserved=await db.query("UPDATE buildwatch.maintenance_monthly SET requests_reserved=requests_reserved+32 WHERE month=date_trunc('month',now())::date AND requests_reserved+32<=(SELECT monthly_requests FROM buildwatch.maintenance_control WHERE id=1) AND NOT(SELECT schedule_enabled OR writes_enabled FROM buildwatch.maintenance_control WHERE id=1) RETURNING month");if(!reserved.rowCount)throw Error('Monthly budget or safety gate prevents inventory');
 for(const s of sources){try{
  const origin=new URL(s.url).origin,http=new SourceHTTP(budget,origin);if(!policies.has(origin)){try{policies.set(origin,(await http.get(origin+'/robots.txt')).body);}catch(e:any){if(robotsUnavailableAllows(s,e.message))policies.set(origin,'');else throw e;}}
  const policy=policies.get(origin)!;http.accessPolicy=u=>robotsAllows(policy,u.pathname+u.search);if(!http.accessPolicy(new URL(s.url)))throw Error('Access restricted');
  const u=new URL(s.url+'/query');u.search=new URLSearchParams({f:'json',where:'1=1',returnCountOnly:'true'}).toString();const body=JSON.parse((await http.get(u.href)).body);if(body.error||!Number.isSafeInteger(body.count))throw Error('Official count unavailable');rows.push({sourceId:s.id,jurisdiction:s.jurisdiction,url:s.url,countURL:u.href,total:body.count,offset:s.checkpoint.cursors[s.id],role:s.config.sourceRole||'development_review'});
 }catch(e:any){rows.push({sourceId:s.id,jurisdiction:s.jurisdiction,url:s.url,error:e.message});}}
 writeFileSync('config/maintenance/nc-source-sizes.json',JSON.stringify({checkedAt:new Date().toISOString(),requests:budget.requests,reservation:32,sources:rows},null,2)+'\n');console.log(JSON.stringify(rows));
}finally{await db.close();}
