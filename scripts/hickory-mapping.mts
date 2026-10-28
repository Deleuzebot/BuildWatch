/** Operator-only, source configuration only; never enables publication. */
import{readFileSync,writeFileSync}from'node:fs';
import{loadPostgresEnvironment,PostgresDatabase}from'../server/postgres/connection';
loadPostgresEnvironment();const db=new PostgresDatabase(),mapping=JSON.parse(readFileSync('config/maintenance/hickory.json','utf8'));
try{await db.transaction(async()=>{
 const control=await db.one('SELECT schedule_enabled,writes_enabled FROM buildwatch.maintenance_control WHERE id=1');
 if(control.schedule_enabled||control.writes_enabled)throw Error('Keep schedules and writes off before applying pilot mappings.');
 const source=await db.one('SELECT id,url,config,autopublish FROM buildwatch.maintenance_sources WHERE id=$1 FOR UPDATE',[mapping.sourceId]);
 if(!source||source.url!==mapping.url||source.autopublish)throw Error('Expected review-only Hickory source not found.');
 writeFileSync('../../work/hickory-source-before.json',JSON.stringify(source,null,2));
 await db.query('UPDATE buildwatch.maintenance_sources SET config=config||$2::jsonb WHERE id=$1',[mapping.sourceId,JSON.stringify({...mapping.config,mappingEvidence:{url:mapping.metadataURL,verifiedAt:mapping.verifiedAt}})]);
 console.log(JSON.stringify({source:mapping.sourceId,mappingVersion:mapping.config.mappingVersion,sourceConfigurationUpdated:true,projectWrites:0,scheduleEnabled:false,publicationEnabled:false}));
});}finally{await db.close();}
