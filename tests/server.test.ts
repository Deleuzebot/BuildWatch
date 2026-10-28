import {ResearchService} from '../server/research/service';
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { createServer } from "node:http";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { createApp } from "../server/server";
import { Identity, verifier } from "../server/accounts/auth";
import { Store } from "../server/accounts/store";
import { projects } from "../src/data/projects";
import { validateProject } from "../src/lib/validate";
function identity(
  subject: string,
  overrides: Partial<Identity> = {},
): Identity {
  return {
    subject,
    email: `${subject}@example.com`,
    name: subject,
    verified: true,
    mfa: false,
    methods: ["google-oauth2"],
    authenticatedAt: Date.now(),
    ...overrides,
  };
}
async function setup() {
  const folder = mkdtempSync(join(tmpdir(), "buildwatch-"));
  const identities: Record<string, Identity> = {
    user: identity("user"),
    other: identity("other"),
    collaborator: identity("collaborator"),
    admin: identity("admin", { mfa: true }),
    nomfa: identity("admin"),
    unverified: identity("unverified", { verified: false }),
  };
  const file = join(folder, "projects.json");
  writeFileSync(file, JSON.stringify(projects));
  const server = createApp({
    file,
    webRoot: folder,
    verify: async (token) => {
      if (!identities[token]) throw new Error("Invalid token");
      return identities[token];
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  async function request(
    path: string,
    method = "GET",
    data?: unknown,
    token?: string,
  ) {
    return fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
  }
  const users: Record<string, any> = {};
  for (const token of ["user", "other", "collaborator", "admin", "unverified"])
    users[token] = await (
      await request("/api/me", "GET", undefined, token)
    ).json();
  server.store.run(
    "UPDATE users SET role='collaborator' WHERE id=?",
    users.collaborator.id,
  );
  server.store.run("UPDATE users SET role='admin' WHERE id=?", users.admin.id);
  return {
    server,
    request,
    users,
    file,
    folder,
    base,
    close: async () => {
      await new Promise<void>((r) => server.close(() => r()));
      rmSync(folder, { recursive: true, force: true });
    },
  };
}
test('public activity dates, pagination and visibility never use import time',async()=>{
 const t=await setup();try{const date=new Date(Date.now()-400*86400000).toISOString().slice(0,10),store=t.server.store;
 store.publish({...projects[0],id:'activity-test',name:'Activity Test Apartments',category:'Housing',status:'In review',meetings:[],sourceStatus:'Approved',sourceStatusDate:date,sources:[{title:'Official decision',url:'https://example.org/decision'}],revision:undefined},'admin');
 const first=await t.request('/api/public/projects/activity-test/activity');assert.equal(first.status,200);const history=await first.json();assert.equal(history.total,1);assert.equal(history.items[0].date,date);assert.equal(history.items[0].sourceUrl,'https://example.org/decision');
 assert.equal((await(await t.request('/api/browse?search=Activity%20Test&activity=30d')).json()).total,0);
 store.publish({...store.project('activity-test')!,sourceStatus:'TRC Review',sourceStatusDate:new Date().toISOString().slice(0,10)},'admin');
 const page=await(await t.request('/api/public/projects/activity-test/activity?limit=1')).json();assert.equal(page.total,2);assert.equal(page.nextCursor,'1');assert.equal(page.items[0].type,'Review Update');assert.equal((await(await t.request('/api/public/projects/activity-test/activity?cursor=1&limit=1')).json()).items[0].date,date);
 assert.equal((await t.request('/api/public/projects/activity-test/activity?limit=101')).status,400);
 store.publish({...store.project('activity-test')!,archived:true},'admin');assert.equal((await t.request('/api/public/projects/activity-test/activity')).status,404);
 }finally{await t.close();}
});
test("project validation rejects malformed fields and unsafe source links", () => {
  assert.match(validateProject({ ...projects[0], latitude: NaN })!, /latitude/);
  assert.match(
    validateProject({ ...projects[0], meetings: [null] })!,
    /meeting/i,
  );
  assert.match(validateProject({ ...projects[0], homes: -1 })!, /Homes/);
  assert.match(
    validateProject({
      ...projects[0],
      sources: [{ title: "Unsafe", url: "javascript:alert(1)" }],
    })!,
    /HTTPS/,
  );
  assert.equal(validateProject(projects[0]), null);
});
test("public reads; no guest, ordinary user, paid user or fake-role map writes", async () => {
  const t = await setup();
  try {
    assert.equal((await t.request("/api/projects")).status, 200);
    const next = { ...projects[0], id: "new-project", revision: 0 };
    assert.equal(
      (await t.request("/api/projects/new-project", "PUT", next)).status,
      401,
    );
    assert.equal(
      (await t.request("/api/projects/new-project", "PUT", next, "user"))
        .status,
      403,
    );
    t.server.store.run(
      "INSERT INTO entitlements(user_id,expires) VALUES(?,?)",
      t.users.user.id,
      Date.now() + 86400000,
    );
    assert.equal(
      (await t.request("/api/projects/new-project", "PUT", next, "user"))
        .status,
      403,
    );
    await t.request(
      "/api/me",
      "PATCH",
      { role: "admin", plus: true, expires: 8640000000000000 },
      "other",
    );
    assert.equal(t.server.store.user(t.users.other.id).role, "user");
    assert.equal(t.server.store.plus(t.users.other.id), false);
    assert.equal(
      (
        await t.request(
          "/api/projects/new-project",
          "PUT",
          next,
          "collaborator",
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await t.request(
          "/api/projects/new-project",
          "PUT",
          next,
          "collaborator",
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await t.request(
          "/api/projects/new-project",
          "PUT",
          { ...next, longitude: 200 },
          "collaborator",
        )
      ).status,
      400,
    );
  } finally {
    await t.close();
  }
});
test("administrator MFA, immediate revocation and private admin data are enforced", async () => {
  const t = await setup();
  try {
    assert.equal(
      (await t.request("/api/admin/users", "GET", undefined, "user")).status,
      403,
    );
    assert.equal(
      (await t.request("/api/admin/users", "GET", undefined, "nomfa")).status,
      403,
    );
    assert.equal(
      (await t.request("/api/admin/users", "GET", undefined, "admin")).status,
      200,
    );
    assert.equal(
      (
        await t.request(
          `/api/admin/users/${t.users.other.id}`,
          "PATCH",
          { role: "admin" },
          "admin",
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await t.request(
          `/api/admin/users/${t.users.collaborator.id}`,
          "PATCH",
          { role: "user" },
          "admin",
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await t.request(
          "/api/projects/river",
          "PUT",
          { ...projects[0], revision: 1 },
          "collaborator",
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await t.request(
          `/api/admin/users/${t.users.admin.id}`,
          "PATCH",
          { disabled: true },
          "admin",
        )
      ).status,
      403,
    );
  } finally {
    await t.close();
  }
});
test("free allowance, expiry retention, active selection and independent collaborator benefits", async () => {
  const t = await setup();
  try {
    assert.equal(
      (await t.request("/api/follows/river", "PUT", {}, "user")).status,
      200,
    );
    assert.equal(
      (await t.request("/api/follows/garden", "PUT", {}, "user")).status,
      402,
    );
    t.server.store.run(
      "INSERT INTO entitlements(user_id,expires) VALUES(?,?)",
      t.users.user.id,
      Date.now() + 100000,
    );
    assert.equal(
      (await t.request("/api/follows/garden", "PUT", {}, "user")).status,
      200,
    );
    t.server.store.run(
      "UPDATE entitlements SET expires=0 WHERE user_id=?",
      t.users.user.id,
    );
    let list = await (
      await t.request("/api/follows", "GET", undefined, "user")
    ).json();
    assert.equal(list.length, 2);
    assert.equal(list.filter((p: any) => p.active).length, 1);
    await t.request("/api/follows/river/activate", "POST", {}, "user");
    list = await (
      await t.request("/api/follows", "GET", undefined, "user")
    ).json();
    assert.equal(list.find((p: any) => p.active).projectId, "river");
    await t.request("/api/follows/river", "DELETE", {}, "user");
    assert.ok(
      t.server.store.one(
        "SELECT id FROM follow_history WHERE user_id=?",
        t.users.user.id,
      ),
    );
    assert.equal(t.server.store.plus(t.users.collaborator.id), true);
  } finally {
    await t.close();
  }
});
test("invitation is email-bound, verified, single-use and expiring", async () => {
  const t = await setup();
  const old = process.env.PUBLIC_APP_URL;
  process.env.PUBLIC_APP_URL = "https://buildwatch.example";
  try {
    const r = await t.request(
      "/api/admin/invitations",
      "POST",
      { email: "user@example.com" },
      "admin",
    );
    assert.equal(r.status, 201);
    const invitation = await r.json();
    const token = new URL(invitation.url).searchParams.get("invite");
    assert.equal(
      (await t.request("/api/invitations/accept", "POST", { token }, "other"))
        .status,
      403,
    );
    assert.equal(
      (
        await t.request(
          "/api/invitations/accept",
          "POST",
          { token },
          "unverified",
        )
      ).status,
      403,
    );
    assert.equal(
      (await t.request("/api/invitations/accept", "POST", { token }, "user"))
        .status,
      200,
    );
    assert.equal(t.server.store.user(t.users.user.id).role, "collaborator");
    assert.equal(
      (await t.request("/api/invitations/accept", "POST", { token }, "user"))
        .status,
      400,
    );
    const second = await (
      await t.request(
        "/api/admin/invitations",
        "POST",
        { email: "other@example.com" },
        "admin",
      )
    ).json();
    const expired = new URL(second.url).searchParams.get("invite");
    t.server.store.run(
      "UPDATE invitations SET expires=0 WHERE email=?",
      "other@example.com",
    );
    assert.equal(
      (
        await t.request(
          "/api/invitations/accept",
          "POST",
          { token: expired },
          "other",
        )
      ).status,
      400,
    );
  } finally {
    if (old === undefined) delete process.env.PUBLIC_APP_URL;
    else process.env.PUBLIC_APP_URL = old;
    await t.close();
  }
});
test("corrections await moderation, approved changes and history commit together; feedback stays private", async () => {
  const t = await setup();
  try {
    const r = await t.request(
      "/api/submissions",
      "POST",
      {
        kind: "correction",
        projectId: "river",
        body: "Approved by the planning board.",
        patch: { status: "Approved" },
      },
      "user",
    );
    assert.equal(r.status, 201);
    const item = await r.json();
    assert.equal(t.server.store.project("river")!.status, "In review");
    assert.equal(
      (
        await t.request(
          `/api/admin/submissions/${item.id}`,
          "POST",
          { action: "approve" },
          "user",
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await t.request(
          `/api/admin/submissions/${item.id}`,
          "POST",
          { action: "approve" },
          "admin",
        )
      ).status,
      200,
    );
    assert.equal(t.server.store.project("river")!.status, "Approved");
    assert.equal(
      t.server.store.one(
        "SELECT actor FROM history WHERE project_id=?",
        "river",
      ).actor,
      t.users.admin.id,
    );
    assert.equal(
      (
        await t.request(
          `/api/admin/submissions/${item.id}`,
          "POST",
          { action: "approve" },
          "admin",
        )
      ).status,
      409,
    );
    await t.request(
      "/api/submissions",
      "POST",
      { kind: "bug", body: "Private bug report" },
      "user",
    );
    assert.equal(
      (await t.request("/api/admin/submissions", "GET", undefined, "other"))
        .status,
      403,
    );
    assert.equal(
      (await t.request("/api/admin/submissions", "GET", undefined, "admin"))
        .status,
      200,
    );
  } finally {
    await t.close();
  }
});
test("notifications respect preferences, follow limits and idempotent meeting reminders", async () => {
  const t = await setup();
  try {
    await t.request("/api/follows/river", "PUT", {}, "user");
    const old = t.server.store.project("river")!;
    t.server.store.publish(
      { ...old, status: "Approved" },
      t.users.collaborator.id,
    );
    let inbox = await (
      await t.request("/api/notifications", "GET", undefined, "user")
    ).json();
    assert.equal(inbox.length, 1);
    assert.equal(
      (
        await (
          await t.request("/api/notifications", "GET", undefined, "other")
        ).json()
      ).length,
      0,
    );
    await t.request(
      "/api/me",
      "PATCH",
      {
        preferences: {
          enabled: false,
          updates: true,
          meetings: true,
          reminders: true,
        },
      },
      "user",
    );
    t.server.store.publish(
      {
        ...t.server.store.project("river")!,
        description: "Changed description",
      },
      t.users.collaborator.id,
    );
    assert.equal(
      (
        await (
          await t.request("/api/notifications", "GET", undefined, "user")
        ).json()
      ).length,
      1,
    );
    await t.request(
      "/api/me",
      "PATCH",
      {
        preferences: {
          enabled: true,
          updates: true,
          meetings: true,
          reminders: true,
        },
      },
      "user",
    );
    const next = t.server.store.project("river")!;
    next.meetings = [
      {
        id: "soon",
        title: "Soon",
        venue: "Town hall",
        agenda: "Review",
        startsAt: new Date(Date.now() + 3600000).toISOString(),
      },
    ];
    t.server.store.publish(next, t.users.collaborator.id);
    t.server.store.reminders();
    t.server.store.reminders();
    inbox = await (
      await t.request("/api/notifications", "GET", undefined, "user")
    ).json();
    assert.equal(
      inbox.filter((n: any) => n.title.includes("reminder")).length,
      1,
    );
  } finally {
    await t.close();
  }
});
test("legacy migration preserves data; deleted subjects cannot recreate accounts", async () => {
  const t = await setup();
  try {
    assert.equal(t.server.store.list().length, projects.filter(p=>!p.archived&&!["Completed","Cancelled"].includes(p.status)).length);
    t.server.store.publish(
      { ...t.server.store.project("river")!, name: "Preserved edit" },
      t.users.collaborator.id,
    );
    const other = new Store(t.file + ".sqlite", t.file);
    try {
      assert.equal(other.project("river")!.name, "Preserved edit");
    } finally {
      other.close();
    }
    t.server.store.run("INSERT INTO revoked_subjects VALUES(?)", "deleted");
    assert.throws(
      () =>
        t.server.store.ensureUser(
          "deleted",
          "deleted@example.com",
          "deleted",
          true,
        ),
      /deleted/,
    );
    assert.equal(
      (
        await t.request("/api/webhooks/revenuecat", "POST", {
          event: { id: "fake" },
        })
      ).status,
      401,
    );
  } finally {
    await t.close();
  }
});
test("real JWT verification validates issuer, audience, expiry and signature", async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "test";
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const a = server.address();
  assert.ok(a && typeof a !== "string");
  const issuer = `http://127.0.0.1:${a.port}/`;
  const oldIssuer = process.env.AUTH0_ISSUER,
    oldAudience = process.env.AUTH0_AUDIENCE;
  process.env.AUTH0_ISSUER = issuer;
  process.env.AUTH0_AUDIENCE = "buildwatch";
  try {
    const verify = verifier();
    const token = await new SignJWT({
      "https://buildwatch.app/email": "jwt@example.com",
      "https://buildwatch.app/email_verified": true,
    })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setSubject("jwt-user")
      .setIssuedAt()
      .setIssuer(issuer)
      .setAudience("buildwatch")
      .setExpirationTime("5m")
      .sign(privateKey);
    assert.equal((await verify(token)).subject, "jwt-user");
    await assert.rejects(() => verify(token.slice(0, -10) + "invalid"));
    const wrong = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setSubject("jwt-user")
      .setIssuedAt()
      .setIssuer(issuer)
      .setAudience("wrong")
      .setExpirationTime("5m")
      .sign(privateKey);
    await assert.rejects(() => verify(wrong));
  } finally {
    if (oldIssuer) process.env.AUTH0_ISSUER = oldIssuer;
    else delete process.env.AUTH0_ISSUER;
    if (oldAudience) process.env.AUTH0_AUDIENCE = oldAudience;
    else delete process.env.AUTH0_AUDIENCE;
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test("billing webhook verifies current provider state, rejects forgery, deduplicates and handles late events", async () => {
  const t = await setup();
  const originalFetch = globalThis.fetch;
  const oldSecret = process.env.REVENUECAT_SECRET_KEY,
    oldHook = process.env.REVENUECAT_WEBHOOK_SECRET;
  process.env.REVENUECAT_SECRET_KEY = "test-server-secret";
  process.env.REVENUECAT_WEBHOOK_SECRET = "test-webhook-secret";
  let expiration = new Date(Date.now() + 86400000).toISOString();
  let lookups = 0;
  let grace: string | null = null;
  globalThis.fetch = (async (input: any, init?: any) => {
    if (String(input).startsWith("https://api.revenuecat.com/")) {
      lookups++;
      assert.equal(init.headers.Authorization, "Bearer test-server-secret");
      return new Response(
        JSON.stringify({
          subscriber: {
            entitlements: {
              buildwatch_plus: {
                expires_date: expiration,
                product_identifier: "buildwatch_plus_monthly",
              },
            },
            subscriptions: {
              buildwatch_plus_monthly: {
                store: "APP_STORE",
                is_sandbox: false,
                grace_period_expires_date: grace,
              },
            },
            management_url: "https://apps.apple.com/account/subscriptions",
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  try {
    const event = { event: { id: "purchase-1", app_user_id: t.users.user.id } };
    const post = () =>
      originalFetch(t.base + "/api/webhooks/revenuecat", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-webhook-secret",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      });
    assert.equal((await post()).status, 200);
    assert.equal(t.server.store.plus(t.users.user.id), true);
    assert.equal(lookups, 1);
    assert.equal((await post()).status, 200);
    assert.equal(lookups, 1);
    expiration = new Date(Date.now() - 1000).toISOString();
    event.event.id = "late-renewal-event";
    assert.equal((await post()).status, 200);
    assert.equal(t.server.store.plus(t.users.user.id), false);
    grace = new Date(Date.now() + 3600000).toISOString();
    event.event.id = "verified-grace-period";
    assert.equal((await post()).status, 200);
    assert.equal(t.server.store.plus(t.users.user.id), true);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldSecret === undefined) delete process.env.REVENUECAT_SECRET_KEY;
    else process.env.REVENUECAT_SECRET_KEY = oldSecret;
    if (oldHook === undefined) delete process.env.REVENUECAT_WEBHOOK_SECRET;
    else process.env.REVENUECAT_WEBHOOK_SECRET = oldHook;
    await t.close();
  }
});

test("push outbox uses tickets/receipts and suppresses delivery after preference changes", async () => {
  const { deliver } = await import("../server/accounts/push");
  const t = await setup();
  const originalFetch = globalThis.fetch;
  const old = process.env.PUSH_DELIVERY_ENABLED;
  process.env.PUSH_DELIVERY_ENABLED = "true";
  let sends = 0;
  globalThis.fetch = (async (input: any, init?: any) => {
    if (String(input) === "https://exp.host/--/api/v2/push/send") {
      sends++;
      return new Response(
        JSON.stringify({ data: { status: "ok", id: "push-ticket-1" } }),
      );
    }
    if (String(input) === "https://exp.host/--/api/v2/push/getReceipts")
      return new Response(
        JSON.stringify({ data: { "push-ticket-1": { status: "ok" } } }),
      );
    return originalFetch(input, init);
  }) as typeof fetch;
  try {
    await t.request("/api/follows/river", "PUT", {}, "user");
    await t.request(
      "/api/devices",
      "POST",
      { token: "ExpoPushToken[test-device]" },
      "user",
    );
    t.server.store.publish(
      { ...t.server.store.project("river")!, status: "Approved" },
      t.users.collaborator.id,
    );
    await deliver(t.server.store);
    assert.equal(sends, 1);
    assert.equal(
      t.server.store.one("SELECT status FROM deliveries").status,
      "ticket",
    );
    t.server.store.run("UPDATE deliveries SET next_attempt=0");
    await deliver(t.server.store);
    assert.equal(
      t.server.store.one("SELECT status FROM deliveries").status,
      "delivered",
    );
    t.server.store.publish(
      {
        ...t.server.store.project("river")!,
        description: "A second major update",
      },
      t.users.collaborator.id,
    );
    await t.request(
      "/api/me",
      "PATCH",
      {
        preferences: {
          enabled: false,
          updates: true,
          meetings: true,
          reminders: true,
        },
      },
      "user",
    );
    await deliver(t.server.store);
    assert.equal(sends, 1);
    assert.equal(
      t.server.store.one(
        "SELECT COUNT(*) AS count FROM deliveries WHERE status='skipped'",
      ).count,
      1,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (old === undefined) delete process.env.PUSH_DELIVERY_ENABLED;
    else process.env.PUSH_DELIVERY_ENABLED = old;
    await t.close();
  }
});

test("explicit free-account linking preserves saved data and stricter preferences without granting roles", async () => {
  const t = await setup();
  try {
    await t.request("/api/follows/river", "PUT", {}, "user");
    await t.request("/api/follows/garden", "PUT", {}, "other");
    await t.request(
      "/api/me",
      "PATCH",
      {
        preferences: {
          enabled: false,
          updates: false,
          meetings: true,
          reminders: true,
        },
      },
      "other",
    );
    await t.request(
      "/api/submissions",
      "POST",
      { kind: "bug", body: "Keep this support history" },
      "other",
    );
    t.server.store.mergeIdentity(t.users.user.id, t.users.other.id);
    const follows = t.server.store.following(t.users.user.id);
    assert.equal(follows.length, 2);
    assert.equal(follows.filter((p) => p.active).length, 1);
    assert.equal(t.server.store.user(t.users.user.id).role, "user");
    assert.equal(
      JSON.parse(t.server.store.user(t.users.user.id).preferences).enabled,
      false,
    );
    assert.equal(
      t.server.store.one(
        "SELECT user_id FROM submissions WHERE body=?",
        "Keep this support history",
      ).user_id,
      t.users.user.id,
    );
    assert.equal(t.server.store.user(t.users.other.id), undefined);
    assert.throws(
      () =>
        t.server.store.ensureUser("other", "other@example.com", "other", true),
      /deleted/,
    );
  } finally {
    await t.close();
  }
});

test("map management workspace requires an editor and administrator MFA", async () => {
  const t = await setup();
  try {
    assert.equal((await t.request("/api/management/map")).status, 401);
    assert.equal(
      (await t.request("/api/management/map", "GET", undefined, "user")).status,
      403,
    );
    assert.equal(
      (await t.request("/api/management/map", "GET", undefined, "nomfa"))
        .status,
      403,
    );
    const collaborator = await t.request(
      "/api/management/map",
      "GET",
      undefined,
      "collaborator",
    );
    assert.equal(collaborator.status, 200);
    assert.equal((await collaborator.json()).length, projects.filter(p=>!p.archived&&!["Completed","Cancelled"].includes(p.status)).length);
    assert.equal(
      (await t.request("/api/management/map", "GET", undefined, "admin"))
        .status,
      200,
    );
  } finally {
    await t.close();
  }
});

test('public snapshots support gzip/revalidation and invalidate after a published edit', async () => {
  const ctx = await setup();
  try {
    const response = await ctx.request('/api/projects');
    const etag = response.headers.get('etag');
    assert.ok(etag);
    assert.equal(response.headers.get('content-encoding'), 'gzip');
    const records = await response.json();
    assert.ok(records.length);
    const address = ctx.server.address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}`;
    const unchanged = await fetch(base + '/api/projects', { headers: { 'If-None-Match': etag! } });
    assert.equal(unchanged.status, 304);
    const project = ctx.server.store.project(records[0].id)!;
    ctx.server.store.publish({ ...project, description: project.description + ' Updated.' }, 'test-operator');
    const changed = await fetch(base + '/api/projects', { headers: { 'If-None-Match': etag!, 'Accept-Encoding': 'gzip;q=0' } });
    assert.equal(changed.status, 200);
    assert.notEqual(changed.headers.get('etag'), etag);
    assert.equal(changed.headers.get('content-encoding'), null);
  } finally { await ctx.close(); }
});

test('bounded public map API preserves counts, details, pagination, meetings and revalidation',async()=>{
 const t=await setup();try{
  const catalog=await(await t.request('/api/catalog')).json();assert.equal(catalog.total,projects.filter(p=>!p.archived&&!["Completed","Cancelled"].includes(p.status)).length);
  const map=await(await t.request('/api/map?bbox=-180,-90,180,90&zoom=3')).json();assert.equal(map.nodes.reduce((n:number,p:any)=>n+p.count,0),catalog.total);
  const first=await(await t.request('/api/browse?limit=2')).json();assert.equal(first.items.length,2);assert.ok(first.nextCursor);assert.equal(first.items[0].description,undefined);
  const second=await(await t.request('/api/browse?limit=2&cursor='+first.nextCursor)).json();assert.ok(second.items.every((p:any)=>!first.items.some((q:any)=>q.id===p.id)));
  const detail=await(await t.request('/api/public/projects/'+first.items[0].id)).json();assert.ok(detail.description);assert.ok(Array.isArray(detail.meetings));
  const response=await t.request('/api/map?bbox=-180,-90,180,90&zoom=3');const etag=response.headers.get('etag')!;const address=t.server.address();assert.ok(address&&typeof address!=='string');
  const cached=await fetch(`http://127.0.0.1:${address.port}/api/map?bbox=-180,-90,180,90&zoom=3`,{headers:{'If-None-Match':etag}});assert.equal(cached.status,304);
  assert.equal((await t.request('/api/map?bbox=nope')).status,400);assert.equal((await t.request('/api/browse?limit=1000000')).status,400);assert.equal((await t.request('/api/map?bbox=-180,-90,180,90&zoom=200')).status,400);
  const page=await(await t.request('/api/management/map?paged=1&search=River','GET',undefined,'collaborator')).json();assert.equal(page.total,1);assert.equal(page.items[0].id,'river');assert.ok(page.items[0].description);
  assert.equal((await t.request('/api/management/map?paged=1','GET',undefined,'user')).status,403);
  const original=t.server.store.project('river')!;t.server.store.publish({...original,name:'River renamed'},'test-operator');
  const refreshed=await fetch(`http://127.0.0.1:${address.port}/api/map?bbox=-180,-90,180,90&zoom=3`,{headers:{'If-None-Match':etag}});assert.equal(refreshed.status,200);assert.notEqual(refreshed.headers.get('etag'),etag);
 }finally{await t.close();}
});

test('meeting pages retain multiple events per project, exclude only past and archived entries',async()=>{
 const t=await setup();try{const p=t.server.store.project('river')!;const future={id:'next-a',title:'Verified test fixture',startsAt:'2099-01-01T12:00:00Z',venue:'Test hall',agenda:'Test agenda'};t.server.store.publish({...p,meetings:[future,{...future,id:'next-b'},{...future,id:'old',startsAt:'2000-01-01T12:00:00Z'}]},'test-operator');
 const page=await(await t.request('/api/meetings?search=River&limit=1')).json();assert.equal(page.total,2);assert.equal(page.items.length,1);assert.equal(page.items[0].project.id,p.id);assert.ok(page.nextCursor);
 const next=await(await t.request('/api/meetings?search=River&limit=1&cursor='+page.nextCursor)).json();assert.equal(next.items.length,1);assert.notEqual(next.items[0].id,page.items[0].id);
 const detail=await(await t.request('/api/public/projects/river')).json();assert.equal(detail.meetings.length,3);
 t.server.store.publish({...t.server.store.project('river')!,archived:true},'test-operator');assert.equal((await(await t.request('/api/meetings?search=River')).json()).total,0);assert.equal((await t.request('/api/public/projects/river')).status,404);
 }finally{await t.close();}
});

test('state outlines are public, compressed and revalidated without changing catalog counts',async()=>{const t=await setup();try{const before=(await(await t.request('/api/catalog')).json()).total;const res=await t.request('/api/state-boundaries/2025-20m');assert.equal(res.status,200);assert.equal(res.headers.get('content-encoding'),'gzip');const data=await res.json();assert.equal(Object.keys(data.states).length,50);assert.equal(data.states.NC,'North Carolina');assert.ok(data.lines.length);const address=t.server.address();assert.ok(address&&typeof address!=='string');const again=await fetch(`http://127.0.0.1:${address.port}/api/state-boundaries/2025-20m`,{headers:{'If-None-Match':res.headers.get('etag')!}});assert.equal(again.status,304);assert.equal((await(await t.request('/api/catalog')).json()).total,before);}finally{await t.close();}});

test('research and duplicate review routes require current administrator role and completed MFA',async()=>{
 const t=await setup();try{
  for(const path of ['/api/admin/research','/api/admin/duplicates','/api/admin/classification-candidates','/api/admin/category-report','/api/admin/archives']){
   assert.equal((await t.request(path)).status,401);
   for(const token of ['user','collaborator','nomfa'])assert.equal((await t.request(path,'GET',undefined,token)).status,403);
   assert.equal((await t.request(path,'GET',undefined,'admin')).status,200);
  }
  for(const path of ['/api/admin/research/commit','/api/admin/duplicates/commit','/api/admin/duplicates/undo','/api/admin/archives/preview'])for(const token of ['user','collaborator','nomfa'])assert.equal((await t.request(path,'POST',{token:'invented'},token)).status,403);
  t.server.store.run("UPDATE users SET role='user' WHERE id=?",t.users.admin.id);
  assert.equal((await t.request('/api/admin/research','GET',undefined,'admin')).status,403);
 }finally{await t.close();}
});
test('manual research import, preview, individual approval, stale protection and atomic audit',async()=>{
 const t=await setup();try{
  const store=t.server.store,service=new ResearchService(store),project=store.project('river')!;
  const item={id:'a'.repeat(64),kind:'status',projectId:project.id,projectName:project.name,jurisdiction:'NC test',before:{status:project.status,revision:project.revision},patch:{status:'Approved',sourceStatus:'Approved'},reason:'Exact official record verified in test fixture',evidence:{url:'https://example.org/official-case',externalId:'CASE-1',checkedAt:new Date().toISOString(),attributes:{status:'Approved'}}};
  const original=store.all('SELECT * FROM projects'),history=store.all('SELECT * FROM history');
  const report={version:1,id:'fixture',created:new Date().toISOString(),items:[item],published:0};assert.equal(service.import(report).added,1);assert.equal(service.import(report).added,0);assert.deepEqual(store.all('SELECT * FROM projects'),original);assert.deepEqual(store.all('SELECT * FROM history'),history);
  assert.equal(service.list(new URLSearchParams()).total,1);
  const preview=service.preview(item.id,t.users.admin.id);assert.equal(store.project('river')!.status,project.status);assert.throws(()=>service.commit(preview.token,'other-admin'),/Preview/);
  store.db.exec("CREATE TRIGGER fail_research BEFORE INSERT ON research_audit BEGIN SELECT RAISE(ABORT,'simulated audit failure'); END");assert.throws(()=>service.commit(preview.token,t.users.admin.id),/simulated/);assert.equal(store.project('river')!.status,project.status);assert.equal(service.detail(item.id).status,'pending');store.db.exec('DROP TRIGGER fail_research');
  service.commit(preview.token,t.users.admin.id);assert.equal(store.project('river')!.status,'Approved');assert.equal(service.detail(item.id).status,'applied');assert.throws(()=>service.commit(preview.token,t.users.admin.id),/Preview/);assert.equal(service.detail(item.id).audit.length,1);
  const next={...item,id:'b'.repeat(64),before:{status:'Approved',revision:store.project('river')!.revision},patch:{status:'Under construction',sourceStatus:'Construction'}};service.import({...report,id:'fixture-2',items:[next]});const stale=service.preview(next.id,t.users.admin.id);store.publish({...store.project('river')!,name:'Later edit'},'editor');assert.throws(()=>service.commit(stale.token,t.users.admin.id),/changed/);
 }finally{await t.close();}
});
test('research discovery enters the same merge queue as a private source and supporting link can be undone',async()=>{
 const t=await setup();try{const store=t.server.store,service=new ResearchService(store);const item={id:'c'.repeat(64),kind:'discovery',projectName:'Official supporting application',jurisdiction:'NC',reason:'Unclassified source',evidence:{url:'https://example.org/FeatureServer/0/query?where=OBJECTID%3D12',externalId:'12',checkedAt:new Date().toISOString(),attributes:{},geometry:{x:-78,y:35}}};service.import({version:1,id:'discovery-fixture',created:new Date().toISOString(),items:[item]});const publicBefore=store.list().length;assert.throws(()=>service.preview(item.id,'admin'),/manual classification/);const queued=service.flagDuplicate(item.id,{target:'river',revision:1},'admin');assert.equal(store.list().length,publicBefore);const{DuplicateService}=await import('../server/duplicates/service');const duplicates=new DuplicateService(store),pair=duplicates.detail(queued.candidateId);assert.ok(pair.aEffective&&pair.bEffective);const canonical=pair.aEffective.id==='river'?'a':'b';const preview=duplicates.preview(pair.id,{action:'supporting',canonical,revision:pair.revision},'admin');const applied=duplicates.commit(preview.token,'admin');assert.equal(store.project('river')!.status,preview.result.status);assert.equal(store.list().length,publicBefore);duplicates.undo(applied.decisionId,'admin','Test safe restore');assert.equal(store.list().length,publicBefore);assert.equal(store.all('SELECT * FROM supporting_sources').length,1);
 }finally{await t.close();}
});
test('verified meeting association remains private until an administrator confirms its preview',async()=>{
 const t=await setup();try{const store=t.server.store,service=new ResearchService(store),before=store.project('river')!;const item={id:'d'.repeat(64),kind:'uncertain',projectName:'Unmatched official hearing',reason:'Needs association',meeting:{id:'official-case-hearing',title:'Case hearing',startsAt:'2099-11-01T18:00:00-05:00',venue:'Council Chambers',agenda:'Official case notice: https://example.org/notice'},evidence:{url:'https://example.org/notice',externalId:'CASE-99',checkedAt:new Date().toISOString(),attributes:{}}};service.import({version:1,id:'meeting-fixture',created:new Date().toISOString(),items:[item]});const child=service.associateMeeting(item.id,{revision:1,target:'river'},'admin');assert.deepEqual(store.project('river')!.meetings,before.meetings);const preview=service.preview(child.id,'admin');service.commit(preview.token,'admin');assert.equal(store.project('river')!.meetings.length,before.meetings.length+1);assert.equal(store.project('river')!.sources?.at(-1)?.url,item.evidence.url);
 }finally{await t.close();}
});
