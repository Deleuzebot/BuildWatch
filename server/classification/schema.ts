import type {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {classifyProject,categoryInput,CATEGORY_VERSION} from '../../src/lib/categories';
export const categoryFingerprint=(input:string)=>createHash('sha256').update(input).digest('hex');
export function registerCategoryFunctions(db:DatabaseSync){
 db.function('bw_category_hash',{deterministic:true},(input:any)=>categoryFingerprint(String(input)));
 db.function('bw_category_input',{deterministic:true},(data:any)=>categoryFingerprint(categoryInput(JSON.parse(String(data)))));
 db.function('bw_category_data',{deterministic:true},(data:any)=>{
  const result=classifyProject(JSON.parse(String(data)));
  const {input,...classification}=result.classification;
  return JSON.stringify({...result,classification:{...classification,inputFingerprint:categoryFingerprint(input)}});
 });
}
/** Derived classification overlays preserve every original source payload and project revision. */
export function initializeCategories(db:DatabaseSync){
 db.exec(`CREATE TABLE IF NOT EXISTS project_categories(project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,input TEXT NOT NULL,normalized TEXT NOT NULL,updated INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS category_review ON project_categories(json_extract(normalized,'$.classification.status'),project_id);`);
 const data=`json_patch(coalesce(o.data,p.data),coalesce(c.normalized,'{}'))`;
 db.exec(`DROP VIEW IF EXISTS public_projects; CREATE VIEW public_projects AS SELECT p.rowid AS rowid,p.id,${data} AS data,coalesce(o.revision,p.revision) AS revision FROM projects p LEFT JOIN project_overrides o ON o.project_id=p.id LEFT JOIN project_categories c ON c.project_id=p.id WHERE NOT EXISTS(SELECT 1 FROM project_relationships r WHERE r.source_id=p.id);
 DROP VIEW IF EXISTS project_profiles; CREATE VIEW project_profiles AS SELECT p.id,p.rowid AS rowid,${data} AS data,coalesce(o.revision,p.revision) AS revision FROM projects p LEFT JOIN project_overrides o ON o.project_id=p.id LEFT JOIN project_categories c ON c.project_id=p.id;`);
 const refresh=(id:string)=>`INSERT INTO project_categories SELECT p.id,bw_category_input(coalesce(o.data,p.data)),bw_category_data(coalesce(o.data,p.data)),bw_now() FROM projects p LEFT JOIN project_overrides o ON o.project_id=p.id WHERE p.id=${id} ON CONFLICT(project_id) DO UPDATE SET input=excluded.input,normalized=excluded.normalized,updated=excluded.updated WHERE project_categories.input<>excluded.input;`;
 db.exec(`CREATE TRIGGER IF NOT EXISTS categories_project_insert AFTER INSERT ON projects BEGIN ${refresh('new.id')} END;
 CREATE TRIGGER IF NOT EXISTS categories_project_update AFTER UPDATE OF data ON projects BEGIN ${refresh('new.id')} END;
 CREATE TRIGGER IF NOT EXISTS categories_override_insert AFTER INSERT ON project_overrides BEGIN ${refresh('new.project_id')} END;
 CREATE TRIGGER IF NOT EXISTS categories_override_update AFTER UPDATE ON project_overrides BEGIN ${refresh('new.project_id')} END;
 CREATE TRIGGER IF NOT EXISTS categories_override_delete AFTER DELETE ON project_overrides BEGIN ${refresh('old.project_id')} END;`);
 if(!db.prepare('SELECT 1 FROM meta WHERE key=?').get('categories_v'+CATEGORY_VERSION)){
  db.exec('SAVEPOINT categories_migration');try{
   db.exec(`INSERT INTO project_categories SELECT p.id,bw_category_input(coalesce(o.data,p.data)),bw_category_data(coalesce(o.data,p.data)),bw_now() FROM projects p LEFT JOIN project_overrides o ON o.project_id=p.id WHERE 1 ON CONFLICT(project_id) DO UPDATE SET input=excluded.input,normalized=excluded.normalized,updated=excluded.updated;`);
   db.prepare('INSERT INTO meta VALUES(?,?)').run('categories_v'+CATEGORY_VERSION,'1');db.exec('RELEASE categories_migration');
  }catch(e){db.exec('ROLLBACK TO categories_migration; RELEASE categories_migration');throw e;}
 }
 // Lossless derived-metadata upgrade: retain decisions, reasons and timestamps.
 // Original inputs remain reconstructible from the untouched project/override payloads.
 if(!db.prepare("SELECT 1 FROM meta WHERE key='category_storage_v1'").get()){
  db.exec('SAVEPOINT category_storage');try{
   // No searchable/display fields change, so avoid rebuilding every map entry.
   const trigger=db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='categories_map_update'").get() as {sql:string}|undefined;
   db.exec('DROP TRIGGER IF EXISTS categories_map_update');
   db.exec(`UPDATE project_categories SET
    normalized=json_set(json_remove(normalized,'$.classification.input'),'$.classification.inputFingerprint',bw_category_hash(input)),
    input=bw_category_hash(input)
    WHERE json_type(normalized,'$.classification.input') IS NOT NULL;
    INSERT INTO meta VALUES('category_storage_v1','1');`);
   if(trigger)db.exec(trigger.sql);
   db.exec('RELEASE category_storage');
  }catch(error){db.exec('ROLLBACK TO category_storage; RELEASE category_storage');throw error;}
 }
}
