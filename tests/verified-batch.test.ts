import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../server/accounts/store';
import {importVerifiedBatch} from '../server/imports/verified-batch';
const item=(id:string)=>({project:{id,name:id,address:'100 Main Street, Asheville, NC',neighborhood:'Downtown',category:'Housing',description:'New 80-home development.',developer:'Source developer',homes:80,completion:'Not announced',status:'Proposed',latitude:35.59,longitude:-82.55,state:'NC',county:'Buncombe',city:'Asheville',evidenceType:'municipal',sources:[{title:'Official source',url:'https://www.ashevillenc.gov/'}],meetings:[]},approval:null,schedules:[],evidence:{url:'https://www.ashevillenc.gov/',externalId:id}});
function fixture(fn:(s:Store)=>void){const folder=mkdtempSync(join(tmpdir(),'bw-verified-'));const s=new Store(join(folder,'test.sqlite'));try{fn(s);}finally{s.close();rmSync(folder,{recursive:true,force:true});}}
const batch=(items:any[])=>({version:1,id:'nc-coverage-test-2026',created:'2026-10-26T12:00:00Z',items,review:[]});
test('verified additions preserve originals, index immediately and rerun without duplicates',()=>fixture(s=>{
 const original=s.all('SELECT * FROM projects ORDER BY id');const b=batch([item('test-development')]);
 assert.equal(importVerifiedBatch(s,b).added,1);assert.deepEqual(s.all('SELECT * FROM projects ORDER BY id'),original);
 assert.equal(importVerifiedBatch(s,b,true).publicAdditions,1);assert.ok(s.one('SELECT 1 FROM active_map_index WHERE id=?','test-development'));
 assert.equal(importVerifiedBatch(s,b,true).added,0);for(const row of original)assert.deepEqual(s.one('SELECT * FROM projects WHERE id=?',row.id),row);
 assert.equal(s.one('SELECT count(*) AS n FROM history WHERE project_id=?','test-development').n,1);
}));
test('approval expiry requires evidence and hides expired additions',()=>fixture(s=>{
 const x:any=item('expired');x.project.status='Approved';assert.throws(()=>importVerifiedBatch(s,batch([x]),true),/approval date/);
 x.approval={date:'2024-01-01',url:x.evidence.url,quote:'Decision: approved 2024-01-01'};assert.throws(()=>importVerifiedBatch(s,batch([x]),true),/Expired/);
 x.project.archived=true;importVerifiedBatch(s,batch([x]),true);assert.ok(s.project('expired'));assert.equal(s.one('SELECT 1 FROM active_map_index WHERE id=?','expired'),undefined);
}));
test('confirmed construction is not expired by an old planning approval',()=>fixture(s=>{
 const x:any=item('building-now');x.project.status='Under construction';x.approval={date:'2024-01-01',url:x.evidence.url,quote:'Approved 2024-01-01; source currently reports 28 units under construction.'};
 assert.equal(importVerifiedBatch(s,batch([x]),true).publicAdditions,1);assert.ok(s.one('SELECT 1 FROM active_map_index WHERE id=?','building-now'));
}));
test('failed batch rolls back projects, history, metadata and review',()=>fixture(s=>{
 s.db.exec("CREATE TRIGGER reject_fixture BEFORE INSERT ON projects WHEN new.id='reject-me' BEGIN SELECT RAISE(ABORT,'fixture failure'); END;");
 assert.throws(()=>importVerifiedBatch(s,batch([item('first'),item('reject-me')]),true),/fixture failure/);
 assert.equal(s.project('first'),undefined);assert.equal(s.one('SELECT count(*) AS n FROM verified_import_batches').n,0);assert.equal(s.one('SELECT count(*) AS n FROM history WHERE project_id=?','first').n,0);
}));
test('terminal, permit-only, duplicate IDs and deleted source IDs cannot publish',()=>fixture(s=>{
 const x:any=item('blocked');x.project.status='Completed';assert.throws(()=>importVerifiedBatch(s,batch([x]),true));x.project.status='Proposed';x.project.evidenceType='permit';assert.throws(()=>importVerifiedBatch(s,batch([x]),true));x.project.evidenceType='municipal';assert.throws(()=>importVerifiedBatch(s,batch([x,x]),true));
 s.run('INSERT INTO deleted_project_ids VALUES(?,?,?,?)','blocked','test',Date.now(),'[]');assert.equal(importVerifiedBatch(s,batch([x]),true).tombstoned,1);assert.equal(s.project('blocked'),undefined);
}));
test('matching archived source is held for administrator review without republishing',()=>fixture(s=>{
 const original:any=item('original');original.project.archived=true;original.project.permitNumbers=['SHARED-123'];s.publish(original.project,'fixture');
 const candidate:any=item('new-source');candidate.project.permitNumbers=['SHARED-123'];const result=importVerifiedBatch(s,batch([candidate]),true);
 assert.equal(result.added,0);assert.equal(result.review,1);assert.equal(s.project('new-source'),undefined);assert.equal(s.one('SELECT count(*) AS n FROM research_proposals').n,1);
}));
test('independently verified development can coexist with a hidden supporting-only permit without linking or merging',()=>fixture(s=>{
 const permit:any=item('private-stormwater');permit.project.evidenceType='permit';permit.project.jurisdiction='NC DEQ construction stormwater';permit.project.permitNumbers=['NCC-EXACT'];s.publish(permit.project,'fixture');
 s.run("INSERT INTO archived_projects(project_id,reason,actor) VALUES(?,'supporting_permit_only','fixture')",permit.project.id);
 const original=s.one('SELECT * FROM projects WHERE id=?',permit.project.id);const candidate:any=item('verified-development');candidate.project.permitNumbers=['NCC-EXACT'];
 const result=importVerifiedBatch(s,batch([candidate]),true);assert.equal(result.publicAdditions,1);assert.equal(result.review,1);assert.ok(s.one('SELECT 1 FROM active_map_index WHERE id=?',candidate.project.id));assert.equal(s.one('SELECT 1 FROM active_map_index WHERE id=?',permit.project.id),undefined);
 assert.deepEqual(s.one('SELECT * FROM projects WHERE id=?',permit.project.id),original);assert.equal(s.all('SELECT * FROM project_relationships').length,0);
}));
test('a supporting permit never hides a second matching completed or public development',()=>fixture(s=>{
 for(const id of ['public-development','private-stormwater']){const x:any=item(id);x.project.permitNumbers=['SHARED-ID'];if(id.startsWith('private')){x.project.evidenceType='permit';x.project.jurisdiction='NC DEQ construction stormwater';}else x.project.status='Completed';s.publish(x.project,'fixture');}
 s.run("INSERT INTO archived_projects(project_id,reason,actor) VALUES('private-stormwater','supporting_permit_only','fixture')");
 const x:any=item('new-source');x.project.permitNumbers=['SHARED-ID'];const result=importVerifiedBatch(s,batch([x]),true);assert.equal(result.added,0);assert.equal(result.review,2);assert.equal(s.project('new-source'),undefined);
}));
test('two incoming records for the same named site cannot create two public markers',()=>fixture(s=>{
 const a:any=item('first-source'),b:any=item('second-source');b.project.name=a.project.name;
 const result=importVerifiedBatch(s,batch([a,b]),true);assert.equal(result.added,1);assert.equal(result.review,1);assert.equal(s.project('second-source'),undefined);
}));
