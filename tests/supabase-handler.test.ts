import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {createCloudHandler,sourceProject} from '../server/supabase/handler';
import {verifyAuth0} from '../server/supabase/auth';

test('cloud access tokens require valid signature, issuer, audience, expiry and account claims',async()=>{
 const {publicKey,privateKey}=await generateKeyPair('RS256');
 const key={...await exportJWK(publicKey),kid:'test-key',alg:'RS256',use:'sig'};
 const server=createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({keys:[key]}));});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address() as any,issuer=`http://127.0.0.1:${address.port}/`,config={AUTH0_ISSUER:issuer,AUTH0_AUDIENCE:'urn:test'};
 const claims={'https://buildwatch.app/email':'Admin@Example.org','https://buildwatch.app/email_verified':true,'https://buildwatch.app/auth_methods':[{name:'mfa'}]};
 const sign=async(overrides:any={})=>new SignJWT({...claims,...overrides}).setProtectedHeader({alg:'RS256',kid:'test-key'}).setSubject('test|admin').setIssuer(issuer).setAudience('urn:test').setIssuedAt().setExpirationTime('5m').sign(privateKey);
 try{
  const token=await sign(),identity=await verifyAuth0(token,config);assert.equal(identity.email,'admin@example.org');assert.equal(identity.mfa,true);
  const mfaTime=new Date().toISOString(),recentMfa=await verifyAuth0(await sign({'https://buildwatch.app/auth_time':1,'https://buildwatch.app/auth_methods':[{name:'federated',timestamp:'2020-01-01T00:00:00Z'},{name:'mfa',timestamp:mfaTime}]}),config);assert.equal(recentMfa.authenticatedAt,1000);assert.equal(recentMfa.mfaAuthenticatedAt,Date.parse(mfaTime));
  await assert.rejects(verifyAuth0(token.slice(0,-10)+'AAAAAAAAAA',config));
  await assert.rejects(verifyAuth0(token,{...config,AUTH0_AUDIENCE:'other'}));
  const wrongIssuer=await new SignJWT(claims).setProtectedHeader({alg:'RS256',kid:'test-key'}).setSubject('test|admin').setIssuer('https://wrong.example/').setAudience('urn:test').setIssuedAt().setExpirationTime('5m').sign(privateKey);await assert.rejects(verifyAuth0(wrongIssuer,config));
  await assert.rejects(verifyAuth0(await sign({iss:'https://invalid.example/','https://buildwatch.app/email':null}),config));
  const expired=await new SignJWT(claims).setProtectedHeader({alg:'RS256',kid:'test-key'}).setSubject('test|admin').setIssuer(issuer).setAudience('urn:test').setIssuedAt(1).setExpirationTime(2).sign(privateKey);await assert.rejects(verifyAuth0(expired,config));
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
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
