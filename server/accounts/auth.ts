import { createRemoteJWKSet, jwtVerify } from "jose";
export type Identity = {
  subject: string;
  email: string;
  name: string;
  verified: boolean;
  methods: string[];
  mfa: boolean;
  authenticatedAt: number;
  mfaAuthenticatedAt?: number;
};
export type Verify = (token: string) => Promise<Identity>;
export function verifier(): Verify {
  const issuer = process.env.AUTH0_ISSUER,
    audience = process.env.AUTH0_AUDIENCE;
  if (!issuer || !audience)
    return async () => {
      throw Object.assign(new Error("Sign-in is not configured."), {
        status: 503,
      });
    };
  const normalized = issuer.replace(/\/$/, "") + "/";
  const keys = createRemoteJWKSet(new URL(".well-known/jwks.json", normalized));
  return async (token) => {
    const { payload } = await jwtVerify(token, keys, {
      issuer: normalized,
      audience,
      algorithms: ["RS256"],
      requiredClaims: ["sub", "exp", "iat"],
    });
    if (!payload.sub) throw new Error("Missing subject");
    // These custom claims are set only by the deployed Auth0 Post Login Action.
    const email = payload["https://buildwatch.app/email"];
    const verified = payload["https://buildwatch.app/email_verified"] === true;
    if (typeof email !== "string")
      throw Object.assign(
        new Error(
          "Auth0 account claims are missing. Configure the BuildWatch Action.",
        ),
        { status: 503 },
      );
    const methods = payload["https://buildwatch.app/methods"];
    const auth = payload["https://buildwatch.app/auth_methods"];
    return {
      subject: payload.sub,
      email: email.toLowerCase(),
      name:
        typeof payload["https://buildwatch.app/name"] === "string"
          ? (payload["https://buildwatch.app/name"] as string)
          : email,
      verified,
      methods: Array.isArray(methods)
        ? methods.filter((x) => typeof x === "string")
        : [],
      mfa: Array.isArray(auth) && auth.some((m: any) => m.name === "mfa"),
      authenticatedAt:
        Number(payload["https://buildwatch.app/auth_time"] || 0) * 1000,
    };
  };
}
let cached: { token: string; expires: number } | null = null;
export async function management(path: string, method = "GET", body?: unknown) {
  const issuer = process.env.AUTH0_ISSUER?.replace(/\/$/, "");
  if (
    !issuer ||
    !process.env.AUTH0_MANAGEMENT_CLIENT_ID ||
    !process.env.AUTH0_MANAGEMENT_CLIENT_SECRET
  )
    throw Object.assign(new Error("Account management is not configured."), {
      status: 503,
    });
  if (!cached || cached.expires < Date.now()) {
    const r = await fetch(`${issuer}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: process.env.AUTH0_MANAGEMENT_CLIENT_ID,
        client_secret: process.env.AUTH0_MANAGEMENT_CLIENT_SECRET,
        audience: `${issuer}/api/v2/`,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error("Identity management authorization failed");
    const d = await r.json();
    cached = {
      token: d.access_token,
      expires: Date.now() + (d.expires_in - 60) * 1000,
    };
  }
  const r = await fetch(`${issuer}/api/v2/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${cached.token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok)
    throw Object.assign(
      new Error("Identity provider could not complete the account request."),
      { status: 502 },
    );
  return r.status === 204 ? null : r.json();
}
