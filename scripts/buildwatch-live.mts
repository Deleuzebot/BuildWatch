/** Manual review-only bridge. One server-recorded approval, one durable HTTP/search ledger. */
import assert from 'node:assert/strict';import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';import {resolve} from 'node:path';
import {LiveValidationSession} from '../server/maintenance/live-session';import {PostgresDatabase,loadPostgresEnvironment} from '../server/postgres/connection';
const [command,...args]=process.argv.slice(2),arg=(key:string)=>{const i=args.indexOf('--'+key);return i<0?undefined:args[i+1];};
if(!['init','fetch','reserve-search','record-search','receipt','guard'].includes(command)||process.env.GITHUB_EVENT_NAME==='schedule')throw Error('Use a manually authorized research command; no publication or schedule entry point exists');
const id=arg('run');if(!id||!/^manual-nc-live-[a-zA-Z0-9-]+$/.test(id))throw Error('Use a stable manual NC run identifier');
const dir=resolve('../../work/buildwatch-live',id);mkdirSync(dir,{recursive:true,mode:0o700});loadPostgresEnvironment();const db=new PostgresDatabase();
let live:LiveValidationSession|undefined;
const guard=async()=>(await db.one('SELECT public.buildwatch_audit_guard() v')).v;
try{
 const before=await guard();assert.deepEqual(before.gates,{writes:false,approved:false,schedule:false});
 if(command==='init'){
  const file=arg('approval');if(!file)throw Error('Provide the private receipt of explicit user approval');const approved=JSON.parse(readFileSync(file,'utf8'));
  if(approved.id!==id||approved.state!=='NC'||!Number.isSafeInteger(approved.maximumRequests)||approved.maximumRequests<1||approved.maximumRequests>500||!Number.isSafeInteger(approved.maximumSearches)||approved.maximumSearches<0||approved.maximumSearches>(approved.maximumRequests>50?20:4)||approved.publication!==false||approved.archival!==false||approved.scheduling!==false||approved.paidServices!==false||typeof approved.userInstruction!=='string')throw Error('Approval must be the explicitly bounded manual NC pilot');
  const reservation=await db.transaction(async()=>{
   const old=await db.one('SELECT summary FROM buildwatch.research_batches WHERE id=$1 FOR UPDATE',[id]);if(old){const value=JSON.parse(old.summary);assert.deepEqual(value.approval,approved);return value;}
   const c=await db.one('SELECT * FROM buildwatch.maintenance_control WHERE id=1 FOR UPDATE');if(c.writes_enabled||c.schedule_enabled||c.pilot_approved)throw Error('Production gates changed');
   const m=await db.one("SELECT * FROM buildwatch.maintenance_monthly WHERE month=date_trunc('month',current_date)::date FOR UPDATE");if(!m)throw Error('Current existing monthly reservation ledger unavailable');
   const covered=Math.min(approved.maximumRequests,Math.max(0,c.monthly_requests-m.requests_reserved));
   await db.query('UPDATE buildwatch.maintenance_monthly SET requests_reserved=requests_reserved+$1 WHERE month=$2',[covered,m.month]);
   const value={mode:'manual-codex-live',approval:approved,reference:'research_batches/'+id,month:m.month,maximumRequests:approved.maximumRequests,maximumSearches:approved.maximumSearches,existingAllowanceReserved:covered,additionalExplicitlyAuthorized:approved.maximumRequests-covered,recurringMonthlyLimitUnchanged:c.monthly_requests,baseline:before};
   await db.query('INSERT INTO buildwatch.research_batches VALUES($1,$2,$3)',[id,new Date().toISOString(),JSON.stringify(value)]);return value;
  });writeFileSync(dir+'/authorization.json',JSON.stringify(reservation,null,2),{mode:0o600});console.log(JSON.stringify({run:id,reservation:reservation.reference,maxRequests:reservation.maximumRequests,maxSearches:reservation.maximumSearches,existingAllowanceReserved:reservation.existingAllowanceReserved,additionalExplicitlyAuthorized:reservation.additionalExplicitlyAuthorized,publication:false,scheduling:false}));
 }else{
  const saved=await db.one('SELECT summary FROM buildwatch.research_batches WHERE id=$1',[id]);if(!saved)throw Error('Run has no server-recorded explicit approval');const authorization=JSON.parse(saved.summary);
  if(!Number.isSafeInteger(authorization.maximumRequests)||authorization.maximumRequests<1||authorization.maximumRequests>500||!Number.isSafeInteger(authorization.maximumSearches)||authorization.maximumSearches<0||authorization.maximumSearches>(authorization.maximumRequests>50?20:4)||authorization.approval.publication!==false||authorization.approval.scheduling!==false)throw Error('Invalid manual reservation');
  live=new LiveValidationSession(dir,fetch,authorization.maximumRequests,{reference:authorization.reference,maximumRequests:authorization.maximumRequests,maximumSearches:authorization.maximumSearches});
  if(command==='fetch'){
   const file=arg('plan');if(!file)throw Error('Supply the explicit bounded source URL plan');const plan=JSON.parse(readFileSync(file,'utf8'));if(!Array.isArray(plan)||plan.length>20||plan.some(x=>typeof x.url!=='string'||typeof x.key!=='string'||!/^[a-z0-9-]{1,80}$/.test(x.key)))throw Error('Bounded URL plan required');
   const results=[];for(const p of plan){if(live.state.requests.length>=authorization.maximumRequests){results.push({key:p.key,status:'deferred_budget'});break;}try{const r=await live.get(p.url),{rawBody,...compact}=r;writeFileSync(dir+'/'+p.key+'.json',JSON.stringify({url:p.url,...compact},null,2));results.push({key:p.key,status:'captured',bytes:Buffer.byteLength(r.body),replay:r.sessionReplay});}catch(e:any){results.push({key:p.key,status:'unresolved',error:e.message});}}
   writeFileSync(dir+'/fetch-results-'+Date.now()+'.json',JSON.stringify(results,null,2));console.log(JSON.stringify({requests:live.state.requests.length,remaining:authorization.maximumRequests-live.state.requests.length,results}));
  }
  if(command==='reserve-search')console.log(JSON.stringify(live.reserveSearch(arg('query')||'')));
  if(command==='record-search')console.log(JSON.stringify(live.recordSearch(Number(arg('id')),arg('file')||'')));
  if(command==='receipt'){
   assert.equal(live.state.reservedExternalRequests||0,0,'Import external worker receipts before finalizing research accounting');
   if(args.includes('--finish')&&!live.state.closed){live.state.closed=true;live.state.closedAt=new Date().toISOString();live.save();}
   const receipt={runId:id,state:'NC',dryRun:true,productionUnchanged:true,publication:false,archival:false,scheduling:false,reservation:{reference:authorization.reference,maxRequests:authorization.maximumRequests,maxQueries:authorization.maximumSearches},stats:{requests:live.state.requests.length,searchQueries:live.state.searches.length,downloadBytes:live.state.bytes||0,seconds:Math.round(((live.state.closedAt?Date.parse(live.state.closedAt):Date.now())-Date.parse(live.state.createdAt))/1000)},permissions:live.state.requests.filter((x:any)=>x.url.endsWith('/robots.txt')),limitations:['Search-provider upstream HTTP is not visible; search queries have their own explicitly authorized ceiling. All source-page downloads, robots, retries and redirects use this HTTP ledger.']};
   assert.deepEqual(await guard(),authorization.baseline,'Production changed during research; withhold publication and inspect');writeFileSync(dir+'/receipt.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
  }
  if(command==='guard'){assert.deepEqual(await guard(),authorization.baseline);console.log(JSON.stringify({productionUnchanged:true,gates:before.gates,requests:live.state.requests.length,searches:live.state.searches.length}));}
 }
}finally{live?.release();await db.close();}
