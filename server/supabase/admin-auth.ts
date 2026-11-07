import{decodeJwt}from'jose';
import type{Identity}from'../accounts/auth';
import type{RuntimeConfig}from'./auth';
import type{Rpc}from'./handler';
function denied(message='Administrator MFA sign-in is required.'):never{throw Object.assign(Error(message),{status:401});}
export async function supabaseSession(token:string,config:RuntimeConfig,requireMfa=true){
 const base=config.SUPABASE_URL?.replace(/\/$/,''),key=config.SUPABASE_SERVICE_ROLE_KEY;
 if(!base||!key)throw Object.assign(Error('Administrator sign-in is not configured.'),{status:503});
 // GoTrue validates the exact bearer token, including its signature. Decoding
 // alone is never authorization, and user_metadata never grants a role.
 const response=await fetch(base+'/auth/v1/user',{headers:{apikey:key,Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)});
 if(!response.ok){if(response.status>=500||response.status===429)throw Object.assign(Error('Administrator identity verification is unavailable.'),{status:503});denied();}
 const user=await response.json(),claims=decodeJwt(token),now=Math.floor(Date.now()/1000);
 if(claims.iss!==base+'/auth/v1'||claims.sub!==user.id||!user.email_confirmed_at||!user.email||!claims.exp||claims.exp<=now||!claims.iat||claims.iat>now+30||claims.role!=='authenticated'||!(Array.isArray(claims.aud)?claims.aud.includes('authenticated'):claims.aud==='authenticated')||typeof claims.session_id!=='string')denied();
 const method=(Array.isArray(claims.amr)?claims.amr:[]).filter((x:any)=>x?.method==='totp'&&Number.isFinite(x.timestamp)&&x.timestamp<=now+30).sort((a:any,b:any)=>b.timestamp-a.timestamp)[0] as any;
 const mfa=claims.aal==='aal2'&&!!method&&user.factors?.some((f:any)=>f.factor_type==='totp'&&f.status==='verified');
 if(requireMfa&&!mfa)denied();
 return{authUserId:user.id as string,sessionId:claims.session_id,email:String(user.email).toLowerCase(),authenticatedAt:mfa?method.timestamp*1000:claims.iat*1000,mfa:!!mfa};
}
export async function verifyBuildWatchToken(token:string,config:RuntimeConfig,rpc:Rpc):Promise<Identity>{
 // The issuer chooses a verifier; it does not establish trust.
 let issuer:unknown;try{issuer=decodeJwt(token).iss;}catch{denied();}
 if(issuer!==config.SUPABASE_URL?.replace(/\/$/,'')+'/auth/v1')denied('Sign in with your BuildWatch account.');
 const session=await supabaseSession(token,config,false);
 return rpc('buildwatch_supabase_identity',{input:{authUserId:session.authUserId,sessionId:session.sessionId,authenticatedAt:session.authenticatedAt,mfa:session.mfa}});
}
