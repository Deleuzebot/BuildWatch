/** Explicit metadata-only import; no merges, supporting links, classifications or status checks. */
import{DatabaseSync,backup}from'node:sqlite';
import{readFileSync,mkdirSync}from'node:fs';
import{resolve}from'node:path';
import{createHash}from'node:crypto';
import{Store}from'../server/accounts/store.ts';
import{importReviewMetadata}from'../server/duplicates/import.ts';
if(!process.argv.includes('--apply-review-metadata'))throw Error('Pass --apply-review-metadata to import the review queue only.');
const file=process.env.DATA_FILE||'server/data/projects.json';
const source=new DatabaseSync(file+'.sqlite',{readOnly:true});
const tables=['projects','users','follows','follow_history','history','entitlements','invitations','submissions','notifications','devices','role_audit'];
const digest=db=>Object.fromEntries(tables.map(table=>[table,createHash('sha256').update(JSON.stringify(db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())).digest('hex')]));
const before=digest(source),folder=resolve('server/data/backups');mkdirSync(folder,{recursive:true,mode:0o700});
const saved=resolve(folder,'before-duplicate-management-'+Date.now()+'.sqlite');await backup(source,saved);source.close();
const store=new Store(file+'.sqlite',file);
try{const result=importReviewMetadata(store,JSON.parse(readFileSync('reports/community-refocus/duplicate-candidates.json')),JSON.parse(readFileSync('reports/community-refocus/classification-candidates.json')));const after=digest(store.db);if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Original table mismatch; investigate before continuing.');console.log(JSON.stringify({...result,originalTablesUnchanged:true,backup:saved}));}finally{store.close();}
