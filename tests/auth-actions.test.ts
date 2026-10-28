import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
function action(file: string) {
  const exported: any = {};
  runInNewContext(readFileSync(`server/accounts/${file}`, "utf8"), {
    exports: exported,
  });
  return exported.onExecutePostLogin;
}
test("MFA enrollment/challenge precedes claims and claims fail closed without completed MFA", async () => {
  const enforce = action("auth0-mfa-action.js"),
    claims = action("auth0-action.js");
  const calls: string[] = [];
  const values: Record<string, unknown> = {};
  const api = {
    authentication: {
      challengeWith: () => calls.push("challenge"),
      enrollWith: () => calls.push("enroll"),
    },
    access: { deny: () => calls.push("deny") },
    accessToken: {
      setCustomClaim: (key: string, value: unknown) => {
        values[key] = value;
      },
    },
  };
  const event: any = {
    user: {
      email: "admin@example.com",
      email_verified: true,
      app_metadata: { buildwatch_admin: true },
      enrolledFactors: [],
      identities: [{ provider: "google-oauth2" }],
    },
    authentication: {
      methods: [{ name: "federated", timestamp: new Date().toISOString() }],
    },
  };
  await enforce(event, api);
  assert.equal(calls[0], "enroll");
  event.user.enrolledFactors = [{ type: "otp" }];
  await enforce(event, api);
  assert.equal(calls[1], "challenge");
  await claims(event, api);
  assert.equal(calls[2], "deny");
  assert.equal(Object.keys(values).length, 0);
  event.authentication.methods.push({
    name: "mfa",
    timestamp: new Date().toISOString(),
  });
  await claims(event, api);
  assert.equal(values["https://buildwatch.app/email_verified"], true);
  assert.ok(values["https://buildwatch.app/auth_methods"]);
});
