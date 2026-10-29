/** Explicitly manual live-source scout. Never calls a project mutation, expiry, or scheduling API. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {LiveValidationSession} from '../server/maintenance/live-session';
import {loadPostgresEnvironment,PostgresDatabase} from '../server/postgres/connection';
const directory='../../work/nc-live-source-pilot-20261029',session=new LiveValidationSession(directory),stage=process.argv.find(v=>v.startsWith('--stage='))?.slice(8)||'metadata';
// Approval receipt and the reserved global allowance are private, never shipped in the repository.
if(session.state.authorization?.maximumRequests!==20||session.state.authorization?.monthlyBudgetUnchanged!==true){session.release();throw Error('Explicit 20-request approval receipt and global budget reservation required; this command never raises or self-authorizes a budget.');}
const sources=[
 {key:'apex',city:'Apex',url:'https://services1.arcgis.com/nry3yyvaEfskMEXA/arcgis/rest/services/Development/FeatureServer/0'},
 {key:'chapel-hill',city:'Chapel Hill',url:'https://gisweb.townofchapelhill.org/arcgis/rest/services/MapServices/CurrentDevelopmentActivity/FeatureServer/0'},
 {key:'raleigh',city:'Raleigh',url:'https://services.arcgis.com/v400IkDOw1ad7Yad/ArcGIS/rest/services/Building_Permits/FeatureServer/0'},
];
loadPostgresEnvironment();const db=new PostgresDatabase();
const guard=()=>db.transaction(()=>db.one('SELECT public.buildwatch_audit_guard() baseline,(SELECT count(*) FROM buildwatch.active_map_index) visible,(SELECT count(*) FROM buildwatch.archived_projects) archives,(SELECT count(*) FROM buildwatch.maintenance_lifecycle) lifecycle'),true);
const before=await guard();if(Object.values(before.baseline.gates).some(Boolean))throw Error('All production gates must remain off');
if(!session.state.baseline){session.state.baseline=before;session.save();}
try{
 const results:any[]=[];
 if(stage==='metadata')for(const s of sources){try{const r=await session.get(s.url+'?f=json'),m=JSON.parse(r.body);if(m.error||!m.fields)throw Error('Official metadata unavailable: '+JSON.stringify(m.error));writeFileSync(directory+'/'+s.key+'-metadata.json',JSON.stringify({source:s,...r,metadata:m},null,2));results.push({source:s.key,status:r.status,fields:m.fields.map((f:any)=>({name:f.name,type:f.type,domain:f.domain})),objectIdField:m.objectIdField,capabilities:m.advancedQueryCapabilities,description:m.description});}catch(e:any){results.push({source:s.key,error:e.message});}}
 else if(stage==='query'){
  const plan=JSON.parse(readFileSync(directory+'/query-plan.json','utf8'));if(!Array.isArray(plan)||plan.length>8)throw Error('Bounded query plan required');
  for(const q of plan){const s=sources.find(x=>x.key===q.source);if(!s||q.url&&!q.url.startsWith(s.url+'/query?'))throw Error('Unregistered query');const u=new URL(s.url+'/query');u.search=new URLSearchParams(q.params).toString();
   try{const r=await session.get(u.href),data=JSON.parse(r.body);if(data.error||!Array.isArray(data.features)||data.features.length>20)throw Error('Invalid bounded source response: '+JSON.stringify(data.error));writeFileSync(directory+'/'+q.key+'-records.json',JSON.stringify({source:s,url:u.href,retrievedAt:r.retrievedAt,sessionReplay:r.sessionReplay,data},null,2));results.push({source:q.key,records:data.features.map((f:any)=>f.attributes),more:data.exceededTransferLimit});}catch(e:any){results.push({source:q.key,error:e.message});}
  }
 }else if(stage==='page'){
  const captured=JSON.parse(readFileSync(directory+'/chapel-active-records.json','utf8'));
  const row=captured.data.features.find((f:any)=>f.attributes.ProjectName.trim()==='Lightbridge Project');if(!row)throw Error('Selected official project page not present in live evidence');
  const url=row.attributes.ProjectWebPage;if(new URL(url).hostname!=='www.chapelhillnc.gov')throw Error('Only the live record’s official Town project page is permitted');
  try{const r=await session.get(url);writeFileSync(directory+'/chapel-lightbridge-page.json',JSON.stringify({url,...r},null,2));results.push({url,status:r.status,bytes:Buffer.byteLength(r.body)});}catch(e:any){results.push({url,error:e.message});}
 }else throw Error('Only explicit metadata, query or page stages are supported');
 const after=await guard();if(JSON.stringify(before.baseline)!==JSON.stringify(after.baseline)||before.archives!==after.archives||before.lifecycle!==after.lifecycle)throw Error('Production safety baseline changed');session.state.safetyAfter=after;session.save();
 writeFileSync(directory+'/'+stage+'-results.json',JSON.stringify({actualHTTPRequests:session.state.requests.length,remainingPilotRequests:20-session.state.requests.length,results,productionUnchanged:true},null,2));console.log(JSON.stringify({actualHTTPRequests:session.state.requests.length,remainingPilotRequests:20-session.state.requests.length,results,productionUnchanged:true}));
}finally{session.save();session.release();await db.close();}
