/** Actual worker + isolated clones of current SQL. No government HTTP; every fixture rolls back. */
import assert from 'node:assert/strict';import {mkdirSync,writeFileSync,appendFileSync,readFileSync} from 'node:fs';
import {PostgresDatabase} from '../server/postgres/connection';import {runState} from '../server/maintenance/worker';import {deriveProject} from '../server/supabase/derive';import {evaluateFinding} from '../server/maintenance/policy';
if(!process.env.CI)process.loadEnvFile('.env.maintenance');
const db=new PostgresDatabase(),client=await db.pool.connect(),results:any[]=[],transportCalls:any[]=[];
const sql=async(text:string,args:any[]=[])=>client.query(text,args),one=async(text:string,args:any[]=[])=>((await sql(text,args)).rows[0]);
const guard=async()=>(await one('SELECT public.buildwatch_audit_guard() value')).value;
const before=await guard();assert.deepEqual(before.gates,{schedule:false,writes:false,approved:false});
const productionWritePrivilege=(await one("SELECT has_table_privilege(c.oid,'UPDATE') allowed FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='buildwatch' AND c.relname='projects'")).allowed;
assert.equal(productionWritePrivilege,false,'Use the existing least-privilege maintenance credential, not an owner credential');
const originalBody=(await one("SELECT prosrc FROM pg_proc WHERE oid='public.buildwatch_maintenance_worker(text,jsonb)'::regprocedure")).prosrc;
const clonedBody=(await one("SELECT prosrc FROM pg_proc WHERE oid='buildwatch_audit.buildwatch_maintenance_worker(text,jsonb)'::regprocedure")).prosrc;
assert.equal(clonedBody,originalBody.replace(/\bbuildwatch\b/g,'buildwatch_audit'),'Audit SQL must match the current production worker body');
const helperBodies=(await sql("SELECT p.proname,p.prosrc original,a.prosrc cloned FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace LEFT JOIN pg_namespace an ON an.nspname='buildwatch_audit' LEFT JOIN pg_proc a ON a.pronamespace=an.oid AND a.proname=p.proname AND pg_get_function_identity_arguments(a.oid)=replace(pg_get_function_identity_arguments(p.oid),'buildwatch.','buildwatch_audit.') WHERE n.nspname='buildwatch' AND p.prokind='f'")).rows;
for(const h of helperBodies)assert.equal(h.cloned,h.original.replace(/\bbuildwatch\b/g,'buildwatch_audit'),'Audit helper differs: '+h.proname);
const blank=async()=>one('SELECT (SELECT count(*) FROM buildwatch_audit.projects) projects,(SELECT count(*) FROM buildwatch_audit.history) history,(SELECT count(*) FROM buildwatch_audit.maintenance_runs) runs,(SELECT count(*) FROM buildwatch_audit.notifications) notifications');
assert.deepEqual(await blank(),{projects:0,history:0,runs:0,notifications:0});
let transaction=false,counter=0;
const today=new Date().toISOString().slice(0,10),day=(offset:number)=>new Date(Date.now()+offset*86400000).toISOString().slice(0,10);
const sourceURL='https://example.com/arcgis/rest/services/AuditFixture/FeatureServer/0';
const base=(id:string,status='In review',date=day(-30))=>({id:'audit-'+id,revision:0,name:'Fixture '+id+' Apartments',address:'100 '+id+' Fixture Way',neighborhood:'Audit City',jurisdiction:'Audit City',state:'NC',status,category:'Residential',latitude:35.7+(counter++/100),longitude:-78.8,description:'Controlled fixture: a 200-unit multifamily apartment development.',developer:'Fixture Developer',homes:200,completion:'Not documented',meetings:[],sources:[{title:'SIMULATED official record',url:sourceURL+'/query?objectIds=1'}],evidenceType:'municipal',sourceStatus:status,sourceStatusDate:date});
const seed=async(p:any,approval:any=null,follow=true)=>(await one('SELECT buildwatch_audit.fixture_seed($1::jsonb,$2::jsonb,$3::jsonb,$4) value',[JSON.stringify(p),JSON.stringify(await deriveProject(p,approval)),approval?JSON.stringify(approval):null,follow])).value;
const record=async(id:string)=>one(`SELECT p.data::jsonb project,(SELECT count(*) FROM buildwatch_audit.active_map_index WHERE id=$1) visible,(SELECT count(*) FROM buildwatch_audit.history WHERE project_id=$1) history,(SELECT count(*) FROM buildwatch_audit.notifications WHERE project_id=$1) notifications,(SELECT count(*) FROM buildwatch_audit.follows WHERE project_id=$1) follows,(SELECT jsonb_agg(to_jsonb(a)) FROM buildwatch_audit.project_activity a WHERE project_id=$1) activity,(SELECT to_jsonb(a) FROM buildwatch_audit.approval_policy a WHERE project_id=$1) approval,(SELECT to_jsonb(a) FROM buildwatch_audit.archived_projects a WHERE project_id=$1) archive FROM buildwatch_audit.project_profiles p WHERE p.id=$1`,[id]);
const configure=async(key:string,application=false)=>{
 await sql('UPDATE buildwatch_audit.maintenance_sources SET enabled=false');
 const config={idField:'OBJECTID',requiredFields:['OBJECTID','Name','Status','EventDate'],statusScope:application?'application':'development',scopeVerified:!application,terminalStatusVerified:!application,eventDateMeaning:'development_decision',fields:{name:'Name',status:'Status',description:'Description',address:'Address',category:'Category',developer:'Developer',eventDate:'EventDate'}};
 const url=sourceURL.replace('AuditFixture','AuditFixture_'+key.replace(/[^a-z0-9]/gi,'_'));
 await sql("INSERT INTO buildwatch_audit.maintenance_sources(id,state,jurisdiction,url,adapter,authority,enabled,autopublish,config) VALUES($1,'NC','Audit City',$2,'arcgis','official',true,true,$3)",[key,url,config]);return config;
};
const rpc:any=async(action:string,input:any={})=>(await one('SELECT buildwatch_audit.buildwatch_maintenance_worker($1,$2::jsonb) value',[action,JSON.stringify(input)])).value;
async function worker(key:string,p:any,status:string,date:string,options:{application?:boolean;unchanged?:boolean;outage?:boolean;description?:string;futureStart?:string}={}){
 await configure(key,!!options.application);if(options.futureStart)await sql('UPDATE buildwatch_audit.maintenance_sources SET config=config||$2::jsonb WHERE id=$1',[key,JSON.stringify({constructionScheduleVerified:true,dateFields:{constructionStartAt:'FutureStart'}})]);if(p?.id&&(await one('SELECT 1 present FROM buildwatch_audit.projects WHERE id=$1',[p.id])))await sql('INSERT INTO buildwatch_audit.maintenance_refs(source_id,external_id,project_id) VALUES($1,\'1\',$2)',[key,p.id]);
 const body=JSON.stringify({features:[{attributes:{OBJECTID:1,Name:p.name,Status:status,EventDate:date,FutureStart:options.futureStart,Address:p.address,Description:options.description||p.description,Category:'Residential',Developer:'Fixture Developer'},geometry:{x:p.longitude,y:p.latitude}}],exceededTransferLimit:false});
 const fake:typeof fetch=async(url:any,init:any)=>{
  const path=String(url);transportCalls.push({case:key,url:path,simulated:true});
  if(options.outage)return new Response('SIMULATED unavailable',{status:503});
  if(path.endsWith('/robots.txt'))return new Response('User-agent: *\nAllow: /');
  if(!path.includes('/query'))return new Response(JSON.stringify({objectIdField:'OBJECTID',fields:['OBJECTID','Name','Status','EventDate'].map(name=>({name,type:name==='OBJECTID'?'esriFieldTypeOID':'esriFieldTypeString'}))}));
  if(options.unchanged&&init?.headers?.['If-None-Match'])return new Response(null,{status:304});
  return new Response(body,{headers:{ETag:'"fixture-'+key+'"'}});
 };
 const result=await runState(rpc,{state:'NC',mode:'weekly',dryRun:false,key:'behavior-'+key},fake);
 return{result,body,fake};
}
async function scenario(name:string,demonstration:()=>Promise<any>){
 await sql('SAVEPOINT behavior_case');try{const result=await demonstration();if(result.desiredBehaviorPassed!==undefined)assert.equal(result.desiredBehaviorPassed,true,'Required maintenance behavior failed');results.push({name,kind:'controlled_simulation',executionPassed:true,...result});}
 catch(e:any){results.push({name,kind:'controlled_simulation',executionPassed:false,error:e.stack||e.message});}
 finally{await sql('ROLLBACK TO SAVEPOINT behavior_case');await sql('RELEASE SAVEPOINT behavior_case');}
}
try{
 await sql('BEGIN');transaction=true;await sql("SET LOCAL buildwatch.audit_transaction='rollback-only';SET LOCAL statement_timeout='60s';SET LOCAL idle_in_transaction_session_timeout='300s'");
 await sql('INSERT INTO buildwatch_audit.map_meta VALUES(1,1)');
 // These switches exist only in the empty audit schema, never the public data schema.
 await sql('INSERT INTO buildwatch_audit.maintenance_control(id,writes_enabled,pilot_approved,schedule_enabled) VALUES(1,true,true,false)');
 await sql("INSERT INTO buildwatch_audit.maintenance_states(state,weekday,active,max_seconds,max_requests,max_records) VALUES('NC',5,true,60,20,100)");
 await scenario('1-existing-project-new-approval',async()=>{
  const p=base('approval'),original=await seed(p),beforeRecord=await record(p.id),work=await worker('approval',p,'Approved',day(-1)),afterRecord=await record(p.id);
  assert.equal(afterRecord.project.status,'Approved');assert.equal(work.result.statusChanges,1);assert.equal(afterRecord.approval.approval_date,day(-1));assert.equal(afterRecord.history,beforeRecord.history+1);assert.equal(afterRecord.notifications,1);
  const approvalMilestonePresent=!!afterRecord.activity?.some((a:any)=>a.type==='Approval'&&a.event_date===day(-1));
  return{original,newEvidence:{status:'Approved',eventDate:day(-1),scope:'whole development',simulated:true},detected:work.result,observed:afterRecord,desiredResult:'Update status, preserve relationships, record approval and expiry; append a correctly scoped milestone',desiredBehaviorPassed:approvalMilestonePresent,functionality:approvalMilestonePresent?'implemented':'partial',notes:['Status/approval-policy persistence works; inspect activity separately for milestone completeness.']};
 });
 await scenario('2-construction-start',async()=>{
  const p=base('construction','Approved'),original=await seed(p);const work=await worker('construction',p,'Construction started',day(-2)),observed=await record(p.id);
  assert.equal(observed.project.status,'Under construction');assert.ok(observed.activity?.some((a:any)=>a.type==='Construction Started'&&a.event_date===day(-2)));assert.equal(observed.visible,1);assert.equal(observed.notifications,1);
  return{original,newEvidence:{status:'Construction started',date:day(-2),simulated:true},detected:work.result,observed,functionality:'implemented_for_verified_structured_source'};
 });
 await scenario('3-withdrawn-application-versus-cancelled-development',async()=>{
  const p=base('withdrawn','Approved'),original=await seed(p);const withdrawn=await worker('withdrawn-application',p,'Withdrawn',day(-1),{application:true});const held=await record(p.id);assert.equal(held.project.status,'Approved');assert.equal(held.history,1);
  await sql('DELETE FROM buildwatch_audit.maintenance_refs WHERE source_id=\'withdrawn-application\'');
  const cancelled=await worker('cancelled-development',p,'Cancelled',day(-1)),beforeAdmin=await record(p.id),automaticallyCancelled=beforeAdmin.project.status==='Cancelled'&&beforeAdmin.visible===0;
  if(!automaticallyCancelled)await seed({...beforeAdmin.project,status:'Cancelled',sourceStatus:'Cancelled',sourceStatusDate:day(-1)},null,false);
  const afterAdmin=await record(p.id);assert.equal(afterAdmin.visible,0);assert.equal(afterAdmin.follows,1);assert.equal(afterAdmin.notifications,1);
  return{original,newEvidence:{application:'Withdrawn',wholeDevelopment:'Cancelled',bothSimulated:true},detected:{withdrawn:withdrawn.result,cancelled:cancelled.result},automaticResult:beforeAdmin,manualPublisherResult:afterAdmin,desiredBehaviorPassed:automaticallyCancelled,functionality:automaticallyCancelled?'implemented':'partial',notes:['Application withdrawal does not cancel the development.','Map exclusion after explicit publisher approval is a separate mechanism from automated decision recognition.']};
 });
 await scenario('4-completed-development',async()=>{
  const p=base('completed','Under construction'),original=await seed(p),work=await worker('completed',p,'Completed',day(-1)),automaticResult=await record(p.id),automaticallyCompleted=automaticResult.project.status==='Completed'&&automaticResult.visible===0;
  if(!automaticallyCompleted)await seed({...automaticResult.project,status:'Completed',sourceStatus:'Completed',sourceStatusDate:day(-1)},null,false);const manualPublisherResult=await record(p.id);assert.equal(manualPublisherResult.visible,0);assert.equal(manualPublisherResult.follows,1);assert.equal(manualPublisherResult.notifications,1);
  const rediscovery=await worker('completed-rediscovery',manualPublisherResult.project,'Proposed',day(-1)),afterRediscovery=await record(p.id);assert.equal(afterRediscovery.project.status,'Completed');assert.equal(afterRediscovery.visible,0);assert.equal(rediscovery.result.newFindings,0);
  return{original,newEvidence:{status:'Completed',date:day(-1),simulated:true},detected:work.result,automaticResult,manualPublisherResult,rediscovery:rediscovery.result,desiredBehaviorPassed:automaticallyCompleted,functionality:automaticallyCompleted?'implemented':'partial',notes:['Terminal status hides the map marker after publisher approval; exact-reference rediscovery cannot republish it.']};
 });
 const expiredPolicy=(future=false)=>{const date=day(-366),at=Date.parse(date),expires=at+365*86400000,due=future?Date.now()+30*86400000:expires;return{approval_date:date,approval_at:at,approval_evidence:JSON.stringify({date,url:sourceURL,quote:'SIMULATED documented approval'}),schedules:future?JSON.stringify([{date:day(30),kind:'start',url:sourceURL,quote:'SIMULATED future construction schedule'}]):'[]',expires_at:expires,due_at:due,exception_until:future?due:null};};
 await scenario('5-approved-project-365-day-expiration',async()=>{
  const policy=expiredPolicy(),p=base('expired','Approved',policy.approval_date),original=await seed(p,policy);
  await sql('INSERT INTO buildwatch_audit.maintenance_lifecycle(project_id) VALUES($1)',[p.id]);await sql('SELECT buildwatch_audit.bw_refresh($1)',[p.id]);
  const protectedPolicy=expiredPolicy(true),protectedP=base('future-schedule','Approved',protectedPolicy.approval_date);await seed(protectedP,protectedPolicy,false);
  const inReview=base('old-review','In review',policy.approval_date);await seed(inReview,policy,false);
  const work=await worker('expiry',p,'Approved',policy.approval_date),observed=await record(p.id),future=await record(protectedP.id),review=await record(inReview.id);
  assert.equal(observed.archive.reason,'approved_expired');assert.equal(observed.visible,0);assert.equal(observed.follows,1);assert.equal(future.archive,null);assert.equal(future.visible,1);assert.equal(review.archive,null);assert.equal(review.project.status,'In review');
  return{original,newEvidence:{approvalDate:policy.approval_date,noSubsequentMovement:true,simulated:true},detected:work.result,observed,protectedFutureSchedule:future,inReviewNotExpired:review,functionality:'implemented_for_fresh_verified_managed_records'};
 });
 await scenario('5b-source-outage-does-not-trigger-worker-archive',async()=>{
  const policy=expiredPolicy(),p=base('outage','Approved',policy.approval_date),original=await seed(p,policy);await sql("INSERT INTO buildwatch_audit.maintenance_lifecycle(project_id) VALUES($1)",[p.id]);await sql("SELECT buildwatch_audit.bw_refresh($1)",[p.id]);const work=await worker('outage',p,'Approved',policy.approval_date,{outage:true}),observed=await record(p.id);assert.equal(work.result.sourceFailures,1);assert.equal(observed.archive,null);assert.equal(observed.visible,1);
  return{original,detected:work.result,observed,functionality:'implemented_for_managed_lifecycle',notes:['Worker archival is skipped on source failure.','Managed lifecycle remains visible until a successful verified check; legacy visibility is intentionally unchanged.']};
 });
 await scenario('5c-resumed-checkpoint-needs-fresh-project-verification',async()=>{
  const policy=expiredPolicy(),p=base('resumed-expiration','Approved',policy.approval_date);await seed(p,policy);await configure('resumed-expiration');
  const claim=await rpc('claim',{state:'NC',mode:'weekly',dryRun:false,key:'resumed-expiration'});
  await sql("UPDATE buildwatch_audit.maintenance_sources SET last_success=now() WHERE id='resumed-expiration'");
  await sql("INSERT INTO buildwatch_audit.maintenance_lifecycle(project_id,checked_run,source_id,checked_at,checked_lease) VALUES($1,$2,'resumed-expiration',now(),gen_random_uuid())",[p.id,claim.run.id]);await sql('SELECT buildwatch_audit.bw_refresh($1)',[p.id]);
  const input={runId:claim.run.id,lease:claim.run.lease};assert.deepEqual(await rpc('expirations',input),[]);assert.equal((await rpc('expire',{...input,projectId:p.id})).outcome,'protected_unverified');const observed=await record(p.id);assert.equal(observed.visible,1);assert.equal(observed.archive,null);
  return{observed,desiredBehaviorPassed:true,functionality:'implemented_verification_bound_to_current_lease',notes:['A previous attempt with the same run ID cannot authorize expiration.']};
 });
 await scenario('6-timeline-and-meaningful-information-update',async()=>{
  const p=base('information','Approved',day(-100)),at=Date.parse(p.sourceStatusDate),policy={approval_date:p.sourceStatusDate,approval_at:at,approval_evidence:JSON.stringify({date:p.sourceStatusDate,url:sourceURL,quote:'SIMULATED prior approval'}),schedules:'[]',expires_at:at+365*86400000,due_at:at+365*86400000};const original=await seed(p,policy);
  const work=await worker('information',p,'Approved',p.sourceStatusDate,{description:'Controlled new government evidence: approved housing count increased from 200 to 240.'}),descriptionResult=await record(p.id);
  const proposal=await one("SELECT id FROM buildwatch_audit.research_proposals WHERE project_id=$1 AND kind='information'",[p.id]);assert.ok(proposal);
  await sql("INSERT INTO buildwatch_audit.research_proposals(id,batch_id,kind,project_id,data,updated) SELECT repeat('a',64),batch_id,'uncertain',project_id,data,updated FROM buildwatch_audit.research_proposals WHERE id=$1",[proposal.id]);
  const filtered=(await one("SELECT buildwatch_audit.bw_research_api('{\"id\":\"audit-admin\"}'::jsonb,'GET','/api/admin/research','{}'::jsonb,'{\"kind\":\"information\"}'::jsonb) value")).value;assert.equal(filtered.total,1);assert.equal(filtered.items[0].kind,'information');
  await sql('SAVEPOINT information_confirmation');
  const preview=(await one('SELECT buildwatch_audit.bw_research_preview($1,$2) value',[proposal.id,'audit-admin'])).value;assert.ok(preview.after.description.includes('240'));
  await sql('SELECT buildwatch_audit.bw_research_api($1::jsonb,\'POST\',\'/api/admin/research/commit\',$2::jsonb,\'{}\'::jsonb)',[JSON.stringify({id:'audit-admin'}),JSON.stringify({token:preview.token,_project:preview.after,_derived:await deriveProject(preview.after,descriptionResult.approval)})]);
  const confirmed=await record(p.id);assert.ok(confirmed.project.description.includes('240'));assert.equal(confirmed.approval.approval_date,policy.approval_date);assert.equal(confirmed.approval.due_at,descriptionResult.approval.due_at);
  await sql('ROLLBACK TO SAVEPOINT information_confirmation');await sql('RELEASE SAVEPOINT information_confirmation');
  await sql("DELETE FROM buildwatch_audit.maintenance_refs WHERE source_id='information'");
  const milestone=await worker('reapproval',descriptionResult.project,'Approved',day(-1)),milestoneResult=await record(p.id);assert.equal(milestoneResult.project.sourceStatusDate,day(-1));
  const descriptionProposal=(await one("SELECT count(*) n FROM buildwatch_audit.research_proposals WHERE kind='information' AND project_id=$1",[p.id])).n===1;assert.equal(descriptionResult.project.description,p.description);const descriptionUpdated=descriptionProposal,timelineAppended=!!milestoneResult.activity?.some((a:any)=>a.event_date===day(-1)),priorActivityPreserved=!!milestoneResult.activity?.some((a:any)=>a.event_date===policy.approval_date),lifecycleRecognizesMovement=milestoneResult.approval.due_at>=Date.parse(day(-1))+365*86400000;
  return{original,newEvidence:{description:'Housing count increased to 240',newDocumentedDecision:day(-1),simulated:true},detected:{description:work.result,milestone:milestone.result},descriptionResult,isolatedAdministratorConfirmation:confirmed,milestoneResult,desiredChecks:{descriptionProposal:descriptionUpdated,timelineAppended,priorActivityPreserved,lifecycleRecognizesMovement},desiredBehaviorPassed:descriptionUpdated&&timelineAppended&&priorActivityPreserved&&lifecycleRecognizesMovement,functionality:descriptionUpdated&&timelineAppended&&priorActivityPreserved&&lifecycleRecognizesMovement?'implemented':'missing_or_partial'};
 });
 await scenario('7-genuinely-new-development-and-idempotent-repeat',async()=>{
  const p=base('new-development','Proposed',day(-1));const work=await worker('new-development',p,'Proposed',day(-1));const rows=(await sql('SELECT id,data::jsonb project FROM buildwatch_audit.projects')).rows;assert.equal(rows.length,1);assert.equal(work.result.newFindings,1);const first=await record(rows[0].id);
  const repeated=await runState(rpc,{state:'NC',mode:'weekly',dryRun:false,key:'repeat-new-development'},async(url:any,init:any)=>{if(String(url).includes('/query')&&init?.headers?.['If-None-Match'])return new Response(null,{status:304});return work.fake(url,init);});
  const second=await record(rows[0].id);assert.deepEqual(second,first);assert.equal(repeated.unchangedDocuments,1);
  return{original:null,newEvidence:{...p,simulated:true},detected:work.result,first,repeated,afterRepeat:second,functionality:'implemented_for_verified_structured_source'};
 });
 await scenario('8-unchanged-project-left-alone',async()=>{
  const p=base('unchanged','Approved',day(-1)),original=await seed(p),work=await worker('unchanged',p,'Approved',p.sourceStatusDate),observed=await record(p.id);assert.equal(work.result.statusChanges,0);assert.equal(observed.history,1);assert.equal(observed.notifications,0);assert.deepEqual(observed.project,original);
  return{original,newEvidence:{sameSourceRecord:true,simulated:true},detected:work.result,observed,functionality:'implemented'};
 });
 await scenario('9-new-documented-future-construction-protects-expiration',async()=>{
  const policy=expiredPolicy(),p=base('new-future','Approved',policy.approval_date);await seed(p,policy);await sql('INSERT INTO buildwatch_audit.maintenance_lifecycle(project_id) VALUES($1)',[p.id]);await sql('SELECT buildwatch_audit.bw_refresh($1)',[p.id]);
  const work=await worker('new-future',p,'Approved',policy.approval_date,{futureStart:day(90)}),observed=await record(p.id);assert.equal(observed.archive,null);assert.equal(observed.visible,1);assert.equal(observed.approval.approval_date,policy.approval_date);assert.ok(observed.approval.due_at>Date.now());
  return{detected:work.result,observed,desiredBehaviorPassed:true,functionality:'implemented_for_explicit_verified_schedule_fields'};
 });
 await scenario('10-real-cached-apex-component-decision',async()=>{
  const fixtures=JSON.parse(readFileSync('tests/fixtures/nc-e2e-evidence.json','utf8')),baseline=JSON.parse(readFileSync('tests/fixtures/apex-maintenance-baseline.json','utf8')),plan=JSON.parse(readFileSync('config/maintenance/nc-five-jurisdiction-plan.json','utf8')).find((v:any)=>v.name==='Apex'),cached=fixtures.structured.find((v:any)=>v.city==='Apex'),feature=cached.data.features.find((v:any)=>v.attributes.FID===712);
  assert.equal(before.projectsHash,baseline.productionProjectHash,'Revalidate the cached Supabase baseline if public data changed');
  const p={...baseline.project,id:'audit-real-apex-component',revision:0},original=await seed(p,null,false),source={...plan.source,config:{...plan.source.config,componentMilestonesVerified:true}};
  await sql('UPDATE buildwatch_audit.maintenance_sources SET enabled=false');await sql('INSERT INTO buildwatch_audit.maintenance_sources(id,state,jurisdiction,url,adapter,authority,enabled,autopublish,config) VALUES($1,\'NC\',\'Apex\',$2,\'arcgis\',\'official\',true,false,$3)',[source.id,source.url,source.config]);await sql('INSERT INTO buildwatch_audit.maintenance_refs(source_id,external_id,project_id) VALUES($1,\'712\',$2)',[source.id,p.id]);
  const replay:typeof fetch=async(url:any)=>new Response(String(url).endsWith('/robots.txt')?'User-agent: *\nAllow: /':JSON.stringify(String(url).includes('/query')?{features:[feature],exceededTransferLimit:false}:cached.metadata));
  const detected=await runState(rpc,{state:'NC',mode:'weekly',dryRun:false,key:'real-apex-cached'},replay),observed=await record(p.id);
  assert.equal(detected.sourceFailures,0);assert.equal(observed.project.status,original.status);assert.equal(observed.project.latitude,original.latitude);assert.equal(observed.project.longitude,original.longitude);assert.equal(observed.project.sourceStatusDate,original.sourceStatusDate);assert.equal(observed.approval,null);assert.equal(observed.history,2);assert.ok(observed.activity.some((v:any)=>v.type==='Application Approval'&&v.event_date==='2026-10-22'));const count=observed.activity.length;
  const repeated=await runState(rpc,{state:'NC',mode:'weekly',dryRun:false,key:'real-apex-repeat'},replay),afterRepeat=await record(p.id);assert.equal(afterRepeat.activity.length,count);assert.equal(afterRepeat.history,observed.history);
  return{kind:'real_official_cached_evidence_with_isolated_supabase_baseline',original,source:{url:source.url+'/query?f=json&objectIds=712&outFields=*&outSR=4326',cachedAt:cached.cachedAt,attributes:feature.attributes},detected,observed,repeated,desiredBehaviorPassed:true,functionality:'implemented_for_explicit_component_mapping',notes:['Actual official Apex fields replayed without government HTTP or Codex interpretation.','Registry attestation is test-only; production autopublish remains false.','TRC approval belongs to the infrastructure application, not the entire hospital campus.']};
 });
 await scenario('supplement-atomic-write-failure-rollback',async()=>{
  const p=base('atomic-failure'),original=await seed(p),beforeFailure=await record(p.id);await configure('atomic-failure');await sql("INSERT INTO buildwatch_audit.maintenance_refs(source_id,external_id,project_id) VALUES('atomic-failure','1',$1)",[p.id]);
  const claim=await rpc('claim',{state:'NC',mode:'weekly',dryRun:false,key:'atomic-failure'}),f:any={externalId:'1',name:p.name,description:p.description,address:p.address,latitude:p.latitude,longitude:p.longitude,rawStatus:'Approved',status:'Approved',eventDate:day(-1),category:'Residential',developer:p.developer,url:sourceURL,quote:'SIMULATED approval for atomic rollback test',principalUseVerified:true,locationVerified:true,wholeDevelopment:true};
  const source:any={id:'atomic-failure',state:'NC',jurisdiction:'Audit City',url:sourceURL,authority:'official',autopublish:true,config:{statusScope:'development',scopeVerified:true}},evaluation=evaluateFinding(f,source,beforeFailure.project);assert.equal(evaluation.eligible,true);
  const derived:any=await deriveProject(evaluation.project);derived.recordEvents=[{key:'invalid-fixture',type:'Approval',date:day(-1),at:'not-an-integer',description:'SIMULATED malformed projection',url:sourceURL}];
  await sql('SAVEPOINT deliberate_failure');let failure='';try{await rpc('finding',{runId:claim.run.id,lease:claim.run.lease,id:'audit-atomic-failure',sourceId:'atomic-failure',finding:f,project:evaluation.project,eligible:true,derived,confidence:{method:'fixture'}});}catch(e:any){failure=e.message;}
  await sql('ROLLBACK TO SAVEPOINT deliberate_failure');await sql('RELEASE SAVEPOINT deliberate_failure');assert.match(failure,/bigint|integer/i);const afterFailure=await record(p.id);assert.deepEqual(afterFailure,beforeFailure);
  return{original,newEvidence:{malformedProjection:true,simulated:true},failure,observed:afterFailure,desiredBehaviorPassed:true,functionality:'implemented'};
 });
}finally{if(transaction)await sql('ROLLBACK');}
const after=await guard(),emptyAfter=await blank();assert.deepEqual(after,before,'Production data or gates changed during audit');assert.deepEqual(emptyAfter,{projects:0,history:0,runs:0,notifications:0},'Fixture rows survived rollback');
const report={createdAt:new Date().toISOString(),productionUnchanged:true,rollbackVerified:true,productionWritePrivilege,actualGovernmentRequests:0,simulatedTransportCalls:transportCalls.length,productionBefore:before,productionAfter:after,emptyAfter,sqlWorkerBodyMatchesProduction:true,matchingHelperBodies:helperBodies.length,results,executionPassed:results.every(r=>r.executionPassed)};
mkdirSync('reports/maintenance',{recursive:true});writeFileSync('reports/maintenance/behavior-audit.json',JSON.stringify(report,null,2));
const summary='## Maintenance behavior audit — isolated rollback transaction\n\n| Case | Execution assertion | Observed functionality |\n| --- | --- | --- |\n'+results.map(r=>'| '+r.name+' | '+r.executionPassed+' | '+(r.functionality||r.error?.split('\n')[0])+' |').join('\n')+'\n\nProduction unchanged: '+report.productionUnchanged+'. Rollback verified: '+report.rollbackVerified+'. Real government HTTP requests: 0. A passed assertion is not a claim that a missing feature is implemented. Controlled fixture flags are enabled only in the isolated audit schema.\n';
writeFileSync('reports/maintenance/behavior-audit-summary.md',summary);if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary+'\n<details><summary>Original fixtures, detected changes, database observations, and rollback evidence</summary>\n\n```json\n'+JSON.stringify(report,null,2)+'\n```\n</details>\n');
console.log(JSON.stringify({executionPassed:report.executionPassed,productionUnchanged:true,rollbackVerified:true,cases:results.map(r=>({name:r.name,passed:r.executionPassed,functionality:r.functionality,error:r.error?.split('\n')[0]}))}));
client.release();await db.close();if(!report.executionPassed)process.exitCode=1;
