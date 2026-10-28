import type {DatabaseSync} from 'node:sqlite';
import {roadDecision,ROAD_POLICY_VERSION} from './policy';
/** Evidence decisions and reversible archives; raw project payloads and relationships are untouched. */
export function registerRoadFunctions(db:DatabaseSync){
 db.function('bw_road_allowed',{deterministic:true},(data:any)=>{const d=roadDecision(JSON.parse(String(data)));return !d.road||d.qualifies?1:0;});
 db.function('bw_road_decision',{deterministic:true},(data:any)=>{const d=roadDecision(JSON.parse(String(data)));return d.road?JSON.stringify(d):null;});
}
export function initializeRoadPolicy(db:DatabaseSync){
 db.exec(`CREATE TABLE IF NOT EXISTS road_project_policy(project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,version INTEGER NOT NULL,detail TEXT NOT NULL,updated INTEGER NOT NULL);`);
 const refresh=(id:string)=>`
 INSERT INTO road_project_policy SELECT p.id,${ROAD_POLICY_VERSION},bw_road_decision(p.data),bw_now() FROM project_profiles p WHERE p.id=${id} AND bw_road_decision(p.data) IS NOT NULL
 ON CONFLICT(project_id) DO UPDATE SET version=excluded.version,detail=excluded.detail,updated=excluded.updated;
 DELETE FROM road_project_policy WHERE project_id=${id} AND EXISTS(SELECT 1 FROM project_profiles p WHERE p.id=${id} AND bw_road_decision(p.data) IS NULL);
 INSERT INTO archive_events SELECT lower(hex(randomblob(16))),p.id,'restored','policy:major-roads',bw_now(),'Road scope now qualifies or is non-road; other archive policies still apply.' FROM project_profiles p JOIN archived_projects a ON a.project_id=p.id WHERE p.id=${id} AND a.reason='road_not_significant' AND bw_road_allowed(p.data)=1;
 DELETE FROM archived_projects WHERE project_id=${id} AND reason='road_not_significant' AND EXISTS(SELECT 1 FROM project_profiles p WHERE p.id=${id} AND bw_road_allowed(p.data)=1);`;
 const archive=(id:string)=>`
 INSERT INTO archive_events SELECT lower(hex(randomblob(16))),r.project_id,'archived','policy:major-roads',bw_now(),r.detail FROM road_project_policy r WHERE r.project_id=${id} AND json_extract(r.detail,'$.qualifies')=0 AND NOT EXISTS(SELECT 1 FROM archived_projects a WHERE a.project_id=r.project_id);
 INSERT OR IGNORE INTO archived_projects(project_id,reason,archived_at,actor) SELECT r.project_id,'road_not_significant',bw_now(),'policy:major-roads' FROM road_project_policy r WHERE r.project_id=${id} AND json_extract(r.detail,'$.qualifies')=0;`;
 db.exec(`CREATE TRIGGER IF NOT EXISTS road_policy_archive_insert AFTER INSERT ON road_project_policy BEGIN ${archive('new.project_id')} END;
 CREATE TRIGGER IF NOT EXISTS road_policy_archive_update AFTER UPDATE ON road_project_policy BEGIN ${archive('new.project_id')} END;
 CREATE TRIGGER IF NOT EXISTS road_project_insert AFTER INSERT ON projects BEGIN ${refresh('new.id')} END;
 CREATE TRIGGER IF NOT EXISTS road_project_update AFTER UPDATE OF data,revision ON projects BEGIN ${refresh('new.id')} END;
 CREATE TRIGGER IF NOT EXISTS road_override_insert AFTER INSERT ON project_overrides BEGIN ${refresh('new.project_id')} END;
 CREATE TRIGGER IF NOT EXISTS road_override_update AFTER UPDATE ON project_overrides BEGIN ${refresh('new.project_id')} END;
 CREATE TRIGGER IF NOT EXISTS road_override_delete AFTER DELETE ON project_overrides BEGIN ${refresh('old.project_id')} END;`);
 if(!db.prepare("SELECT 1 FROM meta WHERE key=?").get('road_policy_v'+ROAD_POLICY_VERSION)){
  db.exec('SAVEPOINT road_policy_migration');try{
   db.exec(`INSERT INTO road_project_policy SELECT p.id,${ROAD_POLICY_VERSION},bw_road_decision(p.data),bw_now() FROM project_profiles p WHERE bw_road_decision(p.data) IS NOT NULL ON CONFLICT(project_id) DO UPDATE SET version=excluded.version,detail=excluded.detail,updated=excluded.updated;`);
   db.prepare('INSERT INTO meta VALUES(?,?)').run('road_policy_v'+ROAD_POLICY_VERSION,'1');db.exec('RELEASE road_policy_migration');
  }catch(e){db.exec('ROLLBACK TO road_policy_migration; RELEASE road_policy_migration');throw e;}
 }
}
