import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {roadDecision} from '../server/roads/policy';import {Store} from '../server/accounts/store';import {projects,type Project} from '../src/data/projects';
const road=(description:string,extra:Partial<Project>={}):Project=>({...projects[0],id:'road-test',name:'Transportation project',category:'Transportation',status:'Proposed',developer:'NCDOT',description,meetings:[],sources:[{title:'Official construction scope',url:'https://example.gov/project'}],...extra});
test('major-road policy uses construction scope and regional scale, never interstate proximity or budget alone',()=>{
 for(const text of ['I-40 resurfacing and guardrail replacement','I-85 interchange lighting replacement','I-95 widen shoulders at Exit 20','NC 50 small intersection improvements, $100 million','US 70 replace a local bridge over a creek','NC 55 widen turn lane for 400 feet','SR 1001 widen to four lanes','I-40 bridge deck repair','NC 152 roundabout from east of I-85 interchange to Timberfield Trail','Future connector road from I-26 interchange to roundabout'])assert.equal(roadDecision(road(text)).qualifies,false,text);
 for(const text of ['I-40 widen freeway to six lanes','I-95 reconstruct interchange','I-85 replace bridge over river','US 70 widen to four lanes for 8 miles','NC 55 reconstruct regional bypass','Construct new limited-access expressway connecting two regional centers','NC 42 reconstruct highway, $70 million, 30 months of construction'])assert.equal(roadDecision(road(text)).qualifies,true,text);
});
test('non-road developments and independent greenway, railway and airport work remain untouched',()=>{
 for(const p of [road('Warehouse on Interstate 40 with road widening conditions',{category:'Industrial',developer:'Private',id:'warehouse'}),road('New hotel at 375 Long Shoals Road',{id:'hotel',developer:'Private'}),road('Construct pedestrian bridge and greenway along NC 55'),road('Construct rail grade separation',{id:'nc-dot-planned-p-5706'}),road('Extend airport runway'),road('Bridge over Crabtree Creek on Turkey Creek TRAI L in State Park')])assert.equal(roadDecision(p).road,false,p.description);
});
test('raw imports, editor updates and overrides archive roadwork atomically; scope corrections, reopen and rollback preserve data',()=>{
 const dir=mkdtempSync(join(tmpdir(),'bw-roads-')),seed=join(dir,'seed.json'),file=join(dir,'db.sqlite');writeFileSync(seed,JSON.stringify([road('I-40 resurfacing'),road('Housing at NC 55',{id:'homes',category:'Housing',developer:'Private'})]));let s=new Store(file,seed);
 try{
  const raw=s.originalProject('road-test');assert.equal(s.publicEligible('road-test'),false);assert.equal(s.one('SELECT reason FROM archived_projects WHERE project_id=?','road-test').reason,'road_not_significant');assert.equal(s.publicEligible('homes'),true);
  s.run('INSERT INTO projects VALUES(?,?,1)','imported',JSON.stringify(road('US 70 traffic signal replacement',{id:'imported'})));assert.equal(s.publicEligible('imported'),false);
  s.run('DELETE FROM archived_projects WHERE project_id=?','imported');assert.equal(s.publicEligible('imported'),false,'deleting archive metadata cannot bypass public index policy');
  s.publish({...s.projectProfile('road-test'),description:'I-40 widen to six lanes for 12 miles'},'admin');assert.equal(s.publicEligible('road-test'),true);assert.equal(s.one('SELECT 1 FROM archived_projects WHERE project_id=?','road-test'),undefined);
  const original=s.originalProject('road-test');s.run('INSERT INTO project_overrides VALUES(?,?,?)','road-test',JSON.stringify({...original,description:'I-40 resurfacing',revision:3}),3);assert.equal(s.publicEligible('road-test'),false);assert.deepEqual(s.originalProject('road-test'),original);
  s.run('DELETE FROM project_overrides WHERE project_id=?','road-test');assert.equal(s.publicEligible('road-test'),true);
  assert.throws(()=>s.tx(()=>{s.run('INSERT INTO projects VALUES(?,?,1)','rollback',JSON.stringify(road('NC 55 roundabout',{id:'rollback'})));throw Error('rollback');}),/rollback/);assert.equal(s.originalProject('rollback'),undefined);assert.equal(s.one('SELECT 1 FROM archived_projects WHERE project_id=?','rollback'),undefined);
  assert.ok(raw);const count=s.one('SELECT count(*) n FROM archive_events').n;s.close();s=new Store(file);assert.equal(s.publicEligible('road-test'),true);assert.equal(s.one('SELECT count(*) n FROM archive_events').n,count,'opening database is idempotent');assert.deepEqual(s.db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
