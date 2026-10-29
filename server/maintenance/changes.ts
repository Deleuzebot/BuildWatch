import type {Project} from '../../src/data/projects';
import type {Finding,Source} from './policy';
import {exactDate} from '../archives/policy';
/** Explicit registry attestation is required; a permit's closed/withdrawn label is insufficient. */
export function terminalEvidence(f:Finding,s:Source){
 return s.authority==='official'&&s.config.statusScope==='development'&&s.config.scopeVerified===true&&s.config.terminalStatusVerified===true&&s.config.eventDateMeaning==='development_decision'&&!!f.eventDate&&!!f.quote&&/^https:\/\//.test(f.url)&&
  ((f.status==='Completed'&&/^completed$/i.test(f.rawStatus.trim()))||(f.status==='Cancelled'&&/^cancelled$|^canceled$/i.test(f.rawStatus.trim())));
}
const normalize=(s:string)=>s.normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
/** A scoped committee decision is a milestone, never approval of a parent development. */
export function componentMilestone(f:Finding,s:Source,p:Project|null,now=Date.now()){
 const rawDate=f.sourceDates?.applicationActionAt,date=rawDate?.slice(0,10);
 if(!p||s.authority!=='official'||s.config.componentMilestonesVerified!==true||s.config.statusScope!=='application'||normalize(p.name)!==normalize(f.name)||f.sourceFacts?.applicationAction!=='TRC Approved'||!date||!rawDate||exactDate(rawDate)===undefined||Date.parse(rawDate)>now||!f.url.startsWith('https://'))return null;
 return {key:'application-approval|'+s.id+'|'+f.externalId+'|'+date,type:'Application Approval',date,at:Date.parse(date),description:'TRC approved this specific application/component. This does not establish approval or construction of the broader development.',url:f.url};
}
/** Comparison yields a private proposal, never an automatic replacement of editorial text. */
export function informationChange(f:Finding,s:Source,p:Project|null){
 if(!p||s.authority!=='official'||!f.externalId||!f.eventDate||!/^https:\/\//.test(f.url)||!f.quote)return null;
 const before=normalize(p.description||''),after=normalize(f.description||'');
 if(after.length<40||before===after||before.startsWith(after)||after.startsWith(before)&&after.length-before.length<40)return null;
 return {before:p.description,after:f.description,url:f.url,eventDate:f.eventDate,quote:f.quote,externalId:f.externalId};
}
