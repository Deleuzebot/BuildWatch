import {initializeActivity,registerActivityFunctions} from '../activity/schema';
import {initializeCategories,registerCategoryFunctions} from '../classification/schema';
import {initializeRoadPolicy,registerRoadFunctions} from '../roads/schema';
import {initializeArchiveSchema} from '../archives/schema';
import { initializeAutomationSchema } from '../automation/schema';
import { initializeDuplicateSchema } from '../duplicates/schema';
import type { DatabaseSync } from 'node:sqlite';
/** Derived indexes only. Never rewrites projects, revisions, history, accounts or follows. */
export function initializeMapIndex(db: DatabaseSync) {
  registerActivityFunctions(db);
  registerRoadFunctions(db);
  registerCategoryFunctions(db);
  initializeDuplicateSchema(db);
  initializeAutomationSchema(db);
  db.function('bw_now',()=>Date.now());

  db.function('bw_lower', { deterministic: true }, (value: any) => String(value ?? '').toLowerCase());
  db.function("bw_millis", { deterministic: true }, (value: any) => { const n=Date.parse(String(value)); return Number.isFinite(n)?n:null; });
  initializeArchiveSchema(db);
  initializeCategories(db);
  initializeRoadPolicy(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS map_meta(id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL);
    INSERT OR IGNORE INTO map_meta VALUES(1,1);
    CREATE TABLE IF NOT EXISTS map_index(
      rid INTEGER PRIMARY KEY, id TEXT UNIQUE NOT NULL, latitude REAL NOT NULL, longitude REAL NOT NULL,
      x REAL NOT NULL, y REAL NOT NULL, status TEXT NOT NULL, state TEXT,
      searchtext TEXT NOT NULL, meetings INTEGER NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS map_spatial USING rtree(rid,minLon,maxLon,minLat,maxLat);
    CREATE VIRTUAL TABLE IF NOT EXISTS map_search USING fts5(searchtext, content='map_index', content_rowid='rid', tokenize='trigram');
    CREATE INDEX IF NOT EXISTS map_status ON map_index(status);
    CREATE INDEX IF NOT EXISTS map_lat ON map_index(latitude);
    CREATE INDEX IF NOT EXISTS map_lon ON map_index(longitude);
    CREATE INDEX IF NOT EXISTS map_meeting_count ON map_index(meetings) WHERE meetings>0;
    CREATE TABLE IF NOT EXISTS map_types(rid INTEGER NOT NULL,category TEXT NOT NULL,PRIMARY KEY(rid,category)); CREATE INDEX IF NOT EXISTS map_types_category ON map_types(category,rid);
    CREATE TABLE IF NOT EXISTS map_meetings(project_rid INTEGER NOT NULL,id TEXT NOT NULL,starts INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(project_rid,id));
    CREATE INDEX IF NOT EXISTS map_meeting_date ON map_meetings(starts,project_rid,id);
  `);
  db.exec(`CREATE VIEW IF NOT EXISTS active_map_index AS SELECT m.* FROM map_index m WHERE m.status<>'Approved' OR m.id NOT IN (SELECT project_id FROM policy_expiration_queue WHERE due_at<=bw_now());`);
  installIndexTriggers(db);
  const select = (alias: string) => `SELECT ${alias}.rowid, ${alias}.id,
    json_extract(${alias}.data,'$.latitude'),json_extract(${alias}.data,'$.longitude'),
    (json_extract(${alias}.data,'$.longitude')+180.0)/360.0,
    (1-ln(tan(pi()/4 + min(85,max(-85,json_extract(${alias}.data,'$.latitude')))*pi()/360))/pi())/2,
    json_extract(${alias}.data,'$.status'),nullif(upper(trim(coalesce(json_extract(${alias}.data,'$.state'),''))),''),
    bw_lower(coalesce(json_extract(${alias}.data,'$.name'),'')||char(31)||coalesce(json_extract(${alias}.data,'$.address'),'')||char(31)||coalesce(json_extract(${alias}.data,'$.neighborhood'),'')||char(31)||coalesce(json_extract(${alias}.data,'$.category'),'')||char(31)||coalesce(json_extract(${alias}.data,'$.secondaryCategories'),'')||char(31)||coalesce(json_extract(${alias}.data,'$.subtype'),'')||char(31)||coalesce(json_extract(${alias}.data,'$.city'),'')||char(31)||coalesce(json_extract(${alias}.data,'$.county'),'')||CASE WHEN length(trim(coalesce(json_extract(${alias}.data,'$.county'),'')))>0 THEN ' County' ELSE '' END||char(31)||coalesce(json_extract(${alias}.data,'$.state'),'')||char(31)||coalesce(json_extract(${alias}.data,'$.jurisdiction'),'')||char(31)||coalesce((SELECT group_concat(value,' ') FROM json_each(${alias}.data,'$.permitNumbers')),'')),
    coalesce(json_array_length(json_extract(${alias}.data,'$.meetings')),0)
    WHERE bw_road_allowed(${alias}.data)=1 AND NOT (json_extract(${alias}.data,'$.status')='Approved' AND coalesce(json_extract(${alias}.data,'$.evidenceType'),'')='permit' AND coalesce(json_extract(${alias}.data,'$.jurisdiction'),'')='NC DEQ construction stormwater' AND NOT EXISTS(SELECT 1 FROM community_verifications v WHERE v.project_id=${alias}.id)) AND NOT EXISTS(SELECT 1 FROM archived_projects a WHERE a.project_id=${alias}.id) AND NOT EXISTS(SELECT 1 FROM approval_policy l WHERE l.project_id=${alias}.id AND json_extract(${alias}.data,'$.status')='Approved' AND l.due_at<=bw_now()) AND coalesce(json_extract(${alias}.data,'$.archived'),0)=0 AND json_extract(${alias}.data,'$.status') NOT IN ('Completed','Cancelled') AND NOT EXISTS(SELECT 1 FROM automation_project_policy policy WHERE policy.project_id=${alias}.id AND policy.classification<>'Public-Facing Development')`;
  const rebuild = !db.prepare("SELECT value FROM meta WHERE key='map_index_v7'").get();
  // Atomic derived-only upgrade; original records and project revisions are never rewritten.
  if (rebuild) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec('DROP TRIGGER IF EXISTS map_index_insert; DROP TRIGGER IF EXISTS map_index_delete; DROP TRIGGER IF EXISTS overrides_map_insert; DROP TRIGGER IF EXISTS overrides_map_update; DROP TRIGGER IF EXISTS overrides_map_delete; DROP TRIGGER IF EXISTS relationships_map_insert; DROP TRIGGER IF EXISTS relationships_map_update; DROP TRIGGER IF EXISTS relationships_map_delete; DROP TRIGGER IF EXISTS policy_map_insert; DROP TRIGGER IF EXISTS policy_map_update; DROP TRIGGER IF EXISTS policy_map_delete;');
      for(const name of ['archive_map_insert','archive_map_delete','approval_map_insert','approval_map_update','approval_map_delete','community_insert','community_update','community_delete'])db.exec('DROP TRIGGER IF EXISTS '+name);
      // Reinstall meeting triggers below before backfill.
      installIndexTriggers(db);
      db.exec('DELETE FROM map_index; DROP TRIGGER IF EXISTS projects_map_insert; DROP TRIGGER IF EXISTS projects_map_update; DROP TRIGGER IF EXISTS projects_map_delete;');
      db.exec(`INSERT INTO map_index ${select('p').replace(' WHERE ', ' FROM public_projects p WHERE ')};`);
      db.exec("INSERT INTO meta VALUES('map_index_v7','1'); UPDATE map_meta SET version=version+1 WHERE id=1;");
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  const refresh=(id:string)=>`DELETE FROM map_index WHERE id=${id}; INSERT INTO map_index ${select('p').replace(' WHERE ', ' FROM public_projects p WHERE p.id='+id+' AND ')}; UPDATE map_meta SET version=version+1 WHERE id=1;`;
  try { db.exec(`
    CREATE TRIGGER IF NOT EXISTS projects_map_insert AFTER INSERT ON projects BEGIN
      INSERT INTO map_index ${select('p').replace(' WHERE ', ' FROM public_projects p WHERE p.id=new.id AND ')};
      UPDATE map_meta SET version=version+1 WHERE id=1;
    END;
    CREATE TRIGGER IF NOT EXISTS projects_map_update AFTER UPDATE OF data,revision ON projects BEGIN
      DELETE FROM map_index WHERE rid=old.rowid;
      INSERT INTO map_index ${select('p').replace(' WHERE ', ' FROM public_projects p WHERE p.id=new.id AND ')};
      UPDATE map_meta SET version=version+1 WHERE id=1;
    END;
    CREATE TRIGGER IF NOT EXISTS projects_map_delete AFTER DELETE ON projects BEGIN
      DELETE FROM map_index WHERE rid=old.rowid;
      UPDATE map_meta SET version=version+1 WHERE id=1;
    END;
  `);
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS categories_map_insert AFTER INSERT ON project_categories BEGIN ${refresh('new.project_id')} END;
      CREATE TRIGGER IF NOT EXISTS categories_map_update AFTER UPDATE ON project_categories BEGIN ${refresh('new.project_id')} END;
      CREATE TRIGGER IF NOT EXISTS overrides_map_insert AFTER INSERT ON project_overrides BEGIN ${refresh('new.project_id')} END;
      CREATE TRIGGER IF NOT EXISTS overrides_map_update AFTER UPDATE ON project_overrides BEGIN ${refresh('new.project_id')} END;
      CREATE TRIGGER IF NOT EXISTS overrides_map_delete AFTER DELETE ON project_overrides BEGIN ${refresh('old.project_id')} END;
      CREATE TRIGGER IF NOT EXISTS relationships_map_insert AFTER INSERT ON project_relationships BEGIN ${refresh('new.source_id')} END;
      CREATE TRIGGER IF NOT EXISTS relationships_map_update AFTER UPDATE ON project_relationships BEGIN ${refresh('new.source_id')} END;
      CREATE TRIGGER IF NOT EXISTS relationships_map_delete AFTER DELETE ON project_relationships BEGIN ${refresh('old.source_id')} END;
    `);
    db.exec(`CREATE TRIGGER IF NOT EXISTS policy_map_insert AFTER INSERT ON automation_project_policy BEGIN ${refresh('new.project_id')} END; CREATE TRIGGER IF NOT EXISTS policy_map_update AFTER UPDATE ON automation_project_policy BEGIN ${refresh('new.project_id')} END; CREATE TRIGGER IF NOT EXISTS policy_map_delete AFTER DELETE ON automation_project_policy BEGIN ${refresh('old.project_id')} END;`);
    db.exec(`CREATE TRIGGER IF NOT EXISTS archive_map_insert AFTER INSERT ON archived_projects BEGIN ${refresh('new.project_id')} END; CREATE TRIGGER IF NOT EXISTS archive_map_delete AFTER DELETE ON archived_projects BEGIN ${refresh('old.project_id')} END;
    CREATE TRIGGER IF NOT EXISTS approval_map_insert AFTER INSERT ON approval_policy BEGIN ${refresh('new.project_id')} END; CREATE TRIGGER IF NOT EXISTS approval_map_update AFTER UPDATE ON approval_policy BEGIN ${refresh('new.project_id')} END; CREATE TRIGGER IF NOT EXISTS approval_map_delete AFTER DELETE ON approval_policy BEGIN ${refresh('old.project_id')} END;`);
    const queue=(id:string)=>`DELETE FROM policy_expiration_queue WHERE project_id=${id}; INSERT INTO policy_expiration_queue SELECT l.project_id,l.due_at FROM approval_policy l JOIN project_profiles p ON p.id=l.project_id WHERE p.id=${id} AND l.due_at IS NOT NULL AND json_extract(p.data,'$.status')='Approved' AND NOT EXISTS(SELECT 1 FROM archived_projects a WHERE a.project_id=p.id);`;
    db.exec(`CREATE TRIGGER IF NOT EXISTS approval_queue_insert AFTER INSERT ON approval_policy BEGIN ${queue('new.project_id')} END; CREATE TRIGGER IF NOT EXISTS approval_queue_update AFTER UPDATE ON approval_policy BEGIN ${queue('new.project_id')} END; CREATE TRIGGER IF NOT EXISTS approval_queue_delete AFTER DELETE ON approval_policy BEGIN DELETE FROM policy_expiration_queue WHERE project_id=old.project_id; END;
    CREATE TRIGGER IF NOT EXISTS archive_queue_insert AFTER INSERT ON archived_projects BEGIN DELETE FROM policy_expiration_queue WHERE project_id=new.project_id; END; CREATE TRIGGER IF NOT EXISTS archive_queue_delete AFTER DELETE ON archived_projects BEGIN ${queue('old.project_id')} END;
    CREATE TRIGGER IF NOT EXISTS project_queue_update AFTER UPDATE ON projects BEGIN ${queue('new.id')} END; CREATE TRIGGER IF NOT EXISTS project_queue_delete BEFORE DELETE ON projects BEGIN DELETE FROM policy_expiration_queue WHERE project_id=old.id; END;
    CREATE TRIGGER IF NOT EXISTS override_queue_insert AFTER INSERT ON project_overrides BEGIN ${queue('new.project_id')} END; CREATE TRIGGER IF NOT EXISTS override_queue_update AFTER UPDATE ON project_overrides BEGIN ${queue('new.project_id')} END; CREATE TRIGGER IF NOT EXISTS override_queue_delete AFTER DELETE ON project_overrides BEGIN ${queue('old.project_id')} END;`);
    const permits=(id:string)=>`DELETE FROM policy_permit_queue WHERE project_id=${id}; INSERT INTO policy_permit_queue SELECT p.id FROM project_profiles p WHERE p.id=${id} AND json_extract(p.data,'$.status')='Approved' AND json_extract(p.data,'$.evidenceType')='permit' AND json_extract(p.data,'$.jurisdiction')='NC DEQ construction stormwater' AND NOT EXISTS(SELECT 1 FROM archived_projects a WHERE a.project_id=p.id) AND NOT EXISTS(SELECT 1 FROM community_verifications v WHERE v.project_id=p.id);`;
    db.exec(`CREATE TRIGGER IF NOT EXISTS permit_project_insert AFTER INSERT ON projects BEGIN ${permits('new.id')} END; CREATE TRIGGER IF NOT EXISTS permit_project_update AFTER UPDATE ON projects BEGIN ${permits('new.id')} END; CREATE TRIGGER IF NOT EXISTS permit_project_delete BEFORE DELETE ON projects BEGIN DELETE FROM policy_permit_queue WHERE project_id=old.id; END;
    CREATE TRIGGER IF NOT EXISTS permit_override_insert AFTER INSERT ON project_overrides BEGIN ${permits('new.project_id')} END; CREATE TRIGGER IF NOT EXISTS permit_override_update AFTER UPDATE ON project_overrides BEGIN ${permits('new.project_id')} END;
    CREATE TRIGGER IF NOT EXISTS permit_archive_insert AFTER INSERT ON archived_projects BEGIN DELETE FROM policy_permit_queue WHERE project_id=new.project_id; END; CREATE TRIGGER IF NOT EXISTS permit_archive_delete AFTER DELETE ON archived_projects BEGIN ${permits('old.project_id')} END;
    CREATE TRIGGER IF NOT EXISTS community_insert AFTER INSERT ON community_verifications BEGIN ${permits('new.project_id')} ${refresh('new.project_id')} END; CREATE TRIGGER IF NOT EXISTS community_update AFTER UPDATE ON community_verifications BEGIN ${permits('new.project_id')} ${refresh('new.project_id')} END; CREATE TRIGGER IF NOT EXISTS community_delete AFTER DELETE ON community_verifications BEGIN ${permits('old.project_id')} ${refresh('old.project_id')} END;`);
    if(rebuild)db.exec(`INSERT OR IGNORE INTO policy_permit_queue SELECT p.id FROM project_profiles p WHERE json_extract(p.data,'$.status')='Approved' AND json_extract(p.data,'$.evidenceType')='permit' AND json_extract(p.data,'$.jurisdiction')='NC DEQ construction stormwater' AND NOT EXISTS(SELECT 1 FROM archived_projects a WHERE a.project_id=p.id) AND NOT EXISTS(SELECT 1 FROM community_verifications v WHERE v.project_id=p.id);`);
    if(rebuild)db.exec('COMMIT');
  } catch(error){if(rebuild)db.exec('ROLLBACK');throw error;}
  initializeActivity(db);
}

function installIndexTriggers(db:DatabaseSync){db.exec(`
    CREATE TRIGGER IF NOT EXISTS map_index_insert AFTER INSERT ON map_index BEGIN
      INSERT INTO map_meetings SELECT new.rid,json_extract(e.value,'$.id'),bw_millis(json_extract(e.value,'$.startsAt')),e.value FROM public_projects p,json_each(p.data,'$.meetings') e WHERE p.rowid=new.rid AND bw_millis(json_extract(e.value,'$.startsAt')) IS NOT NULL;
      INSERT OR IGNORE INTO map_types SELECT new.rid,json_extract(p.data,'$.primaryCategory') FROM public_projects p WHERE p.rowid=new.rid AND json_extract(p.data,'$.primaryCategory') IS NOT NULL;
      INSERT OR IGNORE INTO map_types SELECT new.rid,e.value FROM public_projects p,json_each(p.data,'$.secondaryCategories') e WHERE p.rowid=new.rid;
      INSERT INTO map_spatial VALUES(new.rid,new.longitude,new.longitude,new.latitude,new.latitude);
      INSERT INTO map_search(rowid,searchtext) VALUES(new.rid,new.searchtext);
    END;
    CREATE TRIGGER IF NOT EXISTS map_index_delete AFTER DELETE ON map_index BEGIN
      DELETE FROM map_types WHERE rid=old.rid;
      DELETE FROM map_meetings WHERE project_rid=old.rid;
      DELETE FROM map_spatial WHERE rid=old.rid;
      INSERT INTO map_search(map_search,rowid,searchtext) VALUES('delete',old.rid,old.searchtext);
    END;
  `);}
