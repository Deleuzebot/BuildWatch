import { Auth0Client } from "@auth0/auth0-spa-js";
import{administratorSelected,administratorToken,auth0Suppressed,chooseAuth0,signOutAdministrator}from'./adminAuth';
export const authConfigured = !!(
  process.env.EXPO_PUBLIC_AUTH0_DOMAIN &&
  process.env.EXPO_PUBLIC_AUTH0_WEB_CLIENT_ID &&
  process.env.EXPO_PUBLIC_AUTH0_AUDIENCE
);
let client: Auth0Client | null = null;
let initialized: Promise<Auth0Client> | null = null;
async function getClient() {
  if (!authConfigured)
    throw new Error(
      "Sign-in needs an Auth0 project configured by the administrator.",
    );
  if (!initialized)
    initialized = (async () => {
      client = new Auth0Client({
        domain: process.env.EXPO_PUBLIC_AUTH0_DOMAIN!,
        clientId: process.env.EXPO_PUBLIC_AUTH0_WEB_CLIENT_ID!,
        authorizationParams: {
          audience: process.env.EXPO_PUBLIC_AUTH0_AUDIENCE,
          redirect_uri: window.location.origin,
          scope: "openid profile email offline_access",
        },
        cacheLocation: "memory",
        useRefreshTokens: true,
        useRefreshTokensFallback: true,
      });
      if (
        window.location.search.includes("code=") &&
        window.location.search.includes("state=")
      ) {
        await client.handleRedirectCallback();
        window.history.replaceState({}, document.title, "/");
      }
      return client;
    })();
  return initialized;
}
export async function accessToken() {
  if(administratorSelected())return administratorToken();
  if(auth0Suppressed())return null;
  if (!authConfigured) return null;
  try {
    return await (await getClient()).getTokenSilently();
  } catch {
    return null;
  }
}
export async function login(
  connection?: string,
  fresh = false,
  secondary = false,
): Promise<string> {
  if(!secondary)chooseAuth0();
  const primary = await getClient();
  if (secondary) {
    const separate = new Auth0Client({
      domain: process.env.EXPO_PUBLIC_AUTH0_DOMAIN!,
      clientId: process.env.EXPO_PUBLIC_AUTH0_WEB_CLIENT_ID!,
      authorizationParams: {
        audience: process.env.EXPO_PUBLIC_AUTH0_AUDIENCE,
        scope: "openid profile email",
        redirect_uri: window.location.origin,
      },
      cacheLocation: "memory",
    });
    const linkedToken = await separate.getTokenWithPopup({
      authorizationParams: {
        ...(connection ? { connection } : {}),
        prompt: "login",
        max_age: 0,
      },
    });
    if (!linkedToken) throw new Error("Account linking was cancelled.");
    return linkedToken;
  }
  await primary.loginWithRedirect({
    authorizationParams: {
      connection,
      ...(fresh ? { prompt: "login", max_age: 0 } : {}),
    },
  });
  return "";
}
export async function logout() {
  if(administratorSelected()){await signOutAdministrator();return;}
  const c = await getClient();
  await c.logout({ logoutParams: { returnTo: window.location.origin } });
}
