/** Read back private proposals and prove public records/history/approval clocks are unchanged. */
import {readFileSync,writeFileSync} from 'node:fs';import {loadPostgresEnvironment,PostgresDatabase} from '../server/postgres/connection';
loadPostgresEnvironment();const db=new PostgresDatabase(),id=process.argv.find(v=>v.startsWith('--run='))?.slice(6);if(!id||!/^\d+$/.test(id))throw Error('Explicit numeric GitHub run required');
try{
 const result=await db.transaction(async()=>{
  const run=await db.one('SELECT id,status,dry_run,stats,github_url,started,finished FROM buildwatch.maintenance_runs WHERE github_url=$1',['https://github.com/Deleuzebot/BuildWatch/actions/runs/'+id]);if(!run)throw Error('Pilot run not found');
  const safety=await db.one("SELECT (SELECT count(*) FROM buildwatch.projects) projects,(SELECT md5(string_agg(id||md5(data::text),',' ORDER BY id)) FROM buildwatch.projects) projects_hash,(SELECT md5(string_agg(project_id||md5(to_jsonb(a)::text),',' ORDER BY project_id)) FROM buildwatch.approval_policy a) approval_hash,(SELECT count(*) FROM buildwatch.history) history,(SELECT count(*) FROM buildwatch.maintenance_mutations) mutations");
  const original=JSON.parse(readFileSync('../../work/nc-e2e/baseline.json','utf8'));for(const k of Object.keys(original))if(original[k]!==safety[k])throw Error('Safety baseline changed: '+k);
  const control=await db.one('SELECT schedule_enabled,writes_enabled,pilot_approved,monthly_requests FROM buildwatch.maintenance_control WHERE id=1');if(control.schedule_enabled||control.writes_enabled||control.pilot_approved)throw Error('Publication gates changed');
  const findings=await db.rows(`SELECT DISTINCT ON(source_id,external_id) source_id,external_id,outcome,data::jsonb->'proposal' proposal FROM buildwatch.maintenance_findings WHERE data::jsonb->>'recordKind'='end_to_end_validation' ORDER BY source_id,external_id,created DESC`);
  const projectIds=findings.map((f:any)=>f.proposal?.projectId).filter(Boolean);
  const activity=await db.rows('SELECT project_id,type,event_date,description,source_url FROM buildwatch.project_activity WHERE project_id=ANY($1::text[]) ORDER BY project_id,event_date',[projectIds]);
  const usage=await db.one("SELECT * FROM buildwatch.maintenance_monthly WHERE month=date_trunc('month',now())::date");
  return{verifiedAt:new Date().toISOString(),run,safety,baselineUnchanged:true,control,usage,findings,activity,dbBytes:(await db.one('SELECT pg_database_size(current_database()) bytes')).bytes};
 },true);
 writeFileSync('reports/maintenance/nc-e2e-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify({baselineUnchanged:result.baselineUnchanged,projects:result.safety.projects,history:result.safety.history,mutations:result.safety.mutations,privateItems:result.findings.length,runStatus:result.run.status,remainingReservedRequestCapacity:result.control.monthly_requests-result.usage.requests_reserved}));
}finally{await db.close();}
