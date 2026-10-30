/** Prepare only: private proposals, real database previews, isolated-schema rehearsal and rollback. No production commit entry point. */
import assert from 'node:assert/strict';import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {resolve} from 'node:path';
import {PostgresDatabase,loadPostgresEnvironment} from '../server/postgres/connection';import {deriveProject} from '../server/supabase/derive';import {hash} from '../server/maintenance/policy';import {validateProject} from '../src/lib/validate';
const inputDir=resolve('../../work/buildwatch-live/manual-nc-live-20261030-a'),outDir=resolve('../../work/buildwatch-three-update-approval');mkdirSync(outDir,{recursive:true,mode:0o700});
const read=(name:string)=>JSON.parse(readFileSync(inputDir+'/'+name+'.json','utf8')),draft=read('proposals'),ledger=read('ledger');
assert.equal(ledger.closed,true);assert.equal(draft.productionWrites,0);assert.equal(draft.proposals.length,3);
const ids=['nc-ch-611-mlk','nc-local-e92b78f35246dd','nc-local-d469d11d6d3e1d'];assert.deepEqual(draft.proposals.map((p:any)=>p.projectId).sort(),[...ids].sort());
const apex=read('apex-records'),features=JSON.parse(apex.body).features,meetingPage=read('chapel-611-meeting'),projectPage=read('chapel-611-project');
for(const response of [apex,meetingPage,projectPage]){const saved=ledger.responses[response.url];assert.ok(saved&&saved.sha256===hash(response.body),'Captured evidence hash must match its closed research ledger');}
const plain=(s:string)=>s.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
assert.match(plain(meetingPage.body),/November 02, 2026/);assert.match(plain(meetingPage.body),/05:15 PM - 06:15 PM/);assert.match(plain(projectPage.body),/CZD-26-6/);assert.match(plain(projectPage.body),/Virtual/);
const meeting={id:'nc-ch-611-mlk-public-information-2026-11-02',title:'611 MLK Multifamily — Public Information Meeting (5:15–6:15 p.m. Eastern)',startsAt:'2026-11-02T22:15:00.000Z',venue:'Virtual — use the Town meeting page for registration',agenda:meetingPage.url};
loadPostgresEnvironment();const db=new PostgresDatabase(),batchId='manual-nc-three-updates-20261030',prepared:any[]=[];
try{
 const baseline=(await db.one('SELECT public.buildwatch_audit_guard() v')).v;assert.deepEqual(baseline.gates,{writes:false,approved:false,schedule:false});
 await db.transaction(async()=>{
  await db.query('SELECT pg_advisory_xact_lock(72644322)');
  await db.query('INSERT INTO buildwatch.research_batches VALUES($1,now()::text,$2) ON CONFLICT DO NOTHING',[batchId,JSON.stringify({mode:'manual-three-specific-updates',publication:false,scheduling:false,approvalRequired:true,liveResearchRequests:0})]);
  for(const pid of ids){
   const project=(await db.one('SELECT buildwatch.bw_project($1) p',[pid])).p;const original=draft.proposals.find((p:any)=>p.projectId===pid);assert.ok(project&&!project.archived);assert.equal(project.revision,original.revision,'Stale draft: refresh before preparing');
   const context=(await db.one('SELECT buildwatch.bw_milestone_context($1) v',[pid])).v;
   let data:any;
   if(pid==='nc-ch-611-mlk'){
    assert.equal(project.name,'611 MLK Multifamily');assert.equal(project.status,'In review');assert.ok(project.sources.some((s:any)=>s.url===projectPage.url));
    assert.ok(Math.abs(project.latitude-35.9192368)<0.000001&&Math.abs(project.longitude+79.0566993)<0.000001);
    assert.ok(!project.meetings.some((m:any)=>m.id===meeting.id||Date.parse(m.startsAt)===Date.parse(meeting.startsAt)||m.agenda===meeting.agenda),'Equivalent meeting already exists');
    data={kind:'meeting',projectId:pid,projectName:project.name,jurisdiction:'Chapel Hill',before:{revision:project.revision,status:project.status},meeting,evidence:{externalId:'611-MLK-Multifamily-Public-Information-Meeting',url:meetingPage.url,checkedAt:meetingPage.retrievedAt,sourceHash:hash(meetingPage.body),eventDate:'2026-11-02',startsAt:meeting.startsAt,endsAt:'2026-11-02T23:15:00.000Z',timeZone:'America/New_York',officialProjectURL:projectPage.url,officialProjectHash:hash(projectPage.body),quote:'Meeting Date November 02, 2026; Time 05:15 PM - 06:15 PM; project page lists Virtual.'},reason:'Add only the verified virtual public information meeting. Full time range is included in the meeting title because existing clients store a start time only. No project status, description, location or approval-policy change.'};
   }else{
    const fid=pid==='nc-local-e92b78f35246dd'?628:636,feature=features.find((f:any)=>f.attributes.FID===fid),a=feature?.attributes;assert.ok(a);assert.equal(a.Name,project.name);assert.equal(a.Action_Taken,'TRC Approved');
    const date=new Date(a.Action_Date).toISOString().slice(0,10),url=original.source.url;assert.equal(date,original.source.eventDate.slice(0,10));
    const sourceId=JSON.parse(readFileSync('config/maintenance/nc-five-jurisdiction-plan.json','utf8')).find((s:any)=>s.name==='Apex').source.id;
    assert.ok(project.sources.some((s:any)=>new URL(s.url).pathname.endsWith('/Development/FeatureServer/0/query')&&(new URL(s.url).searchParams.get('where')==='FID='+fid||new URL(s.url).searchParams.get('objectIds')===String(fid))),'Exact existing source reference required');
    assert.ok(!context.activities.some((e:any)=>e.event_date===date&&/approval/i.test(e.type)),'Approval on this date already recorded');
    data={kind:'milestone',projectId:pid,projectName:project.name,jurisdiction:'Apex',before:{revision:project.revision,status:project.status},milestone:{type:'Application Approval',scope:'application_only',date,url},evidence:{sourceId,externalId:String(fid),url,checkedAt:apex.retrievedAt,eventDate:date,responseHash:hash(apex.body),responseURL:apex.url,attributes:a},reason:'Backfill this historical TRC application-approval milestone only. Preserve the current Under construction status, all project fields, previous events and approval policy.'};
   }
   const proposalId=hash([batchId,pid,project.revision,data]);data.id=proposalId;
   const possible=await db.rows("SELECT id,data FROM buildwatch.research_proposals WHERE project_id=$1 AND status IN('pending','deferred') AND kind=$2",[pid,data.kind]);
   const duplicate=possible.find((r:any)=>{const d=JSON.parse(r.data);return data.kind==='meeting'&&(d.meeting?.id===meeting.id||d.meeting?.startsAt===meeting.startsAt)||data.kind==='milestone'&&d.milestone?.date===data.milestone.date;});
   if(duplicate)assert.equal(duplicate.id,proposalId,'Equivalent private proposal already exists; review it instead of adding another');
   await db.query('INSERT INTO buildwatch.research_proposals(id,batch_id,kind,project_id,data,updated) VALUES($1,$2,$3,$4,$5,buildwatch.bw_now()) ON CONFLICT DO NOTHING',[proposalId,batchId,data.kind,pid,JSON.stringify(data)]);
   await db.query('SAVEPOINT preview_only');const preview=(await db.one('SELECT buildwatch.bw_research_preview($1,$2) p',[proposalId,'preparation-only-not-publication'])).p;await db.query('ROLLBACK TO SAVEPOINT preview_only');await db.query('RELEASE SAVEPOINT preview_only');delete preview.token;
   assert.equal(validateProject(preview.after),null);for(const field of ['status','description','latitude','longitude','address','sourceStatus'])assert.deepEqual(preview.after[field],project[field]);
   assert.deepEqual((await db.one('SELECT buildwatch.bw_milestone_context($1) v',[pid])).v,context);
   const followers=(await db.one("SELECT count(DISTINCT f.user_id) n FROM buildwatch.follows f JOIN buildwatch.users u ON u.id=f.user_id WHERE f.project_id=ANY(buildwatch.bw_components($1)) AND u.disabled=0 AND u.preferences::jsonb->>'enabled'='true' AND u.preferences::jsonb->>'meetings'='true' AND buildwatch.bw_active(u.id,$1)",[pid])).n;
   const updateFollowers=(await db.one("SELECT count(DISTINCT f.user_id) n FROM buildwatch.follows f JOIN buildwatch.users u ON u.id=f.user_id WHERE f.project_id=ANY(buildwatch.bw_components($1)) AND u.disabled=0 AND u.preferences::jsonb->>'enabled'='true' AND u.preferences::jsonb->>'updates'='true' AND buildwatch.bw_active(u.id,$1)",[pid])).n;
   prepared.push({proposalId,projectId:pid,name:project.name,kind:data.kind,before:project,context,proposal:data,preview,expectedMeetingNotifications:data.kind==='meeting'?followers:0,expectedUpdateNotifications:data.kind==='meeting'?updateFollowers:0});
  }
  assert.deepEqual((await db.one('SELECT public.buildwatch_audit_guard() v')).v,baseline);
 });
 // Only isolated audit projects are written, with a mandatory outer rollback.
 const c=await db.pool.connect();let rehearsal:any;
 try{await c.query('BEGIN');await c.query("SET LOCAL buildwatch.audit_transaction='rollback-only'; SET LOCAL statement_timeout='60s'; SET LOCAL idle_in_transaction_session_timeout='300s'");
  for(const name of ['bw_research_api(jsonb,text,text,jsonb,jsonb)','bw_publish(jsonb,text,jsonb)','bw_research_preview(text,text)']){const definitions=(await c.query("SELECT pg_get_functiondef(to_regprocedure($1)) prod,pg_get_functiondef(to_regprocedure($2)) audit",['buildwatch.'+name,'buildwatch_audit.'+name])).rows[0];assert.equal(definitions.audit.replace(/(SET search_path TO 'buildwatch_audit', 'pg_catalog'), 'pg_temp'/,'$1'),definitions.prod.replace(/\bbuildwatch\b/g,'buildwatch_audit'),'Audit function differs from production beyond its explicit trailing pg_temp hardening');}
  await c.query('INSERT INTO buildwatch_audit.map_meta VALUES(1,1) ON CONFLICT DO NOTHING');await c.query('INSERT INTO buildwatch_audit.maintenance_control(id) VALUES(1) ON CONFLICT DO NOTHING');await c.query("INSERT INTO buildwatch_audit.maintenance_states(state,weekday,active) VALUES('NC',5,false) ON CONFLICT DO NOTHING");
  const source=(await db.one('SELECT * FROM buildwatch.maintenance_sources WHERE id=$1',[prepared.find(p=>p.kind==='milestone').proposal.evidence.sourceId]));
  await c.query('INSERT INTO buildwatch_audit.maintenance_sources(id,state,jurisdiction,url,adapter,authority,config) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING',[source.id,source.state,source.jurisdiction,source.url,source.adapter,source.authority,JSON.stringify(source.config)]);
  await c.query("INSERT INTO buildwatch_audit.research_batches VALUES($1,now()::text,'{}') ON CONFLICT DO NOTHING",[batchId]);
  const checks=[];
  for(const item of prepared){
   const pid='audit-three-'+item.projectId,seed={...item.before,id:pid,revision:0},policy=item.context.policy;
   const p=(await c.query('SELECT buildwatch_audit.fixture_seed($1::jsonb,$2::jsonb,$3::jsonb,true) p',[JSON.stringify(seed),JSON.stringify(await deriveProject(seed)),policy?JSON.stringify(policy):null])).rows[0].p;
   const data={...item.proposal,projectId:pid,before:{revision:p.revision,status:p.status}};
   await c.query('INSERT INTO buildwatch_audit.research_proposals(id,batch_id,kind,project_id,data,updated) VALUES($1,$2,$3,$4,$5,1)',[item.proposalId,batchId,item.kind,pid,JSON.stringify(data)]);
   const before=(await c.query('SELECT buildwatch_audit.bw_milestone_context($1) v',[pid])).rows[0].v;
   const preview=(await c.query('SELECT buildwatch_audit.bw_research_preview($1,$2) v',[item.proposalId,'audit-admin'])).rows[0].v;
   const info=(await c.query('SELECT buildwatch_audit.bw_research_info($1,$2) v',[preview.token,'audit-admin'])).rows[0].v;
   const target=item.kind==='milestone'?info.current:info.result,derived=await deriveProject(target,info.policy);
   if(item.kind==='milestone')derived.recordEvents=[info.milestone];
   await c.query("SELECT buildwatch_audit.bw_research_api('{\"id\":\"audit-admin\"}'::jsonb,'POST','/api/admin/research/commit',$1::jsonb,'{}'::jsonb)",[JSON.stringify({token:preview.token,confirmation:item.kind==='milestone'?'append-application-milestone':undefined,_project:target,_derived:derived})]);
   const after=(await c.query('SELECT buildwatch_audit.bw_project($1) p,buildwatch_audit.bw_milestone_context($1) ctx',[pid])).rows[0];
   for(const field of ['status','description','latitude','longitude','address','sourceStatus'])assert.deepEqual(after.p[field],p[field]);
   assert.deepEqual(after.ctx.policy,before.policy);assert.equal(after.ctx.historyCount,before.historyCount+1);
   for(const old of before.activities)assert.ok(after.ctx.activities.some((a:any)=>a.event_key===old.event_key&&a.event_date===old.event_date));
   const notices=(await c.query('SELECT kind,count(*)::int n FROM buildwatch_audit.notifications WHERE project_id=$1 GROUP BY kind',[pid])).rows;
   if(item.kind==='milestone'){assert.deepEqual(after.p,{...p,revision:p.revision+1});assert.equal(notices.length,0);assert.equal(after.ctx.activities.filter((a:any)=>a.event_key===info.milestone.key).length,1);}else{assert.equal(after.p.meetings.filter((m:any)=>m.id===meeting.id).length,1);assert.match(after.p.meetings.at(-1).title,/5:15–6:15/);}
   await c.query('SAVEPOINT replay_rejected');let rejected=false;try{await c.query('SELECT buildwatch_audit.bw_research_info($1,$2)',[preview.token,'audit-admin']);}catch{rejected=true;}await c.query('ROLLBACK TO SAVEPOINT replay_rejected');await c.query('RELEASE SAVEPOINT replay_rejected');assert.equal(rejected,true);
   checks.push({projectId:item.projectId,preservedFields:true,policyUnchanged:true,historyIncrement:1,originalEventsPreserved:true,replayRejected:true,isolatedNotifications:notices});
  }rehearsal={isolatedSchema:'buildwatch_audit',checks,rolledBack:true};
 }finally{await c.query('ROLLBACK');c.release();}
 const final=(await db.one('SELECT public.buildwatch_audit_guard() v')).v;assert.deepEqual(final,baseline);
 const result={batchId,preparedAt:new Date().toISOString(),approvalRequired:true,productionWrites:0,newGovernmentRequests:0,newSearches:0,publication:false,archival:false,scheduling:false,baseline,after:final,items:prepared,rehearsal,limitations:['Private proposals are prepared, but no production publication has occurred.','Meeting end time is preserved in official evidence and its public title; the existing client model has no structured endsAt field.','The existing meeting preview also appends its official source URL and updates reviewedAt; these are included in the exact preview.','The new source citation can trigger an update notification as well as a meeting notification for eligible followers. Actual eligible counts are recorded; delivery is not promised.','Transaction rollback was tested in the isolated audit schema. There is no dedicated one-click undo for manually published research milestones; post-commit correction requires a separately authorized guarded compensation, preserving history, and cannot recall delivered notifications.']};
 writeFileSync(outDir+'/PREVIEW.json',JSON.stringify(result,null,2),{mode:0o600});writeFileSync(outDir+'/APPROVAL.md',`# Three-update approval preview\n\nNo production changes applied. Government HTTP requests: 0. Publication, archival and schedules stay off.\n\n${prepared.map(p=>`## ${p.name}\n\nProposal: ${p.proposalId}\n\n${p.kind==='meeting'?'Append virtual public information meeting, November 2, 2026, 5:15–6:15 p.m. America/New_York (22:15–23:15 UTC). Full range is in the meeting title. Add the official event source citation and set reviewedAt to its captured retrieval date.':`Append historical Application Approval event dated ${p.proposal.milestone.date}; TRC approval applies to the application only.`}\n\nPreserve status **${p.before.status}**, description, address, coordinates, existing history and approval policy. Revision ${p.before.revision} → ${p.before.revision+1}; one history snapshot added. Expected meeting/update notification rows: ${p.expectedMeetingNotifications}/${p.expectedUpdateNotifications}.\n\nOfficial evidence: ${p.proposal.evidence.url}\n`).join('\n')}\nExact full before/after snapshots and isolated rollback checks are in PREVIEW.json. Private preview tokens were rolled back; fresh administrator/MFA previews are required at execution. This approval covers these three proposals only.\n\nPost-commit corrections preserve audit history; there is no manual-research one-click undo, and delivered notifications cannot be recalled.\n`,{mode:0o600});
 console.log(JSON.stringify({preview:outDir+'/PREVIEW.json',summary:prepared.map(p=>({name:p.name,proposalId:p.proposalId,kind:p.kind,revision:p.before.revision,expectedMeetingNotifications:p.expectedMeetingNotifications,expectedUpdateNotifications:p.expectedUpdateNotifications})),rehearsal,productionUnchanged:true}));
}finally{await db.close();}
