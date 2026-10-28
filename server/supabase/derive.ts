import {classifyProject,categoryInput} from '../../src/lib/categories';
import {roadDecision} from '../roads/policy';
import {recordEvents,meetingEvents,policyEvents} from '../activity/evidence';
import type {Project} from '../../src/data/projects';
/** Shared by Edge Functions and regression tests; no filesystem or Node server. */
export async function deriveProject(project:Project,policy?:any){
 const input=categoryInput(project),bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input));
 const fingerprint=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
 const normalized=classifyProject(project),{input:unused,...classification}=normalized.classification;
 const approval=typeof policy?.approval_evidence==='string'?JSON.parse(policy.approval_evidence):policy?.approval_evidence;
 const schedules=typeof policy?.schedules==='string'?JSON.parse(policy.schedules):policy?.schedules||[];
 return {fingerprint,normalized:{...normalized,classification:{...classification,inputFingerprint:fingerprint}},road:roadDecision({...project,...normalized}),
  recordEvents:recordEvents(project),meetingEvents:meetingEvents(project),policyEvents:policyEvents(approval,schedules)};
}
