/** Read-only verification of exactly the authorized three-update batch. Never publishes. */
import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';import {resolve} from 'node:path';
import {PostgresDatabase,loadPostgresEnvironment} from '../server/postgres/connection';import {hash} from '../server/maintenance/policy';
const dir=resolve('../../work/buildwatch-three-update-approval'),plan=JSON.parse(readFileSync(dir+'/PREVIEW.json','utf8')),mode=process.argv[2];
assert.ok(['before','after'].includes(mode));assert.equal(plan.items.length,3);
const ids=plan.items.map((p:any)=>p.projectId),proposals=plan.items.map((p:any)=>p.proposalId);
loadPostgresEnvironment();const db=new PostgresDatabase();
try{const snapshot=await db.transaction(async()=>{
 const guard=(await db.one('SELECT public.buildwatch_audit_guard() v')).v;assert.deepEqual(guard.gates,{writes:false,approved:false,schedule:false});
 const unaffected:Record<string,string>={};
 for(const [table,column,excluded] of [['projects','id',ids],['project_overrides','project_id',ids],['history','project_id',ids],['project_activity','project_id',ids],['notifications','project_id',ids],['research_proposals','id',proposals],['research_audit','proposal_id',proposals],['approval_policy','project_id',[]],['archived_projects','project_id',[]],['follows','project_id',[]]] as [string,string,string[]][]){
  const row=await db.one(`SELECT md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text),'')) digest,count(*) n FROM buildwatch.${table} t WHERE NOT (${column}=ANY($1::text[]))`,[excluded]);unaffected[table]=row.digest+':'+row.n;
 }
 const items=[];for(const p of plan.items){const project=(await db.one('SELECT buildwatch.bw_project($1) p',[p.projectId])).p,context=(await db.one('SELECT buildwatch.bw_milestone_context($1) v',[p.projectId])).v,row=await db.one('SELECT id,status,revision,data FROM buildwatch.research_proposals WHERE id=$1',[p.proposalId]),audits=await db.rows('SELECT action,actor,created FROM buildwatch.research_audit WHERE proposal_id=$1 ORDER BY created',[p.proposalId]),notifications=await db.rows('SELECT id,kind,event_key FROM buildwatch.notifications WHERE project_id=$1 ORDER BY id',[p.projectId]);
  assert.equal(JSON.parse(row.data).id,p.proposalId);assert.deepEqual(JSON.parse(row.data),p.proposal);assert.deepEqual(context.policy,p.context.policy);
  if(mode==='before'){assert.deepEqual(project,p.before);assert.deepEqual(context,p.context);assert.ok(['pending','deferred'].includes(row.status));}
  else{assert.equal(row.status,'applied');assert.equal(project.revision,p.before.revision+1);assert.deepEqual(project,{...p.preview.after,revision:p.before.revision+1});assert.equal(context.historyCount,p.context.historyCount+1);
   for(const old of p.context.activities)assert.ok(context.activities.some((e:any)=>JSON.stringify(e)===JSON.stringify(old)));
   if(p.kind==='milestone'){assert.equal(context.activities.filter((e:any)=>e.event_key===p.preview.milestone.key).length,1);assert.equal(context.activities.filter((e:any)=>e.event_date===p.proposal.milestone.date&&/approval/i.test(e.type)).length,1);}
   else{assert.equal(project.meetings.filter((m:any)=>m.id===p.proposal.meeting.id||m.startsAt===p.proposal.meeting.startsAt).length,1);assert.match(project.meetings.find((m:any)=>m.id===p.proposal.meeting.id).title,/5:15–6:15 p.m. Eastern/);}
   assert.equal(audits.filter((a:any)=>a.action==='applied').length,1);
  }
  items.push({projectId:p.projectId,name:p.name,project,context,proposal:{id:row.id,status:row.status,revision:row.revision},audits,notifications});
 }
 return{checkedAt:new Date().toISOString(),mode,planHash:hash(plan.items),guard,unaffected,items};
},true);
 if(mode==='after'){const before=JSON.parse(readFileSync(dir+'/BEFORE.json','utf8'));assert.equal(snapshot.planHash,before.planHash);assert.deepEqual(snapshot.unaffected,before.unaffected,'Unexpected changes outside the three authorized projects');
  assert.equal(snapshot.guard.projects,before.guard.projects);assert.equal(snapshot.guard.history,before.guard.history+3);assert.equal(snapshot.guard.activity,before.guard.activity+3);
  for(const item of snapshot.items){const old=before.items.find((p:any)=>p.projectId===item.projectId);assert.deepEqual(item.notifications,old.notifications,'Unexpected notifications in this approved zero-recipient batch');}
 }
 const file=dir+'/'+mode.toUpperCase()+'.json';if(mode==='before'){try{const previous=JSON.parse(readFileSync(file,'utf8'));assert.equal(previous.planHash,snapshot.planHash);assert.deepEqual(previous.items,snapshot.items,'Do not replace the original pre-publication baseline');}catch(e:any){if(e.code!=='ENOENT')throw e;writeFileSync(file,JSON.stringify(snapshot,null,2),{mode:0o600});}}else writeFileSync(file,JSON.stringify(snapshot,null,2),{mode:0o600});
 console.log(JSON.stringify({mode,verified:true,items:snapshot.items.map(p=>({id:p.projectId,revision:p.project.revision,status:p.project.status,proposal:p.proposal.status,history:p.context.historyCount,activities:p.context.activities.length})),gates:snapshot.guard.gates,report:file}));
}finally{await db.close();}
