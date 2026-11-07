import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudHandler,sourceProject} from '../server/supabase/handler';
import {verifyBuildWatchToken} from '../server/supabase/admin-auth';
import {readFileSync} from 'node:fs';

test('milestone confirmation preserves complete project values and uses protected shadow reports',async()=>{
 const current=JSON.parse(readFileSync('tests/fixtures/apex-maintenance-baseline.json','utf8')).project,milestone={type:'Application Approval',date:'2026-10-22',url:'https://example.gov/fixture'};let committed:any;
 const handler=createCloudHandler({config:async()=>({}),verify:async()=>({subject:'fixture',email:'fixture@example.org',name:'Fixture',verified:true,methods:[],mfa:true,authenticatedAt:Date.now()}),rpc:async(name,args)=>{if(name==='buildwatch_shadow_admin')throw Error('BW403:Administrator access required.');if(args.path==='__research_info')return{current,milestone};committed=args.input;return current;}});
 const response=await handler(new Request('https://example.org/api/admin/research/commit',{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},body:JSON.stringify({token:'fixture',confirmation:'append-application-milestone',_project:{status:'Completed'}})}));assert.equal(response.status,200);assert.deepEqual(committed._project,current);assert.deepEqual(committed._derived.recordEvents,[milestone]);assert.equal(committed.confirmation,'append-application-milestone');
 const denied=await handler(new Request('https://example.org/api/admin/maintenance/shadow-report',{headers:{Authorization:'Bearer fixture'}}));assert.equal(denied.status,403);
});

test('retired identity providers cannot authenticate or call ownership setup',async()=>{
 const foreign=Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({iss:'https://retired-provider.example/',sub:'old-admin'})).toString('base64url')+'.signature';
 await assert.rejects(verifyBuildWatchToken(foreign,{SUPABASE_URL:'https://fixture.supabase.co'},async()=>{throw Error('Must not call database');}),/BuildWatch/);
 await assert.rejects(verifyBuildWatchToken('malformed',{SUPABASE_URL:'https://fixture.supabase.co'},async()=>{throw Error('Must not call database');}));
 const handler=createCloudHandler({config:async()=>({}),verify:async()=>({subject:'fixture',email:'fixture@example.org',name:'Fixture',verified:true,methods:[],mfa:true,authenticatedAt:Date.now()}),rpc:async()=>{throw Error('Retired setup must not write');}});
 for(const path of ['/api/admin/login/link','/api/admin/login/provision','/api/account/link']){
  const r=await handler(new Request('https://example.org'+path,{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},body:'{}'}));assert.equal(r.status,410);
 }
});
test('cloud HTTP boundary strips privileged inputs and never leaks database errors',async()=>{
 const calls:any[]=[];const handler=createCloudHandler({config:async()=>({}),verify:async(token)=>{if(token!=='valid')throw Error('bad');return{subject:'test|user',email:'user@example.org',name:'User',verified:true,methods:[],mfa:false,authenticatedAt:Date.now()};},rpc:async(name,args)=>{calls.push({name,args});if(args.path==='/api/admin/users')throw Error('BW403:Administrator access required.');if(args.path==='/api/broken')throw Error('private secret SQL');return{name};}});
 const request=(path:string,body?:any,token?:string)=>handler(new Request('https://example.org/functions/v1/buildwatch'+path,{method:body?'POST':'GET',headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));
 assert.equal((await request('/api/me')).status,401);assert.equal((await request('/api/me',undefined,'forged')).status,401);
 assert.equal((await request('/api/admin/users',undefined,'valid')).status,403);
 await request('/api/submissions',{kind:'feedback',_project:{role:'admin'}},'valid');assert.equal(calls.at(-1).args.input._project,undefined);assert.equal(calls.at(-1).args.identity.subject,'test|user');
 const broken=await request('/api/broken',undefined,'valid');assert.equal(broken.status,503);assert.doesNotMatch(await broken.text(),/secret|SQL/);
 assert.equal((await request('/__merge_info',{},'valid')).status,404);
 assert.equal((await request('/api/submissions',{message:'x'.repeat(128001)},'valid')).status,413);
 await request('/api/catalog');assert.equal(calls.at(-1).name,'buildwatch_read');
});
test('editing public projections preserves the original municipal category',()=>{
 const current={category:'Residential',originalCategory:'Multi Family',classification:{primary:'Residential'},originalMunicipalCategory:'Multifamily dwelling'};
 assert.equal(sourceProject({category:'Residential',name:'Changed'},current).category,'Multi Family');
 assert.equal(sourceProject({category:'Commercial',name:'Changed'},current).category,'Commercial');
 const preserved=sourceProject({category:'Residential',name:'Changed'},{...current,verificationNote:'Original evidence retained',sourceStatusDate:'2026-01-01'});
 assert.equal(preserved.verificationNote,'Original evidence retained');assert.equal(preserved.sourceStatusDate,'2026-01-01');
});
