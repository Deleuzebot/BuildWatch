/** Compile observed official document indexes; unresolved portals stay disabled. */
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';import {loadPostgresEnvironment,PostgresDatabase} from '../server/postgres/connection';import {officialResources,developmentLayers} from '../server/maintenance/source-discovery';
loadPostgresEnvironment();const db=new PostgresDatabase();
const read=(name:string)=>JSON.parse(readFileSync('config/maintenance/'+name+'.json','utf8'));
try{
 const original=read('nc-adapter-survey'),followup=read('nc-adapter-followup'),coverage=read('nc-coverage-status').entries;
 const cached=readdirSync('../../work/nc-adapters/cache').map(name=>JSON.parse(readFileSync('../../work/nc-adapters/cache/'+name,'utf8')));
 const sources=await db.rows('SELECT * FROM buildwatch.maintenance_sources');const entries:any[]=[],plan:any[]=[];
 for(const row of original.results){
  const prior=coverage.find((c:any)=>c.name===row.name&&c.type===row.type),source=sources.find(s=>s.url===prior.officialSource);
  if(!source)throw Error('Candidate is not registered: '+row.name);
  const more=followup.results.find((r:any)=>r.name===row.name&&r.type===row.type);
  const snapshots=cached.filter(c=>c.url===row.url||c.hash===row.documentHash||more?.resources?.some((r:any)=>r.parent===c.url));
  const indexes=snapshots.map(c=>({url:c.url,resources:officialResources(c.url,c.body),checkedAt:c.checkedAt}));
  const index=indexes.find(c=>c.resources.some((r:any)=>r.kind==='document'&&new URL(r.url).origin===new URL(c.url).origin&&!/minutes|cancelled|application\.pdf|calendar|rules.of.procedure/i.test(r.title+' '+r.url)));
  const validatedFeeds=[...(row.feeds||[]),...(more?.feeds||[])].filter((f:any)=>developmentLayers({layers:[{id:Number(f.url.split('/').pop()),name:f.name}]}).length);
  const entry:any={name:row.name,type:row.type,sourceId:source.id,officialURL:row.url,accessStatus:row.status,followupStatus:more?.status||null,errors:[...row.errors,...(more?.errors||[])],status:index?'document_index_adapter_built':validatedFeeds.length?'structured_mapping_needs_validation':'adapter_still_required',structuredCandidates:validatedFeeds};
  if(index){entry.adapter={...source,url:index.url,adapter:'document',autopublish:false,config:{...source.config,mappingVersion:'nc-document-index-v1-2026-10-29',sourceRole:'document_review',statusScope:'agenda-index',scopeVerified:false,noticeDiscovery:true,noticePathPattern:'^/',noticeLimit:20,notes:['Dynamic links from the verified official index only; no automatic project facts or meeting associations.']}};entry.documentLinks=index.resources.filter((r:any)=>r.kind==='document').length;}
  entries.push(entry);
 }
 // Prioritize Linux verification of blocked sources and a geographically varied document sample.
 const blocked=entries.filter(e=>e.accessStatus==='blocked_or_unavailable');
 const documents=entries.filter(e=>e.adapter&&!blocked.includes(e)).slice(0,11);
 for(const e of [...blocked,...documents].slice(0,24)){const source=sources.find(s=>s.id===e.sourceId);plan.push({name:e.name,type:e.type,source:e.adapter||{...source,autopublish:false,config:{...source.config,scopeVerified:false,statusScope:'unverified',sourceRole:'discovery_candidate'}},coverage:e.adapter?'Official document pointers only':'Access retest only; no development adapter is asserted'});}
 writeFileSync('config/maintenance/nc-adapter-builds.json',JSON.stringify({checkedAt:new Date().toISOString(),dryRun:true,entries},null,2)+'\n');writeFileSync('config/maintenance/nc-adapter-pilot-plan.json',JSON.stringify(plan,null,2)+'\n');
 console.log(JSON.stringify({areas:entries.length,documentAdapters:entries.filter(e=>e.adapter).length,structuredPending:entries.filter(e=>e.structuredCandidates.length).length,githubTests:plan.length}));
}finally{await db.close();}
