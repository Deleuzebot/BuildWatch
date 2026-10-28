import {createHash,randomUUID} from 'node:crypto';
import type {Store} from '../accounts/store';
import {researchSchema} from './service';
import {exactDate} from '../archives/policy';
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const webLimits={dailyQueries:24,monthlyQueries:200,queriesPerArea:2,resultsPerQuery:8,cacheDays:7,paidProviderEnabled:false};
type Finding={url:string;title:string;sourceType:'official'|'local-news'|'developer'|'industry'|'neighborhood'|'other';publishedAt:string|null;verifiedAt:string;projectName:string;area:string;summary:string;claim:'reported'|'proposed'|'approved'|'under-construction'|'completed'|'cancelled'|'delayed'|'meeting';projectId?:string;externalId?:string};
export class WebResearch{
 constructor(public store:Store){researchSchema(store);store.db.exec(`
 CREATE TABLE IF NOT EXISTS web_search_queries(id TEXT PRIMARY KEY,area TEXT NOT NULL,query TEXT NOT NULL,state TEXT NOT NULL,created INTEGER NOT NULL,completed INTEGER,result_count INTEGER NOT NULL DEFAULT 0);
 CREATE INDEX IF NOT EXISTS web_query_created ON web_search_queries(created);
 CREATE INDEX IF NOT EXISTS web_query_cache ON web_search_queries(query,created);
 CREATE TABLE IF NOT EXISTS web_research_sources(id TEXT PRIMARY KEY,query_id TEXT NOT NULL REFERENCES web_search_queries(id),url TEXT NOT NULL,published TEXT,verified TEXT NOT NULL,data TEXT NOT NULL);
 `);}
 summary(now=Date.now()){
  const day=new Date(now).toISOString().slice(0,10),month=day.slice(0,7);
  const daily=this.store.one('SELECT count(*) AS n FROM web_search_queries WHERE created>=?',Date.parse(day+'T00:00:00Z')).n;
  const monthly=this.store.one('SELECT count(*) AS n FROM web_search_queries WHERE created>=?',Date.parse(month+'-01T00:00:00Z')).n;
  return{limits:webLimits,dailyUsed:daily,monthlyUsed:monthly,remaining:Math.max(0,Math.min(webLimits.dailyQueries-daily,webLimits.monthlyQueries-monthly)),mode:'Codex-assisted research; no paid search API or scheduled execution',recent:this.store.all('SELECT id,area,query,state,created,completed,result_count FROM web_search_queries ORDER BY created DESC LIMIT 20')};
 }
 /** Reserve before searching. Failed searches still consume budget; no retry loop. */
 plan(areas:string[],now=Date.now(),topics=['housing apartments subdivision mixed-use development construction','development groundbreaking delayed cancelled public hearing']){
  if(!Array.isArray(areas)||areas.length>76||areas.some(a=>typeof a!=='string'||a.length>100||!a.trim()))throw Error('Provide up to 76 municipality/county names.');
  if(!Array.isArray(topics)||topics.length<1||topics.length>webLimits.queriesPerArea||topics.some(t=>typeof t!=='string'||!t.trim()||t.length>160))throw Error('Use one or two focused development-search topics per area.');
  return this.store.tx(()=>{const queries:any[]=[],cached:any[]=[];let remaining=this.summary(now).remaining;
   for(const area of [...new Set(areas.map(a=>a.trim()))])for(const terms of topics){
    const query=`"${area}" "North Carolina" ${terms}`;
    const hit=this.store.one('SELECT * FROM web_search_queries WHERE query=? AND created>? ORDER BY created DESC LIMIT 1',query,now-webLimits.cacheDays*86400000);
    if(hit){cached.push({area,query,id:hit.id,state:hit.state});continue;}
    if(!remaining)continue;const id=randomUUID();this.store.run('INSERT INTO web_search_queries(id,area,query,state,created) VALUES(?,?,?,\'reserved\',?)',id,area,query,now);queries.push({id,area,query});remaining--;
   }
   return{queries,cached,remaining,note:'Run only the reserved queries through Codex search, then import findings. Search snippets are leads; read the source before recording a finding. No automatic publication.'};
  });
 }
 record(queryId:string,findings:Finding[],now=Date.now()){
  const query=this.store.one('SELECT * FROM web_search_queries WHERE id=?',queryId);if(!query)throw Error('Reserve the query before importing results.');
  if(!Array.isArray(findings)||findings.length>webLimits.resultsPerQuery)throw Error('Query result limit exceeded.');
  for(const f of findings){
   let url:URL;try{url=new URL(f.url);}catch{throw Error('Invalid source URL.');}
   if(url.protocol!=='https:'||url.username||url.password||f.url.length>2048||!['official','local-news','developer','industry','neighborhood','other'].includes(f.sourceType)||!['reported','proposed','approved','under-construction','completed','cancelled','delayed','meeting'].includes(f.claim)||f.area!==query.area||![f.title,f.projectName,f.summary].every(v=>typeof v==='string'&&v.trim()&&v.length<=1000)||exactDate(f.verifiedAt)===undefined||Date.parse(f.verifiedAt)>now||f.publishedAt!==null&&(exactDate(f.publishedAt)===undefined||Date.parse(f.publishedAt)>now))throw Error('Include a verified source, accurate dates (null if publication date unknown), a brief evidence summary and a supported reported milestone.');
  }
  return this.store.tx(()=>{if(query.state!=='reserved')return{added:0,alreadyRecorded:true};let added=0;
   const batchId='web-search-'+queryId;this.store.run('INSERT INTO research_batches VALUES(?,?,?)',batchId,new Date(now).toISOString(),JSON.stringify({mode:'supplementary-web',area:query.area,queries:1,autoPublished:0,limits:webLimits}));
   for(const f of findings){
    const u=new URL(f.url);u.hash='';for(const key of [...u.searchParams.keys()])if(/^utm_|^fbclid$|^gclid$/.test(key))u.searchParams.delete(key);
    const sourceId=digest([u.href,f.projectName.toLowerCase().trim(),f.claim,f.publishedAt,f.summary]);
    if(this.store.one('SELECT 1 FROM web_research_sources WHERE id=?',sourceId))continue;
    let matches:any[]=[];const words=f.projectName.match(/[\p{L}\p{N}]{3,}/gu)?.slice(0,5)||[];
    if(words.length){const q=words.map(w=>'"'+w.replaceAll('"','""')+'"').join(' AND ');matches=this.store.all('SELECT m.id,json_extract(p.data,\'$.name\') AS name FROM map_search JOIN active_map_index m ON m.rid=map_search.rowid JOIN public_projects p ON p.id=m.id WHERE map_search MATCH ? LIMIT 10',q);}
    const target=f.projectId?this.store.project(f.projectId):undefined;if(f.projectId&&!target)throw Error('Referenced project does not exist.');
    const data={id:sourceId,kind:'uncertain',projectId:target?.id,projectName:f.projectName,jurisdiction:f.area,reason:`${f.sourceType} source reports ${f.claim}. Administrator verification required; no lifecycle change or expiration reset.`,reportedMilestone:f.claim,possibleMatches:matches,evidence:{url:u.href,title:f.title,sourceType:f.sourceType,publishedAt:f.publishedAt,checkedAt:f.verifiedAt,summary:f.summary,externalId:f.externalId||sourceId},lifecycleEffect:'none',queryId};
    this.store.run('INSERT INTO web_research_sources VALUES(?,?,?,?,?,?)',sourceId,queryId,u.href,f.publishedAt,f.verifiedAt,JSON.stringify(f));
    this.store.run('INSERT OR IGNORE INTO research_proposals(id,batch_id,kind,project_id,data,updated) VALUES(?,?,\'uncertain\',?,?,?)',sourceId,batchId,target?.id||null,JSON.stringify(data),now);added++;
   }
   this.store.run('UPDATE web_search_queries SET state=\'completed\',completed=?,result_count=? WHERE id=?',now,findings.length,queryId);return{added,alreadyRecorded:false};
  });
 }
}
