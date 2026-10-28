/** Prepare only the existing dry-run checkpoints; never modifies projects. */
import {writeFileSync} from 'node:fs';import {loadPostgresEnvironment,PostgresDatabase} from '../server/postgres/connection';
loadPostgresEnvironment();const db=new PostgresDatabase();
try{
 const control=await db.one('SELECT * FROM buildwatch.maintenance_control WHERE id=1');if(control.schedule_enabled||control.writes_enabled)throw Error('Keep scheduling and writes off');
 const plan=await db.rows("SELECT DISTINCT ON(s.id) s.id source_id,r.request_key,r.status,r.checkpoint FROM buildwatch.maintenance_sources s JOIN buildwatch.maintenance_runs r ON right(r.request_key,length(s.id))=s.id WHERE r.dry_run AND r.github_url IN('https://github.com/Deleuzebot/BuildWatch/actions/runs/40788582824','https://github.com/Deleuzebot/BuildWatch/actions/runs/40789871130') ORDER BY s.id,r.created DESC");
 const pending=plan.filter(r=>r.status==='partially_completed'&&r.checkpoint?.cursors?.[r.source_id]>=50).map(r=>({sourceId:r.source_id,requestKey:r.request_key,expectedOffset:r.checkpoint.cursors[r.source_id]}));
 writeFileSync('config/maintenance/nc-resume.json',JSON.stringify(pending,null,2)+'\n');
 // Lower only the request ceiling for the pilot; never raise the monthly cap.
 const previous=await db.one("SELECT * FROM buildwatch.maintenance_states WHERE state='NC'");writeFileSync('../../work/nc-budget-before-continuation.json',JSON.stringify(previous,null,2));
 await db.query("UPDATE buildwatch.maintenance_states SET max_requests=8 WHERE state='NC' AND max_requests=80");
 console.log(JSON.stringify({checkpoints:pending.length,requestsPerAttempt:8,monthlyCap:control.monthly_requests,projectChanges:0}));
}finally{await db.close();}
