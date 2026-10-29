import {isoDate} from './adapters';
import {exactDate} from '../archives/policy';
export const identityText=(value:unknown)=>String(value??'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function addressIdentity(value:unknown){return identityText(value).replace(/\bstreet\b/g,'st').replace(/\broad\b/g,'rd').replace(/\bavenue\b/g,'ave').replace(/\bboulevard\b/g,'blvd').replace(/\bdrive\b/g,'dr').replace(/\blane\b/g,'ln').replace(/\bcourt\b/g,'ct');}
export function chapelEvidence(a:Record<string,any>){
 const milestones:any[]=[],issues:string[]=[];for(let i=1;i<=4;i++){
  if(!a['Application'+i])continue;const raw=a['Application'+i+'ApprovalDate'],date=isoDate(raw),status=a['Application'+i+'ReviewStatus'];
  if(status==='Approved'&&date&&Date.parse(date)<=Date.now())milestones.push({type:'Application Approval',application:a['Application'+i],authority:a['Application'+i+'ApprovalAuthority'],date,field:'Application'+i+'ApprovalDate',scope:'application_only'});
  if(status==='Approved'&&!date)issues.push('Application '+i+' is marked Approved without a documented approval date');
 }
 const overall=a.ProjectOverallStatus;
 if(overall==='Zoning Compliance, Permitting and Construction')issues.push('Combined post-review label does not establish approval or physical construction; application sub-statuses require reconciliation');
 if(overall==='Withdrawn or Denied')issues.push('Combined withdrawal/denial label does not establish cancellation of the whole development');
 if(overall==='Development Complete')issues.push('Whole-development completion is reported, but no completion date/evidence field is supplied; retain for review');
 if(/\$/.test(a.ProjectName||''))issues.push('Official project title contains an apparent typographical artifact; do not invent a corrected identity');
 if(/church|school/i.test(a.ProjectName||'')&&a.ProjectType==='Institutional - University Development')issues.push('Municipal University classification conflicts with the named church/school function; review principal use');
 return{kind:overall==='Formal Development Application Under Review'?'reported_active_review':overall==='Concept Plan'?'reported_proposal':overall==='Development Complete'?'undated_reported_completion':'ambiguous_project_stage',milestones,issues,wholeProjectStatusChange:null,approvalDateChange:null};
}
/** Permit class, cost, units and a closed flag are never sufficient on their own. */
export function raleighEvidence(a:Record<string,any>){
 const scope=String(a.proposedworkdescription||a.description||'').trim(),t=scope.toLowerCase(),issues:string[]=[];
 const maintenance=/\b(?:repair|roof replacement|replace.*roof|water damage|fire damage|roof truss|hvac|restor(?:e|ation))\b/.test(t);
 const minorTenant=/\b(?:change of use|suite|unit #)\b/.test(t)&&/\b(?:150\s*sq|existing multi[- ]tenant|previous layout)\b/.test(t);
 const privateAmenity=/\bswimming pool|pool piping|courtyard\b/.test(t)&&/\bapartments?\b/.test(t);
 const singleSetup=/\bmobile home set up|manufactured home set up\b/.test(t);
 const units=scope.match(/\b(\d{1,4})\s*[- ]?\s*(?:units?|apartments?)\b/i),explicitUnits=units?Number(units[1]):null;
 const housing=!!explicitUnits&&explicitUnits>=20&&/\bapartment|\bmultifamily|\bapt\b|\br-2\b/.test(t);
 const industrial=/\bwarehouse\b/.test(t)&&/\b(?:addition|expansion|new)\b/.test(t)&&/\b\d[\d,]*\s*(?:sf|sq\.?\s*ft)/.test(t);
 const parking=/\bparking (?:deck|addition)|\bparking\b/.test(t);
 const significant=!maintenance&&!minorTenant&&!privateAmenity&&!singleSetup&&(housing||industrial);
 if(a.workclassmapped==='New'&&/addition\/alteration|renovat/i.test(String(a.proposeduse)+' '+scope))issues.push('New work-class label conflicts with alteration/renovation scope; narrative controls eligibility');
 if(a.workclassmapped==='Existing'&&significant)issues.push('Existing work-class label describes a substantive new building/addition in the narrative; class alone would miss it');
 if(singleSetup&&Number(a.housingunitstotal)>10)issues.push('Housing-unit field is implausible for a mobile-home setup; do not treat it as documented housing scope');
 if(a.statuscurrent==='Complete'&&a.statuscurrentmapped==='Permit Issued')issues.push('Raw Complete and mapped Permit Issued conflict; neither establishes whole-development completion');
 if(scope.length>=95)issues.push('Description ends near the service text-field limit; full scope may be truncated');
 const dates={application:isoDate(a.applieddate),permitIssued:isoDate(a.issueddate),certificateOfOccupancy:isoDate(a.coissueddate),certificateOfCompletion:isoDate(a.cocissueddate),permitVoided:isoDate(a.voiddate)};
 const event=dates.certificateOfOccupancy?{type:'Certificate of Occupancy',date:dates.certificateOfOccupancy,scope:'permit_only'}:dates.certificateOfCompletion?{type:'Certificate of Completion',date:dates.certificateOfCompletion,scope:'permit_only'}:dates.permitIssued?{type:'Permit Issued',date:dates.permitIssued,scope:'permit_only'}:null;
 const historical=!!dates.permitIssued&&Date.parse(dates.permitIssued)<Date.now()-365*86400000;
 return{scope,significant,explicitUnits,industrialExpansion:industrial&&!maintenance,eligibility:maintenance||minorTenant||privateAmenity||singleSetup?'excluded_minor_or_ancillary':significant?'significant_supporting_evidence':'significance_requires_review',reason:maintenance?'Repair or maintenance scope':minorTenant?'Small existing-tenant change':privateAmenity?'Supporting residential amenity':singleSetup?'Individual mobile-home setup; no documented community-scale development':housing?'Explicit substantial multifamily-building scope':industrial?'Explicit warehouse addition with documented physical floor area':parking?'Parking component requires a documented parent/regional purpose':'Principal construction significance not established',dates,event,historical,issues,wholeProjectStatusChange:null,approvalDateChange:null,supportingOnly:true};
}
export function officialPoint(geometry:any,spatialReference:any){
 const wkid=spatialReference?.latestWkid||spatialReference?.wkid;
 if(wkid!==4326||!Number.isFinite(geometry?.x)||!Number.isFinite(geometry?.y))return{verified:false,reason:'No authoritative WGS84 point supplied'};
 if(geometry.x< -84.5||geometry.x> -75.3||geometry.y<33.7||geometry.y>36.7)return{verified:false,reason:'Official point falls outside North Carolina sanity bounds',longitude:geometry.x,latitude:geometry.y};
 return{verified:true,reason:'Official source point in WGS84 within NC sanity bounds; municipal boundary not independently tested',longitude:geometry.x,latitude:geometry.y};
}
/** Official project-page facts; scheduled hearings never become decisions. */
export function projectPageEvidence(html:string){
 const text=html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
 const description=text.match(/Project Description:\s*(.*?)\s*Project Status:/i)?.[1]||null,status=text.match(/Project Status:\s*(.*?)\s*Public Meeting Schedule/i)?.[1]||null;
 const applicationIdentifiers=[...new Set(text.match(/\b(?:CP|CZD|ZCP)-\d{2}-\d+\b/g)||[])],meetingSection=text.split('Public Meeting Schedule')[1]?.split('Application Materials')[0]||'';
 const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
 const meetings=[...meetingSection.matchAll(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})(?:\s+at\s+(\d{1,2}(?::\d{2})?\s*[AP]M))?/gi)].map(m=>({date:m[3]+'-'+String(months.findIndex(v=>v.toLowerCase()===m[1].toLowerCase())+1).padStart(2,'0')+'-'+m[2].padStart(2,'0'),timeLabel:m[4]||null,quote:m[0],scope:'scheduled_meeting_only',decisionConfirmed:false})).filter(m=>exactDate(m.date)!==undefined);
 const start=text.indexOf('Project Address:');return{description,status,applicationIdentifiers,meetings,quote:text.slice(Math.max(0,start),Math.max(0,start)+2200),descriptionPublishedAt:null,wholeProjectDecisionConfirmed:false};
}
