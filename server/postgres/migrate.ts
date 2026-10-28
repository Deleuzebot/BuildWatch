import {DatabaseSync}from'node:sqlite';
import{createHash}from'node:crypto';
import{readFileSync}from'node:fs';
import{fileURLToPath}from'node:url';
const manifest=JSON.parse(readFileSync(new URL('./migration-manifest.json',import.meta.url),'utf8')) as {version:number;tables:{name:string;columns:string[];rowid:boolean}[]};
export interface SqlSession{query(sql:string,args?:any[]):Promise<{rows:any[];rowCount?:number|null}>}
const quoted=(s:string)=>'"'+s.replaceAll('"','""')+'"';
const hash=(s:string)=>createHash('sha256').update(s).digest();
const canonical=(r:any,cols:string[])=>JSON.stringify(cols.map(k=>r[k]===undefined?null:r[k]));
// Order-independent cryptographic row digest plus exact count. No private payloads in reports.
function accumulator(){let count=0;const value=Buffer.alloc(32);return{add(row:any,cols:string[]){const h=hash(canonical(row,cols));for(let i=0;i<32;i++)value[i]^=h[i];count++;},result(){return{count,digest:value.toString('hex')};}};}
function columns(t:typeof manifest.tables[number]){return [...t.columns,...(t.rowid?['rowid']:[])];}
export function snapshotInventory(db:DatabaseSync){
 const inventory:Record<string,{count:number;digest:string}>={};
 const actual=(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'map_search%' AND name NOT LIKE 'map_spatial%'").all() as any[]).map(r=>r.name).sort();
 if(JSON.stringify(actual)!==JSON.stringify(manifest.tables.map(t=>t.name).sort()))throw Error('SQLite schema differs from the migration manifest. Regenerate and review schema first.');
 for(const t of manifest.tables){
  const actualColumns=(db.prepare('PRAGMA table_info('+quoted(t.name)+')').all() as any[]).map(c=>c.name);
  if(JSON.stringify(actualColumns)!==JSON.stringify(t.columns))throw Error('Column mismatch: '+t.name);
  const a=accumulator(),cols=columns(t);
  for(const row of db.prepare('SELECT '+cols.map(quoted).join(',')+' FROM '+quoted(t.name)).iterate())a.add(row,cols);
  inventory[t.name]=a.result();
 }return inventory;
}
export async function verifyPostgres(db:SqlSession,source:DatabaseSync){
 source.function('bw_now',()=>Date.now());
 const expected=snapshotInventory(source),actual:typeof expected={},differences:string[]=[];
 for(const t of manifest.tables){const a=accumulator(),cols=columns(t);
  await db.query('DECLARE bw_verify NO SCROLL CURSOR FOR SELECT '+cols.map(quoted).join(',')+' FROM buildwatch.'+quoted(t.name));
  try{while(true){const rows=(await db.query('FETCH FORWARD 500 FROM bw_verify')).rows;if(!rows.length)break;for(const r of rows){for(const k of cols)if(typeof r[k]==='bigint')r[k]=Number(r[k]);a.add(r,cols);}}}finally{await db.query('CLOSE bw_verify');}
  actual[t.name]=a.result();if(JSON.stringify(actual[t.name])!==JSON.stringify(expected[t.name]))differences.push(t.name);
 }
 // Compare full public payloads structurally (PostgreSQL JSON formatting differs).
 const normalize=(s:string)=>{const sort=(x:any):any=>Array.isArray(x)?x.map(sort):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sort(x[k])])):x;return JSON.stringify(sort(JSON.parse(s)));};
 let publicDifferences=0;
 const pgPublic=(await db.query('SELECT p.id,p.data FROM buildwatch.public_projects p JOIN buildwatch.active_map_index m ON m.id=p.id')).rows;
 const sqlitePublic=new Map((source.prepare('SELECT p.id,p.data FROM public_projects p JOIN active_map_index m ON m.id=p.id').all() as any[]).map(r=>[r.id,normalize(r.data)]));
 for(const r of pgPublic){if(sqlitePublic.get(r.id)!==normalize(r.data))publicDifferences++;sqlitePublic.delete(r.id);}publicDifferences+=sqlitePublic.size;
 return {expected,actual,differences,publicDifferences,publicProjects:pgPublic.length};
}
export async function migrateSnapshot(db:SqlSession,source:DatabaseSync,spatial=true){
 const expected=snapshotInventory(source),fingerprint=hash(JSON.stringify(expected)).toString('hex');
 const exists=(await db.query("SELECT to_regclass('buildwatch.migration_imports') AS name")).rows[0]?.name;
 if(exists){
  const prior=(await db.query('SELECT fingerprint FROM buildwatch.migration_imports ORDER BY created DESC LIMIT 1')).rows[0];
  if(prior?.fingerprint!==fingerprint)throw Error('Destination already contains another import. Refusing to overwrite cloud records.');
  const verification=await verifyPostgres(db,source);if(verification.differences.length||verification.publicDifferences)throw Error('Existing cloud data differs; refusing automatic overwrite.');
  return {alreadyImported:true,fingerprint,verification};
 }
 const existing=(await db.query("SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='buildwatch'")).rows[0].n;
 if(existing)throw Error('Nonempty unrecognized destination schema; import stopped.');
 for(const name of ['001-tables.sql',...(spatial?['003-spatial.sql']:[]),'002-views.sql',...(spatial?['005-active-index.sql']:[])])await db.query(readFileSync(new URL('./migrations/'+name,import.meta.url),'utf8'));
 await db.query('CREATE TABLE buildwatch.migration_imports(fingerprint text PRIMARY KEY,created bigint NOT NULL,inventory jsonb NOT NULL); ALTER TABLE buildwatch.migration_imports ENABLE ROW LEVEL SECURITY; REVOKE ALL ON buildwatch.migration_imports FROM PUBLIC;');
 for(const t of manifest.tables){const cols=columns(t);let batch:any[]=[];
  const put=async()=>{if(!batch.length)return;const args:any[]=[],marks=batch.map(row=>'('+cols.map(k=>{args.push(row[k]);return'$'+args.length;}).join(',')+')');await db.query('INSERT INTO buildwatch.'+quoted(t.name)+'('+cols.map(quoted).join(',')+') VALUES '+marks.join(','),args);batch=[];};
  for(const r of source.prepare('SELECT '+cols.map(quoted).join(',')+' FROM '+quoted(t.name)).iterate()){batch.push(r);if(batch.length===100)await put();}await put();
  if(t.rowid)await db.query(`SELECT setval(pg_get_serial_sequence('buildwatch.${t.name}','rowid'),greatest(coalesce((SELECT max(rowid) FROM buildwatch.${quoted(t.name)}),1),1),EXISTS(SELECT 1 FROM buildwatch.${quoted(t.name)}))`);
 }
 await db.query('SET CONSTRAINTS ALL IMMEDIATE');
 const verification=await verifyPostgres(db,source);
 if(verification.differences.length||verification.publicDifferences){
  const diagnostic:Record<string,any>={};
  if(verification.differences.includes('map_index')){
   const original=new Map((source.prepare('SELECT * FROM map_index').all() as any[]).map(r=>[r.rid,r]));
   for(const row of(await db.query('SELECT rid,id,latitude,longitude,x,y,status,state,searchtext,meetings FROM buildwatch.map_index')).rows){const old=original.get(row.rid);if(!old)continue;for(const k of Object.keys(old))if(JSON.stringify(old[k])!==JSON.stringify(row[k])){const d=diagnostic[k]||{count:0,maxAbsoluteError:0,sourceType:typeof old[k],destinationType:typeof row[k]};d.count++;if(typeof old[k]==='number'&&typeof row[k]==='number')d.maxAbsoluteError=Math.max(d.maxAbsoluteError,Math.abs(old[k]-row[k]));diagnostic[k]=d;}}
  }
  throw Error('Import verification failed: tables '+verification.differences.join(',')+'; public payload differences '+verification.publicDifferences+'; column diagnostics '+JSON.stringify(diagnostic)+'. Transaction must be rolled back.');
 }
 await db.query('INSERT INTO buildwatch.migration_imports VALUES($1,$2,$3)',[fingerprint,Date.now(),JSON.stringify(expected)]);
 return {alreadyImported:false,fingerprint,verification};
}
