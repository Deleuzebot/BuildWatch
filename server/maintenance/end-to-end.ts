import {createHash} from 'node:crypto';
import {mappedStatus,type Finding} from './policy';
import {classifyProject} from '../../src/lib/categories';

const norm=(s:unknown)=>String(s??'').trim().replace(/\s+/g,' ').toLowerCase();
/** Identity is source-scoped AND checked against the current canonical project. */
export function verifyIdentity(f:Pick<Finding,'externalId'|'name'>,city:string,match:{ids:string[];project:any}){
 const ids=[...new Set(match.ids)];
 if(ids.length!==1)return{verified:false,reason:ids.length?'Ambiguous source identifier':'No exact source reference; do not insert or fuzzy-match'};
 const p=match.project;
 if(!p)return{verified:false,reason:'Matched record is unavailable or excluded'};
 if(p.archived||['Completed','Cancelled'].includes(p.status))return{verified:false,reason:'Archived or terminal project must not be republished'};
 if(norm(p.jurisdiction||p.city)!==norm(city)||norm(p.name)!==norm(f.name))return{verified:false,reason:'Source identifier conflicts with canonical name or jurisdiction'};
 return{verified:true,reason:'Unique source-scoped identifier, canonical name and jurisdiction agree'};
}

/** Even/odd rings handle holes. No centroid or replacement pin is invented. */
export function pointInOfficialPolygon(lat:number,lon:number,geometry:any,wkid:number){
 if(wkid!==4326||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180||!Array.isArray(geometry?.rings))return undefined;
 const rings=geometry.rings;if(rings.flat().length>100000||rings.some((r:any)=>!Array.isArray(r)||r.length<4||r.some((p:any)=>!Array.isArray(p)||!Number.isFinite(p[0])||!Number.isFinite(p[1])||Math.abs(p[0])>180||Math.abs(p[1])>90)))return undefined;
 let inside=false;
 for(const ring of rings)for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const[x,y]=ring[i],[xj,yj]=ring[j];
  const cross=(lon-x)*(yj-y)-(lat-y)*(xj-x);
  if(Math.abs(cross)<1e-10&&lon>=Math.min(x,xj)&&lon<=Math.max(x,xj)&&lat>=Math.min(y,yj)&&lat<=Math.max(y,yj))return true;
  if((y>lat)!==(yj>lat)&&lon<(xj-x)*(lat-y)/(yj-y)+x)inside=!inside;
 }
 return inside;
}

export type PageEvidence={page:number;text:string};
export type AgendaItem={caseId:string;addresses:string[];units?:number;principalUse?:string;evidence:{page:number;quote:string;sha256:string}[];requestedAction:boolean;recommendationOnly:boolean;confirmedDecision:false;currentStatusVerified:false;requestedProcess?:'rezoning_review';unresolved:string[]};
/** Conservative case extraction: staff recommendations and motion templates are not decisions. */
export function extractAgendaItems(pages:PageEvidence[]):AgendaItem[]{
 if(pages.length>200||pages.reduce((n,p)=>n+p.text.length,0)>1_000_000)throw Error('Evidence envelope exceeded');
 const groups=new Map<string,AgendaItem>();
 for(const page of pages){
  // A dated narrative/case heading is evidence; isolated IDs on maps are not.
  const matches=[...page.text.matchAll(/\b(?:Rezoning\s*[-:#]?\s*(\d{2,4}-\d{1,4})|(?:Case\s*#?\s*)?(CZ-\d{4}-\d{2}))\b/gi)];
  for(let i=0;i<matches.length;i++){
   const m=matches[i],caseId=m[1]?'Rezoning '+m[1]:m[2].toUpperCase();
   const next=matches.slice(i+1).find(v=>(v[1]?'Rezoning '+v[1]:v[2].toUpperCase())!==caseId);
   const quote=page.text.slice(m.index!,Math.min(page.text.length,m.index!+7000,next?.index??Infinity)).replace(/\r/g,'').trim();
   if(!/request|applicant|public hearing|staff report|recommended denial/i.test(quote))continue;
   let item=groups.get(caseId);if(!item){item={caseId,addresses:[],evidence:[],requestedAction:false,recommendationOnly:false,confirmedDecision:false,currentStatusVerified:false,unresolved:['No confirmed final decision in extracted case evidence','Coordinates require official verification']};groups.set(caseId,item);}
   if(!item.evidence.some(e=>e.page===page.page))item.evidence.push({page:page.page,quote,sha256:createHash('sha256').update(quote).digest('hex')});
   const context=quote.replace(/\s+/g,' ');
   item.requestedAction ||= /request to rezone|request to conditionally rezone|public hearing to consider|rezoning request/i.test(context);
   item.recommendationOnly ||= /recommended denial|staff recommend|should the commission|motion should/i.test(quote);
   const addresses=[...quote.matchAll(/\b\d{1,6}\s+[A-Z][A-Za-z .'-]{0,65}?\s(?:Road|Rd|Avenue|Ave|Street|St|Drive|Dr|Boulevard|Blvd)\b/g)]
    .filter(m=>!/meeting|held at|church|venue|library|municipal building/i.test(quote.slice(Math.max(0,m.index!-160),m.index!)))
    .map(m=>m[0].replace(/\s+/g,' '));
   item.addresses=[...new Set([...item.addresses,...addresses])];
   const units=quote.match(/\b(\d{1,5})\s*[- ]\s*unit\s+multifamily|multifamily development with\s+(\d{1,5})\s+units/i);
   if(units){item.units=Number(units[1]||units[2]);item.principalUse='Residential';}
   if(item.requestedAction)item.requestedProcess='rezoning_review';
  }
 }
 return[...groups.values()];
}

/** Dates are typed hearing evidence, never approval dates. Only page-one cases inherit it. */
export function agendaMeeting(pages:PageEvidence[],item:AgendaItem,now=Date.now()){
 const page=pages.find(p=>p.page===1);if(!page||!item.evidence.some(e=>e.page===1))return null;
 const match=page.text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})\s*(?:at|[-–])\s*(\d{1,2}):(\d{2})\s*([ap])\.?\s*m\.?/i);
 if(!match)return null;
 const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
 const month=months.findIndex(m=>m.toLowerCase()===match[1].toLowerCase()),day=Number(match[2]),year=Number(match[3]),hour=Number(match[4])%12+(match[6].toLowerCase()==='p'?12:0),minute=Number(match[5]);
 if(Number(match[4])<1||Number(match[4])>12||minute>59||day<1||day>31)return null;
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'numeric',hourCycle:'h23'});
 const instant=[4,5].map(offset=>Date.UTC(year,month,day,hour+offset,minute)).find(t=>{const p=Object.fromEntries(parts.formatToParts(t).map(v=>[v.type,v.value]));return Number(p.year)===year&&Number(p.month)===month+1&&Number(p.day)===day&&Number(p.hour)===hour&&Number(p.minute)===minute;});
 if(instant===undefined)return null;
 return{kind:'scheduled_hearing_evidence',startsAt:new Date(instant).toISOString(),timeZone:'America/New_York',past:instant<now,venue:null,page:1,quote:match[0],attendanceOrDecisionConfirmed:false};
}

/** Proposals are private review objects; no approval clock or canonical status writes. */
export function proposeStructured(f:Finding,city:string,match:{ids:string[];project:any},location:{inside?:boolean;source:string}){
 const identity=verifyIdentity(f,city,match),p=match.project;
 // Non-residential is a broad exclusion, not evidence of housing.
 const category=classifyProject({id:'pilot',name:f.name,description:f.description.replace(/\bmixed used development\b/gi,'mixed-use development'),category:/^non[- ]residential$/i.test(f.category)?'':f.category} as any);
 const rawDate=f.sourceDates?.applicationActionAt,action=String(f.sourceFacts?.applicationAction||'');
 const milestone=rawDate&&Number.isFinite(Date.parse(rawDate))&&Date.parse(rawDate)<=Date.now()&&/^TRC Approved$/i.test(action)?{kind:'application_approval',date:rawDate,description:'Technical Review Committee approved this application/component; not proof of construction or whole-project completion',source:f.url}:null;
 const sourceStatus=mappedStatus(f.rawStatus),statusConflict=!!p&&!!sourceStatus&&sourceStatus!==p.status;
 const reasons:string[]=[];
 if(!identity.verified)reasons.push(identity.reason);
 if(location.inside!==true)reasons.push(location.inside===false?'Existing map pin lies outside official footprint':'Official footprint verification unavailable');
 if(!sourceStatus)reasons.push('Administrative status does not establish a development milestone');
 if(!milestone)reasons.push('No dated substantive milestone; GIS edit/import dates cannot reset approval');
 if(statusConflict)reasons.push('Source and canonical statuses differ; application scope requires review');
 if(!category.primaryCategory)reasons.push('Principal use unresolved');
 if(/\bgrading\b|\binfrastructure\b/i.test(f.name))reasons.push('Possible component/supporting record; inspect parent development before creating a marker');
 return{externalId:f.externalId,name:f.name,identity,projectId:identity.verified?p.id:null,existingStatus:p?.status||null,sourceStatus:f.rawStatus,location,category:category.primaryCategory,
  proposed:{sourceCitation:identity.verified&&!p.sources?.some((s:any)=>s.url===f.url)?{title:city+' official application '+f.externalId,url:f.url}:null,
   scopedMilestone:identity.verified?milestone:null,statusChange:statusConflict?{from:p.status,to:sourceStatus,requiresAdministratorReview:true}:null,
   approvalDateChange:null,pinChange:null,insertProject:false},
  sourceDates:f.sourceDates,description:f.description,evidence:{url:f.url,quote:f.quote},reasons,automaticPublication:false};
}
