/** Read-only dry run. Never imports Store, alters schema, publishes, merges or schedules work. */
import{DatabaseSync}from'node:sqlite';
import{readFileSync,writeFileSync,mkdirSync}from'node:fs';
import{createHash}from'node:crypto';
import{resolve,dirname}from'node:path';
import{fileURLToPath}from'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(root,'reports/community-refocus');mkdirSync(output,{recursive:true});
const decisions=JSON.parse(readFileSync(resolve(output,'reviewed-examples.json')));
const file=resolve(root,process.argv.find(s=>s.startsWith('--db='))?.slice(5)||'server/data/projects.json.sqlite');
const db=new DatabaseSync(file,{readOnly:true});db.exec('PRAGMA query_only=ON; BEGIN');
const raw=db.prepare('SELECT id,data,revision FROM projects ORDER BY rowid').all();
const projects=raw.map(r=>({...JSON.parse(r.data),_hash:createHash('sha256').update(r.data).digest('hex'),_revision:r.revision}));
const fingerprint=createHash('sha256').update(JSON.stringify(raw)).digest('hex');
const byId=new Map(projects.map(p=>[p.id,p]));
for(const set of Object.values(decisions))for(const id of Object.keys(set))if(!byId.has(id))throw Error('Unknown reviewed example: '+id);
const normalize=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const publicCategory=p=>{
 if(p.id==='nc-ch-zeta-tau-alpha')return'Residential';
 if(['Housing','Affordable housing','Senior housing'].includes(p.category))return'Residential';
 if(p.category==='Mixed use')return'Mixed-Use';
 if(['Commercial','Hospitality'].includes(p.category))return'Commercial';
 if(p.category==='Industrial')return'Industrial';
 if(p.category==='Education')return'Public Infrastructure';
 if(p.id==='nc-ra-smoky-hollow-park'||p.id==='nc-du-merrick-moore-park'||p.id==='nc-du-carolina-collegiate-phase-ii')return'Parks & Environment';
 if(p.id==='nc-ch-transit-millhouse'||p.id==='nc-ra-city-gateway-parking')return'Transportation';
 return'Public Infrastructure';
};
const manifest=projects.map(p=>{
 let classification,category=null,reason;
 if(p.archived){classification='Unchanged archived record';reason='Already archived before this dry run; preserve without republishing.';}
 else if(decisions.curatedReview[p.id]){classification='Requires review';reason=decisions.curatedReview[p.id];}
 else if(decisions.minorExamples[p.id]){classification='Minor or unrelated activity';reason=decisions.minorExamples[p.id];}
 else if(decisions.supportingExamples[p.id]){classification='Supporting administrative record';reason=decisions.supportingExamples[p.id];}
 else if(p.evidenceType==='permit'){classification='Supporting administrative record';reason='Environmental compliance evidence; independent project scope/status is unverified. Retain for parent matching or verified parent creation; do not discard the potential underlying development.';}
 else if(decisions.publicAdditions[p.id]){classification='Public-facing development';[category,reason]=decisions.publicAdditions[p.id];}
 else if(!p.evidenceType){classification='Public-facing development';category=publicCategory(p);reason='Previously researched scope describes a building, subdivision, redevelopment or substantial community facility; retain existing source/status qualifications. This is not a new live status verification.';}
 else{classification='Requires review';reason='Municipal application retained, but its independent physical scope, freshness, phase relationship or classification needs an individual review. Municipal origin alone does not authorize publication.';}
 return{id:p.id,name:p.name,county:p.county||'',city:p.city||'',jurisdiction:p.jurisdiction||'',classification,category,proposedVisible:classification==='Public-facing development',reason,originalCategory:p.category,originalStatus:p.status,revision:p._revision,originalSHA256:p._hash,sourceURLs:(p.sources||[]).map(s=>s.url),sourceAsOf:p.sourceAsOf||'',reviewedAt:p.reviewedAt||'',needsParentReview:classification==='Supporting administrative record'};
});
const publicProjects=projects.filter(p=>!p.archived);
const pairs=new Map();
function pair(a,b,reason){if(a.id===b.id)return;const ids=[a.id,b.id].sort(),key=ids.join('|');let value=pairs.get(key);if(!value){value={a:ids[0],b:ids[1],reasons:[]};pairs.set(key,value);}if(!value.reasons.includes(reason))value.reasons.push(reason);}
function groups(keyOf,reason){const groups=new Map();for(const p of publicProjects){const key=keyOf(p);if(!key)continue;const old=groups.get(key)||[];for(const other of old)pair(other,p,reason);old.push(p);groups.set(key,old);}}
groups(p=>{const name=normalize(p.name);return name.length>=10&&p.county?normalize(p.county)+'|'+name:null;},'Same normalized project name and county; identity/phase/location must be confirmed.');
const certificates=new Map();for(const p of publicProjects)for(const cert of p.permitNumbers||[]){for(const old of certificates.get(cert)||[])pair(old,p,'Same retained permit identifier '+cert+'; verify issuing authority and scope.');certificates.set(cert,[...(certificates.get(cert)||[]),p]);}
const distance=(a,b)=>{const r=Math.PI/180;const dlat=(b.latitude-a.latitude)*r,dlon=(b.longitude-a.longitude)*r;const v=Math.sin(dlat/2)**2+Math.cos(a.latitude*r)*Math.cos(b.latitude*r)*Math.sin(dlon/2)**2;return 6371000*2*Math.asin(Math.min(1,Math.sqrt(v)));};
const grid=new Map();let closePairs=0;
for(const p of publicProjects){const x=Math.floor(p.longitude/.005),y=Math.floor(p.latitude/.005);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const other of grid.get((x+dx)+','+(y+dy))||[]){if(p.county!==other.county||distance(p,other)>250)continue;closePairs++;
 const a=normalize(p.name),b=normalize(other.name);const tokens=new Set(a.split(' '));const otherTokens=new Set(b.split(' '));const common=[...tokens].filter(t=>otherTokens.has(t)).length;const score=common/(tokens.size+otherTokens.size-common);
 if(a.length>=10&&b.length>=10&&score>=.6)pair(p,other,'Name-token similarity >=0.60 plus same county and <=250m; candidate only.');
 const address=normalize(p.address);if(/^\d+\s/.test(address)&&address===normalize(other.address))pair(p,other,'Exact normalized numeric address plus same county and <=250m; shared sites can contain separate developments.');
 const developer=normalize(p.developer);if(developer.length>=8&&!/not confirmed|not provided|unknown/.test(developer)&&developer===normalize(other.developer)&&common>=1)pair(p,other,'Same named developer/holder plus a name token, same county and <=250m; not proof of one parent.');
 }const key=x+','+y;grid.set(key,[...(grid.get(key)||[]),p]);}
const duplicateCandidates=[...pairs.values()].map(pair=>{const a=byId.get(pair.a),b=byId.get(pair.b);return{...pair,aName:a.name,bName:b.name,aEvidence:a.evidenceType||'curated',bEvidence:b.evidenceType||'curated',county:a.county||'',distanceMetres:Math.round(distance(a,b)),aSources:(a.sources||[]).map(s=>s.url),bSources:(b.sources||[]).map(s=>s.url),action:'Review only — no merge or source link applied'};}).sort((a,b)=>(a.aEvidence===a.bEvidence)-(b.aEvidence===b.bEvidence)||a.distanceMetres-b.distanceMetres||a.a.localeCompare(b.a));
const counts={};for(const row of manifest)counts[row.classification]=(counts[row.classification]||0)+1;
const categories={};for(const row of manifest.filter(r=>r.proposedVisible))categories[row.category]=(categories[row.category]||0)+1;
const samples=[];
for(const jurisdiction of [...new Set(publicProjects.filter(p=>p.evidenceType==='municipal').map(p=>p.jurisdiction))].sort()){
 const list=publicProjects.filter(p=>p.jurisdiction===jurisdiction);samples.push(...[list[0],list[Math.floor(list.length/2)],list.at(-1)]);
}
samples.push(...Object.keys(decisions.publicAdditions).map(id=>byId.get(id)),...Object.keys(decisions.minorExamples).map(id=>byId.get(id)),...Object.keys(decisions.supportingExamples).map(id=>byId.get(id)),...Object.keys(decisions.curatedReview).map(id=>byId.get(id)));
for(const county of [...new Set(publicProjects.filter(p=>p.evidenceType==='permit').map(p=>p.county))].sort())samples.push(publicProjects.find(p=>p.evidenceType==='permit'&&p.county===county));
const uniqueSamples=[...new Map(samples.map(p=>[p.id,p])).values()].map(({_hash,_revision,...p})=>({...p,proposal:manifest.find(r=>r.id===p.id)}));
const summary={asOf:new Date().toISOString(),mode:'READ-ONLY PROPOSAL — not approved or applied',stored:projects.length,currentPublic:publicProjects.length,curated:publicProjects.filter(p=>!p.evidenceType).length,municipal:publicProjects.filter(p=>p.evidenceType==='municipal').length,permitOnly:publicProjects.filter(p=>p.evidenceType==='permit').length,retainedCertificateReferences:publicProjects.reduce((n,p)=>n+(p.permitNumbers?.length||0),0),counts,proposedPublic:counts['Public-facing development']||0,categoryCounts:categories,municipalJurisdictions:new Set(publicProjects.filter(p=>p.evidenceType==='municipal').map(p=>p.jurisdiction)).size,representativeRecords:uniqueSamples.length,duplicateCandidatePairs:duplicateCandidates.length,nearbyPairsExamined:closePairs,automaticMerges:0,automaticLinks:0,originalProjectFingerprint:fingerprint};
const csvCell=v=>{let s=Array.isArray(v)?v.join(' | '):String(v??'');if(/^[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
const csv=(rows,keys)=>[keys.map(csvCell).join(','),...rows.map(r=>keys.map(k=>csvCell(r[k])).join(','))].join('\n')+'\n';
writeFileSync(resolve(output,'dry-run-manifest.csv'),csv(manifest,['id','name','classification','proposedVisible','category','reason','originalCategory','originalStatus','city','county','revision','originalSHA256','needsParentReview','sourceAsOf','reviewedAt','sourceURLs']));
writeFileSync(resolve(output,'duplicate-candidates.csv'),csv(duplicateCandidates,['a','aName','aEvidence','b','bName','bEvidence','county','distanceMetres','reasons','action','aSources','bSources']));
writeFileSync(resolve(output,'summary.json'),JSON.stringify(summary,null,2)+'\n');
writeFileSync(resolve(output,'public-candidates.json'),JSON.stringify(manifest.filter(r=>r.proposedVisible),null,2)+'\n');
writeFileSync(resolve(output,'review-samples.json'),JSON.stringify(uniqueSamples,null,2)+'\n');
writeFileSync(resolve(output,'duplicate-candidates.json'),JSON.stringify(duplicateCandidates,null,2)+'\n');
writeFileSync(resolve(output,'classification-candidates.json'),JSON.stringify(manifest.filter(r=>r.classification==='Requires review').map(r=>({id:r.id,reason:r.reason,hash:r.originalSHA256,revision:r.revision})),null,2)+'\n');
const check=createHash('sha256').update(JSON.stringify(db.prepare('SELECT id,data,revision FROM projects ORDER BY rowid').all())).digest('hex');if(check!==fingerprint)throw Error('Snapshot mismatch');
db.exec('COMMIT');db.close();console.log(JSON.stringify(summary,null,2));
