/** Read-only checks of BuildWatch's own deployment, not government-source research. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import assert from 'node:assert/strict';
const config=JSON.parse(readFileSync('config/public-web.json','utf8')),origin='https://buildwatch-3ky.pages.dev',controller=AbortSignal.timeout(30000);
let requests=0;const get=async(url:string,init:RequestInit={})=>{requests++;const r=await fetch(url,{...init,signal:controller});if(!r.ok)throw Error('Own deployment verification returned HTTP '+r.status);return r;};
assert.equal(config.EXPO_PUBLIC_BACKEND,'supabase');
const html=await(await get(origin+'/')).text(),scripts=[...html.matchAll(/<script\b[^>]*src=["']([^"']+)/gi)].map(m=>new URL(m[1],origin)).filter(u=>u.origin===origin&&u.pathname.includes('/_expo/static/js/'));
assert.equal(scripts.length,1,'Expected one same-origin Expo web bundle');
const bundle=await(await get(scripts[0].href)).text();assert.ok(bundle.includes(config.EXPO_PUBLIC_SUPABASE_URL));assert.ok(bundle.includes('/rest/v1/rpc/buildwatch_read'));assert.ok(bundle.includes('/functions/v1/buildwatch'));
const read=async(path:string)=> (await get(config.EXPO_PUBLIC_SUPABASE_URL+'/rest/v1/rpc/buildwatch_read',{method:'POST',headers:{apikey:config.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({path,query:{}})})).json();
const catalog=await read('/api/catalog'),project=await read('/api/public/projects/nc-local-82a43dcb917317');assert.equal(project.id,'nc-local-82a43dcb917317');
const profiles=JSON.parse(readFileSync('eas.json','utf8')).build;
const result={checkedAt:new Date().toISOString(),ownServiceRequests:requests,governmentResearchRequests:0,website:origin,deployedBundleContainsSupabase:true,publicCatalogResponded:!!catalog.version,projectDetailResponded:project.id,projectStatus:project.status,nativeSourceUsesSharedTransport:readFileSync('src/lib/useMapBrowser.ts','utf8').includes('mapRequest<Project>'),nativeBuildProfiles:Object.fromEntries(Object.entries(profiles).map(([name,p]:any)=>[name,{configuredForSupabase:p.env?.EXPO_PUBLIC_BACKEND==='supabase'&&p.env?.EXPO_PUBLIC_SUPABASE_URL===config.EXPO_PUBLIC_SUPABASE_URL}])),nativeBinaryTested:false,publicWrites:0};
mkdirSync('reports/maintenance',{recursive:true});writeFileSync('reports/maintenance/CLOUD-DATA-PATH.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
