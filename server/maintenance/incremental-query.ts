import type {Source} from './policy';
/** Read filters only. Date metadata narrows retrieval; it never establishes a milestone. */
export function incrementalQuery(source:Source,metadata:any,activeIds:string[],since:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(since)||new Date(since+'T00:00:00Z').toISOString().slice(0,10)!==since)throw Error('Invalid incremental date');
 const fields=new Map<string,any>((metadata.fields||[]).map((f:any)=>[f.name,f])),parts:string[]=[];
 let identityField=source.config.originalIdentityField||source.config.idField||'OBJECTID';
 const ids=[...new Set(activeIds)];
 // Existing Durham references use A_NUMBER case codes, not numeric GIS OBJECTIDs.
 const businessField=source.config.factFields?.recordNumber;
 if(ids.some(id=>!/^\d+$/.test(id))&&fields.get(identityField)?.type==='esriFieldTypeOID'&&fields.get(businessField)?.type==='esriFieldTypeString')identityField=businessField;
 const identityType=fields.get(identityField)?.type;
 if(ids.length&&/^[A-Za-z_][A-Za-z0-9_]*$/.test(identityField)){
  if(['esriFieldTypeOID','esriFieldTypeInteger','esriFieldTypeSmallInteger'].includes(identityType)&&ids.every(id=>/^\d+$/.test(id)&&Number.isSafeInteger(Number(id))))parts.push(identityField+' IN ('+ids.join(',')+')');
  else if(identityType==='esriFieldTypeString')parts.push(identityField+' IN ('+ids.map(id=>"'"+id.replaceAll("'","''")+"'").join(',')+')');
 }
 const dateFields=[...new Set(Object.values(source.config.dateFields||{}))].filter((f:any)=>fields.get(f)?.type==='esriFieldTypeDate'&&/^[A-Za-z_][A-Za-z0-9_]*$/.test(f));
 for(const field of dateFields)parts.push(field+" >= DATE '"+since+" 00:00:00'");
 if(!parts.length||parts.join(' OR ').length>3400)return{where:source.config.where||'1=1',bounded:false,identityField,reason:'No safe bounded metadata-backed query; apply per-source page ceiling'};
 return{where:'('+(source.config.where||'1=1')+') AND ('+parts.join(' OR ')+')',bounded:true,identityField,reason:'Known active identities plus metadata-typed recent dates; application and project scopes remain separate'};
}
