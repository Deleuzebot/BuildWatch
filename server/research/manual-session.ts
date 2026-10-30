import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {mkdirSync,chmodSync} from 'node:fs';import {dirname} from 'node:path';
import {hash,type Source,type Finding} from '../maintenance/policy';
import {parsePage,sourcePage} from '../maintenance/adapters';
import {evidenceDocuments,planningDocumentFindings} from '../maintenance/platforms';
import type {PDFText} from '../maintenance/agendas';

export type ResearchTask={id:string;state:string;jurisdiction:string;sourceId:string;kind:string;url:string;status:string;priority:number;cursor:any;data:any;updated:number};
export type ManualLimits={maxSeconds:number;maxRecords:number;pageSize:number;maxDocumentLinks:number;sourceRefreshHours:number};
const unpack=(r:any)=>r?{...r,cursor:JSON.parse(r.cursor),data:JSON.parse(r.data)}:null;
/** Deterministic facts only. Retrieval time and GIS edit metadata cannot create a research update. */
export function findingFingerprint(f:Finding){
 const dateKeys=['applicationActionAt','applicationApprovalAt','applicationStatusAt','plansSubmittedAt','permitIssuedAt','submittedAt','hearingAt'];
 const decision=(f as any).documentProposal?.decision;
 const facts=Object.fromEntries(Object.entries(f.sourceFacts||{}).filter(([key])=>!['lastEditedAt','last_edited_date','EditDate','Editor','CreationDate','Creator','retrievedAt','updatedAt'].includes(key)));
 return hash({id:f.externalId,name:f.name,description:f.description,address:f.address,latitude:f.latitude,longitude:f.longitude,status:f.rawStatus,statusLabel:f.statusLabel,category:f.category,developer:f.developer,eventDate:f.eventDate,location:{type:f.locationEvidence?.type,bounds:f.locationEvidence?.bounds},dates:Object.fromEntries(dateKeys.filter(k=>f.sourceDates?.[k]).map(k=>[k,f.sourceDates![k]])),facts,decision:decision?{kind:decision.kind,caseId:decision.caseId,date:decision.date,scope:decision.scope}:null});
}
export function taskPriority(data:any,now=Date.now()){
 let value=Math.round(Math.log10(Math.max(1,data.population||1))*3)+(data.coverage==='sample_reconciliation_tested'?12:data.coverage==='structured_retrieval_tested'?8:0);
 if(data.outstanding)value+=20;if(data.changed)value+=25;if(/review/i.test(data.status||''))value+=10;
 if(data.meetingAt&&Date.parse(data.meetingAt)>now&&Date.parse(data.meetingAt)-now<14*86400000)value+=30;
 if(data.approvalAt&&now-Date.parse(data.approvalAt)>=0&&now-Date.parse(data.approvalAt)<30*86400000)value+=15;
 return value;
}
/** Private manual work journal, not a development database or a scheduler. No publication operations. */
export class ManualResearchSession{
 readonly db:DatabaseSync;
 constructor(readonly file:string,readonly limits:ManualLimits,readonly now:()=>number=Date.now){
  mkdirSync(dirname(file),{recursive:true,mode:0o700});this.db=new DatabaseSync(file);
  if(this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN('sessions','tasks','fingerprints','snapshots','events') LIMIT 1").get()){this.db.close();throw Error('Use a separate private research journal; original application databases must not be modified');}chmodSync(file,0o600);
  this.db.exec(`PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000;
   CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,day TEXT NOT NULL,states TEXT NOT NULL,started INTEGER NOT NULL,finished INTEGER,status TEXT NOT NULL DEFAULT 'running',request_cap INTEGER NOT NULL DEFAULT 0 CHECK(request_cap=0));
   CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,state TEXT NOT NULL,jurisdiction TEXT NOT NULL,source_id TEXT NOT NULL,kind TEXT NOT NULL,url TEXT NOT NULL,status TEXT NOT NULL,priority INTEGER NOT NULL,cursor TEXT NOT NULL DEFAULT '{}',data TEXT NOT NULL,updated INTEGER NOT NULL);
   CREATE INDEX IF NOT EXISTS tasks_queue ON tasks(state,status,priority DESC,updated);
   CREATE TABLE IF NOT EXISTS fingerprints(source_id TEXT NOT NULL,external_id TEXT NOT NULL,semantic_hash TEXT NOT NULL,observed INTEGER NOT NULL,PRIMARY KEY(source_id,external_id));
   CREATE TABLE IF NOT EXISTS snapshots(task_id TEXT NOT NULL,url TEXT NOT NULL,hash TEXT NOT NULL,observed INTEGER NOT NULL,result TEXT NOT NULL,PRIMARY KEY(task_id,url));
   CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,session_id TEXT NOT NULL REFERENCES sessions(id),task_id TEXT,kind TEXT NOT NULL,data TEXT NOT NULL,created INTEGER NOT NULL);
   CREATE INDEX IF NOT EXISTS session_events ON events(session_id,created);
  `);
 }
 close(){this.db.close();}
 private tx<T>(fn:()=>T){this.db.exec('BEGIN IMMEDIATE');try{const value=fn();this.db.exec('COMMIT');return value;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 private event(sid:string,task:string|null,kind:string,data:any){this.db.prepare('INSERT OR IGNORE INTO events VALUES(?,?,?,?,?,?)').run(hash([sid,task,kind,data]),sid,task,kind,JSON.stringify(data),this.now());}
 private session(id:string,mutable=true){const row:any=this.db.prepare('SELECT * FROM sessions WHERE id=?').get(id);if(!row)throw Error('Unknown manual session');if(mutable&&(row.finished||this.now()-row.started>=this.limits.maxSeconds*1000))throw Error('Session finished or runtime ceiling reached; report it and start another manual session to resume the queue');return {...row,states:JSON.parse(row.states)};}
 task(id:string):ResearchTask{const r=unpack(this.db.prepare('SELECT *,source_id AS sourceId FROM tasks WHERE id=?').get(id));if(!r)throw Error('Unknown research task');return r;}
 private put(t:Omit<ResearchTask,'status'|'cursor'|'updated'>,status='pending'){
  this.db.prepare('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').run(t.id,t.state,t.jurisdiction,t.sourceId,t.kind,t.url,status,t.priority,'{}',JSON.stringify(t.data),this.now());
 }
 start(day:string,states:string[],seeds:{source:Source;population?:number;coverage?:string}[],id:string=randomUUID()){
  return this.tx(()=>{
   const old:any=this.db.prepare('SELECT * FROM sessions WHERE id=?').get(id);if(old){if(old.day!==day||old.states!==JSON.stringify(states))throw Error('Session identity conflicts with its weekday queue');return this.session(id,false);}
   this.db.prepare('INSERT INTO sessions(id,day,states,started) VALUES(?,?,?,?)').run(id,day,JSON.stringify(states),this.now());
   for(const state of states){const sources=seeds.filter(s=>s.source.state===state);if(!sources.length)this.put({id:hash(['coverage',state]),state,jurisdiction:state,sourceId:'',kind:'coverage_gap',url:'',priority:1,data:{reason:'No registered sources in this manual queue; not researched or activated.'}},'blocked');}
   for(const seed of seeds.filter(s=>states.includes(s.source.state))){const s=seed.source,key=hash(['source',s.state,s.url]);this.put({id:key,state:s.state,jurisdiction:s.jurisdiction,sourceId:s.id,kind:'source',url:s.url,priority:taskPriority(seed,this.now()),data:{source:s,population:seed.population||0,coverage:seed.coverage||'identified_only'}});
    const t=this.task(key);if(hash(t.data.source.config)!==hash(s.config))this.db.prepare("UPDATE tasks SET status='pending',cursor='{}',data=?,updated=? WHERE id=?").run(JSON.stringify({...t.data,source:s}),this.now(),key);
    else if(t.status==='done'&&this.now()-t.updated>=this.limits.sourceRefreshHours*3600000)this.db.prepare("UPDATE tasks SET status='pending',cursor='{}',updated=? WHERE id=?").run(this.now(),key);
   }return this.session(id,false);
  });
 }
 next(sessionId:string,limit=5){const s=this.session(sessionId);return this.db.prepare(`SELECT *,source_id AS sourceId FROM tasks WHERE state IN(${s.states.map(()=>'?').join(',')}) AND status='pending' ORDER BY priority+min(20,max(0,(?-updated)/86400000)) DESC,updated,id LIMIT ?`).all(...s.states,this.now(),Math.min(20,Math.max(1,limit))).map(unpack).map(t=>({...t,requestURL:t.kind==='source'&&t.data.source.adapter==='arcgis'?sourcePage(t.data.source,t.cursor.offset??(t.data.source.config.pagination==='oid_keyset'?-1:0),this.limits.pageSize):t.url}));}
 /** This phase has no live allowance. Fail before any transport can run. */
 assertLiveAllowed(sessionId:string):never{this.session(sessionId);throw Error('Cached-only manual workflow: zero live requests authorized. Reuse the existing globally reserved research transport after separate authorization; this journal cannot raise budgets.');}
 ingest(sessionId:string,taskId:string,input:{url:string;observedAt:string;evidenceRef:string;body:string;format:'arcgis'|'html'|'pdf-text';context?:Record<string,any>}){
  return this.tx(()=>{
   const s=this.session(sessionId),task=this.task(taskId);if(!s.states.includes(task.state)||!['source','document'].includes(task.kind))throw Error('Task is outside this session or is not a source/document');
   const observed=Date.parse(input.observedAt);if(!Number.isFinite(observed)||observed>this.now())throw Error('Use the actual cached retrieval timestamp, never a future/new verification time');
   if(Buffer.byteLength(input.body)>2_000_000||input.evidenceRef.length>4096)throw Error('Cached evidence envelope exceeded');
   const source:Source=task.data.source||this.task(task.data.parent).data.source;
   const u=new URL(input.url),origin=new URL(source.url);if(u.protocol!=='https:'||u.origin!==origin.origin||u.username||u.password)throw Error('Evidence must remain in the registered source origin');
   if(input.format==='arcgis'&&(u.pathname!==origin.pathname+'/query'&&u.pathname!==origin.pathname))throw Error('Wrong government layer; do not mix identities');
   if(input.format!=='arcgis'&&u.href!==task.url)throw Error('Cached document/index URL does not match its queue task');
   const bodyHash=hash(input.body),digest=hash([bodyHash,source.config,'manual-parser-v2']),old:any=this.db.prepare('SELECT * FROM snapshots WHERE task_id=? AND url=?').get(taskId,input.url);
   if(old&&observed<old.observed)throw Error('Older cached evidence cannot overwrite a newer checkpoint');
   if(old?.hash===digest){const prior=JSON.parse(old.result);this.db.prepare('UPDATE snapshots SET observed=? WHERE task_id=? AND url=?').run(observed,taskId,input.url);this.db.prepare('UPDATE tasks SET status=?,cursor=?,updated=? WHERE id=?').run(prior.unresolved?'awaiting_review':prior.more?'pending':'done',JSON.stringify(prior.cursor||{}),this.now(),taskId);const counted=this.db.prepare("SELECT 1 FROM events WHERE session_id=? AND task_id=? AND kind='source_checked' AND json_extract(data,'$.cacheHash')=?").get(sessionId,taskId,digest);if(!counted)this.event(sessionId,taskId,'source_unchanged',{records:prior.records,cacheHash:digest,bodyHash,evidenceRef:input.evidenceRef,observation:'cached_replay_not_live_verification'});return{...prior,unchanged:prior.records,changed:0,cachedResponse:true};}
   const used=(this.db.prepare("SELECT coalesce(sum(json_extract(data,'$.records')),0) n FROM events WHERE session_id=? AND kind='source_checked'").get(sessionId) as any).n;
   const result:any={records:0,changed:0,unchanged:0,documents:0,proposals:[],requiresReasoning:[],observation:'cached_evidence',more:false};
   let rows:any[]=[];
   if(input.format==='arcgis'){
    const requested=Number(u.searchParams.get('resultRecordCount')||this.limits.pageSize);if(!Number.isInteger(requested)||requested<1||requested>this.limits.pageSize)throw Error('Cached page exceeds this session batch limit');
    const page=parsePage(source,input.body,requested),raw=JSON.parse(input.body);rows=page.findings;result.more=page.more||(page.count===requested&&raw.exceededTransferLimit!==false);
    if(source.config.pagination==='oid_keyset'&&page.count&&(page.firstCursor!<=(task.cursor.offset??-1)))throw Error('Keyset response does not advance the saved cursor');
    const offset=Number(u.searchParams.get('resultOffset')||0);if(!Number.isSafeInteger(offset)||offset<0)throw Error('Invalid official page offset');
    result.cursor=source.config.pagination==='oid_keyset'?{offset:page.nextCursor??task.cursor.offset??-1}:{offset:offset+page.count};
    if(page.more&&!page.count)throw Error('Empty continuation page is not complete coverage');
   }else if(input.format==='html'){
    const links=evidenceDocuments(source,input.body).slice(0,this.limits.maxDocumentLinks);if(!links.length)throw Error('Index yielded no permitted document links; source requires repair');
    for(const link of links){this.put({id:hash(['document',source.state,source.id,link.url]),state:task.state,jurisdiction:task.jurisdiction,sourceId:source.id,kind:'document',url:link.url,priority:task.priority+5,data:{parent:taskId,title:link.title,role:link.role}},'pending');}result.documents=links.length;
   }else{
    const pdf:PDFText=JSON.parse(input.body);if(!Array.isArray(pdf.pages)||pdf.pages.length>200||pdf.pages.some(p=>typeof p.text!=='string')||pdf.pages.reduce((n,p)=>n+p.text.length,0)>1_000_000)throw Error('PDF text resource ceiling reached');
    rows=planningDocumentFindings(source,pdf,input.url,digest);if(pdf.truncated||!rows.length)result.unresolved='Truncated or no verified case extraction; manual document review required';
   }
   if(used+rows.length>this.limits.maxRecords)throw Error('Session record ceiling reached; keep this page in the resumable queue');
   const seen=new Set<string>();
   for(const f of rows){if(!f.externalId||seen.has(f.externalId))throw Error('Missing or duplicate stable official record identity');seen.add(f.externalId);
    const previous:any=this.db.prepare('SELECT * FROM fingerprints WHERE source_id=? AND external_id=?').get(source.id,f.externalId),semantic=findingFingerprint(f);
    if(previous&&observed<previous.observed)throw Error('Historical page cannot regress the source record fingerprint');
    result.records++;if(previous?.semantic_hash===semantic){this.db.prepare('UPDATE fingerprints SET observed=? WHERE source_id=? AND external_id=?').run(observed,source.id,f.externalId);result.unchanged++;continue;}result.changed++;
    const id=hash(['record',source.id,f.externalId,semantic]),context=input.context?.[f.externalId];
    this.put({id,state:task.state,jurisdiction:task.jurisdiction,sourceId:source.id,kind:'changed_record',url:f.url,priority:task.priority+taskPriority({changed:true,status:f.status,approvalAt:f.sourceDates?.applicationApprovalAt,outstanding:true},this.now()),data:{externalId:f.externalId,semanticHash:semantic,evidenceRef:input.evidenceRef,sourceURL:f.url,contextRef:context?.project?.id||null,newToJournal:!previous}},'pending');
    this.db.prepare('INSERT INTO fingerprints VALUES(?,?,?,?) ON CONFLICT(source_id,external_id) DO UPDATE SET semantic_hash=excluded.semantic_hash,observed=excluded.observed').run(source.id,f.externalId,semantic,observed);
    result.requiresReasoning.push({taskId:id,finding:f,context:context||null,reason:previous?'Meaningful source fields changed':'First observation; reconcile with Supabase before treating as new development'});
   }
   this.db.prepare('INSERT INTO snapshots VALUES(?,?,?,?,?) ON CONFLICT(task_id,url) DO UPDATE SET hash=excluded.hash,observed=excluded.observed,result=excluded.result').run(taskId,input.url,digest,observed,JSON.stringify({records:result.records,more:result.more,cursor:result.cursor||{},unresolved:result.unresolved||null}));
   this.db.prepare('UPDATE tasks SET status=?,cursor=?,updated=? WHERE id=?').run(result.unresolved?'awaiting_review':result.more?'pending':'done',JSON.stringify(result.cursor||{}),this.now(),taskId);
   const {requiresReasoning,proposals,...compact}=result;this.event(sessionId,taskId,'source_checked',{...compact,evidenceRef:input.evidenceRef,cacheHash:digest,bodyHash,cachedBytes:Buffer.byteLength(input.body),sourcePermission:'Cached evidence only; no current robots/access permission assertion'});return result;
  });
 }
 checkpoint(sessionId:string,taskId:string,input:{status:'pending'|'awaiting_review'|'blocked'|'done';note:string;proposalRef?:string;outcome?:string;matched?:boolean}){
  return this.tx(()=>{const s=this.session(sessionId),t=this.task(taskId);if(!s.states.includes(t.state)||!input.note||input.note.length>2000||!['pending','awaiting_review','blocked','done'].includes(input.status))throw Error('Invalid bounded task decision');
   if(!['matched','addition_proposed','update_proposed','unchanged','unresolved',undefined].includes(input.outcome))throw Error('Publication is not a manual journal outcome');
   if(/_proposed$/.test(input.outcome||'')&&!input.proposalRef)throw Error('Proposed changes require an exact private preview reference');
   this.db.prepare('UPDATE tasks SET status=?,updated=?,data=? WHERE id=?').run(input.status,this.now(),JSON.stringify({...t.data,note:input.note,proposalRef:input.proposalRef||t.data.proposalRef}),taskId);
   this.event(sessionId,taskId,'decision',input);return{saved:true};});
 }
 report(sessionId:string,finish=false){
  return this.tx(()=>{const s=this.session(sessionId,false),events=this.db.prepare('SELECT kind,task_id,data FROM events WHERE session_id=? ORDER BY created,id').all(sessionId).map((r:any)=>({kind:r.kind,taskId:r.task_id,...JSON.parse(r.data)}));
   const filter=`state IN(${s.states.map(()=>'?').join(',')}) AND status<>'done'`,totals:any=this.db.prepare(`SELECT count(*) unfinished,sum(CASE WHEN status IN('blocked','awaiting_review') THEN 1 ELSE 0 END) unresolved FROM tasks WHERE ${filter}`).get(...s.states);
   const tasks=this.db.prepare(`SELECT *,source_id AS sourceId FROM tasks WHERE ${filter} ORDER BY priority DESC,id LIMIT 100`).all(...s.states).map(unpack);
   const sum=(kind:string,key:string)=>events.filter(e=>e.kind===kind).reduce((n,e)=>n+(e[key]||0),0),decisions=events.filter(e=>e.kind==='decision');
   const result={sessionId,day:s.day,states:s.states,mode:'cached_manual_research',status:tasks.length?'partially_completed':'completed_configured_queue_only',sourcesChecked:new Set(events.filter(e=>e.kind==='source_checked'||e.kind==='source_unchanged').map(e=>e.taskId)).size,recordsCompared:sum('source_checked','records')+sum('source_unchanged','records'),changedRecords:sum('source_checked','changed'),unchangedRecords:sum('source_checked','unchanged')+sum('source_unchanged','records'),projectsMatched:decisions.filter(e=>e.matched||e.outcome==='matched').length,additionsProposed:decisions.filter(e=>e.outcome==='addition_proposed').length,updatesProposed:decisions.filter(e=>e.outcome==='update_proposed').length,updatesApplied:0,unresolved:tasks.filter(t=>['blocked','awaiting_review'].includes(t.status)).length,httpRequests:0,searchQueries:0,requestCap:s.request_cap,runtimeSeconds:Math.round(((s.finished||this.now())-s.started)/1000),publication:false,archival:false,scheduling:false,unfinished:tasks.map(({data,cursor,...t})=>({...t,cursor,note:data.note||data.reason||null,evidenceRef:data.evidenceRef||null})),warning:'Cached observations are not live verification. Missing source coverage remains incomplete; a finished command is not statewide maintenance.'};
   const details={...result,unfinishedTotal:totals.unfinished,unfinishedDetailsTruncated:totals.unfinished>tasks.length,unresolved:totals.unresolved||0,cachedBytesProcessed:sum('source_checked','cachedBytes'),limits:this.limits,proposals:decisions.filter(e=>/_proposed$/.test(e.outcome||'')).map(e=>({taskId:e.taskId,outcome:e.outcome,preview:e.proposalRef,note:e.note})),sourcePermissions:'Cached-only observations; no current source access permission was newly verified'};
   if(finish&&!s.finished)this.db.prepare('UPDATE sessions SET finished=?,status=? WHERE id=?').run(this.now(),result.status,sessionId);return details;
  });
 }
}
