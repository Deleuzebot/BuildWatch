/** Bounded, review-only source audit. Never runs statewide expiration or project writes. */
import {mkdirSync,writeFileSync,existsSync,readFileSync} from 'node:fs';
import {loadPostgresEnvironment,PostgresDatabase} from '../server/postgres/connection';
import {runState} from '../server/maintenance/worker';
loadPostgresEnvironment();
const db=new PostgresDatabase(),dir='reports/maintenance/nc-source-pilot',started=Date.now();
mkdirSync(dir,{recursive:true});
const reportPath=dir+'/results.json';
const report:any=existsSync(reportPath)?JSON.parse(readFileSync(reportPath,'utf8')):{created:new Date().toISOString(),dryRun:true,coverage:'At most 50 records per source; source readiness sample, not statewide verification.',results:[]};
const rpc=async(action:string,input:any={})=>(await db.one('SELECT public.buildwatch_maintenance_worker($1,$2::jsonb) value',[action,JSON.stringify(input)])).value;
try{
 const control=await db.one('SELECT schedule_enabled,writes_enabled FROM buildwatch.maintenance_control WHERE id=1');
 if(control.schedule_enabled||control.writes_enabled)throw Error('Pilot requires scheduling and live writes off');
 const sources=await db.rows("SELECT * FROM buildwatch.maintenance_sources WHERE state='NC' AND enabled AND id<>'source-eb945f0d43d269a3824983773bc797' ORDER BY jurisdiction,id");
 for(const source of sources){
  if(report.results.some((v:any)=>v.sourceId===source.id))continue;
  if(Date.now()-started>840000)break;
  const observations:any={metadata:null,sample:null};
  const transport:typeof fetch=async(input:any,init:any)=>{
   const response=await fetch(input,init),url=String(input);
   if(response.ok&&!url.endsWith('/robots.txt')){
    const copy=response.clone();try{const json=await copy.json();if(Array.isArray(json.features)||Array.isArray(json.results)){if(!observations.sample)observations.sample=json;}else if(Array.isArray(json.fields))observations.metadata=json;}catch{}
   }
   return response;
  };
  let result:any;
  try{result=await runState(rpc,{state:'NC',mode:'initial',dryRun:true,key:'nc-source-readiness-2026-10-28-v1:'+source.id,maxSeconds:30,maxRequests:6,maxRecords:50,onlySource:source.id},transport);}catch(e:any){result={status:'failed',error:e.message};}
  const row={sourceId:source.id,jurisdiction:source.jurisdiction,url:source.url,...result};
  report.results.push(row);report.updated=new Date().toISOString();report.remaining=sources.filter((s:any)=>!report.results.some((v:any)=>v.sourceId===s.id)).map((s:any)=>({id:s.id,jurisdiction:s.jurisdiction}));
  writeFileSync(dir+'/'+source.id+'.json',JSON.stringify(observations,null,2));writeFileSync(reportPath,JSON.stringify(report,null,2));
  console.log(JSON.stringify({jurisdiction:source.jurisdiction,sourceId:source.id,status:result.status,records:result.sourceRecords||0,mapping:result.mappingQuality,error:result.error}));
 }
 console.log(JSON.stringify({report:reportPath,sourcesChecked:report.results.length,remaining:report.remaining?.length||0}));
}finally{await db.close();}
