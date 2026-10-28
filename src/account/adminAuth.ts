import{createClient}from'@supabase/supabase-js';
import{backendFetch}from'../lib/transport';
const marker='buildwatch-admin-provider-v1',guest='buildwatch-suppress-auth0-v1';
let client:ReturnType<typeof createClient>|undefined;
export const administratorLoginAvailable=!!process.env.EXPO_PUBLIC_SUPABASE_URL;
export function adminClient(){return client??=createClient(process.env.EXPO_PUBLIC_SUPABASE_URL!,process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{storage:window.sessionStorage,storageKey:'buildwatch-admin-session-v1',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});}
export function administratorSelected(){return window.sessionStorage.getItem(marker)==='supabase';}
export function auth0Suppressed(){return window.sessionStorage.getItem(guest)==='1';}
export function chooseAuth0(){window.sessionStorage.removeItem(marker);window.sessionStorage.removeItem(guest);}
export async function administratorToken(){const{data,error}=await adminClient().auth.getSession();if(error)throw error;return data.session?.access_token||null;}
export async function activateAdministrator(){
 const token=await administratorToken();if(!token)throw Error('Sign in and verify your authenticator first.');
 const response=await backendFetch('/api/me',{headers:{Authorization:'Bearer '+token}}),account=await response.json();
 if(!response.ok||account.role!=='admin'||account.mfa!==true)throw Error(account.error||'This Supabase identity is not linked to the administrator.');
 window.sessionStorage.setItem(marker,'supabase');window.sessionStorage.removeItem(guest);return account;
}
export async function signOutAdministrator(){
 const{error}=await adminClient().auth.signOut({scope:'global'});if(error)throw error;
 window.sessionStorage.removeItem(marker);window.sessionStorage.setItem(guest,'1');
}
