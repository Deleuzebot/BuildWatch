import {roadDecision} from '../roads/policy';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,mkdirSync,chmodSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Store} from '../accounts/store';
import {policyValues} from '../archives/policy';
import {researchSchema} from '../research/service';
import {validateProject} from '../../src/lib/validate';
import type {Project} from '../../src/data/projects';

const actor='operator:nc-coverage-audit';
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const normalize=(v:string)=>v.toLowerCase().replace(/[^a-z0-9]/g,'');
type Item={project:Project;approval:any;schedules:any[];evidence:any};
/** Additions only: never updates, deletes, merges, or reclassifies existing projects. */
export function importVerifiedBatch(store:Store,batch:any,apply=false){
 if(batch?.version!==1||!/^nc-coverage-[a-z0-9-]+$/.test(batch.id)||!Array.isArray(batch.items)||batch.items.length>10000||!Number.isFinite(Date.parse(batch.created)))throw Error('Invalid verified research batch.');
 const existing=store.all('SELECT p.id,p.data,a.reason FROM project_profiles p LEFT JOIN archived_projects a ON a.project_id=p.id').map(row=>({id:row.id,p:JSON.parse(row.data) as Project,reason:row.reason}));
 type Existing=typeof existing[number];
 const keys=new Map<string,Existing[]>(),names=new Map<string,Existing[]>();
 const index=(row:Existing)=>{for(const key of row.p.permitNumbers||[])if(key.length>=4)keys.set(key,[...(keys.get(key)||[]),row]);const n=normalize(row.p.name);names.set(n,[...(names.get(n)||[]),row]);};
 existing.forEach(index);
 const ids=new Set<string>();const additions:Item[]=[];const review=[...(batch.review||[])];let alreadyPresent=0,tombstoned=0;
 for(const item of batch.items as Item[]){
  const p=item.project,error=validateProject(p);
  if(error||!p.id||ids.has(p.id)||p.state!=='NC'||p.evidenceType!=='municipal'||!p.sources?.length||!p.county||p.latitude<33.8||p.latitude>36.7||p.longitude< -84.4||p.longitude> -75.3||!['Proposed','In review','Approved','Under construction'].includes(p.status)||!item.evidence?.externalId||item.evidence.url!==p.sources[0].url)throw Error(p.id+': '+(error||'Unsupported or inconsistent evidence.'));
  ids.add(p.id);
  const values=policyValues(item.approval,item.schedules||[]);
  if(p.status==='Approved'&&!item.approval)throw Error(p.id+': Documented approval date required.');
  if(p.status==='Approved'&&values.dueAt!==null&&values.dueAt<=Date.now()&&!p.archived)throw Error(p.id+': Expired approval cannot be public.');
  if(store.one('SELECT 1 FROM projects WHERE id=?',p.id)){alreadyPresent++;continue;}
  if(store.one('SELECT 1 FROM deleted_project_ids WHERE project_id=?',p.id)){tombstoned++;continue;}
  const matches=new Map<string,Existing>();
  for(const k of p.permitNumbers||[])for(const row of keys.get(k)||[])matches.set(row.id,row);
  for(const row of names.get(normalize(p.name))||[])if(Math.hypot((row.p.longitude-p.longitude)*.81,row.p.latitude-p.latitude)<.012)matches.set(row.id,row);
  const supportingOnly=matches.size>0&&[...matches.values()].every(row=>row.reason==='supporting_permit_only'&&row.p.evidenceType==='permit'&&row.p.jurisdiction==='NC DEQ construction stormwater'&&!['Completed','Cancelled'].includes(row.p.status)&&store.canonicalId(row.id)===row.id);
  if(matches.size){for(const match of matches.keys()){
   const prior=store.one("SELECT 1 FROM sqlite_master WHERE type='table' AND name='research_proposals'")?store.one("SELECT id FROM research_proposals WHERE project_id=? AND json_extract(data,'$.candidate.id')=? AND status IN ('pending','deferred') LIMIT 1",match,p.id):undefined;
   review.push({id:prior?.id||hash([batch.id,p.id,match]),reuse:!!prior,kind:'uncertain',projectId:match,projectName:p.name,jurisdiction:p.jurisdiction,reason:supportingOnly?'Verified development '+p.id+' has independent municipal evidence and is preserved independently, subject to public-map eligibility. Archived stormwater-only record '+match+' may be supporting evidence. Review the relationship manually; no merge or link was performed.':'Possible existing or archived development '+match+'. Original project and archive decisions preserved; review before publication.',candidate:p,evidence:item.evidence});
  }if(!supportingOnly)continue;}
  additions.push(item);
  index({id:p.id,p,reason:p.archived?'approved_expired':null});
 }
 const result={batch:batch.id,added:additions.length,publicAdditions:additions.filter(x=>!x.project.archived&&roadDecision(x.project).qualifies).length,archivedAdditions:additions.filter(x=>x.project.archived||!roadDecision(x.project).qualifies).length,alreadyPresent,tombstoned,review:review.length,applied:apply};
 if(!apply)return result;
 researchSchema(store);
 store.db.exec('CREATE TABLE IF NOT EXISTS verified_import_batches(id TEXT PRIMARY KEY,digest TEXT NOT NULL,created INTEGER NOT NULL,summary TEXT NOT NULL); CREATE TABLE IF NOT EXISTS verified_import_evidence(project_id TEXT PRIMARY KEY REFERENCES projects(id),batch_id TEXT NOT NULL REFERENCES verified_import_batches(id),evidence TEXT NOT NULL);');
 const digest=hash(batch),prior=store.one('SELECT digest FROM verified_import_batches WHERE id=?',batch.id);
 if(prior){if(prior.digest!==digest)throw Error('Batch changed after application. Use a new batch ID.');return{...result,added:0,publicAdditions:0,archivedAdditions:0};}
 return store.tx(()=>{
  store.run('INSERT INTO verified_import_batches VALUES(?,?,?,?)',batch.id,digest,Date.now(),JSON.stringify(result));
  for(const item of additions){
   const p={...item.project,revision:1},v=policyValues(item.approval,item.schedules||[]),now=Date.now();
   store.run('INSERT INTO projects VALUES(?,?,1)',p.id,JSON.stringify(p));
   store.run('INSERT INTO history VALUES(?,?,?,?,?,?)',randomUUID(),p.id,actor,null,JSON.stringify(p),now);
   store.run('INSERT INTO verified_import_evidence VALUES(?,?,?)',p.id,batch.id,JSON.stringify(item.evidence));
   if(item.approval)store.run('INSERT INTO approval_policy VALUES(?,?,?,?,?,?,?,?,?,?,?)',p.id,item.approval.date,v.approvalAt,JSON.stringify(item.approval),JSON.stringify(item.schedules||[]),v.exceptionUntil,v.expiresAt,v.dueAt,v.reviewReason,actor,now);
   if(p.archived){store.run('INSERT INTO archived_projects VALUES(?,?,?,?,?,?,?)',p.id,'approved_expired',now,actor,batch.id,item.approval?.date||null,v.expiresAt);store.run('INSERT INTO archive_events VALUES(?,?,?,?,?,?)',randomUUID(),p.id,'archived',actor,now,JSON.stringify({reason:'approved_expired',batch:batch.id,evidence:item.approval}));}
  }
  store.run('INSERT OR IGNORE INTO research_batches VALUES(?,?,?)',batch.id,batch.created,JSON.stringify(result));
  for(const r of review){if(!/^[a-f0-9]{64}$/.test(r.id)||new URL(r.evidence.url).protocol!=='https:')throw Error('Invalid review evidence.');
   if(r.reuse){store.run("UPDATE research_proposals SET data=?,revision=revision+1,updated=? WHERE id=? AND status IN ('pending','deferred')",JSON.stringify(r),Date.now(),r.id);store.run('INSERT INTO research_audit VALUES(?,?,?,?,?,?)',randomUUID(),r.id,actor,'evidence_refreshed','Independent municipal record evaluated; existing review decision remains pending/deferred. No merge or supporting link performed.',Date.now());}
   else store.run('INSERT OR IGNORE INTO research_proposals(id,batch_id,kind,project_id,data,updated) VALUES(?,?,?,?,?,?)',r.id,batch.id,'uncertain',r.projectId||null,JSON.stringify(r),Date.now());}
  return result;
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [batchPath,databasePath,flag]=process.argv.slice(2);if(!batchPath||!databasePath)throw Error('Usage: verified-batch.ts batch.json database.sqlite [--apply]');
 const batch=JSON.parse(readFileSync(resolve(batchPath),'utf8')),store=new Store(resolve(databasePath));
 try{const preview=importVerifiedBatch(store,batch);let backup:string|undefined;
  if(flag==='--apply'&&preview.added){const folder=resolve(dirname(databasePath),'backups');mkdirSync(folder,{recursive:true,mode:0o700});backup=resolve(folder,'before-'+batch.id+'-'+Date.now()+'.sqlite');store.db.exec("VACUUM INTO '"+backup.replaceAll("'","''")+"'");chmodSync(backup,0o600);}
  console.log(JSON.stringify({...importVerifiedBatch(store,batch,flag==='--apply'),backup},null,2));
 }finally{store.close();}
}
