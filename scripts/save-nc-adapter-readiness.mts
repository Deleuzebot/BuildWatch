/** Store reviewable adapter builds in the existing private source registry. */
import {readFileSync,writeFileSync} from 'node:fs';import {loadPostgresEnvironment,PostgresDatabase} from '../server/postgres/connection';
loadPostgresEnvironment();const db=new PostgresDatabase();
try{
 const entries=JSON.parse(readFileSync('config/maintenance/nc-adapter-builds.json','utf8')).entries,fixtures=JSON.parse(readFileSync('config/maintenance/nc-adapter-fixture-results.json','utf8')).results;
 const control=await db.one('SELECT * FROM buildwatch.maintenance_control WHERE id=1');if(control.schedule_enabled||control.writes_enabled)throw Error('Keep dry-run gates off');
 let updated=0;for(const e of entries){const fixture=fixtures.find((f:any)=>f.name===e.name&&f.type===e.type);
  const value={readiness:e.status,adapterBuildVersion:'nc-document-index-v2-2026-10-29',adapterBlockers:e.errors,adapterFixture:fixture||null,compiledAdapter:e.adapter?{url:e.adapter.url,adapter:e.adapter.adapter,config:e.adapter.config}:null};
  const r=await db.query("UPDATE buildwatch.maintenance_sources SET config=config||$2::jsonb WHERE id=$1 AND NOT enabled AND NOT autopublish",[e.sourceId,JSON.stringify(value)]);updated+=r.rowCount||0;
 }
 console.log(JSON.stringify({updated,enabled:0,projectWrites:0}));
}finally{await db.close();}
