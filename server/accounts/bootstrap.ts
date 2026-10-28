import { Store } from "./store";
import { management } from "./auth";
import { existsSync } from "node:fs";
if (existsSync(".env.server")) process.loadEnvFile(".env.server");
import { randomUUID } from "node:crypto";
async function main() {
  const subject = process.argv[2];
  if (!subject)
    throw new Error(
      "Pass the Auth0 subject of your existing verified account. Ask Codex to inspect the local users table after your first login.",
    );
  const store = new Store(
    (process.env.DATA_FILE || "server/data/projects.json") + ".sqlite",
    process.env.DATA_FILE || "server/data/projects.json",
  );
  try {
    if (
      store.one("SELECT id FROM users WHERE role='admin'") ||
      store.one("SELECT value FROM meta WHERE key='administrator_bootstrapped'")
    )
      throw new Error("Administrator setup was already completed.");
    const user = store.one("SELECT * FROM users WHERE subject=?", subject);
    if (!user || !user.verified || user.disabled)
      throw new Error("Sign in with your own verified account first.");
    // Authorize MFA enforcement at Auth0 before assigning local privileges.
    await management(`users/${encodeURIComponent(subject)}`, "PATCH", {
      app_metadata: { buildwatch_admin: true },
    });
    store.tx(() => {
      if (
        store.one(
          "SELECT value FROM meta WHERE key='administrator_bootstrapped'",
        )
      )
        throw new Error("Already initialized.");
      store.run("UPDATE users SET role='admin' WHERE id=?", user.id);
      store.run(
        "INSERT INTO role_audit VALUES(?,?,?,?,?)",
        randomUUID(),
        "server-bootstrap",
        user.id,
        "initial administrator assigned",
        Date.now(),
      );
      store.run(
        "INSERT INTO meta VALUES(?,?)",
        "administrator_bootstrapped",
        user.id,
      );
    });
    console.log(
      "Administrator assigned. Log out, then log in and enroll/complete MFA before opening the admin dashboard.",
    );
  } finally {
    store.close();
  }
}
void main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
