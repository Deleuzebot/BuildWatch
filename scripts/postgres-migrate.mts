import {DatabaseSync,backup}from'node:sqlite';
import{mkdirSync,writeFileSync}from'node:fs';
import{resolve,dirname}from'node:path';
import{loadPostgresEnvironment,PostgresDatabase}from'../server/postgres/connection';
import{migrateSnapshot}from'../server/postgres/migrate';
loadPostgresEnvironment();
const input=resolve(process.argv[2]||'server/data/projects.json.sqlite'),folder=resolve('../../work/supabase-migration');mkdirSync(folder,{recursive:true,mode:0o700});
const backupPath=folder+'/snapshot-'+Date.now()+'.sqlite',source=new DatabaseSync(input,{readOnly:true});await backup(source,backupPath);source.close();
const snapshot=new DatabaseSync(backupPath,{readOnly:true}),db=new PostgresDatabase();
let committed=false;
try{
 const result=await db.transaction(async()=>{
  await db.query("SELECT pg_advisory_xact_lock(72644321)");
  return migrateSnapshot(db,snapshot);
 });
 committed=true;
 const sizes=await db.rows("SELECT relname name,pg_total_relation_size(relid)::float8 bytes FROM pg_catalog.pg_statio_user_tables WHERE schemaname='buildwatch' ORDER BY bytes DESC");
 const database=await db.one('SELECT pg_database_size(current_database())::float8 bytes');
 writeFileSync(folder+'/cloud-import-report.json',JSON.stringify({...result,sizes,database,backupPath},null,2),{mode:0o600});
 console.log(JSON.stringify({alreadyImported:result.alreadyImported,tables:Object.keys(result.verification.actual).length,projects:result.verification.actual.projects.count,history:result.verification.actual.history.count,public:result.verification.publicProjects,differences:result.verification.differences,databaseBytes:database.bytes}));
}catch(e:any){console.error(JSON.stringify({error:committed?'Cloud import committed, but post-import reporting failed. SQLite remains primary.':'Migration stopped; cloud transaction rolled back. SQLite remains primary.',code:e.code||'MIGRATION',detail:e.code?undefined:e.message}));process.exitCode=1;}finally{snapshot.close();await db.close();}
