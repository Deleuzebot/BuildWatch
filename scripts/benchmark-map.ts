import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,writeFileSync,statSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
import {initializeMapIndex} from '../server/map/index';
import {MapQueries,MAX_NODES} from '../server/map/queries';
const max=Number(process.argv.find(v=>v.startsWith('--max='))?.split('=')[1]||100000);
if(![100000,500000,1000000].includes(max))throw new Error('Choose --max=100000, 500000 or 1000000');
const file=resolve(process.argv.find(v=>v.startsWith('--db='))?.slice(5)||'../../work/map-audit/synthetic-map.sqlite');
mkdirSync(dirname(file),{recursive:true});
const db=new DatabaseSync(file);db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA cache_size=-64000; CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,data TEXT NOT NULL,revision INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);');
const existing=(db.prepare('SELECT COUNT(*) AS n FROM projects').get() as any).n;
const reuse=process.argv.includes('--reuse');
if(existing&&!reuse)throw new Error('Use a new synthetic database; existing data will never be deleted.');
initializeMapIndex(db);const q=new MapQueries(db),insert=db.prepare('INSERT INTO projects VALUES(?,?,1)');
const measure=(fn:()=>unknown)=>{const start=performance.now();const value=fn();return{ms:performance.now()-start,value};};
const sizes=[100000,500000,1000000].filter(n=>n<=max);const results:any[]=[];
let inserted=existing;const started=performance.now();
for(const size of sizes){
  if(reuse&&size!==existing)continue;
  const buildStart=performance.now();
  while(inserted<size){db.exec('BEGIN');try{for(let i=0;i<10000&&inserted<size;i++,inserted++){
    const n=inserted;const longitude=-124+((n*7919)%1000000)/1000000*57,latitude=25+((n*104729)%1000000)/1000000*24;
    const p={id:'sim-'+n,name:'Benchmark Housing '+n,address:`${n} Simulated Road`,neighborhood:'Synthetic data',city:'Simulation',county:'Simulation',state:['NC','SC','VA','TN'][n%4],status:['Proposed','In review','Approved','Under construction'][n%4],category:'Housing',latitude,longitude,homes:0,description:'Synthetic benchmark fixture; never published.',developer:'Simulation',completion:'Unknown',meetings:[]};
    insert.run(p.id,JSON.stringify(p));
  }db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
  if(inserted%50000===0)console.log(JSON.stringify({phase:'insert',records:inserted,elapsedSeconds:Math.round((performance.now()-started)/1000)}));}
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  const cases=[{name:'national',filters:{},bounds:{west:-125,south:24,east:-66,north:50},zoom:4},{name:'regional',filters:{},bounds:{west:-85,south:33,east:-75,north:37},zoom:7},{name:'local',filters:{},bounds:{west:-79.1,south:35.8,east:-78.8,north:36.1},zoom:14},{name:'national-status',filters:{status:'Approved'},bounds:{west:-125,south:24,east:-66,north:50},zoom:4},{name:'national-search',filters:{search:'Housing 99999'},bounds:{west:-125,south:24,east:-66,north:50},zoom:4}];
  const queries=cases.map(c=>{const samples=[];let value:any;for(let k=0;k<3;k++){const m=measure(()=>q.map(c.filters,c.bounds,c.zoom));samples.push(m.ms);value=m.value;}assert.equal(value.nodes.reduce((s:any,n:any)=>s+n.count,0),value.total);assert.ok(value.nodes.length<=MAX_NODES);if(c.name==='national')assert.equal(value.total,size);if(c.name==='national-status')assert.equal(value.total,size/4);return{name:c.name,ms:samples,nodes:value.nodes.length,represented:value.total,jsonBytes:Buffer.byteLength(JSON.stringify(value))};});
  const browse=measure(()=>q.browse({}));assert.equal((browse.value as any).total,size);assert.equal((browse.value as any).items.length,50);
  const catalog=measure(()=>q.catalog());
  results.push({records:size,incrementalStageSeconds:(performance.now()-buildStart)/1000,dbBytes:statSync(file).size,queries,browseMs:browse.ms,browseBytes:Buffer.byteLength(JSON.stringify(browse.value)),catalogMs:catalog.ms});
  writeFileSync(resolve(dirname(file),reuse?'synthetic-retest.json':'synthetic-results.json'),JSON.stringify({environment:{node:process.version,platform:process.platform,architecture:process.arch},method:'Single-process local SQLite, uniform synthetic CONUS points, three sequential map-query samples (not multi-user or handset tests). Stage duration includes inserts, index maintenance, checkpoint and measurements; database size is recorded separately.',results},null,2));console.log(JSON.stringify({phase:'measured',records:size,queries,browseMs:browse.ms}));
}
db.close();
