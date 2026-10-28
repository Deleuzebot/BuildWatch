import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {parsePage,sourcePage,validateSourceSchema,isoDate} from '../server/maintenance/adapters';
import {robotsUnavailableAllows,robotsAllows,runState} from '../server/maintenance/worker';
import {evaluateFinding} from '../server/maintenance/policy';
const mappings=JSON.parse(readFileSync('config/maintenance/nc-mappings.json','utf8'));
const fixtures=JSON.parse(readFileSync('tests/fixtures/nc-mappings.json','utf8'));
const source=(m:any):any=>({id:m.sourceId,state:'NC',url:m.url,authority:'official',enabled:true,autopublish:false,jurisdiction:'NC fixture',adapter:'arcgis',config:m.config});
test('real municipal schemas decode configured names and retain source-specific dates without resetting milestones',()=>{
 for(const f of fixtures){const s=source(mappings.find((m:any)=>m.sourceId===f.sourceId));validateSourceSchema(s,f.metadata);const finding=parsePage(s,JSON.stringify(f.page)).findings[0];if(s.config.sourceRole!=='supporting_only')assert.ok(finding.name,s.url);assert.equal(finding.eventDate,undefined);assert.equal(evaluateFinding(finding,s,null).eligible,false);}
});
test('Gastonia official codes decode approvals and proposals while withdrawn remains unresolved',()=>{
 const m=mappings.find((v:any)=>v.url.includes('ResidentialDevelopments')),s=source(m),fixture=fixtures.find((v:any)=>v.sourceId===s.id);
 const f=parsePage(s,JSON.stringify(fixture.page)).findings[0];assert.equal(f.status,'Approved');assert.ok(f.sourceDates?.approvedAt);
 const page=structuredClone(fixture.page);page.features[0].attributes.STATUS='W';const withdrawn=parsePage(s,JSON.stringify(page)).findings[0];assert.equal(withdrawn.status,undefined);assert.equal(withdrawn.statusLabel,'Withdrawn');
});
test('Brunswick construction authorization and Fayetteville physical phase preserve distinct milestones',()=>{
 const br=source(mappings.find((v:any)=>v.url.includes('Commercial_Development')));
 const b=parsePage(br,JSON.stringify({features:[{attributes:{FID:1,Name:'Example commercial development',Status:'Step 4: All Permits Issued (Approved for Construction)'}}]})).findings[0];assert.equal(b.status,'Approved');assert.equal(b.eventDate,undefined);
 const fy=source(mappings.find((v:any)=>v.url.includes('InfrastructureProjects_allfundedprojects')));
 const f=parsePage(fy,JSON.stringify({features:[{attributes:{OBJECTID:1,projname:'Example public building',projstatus:'Board Authorized',projphase:'Construction',actstart:1790812800000}}]})).findings[0];assert.equal(f.status,'Under construction');assert.equal(f.sourceFacts?.administrativeStatus,'Board Authorized');assert.ok(f.sourceDates?.actualProjectStartAt);assert.equal(f.eventDate,undefined);
});
test('Wake Forest active/closed and Winston-Salem board dates do not invent completion or meeting events',()=>{
 const wf=source(mappings.find((v:any)=>v.url.includes('Active_Developments_2026')));
 for(const status of['Active','Closed'])assert.equal(parsePage(wf,JSON.stringify({features:[{attributes:{OBJECTID:1,development_name:'Example apartments',status}}]})).findings[0].status,undefined);
 const ws=source(mappings.find((v:any)=>v.url.includes('XAnuVx6VEMybNvyd')));const f=parsePage(ws,JSON.stringify({features:[{attributes:{OBJECTID:1,Docket:'P-123',Planning_Board_Date:1790812800000}}]})).findings[0];assert.equal(f.name,'P-123');assert.ok(f.sourceDates?.planningBoardDate);assert.equal(f.meeting,undefined);
});
test('Wilmington construction is physical phase while Sanford approvals remain application scope',()=>{
 const wi=source(mappings.find((v:any)=>v.url.includes('CIPACE_2026Updates')));assert.equal(parsePage(wi,JSON.stringify({features:[{attributes:{OBJECTID:1,ProjectName:'Public facility',ProjectPhase:'Construction'}}]})).findings[0].status,'Under construction');
 const sa=source(mappings.find((v:any)=>v.url.includes('Development_Map__October_2026')));const f=parsePage(sa,JSON.stringify({features:[{attributes:{OBJECTID:1,Name:'Example subdivision',Status:'Preliminary Plat Approved'}}]})).findings[0];assert.equal(f.status,'Approved');assert.equal(f.wholeDevelopment,false);assert.equal(f.eventDate,undefined);
});
test('Greensboro permits and historical Harnett records cannot become independent developments',()=>{
 for(const s of mappings.map(source).filter((v:any)=>v.config.sourceRole==='supporting_only'||v.config.supportingRecordTypes?.length)){
  const f=fixtures.find((v:any)=>v.sourceId===s.id);const finding=parsePage(s,JSON.stringify(f.page)).findings[0];const result=evaluateFinding({...finding,name:'Example apartments',status:'Approved',eventDate:'2026-10-01',principalUseVerified:true,wholeDevelopment:true,locationVerified:true,latitude:35,longitude:-80},{...s,autopublish:true},null);assert.equal(result.eligible,false);assert.ok(result.reasons.some(v=>/supporting evidence|Administrative or historical/.test(v)));}
});
test('highway schedule years and line geometry do not create fabricated dates or point pins',()=>{
 assert.equal(isoDate(2027),undefined);const m=mappings.find((v:any)=>v.url.includes('NCDOT_STIP'));const s=source(m),f=fixtures.find((v:any)=>v.sourceId===s.id);const finding=parsePage(s,JSON.stringify(f.page)).findings[0];assert.equal(finding.eventDate,undefined);assert.deepEqual(finding.sourceDates,{});assert.equal(finding.latitude,null);assert.equal(finding.locationVerified,false);
});
test('source queries select required fields and use verified stable recent-first ordering',()=>{
 const s=source(mappings.find((v:any)=>v.url.includes('AccelaPlanningView'))),u=new URL(sourcePage(s,50));assert.ok(u.searchParams.get('outFields')?.includes('record_name'));assert.ok(!u.searchParams.get('outFields')?.includes('balance_due'));assert.equal(u.searchParams.get('orderByFields'),'record_status_date DESC, objectid ASC');assert.equal(u.searchParams.get('resultOffset'),'50');
});
test('unavailable robots file is distinct from explicit restrictions and actual API authorization',()=>{
 const s=source(mappings[0]);assert.equal(robotsUnavailableAllows(s,'Official source HTTP 403'),true);assert.equal(robotsUnavailableAllows({...s,adapter:'document'},'Official source HTTP 403'),false);for(const code of[401,429,500,503])assert.equal(robotsUnavailableAllows(s,'Official source HTTP '+code),false);assert.equal(robotsAllows('User-agent: *\nDisallow: /server/rest','/server/rest/services/query'),false);
});
test('parcel-only reference source performs no retrieval or publication',async()=>{
 const s=source(mappings.find((v:any)=>v.config.sourceRole==='location_reference'));const calls:string[]=[];const rpc:any=async(action:string)=>{calls.push(action);if(action==='claim')return {status:'running',run:{id:'r',lease:'l'},state:{max_seconds:40,max_requests:8,max_records:50},sources:[s]};return {};};const r=await runState(rpc,{state:'NC',mode:'initial',dryRun:true,key:'parcel-test',onlySource:s.id},async()=>{throw Error('Parcel feed must not be downloaded');});assert.equal(r.referenceSourcesSkipped,1);assert.equal(r.sourceRecords,0);assert.ok(!calls.includes('finding'));
});
test('pilot source labels survive record-budget checkpoints',async()=>{
 const s=source(mappings[0]);const rpc:any=async(action:string)=>action==='claim'?{status:'running',run:{id:'r',lease:'l'},state:{max_seconds:40,max_requests:1,max_records:50},sources:[s]}:{};
 const result=await runState(rpc,{state:'NC',mode:'initial',dryRun:true,key:'label-test',onlySource:s.id},async()=>new Response('',{status:404}));assert.equal(result.status,'partially_completed');assert.equal(result.pilotSource.id,s.id);assert.match(result.coverage,/not statewide/);
});
