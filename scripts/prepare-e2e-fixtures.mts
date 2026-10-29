/** Export bounded public-source evidence only; never export account/project snapshots. */
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {hash} from '../server/maintenance/policy';
const dir='../../work/nc-e2e',scout=JSON.parse(readFileSync(dir+'/scout.json','utf8'));
const plan=JSON.parse(readFileSync('config/maintenance/nc-five-jurisdiction-plan.json','utf8'));
const db=JSON.parse(readFileSync(dir+'/database-snapshot.json','utf8'));
const snapshots=readdirSync(dir).filter(f=>/^[a-f0-9]{64}\.json$/.test(f)).map(f=>JSON.parse(readFileSync(dir+'/'+f,'utf8')));
const structured=scout.map((sample:any)=>{const p=plan.find((p:any)=>p.source.id===sample.id),s=p.source;
 const snapshot=snapshots.find((x:any)=>x.url.startsWith(s.url+'/query?')&&x.url.includes('returnGeometry=false'));
 if(!snapshot||hash(snapshot.body)!==snapshot.hash)throw Error('Cached source integrity check failed');
 const fields=new Set([s.config.idField,s.config.originalIdentityField,...s.config.requiredFields,...Object.values(s.config.dateFields||{}),...Object.values(s.config.factFields||{})].filter(Boolean));
 return{city:p.name,sourceId:s.id,cachedAt:snapshot.checkedAt,sourceURL:snapshot.url,sourceHash:snapshot.hash,metadata:{fields:sample.fields.map((f:any)=>({name:f.name,type:f.type,domain:f.domain}))},
  data:{features:sample.rows.map((r:any)=>({attributes:Object.fromEntries(Object.entries(r).filter(([k])=>fields.has(k)))}))}};
});
const documents=db.documents.map((d:any)=>({city:plan.find((p:any)=>p.source.id===d.source_id).name,sourceId:d.source_id,cachedAt:d.created,document:d.data.document,pages:d.data.previewPages,
 limitation:'Only the cached first 12 pages are available to this extraction pilot; whole-packet completeness is not asserted.'}));
const geometry=JSON.parse(readFileSync(dir+'/geometry.json','utf8')).rows.filter((r:any)=>r.data).map((r:any)=>{const s=plan.find((p:any)=>p.source.id===r.sourceId).source;return{...r,data:{...r.data,features:r.data.features.map((f:any)=>({geometry:f.geometry,attributes:Object.fromEntries(Object.entries(f.attributes).filter(([k])=>[s.config.idField,s.config.fields.name].includes(k)))}))}};});
mkdirSync('tests/fixtures',{recursive:true});writeFileSync('tests/fixtures/nc-e2e-evidence.json',JSON.stringify({structured,documents,geometry},null,2)+'\n');
console.log(JSON.stringify({structured:structured.map((s:any)=>({city:s.city,records:s.data.features.length})),documents:documents.map((s:any)=>({city:s.city,pages:s.pages.length}))}));
