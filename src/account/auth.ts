import * as AuthSession from'expo-auth-session';
import * as WebBrowser from'expo-web-browser';
import{adminClient,administratorToken}from'./adminAuth';
WebBrowser.maybeCompleteAuthSession();
export const authConfigured=!!(process.env.EXPO_PUBLIC_SUPABASE_URL&&process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
export async function accessToken(){return authConfigured?administratorToken():null;}
export async function login(connection?:string,_fresh=false,secondary=false,_emailHint?:string):Promise<string>{
 if(secondary)throw Error('Account linking is not enabled. Use your original BuildWatch sign-in method.');
 if(connection!=='google')throw Error('Use the email and password fields to sign in.');
 const redirectTo=AuthSession.makeRedirectUri({scheme:'buildwatch',path:'auth'});
 const{data,error}=await adminClient().auth.signInWithOAuth({provider:'google',options:{redirectTo,skipBrowserRedirect:true,queryParams:{prompt:'select_account'}}});
 if(error)throw error;if(!data.url)throw Error('Unable to open Google sign-in.');
 const result=await WebBrowser.openAuthSessionAsync(data.url,redirectTo);
 if(result.type!=='success')throw Error('Sign-in was cancelled.');
 const url=new URL(result.url),code=url.searchParams.get('code');
 if(!code)throw Error('Sign-in did not return a verification code.');
 const exchanged=await adminClient().auth.exchangeCodeForSession(code);if(exchanged.error)throw exchanged.error;
 return exchanged.data.session?.access_token||'';
}
export async function logout(){const{error}=await adminClient().auth.signOut();if(error)throw error;}
