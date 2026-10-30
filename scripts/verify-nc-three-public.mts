/** Anonymous read-path verification shared by deployed web and native clients. No privileged credentials or writes. */
import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';import {resolve} from 'node:path';
process.loadEnvFile('.env');const endpoint=process.env.EXPO_PUBLIC_SUPABASE_URL,key=process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert.ok(endpoint&&key?.startsWith('sb_publishable_'));assert.equal(new URL(endpoint).hostname,'iuchstlnusdnserweutj.supabase.co');
const dir=resolve('../../work/buildwatch-three-update-approval'),after=JSON.parse(readFileSync(dir+'/AFTER.json','utf8')),plan=JSON.parse(readFileSync(dir+'/PREVIEW.json','utf8'));
const get=async(path:string)=>{const response=await fetch(endpoint+'/rest/v1/rpc/buildwatch_read',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({path,query:{}}),signal:AbortSignal.timeout(20000)});assert.equal(response.status,200,'Public path unavailable: '+path);return response.json();};
const results=[];
for(const item of after.items){const project=await get('/api/public/projects/'+item.projectId),activity=await get('/api/public/projects/'+item.projectId+'/activity'),p=plan.items.find((p:any)=>p.projectId===item.projectId);
 for(const field of ['id','name','status','description','latitude','longitude','revision','sources','meetings'])assert.deepEqual(project[field],item.project[field]);
 if(p.kind==='milestone'){const matches=activity.items.filter((e:any)=>e.type==='Application Approval'&&e.date===p.proposal.milestone.date);assert.equal(matches.length,1);assert.equal(matches[0].sourceUrl,p.proposal.milestone.url);}else{assert.equal(project.meetings.length,1);assert.equal(project.meetings[0].startsAt,'2026-11-02T22:15:00.000Z');assert.match(project.meetings[0].title,/5:15–6:15 p.m. Eastern/);}
 results.push({projectId:item.projectId,name:item.name,revision:project.revision,publicRead:true,activityItems:activity.items,meetings:project.meetings});
}
writeFileSync(dir+'/PUBLIC-READS.json',JSON.stringify({checkedAt:new Date().toISOString(),authenticated:false,requests:6,privilegedWrites:0,results,nativeBinaryTested:false,note:'Uses the same public Supabase RPC and data paths as the website and configured iOS client. No installed iOS binary was exercised.'},null,2));
console.log(JSON.stringify({anonymousPublicReadsPassed:true,projects:results.map(p=>({name:p.name,revision:p.revision})),requests:6,nativeBinaryTested:false}));
