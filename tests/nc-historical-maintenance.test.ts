import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applicationVote,constructionStatement,corroborates,groundedDescription,reconcileDocumentProposal} from '../server/maintenance/document-decisions';
const docs=JSON.parse(readFileSync('tests/fixtures/nc-historical-documents.json','utf8'));
const doc=(key:string)=>{const d=docs.find((d:any)=>d.key===key);return {...d,official:true,sha256:d.documentHash};};
test('real Kannapolis minutes: cross-page vote belongs to CZ-2025-05, not neighboring cases',()=>{
 const d=doc('kannapolis-january-minutes'),v=applicationVote(d,'CZ-2025-05','2026-01-20');
 assert.ok(v);assert.equal(v.page,6);assert.match(v.quote,/six to two/);assert.equal(v.wholeProjectStatus,null);assert.equal(v.requiresReview,true);
 assert.equal(applicationVote(d,'CZ-2099-99','2026-01-20'),null);
 assert.equal(applicationVote({...d,pages:[{page:1,text:'CZ-2025-05 – Rezoning\nStaff recommends approval.'}]},'CZ-2025-05','2026-01-20'),null);
});
test('real Cary quarterly report: component construction start, not anticipated completion',()=>{
 const d=doc('cary-construction-report'),v=constructionStatement(d,'BLACK CREEK GREENWAY AND CARY PARKWAY',2024);
 assert.ok(v);assert.equal(v.date,'2024-06-03');assert.equal(v.page,39);assert.equal(v.scope,'described_component');assert.equal(v.wholeProjectStatus,null);
 assert.equal(v.dateBasis,'document_period_requires_confirmation');
 const forecast={...d,pages:[{page:1,text:'BLACK CREEK GREENWAY AND CARY PARKWAY\nConstruction is scheduled to start on June 3, 2024.'}]};
 assert.equal(constructionStatement(forecast,'BLACK CREEK GREENWAY AND CARY PARKWAY',2024),null);
});
test('corroboration needs verified identity, event, date and component agreement',()=>{
 const a={projectId:'black-creek-phase',event:'construction_started',date:'2024-06-03',scope:'described_component',official:true},b={...a,official:false};
 assert.equal(corroborates(a,b,true),true);assert.equal(corroborates(a,b,false),false);
 assert.equal(corroborates(a,{...b,event:'identity_mention'},true),false);
 assert.equal(corroborates(a,{...b,date:'2026-06-03'},true),false);
 assert.equal(corroborates(a,{...b,scope:'whole_project'},true),false);
});
test('description proposal is extractive, preserves forecasts, and cannot reset approval',()=>{
 const d=doc('cary-construction-report');
 const quote='Construction is anticipated to take three years to complete and will take place in three phases';
 const proposal=groundedDescription(d,quote,'Controlled previous description, not a historical database snapshot.');
 assert.ok(proposal);assert.equal(proposal.after,quote);assert.equal(proposal.approvalDateChange,null);assert.equal(proposal.statusChange,null);
 assert.equal(groundedDescription(d,'Construction is now completed and the entire greenway is open.', ''),null);
 assert.equal(groundedDescription(d,quote,quote),null);
});
test('statewide roster is an inactive inventory, not an activated source registry',()=>{
 const x=JSON.parse(readFileSync('config/maintenance/nc-statewide-inventory.json','utf8'));
 assert.equal(x.counties.length,100);assert.equal(x.municipalities.length,550);
 assert.equal(new Set([...x.counties,...x.municipalities].map(e=>e.id)).size,650);
 assert.equal(x.researchHTTPRequests,0);assert.equal(x.publication,false);assert.equal(x.archival,false);assert.equal(x.scheduling,false);
 assert.ok(x.municipalities.every((e:any)=>!/^Balance of /.test(e.name)));
 assert.ok(x.sources.every((s:any)=>s.capabilities.productionApproved===false));
});
test('document reconciliation requires a reviewed binding and suppresses repeated milestones',()=>{
 const v=applicationVote(doc('kannapolis-january-minutes'),'CZ-2025-05','2026-01-20')!;
 const context={projectId:'controlled-existing-id',binding:{url:v.url,verified:true},events:[]};
 assert.equal(reconcileDocumentProposal(v,context).outcome,'proposed_milestone');
 assert.equal(reconcileDocumentProposal(v,{...context,events:[v]}).outcome,'unchanged');
 assert.equal(reconcileDocumentProposal(v,{...context,binding:{url:v.url,verified:false}}).outcome,'identity_review');
 assert.equal(reconcileDocumentProposal(v,{...context,binding:{url:'https://example.com/other.pdf',verified:true}}).projectId,null);
});
