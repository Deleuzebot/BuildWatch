import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../server/accounts/store';
import {classifyProject,categoryInput} from '../src/lib/categories';
import {categoryFingerprint} from '../server/classification/schema';
import {projects} from '../src/data/projects';

test('legacy classification compaction preserves records, history, decisions, dates and future update behavior',()=>{
 const dir=mkdtempSync(join(tmpdir(),'bw-storage-')),file=join(dir,'seed.json');
 const project={...projects[0],id:'storage',name:'Apartment development',description:'A multifamily housing development',category:'Housing',meetings:[]};
 writeFileSync(file,JSON.stringify([project]));let s=new Store(file+'.sqlite',file);
 try{
  s.publish({...s.project(project.id)!,description:project.description+' with 100 homes'},'admin');
  const raw=s.originalProject(project.id)!;
  const legacy=classifyProject(raw),input=categoryInput(raw);
  s.run('UPDATE project_categories SET input=?,normalized=?,updated=123 WHERE project_id=?',input,JSON.stringify(legacy),project.id);
  s.run("DELETE FROM meta WHERE key='category_storage_v1'");
  const records=s.all('SELECT * FROM projects'),history=s.all('SELECT * FROM history'),map=s.all('SELECT * FROM map_index');
  s.close();s=new Store(file+'.sqlite');
  const row=s.one('SELECT * FROM project_categories WHERE project_id=?',project.id),normalized=JSON.parse(row.normalized);
  assert.equal(row.input,categoryFingerprint(input));assert.equal(row.updated,123);
  const {input:removed,...oldDecision}=legacy.classification;
  assert.deepEqual(normalized,{...legacy,classification:{...oldDecision,inputFingerprint:categoryFingerprint(input)}});
  assert.deepEqual(s.all('SELECT * FROM projects'),records);assert.deepEqual(s.all('SELECT * FROM history'),history);assert.deepEqual(s.all('SELECT * FROM map_index'),map);
  s.publish({...s.project(project.id)!,status:'In review'},'admin');assert.equal(s.one('SELECT updated FROM project_categories').updated,123);
  s.publish({...s.project(project.id)!,name:'Hospital expansion',description:'New hospital building'},'admin');assert.equal(s.project(project.id)!.category,'Civic');
  assert.equal(s.one('SELECT length(input) n FROM project_categories').n,64);
  const compact=s.all('SELECT * FROM project_categories');s.close();s=new Store(file+'.sqlite');assert.deepEqual(s.all('SELECT * FROM project_categories'),compact);
  s.db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE);');
  assert.equal(s.one('PRAGMA integrity_check').integrity_check,'ok');assert.deepEqual(s.all('PRAGMA foreign_key_check'),[]);
 }finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
