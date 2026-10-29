/** Resolve explicitly linked resources; canonical host redirects are not access bypasses. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {loadPostgresEnvironment,PostgresDatabase} from '../server/postgres/connection';import {Budget,hash} from '../server/maintenance/policy';import {ResearchReader,linkedArcGISServices} from '../server/maintenance/research-reader';import {officialResources,developmentLayers,mappingProposal} from '../server/maintenance/source-discovery';
loadPostgresEnvironment();const db=new PostgresDatabase(),budget=new Budget(900,100,10000);budget.maxBytes=40_000_000;
const input=JSON.parse(readFileSync('config/maintenance/nc-adapter-survey.json','utf8')).results,results:any[]=[];
mkdirSync('../../work/nc-adapters/cache',{recursive:true});
const reader=new ResearchReader(budget,(url,response)=>writeFileSync('../../work/nc-adapters/cache/'+hash(url)+'.json',JSON.stringify({url,checkedAt:new Date().toISOString(),hash:hash(response.body),body:response.body})));
const save=()=>writeFileSync('config/maintenance/nc-adapter-followup.json',JSON.stringify({checkedAt:new Date().toISOString(),dryRun:true,reserved:100,requests:budget.requests,results},null,2)+'\n');
async function inspect(row:any){const result:any={name:row.name,type:row.type,url:row.url,resources:[],feeds:[],errors:[]};try{
 let resources=officialResources(row.url,(await reader.get(row.url)).body);result.resources=resources;
 const services:string[]=[];
 for(const resource of resources.filter(r=>r.kind==='arcgis'||/experience\.arcgis\.com/.test(r.url)).slice(0,1)){
  const id=resource.url.match(/(?:experience\/|[?&](?:id|webmap|appid)=)([a-f0-9]{32})/i)?.[1];
  if(id){const data=JSON.parse((await reader.get('https://www.arcgis.com/sharing/rest/content/items/'+id+'/data?f=json')).body);if(data.error)throw Error('Linked ArcGIS configuration is not public');const linked=linkedArcGISServices(data);services.push(...linked.urls);
   for(const itemId of linked.itemIds.slice(0,1)){const webmap=JSON.parse((await reader.get('https://www.arcgis.com/sharing/rest/content/items/'+itemId+'/data?f=json')).body);services.push(...linkedArcGISServices(webmap).urls);}
  }
 }
 // Follow one actual agenda index when the initial page has no document links.
 if(!resources.some(r=>r.kind==='document')){const link=resources.find(r=>r.kind==='agenda'&&new URL(r.url).origin===new URL(row.url).origin&&!/member|schedule|calendar|archive|video|application|ordinance/i.test(r.title+' '+r.url));if(link)result.resources=officialResources(link.url,(await reader.get(link.url)).body);}
 for(const url of [...new Set(services)].slice(0,2)){
  const metadata=JSON.parse((await reader.get(url+'?f=json')).body);if(metadata.error)throw Error('Linked service metadata is unavailable');
  const layers=metadata.fields?[{url,metadata}]:await Promise.all(developmentLayers(metadata).slice(0,2).map(async(v:any)=>({url:url+'/'+v.id,metadata:JSON.parse((await reader.get(url+'/'+v.id+'?f=json')).body)})));
  for(const layer of layers){if(!developmentLayers({layers:[{id:layer.metadata.id,name:layer.metadata.name}]}).length){result.errors.push('Excluded reference/base layer: '+layer.metadata.name);continue;}result.feeds.push({url:layer.url,name:layer.metadata.name,geometryType:layer.metadata.geometryType,config:mappingProposal(layer.metadata),parent:row.url});}
 }
 result.status=result.feeds.length?'schema_candidate_requires_sample':result.resources.some((r:any)=>r.kind==='document')?'document_links_verified':'adapter_still_required';
 }catch(e:any){result.status='blocked_or_unavailable';result.errors.push(e.message);}results.push(result);save();console.log(JSON.stringify({area:result.name,status:result.status,feeds:result.feeds.length,documents:result.resources.filter((r:any)=>r.kind==='document').length,errors:result.errors}));}
try{
 const reserved=await db.query("UPDATE buildwatch.maintenance_monthly SET requests_reserved=requests_reserved+100 WHERE month=date_trunc('month',now())::date AND requests_reserved+100<=(SELECT monthly_requests FROM buildwatch.maintenance_control WHERE id=1) AND NOT(SELECT schedule_enabled OR writes_enabled FROM buildwatch.maintenance_control WHERE id=1) RETURNING month");if(!reserved.rowCount)throw Error('Research budget or dry-run gate prevents follow-up');
 // Concentrate on resolvable apps, same-host redirects, and pages needing an index.
 const selected=input.filter((r:any)=>r.status==='blocked_or_unavailable'||r.resources.some((v:any)=>/experience\.arcgis\.com/.test(v.url))||r.status==='document_adapter_candidate'&&!r.resources.some((v:any)=>v.kind==='document'));
 for(let i=0;i<selected.length;i+=4){for(const r of await Promise.allSettled(selected.slice(i,i+4).map(inspect)))if(r.status==='rejected')throw r.reason;}
}finally{await db.close();}
