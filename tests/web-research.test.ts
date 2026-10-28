import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {Store} from '../server/accounts/store';import {WebResearch,webLimits} from '../server/research/web';import {ResearchService} from '../server/research/service';
function fixture(fn:(s:Store,w:WebResearch)=>void){const dir=mkdtempSync(join(tmpdir(),'bw-web-'));const s=new Store(join(dir,'test.sqlite'));try{fn(s,new WebResearch(s));}finally{s.close();rmSync(dir,{recursive:true,force:true});}}
const now=Date.parse('2026-10-26T18:00:00Z');
const finding=(area='Greenville')=>({url:'https://example.org/development?utm_source=mail',title:'Developer announcement',sourceType:'developer' as const,publishedAt:'2026-10-01',verifiedAt:'2026-10-26',projectName:'Riverline Commons',area,summary:'Developer reports a proposed expansion. Construction commencement is not established.',claim:'proposed' as const});
test('area queries are cached and daily reservations stop exactly at budget',()=>fixture((s,w)=>{
 const first=w.plan(['Greenville'],now);assert.equal(first.queries.length,2);assert.equal(w.plan(['Greenville'],now).queries.length,0);
 assert.equal(w.plan(Array.from({length:30},(_,i)=>'County '+i),now).queries.length,22);assert.equal(w.plan(['Other'],now).queries.length,0);assert.equal(w.summary(now).dailyUsed,webLimits.dailyQueries);
}));
test('monthly budget spans days and cached empty results avoid repeated searches',()=>fixture((s,w)=>{
 const start=Date.parse('2026-10-01T18:00:00Z');for(let d=0;d<9;d++)w.plan(Array.from({length:12},(_,i)=>`Area ${d}-${i}`),start+d*86400000);
 assert.equal(w.summary(start+9*86400000).monthlyUsed,200);assert.equal(w.plan(['Fresh area'],start+9*86400000).queries.length,0);
}));
test('web evidence enters private review once without mutating projects, approval clocks or history',()=>fixture((s,w)=>{
 const original=s.list()[0];const record={...finding(),projectName:original.name};const before=s.all('SELECT * FROM projects'),history=s.all('SELECT * FROM history'),policy=s.all('SELECT * FROM approval_policy');const q=w.plan(['Greenville'],now).queries[0];
 assert.equal(w.record(q.id,[record],now).added,1);assert.equal(w.record(q.id,[record],now).added,0);assert.deepEqual(s.all('SELECT * FROM projects'),before);assert.deepEqual(s.all('SELECT * FROM history'),history);assert.deepEqual(s.all('SELECT * FROM approval_policy'),policy);
 const proposal=s.one('SELECT * FROM research_proposals');const data=JSON.parse(proposal.data);assert.equal(data.evidence.publishedAt,'2026-10-01');assert.equal(data.evidence.url,'https://example.org/development');assert.equal(data.reportedMilestone,'proposed');assert.ok(data.possibleMatches.some((p:any)=>p.id===original.id));
 assert.throws(()=>new ResearchService(s).preview(proposal.id,'admin'),/manual classification/);
 const q2=w.plan(['Greenville'],now+8*86400000).queries[0];assert.equal(w.record(q2.id,[record],now+8*86400000).added,0);
}));
test('unreserved, excessive, insecure or future-dated findings fail closed',()=>fixture((s,w)=>{
 assert.throws(()=>w.record('invented',[finding()],now));const q=w.plan(['Greenville'],now).queries[0];
 for(const bad of [{...finding(),url:'http://example.org'},{...finding(),verifiedAt:'2027-01-01'},{...finding(),area:'Somewhere else'}])assert.throws(()=>w.record(q.id,[bad],now));
 assert.throws(()=>w.record(q.id,Array.from({length:9},()=>finding()),now));assert.equal(s.one('SELECT count(*) AS n FROM research_proposals').n,0);
}));
