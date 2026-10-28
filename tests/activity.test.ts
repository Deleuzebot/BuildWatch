import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {Store} from '../server/accounts/store';import {MapQueries,parseFilters} from '../server/map/queries';import {projects,type Project} from '../src/data/projects';import {recordEvents,policyEvents} from '../server/activity/evidence';import {activitySince,activityFromPosition,activityPosition,activityDays,validActivityPeriod} from '../src/lib/activity';
const source='https://example.gov/official-project';const p=(id:string,date?:string):Project=>({...projects[0],id,name:'Apartment project '+id,status:'Proposed',category:'Housing',description:'Housing proposal',homes:20,meetings:[],sources:[{title:'Official source',url:source}],sourceStatus:'Proposed',sourceStatusDate:date});
test('continuous activity scale preserves calendar marks and accepts intermediate windows',()=>{
 const values=Array.from({length:101},(_,i)=>activityFromPosition(i/100));assert.ok(new Set(values).size>90);assert.equal(activityFromPosition(0),'30d');assert.equal(activityFromPosition(1/3),'3m');assert.equal(activityFromPosition(2/3),'1y');assert.equal(activityFromPosition(1),'5y');
 for(let i=1;i<values.length;i++)assert.ok(activityDays(values[i])>=activityDays(values[i-1]));assert.ok(Math.abs(activityPosition(activityFromPosition(.5))-.5)<.005);assert.ok(validActivityPeriod('200d'));assert.equal(validActivityPeriod('1d'),false);assert.equal(validActivityPeriod('999999999d'),false);assert.equal(parseFilters(new URLSearchParams('activity=200d')).activity,'200d');
});
test('activity derives only documented lifecycle dates; imports, checks, generic active statuses and undated construction never count',()=>{
 assert.deepEqual(recordEvents({...p('old'),reviewedAt:'2026-10-27',sourceAsOf:'2026-10-27'}),[]);
 assert.deepEqual(recordEvents({...p('construction','2026-10-25'),status:'Under construction',sourceStatus:'Under Construction'}),[]);
 assert.deepEqual(recordEvents(p('bad','2026-02-30')),[]);assert.deepEqual(recordEvents({...p('bad','2026-10-26'),sourceStatus:'Active'}),[]);
 assert.equal(recordEvents({...p('review','2026-10-25'),sourceStatus:'TRC Review'})[0].type,'Review Update');
 assert.equal(policyEvents(null,[{kind:'start',date:'2026',url:source,quote:'Construction in 2026'}]).length,0);
 assert.equal(policyEvents(null,[{kind:'start',date:'2026-10-25',url:source,quote:'Construction commenced October 25'}])[0].type,'Construction Started');
 assert.equal(activitySince('3m',Date.parse('2026-05-31T12:00:00Z')),Date.parse('2026-02-28T00:00:00Z'));assert.equal(activitySince('1y',Date.parse('2024-02-29T12:00:00Z')),Date.parse('2023-02-28T00:00:00Z'));
});
test('all four windows compose with types, status, clusters and visibility; technical edits do not create activity',()=>{
 const dir=mkdtempSync(join(tmpdir(),'bw-activity-')),file=join(dir,'seed.json'),date=(age:number)=>new Date(Date.now()-age*86400000).toISOString().slice(0,10);
 const seed=[10,60,200,1000,2000].map(age=>p(String(age),date(age)));seed.push(p('unknown'));seed.push({...p('archived',date(1)),archived:true});seed.push({...p('completed',date(1)),status:'Completed'});seed.push(p('future',date(-10)));writeFileSync(file,JSON.stringify(seed));let s=new Store(file+'.sqlite',file);
 try{const q=new MapQueries(s.db);for(const[period,count]of [['30d',1],['3m',2],['1y',3],['5y',7]] as const){const filters=parseFilters(new URLSearchParams({activity:period,types:'Residential',status:'Proposed'}));assert.equal(q.browse(filters).total,count);const map=q.map(filters,{west:-180,east:180,south:-85,north:85},7);assert.equal(map.total,count);assert.equal(map.nodes.reduce((n,p)=>n+p.count,0),count);}
 assert.equal(q.browse({}).total,7);assert.equal(q.browse({activity:'5y',status:'Approved'}).total,0);assert.throws(()=>parseFilters(new URLSearchParams('activity=garbage')),/activity period/);
 const before=s.all('SELECT * FROM project_activity WHERE project_id=?','10');s.publish({...s.project('10')!,description:'Housing proposal with a typo corrected',reviewedAt:date(0)},'admin');assert.deepEqual(s.all('SELECT * FROM project_activity WHERE project_id=?','10'),before);
 s.publish({...s.project('10')!,sourceStatus:'TRC Review',sourceStatusDate:date(0),status:'In review'},'admin');assert.equal(s.all('SELECT * FROM project_activity WHERE project_id=?','10').length,2);
 s.run('INSERT INTO approval_policy VALUES(?,?,?,?,?,?,?,?,?,?,?)','10',date(2000),Date.now()-2000*86400000,JSON.stringify({date:date(2000),url:source,quote:'Official approval'}),'[]',null,Date.now()-1635*86400000,Date.now()-1635*86400000,'','admin',Date.now());s.publish({...s.project('10')!,status:'Approved'},'admin');assert.equal(s.publicEligible('10'),false);assert.equal(q.browse({activity:'30d'}).total,0);
 const events=s.one('SELECT count(*) n FROM project_activity').n;s.close();s=new Store(file+'.sqlite');assert.equal(s.one('SELECT count(*) n FROM project_activity').n,events);assert.deepEqual(s.db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
