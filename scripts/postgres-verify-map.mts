import{loadPostgresEnvironment,PostgresDatabase}from'../server/postgres/connection';
import{PostgresMapQueries}from'../server/postgres/map';
import{DatabaseSync}from'node:sqlite';
import{MapQueries}from'../server/map/queries';
import{writeFileSync}from'node:fs';
loadPostgresEnvironment();const db=new PostgresDatabase(),sqlite=new DatabaseSync(process.argv[2]||'server/data/projects.json.sqlite',{readOnly:true});sqlite.function('bw_now',()=>Date.now());
const old=new MapQueries(sqlite),pg=new PostgresMapQueries(db),bounds={west:-85,south:33,east:-75,north:37},cases=[{},...['Proposed','In review','Approved','Under construction'].map(status=>({status})),...['Residential','Mixed-Use','Commercial','Industrial','Civic','Transportation','Utilities','Environment'].map(type=>({types:[type]})),{search:'apartments'},{activity:'30d' as const},{activity:'1y' as const},{activity:'5y' as const}];
try{
 const report=await db.transaction(async()=>{
  const results=[];
  for(const filters of cases){const start=performance.now(),a=old.browse(filters),b=await pg.browse(filters);const x=old.map(filters,bounds,7),y=await pg.map(filters,bounds,7);
   const shape=(nodes:any[])=>nodes.map(n=>({id:n.id,count:n.count,state:n.state,projectId:n.projectId})).sort((a,b)=>a.id.localeCompare(b.id));
   const sorted=(value:any):string=>JSON.stringify(value,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
   const idsMatch=JSON.stringify(a.items.map(p=>p.id))===JSON.stringify(b.items.map(p=>p.id)),summariesMatch=sorted(a.items)===sorted(b.items),clustersMatch=JSON.stringify(shape(x.nodes))===JSON.stringify(shape(y.nodes));
   if(a.total!==b.total||x.total!==y.total||!idsMatch||!summariesMatch||!clustersMatch||a.nextCursor!==b.nextCursor||y.nodes.length>512||y.nodes.reduce((sum,n)=>sum+n.count,0)!==y.total)throw Error('Map parity failed for '+JSON.stringify(filters));
   results.push({filters,total:b.total,nodes:y.nodes.length,milliseconds:Math.round(performance.now()-start),idsMatch,summariesMatch,clustersMatch});
  }
  const a=old.meetings({}),b=await pg.meetings({});if(a.total!==b.total||JSON.stringify(a.items.map(m=>m.id))!==JSON.stringify(b.items.map(m=>m.id)))throw Error('Meeting parity failed');
  const privateAccess=await db.rows("SELECT c.relname,c.relrowsecurity,has_table_privilege('anon',c.oid,'SELECT') anon,has_table_privilege('authenticated',c.oid,'SELECT') authenticated FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='buildwatch' AND c.relkind='r'");
  if(privateAccess.some(r=>!r.relrowsecurity||r.anon||r.authenticated))throw Error('Private table access check failed');
  return{results,meetings:b.total,privateTablesVerified:privateAccess.length};
 },true);
 writeFileSync('../../work/supabase-migration/map-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(e:any){console.error(JSON.stringify({error:'Postgres map verification failed',code:e.code||'PARITY',detail:!e.code||['42703','42883'].includes(e.code)?e.message:undefined}));process.exitCode=1;}finally{sqlite.close();await db.close();}
