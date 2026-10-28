import test from'node:test';import assert from'node:assert/strict';
import mapping from'../config/maintenance/hickory.json';
import fixture from'./fixtures/hickory.json';
import{parsePage,validateSourceSchema}from'../server/maintenance/adapters';
import{evaluateFinding,type Source}from'../server/maintenance/policy';
const source:Source={id:mapping.sourceId,state:'NC',jurisdiction:'Hickory',url:mapping.url,adapter:'arcgis',authority:'official',enabled:true,autopublish:false,config:mapping.config};
const findings=()=>parsePage(source,JSON.stringify({features:fixture.features})).findings;
test('real Hickory names, developers and coded categories decode without losing original evidence',()=>{
 validateSourceSchema(source,fixture.metadata);
 const [gates,sweetwater,oneNorth]=findings();
 assert.equal(gates.name,'The Gates at Highland');assert.equal(gates.developer,'Fleetwood & Henline');
 assert.equal(gates.category,'Residential');assert.equal(gates.rawCategory,'Res');
 assert.equal(gates.sourceFacts?.units,192);assert.equal(gates.sourceFacts?.residentialUseLabel,'Apartments');
 assert.equal(oneNorth.category,'Mixed-Use');assert.equal(sweetwater.status,'Under construction');
 assert.match(gates.quote,/"P_Name":"The Gates at Highland"/);assert.match(gates.url,/objectIds=425/);
});
test('Final is not completion, permit/submission dates are not approval or construction dates',()=>{
 const [gates,,oneNorth]=findings();
 assert.equal(gates.status,undefined);assert.equal(gates.statusLabel,'Final');assert.equal(gates.rawStatus,'Fin');
 assert.equal(gates.eventDate,undefined);assert.equal(gates.sourceDates?.permitIssuedAt,'2018-03-18T04:00:00.000Z');
 assert.equal(oneNorth.sourceDates?.plansSubmittedAt,'2019-10-01T04:00:00.000Z');
 assert.equal(oneNorth.eventDate,undefined);assert.equal(oneNorth.publishedAt,undefined);
});
test('source polygons are retained as footprint evidence and never invented as point locations',()=>{
 const f=findings()[0];assert.equal(f.latitude,null);assert.equal(f.longitude,null);assert.equal(f.locationVerified,false);
 assert.equal(f.locationEvidence?.type,'polygon');assert.ok(f.locationEvidence?.bounds);assert.equal(f.address,'');
 assert.equal(evaluateFinding(f,source,null).eligible,false);
});
test('conflicting official comments stay under review instead of overriding the source status',()=>{
 const preston=findings()[3];assert.equal(preston.name,'Preston Ridge Phase 1');assert.equal(preston.status,'Under construction');
 assert.ok(preston.reviewNotes?.some(s=>s.includes('lapsed')));assert.equal(evaluateFinding(preston,source,null).eligible,false);
});
test('mapping schema drift fails explicitly and does not revert to blank findings',()=>{
 const missing=structuredClone(fixture.metadata);missing.fields=missing.fields.filter(f=>f.name!=='P_Name');assert.throws(()=>validateSourceSchema(source,missing),/missing P_Name/);
 const changed=structuredClone(fixture.metadata);const status=changed.fields.find(f=>f.name==='Status')!;status.domain!.codedValues![0].name='Changed meaning';
 assert.throws(()=>validateSourceSchema(source,changed),/coded meaning changed/);
});
