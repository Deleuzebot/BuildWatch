import {randomUUID} from 'node:crypto';
import type{DatabaseSync}from'node:sqlite';
export function initializeArchiveSchema(db:DatabaseSync){db.exec(`
 CREATE TABLE IF NOT EXISTS community_verifications(project_id TEXT PRIMARY KEY REFERENCES projects(id),evidence TEXT NOT NULL,actor TEXT NOT NULL,updated INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS policy_permit_queue(project_id TEXT PRIMARY KEY REFERENCES projects(id));
 CREATE TABLE IF NOT EXISTS approval_policy(project_id TEXT PRIMARY KEY REFERENCES projects(id),approval_date TEXT,approval_at INTEGER,approval_evidence TEXT,schedules TEXT NOT NULL DEFAULT '[]',exception_until INTEGER,expires_at INTEGER,due_at INTEGER,review_reason TEXT NOT NULL DEFAULT '',actor TEXT NOT NULL,updated INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS policy_expiration_queue(project_id TEXT PRIMARY KEY REFERENCES projects(id),due_at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS expiration_next_due ON policy_expiration_queue(due_at,project_id);
 CREATE INDEX IF NOT EXISTS approval_due ON approval_policy(due_at,project_id) WHERE due_at IS NOT NULL;
 CREATE TABLE IF NOT EXISTS archived_projects(project_id TEXT PRIMARY KEY REFERENCES projects(id),reason TEXT NOT NULL,archived_at INTEGER,actor TEXT NOT NULL,run_id TEXT,approval_date TEXT,expires_at INTEGER);
 CREATE INDEX IF NOT EXISTS archive_reason_date ON archived_projects(reason,archived_at,project_id);
 CREATE TABLE IF NOT EXISTS archive_events(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,action TEXT NOT NULL,actor TEXT NOT NULL,created INTEGER NOT NULL,detail TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS archive_event_project ON archive_events(project_id,created);
 CREATE TABLE IF NOT EXISTS expiration_cleanups(id TEXT PRIMARY KEY,created INTEGER NOT NULL,actor TEXT NOT NULL,backup TEXT NOT NULL,statistics TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS archive_operations(id TEXT PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,scope TEXT NOT NULL,status TEXT NOT NULL,created INTEGER NOT NULL,updated INTEGER NOT NULL,expires INTEGER NOT NULL,owner TEXT,selected INTEGER NOT NULL DEFAULT 0,eligible INTEGER NOT NULL DEFAULT 0,done INTEGER NOT NULL DEFAULT 0,blocked INTEGER NOT NULL DEFAULT 0,error TEXT);
 CREATE TABLE IF NOT EXISTS archive_operation_items(operation_id TEXT NOT NULL REFERENCES archive_operations(id),project_id TEXT NOT NULL,snapshot TEXT NOT NULL,status TEXT NOT NULL,reason TEXT NOT NULL DEFAULT '',PRIMARY KEY(operation_id,project_id));
 CREATE INDEX IF NOT EXISTS archive_operation_queue ON archive_operation_items(operation_id,status,project_id);
 CREATE TABLE IF NOT EXISTS permanent_deletion_audit(operation_id TEXT PRIMARY KEY,actor TEXT NOT NULL,started INTEGER NOT NULL,finished INTEGER,record_count INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS deleted_project_ids(project_id TEXT PRIMARY KEY,operation_id TEXT NOT NULL,deleted INTEGER NOT NULL,source_keys TEXT NOT NULL);
 CREATE VIEW IF NOT EXISTS project_profiles AS SELECT p.id,p.rowid AS rowid,coalesce(o.data,p.data) AS data,coalesce(o.revision,p.revision) AS revision FROM projects p LEFT JOIN project_overrides o ON o.project_id=p.id;
 CREATE VIEW IF NOT EXISTS archived_inventory AS SELECT p.*,coalesce(a.reason,CASE WHEN json_extract(p.data,'$.archived')=1 THEN 'manual' WHEN json_extract(p.data,'$.evidenceType')='permit' AND json_extract(p.data,'$.jurisdiction')='NC DEQ construction stormwater' AND NOT EXISTS(SELECT 1 FROM community_verifications v WHERE v.project_id=p.id) THEN 'supporting_permit_only' ELSE 'approved_expired' END) AS archive_reason,a.archived_at,a.actor AS archive_actor,a.run_id FROM project_profiles p LEFT JOIN archived_projects a ON a.project_id=p.id LEFT JOIN approval_policy l ON l.project_id=p.id WHERE a.project_id IS NOT NULL OR json_extract(p.data,'$.archived')=1 OR (json_extract(p.data,'$.status')='Approved' AND json_extract(p.data,'$.evidenceType')='permit' AND json_extract(p.data,'$.jurisdiction')='NC DEQ construction stormwater' AND NOT EXISTS(SELECT 1 FROM community_verifications v WHERE v.project_id=p.id)) OR (json_extract(p.data,'$.status')='Approved' AND l.due_at<=bw_now());
 INSERT OR IGNORE INTO archived_projects(project_id,reason,archived_at,actor) SELECT id,'legacy_archived',NULL,'migration:legacy-archive' FROM project_profiles WHERE json_extract(data,'$.archived')=1;
 `);}
/** Bounded materialization on ordinary requests, never a scheduled task. Views exclude any remainder immediately. */
export function enforceExpiration(db:DatabaseSync,now=Date.now(),limit=500,actor='policy:approved-365-days',runId:string|null=null){
 const rows=db.prepare(`SELECT p.id,l.approval_date,l.expires_at FROM policy_expiration_queue q JOIN approval_policy l ON l.project_id=q.project_id JOIN project_profiles p ON p.id=q.project_id WHERE q.due_at<=? AND json_extract(p.data,'$.status')='Approved' AND NOT EXISTS(SELECT 1 FROM archived_projects a WHERE a.project_id=p.id) ORDER BY q.due_at,p.id LIMIT ?`).all(now,limit) as any[];
 if(!rows.length)return 0;
 db.exec('SAVEPOINT expiration_policy');try{for(const r of rows){db.prepare('INSERT OR IGNORE INTO archived_projects VALUES(?,?,?,?,?,?,?)').run(r.id,'approved_expired',now,actor,runId,r.approval_date,r.expires_at);db.prepare('INSERT INTO archive_events VALUES(?,?,?,?,?,?)').run(randomUUID(),r.id,'archived',actor,now,JSON.stringify({reason:'approved_expired',approvalDate:r.approval_date,expiresAt:r.expires_at,runId}));}db.exec('RELEASE expiration_policy');return rows.length;}catch(e){db.exec('ROLLBACK TO expiration_policy; RELEASE expiration_policy');throw e;}
}

export function enforcePermitOnly(db:DatabaseSync,now=Date.now(),limit=500,actor='policy:stormwater-supporting-only',runId:string|null=null){
 const rows=db.prepare('SELECT project_id FROM policy_permit_queue ORDER BY project_id LIMIT ?').all(limit) as {project_id:string}[];if(!rows.length)return 0;
 db.exec('SAVEPOINT permit_visibility');try{for(const r of rows){db.prepare("INSERT OR IGNORE INTO archived_projects(project_id,reason,archived_at,actor,run_id) VALUES(?,'supporting_permit_only',?,?,?)").run(r.project_id,now,actor,runId);db.prepare('INSERT INTO archive_events VALUES(?,?,?,?,?,?)').run(randomUUID(),r.project_id,'archived',actor,now,JSON.stringify({reason:'supporting_permit_only',runId}));}db.exec('RELEASE permit_visibility');return rows.length;}catch(e){db.exec('ROLLBACK TO permit_visibility; RELEASE permit_visibility');throw e;}
}
