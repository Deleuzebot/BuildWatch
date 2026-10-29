/** Read-only Supabase evidence export. No government HTTP or project writes. */
import {readFileSync,writeFileSync} from 'node:fs';
import {loadPostgresEnvironment,PostgresDatabase} from '../server/postgres/connection';
loadPostgresEnvironment();const db=new PostgresDatabase();
const plan=JSON.parse(readFileSync('config/maintenance/nc-five-jurisdiction-plan.json','utf8'));
const scout=JSON.parse(readFileSync('../../work/nc-e2e/scout.json','utf8'));
try{
 const result=await db.transaction(async()=>{
  const control=await db.one('SELECT * FROM buildwatch.maintenance_control WHERE id=1');
  if(control.schedule_enabled||control.writes_enabled)throw Error('Publication must stay disabled');
  const refs:any[]=[];
  for(const sample of scout){const source=plan.find((s:any)=>s.source.id===sample.id).source;const ids=sample.rows.map((r:any)=>String(r[source.config.originalIdentityField||source.config.idField]));
   refs.push(...await db.rows(`SELECT r.source_id,r.external_id,r.project_id,buildwatch.bw_canonical(r.project_id) canonical_id,
    buildwatch.bw_project(r.project_id) project,(SELECT to_jsonb(a) FROM buildwatch.approval_policy a WHERE a.project_id=buildwatch.bw_canonical(r.project_id)) approval_policy
    FROM buildwatch.maintenance_refs r WHERE r.source_id=$1 AND r.external_id=ANY($2::text[])`,[sample.id,ids]));
  }
  const documents=await db.rows(`SELECT DISTINCT ON(source_id) source_id,data,created FROM buildwatch.maintenance_findings
   WHERE source_id=ANY($1::text[]) AND data::jsonb->>'recordKind'='pdf_benchmark_evidence' ORDER BY source_id,created DESC`,[plan.filter((s:any)=>s.source.adapter==='document').map((s:any)=>s.source.id)]);
  const candidates=await db.rows(`SELECT id,data::jsonb project FROM buildwatch.projects WHERE data::jsonb->>'jurisdiction'=ANY($1::text[]) ORDER BY id LIMIT 500`,[['Burlington','Kannapolis']]);
  const baseline=await db.one("SELECT (SELECT count(*) FROM buildwatch.projects) projects,(SELECT md5(string_agg(id||md5(data::text),',' ORDER BY id)) FROM buildwatch.projects) projects_hash,(SELECT md5(string_agg(project_id||md5(to_jsonb(a)::text),',' ORDER BY project_id)) FROM buildwatch.approval_policy a) approval_hash,(SELECT count(*) FROM buildwatch.history) history,(SELECT count(*) FROM buildwatch.maintenance_mutations) mutations");
  return{capturedAt:new Date().toISOString(),control,refs,documents,candidates,baseline};
 },true);
 writeFileSync('../../work/nc-e2e/database-snapshot.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify({references:result.refs.length,documents:result.documents.map((d:any)=>({source:d.source_id,pages:d.data.previewPages.length,title:d.data.name})),candidateProjects:result.candidates.length,baseline:result.baseline}));
}finally{await db.close();}
