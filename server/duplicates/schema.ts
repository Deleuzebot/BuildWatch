import type {DatabaseSync} from 'node:sqlite';
export function initializeDuplicateSchema(db:DatabaseSync){db.exec(`
 CREATE TABLE IF NOT EXISTS supporting_sources(id TEXT PRIMARY KEY,data TEXT NOT NULL,issuer TEXT NOT NULL,external_id TEXT NOT NULL,source_url TEXT NOT NULL,observed_at INTEGER NOT NULL,UNIQUE(issuer,external_id));
 CREATE VIEW IF NOT EXISTS review_records AS SELECT id,data FROM projects UNION ALL SELECT s.id,s.data FROM supporting_sources s WHERE NOT EXISTS(SELECT 1 FROM projects p WHERE p.id=s.id);
 CREATE TABLE IF NOT EXISTS duplicate_candidates(id TEXT PRIMARY KEY,a_id TEXT NOT NULL,b_id TEXT NOT NULL,group_id TEXT NOT NULL,reasons TEXT NOT NULL,metadata TEXT NOT NULL,evidence_hash TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','merged','linked','distinct','skipped')),revision INTEGER NOT NULL DEFAULT 1,detected_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,UNIQUE(a_id,b_id));
 CREATE INDEX IF NOT EXISTS duplicate_queue ON duplicate_candidates(status,group_id,updated_at);
 CREATE INDEX IF NOT EXISTS duplicate_groups ON duplicate_candidates(group_id);
 CREATE TABLE IF NOT EXISTS duplicate_group_members(group_id TEXT NOT NULL,project_id TEXT NOT NULL,PRIMARY KEY(group_id,project_id));
 CREATE INDEX IF NOT EXISTS duplicate_member_project ON duplicate_group_members(project_id);
 CREATE TABLE IF NOT EXISTS duplicate_decisions(id TEXT PRIMARY KEY,candidate_id TEXT NOT NULL REFERENCES duplicate_candidates(id),action TEXT NOT NULL,actor TEXT NOT NULL,created INTEGER NOT NULL,note TEXT NOT NULL,before_state TEXT,after_state TEXT,undoes_id TEXT UNIQUE REFERENCES duplicate_decisions(id));
 CREATE INDEX IF NOT EXISTS duplicate_audit ON duplicate_decisions(candidate_id,created);
 CREATE TABLE IF NOT EXISTS project_relationships(source_id TEXT PRIMARY KEY,target_id TEXT NOT NULL REFERENCES projects(id),kind TEXT NOT NULL CHECK(kind IN ('merge','supporting')),decision_id TEXT NOT NULL REFERENCES duplicate_decisions(id),created INTEGER NOT NULL,CHECK(source_id<>target_id));
 CREATE INDEX IF NOT EXISTS project_relationship_target ON project_relationships(target_id);
 CREATE TABLE IF NOT EXISTS project_overrides(project_id TEXT PRIMARY KEY REFERENCES projects(id),data TEXT NOT NULL,revision INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS duplicate_previews(token TEXT PRIMARY KEY,actor TEXT NOT NULL,candidate_id TEXT NOT NULL REFERENCES duplicate_candidates(id),input TEXT NOT NULL,signature TEXT NOT NULL,expires INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS classification_review_candidates(project_id TEXT PRIMARY KEY REFERENCES projects(id),reason TEXT NOT NULL,original_hash TEXT NOT NULL,original_revision INTEGER NOT NULL,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS notification_meeting_refs(notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,project_id TEXT NOT NULL,meeting_id TEXT NOT NULL,starts_at TEXT NOT NULL,PRIMARY KEY(notification_id,project_id,meeting_id,starts_at));
 CREATE INDEX IF NOT EXISTS notification_meeting_identity ON notification_meeting_refs(project_id,meeting_id,starts_at);
 CREATE VIEW IF NOT EXISTS public_projects AS SELECT p.rowid AS rowid,p.id,coalesce(o.data,p.data) AS data,coalesce(o.revision,p.revision) AS revision FROM projects p LEFT JOIN project_overrides o ON o.project_id=p.id WHERE NOT EXISTS(SELECT 1 FROM project_relationships r WHERE r.source_id=p.id);
 `);}
