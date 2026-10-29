/** Add official review-only alternatives, preserving legacy sources and project references. */
import {readFileSync,writeFileSync} from 'node:fs';import {hash} from '../server/maintenance/policy';import {loadPostgresEnvironment,PostgresDatabase} from '../server/postgres/connection';
loadPostgresEnvironment();const db=new PostgresDatabase(),sources=JSON.parse(readFileSync('config/maintenance/nc-alternatives.json','utf8'));
try{await db.transaction(async()=>{
 const control=await db.one('SELECT * FROM buildwatch.maintenance_control WHERE id=1');if(control.schedule_enabled||control.writes_enabled)throw Error('Keep scheduling and writes off');
 const registry=JSON.parse(readFileSync('config/maintenance/nc-registry.json','utf8'));
 for(const s of sources){
  const id='source-'+hash(s.url).slice(0,30),config={...s.config,permissionEvidence:s.permissionEvidence};
  await db.query("INSERT INTO buildwatch.maintenance_sources(id,state,jurisdiction,url,adapter,authority,config) VALUES($1,'NC',$2,$3,$4,$5,$6::jsonb) ON CONFLICT(state,url) DO NOTHING",[id,s.jurisdiction,s.url,s.adapter,s.authority,JSON.stringify(config)]);
  if(s.originalSourceId)await db.query('INSERT INTO buildwatch.maintenance_refs(source_id,external_id,project_id) SELECT $1,external_id,project_id FROM buildwatch.maintenance_refs WHERE source_id=$2 ON CONFLICT DO NOTHING',[id,s.originalSourceId]);
  if(!registry.some((r:any)=>r.sourceId===id))registry.push({sourceId:id,jurisdiction:s.jurisdiction,url:s.url,previouslyBlocked:false});
  console.log(JSON.stringify({sourceId:id,jurisdiction:s.jurisdiction,autopublish:false}));
 }
 writeFileSync('config/maintenance/nc-registry.json',JSON.stringify(registry,null,2)+'\n');
});}finally{await db.close();}
