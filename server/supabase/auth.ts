import {createRemoteJWKSet,jwtVerify}from'jose';
import type{Identity}from'../accounts/auth';
export type RuntimeConfig=Record<string,string|undefined>;
const keySets=new Map<string,ReturnType<typeof createRemoteJWKSet>>();
export async function verifyAuth0(token:string,config:RuntimeConfig):Promise<Identity>{
 const issuer=config.AUTH0_ISSUER?.replace(/\/$/,'')+'/',audience=config.AUTH0_AUDIENCE;
 if(!config.AUTH0_ISSUER||!audience)throw Object.assign(Error('Sign-in is not configured.'),{status:503});
 let keys=keySets.get(issuer);if(!keys){keys=createRemoteJWKSet(new URL('.well-known/jwks.json',issuer));keySets.set(issuer,keys);}
 const{payload}=await jwtVerify(token,keys,{issuer,audience,algorithms:['RS256'],requiredClaims:['sub','exp','iat']});
 const email=payload['https://buildwatch.app/email'];if(!payload.sub||typeof email!=='string')throw Error('Required account claims missing.');
 const methods=payload['https://buildwatch.app/methods'],auth=payload['https://buildwatch.app/auth_methods'];
 const mfaAuthenticatedAt=Array.isArray(auth)?Math.max(0,...auth.filter((x:any)=>x?.name==='mfa').map((x:any)=>Date.parse(x.timestamp||'')).filter(Number.isFinite)):0;
 return{subject:payload.sub,email:email.toLowerCase(),name:typeof payload['https://buildwatch.app/name']==='string'?payload['https://buildwatch.app/name'] as string:email,
  verified:payload['https://buildwatch.app/email_verified']===true,methods:Array.isArray(methods)?methods.filter(x=>typeof x==='string'):[],mfa:Array.isArray(auth)&&auth.some((x:any)=>x.name==='mfa'),authenticatedAt:Number(payload['https://buildwatch.app/auth_time']||0)*1000,mfaAuthenticatedAt};
}
