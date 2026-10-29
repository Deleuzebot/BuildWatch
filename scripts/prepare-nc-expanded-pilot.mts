/** Resume read-only feed checks within the existing monthly cap. */
import {readFileSync,writeFileSync} from 'node:fs';
import {loadPostgresEnvironment,PostgresDatabase} from '../server/postgres/connection';
loadPostgresEnvironment();const db=new PostgresDatabase();
try{
 const control=await db.one('SELECT * FROM buildwatch.maintenance_control WHERE id=1');if(control.schedule_enabled||control.writes_enabled)throw Error('Dry-run gates must remain off');
 const sizes=JSON.parse(readFileSync('config/maintenance/nc-source-sizes.json','utf8')).sources;
 const runs=await db.rows("SELECT DISTINCT ON(s.id) s.id source_id,r.request_key,r.status,r.checkpoint FROM buildwatch.maintenance_sources s JOIN buildwatch.maintenance_runs r ON right(r.request_key,length(s.id))=s.id WHERE r.dry_run AND r.request_key LIKE 'nc-source-repair:%' ORDER BY s.id,r.created DESC");
 const tasks:any[]=[];
 for(const size of sizes){if(size.role==='supporting_only'||!size.total)continue;const run=runs.find(r=>r.source_id===size.sourceId);if(!run||run.status!=='partially_completed')continue;
  const offset=run.checkpoint?.cursors?.[size.sourceId]||0;
  for(let i=0;i<Math.ceil((size.total-offset)/1000);i++)tasks.push({sourceId:size.sourceId,requestKey:run.request_key,expectedOffset:offset+i*1000});
 }
 const usage=await db.one("SELECT * FROM buildwatch.maintenance_monthly WHERE month=date_trunc('month',now())::date");
 if(tasks.length*4+Number(usage.requests_reserved)>control.monthly_requests)throw Error('Expanded pilot exceeds unchanged monthly request cap');
 writeFileSync('config/maintenance/nc-resume.json',JSON.stringify(tasks,null,2)+'\n');
 await db.query("UPDATE buildwatch.maintenance_states SET max_requests=4 WHERE state='NC' AND max_requests IN(4,8,80)");
 console.log(JSON.stringify({tasks:tasks.length,reservationCeiling:tasks.length*4,monthlyCap:control.monthly_requests,excluded:'Greensboro supporting permit archive; not independent development discovery',projectChanges:0}));
}finally{await db.close();}
