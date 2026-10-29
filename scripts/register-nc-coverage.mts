/** Register disabled research candidates and report gaps; no project writes. */
import {readFileSync,writeFileSync} from 'node:fs';
import {loadPostgresEnvironment,PostgresDatabase} from '../server/postgres/connection';
import {hash} from '../server/maintenance/policy';
loadPostgresEnvironment();const db=new PostgresDatabase();
const read=(name:string)=>JSON.parse(readFileSync('config/maintenance/'+name+'.json','utf8'));
try{
 const inventory=read('nc-jurisdiction-sources');if(inventory.entries.length!==76)throw Error('Official jurisdiction inventory is incomplete');
 const overrides=read('nc-source-overrides'),research=read('nc-county-source-research').entries;
 const sources=await db.rows('SELECT * FROM buildwatch.maintenance_sources');
 const entries=inventory.entries.map((entry:any)=>{
  const adapters=entry.existingAdapters.map((a:any)=>sources.find(s=>s.id===a.id)).filter(Boolean);
  const development=adapters.filter((a:any)=>a.last_success&&!a.last_error&&a.adapter!=='document'&&!['supporting_only','location_reference','discovery_candidate'].includes(a.config.sourceRole));
  const documents=adapters.filter((a:any)=>a.last_success&&!a.last_error&&a.adapter==='document');
  const extra=entry.type==='county'?research.find((r:any)=>r.name===entry.name)?.links||[]:[];
  const choices=[...extra,...entry.sources].filter((s:any)=>/planning|zoning|development|agenda|public.hearing/i.test(s.title+' '+s.url)&&!/\.pdf(?:$|\?)|scam|fraud|job|career|library|economic.development|land.use.plan|comprehensive|ordinance/i.test(s.title+' '+s.url));
  choices.sort((a:any,b:any)=>Number(/planning|zoning|current.project|development.activity|pending.application/i.test(b.url))-Number(/planning|zoning|current.project|development.activity|pending.application/i.test(a.url)));
  const url=overrides[entry.type+':'+entry.name]||choices[0]?.url||entry.homepage;
  if(!url||!url.startsWith('https://'))throw Error('No official reference for '+entry.name);
  return{type:entry.type,name:entry.name,population:entry.population,populationSource:entry.populationSource,officialSource:url,sourceKind:development.length?'tested_feed_partial_scope':documents.length?'document_index_only':choices.length||overrides[entry.type+':'+entry.name]?'source_candidate_adapter_pending':'homepage_only_needs_specific_source',testedSourceIds:development.map((a:any)=>a.id),documentSourceIds:documents.map((a:any)=>a.id),candidateEnabled:false,autopublish:false,homepageRetrievalError:entry.error||null,notes:development.length?'Feed was exercised; its scope does not establish complete jurisdiction coverage.':documents.length?'Agenda links are readable; project facts and meeting associations still need extraction.':'Official source reference only. Access policy, current project coverage, field mappings and pilot validation remain required.'};
 });
 const inserted=await db.transaction(async()=>{
  const control=await db.one('SELECT * FROM buildwatch.maintenance_control WHERE id=1 FOR UPDATE');if(control.schedule_enabled||control.writes_enabled)throw Error('Dry-run gates must remain off');let count=0;
  for(const e of entries){if(e.sourceKind==='tested_feed_partial_scope')continue;
   const config={sourceRole:'discovery_candidate',coverageEntities:[{type:e.type,name:e.name,population:e.population}],populationSource:e.populationSource,readiness:e.sourceKind,approvalPending:true,notes:[e.notes,e.homepageRetrievalError||'No retrieval error recorded for the official homepage.'],registryVersion:'nc-50k-2026-10-29'};
   const result=await db.query("INSERT INTO buildwatch.maintenance_sources(id,state,jurisdiction,url,adapter,authority,enabled,autopublish,config) VALUES($1,'NC',$2,$3,'document','official',false,false,$4::jsonb) ON CONFLICT(state,url) DO NOTHING",['source-'+hash(['NC',e.officialSource]).slice(0,30),e.name+(e.type==='county'?' County':'')+' — disabled source candidate',e.officialSource,JSON.stringify(config)]);count+=result.rowCount||0;
  }return count;
 });
 const counts:Record<string,number>={};for(const e of entries)counts[e.sourceKind]=(counts[e.sourceKind]||0)+1;
 writeFileSync('config/maintenance/nc-coverage-status.json',JSON.stringify({checkedAt:new Date().toISOString(),dryRun:true,scheduleEnabled:false,projectWritesEnabled:false,counts,candidatesInserted:inserted,entries},null,2)+'\n');
 const rows=entries.map((e:any)=>'| '+e.name+(e.type==='county'?' County':'')+' | '+e.population.toLocaleString('en-US')+' | '+e.sourceKind.replaceAll('_',' ')+' | [Official reference]('+e.officialSource+') |');
 writeFileSync('NC-STATEWIDE-COVERAGE.md','# North Carolina source coverage — dry-run only\n\nAll 24 municipalities and 52 counties at or above 50,000 residents are listed separately. Population: NC OSBM Vintage 2025. City data is not assumed to cover an entire county. A source reference is not a validated ingestion adapter.\n\nNew references are disabled research candidates in Automation Management. No schedule or project writes were enabled.\n\n| Area | Population | Readiness | Source |\n| --- | ---: | --- | --- |\n'+rows.join('\n')+'\n');
 console.log(JSON.stringify({entities:entries.length,counts,candidatesInserted:inserted,projectChanges:0}));
}finally{await db.close();}
