/** Manual evidence-only document follow-up. Never modifies published project records. */
import {readFileSync,writeFileSync,mkdirSync,appendFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {loadPostgresEnvironment,PostgresDatabase} from '../server/postgres/connection';
import {SourceHTTP,DocumentTooLarge} from '../server/maintenance/http';import {Budget,hash} from '../server/maintenance/policy';
import {robotsAllows,robotsUnavailableAllows} from '../server/maintenance/worker';import {extractAgendaPDF} from '../server/maintenance/agendas';
if(!process.env.CI)loadPostgresEnvironment();process.env.BW_PDF_50MB_BENCHMARK='true';
const db=new PostgresDatabase(),budget=new Budget(230,30,100,150_000_000),documents=JSON.parse(readFileSync('config/maintenance/nc-followup-documents.json','utf8'));
const rpc=async(action:string,input:any={})=>(await db.one('SELECT public.buildwatch_maintenance_worker($1,$2::jsonb) value',[action,JSON.stringify(input)])).value;
let run:any;const results:any[]=[],clients=new Map<string,SourceHTTP>();
try{
 const state=await rpc('states');if(state.control.schedule_enabled||state.control.writes_enabled||state.control.pilot_approved)throw Error('All publication and schedule gates must remain off');
 const claim=await rpc('claim',{state:'NC',mode:'initial',dryRun:true,key:'four-followup-docs:'+(process.env.GITHUB_RUN_ID||new Date().toISOString()),githubURL:process.env.GITHUB_RUN_ID?'https://github.com/'+process.env.GITHUB_REPOSITORY+'/actions/runs/'+process.env.GITHUB_RUN_ID:undefined});
 if(!claim.run)throw Error('No bounded research lease: '+claim.status);run=claim.run;budget.maxRequests=Math.min(30,claim.state.max_requests);
 const call=(action:string,input:any={})=>rpc(action,{runId:run.id,lease:run.lease,...input});
 for(const definition of documents){const row:any={key:definition.key,url:definition.url,sourceId:definition.sourceId};
  try{
   budget.check();if(Date.now()-budget.started>165000)throw Error('Document deferred: insufficient remaining sandbox time');
   const u=new URL(definition.url);if(!['www.kannapolisnc.gov','www.apexnc.org','www.burlingtonnc.gov','www.carync.gov'].includes(u.hostname)||!claim.sources.some((s:any)=>s.id===definition.sourceId&&s.authority==='official'))throw Error('Unregistered follow-up source');
   let http=clients.get(u.origin);if(!http){http=new SourceHTTP(budget,u.origin);let policy='';try{policy=(await http.get(u.origin+'/robots.txt')).body;}catch(e:any){if(!robotsUnavailableAllows({adapter:'document',authority:'official',url:definition.url} as any,e.message))throw e;}
    http.accessPolicy=t=>robotsAllows(policy,t.pathname+t.search);http.minimumInterval=Math.max(1,...[...policy.matchAll(/^crawl-delay:\s*(\d+(?:\.\d+)?)/gim)].map(m=>Number(m[1])))*1000;
    http.redirectPolicy=t=>/^\/(?:DocumentCenter|Archive|ArchiveCenter|home\/showpublisheddocument|Portals\/0\/Kannapolis)(?:[/.?])/i.test(t.pathname+t.search);clients.set(u.origin,http);
   }
   const response=await http.getPDF(definition.url,'planning50'),pdf=await extractAgendaPDF(response.rawBody,'planning50'),digest=createHash('sha256').update(response.rawBody).digest('hex');
   const pattern=new RegExp(definition.terms,'i'),selected=pdf.pages.filter((p,i)=>i===0||i===pdf.pages.length-1||pattern.test(p.text)).slice(0,8).map(p=>({page:p.page,text:p.text.slice(0,9000),excerptTruncated:p.text.length>9000}));
   Object.assign(row,{status:'extracted',documentHash:digest,inputBytes:response.rawBody.length,totalPages:pdf.totalPages,processedPages:pdf.pages.length,truncated:pdf.truncated,metrics:pdf.metrics,retrievedAt:new Date().toISOString(),pages:selected});
   await call('finding',{id:hash(['four-followup-doc-v1',definition.key,digest]),sourceId:definition.sourceId,
    finding:{externalId:'followup:'+definition.key,name:definition.key,url:definition.url,quote:selected[0]?.text.slice(0,2000)||'',recordKind:'targeted_followup_document',evidence:row,reviewRequired:true},
    project:{id:'followup-'+hash(definition.key).slice(0,30),state:'NC'},eligible:false,reason:'Official document evidence for private discrepancy review; no project decision applied',confidence:{method:'official-pdf-page-excerpts',automaticPublication:false}});
  }catch(e:any){row.status='unresolved';row.error=e.message;row.capacityDeferred=e instanceof DocumentTooLarge;}
  results.push(row);console.log(JSON.stringify({key:row.key,status:row.status,pages:row.totalPages,error:row.error,metrics:row.metrics}));
 }
 const stats={...budget.snapshot(),documents:results.length,extracted:results.filter(r=>r.status==='extracted').length,unresolved:results.filter(r=>r.status!=='extracted').length,publicMutations:0,approvalDatesChanged:0};
 await call('finish',{status:stats.unresolved?'partially_completed':'awaiting_review',stats,checkpoint:{investigation:'four-followups'},error:stats.unresolved?'Some official evidence remains unavailable; no public changes':null});
 mkdirSync('reports/maintenance',{recursive:true});writeFileSync('reports/maintenance/four-followup-documents.json',JSON.stringify({stats,results},null,2));
 if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,'## Targeted discrepancy evidence — private only\n\n'+results.map(r=>'- '+r.key+': '+r.status+'; '+(r.totalPages||0)+' pages. '+(r.error||'')).join('\n')+'\n\nNo project, timeline, status, coordinate, or approval-expiration updates.\n\n```json\n'+JSON.stringify(stats,null,2)+'\n```\n');
 if(stats.extracted===0)process.exitCode=1;
}catch(e:any){if(run)await rpc('finish',{runId:run.id,lease:run.lease,status:'failed',error:e.message,stats:budget.snapshot()}).catch(()=>{});throw e;}
finally{await db.close();}
