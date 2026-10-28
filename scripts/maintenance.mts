import{mkdirSync,writeFileSync,appendFileSync}from'node:fs';
import{resolve}from'node:path';
import{loadPostgresEnvironment,PostgresDatabase}from'../server/postgres/connection';
import{runState}from'../server/maintenance/worker';
import{allStates,scheduledStates,localDay,hash}from'../server/maintenance/policy';
const args=Object.fromEntries(process.argv.slice(2).map(v=>{const[i,...rest]=v.replace(/^--/,'').split('=');return[i,rest.length?rest.join('='):'true'];}));
if(!process.env.CI)loadPostgresEnvironment();
const db=new PostgresDatabase(),started=Date.now(),results:any[]=[];
const rpc=async(action:string,input:any={})=>(await db.one('SELECT public.buildwatch_maintenance_worker($1,$2::jsonb) value',[action,JSON.stringify(input)])).value;
try{
 const mode=args.mode||'weekly';if(!['initial','weekly'].includes(mode))throw Error('Mode must be initial or weekly');
 const dryRun=args['dry-run']!=='false';if(!dryRun&&process.env.BW_ALLOW_LIVE_WRITES!=='true')throw Error('Live writes require explicit BW_ALLOW_LIVE_WRITES and database pilot approval');
 if(process.env.GITHUB_EVENT_NAME==='schedule'&&mode==='initial')throw Error('Initial discovery is manual only');
 const selected=args.states==='rotation'||!args.states?scheduledStates():args.states.split(',').map(s=>s.trim().toUpperCase());
 if(selected.some(s=>!allStates.includes(s as any)))throw Error('Unknown state code');
 const requests=args.queue==='true'?await rpc('requests'):[];
 const tasks=requests.length?requests:selected.map(state=>({state,mode,dry_run:dryRun,request_key:(args.key||(mode==='weekly'?localDay():'initial-'+(process.env.GITHUB_RUN_ID||new Date().toISOString())))+(args.source?':source:'+args.source:'')+':'+state+':'+mode+':'+(dryRun?'dry':'live')}));
 for(const task of tasks){
  if(Date.now()-started>840000){results.push({state:task.state,status:'partially_completed',error:'Global 15-minute run ceiling; state remains pending'});continue;}
  try{
   const result=await runState(rpc,{state:task.state,mode:task.mode,dryRun:task.dry_run,key:task.request_key,scheduled:process.env.GITHUB_EVENT_NAME==='schedule',githubURL:process.env.GITHUB_SERVER_URL&&process.env.GITHUB_REPOSITORY?process.env.GITHUB_SERVER_URL+'/'+process.env.GITHUB_REPOSITORY+'/actions/runs/'+process.env.GITHUB_RUN_ID:undefined,maxSeconds:args.seconds?Number(args.seconds):undefined,maxRequests:args.requests?Number(args.requests):undefined,maxRecords:args.records?Number(args.records):undefined,onlySource:args.source});
   results.push({state:task.state,...result});console.log(JSON.stringify({state:task.state,status:result.status,runId:result.runId,stats:result}));
  }catch(e:any){results.push({state:task.state,status:'failed',error:e.message.replace(/password[^ ]*/ig,'[redacted]')});}
 }
 const config=await rpc('states'),report={created:new Date().toISOString(),dryRun,seconds:Math.round((Date.now()-started)/1000),databaseBytes:config.bytes,aiEnabled:process.env.BW_AI_ENABLED==='true',results,coverageNotice:'A processed state means configured sources were scanned, not that every jurisdiction or development was verified.'};
 const dir=resolve('reports/maintenance');mkdirSync(dir,{recursive:true});writeFileSync(dir+'/latest.json',JSON.stringify(report,null,2));
 if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,'## BuildWatch maintenance\n\n'+results.map(r=>'- '+r.state+': **'+r.status+'**'+(r.error?' — '+r.error:'')).join('\n')+'\n\n'+report.coverageNotice+'\n');
 if(results.some(r=>['failed','partially_completed'].includes(r.status)))process.exitCode=1;
}catch(e:any){console.error(JSON.stringify({status:'failed',message:e.message}));process.exitCode=1;}finally{await db.close();}
