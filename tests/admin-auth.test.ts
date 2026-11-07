import test from'node:test';
import assert from'node:assert/strict';
import{supabaseSession,verifyBuildWatchToken}from'../server/supabase/admin-auth';
const config={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture-server-only'};
const token=(overrides:any={})=>{const now=Math.floor(Date.now()/1000);return Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({iss:config.SUPABASE_URL+'/auth/v1',sub:'fixture-user',aud:'authenticated',role:'authenticated',session_id:'fixture-session',aal:'aal2',iat:now,exp:now+300,amr:[{method:'password',timestamp:now},{method:'totp',timestamp:now}],...overrides})).toString('base64url')+'.fixture';};
test('Supabase MFA claims require online token validation and live administrator binding',async()=>{
 const original=globalThis.fetch;let verified=0;globalThis.fetch=async(_url,options)=>{assert.equal(new Headers(options?.headers).get('apikey'),'fixture-server-only');verified++;return Response.json({id:'fixture-user',email:'owner@example.org',email_confirmed_at:new Date().toISOString(),factors:[{factor_type:'totp',status:'verified'}]});};
 try{
  assert.equal((await supabaseSession(token(),config)).authUserId,'fixture-user');
  for(const override of[{aal:'aal1'},{amr:[{method:'password',timestamp:1}]},{iss:'https://other.supabase.co/auth/v1'},{sub:'other-user'},{exp:1},{role:'service_role'},{aud:'other'}])await assert.rejects(supabaseSession(token(override),config));
  let calls=0;const identity=await verifyBuildWatchToken(token(),config,async(name,args)=>{assert.equal(name,'buildwatch_supabase_identity');assert.equal((args.input as any).mfa,true);assert.equal((args.input as any).passwordAuthenticated,true);calls++;return{subject:'google-oauth2|original-admin',mfa:true};});assert.equal(identity.subject,'google-oauth2|original-admin');assert.equal(calls,1);assert.ok(verified>=9);
  globalThis.fetch=async()=>Response.json({error:'invalid signature'},{status:401});await assert.rejects(supabaseSession(token(),config));
 }finally{globalThis.fetch=original;}
});
test('ordinary verified Supabase sessions never fabricate administrator MFA',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>Response.json({id:'fixture-user',email:'user@example.org',email_confirmed_at:new Date().toISOString(),factors:[]});
 try{let called=false;const identity=await verifyBuildWatchToken(token({aal:'aal1',amr:[{method:'password',timestamp:1}]}),config,async(name,args)=>{called=true;assert.equal(name,'buildwatch_supabase_identity');assert.equal((args.input as any).mfa,false);return{subject:'supabase|fixture-user',mfa:false};});assert.equal(identity.mfa,false);assert.ok(called);await assert.rejects(supabaseSession(token({aal:'aal1'}),config));}finally{globalThis.fetch=original;}
});

test('Google with TOTP is distinguished from administrator password with TOTP',async()=>{
 const original=globalThis.fetch,now=Math.floor(Date.now()/1000);globalThis.fetch=async()=>Response.json({id:'fixture-user',email:'owner@example.org',email_confirmed_at:new Date().toISOString(),factors:[{factor_type:'totp',status:'verified'}]});
 try{let checked=false;await assert.rejects(verifyBuildWatchToken(token({amr:[{method:'oauth',timestamp:now},{method:'totp',timestamp:now}]}),config,async(_name,args)=>{checked=true;assert.equal((args.input as any).mfa,true);assert.equal((args.input as any).passwordAuthenticated,false);throw Error('BW401:Use administrator password and Duo');}),/password and Duo/);assert.ok(checked);}finally{globalThis.fetch=original;}
});
