import type {Project} from '../../src/data/projects';import {exactDate} from '../archives/policy';
export type EvidenceEvent={key:string;type:string;date:string;at:number;description:string;url:string|null};
const url=(v:any)=>{try{return typeof v==='string'&&v.length<=2048&&new URL(v).protocol==='https:'?v:null;}catch{return null;}};
function event(type:string,date:any,description:string,source:any,key?:string):EvidenceEvent[]{const at=exactDate(date);return at===undefined?[]:[{key:key||type+'|'+date,type,date,at,description:description.slice(0,700),url:url(source)}];}
/** Never consult importedAt, reviewedAt, sourceAsOf, revision, or a history-row creation time. */
export function recordEvents(p:Project):EvidenceEvent[]{
 const source=p.sources?.map(s=>url(s.url)).find(Boolean),status=(p.sourceStatus||'').trim();if(!source||!p.sourceStatusDate)return [];
 // "Under construction" + Action_Date can be the old approval date. It is NOT a documented start.
 if(/^(?:construction (?:started|began)|construction start)$/i.test(status))return event('Construction Started',p.sourceStatusDate,'The source explicitly records construction starting.',source);
 if(/approved|approval granted/i.test(status))return event('Approval',p.sourceStatusDate,'Documented source decision: '+status+'.',source);
 if(/^(?:plan check|trc review|under review|in review|pending applicant action)$/i.test(status))return event('Review Update',p.sourceStatusDate,'Documented review-stage activity: '+status+'.',source);
 if(/^(?:proposed|project proposed|preliminary plat proposed|rezoning proposed|application (?:received|submitted))$/i.test(status))return event('Proposal / Application',p.sourceStatusDate,'Documented proposal/application activity: '+status+'.',source);
 if(/^issued$/i.test(status)&&p.evidenceType==='municipal')return event('Permit / Regulatory Decision',p.sourceStatusDate,'The municipal planning record reports issuance. This does not establish construction starting.',source);
 return [];
}
export function meetingEvents(p:Project):EvidenceEvent[]{return(p.meetings||[]).flatMap(m=>event('Public Meeting',m.startsAt,m.title+(m.venue?' — '+m.venue:''),url(m.agenda)||p.sources?.map(s=>url(s.url)).find(Boolean),'meeting|'+m.id));}
export function policyEvents(approval:any,schedules:any[]):EvidenceEvent[]{
 const events:EvidenceEvent[]=[];
 if(approval&&url(approval.url)&&approval.quote)events.push(...event('Approval',approval.date,approval.quote,approval.url,'approval'));
 for(const s of schedules||[])if(s.kind==='start'&&url(s.url)&&s.quote)events.push(...event('Construction Started',s.date,s.quote,s.url,'start|'+s.date));
 return events;
}
