/** Manual Linux tests of disabled candidates. Never enables a source or project writes. */
import {readFileSync,writeFileSync,mkdirSync,appendFileSync} from 'node:fs';import {loadPostgresEnvironment,PostgresDatabase} from '../server/postgres/connection';import {runState,type WorkerRPC} from '../server/maintenance/worker';
if(!process.env.CI)loadPostgresEnvironment();const db=new PostgresDatabase(),plan=JSON.parse(readFileSync('config/maintenance/nc-adapter-pilot-plan.json','utf8')),results:any[]=[],started=Date.now();
const rpc:WorkerRPC=async(action,input={})=>(await db.one('SELECT public.buildwatch_maintenance_worker($1,$2::jsonb) value',[action,JSON.stringify(input)])).value;
try{
 const state=await rpc('states');if(state.control.schedule_enabled||state.control.writes_enabled)throw Error('Dry-run gates must remain off');
 for(const task of plan){if(Date.now()-started>840000)break;
  const wrapped:WorkerRPC=async(action,input={})=>{const value=await rpc(action,input);if(action==='claim'&&value.run){if(!value.run.dry_run)throw Error('Candidate test requires a dry-run lease');value.sources=[{...task.source,autopublish:false,config:{...task.source.config,scopeVerified:false,agendaPDFReview:false}}];}return value;};
  try{const r=await runState(wrapped,{state:'NC',mode:'initial',dryRun:true,key:'nc-adapter-v1:'+(process.env.GITHUB_RUN_ID||'local')+':'+task.source.id,onlySource:task.source.id,maxSeconds:60,maxRequests:3,maxRecords:50,githubURL:process.env.GITHUB_RUN_ID?'https://github.com/'+process.env.GITHUB_REPOSITORY+'/actions/runs/'+process.env.GITHUB_RUN_ID:undefined});const row={name:task.name,type:task.type,adapterCoverage:task.coverage,...r};results.push(row);console.log(JSON.stringify(row));}catch(e:any){results.push({name:task.name,status:'failed',error:e.message});}
 }
 mkdirSync('reports/maintenance',{recursive:true});writeFileSync('reports/maintenance/nc-adapter-pilot.json',JSON.stringify(results,null,2));if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,'## NC adapter dry-run\n\n'+results.map(r=>'- '+r.name+': '+r.status+'; '+(r.documentLeads||0)+' document pointers. '+(r.error||'')).join('\n')+'\n\nNo public project writes or schedules enabled.\n');
 if(results.length<plan.length||results.some(r=>r.status==='failed'))process.exitCode=1;
}finally{await db.close();}
