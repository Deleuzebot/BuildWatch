import{createClient}from'@supabase/supabase-js';
import * as SecureStore from'expo-secure-store';
import{backendFetch}from'../lib/transport';
let client:ReturnType<typeof createClient>|undefined,selected=false;
const storage={getItem:(key:string)=>SecureStore.getItemAsync(key),setItem:(key:string,value:string)=>SecureStore.setItemAsync(key,value),removeItem:(key:string)=>SecureStore.deleteItemAsync(key)};
export const administratorLoginAvailable=!!process.env.EXPO_PUBLIC_SUPABASE_URL;
export function adminClient(){return client??=createClient(process.env.EXPO_PUBLIC_SUPABASE_URL!,process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{storage,storageKey:'buildwatch-supabase-session',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,flowType:'pkce'}});}
export function administratorSelected(){return selected;}
export async function administratorToken(){const{data,error}=await adminClient().auth.getSession();if(error)throw error;return data.session?.access_token||null;}
export async function activateAdministrator(){const token=await administratorToken();const r=await backendFetch('/api/me',{headers:{Authorization:'Bearer '+token}}),account=await r.json();if(!r.ok||account.role!=='admin'||account.mfa!==true)throw Error('A verified administrator login is required.');selected=true;return account;}
export async function signOutAdministrator(){const{error}=await adminClient().auth.signOut({scope:'global'});if(error)throw error;selected=false;}
