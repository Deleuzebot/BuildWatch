import type{DatabaseSync}from'node:sqlite';
export function initializeAutomationSchema(db:DatabaseSync){db.exec(`
 CREATE TABLE IF NOT EXISTS automation_settings(id INTEGER PRIMARY KEY CHECK(id=1),paused INTEGER NOT NULL DEFAULT 1,updated INTEGER NOT NULL DEFAULT 0);
 INSERT OR IGNORE INTO automation_settings VALUES(1,1,0);
 CREATE TABLE IF NOT EXISTS automation_jobs(id TEXT PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('monday','friday')),request_key TEXT UNIQUE NOT NULL,status TEXT NOT NULL,actor TEXT NOT NULL,created INTEGER NOT NULL,started INTEGER,finished INTEGER,owner TEXT,lease_until INTEGER NOT NULL DEFAULT 0,checkpoint TEXT NOT NULL DEFAULT '{}',stats TEXT NOT NULL DEFAULT '{}',error TEXT,attempts INTEGER NOT NULL DEFAULT 0);
 CREATE INDEX IF NOT EXISTS automation_queue ON automation_jobs(status,created);
 CREATE TABLE IF NOT EXISTS automation_lease(id INTEGER PRIMARY KEY CHECK(id=1),owner TEXT,expires INTEGER NOT NULL DEFAULT 0);
 INSERT OR IGNORE INTO automation_lease VALUES(1,NULL,0);
 CREATE TABLE IF NOT EXISTS automation_worker(id INTEGER PRIMARY KEY CHECK(id=1),heartbeat INTEGER NOT NULL,version TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS automation_controls(id TEXT PRIMARY KEY,enabled INTEGER NOT NULL DEFAULT 1,last_success INTEGER,last_error TEXT);
 CREATE TABLE IF NOT EXISTS source_observations(id TEXT PRIMARY KEY,source_id TEXT NOT NULL,external_id TEXT NOT NULL,url TEXT NOT NULL,payload TEXT NOT NULL,normalized TEXT NOT NULL,observed_at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS observation_identity ON source_observations(source_id,external_id,observed_at);
 CREATE TABLE IF NOT EXISTS source_bindings(source_id TEXT NOT NULL,external_id TEXT NOT NULL,record_id TEXT NOT NULL,project_id TEXT,classification TEXT NOT NULL,observation_id TEXT NOT NULL,last_checked INTEGER,last_success INTEGER,PRIMARY KEY(source_id,external_id));
 CREATE INDEX IF NOT EXISTS binding_project ON source_bindings(project_id);
 CREATE TABLE IF NOT EXISTS automation_reviews(id TEXT PRIMARY KEY,issue_key TEXT UNIQUE NOT NULL,project_id TEXT,record_id TEXT,source_id TEXT,reason TEXT NOT NULL,evidence_id TEXT,status TEXT NOT NULL DEFAULT 'pending',created INTEGER NOT NULL,updated INTEGER NOT NULL,reviewer TEXT);
 CREATE INDEX IF NOT EXISTS automation_review_queue ON automation_reviews(status,updated);
 CREATE TABLE IF NOT EXISTS automation_outcomes(run_id TEXT NOT NULL REFERENCES automation_jobs(id),item_key TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(run_id,item_key));
 CREATE TABLE IF NOT EXISTS automation_changes(id TEXT PRIMARY KEY,run_id TEXT NOT NULL,project_id TEXT NOT NULL,evidence_id TEXT NOT NULL,kind TEXT NOT NULL,before_data TEXT,after_data TEXT NOT NULL,created INTEGER NOT NULL,UNIQUE(run_id,project_id,evidence_id,kind));
 CREATE TABLE IF NOT EXISTS project_retirements(project_id TEXT PRIMARY KEY REFERENCES projects(id),status TEXT NOT NULL CHECK(status IN ('Completed','Cancelled')),evidence_id TEXT NOT NULL,source_keys TEXT NOT NULL,created INTEGER NOT NULL,latitude REAL,longitude REAL,name TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS retirement_location ON project_retirements(latitude,longitude);
 CREATE TABLE IF NOT EXISTS automation_project_policy(project_id TEXT PRIMARY KEY REFERENCES projects(id),classification TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS source_http_cache(url TEXT PRIMARY KEY,etag TEXT,last_modified TEXT,body TEXT NOT NULL,checked INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS automation_audit(id TEXT PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,detail TEXT NOT NULL,created INTEGER NOT NULL);
 `);}
