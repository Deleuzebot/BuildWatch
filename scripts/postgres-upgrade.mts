import{readFileSync}from'node:fs';
import{loadPostgresEnvironment,PostgresDatabase}from'../server/postgres/connection';
loadPostgresEnvironment();const db=new PostgresDatabase();
try{
 await db.transaction(async()=>{
  await db.query('SELECT pg_advisory_xact_lock(72644321)');
  for(const file of['004-geometry-view.sql','005-active-index.sql'])await db.query(readFileSync(new URL('../server/postgres/migrations/'+file,import.meta.url),'utf8'));
 });console.log('Staged PostgreSQL views upgraded; original records unchanged.');
}catch(e:any){console.error(JSON.stringify({error:'Postgres view upgrade rolled back',code:e.code||'CONNECTION'}));process.exitCode=1;}finally{await db.close();}
