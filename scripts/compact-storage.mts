import {Store} from '../server/accounts/store';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
// Run offline, after a consistent SQLite backup. No record/history pruning.
const path=process.argv[2];
if(!path)throw new Error('Provide an offline SQLite database path');
if(!existsSync(path))throw new Error('Database does not exist; refusing to create a sample database');
const s=new Store(resolve(path));
try{
 const result=s.db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get() as any;
 if(result.busy)throw new Error('Database busy: stop the server before compacting');
 s.db.exec('VACUUM; PRAGMA wal_checkpoint(TRUNCATE);');
 console.log(JSON.stringify({integrity:s.one('PRAGMA integrity_check'),foreignKeys:s.all('PRAGMA foreign_key_check'),pages:s.one('PRAGMA page_count')}));
}finally{s.close();}
