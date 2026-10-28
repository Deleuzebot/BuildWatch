import{createHash,randomUUID}from'node:crypto';
import type{Store}from'../accounts/store';
import type{Project,Meeting}from'../../src/data/projects';
import{validateProject}from'../../src/lib/validate';
const fail=(status:number,message:string):never=>{throw Object.assign(new Error(message),{status});};
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const mergeFields=['name','address','description','status','category','developer','homes','completion','neighborhood','city','county','state','location','evidenceType','sourceAsOf','sourceStatus','sourceStatusDate','verificationNote','reviewedAt'] as const;
type Side='a'|'b';
export type PreviewInput={action:'merge'|'supporting';canonical:Side;choices?:Record<string,Side>;revision:number;note?:string};
const cleanNote=(v:unknown)=>typeof v==='string'&&v.length<=4000?v:fail(400,'Use a note of at most 4,000 characters.');
function facts(project:any){if(!project)return null;const{revision,reviewedAt,...data}=project;return data;}
function combineMeetings(a:Project,b:Project){
 const events=new Map<string,any>();
 for(const project of [a,b])for(const meeting of project.meetings){
  const key=hash([meeting.title,Date.parse(meeting.startsAt),meeting.venue,meeting.agenda]);
  const refs=((meeting as any).originalMeetings||[{projectId:project.id,meetingId:meeting.id}]).map((r:any)=>({...r,startsAt:r.startsAt||meeting.startsAt}));
  const prior=events.get(key);
  if(prior){prior.originalMeetings=[...new Map([...prior.originalMeetings,...refs].map((r:any)=>[r.projectId+'|'+r.meetingId,r])).values()];}
  else events.set(key,{...meeting,id:'event-'+key,originalMeetings:refs});
 }
 return [...events.values()] as Meeting[];
}
export class DuplicateService{
 constructor(public store:Store){}
 private candidate(id:string){return this.store.one('SELECT * FROM duplicate_candidates WHERE id=?',id)||fail(404,'Candidate pair not found.');}
 private audit(candidateId:string,action:string,actor:string,note:string,before:any=null,after:any=null,undoes:string|null=null,id=randomUUID()){
  this.store.run('INSERT INTO duplicate_decisions VALUES(?,?,?,?,?,?,?,?,?)',id,candidateId,action,actor,Date.now(),note,before?JSON.stringify(before):null,after?JSON.stringify(after):null,undoes);return id;
 }
 register(a:string,b:string,reasons:string[],metadata:any,actor:string){
  if(a===b||!this.store.originalProject(a)||!this.store.originalProject(b))return fail(400,'Choose two different existing record IDs.');
  if(!Array.isArray(reasons)||!reasons.length||reasons.length>20||reasons.some(r=>typeof r!=='string'||!r.trim()||r.length>2000))return fail(400,'Provide factual matching reasons.');
  [a,b]=[a,b].sort();reasons=[...new Set(reasons)].sort();
  const evidence=hash([a,b,facts(this.store.originalProject(a)),facts(this.store.originalProject(b)),reasons,metadata]);
  const id=hash([a,b]),old=this.store.one('SELECT * FROM duplicate_candidates WHERE id=?',id),now=Date.now();
  if(old?.evidence_hash===evidence)return{...old,unchanged:true};
  if(old){this.store.run("UPDATE duplicate_candidates SET reasons=?,metadata=?,evidence_hash=?,status='pending',revision=revision+1,updated_at=? WHERE id=?",JSON.stringify(reasons),JSON.stringify(metadata||{}),evidence,now,id);this.audit(id,'new_evidence',actor,'New substantive record/matching evidence reopens review.');}
  else{this.store.run('INSERT INTO duplicate_candidates VALUES(?,?,?,?,?,?,?,?,?,?,?)',id,a,b,'unassigned',JSON.stringify(reasons),JSON.stringify(metadata||{}),evidence,'pending',1,now,now);this.audit(id,'detected',actor,'Candidate only. No project relationship or publication change.');}
  return this.candidate(id);
 }
 regroup(){
  const edges=this.store.all('SELECT a_id,b_id FROM duplicate_candidates'),parent=new Map<string,string>();
  const root=(x:string):string=>{if(!parent.has(x))parent.set(x,x);let r=x;while(parent.get(r)!==r)r=parent.get(r)!;while(parent.get(x)!==x){const next=parent.get(x)!;parent.set(x,r);x=next;}return r;};
  for(const edge of edges){const a=root(edge.a_id),b=root(edge.b_id);if(a!==b)parent.set(a<b?b:a,a<b?a:b);}
  this.store.run('DELETE FROM duplicate_group_members');
  for(const id of parent.keys())this.store.run('INSERT INTO duplicate_group_members VALUES(?,?)',hash(root(id)),id);
  for(const edge of edges)this.store.run('UPDATE duplicate_candidates SET group_id=? WHERE a_id=? AND b_id=?',hash(root(edge.a_id)),edge.a_id,edge.b_id);
 }
 stats():{groups:number;pairs:number;pending:number;merged:number;linked:number;distinct:number;skipped:number;classificationCandidates:number}{return{groups:Number(this.store.one('SELECT count(DISTINCT group_id) AS n FROM duplicate_candidates').n),pairs:Number(this.store.one('SELECT count(*) AS n FROM duplicate_candidates').n),...Object.fromEntries(['pending','merged','linked','distinct','skipped'].map(status=>[status,Number(this.store.one('SELECT count(*) AS n FROM duplicate_candidates WHERE status=?',status).n)])) as Record<'pending'|'merged'|'linked'|'distinct'|'skipped',number>,classificationCandidates:Number(this.store.one('SELECT count(*) AS n FROM classification_review_candidates').n)};}
 list(params:URLSearchParams){
  const page=this.page(params),status=params.get('status')||'pending',search=(params.get('search')||'').trim().toLowerCase(),county=(params.get('county')||'').trim().toLowerCase(),kind=params.get('kind')||'all',sort=params.get('sort')||'recent';
  if(!['all','pending','merged','linked','distinct','skipped'].includes(status)||!['all','permit','municipal','curated'].includes(kind)||!['recent','name','pairs'].includes(sort)||search.length>200||county.length>100)return fail(400,'Invalid queue filters.');
  const clauses=['1=1'],args:any[]=[];
  if(status!=='all'){clauses.push('c.status=?');args.push(status);}
  if(search||county||kind!=='all'){
   const sub=['gm.group_id=c.group_id'];
   if(search){sub.push("instr(lower(json_extract(p.data,'$.name')||' '||json_extract(p.data,'$.address')||' '||p.id),?)>0");args.push(search);}
   if(county){sub.push("lower(coalesce(json_extract(p.data,'$.county'),''))=?");args.push(county);}
   if(kind!=='all'){sub.push("coalesce(json_extract(p.data,'$.evidenceType'),'curated')=?");args.push(kind);}
   clauses.push('EXISTS(SELECT 1 FROM duplicate_group_members gm JOIN review_records p ON p.id=gm.project_id WHERE '+sub.join(' AND ')+')');
  }
  const where=clauses.join(' AND '),order={recent:'updated DESC,id',name:'name COLLATE NOCASE,id',pairs:'pairs DESC,id'}[sort];
  const total=this.store.one(`SELECT count(DISTINCT c.group_id) AS n FROM duplicate_candidates c WHERE ${where}`,...args).n;
  const items=this.store.all(`SELECT c.group_id AS id,count(*) AS pairs,max(c.updated_at) AS updated,(SELECT min(json_extract(p.data,'$.name')) FROM duplicate_group_members gm JOIN review_records p ON p.id=gm.project_id WHERE gm.group_id=c.group_id) AS name,(SELECT count(*) FROM duplicate_group_members gm WHERE gm.group_id=c.group_id) AS records FROM duplicate_candidates c WHERE ${where} GROUP BY c.group_id ORDER BY ${order} LIMIT 20 OFFSET ?`,...args,page*20);
  return{items,total,page,hasMore:(page+1)*20<total,stats:this.stats()};
 }
 private page(params:URLSearchParams){const n=Number(params.get('page')||0);if(!Number.isSafeInteger(n)||n<0||n>100000)return fail(400,'Invalid page.');return n;}
 group(id:string,params:URLSearchParams){const page=this.page(params);const total=this.store.one('SELECT count(*) AS n FROM duplicate_candidates WHERE group_id=?',id).n;if(!total)return fail(404,'Group not found.');return{total,page,hasMore:(page+1)*20<total,items:this.store.all(`SELECT c.*,json_extract(a.data,'$.name') AS aName,json_extract(b.data,'$.name') AS bName FROM duplicate_candidates c JOIN review_records a ON a.id=c.a_id JOIN review_records b ON b.id=c.b_id WHERE c.group_id=? ORDER BY CASE c.status WHEN 'pending' THEN 0 WHEN 'skipped' THEN 1 ELSE 2 END,c.id LIMIT 20 OFFSET ?`,id,page*20),records:this.store.all(`SELECT p.id,json_extract(p.data,'$.name') AS name FROM duplicate_group_members gm JOIN review_records p ON p.id=gm.project_id WHERE gm.group_id=? ORDER BY p.id LIMIT 100`,id),recordCount:this.store.one('SELECT count(*) AS n FROM duplicate_group_members WHERE group_id=?',id).n};}
 detail(id:string){const c=this.candidate(id);return{...c,reasons:JSON.parse(c.reasons),metadata:JSON.parse(c.metadata),a:this.store.originalProject(c.a_id),b:this.store.originalProject(c.b_id),aEffective:this.store.project(c.a_id)||this.store.projectProfile(c.a_id),bEffective:this.store.project(c.b_id)||this.store.projectProfile(c.b_id),history:this.store.all('SELECT id,action,actor,created,note,undoes_id FROM duplicate_decisions WHERE candidate_id=? ORDER BY created DESC,rowid DESC LIMIT 100',id),fields:mergeFields,confidence:null};}
 private capture(ids:string[]){return{ids:[...ids].sort(),originals:ids.map(id=>({id,hash:hash(this.store.originalProject(id))})).sort((a,b)=>a.id.localeCompare(b.id)),relations:ids.flatMap(id=>{const r=this.store.one('SELECT * FROM project_relationships WHERE source_id=?',id);return r?[r]:[];}).sort((a,b)=>a.source_id.localeCompare(b.source_id)),profiles:ids.map(id=>({id,data:this.store.projectProfile(id)})).sort((a,b)=>a.id.localeCompare(b.id))};}
 private semantic(state:any){return{ids:state.ids,originals:state.originals,relations:state.relations.map((r:any)=>({source_id:r.source_id,target_id:r.target_id,kind:r.kind})),profiles:state.profiles.map((r:any)=>({id:r.id,data:(({revision,...value}:any)=>value)(r.data)}))};}
 private compute(id:string,input:PreviewInput){
  const c=this.candidate(id);if(c.revision!==input.revision)return fail(409,'The review changed. Refresh this pair.');
  if(!['merge','supporting'].includes(input.action)||!['a','b'].includes(input.canonical))return fail(400,'Choose an action and canonical project.');
  const choices=input.choices||{};if(Object.entries(choices).some(([k,v])=>!(mergeFields as readonly string[]).includes(k)||!['a','b'].includes(v)))return fail(400,'Choose field values from record A or B.');
  if(input.action==='supporting'&&Object.keys(choices).length)return fail(400,'Supporting links retain the primary project fields.');
  const a=this.store.project(c.a_id)||this.store.projectProfile(c.a_id),b=this.store.project(c.b_id)||this.store.projectProfile(c.b_id);
  if(!a||!b)return fail(409,'Both original records must be available.');
  if(a.id===b.id)return fail(409,'These records already share a canonical project. Confirm that review explicitly, or undo an earlier relationship.');
  const primary=input.canonical==='a'?a:b,secondary=input.canonical==='a'?b:a;
  if(!this.store.project(primary.id))return fail(409,'Choose an existing project as canonical. A staged source cannot publish itself through a merge.');
  if(primary.archived&&this.store.publicEligible(secondary.id))return fail(409,'Choose the publicly visible development as canonical. An archived source must not hide it.');
  const ids=[...new Set([...this.store.componentIds(a.id),...this.store.componentIds(b.id)])];
  if(ids.length>250)return fail(409,'This component exceeds the 250-record safety limit. Use an operator-reviewed migration.');
  const before=this.capture(ids),result:any={...primary};
  if(input.action==='merge')for(const field of mergeFields){const from=(choices[field]||input.canonical)==='a'?a:b;if(field==='location'){result.latitude=from.latitude;result.longitude=from.longitude;}else if((from as any)[field]===undefined)delete result[field];else result[field]=(from as any)[field];}
  result.id=primary.id;result.revision=Math.max(...before.profiles.map(p=>p.data.revision||0))+1;
  result.sources=[...new Map([...primary.sources||[],...secondary.sources||[]].map(s=>[s.url+'|'+s.title,s])).values()];
  result.permitNumbers=[...new Set([...primary.permitNumbers||[],...secondary.permitNumbers||[]])];
  result.meetings=combineMeetings(primary,secondary);result.relatedRecordIds=ids.filter(x=>x!==primary.id).sort();
  const issue=validateProject({...result,meetings:[],sources:[],permitNumbers:[]});if(issue)return fail(400,issue);
  const signatures=hash([c.revision,c.evidence_hash,before,input]);
  return{candidateId:id,input,signature:signatures,before,result,primary:primary.id,secondary:secondary.id,conflicts:mergeFields.filter(f=>JSON.stringify(f==='location'?[a.latitude,a.longitude]:(a as any)[f])!==JSON.stringify(f==='location'?[b.latitude,b.longitude]:(b as any)[f])),affectedRecords:before.ids.map(id=>({id,name:this.store.originalProject(id)!.name})),preservation:{sourceLinks:result.sources.length,permitIdentifiers:result.permitNumbers.length,meetings:result.meetings.length,followingRows:this.store.one(`SELECT count(*) AS n FROM follows WHERE project_id IN (${ids.map(()=>'?').join(',')})`,...ids).n,historyRows:this.store.one(`SELECT count(*) AS n FROM history WHERE project_id IN (${ids.map(()=>'?').join(',')})`,...ids).n,notice:'Original project rows, source identifiers, URLs, timestamps, follows, history, notifications and submissions are retained. Old record references resolve to the canonical project. Undo restores prior relationships and profile values; later edits must be resolved first.'}};
 }
 preview(id:string,input:PreviewInput,actor:string){cleanNote(input.note||'');const p=this.compute(id,input),token=randomUUID();this.store.run('DELETE FROM duplicate_previews WHERE expires<?',Date.now());this.store.run('INSERT INTO duplicate_previews VALUES(?,?,?,?,?,?,0)',token,actor,id,JSON.stringify(input),p.signature,Date.now()+600000);const{before,signature,...result}=p;return{...result,token,expires:Date.now()+600000};}
 commit(token:string,actor:string){return this.store.tx(()=>{
  const saved=this.store.one('SELECT * FROM duplicate_previews WHERE token=?',token);
  if(!saved||saved.actor!==actor||saved.used||saved.expires<Date.now())return fail(409,'Preview expired, already used, or belongs to another administrator. Generate a fresh preview.');
  const p=this.compute(saved.candidate_id,JSON.parse(saved.input));if(p.signature!==saved.signature)return fail(409,'A project or relationship changed. Generate a fresh preview.');
  const decision=randomUUID(),now=Date.now();this.audit(p.candidateId,p.input.action,actor,cleanNote(p.input.note||''),p.before,null,null,decision);
  // Relationships are flat. Repoint every existing member of the source component, preserving its role.
  this.store.run('UPDATE project_relationships SET target_id=?,decision_id=?,created=? WHERE target_id=?',p.primary,decision,now,p.secondary);
  this.store.run('INSERT INTO project_relationships VALUES(?,?,?,?,?)',p.secondary,p.primary,p.input.action==='merge'?'merge':'supporting',decision,now);
  this.store.run('INSERT INTO project_overrides VALUES(?,?,?) ON CONFLICT(project_id) DO UPDATE SET data=excluded.data,revision=excluded.revision',p.primary,JSON.stringify(p.result),p.result.revision);
  this.store.run("UPDATE duplicate_candidates SET status=?,revision=revision+1,updated_at=? WHERE id=?",p.input.action==='merge'?'merged':'linked',now,p.candidateId);
  const after=this.capture(p.before.ids);
  this.store.run('UPDATE duplicate_decisions SET after_state=? WHERE id=?',JSON.stringify(after),decision);
  this.store.run('UPDATE duplicate_previews SET used=1 WHERE token=?',token);
  return{decisionId:decision,canonicalId:p.primary,project:p.result};
 });}
 decide(id:string,action:string,revision:number,note:string,actor:string){return this.store.tx(()=>{
  const c=this.candidate(id);if(c.revision!==revision)return fail(409,'Review changed. Refresh.');
  if(!['distinct','skipped','reopen','acknowledge'].includes(action))return fail(400,'Choose a valid review action.');
  const same=this.store.canonicalId(c.a_id)===this.store.canonicalId(c.b_id);
  if(action==='distinct'&&same)return fail(409,'These records already share a canonical project. Undo that relationship first.');
  if(action==='acknowledge'&&!same)return fail(409,'The records do not share a canonical project.');
  if(['merged','linked'].includes(c.status)&&action==='skipped')return fail(409,'This relationship has already been reviewed.');
  const supporting=this.store.one("SELECT 1 FROM project_relationships WHERE source_id IN (?,?) AND kind='supporting'",c.a_id,c.b_id);
  const status=action==='reopen'?'pending':action==='acknowledge'?(supporting?'linked':'merged'):action;
  this.audit(id,action,actor,cleanNote(note),{status:c.status,revision:c.revision},{status});
  this.store.run('UPDATE duplicate_candidates SET status=?,revision=revision+1,updated_at=? WHERE id=?',status,Date.now(),id);return this.detail(id);
 });}
 undo(decisionId:string,actor:string,note:string){return this.store.tx(()=>{
  const event=this.store.one('SELECT * FROM duplicate_decisions WHERE id=?',decisionId);
  if(!event||!['merge','supporting'].includes(event.action)||!event.after_state)return fail(400,'Choose an applied merge or supporting link.');
  if(this.store.one('SELECT 1 FROM duplicate_decisions WHERE undoes_id=?',decisionId))return fail(409,'This decision was already undone.');
  const before=JSON.parse(event.before_state),after=JSON.parse(event.after_state);
  const currentIds=[...new Set<string>((after.ids as string[]).flatMap((id:string)=>this.store.componentIds(id)))].sort();
  const current=this.capture(currentIds);
  if(hash(this.semantic(current))!==hash(this.semantic(after)))return fail(409,'Later edits or relationships depend on this decision. Undo those later changes first; nothing has been overwritten.');
  const undoId=this.audit(event.candidate_id,'undo',actor,cleanNote(note),current,before,decisionId),next=Math.max(...current.profiles.map((p:any)=>p.data.revision||0))+1;
  for(const id of after.ids)this.store.run('DELETE FROM project_relationships WHERE source_id=?',id);
  for(const r of before.relations)this.store.run('INSERT INTO project_relationships VALUES(?,?,?,?,?)',r.source_id,r.target_id,r.kind,r.decision_id,r.created);
  // Restore values with fresh revisions so pre-merge editor sessions cannot overwrite an undo.
  for(const p of before.profiles){if(!this.store.one('SELECT 1 FROM projects WHERE id=?',p.id))continue;const data={...p.data,revision:next};this.store.run('INSERT INTO project_overrides VALUES(?,?,?) ON CONFLICT(project_id) DO UPDATE SET data=excluded.data,revision=excluded.revision',p.id,JSON.stringify(data),next);}
  this.store.run("UPDATE duplicate_candidates SET status='pending',revision=revision+1,updated_at=? WHERE id=?",Date.now(),event.candidate_id);
  for(const c of this.store.all("SELECT * FROM duplicate_candidates WHERE status IN ('merged','linked')")){
   const latest=this.store.one('SELECT action FROM duplicate_decisions WHERE candidate_id=? ORDER BY created DESC,rowid DESC LIMIT 1',c.id);
   if(latest?.action==='acknowledge'&&this.store.canonicalId(c.a_id)!==this.store.canonicalId(c.b_id)){this.audit(c.id,'dependency_undone',actor,'Earlier relationship was undone; review reopened.');this.store.run("UPDATE duplicate_candidates SET status='pending',revision=revision+1,updated_at=? WHERE id=?",Date.now(),c.id);}
  }
  return{undoId,restoredRecords:before.ids};
 });}
 classifications(params:URLSearchParams){const page=this.page(params);return{total:this.stats().classificationCandidates,page,hasMore:(page+1)*50<this.stats().classificationCandidates,items:this.store.all(`SELECT c.*,json_extract(p.data,'$.name') AS name FROM classification_review_candidates c JOIN review_records p ON p.id=c.project_id ORDER BY c.project_id LIMIT 50 OFFSET ?`,page*50)};}
}
