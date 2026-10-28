/** Read-only source research. Produces evidence for administrator review, never publishes. */
import {caryApplicationId} from '../server/research/identifiers';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const sha=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const clean=(v:unknown)=>String(v??'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const file=process.env.DATA_FILE||'server/data/projects.json';
const db=new DatabaseSync(file+'.sqlite',{readOnly:true});
const hasOverrides=!!db.prepare("SELECT 1 FROM sqlite_master WHERE name='public_projects'").get();
const records=db.prepare('SELECT data FROM '+(hasOverrides?'public_projects':'projects')).all().map((r:any)=>JSON.parse(r.data));
const urls=new Map<string,any>();
for(const p of records)for(const source of p.sources||[]){try{const u=new URL(source.url);if(/\/(?:FeatureServer|MapServer)\/\d+\/query$/i.test(u.pathname)){const root=u.origin+u.pathname.replace(/\/query$/i,'');if(!urls.has(root))urls.set(root,{root,city:p.jurisdiction||p.city||'NC source',projects:[]});urls.get(root).projects.push({project:p,url:u});}}catch{}}
const now=new Date().toISOString(),items:any[]=[],coverage:any[]=[],seen=new Set<string>();
const status=(v:string)=>{const s=v.toLowerCase().trim();if(/^(complete|completed)$/.test(s))return 'Completed';if(/^(cancelled|canceled)$/.test(s))return 'Cancelled';if(/^(under construction|construction|almost complete)$/.test(s))return 'Under construction';if(/^(approved|trc approved|closed - approved|closed - plan approved)$/.test(s))return 'Approved';if(/^(in review|under review|awaiting applicant response|pending approval|active board application|ready for endorsement)$/.test(s))return 'In review';if(/^(proposed|under study|design|pre-design|predesign)$/.test(s))return 'Proposed';if(/^(on hold)$/.test(s))return 'On hold';return undefined;};
const first=(a:any,keys:string[])=>{for(const k of keys)if(a[k]!=null&&clean(a[k]))return clean(a[k]);return '';};
let calls=0;
async function get(url:string){for(let i=0;i<3;i++){calls++;try{const r=await fetch(url,{signal:AbortSignal.timeout(25000),headers:{'User-Agent':'BuildWatch research / administrator-reviewed catalog'}});if(!r.ok)throw Error('HTTP '+r.status);return await r.json();}catch(e){if(i===2)throw e;await new Promise(r=>setTimeout(r,1000*(i+1)));}}}
for(const source of urls.values()){
 const result:any={jurisdiction:source.city,url:source.root,existing:source.projects.length,checkedAt:now,records:0,proposals:0,status:'checked'};
 try{
  if(!/^https:/.test(source.root))throw Error('Non-HTTPS source requires review');
  // The registry is derived from already trusted catalog references; exact original record identifiers only.
  const meta:any=await get(source.root+'?f=json');if(meta.error)throw Error(meta.error.message);const oid=meta.objectIdField||meta.fields?.find((f:any)=>f.type==='esriFieldTypeOID')?.name;if(!oid)throw Error('No stable official object identifier');
  const byId=new Map<string,any[]>();for(const ref of source.projects){const where=ref.url.searchParams.get('where')||'';const m=where.match(/^\s*(?:FID|OBJECTID)\s*=\s*(\d+)\s*$/i);if(m){const list=byId.get(m[1])||[];list.push(ref.project);byId.set(m[1],list);}}
  const ids:any=await get(source.root+'/query?'+new URLSearchParams({f:'json',where:'1=1',returnIdsOnly:'true'}));if(ids.error||!Array.isArray(ids.objectIds))throw Error(ids.error?.message||'Missing ID inventory');
  if(ids.objectIds.length>20000)throw Error('Source exceeds manual batch safety limit (20,000); incremental adapter required');
  for(let offset=0;offset<ids.objectIds.length;offset+=200){
   await new Promise(r=>setTimeout(r,1000));
   const query=new URL(source.root+'/query');query.search=new URLSearchParams({f:'json',objectIds:ids.objectIds.slice(offset,offset+200).join(','),outFields:'*',outSR:'4326',returnGeometry:'true'}).toString();
   const page:any=await get(query.href);if(page.error||page.exceededTransferLimit||!Array.isArray(page.features))throw Error(page.error?.message||'Incomplete source page');
   if(page.features.length!==ids.objectIds.slice(offset,offset+200).length)throw Error('Source changed or omitted requested records; retry research');
   for(const f of page.features){result.records++;const a=f.attributes,id=String(a[oid]),matches=byId.get(id)||[];
    const raw=first(a,source.city==='Fayetteville'?['projphase','projstatus','status']:['Status_1','RecordStatus','Status','status']);
    const proposed=status(raw),name=first(a,['Name','name','ProjectNam','NAME','Development','projname','development_name','ProjectName'])||'Official record '+id;
    const evidenceURL=new URL(source.root+'/query');evidenceURL.search=new URLSearchParams({where:oid+'='+id,outFields:'*',outSR:'4326',f:'json'}).toString();
    const evidence={url:evidenceURL.href,checkedAt:now,externalId:id,attributes:a,geometry:f.geometry?.x!==undefined?f.geometry:{type:f.geometry?.rings?'polygon':'polyline',note:'Full geometry available from official evidence URL'},sourceStatus:raw};
    for(const p of matches){seen.add(p.id);if(p.archived||['Completed','Cancelled'].includes(p.status))continue;if(proposed&&proposed!==p.status){items.push({id:sha([source.root,id,p.id,proposed,a]),kind:'status',projectId:p.id,projectName:p.name,jurisdiction:source.city,before:{status:p.status,revision:p.revision||1},patch:{status:proposed,sourceStatus:raw},reason:'Exact official source record identifier; explicit source status. Administrator must verify this is the development rather than an application stage.',evidence});result.proposals++;}else if(raw&&raw!==p.sourceStatus&&!proposed){items.push({id:sha([source.root,id,p.id,raw]),kind:'uncertain',projectId:p.id,projectName:p.name,jurisdiction:source.city,before:{status:p.status,revision:p.revision||1},reason:'Source status cannot safely be mapped to whole-development status: '+raw+'. Preserve current status.',evidence});result.proposals++;}}
    if(!matches.length){items.push({id:sha([source.root,id,a]),kind:'discovery',projectName:name,jurisdiction:source.city,reason:'Not matched by exact source ID in this catalog. May be old, completed, supporting-only, or a duplicate in another source; not approved for publication.',evidence});result.proposals++;}
   }
  }
  result.matched=byId.size;
 }catch(e){result.status='error';result.error=String(e);}
 coverage.push(result);console.log(JSON.stringify(result));
}
// Cary has a separate official open-data API and stable application numbers.
try{
 const root='https://data.townofcary.org/api/explore/v2.1/catalog/datasets/developments/records';let offset=0,total=Infinity,n=0;
 while(offset<total&&offset<1000){const page:any=await get(root+'?'+new URLSearchParams({limit:'100',offset:String(offset),order_by:'applicationdate DESC',select:'applicationnumber,applicationname,applicationdate,actiondate,status,summarydescription,reviewtype,usecategory,usetype,geo_point_2d'}));if(!Array.isArray(page.results))throw Error('Invalid Cary API response');total=page.total_count;n+=page.results.length;
 for(const a of page.results){const refs=records.filter((p:any)=>p.jurisdiction==='Cary'&&(p.sources||[]).some((s:any)=>caryApplicationId(s.url)===String(a.applicationnumber)));const evidence={url:root+'?'+new URLSearchParams({where:'applicationnumber="'+String(a.applicationnumber).replaceAll('"','')+'"'}),checkedAt:now,externalId:a.applicationnumber,sourceStatus:a.status,attributes:a};const proposed=status(clean(a.status));
 if(!refs.length)items.push({id:sha(['Cary',a.applicationnumber,a]),kind:'discovery',projectName:a.applicationname||a.applicationnumber,jurisdiction:'Cary',reason:'Exact application identifier absent from existing Cary source links; requires classification and cross-source duplicate review.',evidence});
 for(const p of refs){seen.add(p.id);if(proposed&&proposed!==p.status&&!p.archived&&!['Completed','Cancelled'].includes(p.status))items.push({id:sha(['Cary',p.id,a]),kind:'status',projectId:p.id,projectName:p.name,jurisdiction:'Cary',before:{status:p.status,revision:p.revision||1},patch:{status:proposed,sourceStatus:a.status},reason:'Exact official application identifier; administrator review required.',evidence});}
 }offset+=page.results.length;if(!page.results.length)break;await new Promise(r=>setTimeout(r,1000));}
 coverage.push({jurisdiction:'Cary',url:root,status:offset>=total?'checked':'partial',records:n,checkedAt:now});
}catch(e){coverage.push({jurisdiction:'Cary',status:'error',error:String(e),checkedAt:now});}
const report={version:1,id:sha([now,items.map(i=>i.id)]),created:now,mode:'manual-codex-review',published:0,totalCatalog:records.length,matchedProjects:seen.size,httpRequests:calls,coverage,items,limitations:['Only listed structured official sources were checked. This is not statewide completeness.','Unmatched source records are discoveries in this check, not proof they were newly proposed.','Environmental permits and unstructured curated sources require separate source-specific research.','No missing, withdrawn, expired, or closed record is treated as completed or cancelled.']};
mkdirSync('reports/manual-research',{recursive:true});const output=resolve('reports/manual-research',now.replace(/[:.]/g,'-')+'.json');writeFileSync(output,JSON.stringify(report,null,2));db.close();console.log(JSON.stringify({output,proposals:items.length,byKind:items.reduce((n:any,i:any)=>(n[i.kind]=(n[i.kind]||0)+1,n),{}),matchedProjects:seen.size,httpRequests:calls}));
