import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {verifyIdentity,pointInOfficialPolygon,extractAgendaItems,agendaMeeting,proposeStructured} from '../server/maintenance/end-to-end';
import {parsePage,validateSourceSchema} from '../server/maintenance/adapters';
const evidence=JSON.parse(readFileSync('tests/fixtures/nc-e2e-evidence.json','utf8'));
const plan=JSON.parse(readFileSync('config/maintenance/nc-five-jurisdiction-plan.json','utf8'));
const findings=(city:string)=>{const c=evidence.structured.find((s:any)=>s.city===city),s=plan.find((p:any)=>p.name===city).source;validateSourceSchema(s,c.metadata);return parsePage(s,JSON.stringify(c.data),8).findings;};
test('manually checked official samples preserve IDs, names and typed action dates',()=>{
 const c=findings('Cary');assert.equal(c[0].externalId,'19-DP-6848');assert.equal(c[0].name,'1700 Medical Office Building & Fellowship Christ Church Expansion');assert.equal(c[0].rawStatus,'Active');assert.equal(c[0].status,undefined);assert.equal(c[6].name,'North Harrison Hotels');assert.equal(c[6].eventDate,undefined);
 const a=findings('Apex');assert.equal(a[0].externalId,'712');assert.equal(a[0].name,'NC Childrens Health Infrastructure');assert.equal(a[0].sourceDates?.applicationActionAt,'2026-10-22T00:00:00.000Z');assert.equal(a[0].sourceFacts?.applicationAction,'TRC Approved');assert.equal(a[0].eventDate,undefined);assert.equal(a[4].rawStatus,'Withdrawn');assert.equal(a[4].status,undefined);
 const h=findings('Huntersville');assert.equal(h[1].externalId,'12');assert.equal(h[1].name,'Bryton Single-Family Subdivision -- Revision');assert.equal(h[1].status,'Under construction');assert.deepEqual(h[1].sourceDates,{});
});
test('source identity cannot cross jurisdictions, changed names, terminal records or multiple matches',()=>{
 const f={externalId:'12',name:'Bryton'},p={id:'p',name:'Bryton',jurisdiction:'Huntersville',status:'Approved'};
 assert.equal(verifyIdentity(f,'Huntersville',{ids:['p'],project:p}).verified,true);
 for(const project of[{...p,jurisdiction:'Apex'},{...p,name:'Other project'},{...p,archived:true},{...p,status:'Completed'},{...p,status:'Cancelled'}])assert.equal(verifyIdentity(f,'Huntersville',{ids:['p'],project}).verified,false);
 assert.equal(verifyIdentity(f,'Huntersville',{ids:['p','q'],project:p}).verified,false);assert.equal(verifyIdentity(f,'Huntersville',{ids:[],project:p}).verified,false);
});
test('official polygons validate existing pins, including holes, and reject other coordinate systems',()=>{
 const geometry={rings:[[[0,0],[4,0],[4,4],[0,4],[0,0]],[[1,1],[3,1],[3,3],[1,3],[1,1]]]};
 assert.equal(pointInOfficialPolygon(.5,.5,geometry,4326),true);assert.equal(pointInOfficialPolygon(2,2,geometry,4326),false);assert.equal(pointInOfficialPolygon(5,5,geometry,4326),false);assert.equal(pointInOfficialPolygon(0,2,geometry,4326),true);assert.equal(pointInOfficialPolygon(.5,.5,geometry,3857),undefined);
});
test('real agenda requests and staff motion templates are never reported as confirmed approvals',()=>{
 const b=evidence.documents.find((d:any)=>d.city==='Burlington'),k=evidence.documents.find((d:any)=>d.city==='Kannapolis');
 const bi=extractAgendaItems(b.pages);assert.deepEqual(bi.map(i=>i.caseId).sort(),['Rezoning 26-007','Rezoning 26-010']);
 assert.ok(bi.every(i=>!i.confirmedDecision));const request=bi.find(i=>i.caseId==='Rezoning 26-010')!;assert.ok(request.addresses.includes('3383 Garden Road'));
 const ki=extractAgendaItems(k.pages);assert.equal(ki.length,1);assert.equal(ki[0].caseId,'CZ-2025-05');assert.equal(ki[0].units,52);assert.equal(ki[0].principalUse,'Residential');assert.equal(ki[0].confirmedDecision,false);assert.ok(ki[0].addresses.includes('630 Irene Avenue'));assert.ok(!ki[0].addresses.includes('807 Sweet Gum Street'));
 assert.equal(agendaMeeting(b.pages,request,Date.parse('2026-10-29'))?.startsAt,'2026-10-26T23:00:00.000Z');assert.equal(agendaMeeting(b.pages,bi.find(i=>i.caseId==='Rezoning 26-007')!),null);
 assert.equal(agendaMeeting(k.pages,ki[0],Date.parse('2026-10-29'))?.startsAt,'2025-12-16T23:00:00.000Z');
});
test('separate cases in one page cannot leak units into another project',()=>{
 const items=extractAgendaItems([{page:1,text:'Case #CZ-2026-01: Request to rezone for a 20-unit multifamily development.\nCase #CZ-2026-02: Request to rezone for an office building.'}]);assert.equal(items[0].units,20);assert.equal(items[1].units,undefined);
});
test('a dated component approval can propose a scoped milestone, never reset the approval clock or insert a project',()=>{
 const f=findings('Apex')[0],p={id:'p',name:f.name,jurisdiction:'Apex',status:'Proposed',sourceStatusDate:'2025-01-01',sources:[]};
 const result=proposeStructured(f,'Apex',{ids:['p'],project:p},{inside:true,source:f.url});assert.equal(result.proposed.scopedMilestone?.date,'2026-10-22T00:00:00.000Z');assert.equal(result.proposed.scopedMilestone?.kind,'application_approval');assert.equal(result.proposed.approvalDateChange,null);assert.equal(result.proposed.pinChange,null);assert.equal(result.proposed.insertProject,false);assert.equal(result.automaticPublication,false);assert.equal(result.category,null);assert.equal(result.proposed.statusChange?.requiresAdministratorReview,true);
});
test('documented municipal mixed-use wording is recognized without rewriting its source description',()=>{
 const f=findings('Cary')[3],r=proposeStructured(f,'Cary',{ids:[],project:null},{source:f.url});assert.equal(r.category,'Mixed-Use');assert.equal(r.description,f.description);
});
