/** Deterministic cached-document stage; executable unattended, with no HTTP or database writes. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {applicationVote,constructionStatement,groundedDescription,reconcileDocumentProposal} from '../server/maintenance/document-decisions';
const documents=JSON.parse(readFileSync('tests/fixtures/nc-historical-documents.json','utf8'));
const get=(key:string)=>{const d=documents.find((v:any)=>v.key===key);return {...d,official:true,sha256:d.documentHash};};
const kannapolis=applicationVote(get('kannapolis-january-minutes'),'CZ-2025-05','2026-01-20');
const cary=constructionStatement(get('cary-construction-report'),'BLACK CREEK GREENWAY AND CARY PARKWAY',2024);
assert.ok(kannapolis);assert.ok(cary);
const description=groundedDescription(get('cary-construction-report'),'Construction is anticipated to take three years to complete and will take place in three phases','Controlled previous description: not an actual historical Supabase version.');assert.ok(description);
const results=[{kind:'real_cached_application_vote',evidence:kannapolis,reconciliation:reconcileDocumentProposal(kannapolis,{projectId:null,binding:null,events:[]})},{kind:'real_cached_construction_statement',evidence:cary,reconciliation:reconcileDocumentProposal(cary,{projectId:null,binding:null,events:[]})},{kind:'real_official_quote_with_controlled_prior_description',proposal:description}];
const report={generatedAt:new Date().toISOString(),httpRequests:0,productionWrites:0,publication:false,archival:false,scheduling:false,realDocumentEvents:2,controlledDescriptionComparisons:1,canonicalMatchesVerifiedByThisRun:0,results,limitations:['Cached historical evidence is not a fresh source check.','Canonical bindings remain unresolved; no proximity/name-based automatic attachment.','Construction date year uses FY2024 report context; confirm with explicit dated linked project report before accepting.','No whole-project status, location, approval policy, or visibility changes are authorized.']};
mkdirSync('reports/maintenance',{recursive:true});writeFileSync('reports/maintenance/NC-CACHED-MAINTENANCE.json',JSON.stringify(report,null,2));console.log(JSON.stringify({realDocumentEvents:2,controlledDescriptionComparisons:1,httpRequests:0,productionWrites:0,canonicalMatchesVerified:0,report:'reports/maintenance/NC-CACHED-MAINTENANCE.json'}));
