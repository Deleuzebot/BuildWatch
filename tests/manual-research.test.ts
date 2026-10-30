import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {manualMilestonePreview} from '../server/research/manual-preview';
test('native profiles share the public cloud backend without private credentials',()=>{
 const c=JSON.parse(readFileSync('config/public-web.json','utf8')),build=JSON.parse(readFileSync('eas.json','utf8')).build;
 for(const p of Object.values(build) as any[]){assert.equal(p.env.EXPO_PUBLIC_BACKEND,'supabase');assert.equal(p.env.EXPO_PUBLIC_SUPABASE_URL,c.EXPO_PUBLIC_SUPABASE_URL);assert.ok(p.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_'));assert.ok(Object.keys(p.env).every(k=>k.startsWith('EXPO_PUBLIC_')));}
});
test('manual rotation covers fifty states, has the five requested anchors and activates nothing',()=>{
 const r=JSON.parse(readFileSync('config/maintenance/manual-rotation.json','utf8')),days=Object.values(r.weekdays) as string[][];
 assert.equal(new Set(days.flat()).size,50);assert.ok(days.every(d=>d.length===10));assert.deepEqual(days.map(d=>d[0]),['CA','TX','FL','NY','NC']);assert.equal(r.scheduleEnabled,false);assert.equal(r.publicationEnabled,false);assert.equal(r.archivalEnabled,false);assert.equal(r.defaults.newLiveResearchRequests,0);
});
test('manual milestone preview rejects changed fields, duplicate events and wrong government action',()=>{
 // Controlled minimal project, real event attributes. Full cached production snapshot stays private.
 const before={id:'controlled',name:'NC Childrens Health Infrastructure',revision:1,status:'Proposed',description:'Preserved',latitude:35.6,longitude:-78.8},m={key:'case-712',type:'Application Approval',date:'2026-10-22',at:1792627200000,url:'https://government.example/query?objectIds=712',description:'Application only'};
 const p={proposalId:'controlled',applied:false,approvalRequired:true,preview:{before,after:{...before,revision:2},policyBefore:null,policyAfter:null,milestone:m,timelineBefore:[],timelineAfter:[m],historyBefore:1,historyAfter:2,expectedNotifications:0,evidence:{externalId:'712',attributes:{Name:before.name,Action_Taken:'TRC Approved',Action_Date:1792627200000}}}};
 const result=manualMilestonePreview(p);assert.equal(result.productionWrites,0);assert.equal(result.wouldWrite.project_activity.eventDate,'2026-10-22');
 assert.throws(()=>manualMilestonePreview({...p,preview:{...p.preview,after:{...p.preview.after,status:'Approved'}}}));
 assert.throws(()=>manualMilestonePreview({...p,preview:{...p.preview,after:{...p.preview.after,unexpectedField:true}}}));
 assert.throws(()=>manualMilestonePreview({...p,preview:{...p.preview,timelineBefore:[{type:'Approval',event_date:'2026-10-22'}]}}));
 assert.throws(()=>manualMilestonePreview({...p,preview:{...p.preview,evidence:{...p.preview.evidence,attributes:{...p.preview.evidence.attributes,Action_Taken:'Recommended approval'}}}}));
});
