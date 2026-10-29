/** Smaller geometry pages for the existing transportation dry-run checkpoint. */
import {loadPostgresEnvironment,PostgresDatabase} from '../server/postgres/connection';
import {runState,type WorkerRPC} from '../server/maintenance/worker';
loadPostgresEnvironment();const db=new PostgresDatabase();
const rpc:WorkerRPC=async(action,input={})=>(await db.one('SELECT public.buildwatch_maintenance_worker($1,$2::jsonb) value',[action,JSON.stringify(input)])).value;
rpc.batch=async(action,inputs)=>(await db.rows('SELECT public.buildwatch_maintenance_worker($1,x.value) value FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY x(value,n) ORDER BY x.n',[action,JSON.stringify(inputs)])).map(r=>r.value);
try{
 const control=await rpc('states');if(control.control.schedule_enabled||control.control.writes_enabled)throw Error('Dry-run safety gates must remain off');
 await db.query("UPDATE buildwatch.maintenance_states SET max_requests=8 WHERE state='NC' AND max_requests=80");
 console.log(JSON.stringify(await runState(rpc,{state:'NC',mode:'initial',dryRun:true,key:'nc-source-repair:40788582824:source-76f889f9a4b34e167e03b6c7803626',onlySource:'source-76f889f9a4b34e167e03b6c7803626',pageSize:100,maxRequests:8,maxRecords:2000,maxSeconds:220})));
}finally{await db.query("UPDATE buildwatch.maintenance_states SET max_requests=80 WHERE state='NC' AND max_requests=8");await db.close();}
