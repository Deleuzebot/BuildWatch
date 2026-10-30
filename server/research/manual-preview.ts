import assert from 'node:assert/strict';
/** Review artifact only. No SQL, credentials, network client or apply operation. */
export function manualMilestonePreview(prepared:any){
 const p=prepared.preview,before=p.before,after=p.after,m=p.milestone;
 assert.equal(prepared.applied,false);assert.equal(prepared.approvalRequired,true);
 assert.deepEqual([...new Set([...Object.keys(before),...Object.keys(after)])].filter(k=>JSON.stringify(before[k])!==JSON.stringify(after[k])),['revision']);
 assert.equal(after.revision,before.revision+1);assert.deepEqual(p.policyBefore,p.policyAfter);
 assert.equal(m.type,'Application Approval');assert.equal(m.date,'2026-10-22');
 assert.equal(p.evidence.externalId,'712');assert.equal(p.evidence.attributes.Action_Taken,'TRC Approved');
 assert.equal(p.evidence.attributes.Name,before.name);assert.equal(new Date(p.evidence.attributes.Action_Date).toISOString().slice(0,10),m.date);
 assert.ok(!p.timelineBefore.some((v:any)=>v.event_key===m.key||v.event_date===m.date&&/approval/i.test(v.type)));
 assert.equal(p.timelineAfter.length,p.timelineBefore.length+1);assert.equal(p.historyAfter,p.historyBefore+1);assert.equal(p.expectedNotifications,0);
 assert.ok(p.timelineBefore.every((event:any)=>p.timelineAfter.some((v:any)=>JSON.stringify(v)===JSON.stringify(event))));
 assert.ok(p.timelineAfter.some((v:any)=>v.type===m.type&&(v.date||v.event_date)===m.date));
 return {mode:'cached_manual_codex_preview',proposalId:prepared.proposalId,approvalRequired:true,productionWrites:0,governmentRequests:0,publication:false,archival:false,scheduling:false,
  project:{id:before.id,name:before.name,beforeRevision:before.revision,afterRevision:after.revision,fieldChanges:{revision:{before:before.revision,after:after.revision}},preserved:{status:before.status,description:before.description,latitude:before.latitude,longitude:before.longitude,approvalPolicy:p.policyBefore}},
  evidence:p.evidence,
  wouldWrite:{projects:{id:before.id,revision:after.revision,allOtherProjectFields:'identical_to_before'},project_activity:{operation:'append_once',projectId:before.id,eventKey:m.key,type:m.type,eventDate:m.date,occurredAt:m.at,description:m.description,sourceURL:m.url},history:{operation:'append_before_after_snapshot',beforeRevision:before.revision,afterRevision:after.revision,countBefore:p.historyBefore,countAfter:p.historyAfter},approval_policy:{operation:'none',before:p.policyBefore,after:p.policyAfter},notifications:{inserts:0},research_proposals:{id:prepared.proposalId,statusAfter:'applied_only_after_confirmation'},research_audit:{operation:'append_authenticated_administrator_decision_only_after_confirmation'},map_version:{operation:'invalidate_via_existing_project_save_transaction'}},
  guardrails:['Re-read current project, history, policy and timeline before generating an authenticated confirmation preview.','Reject stale project/proposal revisions, expired preview tokens, or duplicate approval events.','Use the existing Auth0/Supabase-MFA administrator route; this artifact grants no write permission.','Preserve original source references and history; no whole-hospital approval or construction inferred.'],
  exactFullSnapshots:'reports/maintenance/GUARDED-APPLICATION-MILESTONE.json'};
}
