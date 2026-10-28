import{createCloudHandler}from'../../../server/supabase/handler';
declare const Deno:{env:{get(key:string):string|undefined};serve(handler:(request:Request)=>Promise<Response>):void};
declare const EdgeRuntime:{waitUntil(promise:Promise<unknown>):void};
const url=Deno.env.get('SUPABASE_URL');
const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default;
if(!url||!key)throw Error('Supabase runtime credentials are missing.');
const rpc=async(name:string,args:Record<string,unknown>)=>{
 const response=await fetch(url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,'Content-Type':'application/json',...(key.startsWith('eyJ')?{Authorization:'Bearer '+key}:{})},body:JSON.stringify(args),signal:AbortSignal.timeout(25000)});
 const value=await response.json();if(!response.ok)throw Object.assign(Error(value.message||'Database request failed.'),{code:value.code});return value;
};
let cached:{at:number;value:Record<string,string>}|undefined;
const config=async()=>{if(!cached||cached.at<Date.now()-60000){const value=await rpc('buildwatch_runtime_config',{});if(!value)throw Object.assign(Error('Cloud backend configuration is missing.'),{status:503});cached={at:Date.now(),value:{...value,SUPABASE_URL:url,SUPABASE_SERVICE_ROLE_KEY:key}};}return cached.value;};
Deno.serve(createCloudHandler({rpc,config,waitUntil:promise=>EdgeRuntime.waitUntil(promise)}));
