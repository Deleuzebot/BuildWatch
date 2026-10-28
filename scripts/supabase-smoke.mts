import assert from'node:assert/strict';
import{writeFileSync}from'node:fs';
process.loadEnvFile('.env');
const base=process.env.EXPO_PUBLIC_SUPABASE_URL!,key=process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,checks:any[]=[];
async function read(path:string,query:any={}){const start=Date.now(),r=await fetch(base+'/rest/v1/rpc/buildwatch_read',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({path,query}),signal:AbortSignal.timeout(15000)}),value=await r.json();assert.equal(r.status,200,path+' '+JSON.stringify(query)+' '+JSON.stringify(value));checks.push({path,query,ms:Date.now()-start,total:value?.total});return value;}
const catalog=await read('/api/catalog');assert.equal(catalog.total,1831);
for(const query of[{},...['Proposed','In review','Approved','Under construction'].map(status=>({status})),...['Residential','Mixed-Use','Commercial','Industrial','Civic','Transportation','Utilities','Environment'].map(types=>({types})),...['30d','3m','1y','5y'].map(activity=>({activity})),{search:'Chapel Hill'}]){
 const page=await read('/api/browse',query);assert.ok(page.items.length<=50);
 const map=await read('/api/map',{...query,bbox:'-85,33,-75,37',zoom:'7'});assert.ok(map.nodes.length<=512);assert.equal(map.nodes.reduce((n:number,x:any)=>n+x.count,0),map.total);
}
const page=await read('/api/browse',{limit:'2'});await read('/api/public/projects/'+page.items[0].id);await read('/api/public/projects/'+page.items[0].id+'/activity');await read('/api/meetings');const boundary=await read('/api/state-boundaries/2025-20m');assert.ok(Object.keys(boundary.states).length>=50);
for(const auth of[undefined,'Bearer forged']){const r=await fetch(base+'/functions/v1/buildwatch/api/admin/users',{headers:auth?{Authorization:auth}:{}});assert.equal(r.status,401);checks.push({path:'private-admin',status:r.status});}
for(const name of['buildwatch_edge','buildwatch_runtime_config']){const r=await fetch(base+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify(name==='buildwatch_edge'?{identity:{subject:'fake',role:'admin'},method:'GET',path:'/api/admin/users'}:{})});assert.ok([401,403,404].includes(r.status));checks.push({path:name,status:r.status});}
writeFileSync('../../work/supabase-only/live-smoke.json',JSON.stringify({passed:true,checks},null,2));console.log(JSON.stringify({passed:true,checks:checks.length,maxRequestMs:Math.max(...checks.map(x=>x.ms||0))}));
