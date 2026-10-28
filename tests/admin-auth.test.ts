import test from'node:test';
import assert from'node:assert/strict';
import{supabaseSession,verifyBuildWatchToken,provisionAdmin}from'../server/supabase/admin-auth';
const config={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture-server-only'};
const token=(overrides:any={})=>{const now=Math.floor(Date.now()/1000);return Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({iss:config.SUPABASE_URL+'/auth/v1',sub:'fixture-user',aud:'authenticated',role:'authenticated',session_id:'fixture-session',aal:'aal2',iat:now,exp:now+300,amr:[{method:'totp',timestamp:now}],...overrides})).toString('base64url')+'.fixture';};
test('Supabase MFA claims require online token validation and live administrator binding',async()=>{
 const original=globalThis.fetch;let verified=0;globalThis.fetch=async(_url,options)=>{assert.equal(new Headers(options?.headers).get('apikey'),'fixture-server-only');verified++;return Response.json({id:'fixture-user',email:'owner@example.org',email_confirmed_at:new Date().toISOString(),factors:[{factor_type:'totp',status:'verified'}]});};
 try{
  assert.equal((await supabaseSession(token(),config)).authUserId,'fixture-user');
  for(const override of[{aal:'aal1'},{amr:[{method:'password',timestamp:1}]},{iss:'https://other.supabase.co/auth/v1'},{sub:'other-user'},{exp:1},{role:'service_role'},{aud:'other'}])await assert.rejects(supabaseSession(token(override),config));
  let calls=0;const identity=await verifyBuildWatchToken(token(),config,async(name,args)=>{assert.equal(name,'buildwatch_admin_security');assert.equal(args.action,'resolve');calls++;return{subject:'google-oauth2|original-admin',mfa:true};});assert.equal(identity.subject,'google-oauth2|original-admin');assert.equal(calls,1);assert.ok(verified>=9);
  globalThis.fetch=async()=>Response.json({error:'invalid signature'},{status:401});await assert.rejects(supabaseSession(token(),config));
 }finally{globalThis.fetch=original;}
});
test('provisioning rejects weak passwords and does not overwrite existing credentials',async()=>{
 await assert.rejects(provisionAdmin('owner@example.org','short',config),/passphrase/);
 const original=globalThis.fetch;globalThis.fetch=async()=>Response.json({code:'email_exists'},{status:422});try{await assert.rejects(provisionAdmin('owner@example.org','fixture strong passphrase',config),/already exists/);}finally{globalThis.fetch=original;}
});
