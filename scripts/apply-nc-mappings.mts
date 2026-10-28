/** Operator-only, source configuration only. Never writes projects or enables publishing. */
import {readFileSync,writeFileSync} from 'node:fs';
import {loadPostgresEnvironment,PostgresDatabase} from '../server/postgres/connection';
loadPostgresEnvironment();const db=new PostgresDatabase();
const mappings=JSON.parse(readFileSync('config/maintenance/nc-mappings.json','utf8'));
try{await db.transaction(async()=>{
 const control=await db.one('SELECT schedule_enabled,writes_enabled FROM buildwatch.maintenance_control WHERE id=1');
 if(control.schedule_enabled||control.writes_enabled)throw Error('Scheduling and project writes must remain off');
 const originals=[];
 for(const mapping of mappings){
  const source=await db.one('SELECT id,url,config,enabled,autopublish FROM buildwatch.maintenance_sources WHERE id=$1 FOR UPDATE',[mapping.sourceId]);
  if(!source||source.url!==mapping.url||source.autopublish)throw Error('Expected registered review-only source not found');
  originals.push(source);
  await db.query('UPDATE buildwatch.maintenance_sources SET config=config||$2::jsonb WHERE id=$1',[source.id,JSON.stringify({...mapping.config,mappingEvidence:{url:mapping.metadataURL,verifiedAt:mapping.verifiedAt}})]);
 }
 writeFileSync('../../work/nc-sources-before-repair-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json',JSON.stringify(originals,null,2),{flag:'wx'});
 console.log(JSON.stringify({sourceMappingsUpdated:mappings.length,projectChanges:0,scheduling:false,autopublish:false}));
});}finally{await db.close();}
