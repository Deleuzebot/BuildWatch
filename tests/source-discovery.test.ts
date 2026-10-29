import test from 'node:test';import assert from 'node:assert/strict';
import {officialResources,developmentLayers,mappingProposal} from '../server/maintenance/source-discovery';import {agendaReferences,extractAgendaPDF} from '../server/maintenance/agendas';
import {linkedArcGISServices} from '../server/maintenance/research-reader';
import {ResearchReader} from '../server/maintenance/research-reader';import {Budget,hash} from '../server/maintenance/policy';import {pdfLimits,pdfProfile} from '../server/maintenance/pdf-limits';
test('only explicitly linked HTTPS resources are discovered; discovery never asserts project facts',()=>{
 const r=officialResources('https://government.example/planning','<iframe src="https://www.arcgis.com/apps/mapviewer/index.html?webmap=123"></iframe><a href="/AgendaCenter/ViewFile/Agenda/123">Planning agenda packet</a><a href="javascript:alert(1)">Planning</a><a href="https://user:password@example.com/agenda">Planning</a>');
 assert.equal(r.length,2);assert.equal(r[0].parent,'https://government.example/planning');assert.ok(r.every(v=>!('status' in v)&&!('latitude' in v)));
});
test('layer selection rejects parcels, districts, stormwater, permits and maintenance overlays',()=>{
 const layers=developmentLayers({layers:[{id:1,name:'Active Development Projects'},{id:2,name:'Planning Parcel Overlay'},{id:3,name:'Development Permits'},{id:4,name:'Zoning Districts'}]});assert.deepEqual(layers,[{id:1,name:'Active Development Projects'}]);
 const config=mappingProposal({objectIdField:'OID',fields:[{name:'OID',type:'esriFieldTypeOID'},{name:'ProjectName',type:'esriFieldTypeString'},{name:'Status',type:'esriFieldTypeString'}]});assert.equal(config.fields.name,'ProjectName');assert.equal(config.scopeVerified,false);assert.equal(config.statusScope,'application');assert.equal((config as any).eventDate,undefined);
});
test('embedded maps do not promote roads, parcels or boundaries into development feeds',()=>{
 const result=linkedArcGISServices({operationalLayers:[{title:'Lenoir_Roads',url:'https://services.arcgis.com/x/FeatureServer/1'},{title:'CountyBoundary',url:'https://services.arcgis.com/x/FeatureServer/2'},{title:'Development Projects',url:'https://services.arcgis.com/x/FeatureServer/3'}]});assert.deepEqual(result.urls,['https://services.arcgis.com/x/FeatureServer/3']);
});
test('snapshot reuse preserves retrieval time, checks hashes and spends zero network requests',async()=>{
 const budget=new Budget(),reader=new ResearchReader(budget),at='2026-10-29T10:00:00Z',snapshot={url:'https://government.example/planning',body:'Official snapshot',checkedAt:at,hash:hash('Official snapshot')};
 assert.equal(reader.seed(snapshot,Date.parse(at)+1000),true);const result=await reader.get(snapshot.url);assert.equal(result.snapshotAt,at);assert.equal(budget.requests,0);assert.equal(reader.seed({...snapshot,body:'tampered'},Date.parse(at)+1000),false);assert.equal(reader.seed(snapshot,Date.parse(at)+86400001),false);
});
test('large PDF resource profile stays opt-in and never changes standard limits',()=>{
 const before=process.env.BW_PDF_50MB_BENCHMARK,validated=process.env.BW_PDF_50MB_VALIDATED;delete process.env.BW_PDF_50MB_BENCHMARK;delete process.env.BW_PDF_50MB_VALIDATED;try{assert.equal(pdfProfile().bytes,2_000_000);assert.throws(()=>pdfProfile('planning50'),/explicit benchmark/);process.env.BW_PDF_50MB_BENCHMARK='true';assert.equal(pdfProfile('planning50').bytes,50_000_000);assert.equal(pdfLimits.planning50.pages,200);assert.equal(pdfProfile().bytes,2_000_000);}finally{if(before===undefined)delete process.env.BW_PDF_50MB_BENCHMARK;else process.env.BW_PDF_50MB_BENCHMARK=before;if(validated===undefined)delete process.env.BW_PDF_50MB_VALIDATED;else process.env.BW_PDF_50MB_VALIDATED=validated;}
});
test('agenda extraction preserves page citations and never turns requested actions into approvals or meetings',async()=>{
 const records=agendaReferences({totalPages:1,truncated:false,pages:[{page:1,text:'Application CZ-2026-15: Consider a request to approve a conditional zoning development. This is not a decision.\nMeeting date to be announced.'}]},'https://government.example/agenda.pdf');
 assert.equal(records.length,1);assert.equal(records[0].page,1);assert.equal(records[0].statusVerified,false);assert.equal(records[0].meetingAssociationVerified,false);assert.match(records[0].quote,/not a decision/);assert.equal((records[0] as any).startsAt,undefined);
 await assert.rejects(extractAgendaPDF(Buffer.from('<html>not PDF</html>')),/Not a bounded PDF/);
 assert.deepEqual(agendaReferences({totalPages:1,truncated:false,pages:[{page:1,text:'Fiscal budget FY-2026-01; no cases are scheduled.'}]},'https://government.example/agenda.pdf'),[]);
});
test('Linux PDF sandbox extracts a real bounded document with page provenance',{skip:process.platform!=='linux'},async()=>{
 const text='Case CZ-2026-15: conditional zoning development request';const stream='BT /F1 12 Tf 50 750 Td ('+text+') Tj ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Length '+stream.length+' >>\nstream\n'+stream+'\nendstream'];
 let file='%PDF-1.4\n';const offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(file));file+=(i+1)+' 0 obj\n'+objects[i]+'\nendobj\n';}const xref=Buffer.byteLength(file);file+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(v=>String(v).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
 const result=await extractAgendaPDF(Buffer.from(file));assert.equal(result.totalPages,1);assert.match(result.pages[0].text,/CZ-2026-15/);assert.equal(agendaReferences(result,'https://government.example/agenda.pdf')[0].page,1);
});
