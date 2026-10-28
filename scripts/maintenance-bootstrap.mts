/** Operator-only additive source inventory. Never changes a project. */
import{loadPostgresEnvironment,PostgresDatabase}from'../server/postgres/connection';
import{hash}from'../server/maintenance/policy';
loadPostgresEnvironment();const db=new PostgresDatabase();let cursor=0,sources=0,refs=0;
try{
 while(true){
 const rows=await db.rows('SELECT rowid,id,data::jsonb data FROM buildwatch.projects WHERE rowid>$1 ORDER BY rowid LIMIT 200',[cursor]);if(!rows.length)break;
 await db.transaction(async()=>{for(const p of rows){cursor=p.rowid;if(p.data.state!=='NC')continue;
 for(const link of p.data.sources||[]){let u:URL;try{u=new URL(link.url);}catch{continue;}
 const arcgis=/\/(?:FeatureServer|MapServer)\/\d+\/query$/i.test(u.pathname),cary=u.origin==='https://data.townofcary.org'&&u.pathname.endsWith('/developments/records');if(!arcgis&&!cary)continue;
 const root=arcgis?u.origin+u.pathname.replace(/\/query$/i,''):u.origin+u.pathname,id='source-'+hash(root).slice(0,30);
 const where=u.searchParams.get('where')||'',m=where.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:'([^']+)'|"([^"]+)"|(\d+))\s*$/),external=m&&(m[2]||m[3]||m[4]);
 const config={scopeVerified:false,statusScope:'application',originalIdentityField:m?.[1]||null};
 await db.query("INSERT INTO buildwatch.maintenance_sources(id,state,jurisdiction,url,adapter,authority,config) VALUES($1,'NC',$2,$3,$4,'official',$5::jsonb) ON CONFLICT(state,url) DO NOTHING",[id,p.data.jurisdiction||p.data.city||p.data.county||'North Carolina',root,arcgis?'arcgis':'cary',JSON.stringify(config)]);sources++;
 if(external){await db.query('INSERT INTO buildwatch.maintenance_refs(source_id,external_id,project_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[id,external,p.id]);refs++;}
 }
 }});
 }
 console.log(JSON.stringify({sourceReferencesProcessed:sources,identityReferencesProcessed:refs,projectWrites:0,autoPublishSources:0}));
}finally{await db.close();}
