/** Resume existing review-only runs. No new campaign, no schedule, no project writes. */
import {readFileSync,mkdirSync,writeFileSync,appendFileSync} from 'node:fs';import {loadPostgresEnvironment,PostgresDatabase} from '../server/postgres/connection';import {runState} from '../server/maintenance/worker';
if(!process.env.CI)loadPostgresEnvironment();const db=new PostgresDatabase(),tasks=JSON.parse(readFileSync('config/maintenance/nc-resume.json','utf8')),started=Date.now(),results:any[]=[];
const rpc=async(action:string,input:any={})=>(await db.one('SELECT public.buildwatch_maintenance_worker($1,$2::jsonb) value',[action,JSON.stringify(input)])).value;
const url=process.env.GITHUB_RUN_ID?'https://github.com/'+process.env.GITHUB_REPOSITORY+'/actions/runs/'+process.env.GITHUB_RUN_ID:undefined;
try{
 const state=await rpc('states');if(state.control.schedule_enabled||state.control.writes_enabled)throw Error('Review-only safety gates must remain off');
 for(const task of tasks){
  if(Date.now()-started>840000)break;
  let before:any={},checkpoint:any={};const wrapped=async(action:string,input:any={})=>{const value=await rpc(action,input);if(action==='claim'&&value.run){before=value.run.stats||{};checkpoint=value.run.checkpoint||{};}return value;};
  try{const r=await runState(wrapped,{state:'NC',mode:'initial',dryRun:true,key:task.requestKey,onlySource:task.sourceId,maxSeconds:80,maxRequests:8,maxRecords:100,githubURL:url});const entry={sourceId:task.sourceId,startingOffset:checkpoint.cursors?.[task.sourceId]??task.expectedOffset,additionalRecords:(r.sourceRecords||0)-(before.sourceRecords||0),additionalRequests:(r.requests||0)-(before.requests||0),...r};results.push(entry);console.log(JSON.stringify(entry));}catch(e:any){const entry={sourceId:task.sourceId,status:'failed',error:e.message};results.push(entry);console.log(JSON.stringify(entry));}
 }
 const summary='## NC continuation — dry-run only\n\n| Source | Starting offset | Additional records | Outcome |\n| --- | ---: | ---: | --- |\n'+results.map(r=>'| '+(r.pilotSource?.jurisdiction||r.sourceId)+' | '+(r.startingOffset??'—')+' | '+(r.additionalRecords||0)+' | '+r.status+' '+(r.error||'').replaceAll('|','/')+' |').join('\n')+'\n\nProcessed attempts: '+results.length+'/'+tasks.length+'. Scheduled updates remain off. Partial sources retain checkpoints.\n';
 mkdirSync('reports/maintenance',{recursive:true});writeFileSync('reports/maintenance/nc-continuation.json',JSON.stringify(results,null,2));if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary);
 if(results.length<tasks.length||results.some(r=>r.status==='failed'))process.exitCode=1;
}finally{await db.close();}
