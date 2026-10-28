import type{Finding,Source}from'./policy';
import{mappedStatus}from'./policy';
const clean=(v:any)=>String(v??'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,8000);
const first=(a:any,names:string[])=>{for(const k of names)if(a[k]!==null&&a[k]!==undefined&&clean(a[k]))return clean(a[k]);return '';};
export function isoDate(v:any){if(typeof v==='number'&&v>0&&v<8640000000000000)return new Date(v).toISOString();if(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(v)&&Number.isFinite(Date.parse(v)))return v;return undefined;}
export function sourcePage(s:Source,cursor:number){
 const u=new URL(s.url);if(s.adapter==='arcgis'){u.pathname+='/query';u.search=new URLSearchParams({f:'json',where:'1=1',outFields:'*',outSR:'4326',returnGeometry:'true',orderByFields:s.config.idField||'OBJECTID',resultOffset:String(cursor),resultRecordCount:'50'}).toString();}
 else if(s.adapter==='cary')u.search=new URLSearchParams({limit:'50',offset:String(cursor),order_by:'applicationnumber ASC'}).toString();
 return u.href;
}
export function parsePage(s:Source,body:string):{findings:Finding[];more:boolean;count:number}{
 const json=JSON.parse(body);if(json.error)throw Error('Government API error: '+clean(json.error.message));
 const rows=s.adapter==='arcgis'?json.features:json.results;if(!Array.isArray(rows)||rows.length>50)throw Error('Source page shape or size changed');
 const fields=s.config.fields||{};
 const findings=rows.map((row:any):Finding=>{
  const a=row.attributes||row,id=first(a,[s.config.originalIdentityField||s.config.idField||'OBJECTID','FID','applicationnumber']),geometry=s.adapter==='cary'?{x:a.geo_point_2d?.lon,y:a.geo_point_2d?.lat}:row.geometry;
  const value=(key:string,defaults:string[])=>first(a,fields[key]?[fields[key]]:defaults);
  const rawStatus=value('status',['status','Status','Status_1','RecordStatus','projstatus']);
  const eventDate=fields.eventDate?isoDate(a[fields.eventDate]):undefined;
  const query=new URL(s.url);if(s.adapter==='arcgis'){query.pathname+='/query';query.search=new URLSearchParams({f:'json',objectIds:String(a[s.config.idField||'OBJECTID']??id),outFields:'*',outSR:'4326'}).toString();}else query.search=new URLSearchParams({where:'applicationnumber="'+id.replaceAll('"','')+'"'}).toString();
  const point=geometry&&Number.isFinite(geometry.x)&&Number.isFinite(geometry.y)&&Math.abs(geometry.x)<=180&&Math.abs(geometry.y)<=90;
  return{externalId:id,name:value('name',['applicationname','Name','ProjectName','NAME','projname','Development','name']),description:value('description',['summarydescription','Description','description','PROJECT_DESCRIPTION']),address:value('address',['Address','ADDRESS','address','MainAddress']),latitude:point?geometry.y:null,longitude:point?geometry.x:null,rawStatus,status:mappedStatus(rawStatus),eventDate,publishedAt:fields.publishedAt?isoDate(a[fields.publishedAt]):undefined,category:value('category',['usecategory','usetype','Category','Type']),developer:value('developer',['Developer','developer','Applicant']),url:query.href,quote:JSON.stringify({id,status:rawStatus,eventDate,description:value('description',['summarydescription','Description','description'])}).slice(0,4000),principalUseVerified:s.config.scopeVerified===true,locationVerified:!!point,wholeDevelopment:s.config.statusScope==='development'};
 });
 return{findings,more:s.adapter==='arcgis'?json.exceededTransferLimit===true:rows.length===50,count:rows.length};
}
