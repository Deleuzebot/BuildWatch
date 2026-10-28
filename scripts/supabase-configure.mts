import {readFileSync,existsSync,writeFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {loadPostgresEnvironment,PostgresDatabase} from '../server/postgres/connection';
import {verifyPostgres} from '../server/postgres/migrate';
loadPostgresEnvironment();if(existsSync('.env.server'))process.loadEnvFile('.env.server');
const db=new PostgresDatabase(),source=new DatabaseSync('server/data/projects.json.sqlite',{readOnly:true});
try{
 const report=await db.transaction(async()=>{
  await db.query('SELECT pg_advisory_xact_lock(72644321)');
  const verified=await verifyPostgres(db,source);
  if(verified.differences.length||verified.publicDifferences)throw Error('Local/cloud data differ: '+verified.differences.join(',')+'; public '+verified.publicDifferences+'. Refusing cutover.');
  const allowed=['AUTH0_ISSUER','AUTH0_AUDIENCE','AUTH0_MANAGEMENT_CLIENT_ID','AUTH0_MANAGEMENT_CLIENT_SECRET','AUTH0_PASSWORD_CLIENT_ID','AUTH0_EMAIL_CONNECTION','INVITATION_DAYS','PUBLIC_APP_URL','PRIVACY_URL','TERMS_URL','REVENUECAT_SECRET_KEY','REVENUECAT_ENTITLEMENT','REVENUECAT_WEBHOOK_SECRET','BILLING_ENABLED','BILLING_ALLOW_SANDBOX','PUSH_DELIVERY_ENABLED','EXPO_ACCESS_TOKEN'];
  const config=Object.fromEntries(allowed.filter(key=>process.env[key]).map(key=>[key,process.env[key]]));
  if(!config.AUTH0_ISSUER||!config.AUTH0_AUDIENCE||!config.AUTH0_MANAGEMENT_CLIENT_SECRET)throw Error('Existing Auth0 configuration is incomplete.');
  const existing=await db.one("SELECT id FROM vault.secrets WHERE name='buildwatch_backend_config'");
  if(existing)await db.query('SELECT vault.update_secret($1::uuid,$2,$3,$4)',[existing.id,JSON.stringify(config),'buildwatch_backend_config','BuildWatch server-only configuration']);
  else await db.query('SELECT vault.create_secret($1,$2,$3)',[JSON.stringify(config),'buildwatch_backend_config','BuildWatch server-only configuration']);
  const publicConfig={auth:true,billing:!!config.REVENUECAT_SECRET_KEY&&config.BILLING_ENABLED==='true',push:config.PUSH_DELIVERY_ENABLED==='true',linking:true,deletion:true,privacyURL:config.PRIVACY_URL||null,termsURL:config.TERMS_URL||null};
  for(const[key,value]of[['backend-config',publicConfig],['state-boundaries-2025-20m',JSON.parse(readFileSync('server/map/data/state-boundaries-2025.json','utf8'))]] as const)await db.query('INSERT INTO buildwatch.public_assets(key,data) VALUES($1,$2::jsonb) ON CONFLICT(key) DO UPDATE SET data=excluded.data',[key,JSON.stringify(value)]);
  return{verifiedTables:Object.keys(verified.actual).length,projects:verified.actual.projects.count,history:verified.actual.history.count,publicProjects:verified.publicProjects,differences:verified.differences,publicConfig,schedulesActivated:false};
 });
 writeFileSync('../../work/supabase-only/configuration.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(e:any){console.error(JSON.stringify({error:e.code?'Cloud configuration failed':e.message,code:e.code}));process.exitCode=1;}finally{source.close();await db.close();}
