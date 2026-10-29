import type{Identity}from'../accounts/auth';
import{verifyAuth0,type RuntimeConfig}from'./auth';
import{verifyBuildWatchToken,supabaseSession,provisionAdmin}from'./admin-auth';
import{deriveProject}from'./derive';
import{validateProject}from'../../src/lib/validate';
import{policyValues,validateSourceEvidence}from'../archives/policy';
import type{Project}from'../../src/data/projects';
import{deliverPush}from'./push';
import{isPublicApiPath}from'../../src/lib/apiPaths';
export type Rpc=(name:string,args:Record<string,unknown>)=>Promise<any>;
type Dependencies={rpc:Rpc;config:()=>Promise<RuntimeConfig>;verify?:(token:string,config:RuntimeConfig)=>Promise<Identity>;waitUntil?:(promise:Promise<unknown>)=>void};
function fail(status:number,message:string):never{throw Object.assign(Error(message),{status});}
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, if-none-match, x-client-info','Access-Control-Allow-Methods':'GET, POST, PUT, PATCH, DELETE, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export const publicRoute=isPublicApiPath;
async function readInput(req:Request){
 if(!req.body)return{};const reader=req.body.getReader(),chunks:Uint8Array[]=[];let length=0;
 while(true){const r=await reader.read();if(r.done)break;length+=r.value.byteLength;if(length>128000){await reader.cancel();fail(413,'Request is too large.');}chunks.push(r.value);}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 try{const value=JSON.parse(new TextDecoder().decode(bytes)||'{}');if(!value||typeof value!=='object'||Array.isArray(value))fail(400,'A JSON object is required.');return Object.fromEntries(Object.entries(value).filter(([key])=>!key.startsWith('_')));}catch{fail(400,'Invalid JSON.');}
}
export function sourceProject(value:any,current?:any):Project{
 // Public project cards omit internal provenance. Editing that projection must
 // retain the server's existing source metadata rather than erase hidden fields.
 const{primaryCategory,secondaryCategories,subtype,classification,originalCategory,originalMunicipalCategory,...source}=current?{...current,...value}:value;
 const original=originalCategory??current?.originalCategory;
 return{...source,category:source.category===current?.category?(original??source.category):source.category,...((originalMunicipalCategory??current?.originalMunicipalCategory)?{originalMunicipalCategory:originalMunicipalCategory??current?.originalMunicipalCategory}:{})};
}
function checkProject(project:any){const issue=validateProject(project);if(issue)fail(400,issue);}
let managementCache:{token:string;expires:number;client:string}|undefined;
async function management(config:RuntimeConfig,path:string,method:string,body?:unknown){
 const issuer=config.AUTH0_ISSUER?.replace(/\/$/,''),client=config.AUTH0_MANAGEMENT_CLIENT_ID,secret=config.AUTH0_MANAGEMENT_CLIENT_SECRET;
 if(!issuer||!client||!secret)fail(503,'Identity management is not configured.');
 if(!managementCache||managementCache.client!==client||managementCache.expires<Date.now()){
  const r=await fetch(issuer+'/oauth/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({grant_type:'client_credentials',client_id:client,client_secret:secret,audience:issuer+'/api/v2/'}),signal:AbortSignal.timeout(10000)});
  if(!r.ok)fail(502,'Identity management authorization failed.');const value=await r.json();managementCache={token:value.access_token,expires:Date.now()+Math.max(0,Number(value.expires_in||300)-60)*1000,client};
 }
 const r=await fetch(issuer+'/api/v2/'+path,{method,headers:{Authorization:'Bearer '+managementCache!.token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(10000)});
 if(!r.ok)fail(502,'The identity provider could not complete this operation.');
}
function secureEqual(a:string,b:string){const x=new TextEncoder().encode(a),y=new TextEncoder().encode(b);let diff=x.length^y.length;for(let i=0;i<Math.max(x.length,y.length);i++)diff|=(x[i]||0)^(y[i]||0);return diff===0;}
async function entitlement(config:RuntimeConfig,id:string){
 if(!config.REVENUECAT_SECRET_KEY)fail(503,'Billing verification is not configured.');
 const r=await fetch('https://api.revenuecat.com/v1/subscribers/'+encodeURIComponent(id),{headers:{Authorization:'Bearer '+config.REVENUECAT_SECRET_KEY},signal:AbortSignal.timeout(10000)});
 if(!r.ok)fail(502,'Unable to verify purchases. Please retry.');const data=await r.json(),subscriber=data.subscriber,e=subscriber?.entitlements?.[config.REVENUECAT_ENTITLEMENT||'buildwatch_plus'],subscription=e?subscriber.subscriptions?.[e.product_identifier]:null;
 const expires=e&&(!subscription?.is_sandbox||config.BILLING_ALLOW_SANDBOX==='true')?(e.expires_date===null?8640000000000000:Math.max(Date.parse(e.expires_date)||0,Date.parse(subscription?.grace_period_expires_date||'')||0)):0;
 return{id,expires:Number.isFinite(expires)?expires:0,store:subscription?.store||'',managementURL:typeof subscriber?.management_url==='string'&&subscriber.management_url.startsWith('https://')?subscriber.management_url:null};
}
/** HTTPS-only backend. All state changes happen atomically in a database RPC. */
export function createCloudHandler(deps:Dependencies){
 const jobs=new Set<string>();
 return async(req:Request):Promise<Response>=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  try{
   const url=new URL(req.url),marker='/buildwatch',at=url.pathname.indexOf(marker),path=at>=0?url.pathname.slice(at+marker.length):url.pathname;
   if(path==='/health')return Response.json({backend:'supabase',version:1,schedules:false},{headers});
   if(!path.startsWith('/api/')||!['GET','POST','PUT','PATCH','DELETE'].includes(req.method))fail(404,'Not found.');
   const query=Object.fromEntries(url.searchParams),method=req.method;
   if(method==='GET'&&publicRoute(path))return Response.json(await deps.rpc('buildwatch_read',{path,query}),{headers});
   const config=await deps.config();
   if(path==='/api/webhooks/revenuecat'&&method==='POST'){
    if(!config.REVENUECAT_WEBHOOK_SECRET||!secureEqual(req.headers.get('authorization')||'','Bearer '+config.REVENUECAT_WEBHOOK_SECRET))fail(401,'Invalid webhook authorization.');
    const input=await readInput(req),event=input.event as any;if(typeof event?.id!=='string'||event.id.length>200)fail(400,'Invalid billing event.');
    const ids=[...new Set([event.app_user_id,event.original_app_user_id,...(Array.isArray(event.transferred_from)?event.transferred_from:[]),...(Array.isArray(event.transferred_to)?event.transferred_to:[])].filter(id=>typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id)))];if(ids.length>100)fail(400,'Too many accounts in billing event.');
    const updates=[];for(const id of ids)updates.push(await entitlement(config,id));return Response.json(await deps.rpc('buildwatch_billing',{event_id:event.id,updates}),{headers});
   }
   const bearer=req.headers.get('authorization');if(!bearer?.startsWith('Bearer ')||bearer.length>16000)fail(401,'Please sign in.');
   let identity:Identity;try{identity=await(deps.verify||((token,cfg)=>verifyBuildWatchToken(token,cfg,deps.rpc)))(bearer!.slice(7),config);}catch(e:any){if(e.status===503)throw e;fail(401,'Your sign-in session is invalid or expired.');}
   const call=(p=path,input:any={},m=method,q:Record<string,string>=query)=>deps.rpc('buildwatch_edge',{identity,method:m,path:p,input,query:q});
   let input:any=method==='GET'?{}:await readInput(req);
   if(path==='/api/admin/maintenance/shadow-report'&&method==='GET')return Response.json(await deps.rpc('buildwatch_shadow_admin',{identity,input:query}),{headers});
   if(path==='/api/admin/maintenance/sources'&&method==='GET')return Response.json(await deps.rpc('buildwatch_maintenance_admin',{identity,action:'sources',input:query}),{headers});
   if(path==='/api/admin/maintenance'&&method==='GET')return Response.json(await deps.rpc('buildwatch_maintenance_admin',{identity,action:'summary',input:{}}),{headers});
   if(/^\/api\/admin\/maintenance\/(state|queue|undo|pause|resume|retry)$/.test(path)&&method==='POST'){
    const action=path.split('/').at(-1)!;
    if(action==='undo'){
     const info=await deps.rpc('buildwatch_maintenance_admin',{identity,action:'undo_info',input:{id:input.id}});
     if(info.mutation.before_data)input={id:input.id,derived:await deriveProject(info.mutation.before_data)};
    }
    return Response.json(await deps.rpc('buildwatch_maintenance_admin',{identity,action,input}),{headers});
   }
   if(path.startsWith('/api/admin/login/')){
    if(path==='/api/admin/login/status'&&method==='GET')return Response.json(await deps.rpc('buildwatch_admin_security',{action:'status',identity,input:{}}),{headers});
    // Linking/provisioning explicitly requires the still-working Auth0 MFA
    // identity, never an email match or a client-supplied administrator flag.
    const primary=await verifyAuth0(bearer!.slice(7),config);
    // A fresh, signed MFA event is sufficient for this dual-proof setup even
    // when the upstream Google SSO session was established much earlier.
    primary.authenticatedAt=Math.max(primary.authenticatedAt,primary.mfaAuthenticatedAt||0);
    if(path==='/api/admin/login/provision'&&method==='POST'){
     const owner=await deps.rpc('buildwatch_admin_security',{action:'authorize_setup',identity:primary,input:{}});
     return Response.json(await provisionAdmin(owner.email,input.password as string,config),{headers});
    }
    if(path==='/api/admin/login/link'&&method==='POST'){
     if(typeof input.secondaryToken!=='string'||input.secondaryToken.length>16000)fail(400,'Complete the Supabase MFA sign-in first.');
     const secondary=await supabaseSession(input.secondaryToken,config);
     return Response.json(await deps.rpc('buildwatch_admin_security',{action:'link',identity:primary,input:{authUserId:secondary.authUserId,sessionId:secondary.sessionId}}),{headers});
    }
    fail(404,'Not found.');
   }
   if(path==='/api/account/password'&&method==='POST'){
    await call('/api/me',{},'GET');if(!config.AUTH0_PASSWORD_CLIENT_ID||!config.AUTH0_ISSUER)fail(503,'Password recovery email is not configured.');if(!identity!.methods.includes('auth0'))fail(400,'This account uses a social sign-in provider.');
    const r=await fetch(config.AUTH0_ISSUER.replace(/\/$/,'')+'/dbconnections/change_password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:config.AUTH0_PASSWORD_CLIENT_ID,email:identity!.email,connection:config.AUTH0_EMAIL_CONNECTION||'Username-Password-Authentication'}),signal:AbortSignal.timeout(10000)});if(!r.ok)fail(502,'Unable to send a password-reset email.');return Response.json({sent:true},{headers});
   }
   if(path==='/api/account/link'&&method==='POST'){
    if(typeof input.secondaryToken!=='string'||input.secondaryToken.length>16000)fail(400,'Missing secondary identity token.');let secondaryIdentity:Identity;try{secondaryIdentity=await(deps.verify||verifyAuth0)(input.secondaryToken,config);}catch{fail(401,'The secondary sign-in session is invalid.');}
    const prepared=await call('__link_prepare',{secondaryIdentity});const split=secondaryIdentity!.subject.indexOf('|');if(split<1)fail(400,'Unsupported identity.');
    await management(config,'users/'+encodeURIComponent(prepared.primarySubject)+'/identities','POST',{provider:secondaryIdentity!.subject.slice(0,split),user_id:secondaryIdentity!.subject.slice(split+1)});
    return Response.json(await call('__link_commit',{secondaryIdentity}),{headers});
   }
   if(path==='/api/me'&&method==='DELETE'){
    if(!config.AUTH0_MANAGEMENT_CLIENT_SECRET)fail(503,'Account deletion is not configured.');const prepared=await call('__delete_prepare',input);
    try{await management(config,'users/'+encodeURIComponent(prepared.subject),'DELETE');}catch(e){await call('__delete_abort',{});throw e;}
    return Response.json(await call('__delete_commit',{}),{headers});
   }
   if(path==='/api/billing/sync'&&method==='POST'){const user=await call('/api/me',{},'GET');return Response.json(await call('__billing_apply',await entitlement(config,user.id)),{headers});}
   if(path==='/api/devices'&&method==='POST'&&config.PUSH_DELIVERY_ENABLED!=='true')fail(503,'Device push delivery has not been activated. In-app notifications remain available.');
   if(/^\/api\/projects\/[A-Za-z0-9-]{1,160}$/.test(path)&&method==='PUT'){
    const id=path.split('/')[3],info=await call('__project_info',{id},'GET');input.id=id;const project=sourceProject(input,info.project);checkProject(project);input={_project:project,_derived:await deriveProject(project,info.policy)};
   }else if(path==='/api/submissions'&&method==='POST'&&input.kind==='correction'){
    const current=await deps.rpc('buildwatch_read',{path:'/api/public/projects/'+encodeURIComponent(input.projectId),query:{}});if(input.patch)checkProject({...current,...input.patch});
   }else if(/^\/api\/admin\/submissions\/[a-f0-9-]+$/.test(path)&&method==='POST'&&input.action==='approve'){
    const info=await call('__correction_info',{submissionId:path.split('/')[4]},'GET'),patch=input.patch||(info.patch?JSON.parse(info.patch):null);if(!patch)fail(400,'Enter reviewed project fields.');const project=sourceProject({...info.current,...patch},info.current);checkProject(project);input={...input,patch,_expectedRevision:info.current.revision,_project:project,_derived:await deriveProject(project,info.policy)};
   }else if(path==='/api/admin/duplicates/commit'&&method==='POST'){
    const info=await call('__merge_info',{token:input.token},'GET');checkProject({...info.result,meetings:[],sources:[],permitNumbers:[]});input={token:input.token,_derived:await deriveProject(info.result,info.policy)};
   }else if(path==='/api/admin/duplicates/undo'&&method==='POST'){
    const info=await call('__undo_info',{decisionId:input.decisionId},'GET'),derived:any={};for(const p of info.profiles)derived[p.id]=await deriveProject(p.data,info.policies[p.id]);input={...input,_derivedById:derived};
   }else if(/^\/api\/admin\/archives\/records\/[A-Za-z0-9-]{1,160}$/.test(path)&&method==='PUT'){
    const info=await call(path,{},'GET');let policy;try{if(input.communityEvidence)validateSourceEvidence(input.communityEvidence);policy=policyValues(input.approval||null,input.schedules||[]);}catch(e:any){fail(400,e.message);}
    input={...input,_policy:policy,_derived:await deriveProject(info.project,{approval_evidence:input.approval,schedules:input.schedules||[]})};
   }else if(path==='/api/admin/research/commit'&&method==='POST'){
    const info=await call('__research_info',{token:input.token},'GET'),project=info.milestone?info.current:sourceProject(info.result,info.current);checkProject(project);const derived=await deriveProject(project,info.policy);if(info.milestone)derived.recordEvents=[info.milestone];input={token:input.token,confirmation:input.confirmation,_project:project,_derived:derived};
   }
   let result=await call(path,input);
   if(path==='/api/admin/invitations'&&method==='POST'){
    if(!config.PUBLIC_APP_URL)fail(503,'Configure the public app URL before inviting collaborators.');result={url:config.PUBLIC_APP_URL.replace(/\/$/,'')+'/?invite='+encodeURIComponent(result.token),email:result.email,expires:result.expires};
   }
   if(/^\/api\/admin\/duplicates\/pairs\/[a-f0-9]{64}\/preview$/.test(path)&&method==='POST')checkProject({...result.result,meetings:[],sources:[],permitNumbers:[]});
   if(/^\/api\/admin\/research\/[a-f0-9]{64}\/preview$/.test(path)&&method==='POST')checkProject(result.after);
   if(deps.waitUntil&&path.startsWith('/api/admin/archives/')&&method==='POST'&&result?.id&&['preparing','running'].includes(result.status)&&!jobs.has(result.id)){
    const id=result.id;jobs.add(id);deps.waitUntil((async()=>{const deadline=Date.now()+90000;try{let state=result,steps=0;while(['preparing','running'].includes(state.status)&&Date.now()<deadline&&steps++<64)state=await call('__archive_step',{operationId:id},'GET',{});if(['preparing','running'].includes(state.status))await call('__archive_checkpoint',{operationId:id},'GET',{});}catch{ /* Database checkpoints preserve completed batches; resume through admin UI. */ }finally{jobs.delete(id);}})());
   }
   if(deps.waitUntil&&config.PUSH_DELIVERY_ENABLED==='true')deps.waitUntil(deliverPush(deps.rpc,config).catch(()=>{}));
   return Response.json(result,{headers});
  }catch(e:any){
   const match=/BW(\d{3}):([\s\S]*)/.exec(e.message||''),status=match?Number(match[1]):e.status||(['22P02','22003','22007','22008'].includes(e.code)?400:503);
   return Response.json({error:match?match[2]:e.status?e.message:status===400?'Invalid request parameters.':'Cloud backend is unavailable. Please retry.'},{status,headers});
  }
 };
}
