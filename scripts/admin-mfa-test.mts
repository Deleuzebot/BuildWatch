import assert from'node:assert/strict';
import{readFileSync,writeFileSync}from'node:fs';
import{randomUUID}from'node:crypto';
import{projects}from'../src/data/projects';
import{deriveProject}from'../server/supabase/derive';
import{loadPostgresEnvironment,PostgresDatabase}from'../server/postgres/connection';
loadPostgresEnvironment();const db=new PostgresDatabase(),checks:string[]=[];let passed=false;
try{await db.transaction(async()=>{
 await db.query(readFileSync('supabase/migrations/20261028010453_administrator_mfa_login.sql','utf8'));
 await db.query(readFileSync('supabase/migrations/20261028015214_administrator_single_authenticator.sql','utf8'));
 const prefix='bw-admin-mfa-test-',owner=prefix+randomUUID(),other=prefix+randomUUID(),uid=randomUUID(),sid=randomUUID(),first=randomUUID(),second=randomUUID(),now=Date.now();
 await db.query("INSERT INTO buildwatch.users(id,subject,email,name,verified,role,preferences,created) VALUES($1,$2,$3,'MFA regression',1,'admin','{}',$4),($5,$6,$7,'Ordinary regression',1,'user','{}',$4)",[owner,'test|'+owner,owner+'@example.invalid',now,other,'test|'+other,other+'@example.invalid']);
 await db.query("INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES($1,$2,now(),'{\"role\":\"admin\"}')",[uid,owner+'@example.invalid']);
 await db.query("INSERT INTO auth.mfa_factors(id,user_id,friendly_name,factor_type,status,created_at,updated_at,secret) VALUES($1,$2,'Test primary','totp','verified',now(),now(),'fixture-only'),($3,$2,'Test backup','totp','unverified',now(),now(),'fixture-only')",[first,uid,second]);
 await db.query("INSERT INTO auth.sessions(id,user_id,factor_id,aal,created_at,updated_at) VALUES($1,$2,$3,'aal2',now(),now())",[sid,uid,first]);
 const identity={subject:'test|'+owner,email:owner+'@example.invalid',name:'MFA regression',verified:true,mfa:true,methods:['google-oauth2'],authenticatedAt:now},input={authUserId:uid,sessionId:sid,authenticatedAt:now};
 const call=async(action:string,who:any=identity,data:any=input)=>(await db.one('SELECT public.buildwatch_admin_security($1,$2::jsonb,$3::jsonb) value',[action,JSON.stringify(who),JSON.stringify(data)])).value;
 const rejects=async(fn:()=>Promise<any>,pattern=/BW403/)=>{await db.query('SAVEPOINT expected_failure');try{await fn();assert.fail('Unexpected access');}catch(e:any){assert.match(e.message,pattern);await db.query('ROLLBACK TO SAVEPOINT expected_failure');}await db.query('RELEASE SAVEPOINT expected_failure');};
 await rejects(()=>call('resolve',{}));checks.push('AAL2 and user-editable administrator metadata cannot authorize an unlinked identity');
 await rejects(()=>call('authorize_setup',{...identity,mfa:false}));await rejects(()=>call('authorize_setup',{...identity,subject:'test|'+other,email:other+'@example.invalid'}));await rejects(()=>call('authorize_setup',{...identity,authenticatedAt:now-1000000}));checks.push('original verified administrator MFA and recent authentication are required for provisioning/linking');
 assert.equal((await call('authorize_setup')).accountId,owner);
 await db.query("UPDATE auth.mfa_factors SET status='unverified' WHERE id=$1",[first]);await rejects(()=>call('link'));await db.query("UPDATE auth.mfa_factors SET status='verified' WHERE id=$1",[first]);
 await db.query("UPDATE auth.sessions SET aal='aal1' WHERE id=$1",[sid]);await rejects(()=>call('link'));await db.query("UPDATE auth.sessions SET aal='aal2' WHERE id=$1",[sid]);
 await db.query("UPDATE auth.users SET email='mismatched@example.invalid' WHERE id=$1",[uid]);await rejects(()=>call('link'));await db.query('UPDATE auth.users SET email=$1 WHERE id=$2',[identity.email,uid]);checks.push('zero-factor, password-only, and mismatched identities cannot be linked');
 const before=(await db.one('SELECT to_jsonb(u) value FROM buildwatch.users u WHERE id=$1',[owner])).value;
 assert.equal((await call('link')).accountId,owner);const resolved=await call('resolve',{});assert.equal(resolved.subject,identity.subject);assert.equal(resolved.mfa,true);assert.deepEqual(resolved.methods,['supabase-admin']);
 assert.deepEqual((await db.one('SELECT to_jsonb(u) value FROM buildwatch.users u WHERE id=$1',[owner])).value,before);checks.push('one verified authenticator and dual ownership proof link the original administrator without modifying permissions or profile');
 const gateway=async(method:string,path:string,body:any={})=>(await db.one('SELECT public.buildwatch_edge($1::jsonb,$2,$3,$4::jsonb) value',[JSON.stringify(resolved),method,path,JSON.stringify(body)])).value;
 const a='bw-mfa-project-a',b='bw-mfa-project-b',candidate='f'.repeat(64);
 for(const id of[a,b]){const p={...structuredClone(projects[0]),id,name:'MFA fixture '+id,status:'Proposed',revision:1};await db.query('INSERT INTO buildwatch.projects(id,data,revision) VALUES($1,$2,1)',[id,JSON.stringify(p)]);await db.query('SELECT buildwatch.bw_refresh($1,$2::jsonb)',[id,JSON.stringify(await deriveProject(p as any))]);}
 await db.query('INSERT INTO buildwatch.duplicate_candidates VALUES($1,$2,$3,$4,$5,$6,$7,$8,1,$9,$9)',[candidate,a,b,candidate,'["MFA fixture"]','{}','fixture','pending',now]);
 const preview=await gateway('POST','/api/admin/duplicates/pairs/'+candidate+'/preview',{action:'merge',canonical:'a',choices:{},revision:1});const commit=await gateway('POST','/api/admin/duplicates/commit',{token:preview.token,_derived:await deriveProject(preview.result)});assert.equal((await db.one('SELECT buildwatch.bw_canonical($1) id',[b])).id,a);
 const restore=await gateway('GET','__undo_info',{decisionId:commit.decisionId}),derived:any={};for(const p of restore.profiles)derived[p.id]=await deriveProject(p.data,restore.policies[p.id]);await gateway('POST','/api/admin/duplicates/undo',{decisionId:commit.decisionId,_derivedById:derived});assert.equal((await db.one('SELECT buildwatch.bw_canonical($1) id',[b])).id,b);checks.push('resolved Supabase administrator can preview, merge, and undo while preserving original source records');
 await rejects(async()=>{await db.query("UPDATE buildwatch.users SET role='user' WHERE id=$1",[owner]);await call('resolve',{});});
 await rejects(async()=>{await db.query('DELETE FROM auth.sessions WHERE id=$1',[sid]);await call('resolve',{});});
 await rejects(async()=>{await db.query("UPDATE auth.mfa_factors SET status='unverified' WHERE id=$1",[first]);await call('resolve',{});});
 await rejects(async()=>{await db.query("UPDATE auth.sessions SET not_after=now()-interval '1 minute' WHERE id=$1",[sid]);await call('resolve',{});});checks.push('role revocation, logout, removed factors, and expired sessions deny subsequent administrator access');
 await db.query('SAVEPOINT client_roles');await db.query('SET LOCAL ROLE authenticated');await rejects(()=>call('link'),/permission denied/);await rejects(()=>db.query('SELECT * FROM buildwatch.admin_login_bindings'),/permission denied/);await db.query('RESET ROLE');await db.query('ROLLBACK TO SAVEPOINT client_roles');checks.push('authenticated clients cannot invoke the privileged bridge or read its bindings');
 passed=true;throw Error('ROLLBACK_MFA_REGRESSION');
});}catch(e:any){if(!passed||e.message!=='ROLLBACK_MFA_REGRESSION'){console.error(JSON.stringify({message:e.message,where:e.where,checks}));process.exitCode=1;}}finally{await db.close();}
if(passed){writeFileSync('../../work/public-deployment/admin-mfa-regression.json',JSON.stringify({passed,rolledBack:true,checks},null,2));console.log(JSON.stringify({passed,rolledBack:true,checks}));}
