import React,{useEffect,useState}from'react';
import{ActivityIndicator,Image,Platform,Pressable,StyleSheet,Text,TextInput,View}from'react-native';
import{useTheme,useThemeStyles}from'../lib/Theme';
import{useSession}from'./Session';
import{adminClient}from'./adminAuth';
import{login,authConfigured}from'./auth';
import{normalizeAuthenticatorCode}from'./adminSetup';
import{useLayoutPreference}from'../lib/LayoutPreference';
export default function AccountEntry({onGuest,onAdministrator}:{onGuest:(query:string)=>void;onAdministrator:()=>void}){
 const s=useThemeStyles(styles),{dark}=useTheme(),session=useSession(),{mobile}=useLayoutPreference();
 const[email,setEmail]=useState(''),[password,setPassword]=useState(''),[open,setOpen]=useState(false),[register,setRegister]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[google,setGoogle]=useState(false),[factor,setFactor]=useState(''),[code,setCode]=useState('');
 useEffect(()=>{if(!authConfigured)return;void fetch(process.env.EXPO_PUBLIC_SUPABASE_URL+'/auth/v1/settings',{headers:{apikey:process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!},signal:AbortSignal.timeout(10000)}).then(r=>r.ok?r.json():null).then(v=>setGoogle(v?.external?.google===true)).catch(()=>{});},[]);
 const run=async(work:()=>Promise<void>)=>{if(busy)return;setBusy(true);setMessage('');try{await work();}catch(e:any){setMessage(e.code==='mfa_verification_failed'?'That code did not match. Wait for a fresh code and try again.':e.message||'Unable to sign in. Please try again.');}finally{setBusy(false);}};
 async function submit(){
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))throw Error('Enter your email address to continue.');
  if(register){const{data,error}=await adminClient().auth.signUp({email:email.trim(),password,...(Platform.OS==='web'?{options:{emailRedirectTo:window.location.origin}}:{})});if(error)throw error;if(!data.session){setMessage('Check your email to confirm your account, then sign in here.');return;}}
  else{const{error}=await adminClient().auth.signInWithPassword({email:email.trim(),password});if(error)throw error;}
  setPassword('');
  const factors=await adminClient().auth.mfa.listFactors();if(factors.error)throw factors.error;
  const verified=factors.data.totp.find(f=>f.status==='verified');
  if(verified){setFactor(verified.id);return;}
  await session.refresh();
 }
 const field=(label:string,value:string,change:(v:string)=>void,secure=false)=><TextInput accessibilityLabel={label} placeholder={label} placeholderTextColor={dark?'#aebfb5':'#6c7d73'} autoCapitalize="none" autoCorrect={false} secureTextEntry={secure} keyboardType={label==='Email address'?'email-address':label==='Authenticator code'?'number-pad':'default'} value={value} onChangeText={change} style={s.input}/>;
 return <View style={s.wrap}>
 <Text accessibilityRole="header" style={s.brand}>BuildWatch<Text style={{color:'#D36D43'}}>.</Text></Text><Text style={s.subtitle}>Your neighborhood, in progress.</Text>
 <View style={s.card}><Text style={s.title}>Your BuildWatch account</Text><Text style={s.body}>Sign in or create an account to follow developments.</Text>
 {google&&<Pressable accessibilityRole="button" disabled={busy} onPress={()=>void run(()=>login('google').then(()=>{}))} style={s.provider}><Image source={require('../../assets/google-logo.png')} style={s.logo} accessible={false}/><Text style={s.providerText}>Log in with Google</Text></Pressable>}
 <Pressable accessibilityRole="button" accessibilityLabel="Log in with email" accessibilityState={{expanded:open}} disabled={busy||!authConfigured} onPress={()=>setOpen(!open)} style={s.provider}><Text style={s.mail}>✉</Text><Text style={s.providerText}>Log in with email</Text></Pressable>
 {open&&!factor&&<View style={{gap:12}}>{field('Email address',email,setEmail)}{field(register?'Create password':'Password',password,setPassword,true)}<Pressable accessibilityRole="button" disabled={busy||!password} onPress={()=>void run(submit)} style={s.continue}><Text style={s.continueText}>{register?'Create account':'Sign in'}</Text></Pressable><Pressable accessibilityRole="button" onPress={()=>{setRegister(!register);setMessage('');}} style={s.link}><Text style={s.body}>{register?'Already have an account? Sign in':'New to BuildWatch? Create account'}</Text></Pressable>{!register&&<Pressable accessibilityRole="button" style={s.link} onPress={()=>void run(async()=>{if(!email.trim())throw Error('Enter your email address first.');const{error}=await adminClient().auth.resetPasswordForEmail(email.trim(),Platform.OS==='web'?{redirectTo:window.location.origin+'/?recovery=1'}:undefined);if(error)throw error;setMessage('If the account exists, check your email for password-reset instructions.');})}><Text style={s.body}>Forgot password?</Text></Pressable>}</View>}
 {!!factor&&<View style={{gap:12}}><Text style={s.body}>Enter the code from your BuildWatch authenticator entry.</Text>{field('Authenticator code',code,setCode)}<Pressable accessibilityRole="button" disabled={busy||!/^\d{6}$/.test(normalizeAuthenticatorCode(code))} onPress={()=>void run(async()=>{const{error}=await adminClient().auth.mfa.challengeAndVerify({factorId:factor,code:normalizeAuthenticatorCode(code)});if(error)throw error;setCode('');await session.refresh();})} style={s.continue}><Text style={s.continueText}>Verify and sign in</Text></Pressable></View>}
 {busy&&<ActivityIndicator accessibilityLabel="Signing in" color={dark?'#e5eee8':'#164A37'}/>}
 {!!message&&<Text accessibilityRole="alert" style={s.body}>{message}</Text>}
 </View><Text style={s.divider}>OR EXPLORE WITHOUT AN ACCOUNT</Text><Pressable accessibilityRole="button" onPress={()=>onGuest('')} style={s.guestButton}><Text style={s.guestText}>Continue as guest</Text></Pressable>
 {Platform.OS==='web'&&!mobile&&<Pressable accessibilityRole="button" onPress={onAdministrator} style={s.admin}><Text style={s.adminText}>Administrator access</Text></Pressable>}
 </View>;
}
const styles=StyleSheet.create({wrap:{width:'100%',maxWidth:440,alignSelf:'center',gap:16},brand:{fontSize:38,fontWeight:'800',letterSpacing:-1.5,color:'#163A30',textAlign:'center'},subtitle:{fontSize:15,color:'#637369',textAlign:'center',marginBottom:8},card:{padding:24,gap:14,backgroundColor:'#fff',borderColor:'#DCE5D9',borderWidth:1,borderRadius:22},title:{fontSize:21,fontWeight:'700',color:'#163A30'},body:{fontSize:14,lineHeight:21,color:'#637369'},provider:{flexDirection:'row',gap:14,alignItems:'center',justifyContent:'center',minHeight:54,borderWidth:1,borderColor:'#CFDCCE',borderRadius:12,backgroundColor:'#F7F9F3'},providerText:{fontSize:16,fontWeight:'600',color:'#173C30'},logo:{width:22,height:22},mail:{fontSize:25,width:24,textAlign:'center',color:'#173C30'},input:{padding:14,fontSize:16,borderWidth:1,borderColor:'#CFDCCE',borderRadius:12,color:'#173C30',backgroundColor:'#F7F9F3'},continue:{minHeight:48,alignItems:'center',justifyContent:'center',borderRadius:12,backgroundColor:'#164A37'},continueText:{fontSize:15,fontWeight:'700',color:'white'},link:{minHeight:44,justifyContent:'center'},divider:{fontSize:10,letterSpacing:1,color:'#637369',textAlign:'center'},guestButton:{minHeight:54,alignItems:'center',justifyContent:'center',borderRadius:16,borderWidth:1,borderColor:'#CFDCCE',backgroundColor:'white'},guestText:{fontSize:15,fontWeight:'600',color:'#234D35'},admin:{alignSelf:'center',minHeight:44,justifyContent:'center',paddingHorizontal:12,marginTop:10},adminText:{fontSize:11,color:'#76867B'}});
