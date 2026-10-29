/** Official-source inventory only. Never publishes or changes a project. */
import {readFileSync,writeFileSync} from 'node:fs';
import {loadPostgresEnvironment,PostgresDatabase} from '../server/postgres/connection';
import {SourceHTTP} from '../server/maintenance/http';
import {Budget} from '../server/maintenance/policy';
import {robotsAllows} from '../server/maintenance/worker';
loadPostgresEnvironment();const db=new PostgresDatabase();
const inventory=JSON.parse(readFileSync('config/maintenance/nc-jurisdictions.json','utf8'));
const counties=JSON.parse(readFileSync('../../work/nc-county-official-domains.json','utf8'));
const cities:Record<string,string>={Apex:'https://www.apexnc.org/',Asheville:'https://www.ashevillenc.gov/',Burlington:'https://www.burlingtonnc.gov/',Cary:'https://www.carync.gov/','Chapel Hill':'https://www.chapelhillnc.gov/',Charlotte:'https://www.charlottenc.gov/',Concord:'https://concordnc.gov/',Durham:'https://www.durhamnc.gov/',Fayetteville:'https://www.fayettevillenc.gov/',Gastonia:'https://www.gastonianc.gov/',Greensboro:'https://www.greensboro-nc.gov/',Greenville:'https://www.greenvillenc.gov/','High Point':'https://www.highpointnc.gov/','Holly Springs':'https://www.hollyspringsnc.gov/',Huntersville:'https://www.huntersville.org/',Jacksonville:'https://www.jacksonvillenc.gov/',Kannapolis:'https://www.kannapolisnc.gov/',Mooresville:'https://www.mooresvillenc.gov/',Raleigh:'https://raleighnc.gov/','Rocky Mount':'https://rockymountnc.gov/','Wake Forest':'https://www.wakeforestnc.gov/',Wilmington:'https://www.wilmingtonnc.gov/',Wilson:'https://www.wilsonnc.org/','Winston-Salem':'https://www.cityofws.org/'};
const budget=new Budget(1800,160,1000);budget.maxBytes=100_000_000;
try{
 const reservation=await db.query("UPDATE buildwatch.maintenance_monthly SET requests_reserved=requests_reserved+160 WHERE month=date_trunc('month',now())::date AND requests_reserved+160<=(SELECT monthly_requests FROM buildwatch.maintenance_control WHERE id=1) AND NOT(SELECT schedule_enabled OR writes_enabled FROM buildwatch.maintenance_control WHERE id=1) RETURNING month");if(!reservation.rowCount)throw Error('Existing monthly budget or dry-run safety gate prevents source inventory');
 const sources=await db.rows('SELECT id,jurisdiction,url,adapter,config FROM buildwatch.maintenance_sources');
 const entries:any[]=[];
 for(const entity of inventory.entities){
  const homepage=entity.type==='county'?counties.find((c:any)=>c.name===entity.name)?.url:cities[entity.name];
  const entry:any={...entity,officialDirectory:entity.type==='county'?'https://www.nc.gov/your-government/county-government-websites':undefined,homepage,checkedAt:new Date().toISOString(),sources:[],status:'needs_source_verification'};
  // Name matching is only an inventory association, never proof of county-wide coverage.
  entry.existingAdapters=sources.filter(s=>entity.type==='county'?s.jurisdiction.toLowerCase().startsWith(entity.name.toLowerCase()+' county'):s.jurisdiction.toLowerCase()===entity.name.toLowerCase()||s.jurisdiction.toLowerCase().startsWith(entity.name.toLowerCase()+' ')).map(s=>({id:s.id,url:s.url,scope:s.jurisdiction,role:s.config.sourceRole||'development_review'}));
  try{
   if(!homepage)throw Error('Official homepage not identified');const origin=new URL(homepage).origin,http=new SourceHTTP(budget,origin);let policy='';
   try{policy=(await http.get(origin+'/robots.txt')).body;}catch(e:any){if(!/HTTP (404|410)$/.test(e.message))throw e;}
   http.accessPolicy=u=>robotsAllows(policy,u.pathname+u.search);const delays=[...policy.matchAll(/^crawl-delay:\s*(\d+(?:\.\d+)?)/gim)].map(v=>Number(v[1]));http.minimumInterval=Math.max(1,...delays)*1000;if(http.minimumInterval>60000)throw Error('Crawl delay requires separate review');
   const html=(await http.get(homepage)).body;
   const found=new Map<string,any>();
   for(const match of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
    const title=match[2].replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();let url:URL;try{url=new URL(match[1].replace(/&amp;/g,'&'),homepage);}catch{continue;}
    if(url.protocol!=='https:'||url.origin!==origin||!/(planning|zoning|development|agenda|public hearing|current projects)/i.test(title+' '+url.pathname)||/economic development|workforce development|job|career/i.test(title))continue;
    url.hash='';found.set(url.href,{title,url:url.href,verification:'Linked from retrieved official homepage; target contents and adapter not yet validated',retrievalAllowed:robotsAllows(policy,url.pathname+url.search)});
   }
   entry.sources=[...found.values()].slice(0,20);entry.status=entry.sources.length?'official_links_found_adapter_pending':'official_homepage_only';
  }catch(e:any){entry.error=e.message;}
  entries.push(entry);writeFileSync('config/maintenance/nc-jurisdiction-sources.json',JSON.stringify({checkedAt:new Date().toISOString(),dryRun:true,requestReservation:160,requests:budget.requests,coverageWarning:'Official links are research leads, not working ingestion or proof of complete jurisdiction coverage.',entries},null,2)+'\n');console.log(JSON.stringify({name:entity.name,type:entity.type,links:entry.sources.length,status:entry.status,error:entry.error}));
 }
}finally{await db.close();}
