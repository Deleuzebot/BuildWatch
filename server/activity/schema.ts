import type {DatabaseSync} from 'node:sqlite';import {recordEvents,meetingEvents,policyEvents} from './evidence';
export function registerActivityFunctions(db:DatabaseSync){
 db.function('bw_record_activity',{deterministic:true},(data:any)=>JSON.stringify(recordEvents(JSON.parse(String(data)))));
 db.function('bw_meeting_activity',{deterministic:true},(data:any)=>JSON.stringify(meetingEvents(JSON.parse(String(data)))));
 db.function('bw_policy_activity',{deterministic:true},(approval:any,schedules:any)=>JSON.stringify(policyEvents(approval?JSON.parse(String(approval)):null,JSON.parse(String(schedules||'[]')))));
}
/** Synchronous, evidence-only projection. No timers, workers, source requests or scheduled processes. */
export function initializeActivity(db:DatabaseSync){
 db.exec(`CREATE TABLE IF NOT EXISTS project_activity(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,origin TEXT NOT NULL,event_key TEXT NOT NULL,type TEXT NOT NULL,event_date TEXT NOT NULL,occurred_at INTEGER NOT NULL,description TEXT NOT NULL,source_url TEXT,recorded_at INTEGER NOT NULL,UNIQUE(project_id,origin,event_key));
 CREATE INDEX IF NOT EXISTS activity_date_project ON project_activity(occurred_at,project_id);
 CREATE INDEX IF NOT EXISTS activity_project_date ON project_activity(project_id,occurred_at DESC,id);
 CREATE TRIGGER IF NOT EXISTS activity_version_insert AFTER INSERT ON project_activity BEGIN UPDATE map_meta SET version=version+1 WHERE id=1; END;
 CREATE TRIGGER IF NOT EXISTS activity_version_update AFTER UPDATE ON project_activity BEGIN UPDATE map_meta SET version=version+1 WHERE id=1; END;
 CREATE TRIGGER IF NOT EXISTS activity_version_delete AFTER DELETE ON project_activity BEGIN UPDATE map_meta SET version=version+1 WHERE id=1; END;`);
 const columns=`id,project_id,origin,event_key,type,event_date,occurred_at,description,source_url,recorded_at`;
 const select=(id:string,origin:string)=>`lower(hex(randomblob(16))),${id},'${origin}',json_extract(e.value,'$.key'),json_extract(e.value,'$.type'),json_extract(e.value,'$.date'),json_extract(e.value,'$.at'),json_extract(e.value,'$.description'),json_extract(e.value,'$.url'),bw_now()`;
 const put=`ON CONFLICT(project_id,origin,event_key) DO UPDATE SET description=excluded.description,source_url=excluded.source_url,event_date=excluded.event_date,occurred_at=excluded.occurred_at WHERE description<>excluded.description OR source_url IS NOT excluded.source_url OR event_date<>excluded.event_date;`;
 const record=(id:string)=>`INSERT INTO project_activity(${columns}) SELECT ${select('p.id','record')} FROM project_profiles p,json_each(bw_record_activity(p.data)) e WHERE p.id=${id} AND (json_extract(e.value,'$.type')<>'Approval' OR NOT EXISTS(SELECT 1 FROM approval_policy l WHERE l.project_id=p.id AND l.approval_evidence IS NOT NULL)) ${put}`;
 const meetings=(id:string)=>`DELETE FROM project_activity WHERE project_id=${id} AND origin='meeting' AND event_key NOT IN(SELECT json_extract(e.value,'$.key') FROM project_profiles p,json_each(bw_meeting_activity(p.data)) e WHERE p.id=${id}); INSERT INTO project_activity(${columns}) SELECT ${select('p.id','meeting')} FROM project_profiles p,json_each(bw_meeting_activity(p.data)) e WHERE p.id=${id} ${put}`;
 const policy=(id:string)=>`DELETE FROM project_activity WHERE project_id=${id} AND origin='policy' AND event_key NOT IN(SELECT json_extract(e.value,'$.key') FROM approval_policy l,json_each(bw_policy_activity(l.approval_evidence,l.schedules)) e WHERE l.project_id=${id}); DELETE FROM project_activity WHERE project_id=${id} AND origin='record' AND type='Approval' AND EXISTS(SELECT 1 FROM approval_policy l WHERE l.project_id=${id} AND l.approval_evidence IS NOT NULL); INSERT INTO project_activity(${columns}) SELECT ${select('l.project_id','policy')} FROM approval_policy l,json_each(bw_policy_activity(l.approval_evidence,l.schedules)) e WHERE l.project_id=${id} ${put}`;
 db.exec(`CREATE TRIGGER IF NOT EXISTS activity_project_insert AFTER INSERT ON projects BEGIN ${record('new.id')}${meetings('new.id')} END;
 CREATE TRIGGER IF NOT EXISTS activity_project_update AFTER UPDATE OF data ON projects BEGIN ${record('new.id')}${meetings('new.id')} END;
 CREATE TRIGGER IF NOT EXISTS activity_override_insert AFTER INSERT ON project_overrides BEGIN ${record('new.project_id')}${meetings('new.project_id')} END;
 CREATE TRIGGER IF NOT EXISTS activity_override_update AFTER UPDATE ON project_overrides BEGIN ${record('new.project_id')}${meetings('new.project_id')} END;
 CREATE TRIGGER IF NOT EXISTS activity_override_delete AFTER DELETE ON project_overrides BEGIN ${record('old.project_id')}${meetings('old.project_id')} END;
 CREATE TRIGGER IF NOT EXISTS activity_approval_insert AFTER INSERT ON approval_policy BEGIN ${policy('new.project_id')} END;
 CREATE TRIGGER IF NOT EXISTS activity_approval_update AFTER UPDATE ON approval_policy BEGIN ${policy('new.project_id')} END;
 CREATE TRIGGER IF NOT EXISTS activity_approval_delete AFTER DELETE ON approval_policy BEGIN DELETE FROM project_activity WHERE project_id=old.project_id AND origin='policy'; END;`);
 if(!db.prepare("SELECT 1 FROM meta WHERE key='activity_v1'").get()){
  db.exec('SAVEPOINT activity_migration');try{
   db.exec(`INSERT INTO project_activity(${columns}) SELECT ${select('p.id','record')} FROM project_profiles p,json_each(bw_record_activity(p.data)) e WHERE json_extract(e.value,'$.type')<>'Approval' OR NOT EXISTS(SELECT 1 FROM approval_policy l WHERE l.project_id=p.id AND l.approval_evidence IS NOT NULL) ${put}
   INSERT INTO project_activity(${columns}) SELECT ${select('p.id','meeting')} FROM project_profiles p,json_each(bw_meeting_activity(p.data)) e WHERE 1 ${put}
   INSERT INTO project_activity(${columns}) SELECT ${select('l.project_id','policy')} FROM approval_policy l,json_each(bw_policy_activity(l.approval_evidence,l.schedules)) e WHERE 1 ${put}
   INSERT INTO meta VALUES('activity_v1','1');`);db.exec('RELEASE activity_migration');
  }catch(e){db.exec('ROLLBACK TO activity_migration; RELEASE activity_migration');throw e;}
 }
}
