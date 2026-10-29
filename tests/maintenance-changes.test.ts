import test from 'node:test';import assert from 'node:assert/strict';
import {informationChange,componentMilestone,terminalEvidence} from '../server/maintenance/changes';
import {deriveProject} from '../server/supabase/derive';import {recordEvents} from '../server/activity/evidence';
import {evaluateFinding} from '../server/maintenance/policy';
const source:any={authority:'official',id:'official',config:{scopeVerified:true,statusScope:'development',terminalStatusVerified:true,eventDateMeaning:'development_decision'}};
const project:any={id:'test',name:'Infrastructure Application',description:'A documented 200-unit multifamily housing development.',status:'Approved',category:'Residential',homes:200,meetings:[],sources:[{url:'https://example.gov/project'}]};
const finding:any={externalId:'712',name:project.name,description:'A revised development application documents 240 housing units and a changed site plan.',eventDate:'2026-10-22',url:'https://example.gov/project',quote:'Official record fields: 240 homes',status:'Completed',rawStatus:'Completed'};
test('terminal decisions require whole-development semantics and explicit source attestation',()=>{
 assert.equal(terminalEvidence(finding,source),true);
 for(const config of [{terminalStatusVerified:false},{statusScope:'application'},{scopeVerified:false},{eventDateMeaning:'permit_closed'}])assert.equal(terminalEvidence(finding,{...source,config:{...source.config,...config}}),false);
 assert.equal(terminalEvidence({...finding,status:'Cancelled',rawStatus:'Withdrawn by Applicant'},source),false);
 assert.equal(terminalEvidence({...finding,status:'Cancelled',rawStatus:'Canceled'},source),true);
});
test('description changes are evidence-backed proposals; formatting and source prefixes are unchanged',()=>{
 assert.equal(informationChange(finding,source,project)?.after,finding.description);
 assert.equal(informationChange({...finding,description:'  '+project.description.toUpperCase()+'  '},source,project),null);
 assert.equal(informationChange({...finding,description:project.description},source,{...project,description:project.description+' Original source citation.'}),null);
 assert.equal(informationChange({...finding,eventDate:undefined},source,project),null);assert.equal(informationChange(finding,{...source,authority:'supplementary'},project),null);
});
test('component approval is scoped to an exact matched application and never inferred for a parent hospital',()=>{
 const s={...source,config:{statusScope:'application',componentMilestonesVerified:true}},f={...finding,sourceDates:{applicationActionAt:'2026-10-22'},sourceFacts:{applicationAction:'TRC Approved'}};
 assert.equal(componentMilestone(f,s,project)?.type,'Application Approval');assert.equal(componentMilestone(f,s,{...project,name:'Parent Hospital Campus'}),null);
 assert.equal(componentMilestone({...f,sourceFacts:{applicationAction:'Recommended Approval'}},s,project),null);assert.equal(componentMilestone({...f,sourceDates:{applicationActionAt:'2099-01-01'}},s,project),null);
 assert.equal(componentMilestone({...f,sourceDates:{applicationActionAt:'2026-10-22T00:00:00.000Z'}},s,project)?.date,'2026-10-22');
});
test('older decisions cannot regress a project or its lifecycle',()=>{
 const result=evaluateFinding({...finding,eventDate:'2026-01-01'},source,{...project,sourceStatusDate:'2026-10-22'});
 assert.ok(result.reasons.some(v=>v.includes('predates')));assert.equal(result.eligible,false);
});
test('missing policy context does not request deletion of historical policy events',async()=>{
 assert.equal(Object.hasOwn(await deriveProject(project),'policyEvents'),false);
 assert.ok(Object.hasOwn(await deriveProject(project,{schedules:[]}),'policyEvents'));
 assert.equal(recordEvents({...project,sourceStatus:'Completed',sourceStatusDate:'2026-10-22'})[0].type,'Completion');
 assert.deepEqual(recordEvents({...project,sourceStatus:'Not approved',sourceStatusDate:'2026-10-22'}),[]);
});
