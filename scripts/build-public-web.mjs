import{readFileSync,writeFileSync,readdirSync,statSync,mkdirSync,copyFileSync}from'node:fs';
import{spawnSync}from'node:child_process';
import{resolve,relative,join}from'node:path';
const root=resolve(import.meta.dirname,'..');process.chdir(root);
// Only public client configuration reaches Metro. Never load server env files.
const config=JSON.parse(readFileSync('config/public-web.json','utf8'));
if(Object.keys(config).some(k=>!k.startsWith('EXPO_PUBLIC_')))throw Error('Unexpected private build configuration.');
const env={...process.env};for(const key of Object.keys(env))if(/^(EXPO_PUBLIC_|PG|AUTH0_|REVENUECAT_|SUPABASE_|CLOUDFLARE_)/.test(key))delete env[key];
Object.assign(env,config,{NODE_ENV:'production',EXPO_NO_DOTENV:'1'});
if(config.EXPO_PUBLIC_BACKEND!=='supabase'||!config.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_'))throw Error('Public deployment requires the Supabase publishable key.');
const result=spawnSync(process.execPath,['node_modules/expo/bin/cli','export','--platform','web','--output-dir','dist-public','--clear'],{env,stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);
for(const file of['_headers','_redirects'])copyFileSync('hosting/'+file,'dist-public/'+file);
const files=[];function walk(dir){for(const item of readdirSync(dir)){const file=join(dir,item),stat=statSync(file);if(stat.isDirectory())walk(file);else files.push({path:relative('dist-public',file),bytes:stat.size});}}walk('dist-public');
const forbidden=/\.(?:sqlite(?:-wal|-shm)?|db|map|pem|key|mobileprovision)$|(?:^|\/)\.env|(?:^|\/)server\//i;
for(const file of files){if(forbidden.test(file.path)||file.bytes>25*1024*1024)throw Error('Unsafe or oversized deployment asset: '+file.path);if(/\.(?:js|html|json|css|txt)$/.test(file.path)){const content=readFileSync('dist-public/'+file.path,'utf8');if(/sb_secret_[A-Za-z0-9_-]{20,}|-----BEGIN (?:RSA )?PRIVATE KEY-----[\r\n]+[A-Za-z0-9+/=]{40}|PGPASSWORD\s*=|AUTH0_MANAGEMENT_CLIENT_SECRET\s*=/.test(content))throw Error('Potential secret in '+file.path);}}
if(files.length>1000)throw Error('Dashboard upload limit exceeded; use Wrangler for deployment.');
mkdirSync('../../work/public-deployment',{recursive:true});writeFileSync('../../work/public-deployment/build.json',JSON.stringify({files:files.length,bytes:files.reduce((sum,f)=>sum+f.bytes,0),largestFile:Math.max(...files.map(f=>f.bytes)),backend:'supabase',containsServerFiles:false},null,2));
console.log('Public build checked: '+files.length+' static files. Upload dist-public only.');
