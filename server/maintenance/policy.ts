import{createHash}from'node:crypto';
import{classifyProject}from'../../src/lib/categories';
import{validateProject}from'../../src/lib/validate';
import{roadDecision}from'../roads/policy';
import{exactDate}from'../archives/policy';
import type{Project,Status}from'../../src/data/projects';
export const rotation=[
 ['CA','OR','NV','HI','AK','ID','MT','WY','UT','VT'],
 ['TX','OK','AR','LA','KS','NE','NM','MS','AL','ND'],
 ['FL','GA','SC','TN','KY','WV','DE','MD','ME','NH'],
 ['NY','NJ','CT','MA','RI','PA','OH','MI','IN','SD'],
 ['IL','NC','VA','WA','CO','AZ','MN','WI','IA','MO'],
] as const;
export const allStates=rotation.flat();
export const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function localDay(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function scheduledStates(now=new Date()){const day=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short'}).format(now);return rotation[['Mon','Tue','Wed','Thu','Fri'].indexOf(day)]||[];}
export function nextRun(weekday:number,now=new Date()){
 // Search UTC instants, checking local time: handles DST without assuming an offset.
 const start=Math.floor(now.getTime()/60000)*60000+60000;
 const f=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 for(let t=start;t<start+8*86400000;t+=60000){const p=Object.fromEntries(f.formatToParts(t).map(v=>[v.type,v.value]));if(p.weekday===['Mon','Tue','Wed','Thu','Fri'][weekday-1]&&p.hour==='05'&&p.minute==='17')return new Date(t).toISOString();}
 throw Error('No next execution time found.');
}
export type Source={id:string;state:string;jurisdiction:string;url:string;adapter:'arcgis'|'cary'|'document';enabled:boolean;authority:'official'|'supplementary';autopublish:boolean;config:Record<string,any>};
export type Finding={externalId:string;name:string;description:string;address:string;latitude:number|null;longitude:number|null;rawStatus:string;status?:Status;eventDate?:string;publishedAt?:string;category:string;developer:string;url:string;quote:string;principalUseVerified:boolean;locationVerified:boolean;wholeDevelopment:boolean;meeting?:{id:string;title:string;startsAt:string;venue:string;agenda:string}};
export function mappedStatus(raw:string):Status|undefined{
 const v=raw.trim().toLowerCase();return({'proposed':'Proposed','under review':'In review','in review':'In review','approved':'Approved','under construction':'Under construction','construction started':'Under construction','completed':'Completed','cancelled':'Cancelled','canceled':'Cancelled','on hold':'On hold'} as Record<string,Status>)[v];
}
export function evaluateFinding(f:Finding,s:Source,existing:Project|null,now=Date.now()){
 const reasons:string[]=[];const dated=f.eventDate&&exactDate(f.eventDate)!==undefined&&exactDate(f.eventDate)!<=now;
 if(!f.externalId||!f.name||!f.quote||!f.url.startsWith('https:'))reasons.push('Missing stable identity or traceable source evidence');
 if(s.authority!=='official')reasons.push('Supplementary evidence requires review');
 if(!f.status||!f.wholeDevelopment)reasons.push('Status may describe an application or permit rather than the whole development');
 if(!dated)reasons.push('Substantive event date is missing, ambiguous, or in the future');
 if(!f.locationVerified||f.latitude===null||f.longitude===null||!Number.isFinite(f.latitude)||!Number.isFinite(f.longitude))reasons.push('Coordinates require verification');
 if(!f.principalUseVerified)reasons.push('Principal physical development scope requires review');
 if(!s.autopublish)reasons.push('Source adapter is not approved for automatic publication');
 if(f.status==='Completed'||f.status==='Cancelled')reasons.push('Completion or cancellation requires administrator confirmation');
 const project:Project={...(existing||{}),id:existing?.id||'auto-'+hash([s.id,f.externalId]).slice(0,36),revision:existing?.revision||0,name:f.name,address:f.address,neighborhood:s.jurisdiction,state:s.state,jurisdiction:s.jurisdiction,status:f.status||existing?.status||'Proposed',category:f.category,latitude:f.latitude!,longitude:f.longitude!,description:f.description,developer:f.developer,homes:existing?.homes||0,completion:existing?.completion||'Not documented',meetings:existing?.meetings||[],sources:[...(existing?.sources||[])],evidenceType:'municipal',sourceStatus:f.rawStatus,sourceStatusDate:f.eventDate,reviewedAt:new Date(now).toISOString().slice(0,10)};
 if(!project.sources!.some(v=>v.url===f.url))project.sources!.push({title:s.jurisdiction+' official development record',url:f.url});
 if(f.meeting){const m=f.meeting;if(!/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$/.test(m.startsAt)||!Number.isFinite(Date.parse(m.startsAt))||!m.agenda.startsWith('https:'))reasons.push('Meeting needs an official date with timezone and source link');else project.meetings=[...project.meetings.filter(v=>v.id!==m.id),m];}
 const normalized=classifyProject(project);Object.assign(project,normalized);
 if(existing)Object.assign(project,{name:existing.name,description:existing.description,address:existing.address,latitude:existing.latitude,longitude:existing.longitude,developer:existing.developer,neighborhood:existing.neighborhood,category:existing.category});
 if(!project.primaryCategory)reasons.push('Classification is unresolved');
 const road=roadDecision(project);if(road.road&&!road.qualifies)reasons.push('Road significance policy excludes this scope');
 if(/stormwater|erosion control/i.test(f.category+' '+f.name)&&!/apartments?|housing|subdivision|commercial building|industrial|public park|treatment plant/i.test(f.description))reasons.push('Stormwater or administrative permit alone is not a development');
 const error=validateProject(project);if(error)reasons.push(error);
 // Confidence describes explicit checks, never an AI probability.
 return{project,reasons,eligible:reasons.length===0,confidence:{method:'deterministic-evidence-gates-v1',passed:reasons.length===0,reasons},dated:!!dated};
}
export class LimitReached extends Error{}
export class Budget{
 started=Date.now();requests=0;records=0;bytes=0;aiRequests=0;aiTokens=0;
 constructor(public seconds=240,public maxRequests=80,public maxRecords=1000,public maxBytes=20_000_000){}
 check(){if(Date.now()-this.started>=this.seconds*1000-5000)throw new LimitReached('Runtime ceiling reached');if(this.requests>=this.maxRequests)throw new LimitReached('Request ceiling reached');if(this.records>=this.maxRecords)throw new LimitReached('Record ceiling reached');if(this.bytes>=this.maxBytes)throw new LimitReached('Download ceiling reached');}
 snapshot(){return{seconds:Math.round((Date.now()-this.started)/1000),requests:this.requests,records:this.records,downloadBytes:this.bytes,aiRequests:this.aiRequests,aiTokens:this.aiTokens};}
}
