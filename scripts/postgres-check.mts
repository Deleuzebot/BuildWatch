import{loadPostgresEnvironment,PostgresDatabase}from'../server/postgres/connection';
loadPostgresEnvironment();const db=new PostgresDatabase();
try{
 const result=await db.one(`SELECT current_database() database,pg_database_size(current_database())::float8 bytes,
  (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='buildwatch') existing_app_tables`);
 console.log(JSON.stringify(result));
}catch(e:any){console.error(JSON.stringify({error:'PostgreSQL connection check failed',code:e.code||'CONNECTION',detail:e.code==='28P01'?'Database password was rejected.':undefined}));process.exitCode=1;}finally{await db.close();}
