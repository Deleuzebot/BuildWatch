import {nextRun} from './policy';
export type ShadowProfile='structured-feeds'|'evidence-research';
/** Explicit capability gate: a feed scan must never be labeled full unattended research. */
export function requireShadowProfile(profile:string){
 if(profile!=='structured-feeds')throw Error(profile==='evidence-research'?'Full evidence research is not ready: government document orchestration and permitted secondary-source retrieval still need integration and validation.':'Unknown shadow research profile.');
}
export function shadowPlan(remainingRequests:number,now=new Date()){
 if(!Number.isSafeInteger(remainingRequests)||remainingRequests<0)throw Error('Use the current verified remaining request allowance.');
 return{preparedAt:now.toISOString(),state:'NC',scheduleEnabled:false,publication:false,archiving:false,aiEnabled:false,additionalPaidServices:false,
  proposedSchedule:{weekday:'Friday',localTime:'05:17',timeZone:'America/New_York',nextUnactivatedSlot:nextRun(5,now),initialObservationRuns:4},
  limits:{requestsPerRun:16,workerSeconds:120,jobMinutes:6,recordsPerRun:48,downloadBytes:10000000,cacheBytes:5000000},
  budget:{remainingRequests,maximumFullyReservedRuns:Math.floor(remainingRequests/16),fourRunReservation:64,fourRunsFitCurrentAllowance:remainingRequests>=64,automaticBudgetIncrease:false,monthRolloverIsNotNewResearchAuthorization:true},
  profiles:{'structured-feeds':{implemented:true,coverage:['Apex applications','Chapel Hill current development','Raleigh building permits — supporting only'],scope:'Bounded priority and rotating backlog pages; not statewide or document/secondary-source research.'},'evidence-research':{implemented:false,requiredBeforeManualTrial:[
   'Register a bounded official document/index allowlist and jurisdiction-specific extraction/matching mappings.',
   'Connect the existing sandboxed PDF/HTML extraction to persistent private shadow evidence and checkpoints.',
   'Register permitted, credible secondary feeds/pages with publication dates; general web search currently requires Codex.',
   'Reconcile primary and secondary evidence; distinguish reported claims, applications and adopted decisions.',
   'Validate changed/unchanged documents, source outages, conflicting dates, parent projects, duplication and rollback without publication.'
  ]}},
  activationRequirements:['Explicit authorization for the NC-only shadow schedule.','A manual real-source run for the selected profile with reviewed evidence and unchanged production hashes.','Sufficient remaining approved research allowance for every run; no reset-based implied authorization.','Add an active GitHub schedule and separately authorize the backend shadow gate; leave production gates off.'],
  notAuthorized:['Nationwide scheduling','Project publication','Automatic archiving','Production status/location/timeline edits','Paid search or AI APIs']};
}
