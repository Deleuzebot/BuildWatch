import assert from'node:assert/strict';
import{readFileSync,readdirSync,statSync,writeFileSync}from'node:fs';
import{join,relative,resolve}from'node:path';
import{createHash}from'node:crypto';
process.chdir(resolve(import.meta.dirname,'..'));
const deployment=JSON.parse(readFileSync('hosting/deployment.json')),config=JSON.parse(readFileSync('config/public-web.json')),base=deployment.productionURL;
const checks=[];const hash=b=>createHash('sha256').update(b).digest('hex');
async function assets(dir){for(const entry of readdirSync(dir)){const path=join(dir,entry);if(statSync(path).isDirectory()){await assets(path);continue;}const name=relative('dist-public',path);if(name.startsWith('_headers')||name.startsWith('_redirects'))continue;const response=await fetch(base+'/'+name,{signal:AbortSignal.timeout(20000)});assert.equal(response.status,200,name);assert.equal(hash(Buffer.from(await response.arrayBuffer())),hash(readFileSync(path)),name+' differs from checked build');checks.push('Cloudflare asset '+name);}}
await assets('dist-public');
const page=await fetch(base+'/');assert.equal(page.status,200);assert.ok(page.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"));assert.equal(page.headers.get('x-content-type-options'),'nosniff');assert.match(page.headers.get('cache-control'),/no-cache/);checks.push('HTTPS root and security headers');
const route=await fetch(base+'/explore');assert.equal(route.status,200);assert.match(await route.text(),/<title>BuildWatch<\/title>/);checks.push('SPA fallback');
const headers={apikey:config.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json',Origin:base};
const rpc=await fetch(config.EXPO_PUBLIC_SUPABASE_URL+'/rest/v1/rpc/buildwatch_read',{method:'POST',headers,body:JSON.stringify({path:'/api/catalog',query:{}})});assert.equal(rpc.status,200);const catalog=await rpc.json();assert.ok(catalog.total>0);assert.ok(['*',base].includes(rpc.headers.get('access-control-allow-origin')));checks.push('Public production-origin Supabase catalog');
const preflight=await fetch(config.EXPO_PUBLIC_SUPABASE_URL+'/functions/v1/buildwatch/api/me',{method:'OPTIONS',headers:{Origin:base,'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization,apikey,content-type'}});assert.equal(preflight.status,204);assert.ok(['*',base].includes(preflight.headers.get('access-control-allow-origin')));checks.push('Auth0-token Edge CORS preflight');
const forged=await fetch(config.EXPO_PUBLIC_SUPABASE_URL+'/functions/v1/buildwatch/api/admin/users',{headers:{Origin:base,Authorization:'Bearer invalid'}});assert.equal(forged.status,401);checks.push('Unauthorized admin access rejected');
writeFileSync('../../work/public-deployment/production-verification.json',JSON.stringify({passed:true,url:base,checks,publicProjects:catalog.total,staticOnly:true},null,2));console.log(JSON.stringify({passed:true,url:base,checks:checks.length,publicProjects:catalog.total}));
