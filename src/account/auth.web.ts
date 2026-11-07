import {adminClient,administratorSelected,administratorToken,signOutAdministrator} from './adminAuth';
export const authConfigured=!!(process.env.EXPO_PUBLIC_SUPABASE_URL&&process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
export async function accessToken(){return authConfigured?administratorToken():null;}
export async function login(connection?:string,_fresh=false,secondary=false,_emailHint?:string):Promise<string>{
 if(secondary)throw Error('Account linking is not enabled. Sign in with your original BuildWatch method.');
 if(connection!=='google')throw Error('Use the email and password fields to sign in.');
 const {error}=await adminClient().auth.signInWithOAuth({provider:'google',options:{redirectTo:window.location.origin}});if(error)throw error;return '';
}
export async function logout(){
 if(administratorSelected())return signOutAdministrator();
 const{error}=await adminClient().auth.signOut();if(error)throw error;
}
