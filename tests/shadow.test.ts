import test from 'node:test';import assert from 'node:assert/strict';import {shadowFinding,shadowFindingId,shadowSources,summarizeShadow} from '../server/maintenance/shadow';
test('repeat verification does not duplicate identical evidence and changed source evidence remains traceable',()=>{
 const f={name:'Fixture',responseEvidence:{responseHash:'a'},observation:{checkedAt:'2026-10-29',verification:'fresh-http-response'}};
 assert.equal(shadowFindingId('apex','1',f),shadowFindingId('apex','1',{...f,observation:{checkedAt:'2026-10-30',verification:'http-304-cached-body'}}));assert.notEqual(shadowFindingId('apex','1',f),shadowFindingId('apex','1',{...f,responseEvidence:{responseHash:'b'}}));
});
test('shadow permits cannot propose construction, completion or publication',()=>{
 const a={OBJECTID:2,permitnum:'FIXTURE-ONLY',projectname:'Fixture apartments',proposedworkdescription:'New 30 unit multifamily apartment building',issueddate:1791504000000,originaladdress1:'100 Fixture St',statuscurrentmapped:'Issued'};
 const r=shadowFinding(shadowSources[2],{attributes:a,geometry:{x:-78.7,y:35.8}},{spatialReference:{wkid:4326}},{ids:[]});assert.equal(r.significantNewCandidate,true);assert.deepEqual(r.proposed,{publish:false,archive:false,status:null,timeline:null,location:null,approvalDate:null});assert.match(r.reasons.join(' '),/Supporting permit only/);
 const archived=shadowFinding(shadowSources[2],{attributes:a},{},{project:{id:'fixture',status:'Completed',archived:true},ids:['fixture']});assert.equal(archived.significantNewCandidate,false);assert.equal(archived.archiveExcluded,true);
});
test('shadow combined stages never establish construction; expiration is review only',()=>{
 const p={id:'fixture',status:'Approved',revision:1},r=shadowFinding(shadowSources[1],{attributes:{OBJECTID:1,ProjectName:'Fixture',ProjectOverallStatus:'Zoning Compliance, Permitting and Construction'}},{},{project:p,ids:['fixture'],approvalPolicy:{due_at:1,approval_date:'2020-01-01',approval_evidence:{}}});assert.equal(r.proposed.status,null);assert.equal(r.potentialExpiration.action,'review_only');assert.equal(summarizeShadow([r]).archived,0);
 const future=shadowFinding(shadowSources[1],{attributes:{OBJECTID:1,ProjectName:'Fixture'}},{},{project:p,ids:['fixture'],approvalPolicy:{due_at:1,exception_until:Date.now()+86400000}});assert.equal(future.potentialExpiration,undefined);
});
test('Chapel Hill shadow withholds duplicate dated approvals and incomplete history',()=>{
 const feature={attributes:{OBJECTID:1,ProjectName:'Fixture',Application1:'Fixture zoning',Application1ReviewStatus:'Approved',Application1ApprovalDate:1792627200000}},context={project:{id:'fixture'},ids:['fixture'],activity:[{type:'Application Approval',event_date:'2026-10-22'}]};
 const r=shadowFinding(shadowSources[1],feature,{},context);assert.equal(r.duplicateMilestone,true);assert.equal(r.proposed.timeline,null);
 assert.equal(shadowFinding(shadowSources[1],feature,{},{...context,activity:[],activityComplete:false}).proposed.timeline,null);
});
