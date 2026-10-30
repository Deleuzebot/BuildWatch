import type{Finding,Source}from'./policy';
import{mappedStatus}from'./policy';
import{statuses}from'../../src/data/projects';
import{exactDate}from'../archives/policy';
const clean=(v:any)=>String(v??'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,8000);
const first=(a:any,names:string[])=>{for(const k of names)if(a[k]!==null&&a[k]!==undefined&&clean(a[k]))return clean(a[k]);return '';};
export function isoDate(v:any){
 if(typeof v==='number'&&Number.isFinite(v)&&v>=100000000000&&v<8640000000000000)return new Date(v).toISOString();
 if(typeof v==='string'&&exactDate(v)!==undefined)return v;
 return undefined;
}
/** A source-specific mapping must fail visibly if the published schema changes. */
export function validateSourceSchema(s:Source,metadata:any){
 if(metadata.error||!Array.isArray(metadata.fields))throw Error('Official source metadata is unavailable');
 const fields=new Map<string,any>(metadata.fields.map((v:any)=>[v.name,v]));
 for(const [name,type] of Object.entries(s.config.expectedFieldTypes||{}))if(fields.get(name)?.type!==type)throw Error('Official source field type changed: '+name);
 for(const name of s.config.requiredFields||[])if(!fields.has(name))throw Error('Official source schema changed: missing '+name);
 for(const term of (s.config.orderByFields||'').split(',').filter(Boolean)){const m=term.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)(?: (ASC|DESC))?$/);if(!m||!fields.has(m[1]))throw Error('Invalid official source ordering field');}
 for(const[field,expected]of Object.entries(s.config.expectedDomains||{})){
  const domain=fields.get(field)?.domain?.codedValues;
  if(!Array.isArray(domain))throw Error('Official source schema changed: missing coded domain '+field);
  for(const[code,label]of Object.entries(expected as Record<string,string>))if(!domain.some((v:any)=>String(v.code)===code&&v.name===label))throw Error('Official source coded meaning changed: '+field+' '+code);
 }
}
export function sourcePage(s:Source,cursor:number,size=50){
 const limit=Math.max(1,Math.min(500,Math.floor(size)||50));
 const u=new URL(s.url);if(s.adapter==='arcgis'){
  const keyset=s.config.pagination==='oid_keyset',id=s.config.idField||'OBJECTID';
  if(keyset&&(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(id)||!Number.isSafeInteger(cursor)||cursor < -1))throw Error('Invalid keyset source cursor');
  const predicate=s.config.where||'1=1';if(typeof predicate!=='string'||predicate.length>4000||/[;\x00]/.test(predicate))throw Error('Invalid registered source filter');
  u.pathname+='/query';u.search=new URLSearchParams({f:'json',where:keyset?`(${predicate}) AND ${id}>${cursor}`:predicate,outFields:s.config.requiredFields?.length?[...new Set([id,s.config.originalIdentityField,...s.config.requiredFields].filter(Boolean))].join(','):'*',outSR:'4326',returnGeometry:'true',orderByFields:keyset?id+' ASC':s.config.orderByFields||id,...(keyset?{}:{resultOffset:String(cursor)}),resultRecordCount:String(limit)}).toString();}
 else if(s.adapter==='cary')u.search=new URLSearchParams({limit:String(limit),offset:String(cursor),order_by:'applicationnumber ASC'}).toString();
 return u.href;
}
function geometryBounds(geometry:any){
 const parts=geometry?.rings||geometry?.paths;if(!Array.isArray(parts))return undefined;
 const points=parts.flat().filter((v:any)=>Array.isArray(v)&&v.length>=2&&Number.isFinite(v[0])&&Math.abs(v[0])<=180&&Number.isFinite(v[1])&&Math.abs(v[1])<=90);
 if(!points.length)return undefined;
 return points.reduce((b:any,p:number[])=>({west:Math.min(b.west,p[0]),south:Math.min(b.south,p[1]),east:Math.max(b.east,p[0]),north:Math.max(b.north,p[1])}),{west:180,south:90,east:-180,north:-90});
}
export function parsePage(s:Source,body:string,size=50):{findings:Finding[];more:boolean;count:number;nextCursor?:number;firstCursor?:number}{
 const json=JSON.parse(body);if(json.error)throw Error('Government API error: '+clean(json.error.message));
 const rows=s.adapter==='arcgis'?json.features:json.results;if(!Array.isArray(rows)||rows.length>Math.max(1,Math.min(500,Math.floor(size)||50)))throw Error('Source page shape or size changed');
 const fields=s.config.fields||{};
 const keyset=s.config.pagination==='oid_keyset',ids=keyset?rows.map((r:any)=>r.attributes?.[s.config.idField||'OBJECTID']):[];
 if(keyset&&ids.some((id:any,i:number)=>!Number.isSafeInteger(id)||id<0||i>0&&id<=ids[i-1]))throw Error('Unstable or duplicate official keyset identifiers');
 const findings=rows.map((row:any):Finding=>{
  const a=row.attributes||row,id=first(a,[s.config.originalIdentityField||s.config.idField||'OBJECTID','FID','applicationnumber']),geometry=s.adapter==='cary'?{x:a.geo_point_2d?.lon,y:a.geo_point_2d?.lat}:row.geometry;
  const value=(key:string,defaults:string[])=>first(a,fields[key]?[fields[key]]:defaults);
  const name=value('name',['applicationname','Name','ProjectName','NAME','projname','Development','name']);
  const description=value('description',['summarydescription','Description','description','PROJECT_DESCRIPTION']);
  const rawStatus=value('status',['status','Status','Status_1','RecordStatus','projstatus']);
  const rawCategory=value('category',['usecategory','usetype','Category','Type']);
  const statusLabel=s.config.statusLabels?.[rawStatus]||rawStatus;
  const category=s.config.categoryValues?.[rawCategory]||rawCategory;
  const mapped=s.config.statusValues?.[rawStatus];
  const status=mapped&&statuses.includes(mapped)?mapped:mappedStatus(rawStatus);
  // Only an explicitly configured milestone date may become eventDate.
  const eventDate=fields.eventDate?isoDate(a[fields.eventDate]):undefined;
  const sourceDates:Record<string,string>={};
  for(const[key,field]of Object.entries(s.config.dateFields||{})){const date=isoDate(a[field as string]);if(date)sourceDates[key]=date;}
  const sourceFacts:Record<string,string|number>={};
  for(const[key,field]of Object.entries(s.config.factFields||{})){const raw=a[field as string];if(typeof raw==='number'&&Number.isFinite(raw))sourceFacts[key]=raw;else if(typeof raw==='string'&&raw.trim())sourceFacts[key]=clean(raw);}
  if(sourceFacts.residentialUse&&s.config.subtypeValues?.[sourceFacts.residentialUse])sourceFacts.residentialUseLabel=s.config.subtypeValues[sourceFacts.residentialUse];
  const query=new URL(s.url);if(s.adapter==='arcgis'){query.pathname+='/query';query.search=new URLSearchParams({f:'json',objectIds:String(a[s.config.idField||'OBJECTID']??id),outFields:'*',outSR:'4326'}).toString();}else query.search=new URLSearchParams({where:'applicationnumber="'+id.replaceAll('"','')+'"'}).toString();
  const point=geometry&&Number.isFinite(geometry.x)&&Number.isFinite(geometry.y)&&Math.abs(geometry.x)<=180&&Math.abs(geometry.y)<=90;
  const bounds=geometryBounds(geometry),locationEvidence:Finding['locationEvidence']={type:point?'point':bounds?(geometry.paths?'polyline':'polygon'):'unavailable',...(bounds?{bounds}:{}),url:query.href};
  const reviewNotes=(s.config.reviewPhrases||[]).filter((phrase:string)=>description.toLowerCase().includes(phrase.toLowerCase())).map((phrase:string)=>'Official comments require review: '+phrase);
  const evidenceFields:Record<string,unknown>={};
  for(const field of new Set<string>([...Object.values(fields),...Object.values(s.config.dateFields||{}),...Object.values(s.config.factFields||{})] as string[]))if(a[field]!==undefined)evidenceFields[field]=a[field];
  return{externalId:id,name,description,address:value('address',['Address','ADDRESS','address','MainAddress']),latitude:point?geometry.y:null,longitude:point?geometry.x:null,rawStatus,status,statusLabel,eventDate,publishedAt:fields.publishedAt?isoDate(a[fields.publishedAt]):undefined,category,rawCategory,developer:value('developer',['Developer','developer','Applicant']),url:query.href,quote:JSON.stringify({id,name,status:rawStatus,statusLabel,eventDate,description,fields:evidenceFields}).slice(0,4000),principalUseVerified:s.config.scopeVerified===true,locationVerified:!!point,wholeDevelopment:s.config.statusScope==='development',mappingVersion:s.config.mappingVersion,sourceDates,sourceFacts,locationEvidence,reviewNotes};
 });
 return{findings,more:s.adapter==='arcgis'?json.exceededTransferLimit===true:rows.length===size,count:rows.length,...(keyset&&ids.length?{nextCursor:ids.at(-1),firstCursor:ids[0]}:{})};
}
