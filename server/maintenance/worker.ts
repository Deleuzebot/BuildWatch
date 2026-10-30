import{Budget,LimitReached,hash,evaluateFinding,type Source}from'./policy';
import{SourceHTTP}from'./http';
import{parsePage,sourcePage,validateSourceSchema}from'./adapters';
import{deriveProject}from'../supabase/derive';
import{extractDocument}from'./ai';
import{noticeLinks}from'./notices';
import {componentMilestone} from './changes';
import{extractAgendaPDF,agendaReferences}from'./agendas';
import {evidenceDocuments,planningDocumentFindings} from './platforms';
export type WorkerRPC=((action:string,input?:Record<string,any>)=>Promise<any>) & {batch?:(action:string,inputs:Record<string,any>[])=>Promise<any[]>};
type Options={state:string;mode:'weekly'|'initial';dryRun:boolean;key:string;scheduled?:boolean;githubURL?:string;maxSeconds?:number;maxRequests?:number;maxRecords?:number;onlySource?:string;pageSize?:number;maxSourcePages?:number;maxDownloadBytes?:number;deferPDFExtraction?:boolean;onDownloadBytes?:(bytes:number)=>void;onEvidence?:(url:string,response:{status:number;body:string;rawBody:Buffer;etag:string|null;modified:string|null})=>void};
export async function runState(rpc:WorkerRPC,options:Options,transport:typeof fetch=fetch){
 const claimed=await rpc('claim',{state:options.state,mode:options.mode,dryRun:options.dryRun,key:options.key,scheduled:!!options.scheduled,githubURL:options.githubURL});
 if(claimed.status==='skipped')return claimed;
 const run=claimed.run,call=(action:string,input:Record<string,any>={})=>rpc(action,{runId:run.id,lease:run.lease,...input});
 const previous=run.stats||{};
 const snapshot=()=>{const value=budget.snapshot();return{...value,attemptSeconds:value.seconds,seconds:(previous.seconds||0)+value.seconds,requests:(previous.requests||0)+value.requests,downloadBytes:(previous.downloadBytes||0)+value.downloadBytes,aiRequests:(previous.aiRequests||0)+value.aiRequests,aiTokens:(previous.aiTokens||0)+value.aiTokens};};
 const budget=new Budget(Math.min(claimed.state.max_seconds,options.maxSeconds||900),Math.min(claimed.state.max_requests,options.maxRequests||300),Math.min(claimed.state.max_records,options.maxRecords||5000),Math.min(100_000_000,options.maxDownloadBytes||20_000_000));
 const cp={done:[] as string[],cursors:{} as Record<string,number>,...(run.checkpoint||{})};
 const stats:any={projectsChecked:0,sourceRecords:0,newFindings:0,statusChanges:0,milestones:0,archived:0,wouldArchive:0,duplicateCandidates:0,unverified:0,sourceFailures:0,unchangedDocuments:0,archivedExcluded:0,aiUnresolved:0,...(run.stats||{})};
 const sources:Source[]=claimed.sources.filter((s:Source)=>!options.onlySource||s.id===options.onlySource);
 if(options.onlySource){const selected=sources.find(s=>s.id===options.onlySource);stats.pilotSelection=true;stats.pilotSource=selected?{id:selected.id,jurisdiction:selected.jurisdiction,url:selected.url,role:selected.config.sourceRole||'development_review',mappingVersion:selected.config.mappingVersion||null}:null;stats.coverage='Selected-source pilot only; not statewide verification';}
 const errors:string[]=[];let status='completed';
 try{
  if(!sources.length){status='partially_completed';errors.push('No enabled source adapters cover this selection.');}
  const robots=new Map<string,string>();
  for(const source of sources){
   if(cp.done.includes(source.id))continue;
   if(source.config.sourceRole==='location_reference'){
    stats.referenceSourcesSkipped=(stats.referenceSourcesSkipped||0)+1;cp.done.push(source.id);
    await call('checkpoint',{checkpoint:cp,stats:{...stats,...snapshot()}});continue;
   }
   try{
    const origin=new URL(source.url).origin,http=new SourceHTTP(budget,origin,transport),policyKey=origin+':'+(source.adapter==='arcgis'&&source.authority==='official'?'official-arcgis':'other');http.onRead=options.onEvidence;http.onBytes=options.onDownloadBytes;
    if(!robots.has(policyKey)){
     try{const result=await http.get(origin+'/robots.txt');robots.set(policyKey,result.body);}catch(e:any){if(e instanceof LimitReached)throw e;
      // RFC 9309 §2.3.1.3: unavailable robots.txt is distinct from an explicit
      // Disallow rule. Limit 403 fallback to registered official ArcGIS APIs;
      // actual API 401/403 and all server/network failures still stop retrieval.
      if(robotsUnavailableAllows(source,e.message)){robots.set(policyKey,'');stats.robotsUnavailable=(stats.robotsUnavailable||0)+1;}
      else throw Error('Unable to verify source access policy: '+e.message);}
    }
    const policy=robots.get(policyKey)!;
    if(!robotsAllows(policy,new URL(source.url).pathname))throw Error('robots.txt restricts automatic retrieval for this source.');
    http.accessPolicy=url=>robotsAllows(policy,url.pathname+url.search);
    if(source.adapter==='document'&&source.config.agendaRedirectPathPattern){const permitted=new RegExp(source.config.agendaRedirectPathPattern);http.redirectPolicy=url=>permitted.test(url.pathname+url.search);}
    const crawlDelay=Math.max(1,...[...policy.matchAll(/^crawl-delay:\s*(\d+(?:\.\d+)?)/gim)].map(v=>Number(v[1])));
    if(crawlDelay>60)throw Error('Source crawl delay exceeds the bounded worker; defer for access review.');
    http.minimumInterval=crawlDelay*1000;
    if(source.adapter==='arcgis'&&(options.onlySource||!source.config.idField||source.config.requiredFields?.length)){
     const meta=JSON.parse((await http.get(source.url+'?f=json')).body);
     if(options.onlySource)stats.sourceSchema={name:meta.name,geometryType:meta.geometryType,fields:(meta.fields||[]).slice(0,150).map((f:any)=>({name:f.name,alias:f.alias,type:f.type,...(f.domain?.codedValues&&/status|type|phase|category|mode/i.test(f.name)?{codes:f.domain.codedValues.slice(0,30)}:{})}))};
     if(source.config.requiredFields?.length)validateSourceSchema(source,meta);
     const oid=meta.objectIdField||meta.fields?.find((v:any)=>v.type==='esriFieldTypeOID')?.name;
     if(!oid||!Array.isArray(meta.fields))throw Error('Stable source object identifier unavailable');
     if(!source.config.idField){source.config={...source.config,idField:oid};await call('source',{sourceId:source.id,config:{idField:oid}});}
    }
    let cursor=cp.cursors[source.id]??(source.config.pagination==='oid_keyset'?-1:0),more=true;
    const pageSize=options.dryRun?Math.max(1,Math.min(500,Math.floor(options.pageSize||50))):50;
    let sourcePages=0;
    while(more){
     if(options.maxSourcePages&&sourcePages>=options.maxSourcePages){stats.sourcesDeferred=(stats.sourcesDeferred||0)+1;errors.push(source.jurisdiction+': per-source page ceiling reached; continuation remains queued');break;}sourcePages++;
     budget.check();const url=sourcePage(source,cursor,Math.min(pageSize,budget.maxRecords-budget.records));
     const cacheURL=source.config.mappingVersion?url+'#mapping='+encodeURIComponent(source.config.mappingVersion):url;
     const cache=await call('document',{sourceId:source.id,url:cacheURL});
     // An unchanged index can still link a revised PDF at the same URL. Revisit
     // bounded children, using their own conditional/hash caches instead.
     const reviewDocuments=source.adapter==='document'&&options.dryRun&&source.config.agendaPDFReview===true;
     const reusable=!reviewDocuments&&source.config.pagination!=='oid_keyset'&&pageSize===50&&options.mode==='weekly'&&cache.applied===!options.dryRun;
     const result=await http.get(url,reusable?{...(cache.etag?{'If-None-Match':cache.etag}:{}),...(cache.modified?{'If-Modified-Since':cache.modified}:{})}:{});
     if(result.status===304){if(!reusable||!cache.hash)throw Error('Source returned 304 without a reusable validated page');stats.unchangedDocuments++; // Page cardinality is retained, not guessed from HTTP 304.
      if(cache.more){cursor+=50;cp.cursors[source.id]=cursor;await call('checkpoint',{checkpoint:cp,stats:{...stats,...snapshot()}});continue;}more=false;break;
     }
     const digest=hash(result.body);let advance=50,nextCursor:number|undefined;
     if(digest===cache.hash&&reusable){stats.unchangedDocuments++;more=!!cache.more;}
     else if(source.adapter==='document'){
      if(source.config.noticePathPattern){
       const links=source.config.documentResearch===true?evidenceDocuments(source,result.body):noticeLinks(source,result.body);if(!links.length)throw Error('Official document index layout changed or no matching document links are available');
       for(const link of links){budget.check(false);budget.records++;const lead={externalId:hash(link.url),name:link.title,description:'Official document link; project and meeting contents require review.',address:'',latitude:null,longitude:null,rawStatus:'',category:'',developer:'',url:link.url,quote:link.title+' — '+link.url,principalUseVerified:false,locationVerified:false,wholeDevelopment:false,recordKind:'document_index_entry'};
        await call('finding',{id:hash([source.id,link,options.dryRun]),sourceId:source.id,finding:lead,project:{id:'lead-'+hash(link.url).slice(0,30),state:source.state},eligible:false,reason:'Official agenda/document pointer only. No project status, meeting date or coordinates inferred.',confidence:{method:'requires_review'}});stats.documentLeads=(stats.documentLeads||0)+1;stats.unverified++;
       }
       if(options.dryRun&&source.config.agendaPDFReview===true){
        cp.agendaIssues??={};cp.agendaIssues[source.id]=[];
        const limit=Math.max(1,Math.min(3,source.config.agendaPDFLimit||1));stats.documentCoverage='Official index plus bounded PDF sample only; other packets and project/meeting associations still require review';
        stats.agendaDocumentsDeferred=(stats.agendaDocumentsDeferred||0)+Math.max(0,links.length-limit);
        for(const link of links.slice(0,limit)){
         if(options.deferPDFExtraction){stats.agendaDocumentsDeferred++;continue;}
         budget.check();
         try{const documentKey=link.url+'#pdf-parser=v3&profile='+hash([source.config.mappingVersion,source.config.documentResearch,source.config.decisionProfile]),cached=await call('document',{sourceId:source.id,url:documentKey});
          const document=await http.get(link.url,cached.hash?{Accept:'application/pdf',...(cached.etag?{'If-None-Match':cached.etag}:{}),...(cached.modified?{'If-Modified-Since':cached.modified}:{})}:{Accept:'application/pdf'},0,source.config.pdfProfile||'standard');
          if(document.status===304){if(!cached.hash)throw Error('PDF returned 304 without a validated extraction');stats.unchangedDocuments++;continue;}
          const documentHash=hash(document.rawBody);if(cached.hash===documentHash){stats.unchangedDocuments++;continue;}
          const extracted=await extractAgendaPDF(document.rawBody,source.config.pdfProfile||'standard');stats.agendaPDFs=(stats.agendaPDFs||0)+1;
          if(extracted.truncated){stats.agendaTruncated=(stats.agendaTruncated||0)+1;const issue=source.jurisdiction+' document truncated: '+link.url;errors.push(issue);cp.agendaIssues[source.id].push(issue);}
          const refs=source.config.documentResearch===true?planningDocumentFindings(source,extracted,link.url,documentHash):agendaReferences(extracted,link.url);stats.agendaReferences=(stats.agendaReferences||0)+refs.length;
          if(!refs.length)stats.agendaWithoutCaseReferences=(stats.agendaWithoutCaseReferences||0)+1;
          for(const ref of refs){budget.check(false);budget.records++;const lead:any=source.config.documentResearch===true?ref:{externalId:ref.id,name:ref.sourceIdentifier,description:ref.quote,address:'',latitude:null,longitude:null,rawStatus:'',category:'',developer:'',url:link.url,quote:ref.quote,principalUseVerified:false,locationVerified:false,wholeDevelopment:false,recordKind:'agenda_case_reference',documentPage:ref.page,documentHash,extractionTruncated:extracted.truncated};
           if(source.config.documentResearch===true){const match=await call('match',{sourceId:source.id,externalId:lead.externalId});lead.documentProposal.matchCandidates=match.ids||[];lead.documentProposal.identityVerified=false;stats.documentDecisions=(stats.documentDecisions||0)+(lead.documentProposal.decision?1:0);stats.documentDescriptionCandidates=(stats.documentDescriptionCandidates||0)+(lead.documentProposal.description?1:0);}
           await call('finding',{id:hash([source.id,ref,options.dryRun]),sourceId:source.id,finding:lead,project:{id:'lead-'+ref.id.slice(0,30),state:source.state},eligible:false,reason:'Exact official agenda text and page citation. No project identity, decision, meeting association or coordinates automatically verified.',confidence:{method:'document_excerpt_requires_review'}});stats.unverified++;
          }
          // Cache only after extraction and private proposal persistence succeed.
          // Raw PDFs/text are not stored in the database cache.
          await call('cache',{sourceId:source.id,url:documentKey,hash:documentHash,etag:document.etag,modified:document.modified,more:false,applied:false});
         }catch(e:any){if(e instanceof LimitReached)throw e;stats.agendaFailures=(stats.agendaFailures||0)+1;const issue=source.jurisdiction+' document: '+e.message;errors.push(issue);cp.agendaIssues[source.id].push(issue);}
        }
       }
       more=false;
      }else{
      const ai=await extractDocument(result.body,source.url,budget);stats.aiUnresolved+=ai.findings.length||1;stats.unverified++;
      // Preserve source evidence even if AI is off or unavailable. No invented project.
      const lead={externalId:digest,name:source.jurisdiction+' source document',description:'',address:'',latitude:null,longitude:null,rawStatus:'',category:'',developer:'',url:source.url,quote:result.body.replace(/<[^>]*>/g,' ').slice(0,2000),principalUseVerified:false,locationVerified:false,wholeDevelopment:false,aiFindings:ai.findings,aiStatus:ai.status};
      await call('finding',{id:hash([source.id,digest,options.dryRun]),sourceId:source.id,finding:lead,project:{id:'lead-'+digest.slice(0,30),state:source.state},eligible:false,reason:'Unstructured document requires review; AI is optional and never establishes facts.',confidence:{method:'requires_review'}});
      more=false;
      }
     }else{
      const page=parsePage(source,result.body,Math.min(pageSize,budget.maxRecords-budget.records));more=page.more;
      if(source.config.pagination==='oid_keyset'&&page.count){if(page.nextCursor===undefined||page.firstCursor===undefined||page.firstCursor<=cursor||page.nextCursor<=cursor)throw Error('Official keyset failed to advance');nextCursor=page.nextCursor;}
      const matches=options.dryRun&&!source.autopublish&&rpc.batch?await rpc.batch('match',page.findings.map(f=>({runId:run.id,lease:run.lease,sourceId:source.id,externalId:f.externalId}))):null;
      const queued:Record<string,any>[]=[];let index=0;
      for(const finding of page.findings){
       budget.check(false);budget.records++;stats.sourceRecords++;
       const quality=stats.mappingQuality??={named:0,statusDecoded:0,statusRequiresReview:0,polygonFootprints:0,verifiedPoints:0,planDates:0,permitDates:0,conflictingNotes:0};
       if(finding.name)quality.named++;if(finding.status)quality.statusDecoded++;else quality.statusRequiresReview++;
       if(finding.locationEvidence?.type==='polygon')quality.polygonFootprints++;if(finding.locationVerified)quality.verifiedPoints++;
       if(finding.locationEvidence?.type==='polyline')quality.polylineFootprints=(quality.polylineFootprints||0)+1;
       if(finding.sourceDates?.plansSubmittedAt)quality.planDates++;if(finding.sourceDates?.permitIssuedAt)quality.permitDates++;
       if(finding.reviewNotes?.length)quality.conflictingNotes++;
       const match=matches?matches[index++]:await call('match',{sourceId:source.id,externalId:finding.externalId});stats.projectsChecked+=match.ids.length===1?1:0;
       const evaluation=evaluateFinding(finding,source,match.project);
       const component=match.ids.length===1?componentMilestone(finding,source,match.project):null;
       if(match.ids.length>1)evaluation.reasons.push('Shared source identifier maps to multiple records; duplicate review required');
       const derived=component?{...await deriveProject(match.project,match.policy),recordEvents:[component]}:evaluation.eligible?await deriveProject(evaluation.project,match.policy):null;
       if(derived&&!component)derived.recordEvents=derived.recordEvents.map(e=>({...e,url:finding.url,description:(e.description+' Evidence: '+finding.quote).slice(0,700)}));
       const input={id:hash([source.id,finding.externalId,finding,options.dryRun]),sourceId:source.id,finding,project:evaluation.project,componentMilestone:component,informationChange:evaluation.informationChange,eligible:evaluation.eligible&&match.ids.length<=1,confidence:evaluation.confidence,reason:evaluation.reasons.join('; ')||'Exact official evidence and deterministic validation gates passed.',derived};
       if(matches){queued.push({runId:run.id,lease:run.lease,...input});continue;}
       const res=await call('finding',input);
       if(res.outcome==='milestone_added'||res.outcome==='would_add_milestone')stats.milestones++;
       if(res.previousOutcome==='awaiting_review')stats.unverified++;
       if(res.outcome==='potential_duplicate')stats.duplicateCandidates++;else if(res.outcome==='awaiting_review')stats.unverified++;else if(res.outcome==='excluded_archive')stats.archivedExcluded++;else if(res.outcome==='published'){if(!match.project)stats.newFindings++;else if(match.project.status!==finding.status)stats.statusChanges++;stats.milestones+=finding.eventDate?1:0;}
      }
      if(matches&&queued.length){const outcomes=await rpc.batch!('finding',queued);for(const res of outcomes){if(res.outcome==='awaiting_review'||res.previousOutcome==='awaiting_review')stats.unverified++;if(res.outcome==='potential_duplicate')stats.duplicateCandidates++;if(res.outcome==='excluded_archive')stats.archivedExcluded++;}}
      advance=page.count;
      if(more&&!advance)throw Error('Source pagination returned an empty continuation page');
     }
     await call('cache',{sourceId:source.id,url:cacheURL,hash:digest,etag:result.etag,modified:result.modified,more,applied:!options.dryRun});
     cursor=nextCursor??cursor+advance;cp.cursors[source.id]=cursor;
     await call('checkpoint',{checkpoint:cp,stats:{...stats,...snapshot()}});
    }
    if(more)continue;
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
  // A completed index checkpoint does not resolve failed PDF extraction. Preserve
  // those blockers on a resumed run instead of silently reporting success.
  for(const issues of Object.values(cp.agendaIssues||{}))for(const issue of issues as string[])if(!errors.includes(issue))errors.push(issue);
  if(errors.length)status='partially_completed';else if(stats.unverified||stats.aiUnresolved)status='awaiting_review';
  if(options.onlySource)stats.coverage='Selected-source pilot only; not statewide verification';
  else stats.coverage='Enabled source adapters only; not verification of every jurisdiction or project';
 }catch(e:any){status=e instanceof LimitReached?'partially_completed':'failed';errors.push(e.message);}
 stats.qualityAudit=await call('quality');
 const result={...stats,...snapshot(),error:errors.join(' | ').slice(0,1000),status,dryRun:options.dryRun,runId:run.id,sourceCoverage:{completed:cp.done.length,enabled:sources.length}};
 await call('finish',{status,checkpoint:cp,stats:result,error:result.error||null});
 return result;
}
export function robotsUnavailableAllows(source:Source,message:string){
 if(/HTTP (404|410)$/.test(message))return true;
 return /HTTP 403$/.test(message)&&source.authority==='official'&&source.adapter==='arcgis'&&/\/(?:MapServer|FeatureServer)\/\d+$/i.test(new URL(source.url).pathname);
}
export function robotsAllows(body:string,path:string){
 const groups:{agents:string[];rules:{allow:boolean;path:string}[]}[]=[];let group={agents:[] as string[],rules:[] as {allow:boolean;path:string}[]};
 for(const raw of body.split(/\r?\n/)){const line=raw.split('#')[0].trim(),split=line.indexOf(':');if(split<0)continue;const key=line.slice(0,split).trim().toLowerCase(),value=line.slice(split+1).trim();if(key==='user-agent'){if(group.rules.length){groups.push(group);group={agents:[],rules:[]};}group.agents.push(value.toLowerCase());}else if((key==='disallow'||key==='allow')&&value)group.rules.push({allow:key==='allow',path:value});}
 groups.push(group);const specific=groups.filter(g=>g.agents.some(v=>v.includes('buildwatch'))),selected=specific.length?specific:groups.filter(g=>g.agents.includes('*')),rules=selected.flatMap(g=>g.rules);
 // RFC 9309 wildcard/end-anchor matching. An unrelated /*/ctl/ restriction
 // must not block every public page, and query-specific rules still apply.
 const specificity=(value:string)=>value.replace(/\*/g,'').replace(/\$$/,'').length;
 const matched=rules.filter(v=>{const end=v.path.endsWith('$'),raw=end?v.path.slice(0,-1):v.path;const pattern=raw.split('*').map(part=>part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*');return new RegExp('^'+pattern+(end?'$':'')).test(path);});matched.sort((a,b)=>specificity(b.path)-specificity(a.path)||Number(b.allow)-Number(a.allow));
 return !matched.length||matched[0].allow;
}
