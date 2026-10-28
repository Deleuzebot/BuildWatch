import {primaryCategories} from '../../src/lib/categories';
import {ArchiveService} from '../archives/service';
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  randomBytes,
  createHash,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { ResearchService } from '../research/service';
import { WebResearch } from '../research/web';
import { DuplicateService } from '../duplicates/service';
import { Store } from "./store";
import { Identity, Verify, management } from "./auth";
import { syncBilling } from "./billing";
import { validateProject } from "../../src/lib/validate";
import type { Project } from "../../src/data/projects";
import { MapQueries,parseFilters } from '../map/queries';
import { gzipSync } from "node:zlib";
export const fail = (status: number, message: string): never => {
  throw Object.assign(new Error(message), { status });
};
export async function body(req: IncomingMessage) {
  let text = "";
  for await (const chunk of req) {
    text += chunk.toString();
    if (Buffer.byteLength(text) > 128000) fail(413, "Request is too large.");
  }
  try {
    return JSON.parse(text || "{}");
  } catch {
    fail(400, "Invalid JSON.");
  }
}
export function text(value: unknown, max = 8000) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    fail(400, "Required text is missing or too long.");
  return (value as string).trim();
}
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function secureEqual(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export async function authenticate(
  req: IncomingMessage,
  store: Store,
  verify: Verify,
) {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) fail(401, "Please sign in.");
  let identity: Identity;
  try {
    identity = await verify(authorization!.slice(7));
  } catch (e: any) {
    if (e.status === 503) throw e;
    fail(401, "Your sign-in session is invalid or expired.");
  }
  const user = store.ensureUser(
    identity!.subject,
    identity!.email,
    identity!.name,
    identity!.verified,
  );
  if (user.disabled) fail(403, "This account is disabled.");
  return { identity: identity!, user };
}
export function requireEditor(user: any, identity: Identity) {
  if (!user || user.disabled) fail(403, "Account access is unavailable.");
  if (!user.verified) fail(403, "Verify your email first.");
  if (!["admin", "collaborator"].includes(user.role))
    fail(403, "Collaborator access is required.");
  if (user.role === "admin" && !identity.mfa)
    fail(
      403,
      "Administrator access requires multifactor authentication. Sign in again with MFA.",
    );
}
export function requireAdmin(user: any, identity: Identity) {
  requireEditor(user, identity);
  if (user.role !== "admin") fail(403, "Administrator access is required.");
}
export function accountRoutes(store: Store, verify: Verify) {
  const duplicates=new DuplicateService(store);
  const research=new ResearchService(store);
  const webResearch=new WebResearch(store);
  const archives=new ArchiveService(store);
  let publicSnapshot: { key: string; etag: string; raw: Buffer; gzip: Buffer } | undefined;
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    path: string,
  ): Promise<boolean> => {
    const send = (code: number, value: unknown) => {
      res.writeHead(code, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(value));
    };
    const method = req.method;
    if (path === "/api/config" && method === "GET") {
      const auth = !!(process.env.AUTH0_ISSUER && process.env.AUTH0_AUDIENCE);
      send(200, {
        auth,
        billing:
          !!process.env.REVENUECAT_SECRET_KEY &&
          process.env.BILLING_ENABLED === "true",
        push: process.env.PUSH_DELIVERY_ENABLED === "true",
        linking: !!process.env.AUTH0_MANAGEMENT_CLIENT_SECRET,
        deletion: !!process.env.AUTH0_MANAGEMENT_CLIENT_SECRET,
        privacyURL: process.env.PRIVACY_URL || null,
        termsURL: process.env.TERMS_URL || null,
      });
      return true;
    }
    if (path === "/api/webhooks/revenuecat" && method === "POST") {
      const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
      if (
        !secret ||
        !secureEqual(req.headers.authorization || "", `Bearer ${secret}`)
      )
        fail(401, "Invalid webhook authorization.");
      const input = await body(req),
        event = input.event;
      const eventId = text(event?.id, 200);
      if (store.one("SELECT id FROM webhook_events WHERE id=?", eventId)) {
        send(200, { received: true });
        return true;
      }
      const ids = [
        event.app_user_id,
        event.original_app_user_id,
        ...(Array.isArray(event.transferred_from)
          ? event.transferred_from
          : []),
        ...(Array.isArray(event.transferred_to) ? event.transferred_to : []),
      ].filter((id) => typeof id === "string");
      for (const id of new Set(ids))
        if (store.user(id)) await syncBilling(store, id);
      store.run(
        "INSERT OR IGNORE INTO webhook_events VALUES(?,?)",
        eventId,
        Date.now(),
      );
      send(200, { received: true });
      return true;
    }
    if (path === "/api/projects" && method === "GET") {
      if(Number(store.one('SELECT count(*) AS n FROM map_index')?.n)>20000)fail(413,'This catalog requires the paginated map API. Update the app to use /api/catalog, /api/map and /api/browse.');
      const key=JSON.stringify(store.one('SELECT version FROM map_meta WHERE id=1'));
      if (publicSnapshot?.key !== key) {
        const raw = Buffer.from(JSON.stringify(store.list()));
        publicSnapshot = { key, etag: `W/"${createHash('sha256').update(raw).digest('hex')}"`, raw, gzip: gzipSync(raw) };
      }
      const snapshot = publicSnapshot!;
      res.setHeader("ETag", snapshot.etag);
      res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
      res.setHeader("Vary", "Origin, Accept-Encoding");
      res.setHeader("Access-Control-Expose-Headers", "ETag");
      if (req.headers['if-none-match']?.split(',').map(s => s.trim()).includes(snapshot.etag)) {
        res.writeHead(304); res.end(); return true;
      }
      const gzip = (req.headers['accept-encoding'] || '').split(',').some(v => {
        const [name, ...params] = v.trim().split(';');
        const quality = params.find(p => p.trim().startsWith('q='));
        return name === 'gzip' && (!quality || Number(quality.trim().slice(2)) > 0);
      });
      res.setHeader("Content-Type", "application/json");
      if (gzip) res.setHeader("Content-Encoding", "gzip");
      res.writeHead(200); res.end(gzip ? snapshot.gzip : snapshot.raw);
      return true;
    }
    if (!path.startsWith("/api/")) return false;
    const { user, identity } = await authenticate(req, store, verify);
    if (path === "/api/me" && method === "GET") {
      send(200, store.account(user.id, identity.methods, identity.mfa));
      return true;
    }
    if (path === "/api/me" && method === "PATCH") {
      const input = await body(req);
      const name = input.name === undefined ? user.name : text(input.name, 100);
      let prefs = JSON.parse(user.preferences);
      if (input.preferences) {
        for (const k of ["enabled", "updates", "meetings", "reminders"]) {
          if (typeof input.preferences[k] !== "boolean")
            fail(400, "Notification preferences must be boolean values.");
        }
        prefs = {
          enabled: input.preferences.enabled,
          updates: input.preferences.updates,
          meetings: input.preferences.meetings,
          reminders: input.preferences.reminders,
        };
      }
      store.run(
        "UPDATE users SET name=?,preferences=? WHERE id=?",
        name,
        JSON.stringify(prefs),
        user.id,
      );
      send(200, store.account(user.id, identity.methods, identity.mfa));
      return true;
    }
    if (path === "/api/me" && method === "DELETE") {
      const input = await body(req);
      if (input.confirm !== "DELETE")
        fail(400, "Type DELETE to confirm account deletion.");
      if (Date.now() - identity.authenticatedAt > 300000)
        fail(403, "Sign in again before deleting your account.");
      if (user.role === "admin")
        fail(
          409,
          "The sole administrator cannot be deleted. Transfer ownership with the server operator first.",
        );
      // Disable before the external deletion; interrupted deletion is safe to retry from operations.
      store.run("UPDATE users SET disabled=1 WHERE id=?", user.id);
      try {
        await management(`users/${encodeURIComponent(user.subject)}`, "DELETE");
      } catch (e) {
        store.run("UPDATE users SET disabled=0 WHERE id=?", user.id);
        throw e;
      }
      store.tx(() => {
        store.run(
          "INSERT OR IGNORE INTO revoked_subjects VALUES(?)",
          user.subject,
        );
        store.run("DELETE FROM submissions WHERE user_id=?", user.id);
        store.run(
          "UPDATE history SET actor=? WHERE actor=?",
          "Deleted account",
          user.id,
        );
        store.run("DELETE FROM users WHERE id=?", user.id);
      });
      send(200, { deleted: true });
      return true;
    }
    if (path === "/api/account/password" && method === "POST") {
      const issuer = process.env.AUTH0_ISSUER?.replace(/\/$/, "");
      const client = process.env.AUTH0_PASSWORD_CLIENT_ID;
      if (!issuer || !client)
        fail(503, "Password recovery email is not configured.");
      if (!identity.methods.includes("auth0"))
        fail(400, "This account uses a social sign-in provider.");
      const response = await fetch(`${issuer}/dbconnections/change_password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: client,
          email: user.email,
          connection:
            process.env.AUTH0_EMAIL_CONNECTION ||
            "Username-Password-Authentication",
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok)
        fail(502, "The identity provider could not send a password reset.");
      send(200, { sent: true });
      return true;
    }
    if (path === "/api/account/link" && method === "POST") {
      if (Date.now() - identity.authenticatedAt > 300000)
        fail(403, "Sign in again before linking another account.");
      const input = await body(req);
      const second = await verify(text(input.secondaryToken, 16000));
      if (
        !identity.verified ||
        !second.verified ||
        Date.now() - second.authenticatedAt > 300000
      )
        fail(403, "Both accounts need recent sign-in and verified email.");
      if (second.subject === identity.subject)
        fail(400, "That method already belongs to this account.");
      const secondary = store.one(
        "SELECT * FROM users WHERE subject=?",
        second.subject,
      );
      if (user.role === "admin") requireAdmin(store.user(user.id), identity);
      if (
        secondary &&
        (secondary.disabled ||
          secondary.role !== "user" ||
          store.one(
            "SELECT user_id FROM entitlements WHERE user_id=?",
            secondary.id,
          ))
      )
        fail(
          409,
          "The other account has billing history or elevated permissions. Contact support for a reviewed transfer.",
        );
      const split = second.subject.indexOf("|");
      if (split < 1) fail(400, "Unsupported identity.");
      await management(
        `users/${encodeURIComponent(identity.subject)}/identities`,
        "POST",
        {
          provider: second.subject.slice(0, split),
          user_id: second.subject.slice(split + 1),
        },
      );

      const currentSecondary = store.one(
        "SELECT * FROM users WHERE subject=?",
        second.subject,
      );
      if (currentSecondary) store.mergeIdentity(user.id, currentSecondary.id);
      else
        store.run(
          "INSERT OR IGNORE INTO revoked_subjects VALUES(?)",
          second.subject,
        );
      send(200, { linked: true });
      return true;
    }
    if (path === "/api/follows" && method === "GET") {
      send(200, store.following(user.id));
      return true;
    }
    const follow = path.match(
      /^\/api\/follows\/([a-zA-Z0-9-]{1,80})(\/activate)?$/,
    );
    if (follow && ["PUT", "DELETE", "POST"].includes(method || "")) {
      const projectId=store.canonicalId(follow[1]);
      const relatedIds=store.componentIds(projectId);
      if (!store.project(projectId)) fail(404, "Project not found.");
      if(method!=='DELETE'&&!store.publicEligible(projectId))fail(409,'This development is completed, cancelled or unavailable for active tracking.');
      store.tx(() => {
        if (method === "DELETE") {
          store.run(
            `DELETE FROM follows WHERE user_id=? AND project_id IN (${relatedIds.map(()=>'?').join(',')})`,
            user.id,...relatedIds,
          );
          store.run(
            "INSERT INTO follow_history VALUES(?,?,?,?,?)",
            randomUUID(),
            user.id,
            projectId,
            "unfollow",
            Date.now(),
          );
          return;
        }
        const old = store.one(
          `SELECT MAX(rank) AS rank FROM follows WHERE user_id=? AND project_id IN (${relatedIds.map(()=>'?').join(',')}) HAVING count(*)>0`,user.id,...relatedIds,
        );
        if (follow[2]) {
          if (!old) fail(404, "Follow this project first.");
        } else if (
          !old &&
          !store.plus(user.id) &&
          store.following(user.id).filter(p=>!p.terminal).length >= 1
        )
          fail(
            402,
            "BuildWatch Plus is required to follow more than one development.",
          );
        const rank =
          (store.one(
            "SELECT MAX(rank) AS rank FROM follows WHERE user_id=?",
            user.id,
          )?.rank || 0) + 1;
        store.run(
          "INSERT INTO follows VALUES(?,?,?) ON CONFLICT(user_id,project_id) DO UPDATE SET rank=excluded.rank",
          user.id,
          projectId,
          rank,
        );
        store.run(
          "INSERT INTO follow_history VALUES(?,?,?,?,?)",
          randomUUID(),
          user.id,
          projectId,
          follow[2] ? "activate" : "follow",
          Date.now(),
        );
      });
      send(200, store.following(user.id));
      return true;
    }
    if (path === "/api/billing/sync" && method === "POST") {
      await syncBilling(store, user.id);
      send(200, store.account(user.id, identity.methods, identity.mfa));
      return true;
    }
    if (path === "/api/notifications" && method === "GET") {
      send(
        200,
        store.all(
          "SELECT id,project_id AS projectId,title,body,created,read FROM notifications WHERE user_id=? ORDER BY created DESC LIMIT 200",
          user.id,
        ),
      );
      return true;
    }
    if (path === "/api/notifications/read" && method === "POST") {
      store.run("UPDATE notifications SET read=1 WHERE user_id=?", user.id);
      send(200, { ok: true });
      return true;
    }
    if (path === "/api/devices" && method === "POST") {
      if (process.env.PUSH_DELIVERY_ENABLED !== "true")
        fail(
          503,
          "Device push delivery has not been activated. In-app notifications remain available.",
        );
      const input = await body(req),
        token = text(input.token, 200);
      if (!/^(ExponentPushToken|ExpoPushToken)\[[a-zA-Z0-9_-]+\]$/.test(token))
        fail(400, "Invalid device push token.");
      store.run(
        "INSERT INTO devices VALUES(?,?) ON CONFLICT(token) DO UPDATE SET user_id=excluded.user_id",
        token,
        user.id,
      );
      send(200, { ok: true });
      return true;
    }
    if (path === "/api/devices" && method === "DELETE") {
      const input = await body(req);
      store.run(
        "DELETE FROM devices WHERE token=? AND user_id=?",
        text(input.token, 200),
        user.id,
      );
      send(200, { ok: true });
      return true;
    }
    if (path === "/api/submissions" && method === "POST") {
      if (!user.verified) fail(403, "Verify your email before submitting.");
      const input = await body(req);
      if (
        !["correction", "support", "bug", "feature", "question"].includes(
          input.kind,
        )
      )
        fail(400, "Choose a valid feedback type.");
      const message = text(input.body);
      let patch = null;
      if (input.kind === "correction") {
        const current = store.project(text(input.projectId, 80));
        if (!current) fail(404, "Project not found.");
        if (input.patch) {
          const allowed = [
            "name",
            "description",
            "status",
            "address",
            "neighborhood",
            "category",
            "developer",
            "homes",
            "completion",
            "latitude",
            "longitude",
            "meetings",
            "sources",
          ];
          const keys = Object.keys(input.patch);
          if (keys.some((k) => !allowed.includes(k)))
            fail(400, "Invalid correction fields.");
          const issue = validateProject({ ...current, ...input.patch });
          if (issue) fail(400, issue);
          patch = JSON.stringify(input.patch);
        }
      }
      const id = randomUUID();
      store.run(
        "INSERT INTO submissions(id,user_id,kind,project_id,body,patch,created) VALUES(?,?,?,?,?,?,?)",
        id,
        user.id,
        input.kind,
        input.kind === "correction" ? input.projectId : null,
        message,
        patch,
        Date.now(),
      );
      send(201, { id });
      return true;
    }
    if (path === "/api/invitations/accept" && method === "POST") {
      if (!user.verified) fail(403, "Verify your account email first.");
      const input = await body(req);
      const token = text(input.token, 200);
      store.tx(() => {
        const invitation = store.one(
          "SELECT * FROM invitations WHERE hash=?",
          hash(token),
        );
        if (
          !invitation ||
          invitation.accepted ||
          invitation.expires <= Date.now()
        )
          fail(400, "Invitation is expired or already used.");
        if (invitation.email !== user.email.toLowerCase())
          fail(
            403,
            "Sign in with the verified email address named in this invitation.",
          );
        store.run(
          "UPDATE invitations SET accepted=? WHERE hash=?",
          user.id,
          hash(token),
        );
        if (user.role === "user")
          store.run("UPDATE users SET role='collaborator' WHERE id=?", user.id);
        store.run(
          "INSERT INTO role_audit VALUES(?,?,?,?,?)",
          randomUUID(),
          user.id,
          user.id,
          "invitation accepted",
          Date.now(),
        );
      });
      send(200, store.account(user.id, identity.methods, identity.mfa));
      return true;
    }
    if (path === "/api/management/map" && method === "GET") {
      requireEditor(user, identity);
      const params=new URL(req.url||'/', 'http://localhost').searchParams;
      if(params.get('paged')==='1'){
        const cursor=Number(params.get('cursor')||0),q=new MapQueries(store.db);
        const page=q.browse(parseFilters(params),cursor,50);
        send(200,{...page,items:page.items.map(p=>store.project(p.id))});
      }else{
        if(Number(store.one('SELECT count(*) AS n FROM map_index')?.n)>20000)fail(413,'Use the paged management endpoint.');
        send(200, store.list());
      }
      return true;
    }
    if (path === "/api/management/projects" && method === "GET") {
      requireEditor(user, identity);
      const ids = store
        .all("SELECT DISTINCT project_id FROM history WHERE actor=?", user.id)
        .map((r) => r.project_id);
      send(
        200,
        [...new Map(ids.map(id=>store.project(id)).filter((p):p is Project=>!!p&&!p.archived).map(p=>[p.id,p])).values()],
      );
      return true;
    }
    const project = path.match(
      /^\/api\/projects\/([a-zA-Z0-9-]{1,80})(\/history)?$/,
    );
    if (project && method === "GET" && project[2]) {
      requireEditor(user, identity);
      send(
        200,
        store.all(
          `SELECT * FROM history WHERE project_id IN (${store.componentIds(project[1]).map(()=>'?').join(',')}) ORDER BY created DESC LIMIT 200`,
          ...store.componentIds(project[1]),
        ),
      );
      return true;
    }
    if (project && method === "PUT" && !project[2]) {
      requireEditor(user, identity);
      const input = await body(req);
      input.id = project[1];
      const issue = validateProject(input);
      if (issue) fail(400, issue);
      requireEditor(store.user(user.id), identity);
      send(200, store.publish(input, user.id));
      return true;
    }
    if (path.startsWith("/api/admin/")) {
      requireAdmin(store.user(user.id), identity);
      const params=new URL(req.url||'/', 'http://localhost').searchParams;
      if(path==='/api/admin/archives'&&method==='GET'){send(200,archives.list(params));return true;}
      if(path==='/api/admin/archives/preview'&&method==='POST'){const input=await body(req);requireAdmin(store.user(user.id),identity);send(200,archives.createPreview(input,user.id));return true;}
      const archiveRecord=path.match(/^\/api\/admin\/archives\/records\/([A-Za-z0-9-]{1,160})$/);
      if(archiveRecord){if(method==='GET'){send(200,archives.detail(archiveRecord[1]));return true;}if(method==='PUT'){const input=await body(req);requireAdmin(store.user(user.id),identity);send(200,archives.setEvidence(archiveRecord[1],input,user.id));return true;}}
      const archiveOp=path.match(/^\/api\/admin\/archives\/operations\/([a-f0-9-]{36})(\/(confirm|cancel|resume))?$/);
      if(archiveOp){if(method==='GET'&&!archiveOp[2]){send(200,archives.operation(archiveOp[1],user.id));return true;}if(method==='POST'){const input=await body(req);requireAdmin(store.user(user.id),identity);const result=archiveOp[3]==='confirm'?archives.confirm(archiveOp[1],input,user.id):archiveOp[3]==='cancel'?archives.cancel(archiveOp[1],user.id):archiveOp[3]==='resume'?archives.resume(archiveOp[1],user.id):fail(400,'Choose an operation action.');send(200,result);return true;}}
      if(path==='/api/admin/research'&&method==='GET'){send(200,{...research.list(params),webResearch:webResearch.summary()});return true;}
      if(path==='/api/admin/research/commit'&&method==='POST'){const input=await body(req);requireAdmin(store.user(user.id),identity);send(200,research.commit(text(input.token,80),user.id));return true;}
      const proposal=path.match(/^\/api\/admin\/research\/([a-f0-9]{64})(\/(preview|decision|duplicate|meeting-target))?$/);
      if(proposal){if(method==='GET'&&!proposal[2]){send(200,research.detail(proposal[1]));return true;}if(method==='POST'){const input=await body(req);requireAdmin(store.user(user.id),identity);if(proposal[3]==='preview')send(200,research.preview(proposal[1],user.id));else if(proposal[3]==='decision')send(200,research.decide(proposal[1],input,user.id));else if(proposal[3]==='meeting-target')send(200,research.associateMeeting(proposal[1],input,user.id));else if(proposal[3]==='duplicate')send(200,research.flagDuplicate(proposal[1],input,user.id));else return false;return true;}}
      if(path==='/api/admin/duplicates'&&method==='GET'){send(200,duplicates.list(params));return true;}
      if(path==='/api/admin/duplicates/candidates'&&method==='POST'){
        const input=await body(req);requireAdmin(store.user(user.id),identity);
        const result=store.tx(()=>{const value=duplicates.register(text(input.a,80),text(input.b,80),[text(input.reason,2000)],{discovery:'manual'},user.id);duplicates.regroup();return value;});send(200,result);return true;
      }
      const group=path.match(/^\/api\/admin\/duplicates\/groups\/([a-f0-9]{64})$/);
      if(group&&method==='GET'){send(200,duplicates.group(group[1],params));return true;}
      const pair=path.match(/^\/api\/admin\/duplicates\/pairs\/([a-f0-9]{64})(\/(preview|decision))?$/);
      if(pair){
        if(method==='GET'&&!pair[2]){send(200,duplicates.detail(pair[1]));return true;}
        if(method==='POST'){const input=await body(req);requireAdmin(store.user(user.id),identity);
          if(pair[3]==='preview'){send(200,duplicates.preview(pair[1],input,user.id));return true;}
          if(pair[3]==='decision'){send(200,duplicates.decide(pair[1],input.action,input.revision,input.note||'',user.id));return true;}
        }
      }
      if(path==='/api/admin/duplicates/commit'&&method==='POST'){const input=await body(req);requireAdmin(store.user(user.id),identity);send(200,duplicates.commit(text(input.token,80),user.id));return true;}
      if(path==='/api/admin/duplicates/undo'&&method==='POST'){const input=await body(req);requireAdmin(store.user(user.id),identity);send(200,duplicates.undo(text(input.decisionId,80),user.id,input.note||''));return true;}
      if(path==='/api/admin/category-report'&&method==='GET'){const page=Number(params.get('page')||0);if(!Number.isSafeInteger(page)||page<0||page>1000000)fail(400,'Invalid page.');const categories=primaryCategories.map(category=>({category,stored:store.one("SELECT count(*) n FROM project_categories WHERE json_extract(normalized,'$.primaryCategory')=?",category).n,public:store.one("SELECT count(*) n FROM active_map_index m JOIN project_categories c ON c.project_id=m.id WHERE json_extract(c.normalized,'$.primaryCategory')=?",category).n}));const unresolved=store.one("SELECT count(*) n FROM project_categories WHERE json_extract(normalized,'$.classification.status')='needs_review'").n;const items=store.all("SELECT p.id,json_extract(p.data,'$.name') name,json_extract(c.normalized,'$.originalCategory') originalCategory,json_extract(c.normalized,'$.classification.reason') reason FROM project_categories c JOIN project_profiles p ON p.id=c.project_id WHERE json_extract(c.normalized,'$.classification.status')='needs_review' ORDER BY EXISTS(SELECT 1 FROM active_map_index m WHERE m.id=p.id) DESC,p.id LIMIT 50 OFFSET ?",page*50);send(200,{categories,total:store.one('SELECT count(*) n FROM projects').n,unresolved,publicUnresolved:store.one("SELECT count(*) n FROM project_categories c JOIN active_map_index m ON m.id=c.project_id WHERE json_extract(normalized,'$.classification.status')='needs_review'").n,items,page,hasMore:(page+1)*50<unresolved});return true;}
      if(path==='/api/admin/classification-candidates'&&method==='GET'){send(200,duplicates.classifications(params));return true;}
      const original=path.match(/^\/api\/admin\/records\/([a-zA-Z0-9-]{1,80})$/);
      if(original&&method==='GET'){const data=store.originalProject(original[1]);if(!data)fail(404,'Original record not found.');send(200,{original:data,profile:store.projectProfile(original[1]),canonicalId:store.canonicalId(original[1])});return true;}
      if (path === "/api/admin/users" && method === "GET") {
        send(
          200,
          store.all(
            "SELECT id,email,name,role,disabled,verified,created FROM users ORDER BY created DESC LIMIT 200",
          ),
        );
        return true;
      }
      const target = path.match(/^\/api\/admin\/users\/([a-f0-9-]+)$/);
      if (target && method === "PATCH") {
        const input = await body(req),
          other = store.user(target[1]);
        if (!other) fail(404, "Account not found.");
        if (other.role === "admin")
          fail(403, "The sole administrator is protected.");
        if (input.role === "collaborator" && !other.verified)
          fail(
            403,
            "Verify the account email before granting collaborator access.",
          );
        if (
          input.role !== undefined &&
          !["user", "collaborator"].includes(input.role)
        )
          fail(400, "Only user and collaborator roles can be assigned here.");
        if (input.disabled !== undefined && typeof input.disabled !== "boolean")
          fail(400, "Invalid disabled flag.");
        store.tx(() => {
          store.run(
            "UPDATE users SET role=?,disabled=? WHERE id=?",
            input.role || other.role,
            input.disabled === undefined
              ? other.disabled
              : Number(input.disabled),
            other.id,
          );
          store.run(
            "INSERT INTO role_audit VALUES(?,?,?,?,?)",
            randomUUID(),
            user.id,
            other.id,
            JSON.stringify(input),
            Date.now(),
          );
        });
        send(200, { ok: true });
        return true;
      }
      if (path === "/api/admin/invitations" && method === "GET") {
        send(
          200,
          store.all(
            "SELECT email,expires,accepted,created FROM invitations ORDER BY created DESC LIMIT 200",
          ),
        );
        return true;
      }
      if (path === "/api/admin/invitations" && method === "POST") {
        const input = await body(req),
          email = text(input.email, 254).toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
          fail(400, "Enter a valid email.");
        const days = Number(process.env.INVITATION_DAYS || 7);
        if (!Number.isFinite(days) || days <= 0 || days > 30)
          fail(503, "Invitation expiry is misconfigured.");
        const origin = process.env.PUBLIC_APP_URL;
        if (!origin)
          fail(503, "Configure PUBLIC_APP_URL before creating invitations.");
        const token = randomBytes(32).toString("base64url");
        const expires = Date.now() + days * 86400000;
        store.run(
          "INSERT INTO invitations VALUES(?,?,?,?,?,?)",
          hash(token),
          email,
          expires,
          null,
          user.id,
          Date.now(),
        );
        send(201, {
          url: `${origin.replace(/\/$/, "")}/?invite=${encodeURIComponent(token)}`,
          email,
          expires,
        });
        return true;
      }
      if (path === "/api/admin/submissions" && method === "GET") {
        send(
          200,
          store.all(
            "SELECT s.*,u.email FROM submissions s LEFT JOIN users u ON u.id=s.user_id ORDER BY created DESC LIMIT 200",
          ),
        );
        return true;
      }
      const submission = path.match(
        /^\/api\/admin\/submissions\/([a-f0-9-]+)$/,
      );
      if (submission && method === "POST") {
        const input = await body(req),
          item = store.one(
            "SELECT * FROM submissions WHERE id=?",
            submission[1],
          );
        if (!item || item.status !== "pending")
          fail(409, "Submission is unavailable or already reviewed.");
        if (!["approve", "reject", "resolved"].includes(input.action))
          fail(400, "Choose approve, reject or resolved.");
        if (input.action === "approve") {
          if (item.kind !== "correction")
            fail(400, "Only corrections can change a project.");
          const current = store.project(item.project_id);
          if (!current) fail(404, "Project not found.");
          const patch =
            input.patch || (item.patch ? JSON.parse(item.patch) : null);
          if (!patch)
            fail(
              400,
              "Enter the reviewed project fields before approving this correction.",
            );
          const allowed = [
            "name",
            "description",
            "status",
            "address",
            "neighborhood",
            "category",
            "developer",
            "homes",
            "completion",
            "latitude",
            "longitude",
            "meetings",
            "sources",
          ];
          if (Object.keys(patch).some((k) => !allowed.includes(k)))
            fail(400, "Invalid correction fields.");
          const next = { ...current, ...patch };
          const issue = validateProject(next);
          if (issue) fail(400, issue);
          store.publish(next, user.id, () =>
            store.run(
              "UPDATE submissions SET status=?,reviewer=? WHERE id=?",
              input.action,
              user.id,
              item.id,
            ),
          );
          send(200, { ok: true });
          return true;
        }
        store.run(
          "UPDATE submissions SET status=?,reviewer=? WHERE id=?",
          input.action,
          user.id,
          item.id,
        );
        send(200, { ok: true });
        return true;
      }
      if (path === "/api/admin/history" && method === "GET") {
        send(200, {
          projects: store.all(
            "SELECT * FROM history ORDER BY created DESC LIMIT 200",
          ),
          roles: store.all(
            "SELECT * FROM role_audit ORDER BY created DESC LIMIT 200",
          ),
        });
        return true;
      }
    }
    return false;
  };
}
