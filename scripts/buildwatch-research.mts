/** Small manual coordinator. No credentials, network, scheduling, Supabase writes or publication. */
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {ManualResearchSession} from '../server/research/manual-session';import {localDay} from '../server/maintenance/policy';import {shadowSources} from '../server/maintenance/shadow';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8')),rotation=read('config/maintenance/manual-rotation.json');
const [command,...args]=process.argv.slice(2),option=(key:string)=>{const i=args.indexOf('--'+key);return i<0?undefined:args[i+1];};
const allowed=['start','next','ingest','checkpoint','attach-receipt','report','request'];if(!allowed.includes(command))throw Error('Use start, next, ingest, checkpoint, attach-receipt, report, or request. No apply/publish command exists.');
if(rotation.scheduleEnabled||rotation.publicationEnabled||rotation.archivalEnabled||rotation.defaults.newLiveResearchRequests!==0)throw Error('Manual coordinator requires cached-only research and publication/scheduling gates off');
const dbPath=process.env.BW_MANUAL_JOURNAL||resolve('../../work/buildwatch-manual-research/checkpoints.sqlite'),journal=new ManualResearchSession(dbPath,rotation.sessionLimits);
try{
 const sid=option('session');let result:any;
 if(command==='start'){
  const day=option('day');if(!day||!rotation.weekdays[day])throw Error('Choose Monday, Tuesday, Wednesday, Thursday or Friday');
  const definitions=new Map<string,any>(),mappings=read('config/maintenance/nc-mappings.json'),inventory=read('config/maintenance/nc-statewide-inventory.json');
  for(const r of read('config/maintenance/nc-registry.json'))definitions.set(r.url,{id:r.sourceId,state:'NC',jurisdiction:r.jurisdiction,url:r.url,adapter:/FeatureServer|MapServer/.test(r.url)?'arcgis':'document',authority:'official',autopublish:false,enabled:false,config:mappings.find((m:any)=>m.sourceId===r.sourceId)?.config||{}});
  for(const p of read('config/maintenance/nc-five-jurisdiction-plan.json'))definitions.set(p.source.url,p.source);
  for(const p of read('config/maintenance/nc-platform-plan.json').profiles)definitions.set(p.source.url,p.source);
  for(const p of read('config/maintenance/nc-platform-plan.json').indexes)definitions.set(p.source.url,p.source);
  for(const s of shadowSources)if(!definitions.has(s.url))definitions.set(s.url,s);
  const seeds=[...definitions.values()].map(source=>{const record=inventory.sources.find((r:any)=>r.url===source.url),entity=[...inventory.counties,...inventory.municipalities].find((e:any)=>record?.entityIds.includes(e.id));return{source:{...source,enabled:false,autopublish:false},population:entity?.population,coverage:record?.evidenceLevel};});
  let id=option('id')||localDay()+'-'+day;const prior:any=journal.db.prepare('SELECT started,finished FROM sessions WHERE id=?').get(id);
  if(!option('id')&&prior&&(prior.finished||Date.now()-prior.started>=rotation.sessionLimits.maxSeconds*1000))id+='-'+randomUUID().slice(0,8);
  result=journal.start(day,rotation.weekdays[day],seeds,id);result={...result,journal:dbPath,queued:result.finished?[]:journal.next(result.id).map(t=>({id:t.id,jurisdiction:t.jurisdiction,kind:t.kind,url:t.url})),note:'Resumes persistent work; zero new live requests authorized.'};
 }else{
  if(!sid)throw Error('--session is required');
  if(command==='next')result=journal.next(sid,Number(option('limit')||5));
  if(command==='request')journal.assertLiveAllowed(sid);
  if(command==='attach-receipt'){const file=option('file');if(!file)throw Error('Use --file with the verified existing worker receipt');result=journal.attachWorkerReceipt(sid,read(file),resolve(file));}
  if(command==='ingest'){
   const task=option('task'),file=option('file');if(!task||!file)throw Error('Use --task and --file with a cached evidence packet');
   const packet=read(file);if(!['arcgis','html','pdf-text'].includes(packet.format)||!packet.url||!packet.observedAt||typeof packet.body!=='string')throw Error('Packet needs format, url, observedAt, body and optional contexts; do not fabricate an observation time');
   const value=journal.ingest(sid,task,{...packet,evidenceRef:resolve(file)}),dir='reports/manual-research/'+encodeURIComponent(sid);mkdirSync(dir,{recursive:true});const artifact=dir+'/'+task+'-changed.json';writeFileSync(artifact,JSON.stringify(value,null,2));
   const {requiresReasoning,...summary}=value;result={...summary,reasoningItems:requiresReasoning?.length||0,changedEvidence:resolve(artifact),note:'Only new/changed fields need detailed reasoning. First observation does not establish a new development.'};
  }
  if(command==='checkpoint'){
   const task=option('task'),file=option('file');if(!task||!file)throw Error('Use --task and --file with a private decision JSON');result=journal.checkpoint(sid,task,read(file));
  }
  if(command==='report'){
   result=journal.report(sid,args.includes('--finish'));const dir='reports/manual-research/'+encodeURIComponent(sid);mkdirSync(dir,{recursive:true});
   writeFileSync(dir+'/report.json',JSON.stringify(result,null,2));
   const cloud=existsSync('reports/maintenance/CLOUD-DATA-PATH.json')?read('reports/maintenance/CLOUD-DATA-PATH.json'):null;
   const text=`# BuildWatch ${result.day} research\n\n${result.status}. ${result.mode}; no production changes.\n\n| Measure | Count |\n| --- | ---: |\n| Sources checked | ${result.sourcesChecked} |\n| Records compared | ${result.recordsCompared} |\n| Changed | ${result.changedRecords} |\n| Unchanged | ${result.unchangedRecords} |\n| Projects matched | ${result.projectsMatched} |\n| Additions proposed | ${result.additionsProposed} |\n| Updates proposed | ${result.updatesProposed} |\n| Updates applied | 0 |\n| Unresolved | ${result.unresolved} |\n| HTTP / search requests | ${result.httpRequests} / ${result.searchQueries} |\n| Runtime seconds | ${result.runtimeSeconds} |\n\nUnfinished tasks: ${result.unfinishedTotal}. See report.json for checkpoints.\n\n${result.warning}\n\nClient check: ${cloud?.checkedAt||'not available'} cached verification; website Supabase reads ${cloud?.publicCatalogResponded?'passed':'unverified'}, native binary tested ${cloud?.nativeBinaryTested===true?'yes':'no'}. No fresh network verification performed by this report.\n`;
   writeFileSync(dir+'/report.md',text+'\nChecked sources:\n\n'+result.checkedSources.map((s:{jurisdiction:string;sourceURL:string})=>'- ['+s.jurisdiction+'](<'+s.sourceURL+'>) — cached evidence').join('\n')+'\n');result={...result,unfinished:result.unfinished.slice(0,5),unfinishedTotal:result.unfinishedTotal,report:resolve(dir+'/report.md')};
  }
 }
 console.log(JSON.stringify(result,null,2));
}finally{journal.close();}
