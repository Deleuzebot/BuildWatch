import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import * as SecureStore from "expo-secure-store";
WebBrowser.maybeCompleteAuthSession();
export const authConfigured = !!(
  process.env.EXPO_PUBLIC_AUTH0_DOMAIN &&
  process.env.EXPO_PUBLIC_AUTH0_NATIVE_CLIENT_ID &&
  process.env.EXPO_PUBLIC_AUTH0_AUDIENCE
);
const issuer = `https://${process.env.EXPO_PUBLIC_AUTH0_DOMAIN}`;
const clientId = process.env.EXPO_PUBLIC_AUTH0_NATIVE_CLIENT_ID || "";
const audience = process.env.EXPO_PUBLIC_AUTH0_AUDIENCE || "";
type Tokens = { accessToken: string; refreshToken?: string; expiresAt: number };
let tokens: Tokens | null = null;
async function store(t: Tokens) {
  tokens = t;
  await SecureStore.setItemAsync("buildwatch.auth", JSON.stringify(t));
}
let refreshInFlight: Promise<string | null> | null = null;
export async function accessToken() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = loadAccessToken();
  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}
async function loadAccessToken() {
  if (!authConfigured) return null;
  if (!tokens) {
    const raw = await SecureStore.getItemAsync("buildwatch.auth");
    tokens = raw ? JSON.parse(raw) : null;
  }
  if (!tokens) return null;
  if (tokens.expiresAt > Date.now() + 60000) return tokens.accessToken;
  if (!tokens.refreshToken) {
    await clearTokens();
    return null;
  }
  try {
    const discovery = await AuthSession.fetchDiscoveryAsync(issuer);
    const result = await AuthSession.refreshAsync(
      { clientId, refreshToken: tokens.refreshToken },
      discovery,
    );
    await store({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken || tokens.refreshToken,
      expiresAt: Date.now() + (result.expiresIn || 300) * 1000,
    });
    return result.accessToken;
  } catch {
    await clearTokens();
    return null;
  }
}
export async function login(
  connection?: string,
  fresh = false,
  secondary = false,
): Promise<string> {
  if (!authConfigured)
    throw new Error(
      "Sign-in needs an Auth0 project configured by the administrator.",
    );
  const discovery = await AuthSession.fetchDiscoveryAsync(issuer);
  const redirectUri = AuthSession.makeRedirectUri({
    scheme: "buildwatch",
    path: "auth",
  });
  const request = new AuthSession.AuthRequest({
    clientId,
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
    scopes: ["openid", "profile", "email", "offline_access"],
    usePKCE: true,
    extraParams: {
      audience,
      ...(connection ? { connection } : {}),
      ...(fresh || secondary ? { prompt: "login", max_age: "0" } : {}),
    },
  });
  const result = await request.promptAsync(discovery);
  if (result.type !== "success" || result.params.state !== request.state)
    throw new Error("Sign-in was cancelled or could not be verified.");
  const response = await AuthSession.exchangeCodeAsync(
    {
      clientId,
      code: result.params.code,
      redirectUri,
      extraParams: { code_verifier: request.codeVerifier! },
    },
    discovery,
  );
  if (!secondary)
    await store({
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      expiresAt: Date.now() + (response.expiresIn || 300) * 1000,
    });
  return response.accessToken;
}
async function clearTokens() {
  tokens = null;
  await SecureStore.deleteItemAsync("buildwatch.auth");
}

export async function logout() {
  await clearTokens();
  if (authConfigured) {
    const redirectUri = AuthSession.makeRedirectUri({
      scheme: "buildwatch",
      path: "auth",
    });
    await WebBrowser.openAuthSessionAsync(
      `${issuer}/v2/logout?client_id=${encodeURIComponent(clientId)}&returnTo=${encodeURIComponent(redirectUri)}`,
      redirectUri,
    );
  }
}
