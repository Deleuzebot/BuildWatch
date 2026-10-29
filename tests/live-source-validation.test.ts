import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {LiveValidationSession} from '../server/maintenance/live-session';import {Budget,hash} from '../server/maintenance/policy';import {ResearchReader} from '../server/maintenance/research-reader';import {chapelEvidence,raleighEvidence,officialPoint,projectPageEvidence} from '../server/maintenance/live-evidence';
test('persistent live ledger prevents the twenty-first HTTP attempt, including after restart',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'bw-live-budget-'));let calls=0;
 try{writeFileSync(join(dir,'ledger.json'),JSON.stringify({cap:20,requests:Array.from({length:19},(_,i)=>({ordinal:i+1,url:'https://example.com/simulated-'+i})),responses:{},closed:false}));const transport:typeof fetch=async()=>{calls++;return new Response('User-agent: *\nAllow: /');};
  const first=new LiveValidationSession(dir,transport);await assert.rejects(()=>first.get('https://example.com/arcgis/rest/services/Pilot/FeatureServer/0?f=json'),/ceiling|cap/i);assert.equal(calls,1);assert.equal(JSON.parse(readFileSync(join(dir,'ledger.json'),'utf8')).requests.length,20);
  assert.throws(()=>new LiveValidationSession(dir,transport),/EEXIST/);first.release();const second=new LiveValidationSession(dir,transport);await assert.rejects(()=>second.get('https://example.com/arcgis/rest/services/Pilot/FeatureServer/0/query?f=json'),/ceiling|cap/i);assert.equal(calls,1);second.release();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('closed sessions can replay their own evidence but cannot issue another request',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'bw-live-closed-')),url='https://example.com/official-record';let calls=0;
 try{writeFileSync(join(dir,'body.json'),JSON.stringify({url,body:'official evidence',sha256:hash('official evidence'),retrievedAt:'2026-10-29T20:00:00Z'}));writeFileSync(join(dir,'ledger.json'),JSON.stringify({cap:20,requests:[],responses:{[url]:{file:'body.json'}},closed:true}));const s=new LiveValidationSession(dir,async()=>{calls++;throw Error('No HTTP permitted');});assert.equal((await s.get(url)).sessionReplay,true);await assert.rejects(()=>s.get(url+'/new'),/closed/);assert.equal(calls,0);}finally{rmSync(dir,{recursive:true,force:true});}
});
test('same-session robots cache preserves disallows, age limits and narrow ArcGIS fallback',()=>{
 const r=new ResearchReader(new Budget()),now=Date.now(),checkedAt=new Date(now).toISOString(),url='https://example.com/arcgis/rest/services/Pilot/FeatureServer/0';
 assert.equal(r.seedAccessPolicy(url,{url:'https://example.com/robots.txt',status:403,checkedAt},now),true);
 assert.equal(r.seedAccessPolicy('https://example.com/private-document',{url:'https://example.com/robots.txt',status:403,checkedAt},now),false);
 assert.equal(r.seedAccessPolicy(url,{url:'https://example.com/robots.txt',status:200,body:'User-agent: *\nDisallow: /',checkedAt},now+3600001),false);
 assert.equal(r.seedAccessPolicy(url,{url:'https://evil.example/robots.txt',status:200,body:'',checkedAt},now),false);
});
test('actual Raleigh narrative patterns override misleading mapped classes without promoting permit status',()=>{
 const apartment=raleighEvidence({workclassmapped:'Existing',proposedworkdescription:'Example is a new 30 unit Multifamily garden style apartment building. SPR-0001-2025',issueddate:1790162608000});assert.equal(apartment.significant,true);assert.equal(apartment.explicitUnits,30);assert.equal(apartment.event?.type,'Permit Issued');assert.equal(apartment.wholeProjectStatusChange,null);
 const industrial=raleighEvidence({workclassmapped:'Existing',proposedworkdescription:'At-Risk Foundation Only and undergrounds for new cGMP Warehouse addition of 18,000sf',statuscurrent:'Issued'});assert.equal(industrial.significant,true);assert.equal(industrial.supportingOnly,true);
 for(const proposedworkdescription of ['Full roof replacement of following apartment buildings','Repair Unit to previous layout prior to fire damage','Change of Use for Suite 120 / Unit #13 (150 sq ft) within existing multi-tenant warehouse building','New outdoor swimming pool for the Rosewood Apartments'])assert.equal(raleighEvidence({proposedworkdescription,housingunitstotal:1000,totalsqft:1000000}).eligibility,'excluded_minor_or_ancillary');
 assert.ok(raleighEvidence({proposedworkdescription:'MOBILE HOME SET UP',housingunitstotal:1680}).issues.some(v=>v.includes('implausible')));
 assert.ok(raleighEvidence({statuscurrent:'Complete',statuscurrentmapped:'Permit Issued'}).issues.some(v=>v.includes('conflict')));
});
test('Chapel Hill combined statuses, hearings and undated completion never imply terminal or construction events',()=>{
 const c=chapelEvidence({ProjectOverallStatus:'Zoning Compliance, Permitting and Construction',Application1:'Conditional Zoning',Application1ReviewStatus:'Under Staff Review'});assert.equal(c.wholeProjectStatusChange,null);assert.equal(c.milestones.length,0);
 assert.equal(chapelEvidence({ProjectOverallStatus:'Withdrawn or Denied'}).wholeProjectStatusChange,null);
 assert.equal(chapelEvidence({ProjectOverallStatus:'Development Complete'}).milestones.length,0);
 const approval=chapelEvidence({Application1:'Conditional Zoning',Application1ReviewStatus:'Approved',Application1ApprovalDate:1787788800000});assert.equal(approval.milestones[0].scope,'application_only');assert.equal(approval.approvalDateChange,null);
 assert.equal(officialPoint({x:-79.05,y:35.96},{wkid:4326}).verified,true);assert.equal(officialPoint({x:0,y:0},{wkid:4326}).verified,false);
});
test('official project-page description and hearing dates are extracted without inventing a decision',()=>{
 const p=projectPageEvidence('<p>Project Address: 1165 Weaver Dairy Road</p><p>Project Description: Develop a vacant lot into space for businesses and up to 12 homes.</p><p>Project Status: Zoning Compliance, Permitting and Construction</p><h2>Public Meeting Schedule</h2><p>Town Council Hearing and Council Considers Action February 25, 2026 at 6 PM</p><h2>Application Materials</h2><p>CZD-25-5 ZCP-26-23</p>');
 assert.equal(p.description,'Develop a vacant lot into space for businesses and up to 12 homes.');assert.equal(p.meetings[0].date,'2026-02-25');assert.equal(p.meetings[0].decisionConfirmed,false);assert.deepEqual(p.applicationIdentifiers,['CZD-25-5','ZCP-26-23']);assert.equal(p.wholeProjectDecisionConfirmed,false);
 assert.equal(projectPageEvidence('Public Meeting Schedule February 30, 2026 at 6 PM Application Materials').meetings.length,0);
});
