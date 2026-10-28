import {Pool,types,type PoolConfig,type PoolClient} from 'pg';
import {readFileSync,existsSync} from 'node:fs';
import {AsyncLocalStorage} from 'node:async_hooks';
export function loadPostgresEnvironment(){if(existsSync('.env.supabase'))process.loadEnvFile('.env.supabase');}
export function postgresConfig():PoolConfig{
 const e=process.env;
 if(!e.PGHOST||!e.PGUSER||!e.PGPASSWORD)throw Error('Set PGHOST, PGUSER and PGPASSWORD in the server-only .env.supabase file.');
 const max=Number(e.PGPOOL_MAX||3);
 if(!Number.isInteger(max)||max<1||max>10)throw Error('PGPOOL_MAX must be between 1 and 10.');
 return {host:e.PGHOST,port:Number(e.PGPORT||5432),user:e.PGUSER,password:e.PGPASSWORD,database:e.PGDATABASE||'postgres',max,
  types:{getTypeParser(oid:number,format:any){if(oid===20)return(value:string)=>{const n=Number(value);if(!Number.isSafeInteger(n))throw Error('PostgreSQL integer exceeds JavaScript safe range');return n;};return types.getTypeParser(oid,format);}},
  ssl:{rejectUnauthorized:true,...(e.PGSSLROOTCERT?{ca:readFileSync(e.PGSSLROOTCERT,'utf8')}:{})},
  connectionTimeoutMillis:10000,idleTimeoutMillis:30000,statement_timeout:30000,application_name:'buildwatch-backend'};
}
/** Native asynchronous Postgres access; one pooled connection per transaction. */
export class PostgresDatabase{
 readonly pool:Pool;private context=new AsyncLocalStorage<PoolClient>();private initialized=new WeakSet<PoolClient>();
 constructor(config:PoolConfig=postgresConfig()){
  this.pool=new Pool(config);
  // This project defaults extra_float_digits to 0, which rounds coordinates on
  // output. Preserve IEEE-754 values exactly for map parity and import hashes.
  this.pool.on('error',()=>console.error('BuildWatch PostgreSQL connection interrupted.'));
 }
 private async initialize(client:PoolClient){if(!this.initialized.has(client)){
  // Small, interactive queries should not pay JIT compilation cost on Nano.
  await client.query('SET extra_float_digits=3; SET jit=off');this.initialized.add(client);
 }}
 async query<T extends Record<string,any>=any>(sql:string,args:any[]=[]){
  const current=this.context.getStore();if(current)return current.query<T>(sql,args);
  const client=await this.pool.connect();try{await this.initialize(client);return await client.query<T>(sql,args);}finally{client.release();}
 }
 async rows<T extends Record<string,any>=any>(sql:string,args:any[]=[]){return(await this.query<T>(sql,args)).rows;}
 async one<T extends Record<string,any>=any>(sql:string,args:any[]=[]){return(await this.rows<T>(sql,args))[0];}
 async transaction<T>(fn:()=>Promise<T>,readOnly=false):Promise<T>{
  if(this.context.getStore())throw Error('Nested transactions must use an explicit savepoint.');
  const client=await this.pool.connect();
  try{await this.initialize(client);await client.query(readOnly?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN ISOLATION LEVEL SERIALIZABLE');
   const result=await this.context.run(client,fn);await client.query('COMMIT');return result;
  }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
 }
 async close(){await this.pool.end();}
}
