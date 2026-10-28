import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {statSync,writeFileSync} from 'node:fs';
const [before,after,report]=process.argv.slice(2);
if(!report)throw new Error('Usage: verify-storage before.sqlite after.sqlite report.json');
const stable=(v:any):string=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)&&!(x instanceof Uint8Array)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const sha=(v:string)=>createHash('sha256').update(v).digest('hex');
function inspect(file:string){
 const db=new DatabaseSync(file,{readOnly:true});db.exec('BEGIN');
 try{
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND sql NOT LIKE 'CREATE VIRTUAL%' ORDER BY name").all() as {name:string}[];
  const hashes:Record<string,any>={};
  for(const {name}of [...tables,{name:'public_projects'},{name:'project_profiles'}]){
   let rows=db.prepare('SELECT * FROM "'+name+'"').all() as any[];
   if(name==='meta')rows=rows.filter(r=>r.key!=='category_storage_v1');
   for(const r of rows){
    if(name==='project_categories'){
     const n=JSON.parse(r.normalized);if(n.classification.input!==undefined){r.input=sha(r.input);delete n.classification.input;n.classification.inputFingerprint=r.input;}r.normalized=n;
    }
    if(name==='public_projects'||name==='project_profiles'){
     r.data=JSON.parse(r.data);if(r.data.classification){delete r.data.classification.input;delete r.data.classification.inputFingerprint;}
    }
   }
   hashes[name]={rows:rows.length,hash:sha(rows.map(r=>sha(stable(r))).sort().join(''))};
  }
  return {bytes:statSync(file).size,logicalBytes:(db.prepare('PRAGMA page_count').get() as any).page_count*4096,integrity:db.prepare('PRAGMA integrity_check').all(),foreignKeys:db.prepare('PRAGMA foreign_key_check').all(),sizes:db.prepare('SELECT name,sum(pgsize) bytes,sum(payload) payload,sum(unused) unused FROM dbstat GROUP BY name ORDER BY bytes DESC').all(),hashes};
 }finally{db.close();}
}
const a=inspect(before),b=inspect(after),differences=Object.keys(a.hashes).filter(k=>stable(a.hashes[k])!==stable(b.hashes[k]));
const result={before:a,after:b,savedBytes:a.logicalBytes-b.logicalBytes,differences};writeFileSync(report,JSON.stringify(result,null,2));
console.log(JSON.stringify({before:a.logicalBytes,after:b.logicalBytes,saved:result.savedBytes,differences,integrity:b.integrity,foreignKeys:b.foreignKeys}));
if(differences.length||b.foreignKeys.length||!b.integrity.every((r:any)=>r.integrity_check==='ok'))process.exitCode=1;
