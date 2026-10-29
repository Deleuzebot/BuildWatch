/** Manual shadow checks. Publication/archival operations are absent from its database API. */
import {appendFileSync} from 'node:fs';import {PostgresDatabase} from '../server/postgres/connection';import {runShadow} from '../server/maintenance/shadow';
import {requireShadowProfile} from '../server/maintenance/shadow-plan';
requireShadowProfile(process.env.BW_SHADOW_PROFILE||'structured-feeds');
if(!process.env.CI)process.loadEnvFile('.env.maintenance');
if(process.env.BW_SHADOW_LIVE_CHECKS!=='true')throw Error('Explicit manual live-source authorization required');
if(process.env.BW_ALLOW_LIVE_WRITES==='true'||process.env.BW_AI_ENABLED==='true')throw Error('Publication and AI must remain off');
const db=new PostgresDatabase();try{const rpc=async(action:string,input:any={})=>(await db.one('SELECT public.buildwatch_shadow($1,$2::jsonb) v',[action,JSON.stringify(input)])).v;
const r=await runShadow(rpc,{key:process.env.GITHUB_RUN_ID||new Date().toISOString(),scheduled:process.env.GITHUB_EVENT_NAME==='schedule',githubURL:process.env.GITHUB_RUN_ID?'https://github.com/'+process.env.GITHUB_REPOSITORY+'/actions/runs/'+process.env.GITHUB_RUN_ID:undefined});
// Public repository: publish aggregate counts only. Detailed evidence stays in the protected dashboard.
const summary={status:r.status,runId:r.runId,requests:r.requests,sourceFailures:r.sourceFailures,newSignificantCandidates:r.newSignificantCandidates,projectsChecked:r.projectsChecked,duplicateMilestonesSuppressed:r.duplicateMilestonesSuppressed,proposedMilestones:r.proposedMilestones,withheldStatusCandidates:r.withheldStatusCandidates,wouldArchive:r.wouldArchive,review:r.unverified,cacheBytes:r.estimatedCacheWriteBytes,findingBytes:r.estimatedFindingBytes,coverage:r.sourceCoverage,publicChanges:0};console.log(JSON.stringify(summary));
if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,'## NC shadow checks — no public changes\n\n```json\n'+JSON.stringify(summary,null,2)+'\n```\nDetailed evidence and rejection reasons are private in Automation Management. This is bounded three-source coverage, not statewide verification.\n');if(['failed','partially_completed'].includes(r.status))process.exitCode=1;
}finally{await db.close();}
