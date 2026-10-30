/** Cached regression, not a live scan. No credentials, HTTP transport or publication entry point. */
import assert from 'node:assert/strict';import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {validateSourceSchema,parsePage,sourcePage} from '../server/maintenance/adapters';
import {evaluateFinding} from '../server/maintenance/policy';
import {evidenceDocuments,planningDocumentFindings,governmentPlatform} from '../server/maintenance/platforms';
const fixture=JSON.parse(readFileSync('tests/fixtures/nc-platforms.json','utf8')),records:any[]=[],indexes:any[]=[];
for(const p of fixture.profiles){validateSourceSchema(p.source,p.metadata);if(!p.records)continue;
 const page=parsePage(p.source,JSON.stringify(p.records),100);for(const f of page.findings){const evaluation=evaluateFinding(f,p.source,null);assert.equal(evaluation.eligible,false);assert.equal(f.eventDate,undefined);
  records.push({jurisdiction:p.jurisdiction,sourceURL:f.url,sourceRecordIdentifier:f.externalId,name:f.name,address:f.address,description:f.description,category:evaluation.project.primaryCategory||null,verifiedPoint:f.locationVerified,proposedStatus:null,proposedApprovalDate:null,proposedDescription:f.description?{text:f.description,eventDate:null,sourceURL:f.url,requiresReview:true}:null,requiresReview:true,withheldReasons:evaluation.reasons});
 }
 const query=new URL(sourcePage(p.source,-1,100));assert.match(query.searchParams.get('where')!,/OBJECTID>-1/);
}
for(const p of fixture.indexes){const links=evidenceDocuments(p.source,p.html);assert.ok(links.length);indexes.push({jurisdiction:p.jurisdiction,platform:governmentPlatform(p.source.url),validation:'cached_index_fragment_only',documents:links.length,extractionValidated:false,fullPageHash:p.fullPageHash});}
const documents=JSON.parse(readFileSync('tests/fixtures/nc-historical-documents.json','utf8')),d=documents.find((d:any)=>d.key==='kannapolis-january-minutes'),source=fixture.indexes.find((i:any)=>i.jurisdiction==='Kannapolis').source;
const findings=planningDocumentFindings(source,{...d,truncated:false},d.url,d.documentHash);assert.ok(findings.some(f=>f.externalId==='CZ-2025-05'&&f.documentProposal.decision?.date==='2026-01-20'));
const summary={governmentRequests:0,productionWrites:0,recordLevelAdapters:1,schemaOnlyAdapters:2,cachedIndexAdapters:indexes.length,documentDecisionProfiles:1,realSourceRecords:records.length,recordsWithDescriptions:records.filter(r=>r.description).length,recordsWithPoints:records.filter(r=>r.verifiedPoint).length,recordsWithKnownCategory:records.filter(r=>r.category).length,wholeProjectStatusChanges:0,publication:false,archival:false,scheduling:false};
mkdirSync('reports/maintenance',{recursive:true});writeFileSync('reports/maintenance/NC-PLATFORM-VALIDATION.json',JSON.stringify({createdAt:new Date().toISOString(),summary,records,indexes,documentFindings:findings,limitations:['Cached record discovery is not current access verification or complete jurisdiction coverage.','Schema-only sources do not count as working record integrations.','Source IDs are not registered or enabled in production by this script.']},null,2));console.log(JSON.stringify(summary));
