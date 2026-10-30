import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {parsePage,sourcePage,validateSourceSchema} from '../server/maintenance/adapters';
import {evidenceDocuments,planningDocumentFindings,governmentPlatform} from '../server/maintenance/platforms';
import {evaluateFinding} from '../server/maintenance/policy';import {arcgisReferenceId} from '../server/maintenance/source-identity';
import {runState} from '../server/maintenance/worker';import {syntheticPDF} from '../server/maintenance/pdf-fixture';
const fixture=JSON.parse(readFileSync('tests/fixtures/nc-platforms.json','utf8')),wilson=fixture.profiles.find((p:any)=>p.jurisdiction==='Wilson');
test('Union consolidated inventory and supporting rezonings retain independent official evidence without inferred milestones',()=>{
 const profiles=JSON.parse(readFileSync('tests/fixtures/nc-union-sources.json','utf8'));assert.equal(profiles.length,2);
 for(const p of profiles){validateSourceSchema(p.source,p.metadata);const parsed=parsePage(p.source,JSON.stringify(p.records),100);assert.equal(parsed.count,4);assert.ok(parsed.findings.every(f=>!f.wholeDevelopment));assert.equal(p.source.enabled,false);assert.equal(p.source.autopublish,false);}
 const primary=profiles.find((p:any)=>p.source.config.sourceRole==='development_review'),support=profiles.find((p:any)=>p.source.config.sourceRole==='supporting_only');
 const first=parsePage(primary.source,JSON.stringify(primary.records),100).findings[0];assert.equal(first.name,'Best Box');assert.equal(first.sourceFacts?.applicationNumber,'20160501');assert.equal(first.sourceDates?.applicationApprovalAt,undefined);
 const rezoning=parsePage(support.source,JSON.stringify(support.records),100).findings[0];assert.equal(rezoning.rawStatus,'Approval');assert.equal(rezoning.sourceFacts?.planningBoardRecommendation,'Tabled');assert.equal(rezoning.eventDate,undefined);assert.deepEqual(rezoning.sourceDates,{});assert.equal(evaluateFinding(rezoning,support.source,null).eligible,false,'A year, staff recommendation or zoning approval cannot become a new whole-project milestone');
});
test('a source page ceiling preserves its cursor and allows other sources to run',async()=>{
 const base:any={state:'NC',jurisdiction:'Controlled city',adapter:'arcgis',authority:'official',autopublish:false,config:{idField:'OBJECTID',fields:{name:'Name'},requiredFields:['OBJECTID','Name']}};
 const sources=['a','b'].map(id=>({...base,id,url:'https://example.com/arcgis/'+id+'/FeatureServer/0'}));let finished:any;
 const rpc:any=async(action:string,input:any={})=>{if(action==='claim')return{run:{id:'controlled-page-cap',lease:'controlled',checkpoint:{}},state:{max_seconds:30,max_requests:10,max_records:100},sources};if(action==='document')return{};if(action==='match')return{ids:[],project:null};if(action==='finding')return{outcome:'awaiting_review'};if(action==='finish')finished=input;return{};};
 const transport:typeof fetch=async(input)=>{const url=String(input);if(url.endsWith('/robots.txt'))return new Response('User-agent: *\nAllow: /');if(!url.includes('/query'))return Response.json({objectIdField:'OBJECTID',fields:[{name:'OBJECTID',type:'esriFieldTypeOID'},{name:'Name',type:'esriFieldTypeString'}]});return Response.json({features:[{attributes:{OBJECTID:1,Name:'Controlled multifamily project'}}],exceededTransferLimit:url.includes('/a/')});};
 const result=await runState(rpc,{state:'NC',mode:'weekly',dryRun:true,key:'controlled',maxSourcePages:1},transport);assert.equal(result.status,'partially_completed');assert.equal(result.sourcesDeferred,1);assert.deepEqual(finished.checkpoint.done,['b']);assert.equal(finished.checkpoint.cursors.a,1);assert.equal(result.sourceRecords,2);
});
test('real cached Wilson records retain descriptions/points but cannot invent statuses or approval dates',()=>{
 validateSourceSchema(wilson.source,wilson.metadata);const page=parsePage(wilson.source,JSON.stringify(wilson.records),100);assert.equal(page.count,40);
 for(const f of page.findings){assert.ok(f.name);assert.equal(f.status,undefined);assert.equal(f.eventDate,undefined);assert.equal(evaluateFinding(f,wilson.source,null).eligible,false);}
 const ballpark=page.findings.find(f=>f.name==='Wilson Ball Park')!;assert.match(ballpark.description,/116/);assert.equal(ballpark.sourceFacts?.applicationNumber,'24-124');
});
test('Lincoln schema and Forsyth historical GIS rows remain review-only coverage',()=>{
 for(const p of fixture.profiles){assert.doesNotThrow(()=>validateSourceSchema(p.source,p.metadata));const broken=structuredClone(p.metadata);broken.fields=broken.fields.filter((f:any)=>f.name!=='OBJECTID');assert.throws(()=>validateSourceSchema(p.source,broken));assert.equal(p.source.autopublish,false);assert.equal(p.source.enabled,false);}
 assert.equal(fixture.profiles.filter((p:any)=>p.records).length,2);
});
test('shared CivicPlus and official HTML adapters replay cached markup without asserting decisions',()=>{
 assert.equal(fixture.indexes.length,17);let shared=0;
 for(const p of fixture.indexes){const links=evidenceDocuments(p.source,p.html);assert.ok(links.length);assert.ok(links.every(l=>new URL(l.url).origin===new URL(p.source.url).origin));if(governmentPlatform(p.source.url)==='civicplus')shared++;assert.equal(p.documentExtractionValidated,false);}
 assert.ok(shared>=4);
});
test('real minutes traverse the shared document stage, with scope and identity left guarded',()=>{
 const d=JSON.parse(readFileSync('tests/fixtures/nc-historical-documents.json','utf8')).find((p:any)=>p.key==='kannapolis-january-minutes'),s=fixture.indexes.find((p:any)=>p.jurisdiction==='Kannapolis').source;
 const findings=planningDocumentFindings(s,{...d,truncated:false},d.url,d.documentHash),v=findings.find(f=>f.externalId==='CZ-2025-05')!;
 assert.equal(v.documentProposal.decision?.date,'2026-01-20');assert.equal(v.documentProposal.decision?.page,6);assert.equal(v.documentProposal.identityVerified,false);assert.equal(v.documentProposal.publication,false);assert.equal(v.documentProposal.approvalDateChange,null);
 const other=planningDocumentFindings({...s,config:{...s.config,decisionProfile:undefined}},{...d,truncated:false},d.url,d.documentHash);assert.ok(other.every(f=>f.documentProposal.decision===null));
});
test('ArcGIS filters are preserved, keyset IDs are strict, and neighboring layers never merge',()=>{
 const s={...wilson.source,config:{...wilson.source.config,where:"DEV_TYPE='Residential'"}},u=new URL(sourcePage(s,-1,20));assert.equal(u.searchParams.get('where'),"(DEV_TYPE='Residential') AND OBJECTID>-1");assert.equal(u.searchParams.has('resultOffset'),false);
 const row=wilson.records.features[0];assert.throws(()=>parsePage(s,JSON.stringify({features:[row,row]}),20),/duplicate/);
 assert.equal(arcgisReferenceId(s.url,s.url+'/query?objectIds=6'),'6');assert.equal(arcgisReferenceId(s.url,s.url+'/query?where=OBJECTID%3D6'),'6');assert.equal(arcgisReferenceId(s.url,s.url+'/query?objectIds=6,7'),null);assert.equal(arcgisReferenceId(s.url,s.url.replace(/\/0$/,'/1')+'/query?objectIds=6'),null);
});
test('document cache rechecks same-URL PDFs under unchanged indexes and suppresses repeat extraction',{skip:process.platform!=='linux'},async()=>{
 const source:any={id:'pdf-test',state:'NC',jurisdiction:'Controlled test',adapter:'document',authority:'official',url:'https://www.burlingtonnc.gov/platform-test-index',autopublish:false,config:{noticePathPattern:'^/DocumentCenter/',agendaPDFReview:true,documentResearch:true,agendaPDFLimit:1}};
 const cache=new Map<string,any>();let finds=0,pdfGets=0;
 const rpc:any=async(action:string,input:any={})=>{
  if(action==='claim')return{run:{id:'test',lease:'test',checkpoint:{}},state:{max_seconds:40,max_requests:8,max_records:100},sources:[source]};
  if(action==='document')return cache.get(input.url)||{};if(action==='cache'){cache.set(input.url,input);return{};}
  if(action==='match')return{ids:[],project:null};if(action==='finding'){finds++;return{outcome:'awaiting_review'};}return{};
 };
 const fake:typeof fetch=async(url:any,init:any)=>{
  if(String(url).endsWith('/robots.txt'))return new Response('User-agent: *\nAllow: /');
  if(String(url).includes('/DocumentCenter/')){pdfGets++;if(init.headers['If-None-Match']==='"unchanged"')return new Response(null,{status:304});return new Response(new Uint8Array(syntheticPDF()),{headers:{ETag:'"unchanged"'}});}
  return new Response('<a href="/DocumentCenter/View/1/Agenda">Planning agenda</a>');
 };
 const first=await runState(rpc,{state:'NC',mode:'weekly',dryRun:true,key:'first',onlySource:source.id},fake);assert.equal(first.agendaFailures||0,0,first.error);assert.equal(first.agendaPDFs,1);const before=finds;
 const second=await runState(rpc,{state:'NC',mode:'weekly',dryRun:true,key:'second',onlySource:source.id},fake);assert.equal(second.agendaPDFs||0,0);assert.equal(second.unchangedDocuments,1);assert.equal(pdfGets,2);assert.equal(finds,before+1,'Only the stable index lead is re-submitted; PDF case findings are suppressed');
});

test('Forsyth repeated business dockets do not overwrite unique GIS rows or become dated approvals',()=>{const p=fixture.profiles.find((p:any)=>p.jurisdiction==='Forsyth');const result=parsePage(p.source,JSON.stringify(p.records),100);assert.equal(new Set(result.findings.map(f=>f.externalId)).size,15);assert.ok(new Set(result.findings.map(f=>f.sourceFacts?.docketId)).size<15);assert.ok(result.findings.every(f=>!f.eventDate&&!f.wholeDevelopment));});
