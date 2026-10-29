/** Deterministic discovery of resources explicitly linked by an official page. */
export const decodeHTML=(s:string)=>s.replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&nbsp;/gi,' ').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Math.min(Number(n),0x10ffff)));
export function officialResources(base:string,html:string){
 const resources=new Map<string,{url:string;title:string;kind:'arcgis'|'agenda'|'portal'|'document';parent:string}>();
 const add=(raw:string,title:string)=>{let u:URL;try{u=new URL(decodeHTML(raw).replace(/\\\//g,'/'),base);}catch{return;}if(u.protocol!=='https:'||u.username||u.password)return;u.hash='';if(u.href===base.replace(/#.*$/,'')||u.searchParams.has('oc_lang'))return;
  const value=u.href,context=decodeHTML(title.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
  let kind:'arcgis'|'agenda'|'portal'|'document'|undefined;
  if(/\/(?:FeatureServer|MapServer)(?:\/\d+)?(?:\?|$)|(?:arcgis\.com|arcgis\.com\/apps)\/.*(?:[?&](?:id|appid|webmap)=|\/[a-f0-9]{32}(?:\?|$))/i.test(value))kind='arcgis';
  else if(/agenda|meeting.*packet|planning.*board|planning.*commission|public.hearing|rezoning/i.test(value+' '+context))kind=/\.pdf(?:\?|$)|Archive\.aspx\?ADID=|ViewFile|\/DocumentCenter\/View\/|\/download\?attachment|\/showpublisheddocument\//i.test(value)?'document':'agenda';
  else if(/development.*(?:map|project|activity)|current.project|pending.application|permit.*portal|geocivix|tylerhost|opengov|evolvepublic/i.test(value+' '+context))kind='portal';
  if(!kind||/login|logout|signin|facebook|twitter|youtube|mailto:|staff|member.list|calendar.*deadline|rules.of.procedure|skip.to.(?:main|content)|preferred.language/i.test(value+' '+context)||/^(?:rezoning|special.use|zoning) application(?:\.pdf)?$/i.test(context))return;
  resources.set(value,{url:value,title:context.slice(0,300),kind,parent:base});
 };
 for(const m of html.matchAll(/<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi))add(m[2],m[3]);
 for(const m of html.matchAll(/<iframe\b[^>]*src\s*=\s*(["'])(.*?)\1/gi))add(m[2],'Embedded official resource');
 for(const m of html.matchAll(/https:(?:\/\/|\\\/\\\/)[^\s"'<>]+(?:FeatureServer|MapServer)(?:\/\d+)?/gi))add(m[0],'Official page service reference');
 return[...resources.values()].slice(0,100);
}
export function developmentLayers(metadata:any){
 return(metadata.layers||[]).filter((v:any)=>Number.isInteger(v.id)&&/development|rezoning|zoning.case|site.plan|subdivision|planning.*case|current.project|active.project/i.test(v.name||'')&&!/parcel|boundary|zoning.district|overlay|flood|stormwater|inspection|historic|street|buffer|permit|utility/i.test(v.name||'')).slice(0,8).map((v:any)=>({id:v.id,name:v.name}));
}
/** Suggested mappings require exact metadata fields; never infer status meanings. */
export function mappingProposal(metadata:any){
 const fields:Array<{name:string;alias?:string;type:string}>=metadata.fields||[];
 const pick=(names:string[])=>fields.find(f=>names.includes(f.name.toLowerCase()))?.name;
 const idField=metadata.objectIdField||fields.find(f=>f.type==='esriFieldTypeOID')?.name;
 const name=pick(['projectname','project_name','project','name','development','projname','applicationname']);
 const description=pick(['description','project_description','summarydescription','descript']);
 const status=pick(['status','projectstatus','project_status','projstatus','recordstatus']);
 const address=pick(['address','siteaddress','site_address','location']);
 const category=pick(['category','projecttype','project_type','type','landuse','land_use']);
 const mapped=Object.fromEntries(Object.entries({name,description,status,address,category}).filter(([,v])=>!!v));
 return{mappingVersion:'nc-candidate-2026-10-29-v1',idField,fields:mapped,requiredFields:[...new Set([idField,...Object.values(mapped)].filter(Boolean))],statusScope:'application',scopeVerified:false,statusDomains:fields.filter((f:any)=>f.domain).map((f:any)=>({field:f.name,domain:f.domain})),readiness:idField&&name?'schema_mapping_candidate':'missing_stable_id_or_project_name',notes:['Metadata-based field proposal only; coded statuses require source-specific validation.','GIS edit dates are not approval or substantive event dates.','No polygon centroids or coordinates are invented.']};
}
