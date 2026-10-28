/** Manual, bounded, review-only audit. Uses only the least-privilege worker RPC. */
import {mkdirSync,writeFileSync,appendFileSync,readFileSync} from 'node:fs';
import {loadPostgresEnvironment,PostgresDatabase} from '../server/postgres/connection';
import {runState} from '../server/maintenance/worker';
if(!process.env.CI)loadPostgresEnvironment();
const db=new PostgresDatabase(),started=Date.now(),campaign=process.env.GITHUB_RUN_ID||new Date().toISOString();
const dir='reports/maintenance/nc-source-pilot-'+campaign.replace(/[^a-zA-Z0-9-]/g,'-');mkdirSync(dir,{recursive:true});
const registry=JSON.parse(readFileSync('config/maintenance/nc-registry.json','utf8'));
const sources=process.argv.includes('--blocked-only')||process.env.BW_PILOT_SOURCE==='blocked'?registry.filter((s:any)=>s.previouslyBlocked):registry;
const report:any={created:new Date().toISOString(),dryRun:true,campaign,coverage:'At most 50 records per source; readiness sample, not statewide verification.',results:[]};
const rpc=async(action:string,input:any={})=>(await db.one('SELECT public.buildwatch_maintenance_worker($1,$2::jsonb) value',[action,JSON.stringify(input)])).value;
const githubURL=process.env.GITHUB_RUN_ID?'https://github.com/'+process.env.GITHUB_REPOSITORY+'/actions/runs/'+process.env.GITHUB_RUN_ID:undefined;
try{
 const state=await rpc('states');
 if(state.control.schedule_enabled||state.control.writes_enabled)throw Error('Pilot requires scheduling and live writes off');
 for(const source of sources){
  if(Date.now()-started>840000)break;
  let result:any;
  try{result=await runState(rpc,{state:'NC',mode:'initial',dryRun:true,key:'nc-source-repair:'+campaign+':'+source.sourceId,maxSeconds:40,maxRequests:8,maxRecords:50,onlySource:source.sourceId,githubURL});}catch(e:any){result={status:'failed',error:e.message};}
  const row={sourceId:source.sourceId,jurisdiction:source.jurisdiction,url:source.url,...result};
  report.results.push(row);report.updated=new Date().toISOString();report.remaining=sources.filter((s:any)=>!report.results.some((v:any)=>v.sourceId===s.sourceId)).map((s:any)=>({id:s.sourceId,jurisdiction:s.jurisdiction}));
  writeFileSync(dir+'/results.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(row));
 }
 const count=(key:string)=>report.results.reduce((n:number,r:any)=>n+(r[key]||0),0);
 const summary='## NC source-readiness pilot — dry-run only\n\n'+report.coverage+'\n\n| Source | Records | Names | Statuses decoded | Outcome / limitation |\n| --- | ---: | ---: | ---: | --- |\n'+report.results.map((r:any)=>'| '+r.jurisdiction+' / '+r.url.split('/').at(-1)+' | '+(r.sourceRecords||0)+' | '+(r.mappingQuality?.named||0)+' | '+(r.mappingQuality?.statusDecoded||0)+' | '+r.status+' '+(r.error||r.coverage||'').replaceAll('|','/')+' |').join('\n')+'\n\nSource records: '+count('sourceRecords')+'; source failures: '+count('sourceFailures')+'; public project changes: '+(count('newFindings')+count('statusChanges')+count('archived'))+'; remaining sources: '+report.remaining.length+'.\n\nPartial feeds retain checkpoints and are not counted as completed verification. Scheduling and project writes remain off.\n';
 writeFileSync(dir+'/summary.md',summary);if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary);
 console.log(JSON.stringify({report:dir,sourcesAttempted:report.results.length,remaining:report.remaining.length,records:count('sourceRecords'),sourceFailures:count('sourceFailures'),dryRun:true}));
 if(report.remaining.length||report.results.some((r:any)=>r.status==='failed'))process.exitCode=1;
}finally{await db.close();}
