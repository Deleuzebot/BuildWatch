import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, existsSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { initializeMapIndex } from '../map/index';
import type { Project } from "../../src/data/projects";
import { northCarolinaProjects as sample } from "../../src/data/northCarolina";
import type { Account, Preferences, Role } from "../../src/account/types";
export const defaultPreferences: Preferences = {
  enabled: true,
  updates: true,
  meetings: true,
  reminders: true,
};
export class Store {
  db: DatabaseSync;
  constructor(file: string, legacy?: string) {
    mkdirSync(dirname(file), { recursive: true });
    chmodSync(dirname(file), 0o700);
    this.db = new DatabaseSync(file);
    chmodSync(file, 0o600);
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
   CREATE TABLE IF NOT EXISTS revoked_subjects(subject TEXT PRIMARY KEY);
   CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,subject TEXT UNIQUE NOT NULL,email TEXT NOT NULL,name TEXT NOT NULL,verified INTEGER NOT NULL,role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','collaborator','admin')),disabled INTEGER NOT NULL DEFAULT 0,preferences TEXT NOT NULL,created INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,data TEXT NOT NULL,revision INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS entitlements(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL DEFAULT 0,store TEXT NOT NULL DEFAULT '',management_url TEXT,synced INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE IF NOT EXISTS follows(user_id TEXT REFERENCES users(id) ON DELETE CASCADE,project_id TEXT REFERENCES projects(id),rank INTEGER NOT NULL,PRIMARY KEY(user_id,project_id));
   CREATE TABLE IF NOT EXISTS follow_history(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,project_id TEXT,action TEXT,created INTEGER);
   CREATE TABLE IF NOT EXISTS history(id TEXT PRIMARY KEY,project_id TEXT REFERENCES projects(id),actor TEXT,before_data TEXT,after_data TEXT NOT NULL,created INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS invitations(hash TEXT PRIMARY KEY,email TEXT NOT NULL,expires INTEGER NOT NULL,accepted TEXT,created_by TEXT NOT NULL,created INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS submissions(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE SET NULL,kind TEXT NOT NULL,project_id TEXT,body TEXT NOT NULL,patch TEXT,status TEXT NOT NULL DEFAULT 'pending',reviewer TEXT,created INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,project_id TEXT NOT NULL,kind TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,created INTEGER NOT NULL,read INTEGER NOT NULL DEFAULT 0,event_key TEXT NOT NULL,UNIQUE(user_id,event_key));
   CREATE TABLE IF NOT EXISTS devices(token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE);
   CREATE TABLE IF NOT EXISTS deliveries(notification_id TEXT REFERENCES notifications(id) ON DELETE CASCADE,token TEXT,status TEXT NOT NULL DEFAULT 'pending',ticket TEXT,attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(notification_id,token));
   CREATE TABLE IF NOT EXISTS webhook_events(id TEXT PRIMARY KEY,created INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS role_audit(id TEXT PRIMARY KEY,actor TEXT,target TEXT,action TEXT,created INTEGER);
  `);
    if (!this.one("SELECT value FROM meta WHERE key=?", "projects_migrated"))
      this.tx(() => {
        const projects: Project[] =
          legacy && existsSync(legacy)
            ? JSON.parse(readFileSync(legacy, "utf8"))
            : sample;
        if (!Array.isArray(projects))
          throw new Error("Legacy data is invalid; migration stopped.");
        for (const p of projects)
          this.run(
            "INSERT INTO projects(id,data,revision) VALUES(?,?,?)",
            p.id,
            JSON.stringify({ ...p, revision: p.revision || 1 }),
            p.revision || 1,
          );
        this.run("INSERT INTO meta VALUES(?,?)", "projects_migrated", "1");
      });
    initializeMapIndex(this.db);
  }
  run(sql: string, ...args: any[]) {
    return this.db.prepare(sql).run(...args);
  }
  one(sql: string, ...args: any[]): any {
    return this.db.prepare(sql).get(...args);
  }
  all(sql: string, ...args: any[]): any[] {
    return this.db.prepare(sql).all(...args);
  }
  tx<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  list(): Project[] {
    return this.all('SELECT p.data FROM public_projects p JOIN active_map_index m ON m.id=p.id ORDER BY p.rowid').map(r=>JSON.parse(r.data));
  }
  originalProject(id:string):Project|undefined {
    const row=this.one('SELECT data FROM review_records WHERE id=?',id);return row?JSON.parse(row.data):undefined;
  }
  publicEligible(id:string){return !!this.one('SELECT 1 FROM active_map_index WHERE id=?',this.canonicalId(id));}
  projectProfile(id:string):Project {
    const row=this.one('SELECT data FROM project_overrides WHERE project_id=?',id);const p=row?JSON.parse(row.data):this.originalProject(id);if(!p)throw Object.assign(new Error('Record not found.'),{status:404});return p;
  }
  canonicalId(id:string):string {
    const seen=new Set<string>();let current=id;
    while(true){if(seen.has(current)||seen.size>1000)throw Object.assign(new Error('Invalid project relationship.'),{status:409});seen.add(current);const row=this.one('SELECT target_id FROM project_relationships WHERE source_id=?',current);if(!row)return current;current=row.target_id;}
  }
  componentIds(id:string):string[]{const root=this.canonicalId(id);return[root,...this.all('SELECT source_id FROM project_relationships WHERE target_id=? ORDER BY source_id',root).map(r=>r.source_id)];}
  project(id:string):Project|undefined {
    const root=this.canonicalId(id),row=this.one('SELECT data FROM public_projects WHERE id=?',root);if(!row)return undefined;const p=JSON.parse(row.data);if(this.one('SELECT 1 FROM archived_inventory WHERE id=?',root))p.archived=true;return p;
  }
  user(id: string) {
    return this.one("SELECT * FROM users WHERE id=?", id);
  }
  ensureUser(subject: string, email: string, name: string, verified: boolean) {
    if (
      this.one("SELECT subject FROM revoked_subjects WHERE subject=?", subject)
    )
      throw Object.assign(new Error("This account was deleted."), {
        status: 401,
      });
    const old = this.one("SELECT * FROM users WHERE subject=?", subject);
    if (old) {
      this.run(
        "UPDATE users SET email=?,verified=? WHERE id=?",
        email,
        Number(verified),
        old.id,
      );
      return this.user(old.id);
    }
    const id = randomUUID();
    this.run(
      "INSERT INTO users(id,subject,email,name,verified,preferences,created) VALUES(?,?,?,?,?,?,?)",
      id,
      subject,
      email,
      name,
      Number(verified),
      JSON.stringify(defaultPreferences),
      Date.now(),
    );
    return this.user(id);
  }
  plus(id: string, now = Date.now()) {
    const u = this.user(id);
    return (
      !!u &&
      !u.disabled &&
      (u.role === "admin" ||
        u.role === "collaborator" ||
        (this.one("SELECT expires FROM entitlements WHERE user_id=?", id)
          ?.expires || 0) > now)
    );
  }
  following(id: string) {
    const all = this.all(
      "SELECT f.project_id, p.data FROM follows f JOIN projects p ON p.id=f.project_id WHERE user_id=? ORDER BY rank DESC, f.project_id",
      id,
    );
    const plus = this.plus(id);
    const unique=new Map<string,{projectId:string;name:string;active:boolean;terminal?:string}>();let activeCount=0;
    for(const row of all){const project=this.project(row.project_id);if(project&&!unique.has(project.id)){const terminal=project.archived?'Archived':['Completed','Cancelled'].includes(project.status)?project.status:undefined;unique.set(project.id,{projectId:project.id,name:project.name,active:!terminal&&(plus||activeCount++===0),...(terminal?{terminal}:{})});}}
    return [...unique.values()];
  }
  active(id: string, projectId: string) {
    const canonical=this.canonicalId(projectId);
    return this.following(id).some(p=>p.projectId===canonical&&p.active);
  }

  account(id: string, methods: string[], mfa: boolean): Account {
    const u = this.user(id),
      e = this.one("SELECT * FROM entitlements WHERE user_id=?", id);
    return {
      id,
      email: u.email,
      name: u.name,
      role: u.role as Role,
      verified: !!u.verified,
      preferences: JSON.parse(u.preferences),
      plus: this.plus(id),
      expires: e?.expires || 0,
      store: e?.store || "",
      managementURL: e?.management_url || null,
      methods,
      mfa,
    };
  }
  notify(
    projectId: string,
    kind: keyof Preferences,
    title: string,
    body: string,
    key: string,
    meetingRefs?:{projectId:string;meetingId:string;startsAt:string}[],
    recipients?:Set<string>,
  ) {
    projectId=this.canonicalId(projectId);
    const ids=this.componentIds(projectId);
    for (const row of this.all(`SELECT DISTINCT user_id FROM follows WHERE project_id IN (${ids.map(()=>'?').join(',')})`,...ids)) {
      const user = this.user(row.user_id);
      if (!user || user.disabled || !(recipients?recipients.has(user.id):this.active(user.id, projectId))) continue;
      const prefs: Preferences = JSON.parse(user.preferences);
      if (!prefs.enabled || !prefs[kind]) continue;
      if(meetingRefs?.some(ref=>this.one(`SELECT 1 FROM notifications n WHERE n.user_id=? AND (n.event_key=? OR EXISTS(SELECT 1 FROM notification_meeting_refs r WHERE r.notification_id=n.id AND r.project_id=? AND r.meeting_id=? AND r.starts_at=?))`,user.id,`reminder:${ref.projectId}:${ref.meetingId}:${ref.startsAt}`,ref.projectId,ref.meetingId,ref.startsAt)))continue;
      const id = randomUUID();
      const result = this.run(
        "INSERT OR IGNORE INTO notifications(id,user_id,project_id,kind,title,body,created,event_key) VALUES(?,?,?,?,?,?,?,?)",
        id,
        user.id,
        projectId,
        kind,
        title,
        body,
        Date.now(),
        key,
      );
      if(result.changes&&meetingRefs)for(const ref of meetingRefs)this.run('INSERT OR IGNORE INTO notification_meeting_refs VALUES(?,?,?,?)',id,ref.projectId,ref.meetingId,ref.startsAt);
      if (result.changes)
        for (const device of this.all(
          "SELECT token FROM devices WHERE user_id=?",
          user.id,
        ))
          this.run(
            "INSERT OR IGNORE INTO deliveries(notification_id,token) VALUES(?,?)",
            id,
            device.token,
          );
    }
  }
  publish(project: Project, actor: string, onCommit?: () => void) {
    // Derived public labels must not become new municipal evidence on status-only edits.
    if(project.classification){const {primaryCategory,secondaryCategories,subtype,classification,originalCategory,originalMunicipalCategory,...source}=project;project={...source,category:source.category===this.project(project.id)?.category?(originalCategory??source.category):source.category,...(originalMunicipalCategory?{originalMunicipalCategory}:{})};}
    return this.tx(() => {
      if(this.one('SELECT 1 FROM deleted_project_ids WHERE project_id=?',project.id))throw Object.assign(new Error('This project was permanently deleted and cannot be republished from a seed/import.'),{status:409});
      if(this.canonicalId(project.id)!==project.id)throw Object.assign(new Error('This record is linked. Edit its canonical project or undo the relationship first.'),{status:409});
      const old = this.project(project.id);
      if ((project.revision || 0) !== (old?.revision || 0))
        throw Object.assign(
          new Error(
            "Project changed elsewhere. Refresh and reopen the editor.",
          ),
          { status: 409 },
        );
      const saved:Project = { ...project, revision: (old?.revision || 0) + 1,meetings:project.meetings.map(m=>{const {originalMeetings,...value}=m;const original=old?.meetings.find(previous=>previous.id===m.id)?.originalMeetings;return original?{...value,originalMeetings:original}:value;}) };
      const terminalTransition=!!old&&!['Completed','Cancelled'].includes(old.status)&&['Completed','Cancelled'].includes(saved.status);
      const finalRecipients=terminalTransition?new Set(this.all('SELECT DISTINCT user_id FROM follows WHERE project_id IN ('+this.componentIds(project.id).map(()=>'?').join(',')+')',...this.componentIds(project.id)).filter(row=>this.active(row.user_id,project.id)).map(row=>row.user_id)):undefined;
      const related=this.componentIds(project.id).filter(id=>id!==project.id);if(related.length)saved.relatedRecordIds=related;else delete saved.relatedRecordIds;
      if(this.one('SELECT 1 FROM project_overrides WHERE project_id=?',saved.id))this.run('UPDATE project_overrides SET data=?,revision=? WHERE project_id=?',JSON.stringify(saved),saved.revision,saved.id);
      else this.run("INSERT INTO projects VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,revision=excluded.revision",saved.id,JSON.stringify(saved),saved.revision);
      this.run(
        "INSERT INTO history VALUES(?,?,?,?,?,?)",
        randomUUID(),
        saved.id,
        actor,
        old ? JSON.stringify(old) : null,
        JSON.stringify(saved),
        Date.now(),
      );
      if (old) {
        if (
          old.status !== saved.status ||
          old.description !== saved.description ||
          old.name !== saved.name ||
          old.completion !== saved.completion ||
          JSON.stringify(old.sources) !== JSON.stringify(saved.sources)
        )
          this.notify(
            saved.id,
            "updates",
            `${saved.name} updated`,
            `${saved.status} · ${saved.completion}`,
            `update:${saved.id}:${saved.revision}`,undefined,finalRecipients,
          );
        if (JSON.stringify(old.meetings) !== JSON.stringify(saved.meetings))
          this.notify(
            saved.id,
            "meetings",
            `Meetings updated: ${saved.name}`,
            "Open the project for the latest meeting details.",
            `meetings:${saved.id}:${saved.revision}`,
          );
      }
      if(saved.archived)this.run("INSERT OR IGNORE INTO archived_projects(project_id,reason,archived_at,actor) VALUES(?,'manual',?,?)",saved.id,Date.now(),actor);
      if(saved.status!=='Approved')this.run("DELETE FROM archived_projects WHERE project_id=? AND reason='approved_expired'",saved.id);
      onCommit?.();
      return saved;
    });
  }
  reminders(now = Date.now()) {
    // Query only events in the reminder window; never decode the whole project catalog.
    const rows=this.all(`SELECT m.id,json_extract(p.data,'$.name') AS name,mm.data AS meeting
      FROM map_meetings mm JOIN active_map_index m ON m.rid=mm.project_rid JOIN public_projects p ON p.rowid=m.rid
      WHERE mm.starts>? AND mm.starts<=?`,now,now+86400000) as {id:string;name:string;meeting:string}[];
    for(const p of rows){const m=JSON.parse(p.meeting);
      this.notify(p.id,'reminders',`Meeting reminder: ${p.name}`,`${m.title} · ${m.startsAt}`,`reminder:${p.id}:${m.id}:${m.startsAt}`,(m.originalMeetings||[{projectId:p.id,meetingId:m.id}]).map((ref:any)=>ref.startsAt&&Date.parse(ref.startsAt)!==Date.parse(m.startsAt)?{projectId:p.id,meetingId:m.id,startsAt:m.startsAt}:{...ref,startsAt:ref.startsAt||m.startsAt}));
    }
  }
  mergeIdentity(primaryId: string, secondaryId: string) {
    return this.tx(() => {
      const primary = this.user(primaryId),
        secondary = this.user(secondaryId);
      if (
        !primary ||
        !secondary ||
        secondary.disabled ||
        secondary.role !== "user" ||
        this.one(
          "SELECT user_id FROM entitlements WHERE user_id=?",
          secondaryId,
        )
      )
        throw Object.assign(
          new Error("This account needs an operator-reviewed transfer."),
          { status: 409 },
        );
      const low =
        this.one(
          "SELECT MIN(rank) AS rank FROM follows WHERE user_id=?",
          primaryId,
        )?.rank || 0;
      const high =
        this.one(
          "SELECT MAX(rank) AS rank FROM follows WHERE user_id=?",
          secondaryId,
        )?.rank || 0;
      this.run(
        "INSERT OR IGNORE INTO follows(user_id,project_id,rank) SELECT ?,project_id,rank+? FROM follows WHERE user_id=?",
        primaryId,
        low - high - 1,
        secondaryId,
      );
      for (const table of ["follow_history", "submissions", "devices"])
        this.run(
          `UPDATE ${table} SET user_id=? WHERE user_id=?`,
          primaryId,
          secondaryId,
        );
      this.run(
        "UPDATE notifications SET user_id=?,event_key=?||event_key WHERE user_id=?",
        primaryId,
        `linked:${secondaryId}:`,
        secondaryId,
      );
      this.run(
        "UPDATE history SET actor=? WHERE actor=?",
        primaryId,
        secondaryId,
      );
      const a = JSON.parse(primary.preferences),
        b = JSON.parse(secondary.preferences);
      for (const key of Object.keys(defaultPreferences))
        a[key] = a[key] && b[key];
      this.run(
        "UPDATE users SET preferences=? WHERE id=?",
        JSON.stringify(a),
        primaryId,
      );
      this.run(
        "INSERT OR IGNORE INTO revoked_subjects VALUES(?)",
        secondary.subject,
      );
      this.run(
        "INSERT INTO role_audit VALUES(?,?,?,?,?)",
        randomUUID(),
        primaryId,
        secondaryId,
        "Explicitly authenticated identity linking",
        Date.now(),
      );
      this.run("DELETE FROM users WHERE id=?", secondaryId);
    });
  }
  close() {
    this.db.close();
  }
}
