import {nextRun} from './policy';
export type ShadowProfile='structured-feeds'|'evidence-research';
/** Explicit capability gate: a feed scan must never be labeled full unattended research. */
export function requireShadowProfile(profile:string,manualEvidenceTrial=false){
 if(profile==='evidence-research'&&manualEvidenceTrial)return;
 if(profile!=='structured-feeds')throw Error(profile==='evidence-research'?'Unattended evidence research is not ready: only the explicitly authorized manual document/feed trial is available.':'Unknown shadow research profile.');
}
export function shadowPlan(remainingRequests:number,now=new Date()){
 if(!Number.isSafeInteger(remainingRequests)||remainingRequests<0)throw Error('Use the current verified remaining request allowance.');
 return{preparedAt:now.toISOString(),state:'NC',scheduleEnabled:false,publication:false,archiving:false,aiEnabled:false,additionalPaidServices:false,
  proposedSchedule:{weekday:'Friday',localTime:'05:17',timeZone:'America/New_York',nextUnactivatedSlot:nextRun(5,now),initialObservationRuns:4},
  limits:{requestsPerRun:16,workerSeconds:120,jobMinutes:6,recordsPerRun:48,downloadBytes:10000000,cacheBytes:5000000},
  budget:{remainingRequests,maximumFullyReservedRuns:Math.floor(remainingRequests/16),fourRunReservation:64,fourRunsFitCurrentAllowance:remainingRequests>=64,automaticBudgetIncrease:false,monthRolloverIsNotNewResearchAuthorization:true},
  profiles:{'structured-feeds':{implemented:true,coverage:['Apex applications','Chapel Hill current development','Raleigh building permits — supporting only'],scope:'Bounded priority and rotating backlog pages; not statewide or document/secondary-source research.'},'evidence-research':{implemented:true,manualOnly:true,coverage:['Chapel Hill official development index, linked project pages and one planning document','Chapelboro local-news RSS','UNC Health announcement RSS fallback'],remainingBeforeAutomation:[
   'Review actual source availability and date/identity accuracy from the first bounded live trial.',
   'Expand source-specific decision mappings; generic document extraction intentionally yields review evidence, not adopted decisions.',
   'Review secondary identity mentions separately from substantive event agreement; no AI or general search provider is configured.',
   'Validate long-running checkpoint recovery, cumulative authorization and source coverage before scheduling.',
   'Keep ambiguous identity, chronology, application/parent scope and description changes private until reviewed.'
  ]}},
  activationRequirements:['Explicit authorization for the NC-only shadow schedule.','A manual real-source run for the selected profile with reviewed evidence and unchanged production hashes.','Sufficient remaining approved research allowance for every run; no reset-based implied authorization.','Add an active GitHub schedule and separately authorize the backend shadow gate; leave production gates off.'],
  notAuthorized:['Nationwide scheduling','Project publication','Automatic archiving','Production status/location/timeline edits','Paid search or AI APIs']};
}
