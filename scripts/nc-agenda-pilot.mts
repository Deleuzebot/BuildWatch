/** Explicit dry-run PDF samples; no project/meeting publication. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {loadPostgresEnvironment,PostgresDatabase} from '../server/postgres/connection';import {runState,type WorkerRPC} from '../server/maintenance/worker';
if(!process.env.CI)loadPostgresEnvironment();const db=new PostgresDatabase(),results:any[]=[];
const sourceIds=['source-1bb48732857df49b9ee9972bcf0739','source-8c1eabeb036a4393e890729df7c630'];
const rpc:WorkerRPC=async(action,input={})=>(await db.one('SELECT public.buildwatch_maintenance_worker($1,$2::jsonb) value',[action,JSON.stringify(input)])).value;
try{
 const state=await rpc('states');if(state.control.schedule_enabled||state.control.writes_enabled)throw Error('Keep dry-run gates off');
 for(const sourceId of sourceIds){
  const wrapped:WorkerRPC=async(action,input={})=>{const value=await rpc(action,input);if(action==='claim'&&value.run){for(const source of value.sources)if(source.id===sourceId)source.config={...source.config,agendaPDFReview:true,agendaPDFLimit:3,agendaRedirectPathPattern:'^/(?:Archive|ArchiveCenter|DocumentCenter|AgendaCenter)(?:[/.?])',noticeExcludePattern:'Meeting Schedule|Calendar|Member List|Rules of Procedure'};}return value;};
  const result=await runState(wrapped,{state:'NC',mode:'initial',dryRun:true,onlySource:sourceId,key:'nc-agenda-extraction-v2:'+sourceId+':'+(process.env.GITHUB_RUN_ID||'local'),maxSeconds:220,maxRequests:8,maxRecords:300,githubURL:process.env.GITHUB_RUN_ID?'https://github.com/'+process.env.GITHUB_REPOSITORY+'/actions/runs/'+process.env.GITHUB_RUN_ID:undefined});results.push(result);console.log(JSON.stringify(result));
 }
 mkdirSync('reports/maintenance',{recursive:true});writeFileSync('reports/maintenance/nc-agenda-pilot.json',JSON.stringify(results,null,2));
 if(results.some(r=>r.status==='failed'))process.exitCode=1;
}finally{await db.close();}
