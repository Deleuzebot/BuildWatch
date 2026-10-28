import{Platform}from'react-native';
import{isPublicApiPath}from'./apiPaths';
export const usesSupabase=process.env.EXPO_PUBLIC_BACKEND==='supabase';
const cloud=process.env.EXPO_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/,''),key=process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
const legacy=process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/$/,'')||(Platform.OS==='web'?'':null);
/** Public reads avoid Edge invocation quotas; all privileged calls use Auth0. */
export async function backendFetch(path:string,options:RequestInit={}):Promise<Response>{
 if(!usesSupabase){if(legacy===null)throw Error('The shared server URL is not configured.');return fetch(legacy+path,options);}
 if(!cloud||!key)throw Error('The Supabase backend is not configured for this build.');
 if(!path.startsWith('/api/'))throw Error('Invalid API path.');
 const parsed=new URL(path,'https://buildwatch.invalid'),method=options.method||'GET';
 if(method==='GET'&&isPublicApiPath(parsed.pathname)){
  const response=await fetch(cloud+'/rest/v1/rpc/buildwatch_read',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({path:parsed.pathname,query:Object.fromEntries(parsed.searchParams)}),signal:options.signal});
  if(response.ok)return response;
  let value:any;try{value=await response.json();}catch{}const match=/BW(\d{3}):([\s\S]*)/.exec(value?.message||'');
  return new Response(JSON.stringify({error:match?match[2]:response.status===400?'Invalid map request.':'Shared map is unavailable. Please retry.'}),{status:match?Number(match[1]):response.status,headers:{'Content-Type':'application/json'}});
 }
 return fetch(cloud+'/functions/v1/buildwatch'+path,{...options,headers:{...Object.fromEntries(new Headers(options.headers)),apikey:key}});
}
