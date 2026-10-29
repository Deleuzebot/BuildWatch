/** Five-jurisdiction evidence/matching pilot. All proposals are private; never publishes. */
import {readFileSync,writeFileSync,mkdirSync,appendFileSync} from 'node:fs';
import {loadPostgresEnvironment,PostgresDatabase} from '../server/postgres/connection';
import {Budget,hash,type Source} from '../server/maintenance/policy';
import {ResearchReader} from '../server/maintenance/research-reader';
import {parsePage,validateSourceSchema} from '../server/maintenance/adapters';
import {verifyIdentity,pointInOfficialPolygon,extractAgendaItems,agendaMeeting,proposeStructured} from '../server/maintenance/end-to-end';

const offline=process.argv.includes('--offline');if(!process.env.CI&&!offline)loadPostgresEnvironment();
const fixtures=JSON.parse(readFileSync('tests/fixtures/nc-e2e-evidence.json','utf8'));
const plan=JSON.parse(readFileSync('config/maintenance/nc-five-jurisdiction-plan.json','utf8'));
const snapshot=offline?JSON.parse(readFileSync('../../work/nc-e2e/database-snapshot.json','utf8')):null;
const db=offline?null:new PostgresDatabase(),budget=new Budget(210,20,100,10_000_000),reader=new ResearchReader(budget);
const rpc=async(action:string,input:any={})=>(await db!.one('SELECT public.buildwatch_maintenance_worker($1,$2::jsonb) value',[action,JSON.stringify(input)])).value;
let run:any;const report:any={createdAt:new Date().toISOString(),dryRun:true,automaticPublication:false,aiRequests:0,mode:offline?'offline_replay':'cloud_validation',jurisdictions:[],limitations:['Eight GIS records per jurisdiction; first 12 cached pages per agenda packet. Not statewide verification.','Case requests and application decisions do not establish whole-development construction milestones.']};
const call=(action:string,input:any={})=>rpc(action,{runId:run.id,lease:run.lease,...input});
async function match(sourceId:string,externalId:string){
 if(!offline)return call('match',{sourceId,externalId});
 const refs=snapshot.refs.filter((r:any)=>r.source_id===sourceId&&r.external_id===externalId),ids=[...new Set(refs.map((r:any)=>r.canonical_id))];return{ids,project:ids.length===1?refs[0].project:null};
}
try{
 if(!offline){const s=await rpc('states');if(s.control.schedule_enabled||s.control.writes_enabled||s.control.pilot_approved)throw Error('Pilot requires all publication gates off');
  const claim=await rpc('claim',{state:'NC',mode:'initial',dryRun:true,key:'five-e2e:'+(process.env.GITHUB_RUN_ID||new Date().toISOString()),githubURL:process.env.GITHUB_RUN_ID?'https://github.com/'+process.env.GITHUB_REPOSITORY+'/actions/runs/'+process.env.GITHUB_RUN_ID:undefined});
  if(!claim.run)throw Error('Pilot could not claim bounded run: '+claim.status);run=claim.run;budget.maxRequests=Math.min(budget.maxRequests,claim.state.max_requests);
  for(const p of plan){const registered=claim.sources.find((s:any)=>s.id===p.source.id);if(!registered||registered.url!==p.source.url||registered.autopublish)throw Error('Unexpected registered source or publication flag');}
 }
 for(const cache of fixtures.structured){const source:Source=plan.find((p:any)=>p.source.id===cache.sourceId).source;validateSourceSchema(source,cache.metadata);
  if(!offline&&(Date.now()-Date.parse(cache.cachedAt)>86400000||Date.now()<Date.parse(cache.cachedAt)))throw Error('Pilot cache is outside the explicit 24-hour replay envelope');
  const findings=parsePage(source,JSON.stringify(cache.data),8).findings;
  let geometry=fixtures.geometry.find((g:any)=>g.sourceId===source.id),geometryError='';
  if(!geometry&&!offline){const u=new URL(source.url+'/query');u.search=new URLSearchParams({f:'json',objectIds:cache.data.features.map((f:any)=>f.attributes[source.config.idField]).join(','),outFields:source.config.idField+','+source.config.fields.name,outSR:'4326',returnGeometry:'true'}).toString();
   try{const r=await reader.get(u.href),data=JSON.parse(r.body);if(data.error||!Array.isArray(data.features)||data.features.length>8)throw Error('Invalid bounded footprint response');geometry={data,url:u.href,retrievedAt:new Date().toISOString()};}catch(e:any){geometryError=e.message;}
  }
  const row:any={city:cache.city,sourceId:source.id,cacheTime:cache.cachedAt,sourceHash:cache.sourceHash,records:[],geometryError};
  for(let index=0;index<findings.length;index++){budget.check(false);const f=findings[index],m=await match(source.id,f.externalId),raw=cache.data.features[index].attributes;
   const feature=geometry?.data.features.find((g:any)=>String(g.attributes[source.config.idField])===String(raw[source.config.idField]));
   const footprintIdentity=feature&&String(feature.attributes[source.config.fields.name]).trim()===f.name;
   const inside=m.project&&footprintIdentity?pointInOfficialPolygon(m.project.latitude,m.project.longitude,feature.geometry,geometry.data.spatialReference?.latestWkid||geometry.data.spatialReference?.wkid):undefined;
   const proposal=proposeStructured(f,cache.city,m,{inside,source:geometry?.url||f.url});
   row.records.push(proposal);budget.records++;
   if(!offline){await call('finding',{id:hash(['five-e2e-v1',source.id,f.externalId,cache.sourceHash,proposal]),sourceId:source.id,
    finding:{...f,recordKind:'end_to_end_validation',cachedAt:cache.cachedAt,proposal,reviewRequired:true},project:m.project||{id:'pilot-'+hash([source.id,f.externalId]).slice(0,30),state:'NC'},eligible:false,reason:proposal.reasons.join('; ')||'Evidence-only proposal; administrator review required',confidence:{method:'source-scoped-identity-and-evidence-v1',identityVerified:proposal.identity.verified,automaticPublication:false}});}
  }
  report.jurisdictions.push(row);
 }
 for(const cache of fixtures.documents){const source=plan.find((p:any)=>p.source.id===cache.sourceId).source,items=extractAgendaItems(cache.pages),records:any[]=[];
  for(const item of items){const m=await match(source.id,item.caseId),identity=verifyIdentity({externalId:item.caseId,name:item.caseId},cache.city,m),meeting=agendaMeeting(cache.pages,item);
   const record={...item,identity,projectId:null,meeting,source:cache.document.url,documentHash:cache.document.sha256,publicationDate:null,retrievedAt:cache.cachedAt,
    proposed:{insertProject:false,statusChange:null,approvalDateChange:null,pinChange:null,reviewRequired:true},automaticPublication:false};
   records.push(record);
   if(!offline)await call('finding',{id:hash(['five-e2e-agenda-v1',source.id,item.caseId,cache.document.sha256]),sourceId:source.id,
    finding:{externalId:item.caseId,name:item.caseId,url:cache.document.url,quote:item.evidence[0]?.quote.slice(0,2000),recordKind:'end_to_end_validation',proposal:record},
    project:{id:'pilot-'+hash([source.id,item.caseId]).slice(0,30),state:'NC'},eligible:false,reason:'Agenda request, unresolved identity/location; no confirmed final decision',confidence:{method:'official-case-page-evidence',automaticPublication:false}});
  }
  report.jurisdictions.push({city:cache.city,sourceId:source.id,cacheTime:cache.cachedAt,packetPages:cache.document.totalPages,extractedPages:cache.pages.length,limitation:cache.limitation,records});
 }
 const structured=report.jurisdictions.slice(0,3).flatMap((r:any)=>r.records),documents=report.jurisdictions.slice(3).flatMap((r:any)=>r.records);
 report.summary={structuredRecords:structured.length,exactIdentityMatches:structured.filter((r:any)=>r.identity.verified).length,unmatchedStructured:structured.filter((r:any)=>!r.identity.verified).length,
  pinsInsideOfficialFootprints:structured.filter((r:any)=>r.location.inside===true).length,pinsOutsideOfficialFootprints:structured.filter((r:any)=>r.location.inside===false).length,
  footprintUnavailable:structured.filter((r:any)=>r.location.inside===undefined).length,datedApplicationMilestones:structured.filter((r:any)=>r.proposed.scopedMilestone).length,
  proposedSourceCitations:structured.filter((r:any)=>r.proposed.sourceCitation).length,statusConflictsRequiringReview:structured.filter((r:any)=>r.proposed.statusChange).length,
  agendaCases:documents.length,agendaCasesWithConfirmedDecisions:documents.filter((r:any)=>r.confirmedDecision).length,verifiedUpcomingMeetings:documents.filter((r:any)=>r.identity.verified&&r.meeting&&!r.meeting.past&&r.meeting.venue).length,
  reviewRecords:structured.length+documents.length,publicMutations:0,approvalDatesChanged:0,sourceFailures:report.jurisdictions.filter((r:any)=>r.geometryError).length,...budget.snapshot()};
 report.executionPassed=report.jurisdictions.length===5&&structured.length===24&&documents.length===3;
 report.readyForAutomaticPublication=false;report.status='partially_completed';
 const summary='## Five-jurisdiction end-to-end pilot — dry-run only\n\n| Jurisdiction | Source items | Exact project matches | Official footprint checks |\n| --- | ---: | ---: | ---: |\n'+report.jurisdictions.map((r:any)=>'| '+r.city+' | '+r.records.length+' | '+r.records.filter((x:any)=>x.identity.verified).length+' | '+r.records.filter((x:any)=>x.location?.inside===true).length+' |').join('\n')+'\n\n```json\n'+JSON.stringify(report.summary,null,2)+'\n```\n\nExecution contract passed: '+report.executionPassed+'. Readiness: **partial; administrator review required**. No public writes, approval clock changes, merges, or new markers. Agenda date evidence is not a confirmed decision. Only cached page portions are represented.\n';
 mkdirSync('reports/maintenance',{recursive:true});writeFileSync('reports/maintenance/nc-e2e-results.json',JSON.stringify(report,null,2));writeFileSync('reports/maintenance/nc-e2e-summary.md',summary);if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary);
 console.log(JSON.stringify({executionPassed:report.executionPassed,status:report.status,summary:report.summary,jurisdictions:report.jurisdictions.map((r:any)=>({city:r.city,geometryError:r.geometryError,records:r.records.length}))}));
 if(!offline)await call('finish',{status:'partially_completed',stats:{...report.summary,projectsChecked:report.summary.exactIdentityMatches,sourceRecords:report.summary.structuredRecords+report.summary.agendaCases,unverified:report.summary.reviewRecords,coverage:'24 sampled GIS records and 3 agenda cases in five jurisdictions; private review proposals only',readyForAutomaticPublication:false},checkpoint:{pilot:'five-jurisdiction',executionPassed:report.executionPassed},error:'Evidence gaps and unmatched records remain; see private end_to_end_validation findings. Proposed milestones were not applied.'});
 if(!report.executionPassed)process.exitCode=1;
}catch(e:any){if(run)await call('finish',{status:'failed',error:e.message,stats:budget.snapshot(),checkpoint:{pilot:'five-jurisdiction'}}).catch(()=>{});throw e;}
finally{await db?.close();}
