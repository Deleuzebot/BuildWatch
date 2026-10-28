/** Operator-only setup: credential values are never printed. */
import{randomBytes}from'node:crypto';import{writeFileSync,existsSync,readFileSync}from'node:fs';import{spawnSync}from'node:child_process';
import{loadPostgresEnvironment,PostgresDatabase}from'../server/postgres/connection';
loadPostgresEnvironment();const db=new PostgresDatabase(),file='.env.maintenance';
try{
 if(existsSync(file))throw Error('Worker credential file already exists. Reuse it; do not rotate implicitly.');
 const secret=randomBytes(36).toString('base64url');
 await db.transaction(async()=>{
  if(await db.one("SELECT 1 FROM pg_roles WHERE rolname='buildwatch_ci'"))throw Error('Worker login already exists; explicit recovery/rotation is required.');
  await db.query("SELECT format('CREATE ROLE buildwatch_ci LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',$1::text) sql",[secret]).then(async row=>db.query(row.rows[0].sql));
  await db.query('GRANT buildwatch_worker TO buildwatch_ci');
  await db.query("ALTER ROLE buildwatch_ci SET statement_timeout='15s'");
  await db.query("ALTER ROLE buildwatch_ci CONNECTION LIMIT 2");
 });
 const e=process.env,baseUser='buildwatch_ci.'+e.PGUSER!.split('.').slice(1).join('.');
 const values={PGHOST:e.PGHOST!,PGPORT:e.PGPORT||'5432',PGDATABASE:e.PGDATABASE||'postgres',PGUSER:baseUser,PGPASSWORD:secret,PGPOOL_MAX:'1',PGSSLROOTCERT:e.PGSSLROOTCERT||''};
 writeFileSync(file,Object.entries(values).map(([k,v])=>k+'='+v).join('\n')+'\n',{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({created:true,role:'buildwatch_ci',scope:'maintenance RPC only',credentialPrinted:false}));
}finally{await db.close();}
