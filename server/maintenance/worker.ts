import{Budget,LimitReached,hash,evaluateFinding,type Source}from'./policy';
import{SourceHTTP}from'./http';
import{parsePage,sourcePage}from'./adapters';
import{deriveProject}from'../supabase/derive';
import{extractDocument}from'./ai';
export type WorkerRPC=(action:string,input?:Record<string,any>)=>Promise<any>;
type Options={state:string;mode:'weekly'|'initial';dryRun:boolean;key:string;scheduled?:boolean;githubURL?:string;maxSeconds?:number;maxRequests?:number;maxRecords?:number;onlySource?:string};
export async function runState(rpc:WorkerRPC,options:Options,transport:typeof fetch=fetch){
 const claimed=await rpc('claim',{state:options.state,mode:options.mode,dryRun:options.dryRun,key:options.key,scheduled:!!options.scheduled,githubURL:options.githubURL});
 if(claimed.status==='skipped')return claimed;
 const run=claimed.run,call=(action:string,input:Record<string,any>={})=>rpc(action,{runId:run.id,lease:run.lease,...input});
 const previous=run.stats||{};
 const snapshot=()=>{const value=budget.snapshot();return{...value,attemptSeconds:value.seconds,seconds:(previous.seconds||0)+value.seconds,requests:(previous.requests||0)+value.requests,downloadBytes:(previous.downloadBytes||0)+value.downloadBytes,aiRequests:(previous.aiRequests||0)+value.aiRequests,aiTokens:(previous.aiTokens||0)+value.aiTokens};};
 const budget=new Budget(Math.min(claimed.state.max_seconds,options.maxSeconds||900),Math.min(claimed.state.max_requests,options.maxRequests||300),Math.min(claimed.state.max_records,options.maxRecords||5000));
 const cp={done:[] as string[],cursors:{} as Record<string,number>,...(run.checkpoint||{})};
 const stats:any={projectsChecked:0,sourceRecords:0,newFindings:0,statusChanges:0,milestones:0,archived:0,wouldArchive:0,duplicateCandidates:0,unverified:0,sourceFailures:0,unchangedDocuments:0,archivedExcluded:0,aiUnresolved:0,...(run.stats||{})};
 const sources:Source[]=claimed.sources.filter((s:Source)=>!options.onlySource||s.id===options.onlySource);
 const errors:string[]=[];let status='completed';
 try{
  if(!sources.length){status='partially_completed';errors.push('No enabled source adapters cover this selection.');}
  const robots=new Map<string,boolean>();
  for(const source of sources){
   if(cp.done.includes(source.id))continue;
   try{
    const origin=new URL(source.url).origin,http=new SourceHTTP(budget,origin,transport);
    if(!robots.has(origin)){
     try{const result=await http.get(origin+'/robots.txt');robots.set(origin,robotsAllows(result.body,new URL(source.url).pathname));}catch(e:any){if(e instanceof LimitReached)throw e;if(/HTTP 404/.test(e.message))robots.set(origin,true);else throw Error('Unable to verify source access policy: '+e.message);}
    }
    if(!robots.get(origin))throw Error('robots.txt restricts automatic retrieval for this source.');
    if(source.adapter==='arcgis'&&!source.config.idField){
     const meta=JSON.parse((await http.get(source.url+'?f=json')).body);
     const oid=meta.objectIdField||meta.fields?.find((v:any)=>v.type==='esriFieldTypeOID')?.name;
     if(!oid||!Array.isArray(meta.fields))throw Error('Stable source object identifier unavailable');
     source.config={...source.config,idField:oid};await call('source',{sourceId:source.id,config:{idField:oid}});
    }
    let cursor=cp.cursors[source.id]||0,more=true;
    while(more){
     budget.check();const url=sourcePage(source,cursor),cached=await call('document',{sourceId:source.id,url});
     const reusable=options.mode==='weekly'&&cached.applied===!options.dryRun;
     const result=await http.get(url,reusable?{...(cached.etag?{'If-None-Match':cached.etag}:{}),...(cached.modified?{'If-Modified-Since':cached.modified}:{})}:{});
     if(result.status===304){stats.unchangedDocuments++; // Page cardinality is retained, not guessed from HTTP 304.
      if(cached.more){cursor+=50;cp.cursors[source.id]=cursor;await call('checkpoint',{checkpoint:cp,stats:{...stats,...snapshot()}});continue;}more=false;break;
     }
     const digest=hash(result.body);
     if(digest===cached.hash&&reusable){stats.unchangedDocuments++;more=!!cached.more;}
     else if(source.adapter==='document'){
      const ai=await extractDocument(result.body,source.url,budget);stats.aiUnresolved+=ai.findings.length||1;stats.unverified++;
      // Preserve source evidence even if AI is off or unavailable. No invented project.
      const lead={externalId:digest,name:source.jurisdiction+' source document',description:'',address:'',latitude:null,longitude:null,rawStatus:'',category:'',developer:'',url:source.url,quote:result.body.replace(/<[^>]*>/g,' ').slice(0,2000),principalUseVerified:false,locationVerified:false,wholeDevelopment:false,aiFindings:ai.findings,aiStatus:ai.status};
      await call('finding',{id:hash([source.id,digest,options.dryRun]),sourceId:source.id,finding:lead,project:{id:'lead-'+digest.slice(0,30),state:source.state},eligible:false,reason:'Unstructured document requires review; AI is optional and never establishes facts.',confidence:{method:'requires_review'}});
      more=false;
     }else{
      const page=parsePage(source,result.body);more=page.more;
      for(const finding of page.findings){
       budget.check();budget.records++;stats.sourceRecords++;
       const match=await call('match',{sourceId:source.id,externalId:finding.externalId});stats.projectsChecked+=match.ids.length===1?1:0;
       const evaluation=evaluateFinding(finding,source,match.project);
       if(match.ids.length>1)evaluation.reasons.push('Shared source identifier maps to multiple records; duplicate review required');
       const res=await call('finding',{id:hash([source.id,finding.externalId,finding,options.dryRun]),sourceId:source.id,finding,project:evaluation.project,eligible:evaluation.eligible&&match.ids.length<=1,confidence:evaluation.confidence,reason:evaluation.reasons.join('; ')||'Exact official evidence and deterministic validation gates passed.',derived:evaluation.eligible?await deriveProject(evaluation.project):null});
       if(res.previousOutcome==='awaiting_review')stats.unverified++;
       if(res.outcome==='potential_duplicate')stats.duplicateCandidates++;else if(res.outcome==='awaiting_review')stats.unverified++;else if(res.outcome==='excluded_archive')stats.archivedExcluded++;else if(res.outcome==='published'){if(!match.project)stats.newFindings++;else if(match.project.status!==finding.status)stats.statusChanges++;stats.milestones+=finding.eventDate?1:0;}
      }
     }
     await call('cache',{sourceId:source.id,url,hash:digest,etag:result.etag,modified:result.modified,more,applied:!options.dryRun});
     cursor+=50;cp.cursors[source.id]=cursor;
     await call('checkpoint',{checkpoint:cp,stats:{...stats,...snapshot()}});
    }
    cp.done.push(source.id);delete cp.cursors[source.id];await call('source',{sourceId:source.id});
    await call('checkpoint',{checkpoint:cp,stats:{...stats,...snapshot()}});
   }catch(e:any){
    if(e instanceof LimitReached)throw e;
    stats.sourceFailures++;errors.push(source.jurisdiction+': '+e.message);await call('source',{sourceId:source.id,error:e.message});
   }
  }
  // Discover substantive movement first. A source outage or selected-source pilot
  // must never trigger state-wide expiration. Reserve no extra HTTP calls here.
  if(!options.onlySource&&sources.length&&errors.length===0&&Date.now()-budget.started<budget.seconds*1000-1000){
   for(const p of await call('expirations')){if(Date.now()-budget.started>=budget.seconds*1000-1000)throw new LimitReached('Archive checkpoint deferred at runtime ceiling');const value=await call('expire',{projectId:p.id});if(value.outcome==='archived')stats.archived++;if(value.outcome==='would_archive')stats.wouldArchive++;}
  }
  if(errors.length)status='partially_completed';else if(stats.unverified||stats.aiUnresolved)status='awaiting_review';
  if(options.onlySource)stats.pilotSelection=true;
  if(options.onlySource)stats.coverage='Selected-source pilot only; not statewide verification';
  else stats.coverage='Enabled source adapters only; not verification of every jurisdiction or project';
 }catch(e:any){status=e instanceof LimitReached?'partially_completed':'failed';errors.push(e.message);}
 stats.qualityAudit=await call('quality');
 const result={...stats,...snapshot(),error:errors.join(' | ').slice(0,1000),status,dryRun:options.dryRun,runId:run.id,sourceCoverage:{completed:cp.done.length,enabled:sources.length}};
 await call('finish',{status,checkpoint:cp,stats:result,error:result.error||null});
 return result;
}
export function robotsAllows(body:string,path:string){
 let selected=false,rules:{allow:boolean;path:string}[]=[];
 for(const raw of body.split(/\r?\n/)){const line=raw.split('#')[0].trim(),split=line.indexOf(':');if(split<0)continue;const key=line.slice(0,split).trim().toLowerCase(),value=line.slice(split+1).trim();if(key==='user-agent')selected=value==='*'||/buildwatch/i.test(value);if(selected&&(key==='disallow'||key==='allow')&&value)rules.push({allow:key==='allow',path:value});}
 // Conservative wildcard handling: unsupported expressions block instead of evading a restriction.
 const matched=rules.filter(v=>path.startsWith(v.path.replace(/\*.*$/,'')));matched.sort((a,b)=>b.path.length-a.path.length||Number(b.allow)-Number(a.allow));
 return !matched.length||matched[0].allow;
}
