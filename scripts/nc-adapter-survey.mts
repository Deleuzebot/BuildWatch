/** Bounded manual dry-run survey. Saves evidence, never publishes projects. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {loadPostgresEnvironment,PostgresDatabase} from '../server/postgres/connection';
import {SourceHTTP} from '../server/maintenance/http';import {Budget,hash} from '../server/maintenance/policy';import {robotsAllows,robotsUnavailableAllows} from '../server/maintenance/worker';
import {officialResources,developmentLayers,mappingProposal} from '../server/maintenance/source-discovery';
loadPostgresEnvironment();const db=new PostgresDatabase(),budget=new Budget(1800,300,10000);budget.maxBytes=80_000_000;
const entries=JSON.parse(readFileSync('config/maintenance/nc-coverage-status.json','utf8')).entries.filter((e:any)=>e.sourceKind!=='tested_feed_partial_scope');
mkdirSync('../../work/nc-adapters/cache',{recursive:true});const results:any[]=[],policies=new Map<string,Promise<string>>(),responses=new Map<string,Promise<string>>();
async function get(url:string,depth=0):Promise<string>{
 if(depth>2)throw Error('Redirect limit reached');const u=new URL(url),origin=u.origin;let redirect='';
 const transport:typeof fetch=async(input,options)=>{const r=await fetch(input,options);if(r.status>=300&&r.status<400)redirect=r.headers.get('location')||'';return r;};
 const http=new SourceHTTP(budget,origin,transport);
 if(!policies.has(origin))policies.set(origin,(async()=>{try{return(await http.get(origin+'/robots.txt')).body;}catch(e:any){if(robotsUnavailableAllows({authority:'official',adapter:/\/(FeatureServer|MapServer)\//.test(url)?'arcgis':'document',url} as any,e.message))return'';throw e;}})());
 const policy=await policies.get(origin)!;http.accessPolicy=x=>robotsAllows(policy,x.pathname+x.search);http.minimumInterval=Math.max(1,...[...policy.matchAll(/^crawl-delay:\s*(\d+(?:\.\d+)?)/gim)].map(v=>Number(v[1])))*1000;if(http.minimumInterval>60000)throw Error('Crawl delay requires a later run');
 try{const r=await http.get(url);writeFileSync('../../work/nc-adapters/cache/'+hash(url)+'.json',JSON.stringify({url,checkedAt:new Date().toISOString(),hash:hash(r.body),body:r.body}));return r.body;}catch(e:any){
  if(redirect&&/HTTP 30[1278]$/.test(e.message)){const target=new URL(redirect,url);if(target.protocol==='https:'&&target.hostname.replace(/^www\./,'')===u.hostname.replace(/^www\./,'')&&!target.username&&!target.password)return get(target.href,depth+1);}
  throw e;
 }
}
const cached=(url:string)=>{if(!responses.has(url))responses.set(url,get(url));return responses.get(url)!;};
const save=()=>writeFileSync('config/maintenance/nc-adapter-survey.json',JSON.stringify({checkedAt:new Date().toISOString(),dryRun:true,requestReservation:300,requests:budget.requests,bytes:budget.bytes,results},null,2)+'\n');
async function inspect(entry:any){const row:any={type:entry.type,name:entry.name,url:entry.officialSource,status:'not_tested',resources:[],feeds:[],errors:[]};
 try{
  const body=await cached(row.url);row.checkedAt=new Date().toISOString();row.documentHash=hash(body);
  if(/\/(FeatureServer|MapServer)(?:\/\d+)?(?:\?|$)/.test(row.url))row.resources=[{url:row.url,kind:'arcgis',parent:row.url,title:'Registered official service'}];else row.resources=officialResources(row.url,body);
  for(const resource of row.resources.filter((r:any)=>r.kind==='arcgis').slice(0,2)){
   try{
    let url=resource.url;
    // ArcGIS app/webmap IDs are pointers, not layers. Keep them for explicit review.
    if(!/\/(FeatureServer|MapServer)(?:\/\d+)?(?:\?|$)/.test(url)){row.errors.push('Embedded ArcGIS application needs its service configuration resolved: '+url);continue;}
    url=url.replace(/\?.*$/,'');const metadata=JSON.parse(await cached(url+'?f=json'));if(metadata.error)throw Error('Official ArcGIS service error');
    const layers=Array.isArray(metadata.fields)?[{url,metadata}]:await Promise.all(developmentLayers(metadata).slice(0,2).map(async(v:any)=>({url:url+'/'+v.id,metadata:JSON.parse(await cached(url+'/'+v.id+'?f=json'))})));
    for(const layer of layers){const config=mappingProposal(layer.metadata);row.feeds.push({url:layer.url,parent:resource.parent,name:layer.metadata.name,geometryType:layer.metadata.geometryType,config});}
    if(!layers.length)row.errors.push('No qualifying development layer identified in service metadata');
   }catch(e:any){row.errors.push(e.message);}
  }
  row.status=row.feeds.some((f:any)=>f.config.readiness==='schema_mapping_candidate')?'schema_candidate_requires_sample':row.resources.some((r:any)=>r.kind==='document'||r.kind==='agenda')?'document_adapter_candidate':row.resources.some((r:any)=>r.kind==='portal'||r.kind==='arcgis')?'portal_adapter_required':'no_project_resources_found';
 }catch(e:any){row.status='blocked_or_unavailable';row.errors.push(e.message);}
 results.push(row);save();console.log(JSON.stringify({area:row.name,type:row.type,status:row.status,resources:row.resources.length,feeds:row.feeds.length,errors:row.errors}));
}
try{
 const reserved=await db.query("UPDATE buildwatch.maintenance_monthly SET requests_reserved=requests_reserved+300 WHERE month=date_trunc('month',now())::date AND requests_reserved+300<=(SELECT monthly_requests FROM buildwatch.maintenance_control WHERE id=1) AND NOT(SELECT schedule_enabled OR writes_enabled FROM buildwatch.maintenance_control WHERE id=1) RETURNING month");if(!reserved.rowCount)throw Error('Budget or safety gates prevent survey');
 // Four distinct jurisdictions at a time; per-origin spacing is also enforced.
 for(let i=0;i<entries.length;i+=4){const batch=await Promise.allSettled(entries.slice(i,i+4).map(inspect));for(const r of batch)if(r.status==='rejected')throw r.reason;}
}finally{await db.close();}
