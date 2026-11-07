import React,{useState} from 'react';
import {ActivityIndicator,Image,Platform,Pressable,StyleSheet,Text,TextInput,View} from 'react-native';
import {useThemeStyles,useTheme} from '../lib/Theme';import {useSession} from './Session';import {authConfigured} from './auth';import {providerEnabled} from './providers';
export default function AccountEntry({onGuest,onAdministrator}:{onGuest:(query:string)=>void;onAdministrator:()=>void}){
 const s=useThemeStyles(styles),{dark}=useTheme(),session=useSession();
 const[email,setEmail]=useState(''),[emailOpen,setEmailOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const enabled=authConfigured&&session.capabilities.auth;
 async function enter(connection:string,hint?:string){if(busy)return;if(hint!==undefined&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(hint)){setError('Enter your email address to continue.');return;}setBusy(true);setError('');try{await session.signIn(connection,false,hint);}catch(e:any){setError(e.message||'Could not open sign-in. Please try again.');}finally{setBusy(false);}}
 const emailConnection=process.env.EXPO_PUBLIC_AUTH0_EMAIL_CONNECTION||'Username-Password-Authentication';
 return <View style={s.wrap}>
  <Text accessibilityRole="header" style={s.brand}>BuildWatch<Text style={{color:'#D36D43'}}>.</Text></Text>
  <Text style={s.subtitle}>Your community, taking shape.</Text>
  <View style={s.card}>
   <Text style={s.title}>Your BuildWatch account</Text><Text style={s.body}>Sign in or create an account to follow developments.</Text>
   <Pressable accessibilityRole="button" disabled={!enabled||busy} onPress={()=>void enter('google-oauth2')} style={[s.provider,(!enabled||busy)&&s.disabled]}><Image source={require('../../assets/google-logo.png')} style={s.logo} accessible={false}/><Text style={s.providerText}>Log in with Google</Text></Pressable>
   <Pressable accessibilityRole="button" accessibilityLabel="Log in with email" disabled={!enabled||busy} onPress={()=>setEmailOpen(v=>!v)} accessibilityState={{expanded:emailOpen}} style={[s.provider,(!enabled||busy)&&s.disabled]}><Text accessible={false} style={s.mail}>✉</Text><Text style={s.providerText}>Log in with email</Text></Pressable>
   {providerEnabled('apple')&&<Pressable accessibilityRole="button" disabled={!enabled||busy} onPress={()=>void enter('apple')} style={s.provider}><Text style={s.providerText}>Continue with Apple</Text></Pressable>}
   {emailOpen&&<View style={{gap:10}}><Text style={s.label}>BuildWatch email address</Text><TextInput accessibilityLabel="BuildWatch email address" placeholder="you@example.com" placeholderTextColor={dark?'#aebfb5':'#6c7d73'} autoComplete="email" textContentType="emailAddress" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} value={email} onChangeText={setEmail} onSubmitEditing={()=>void enter(emailConnection,email.trim())} style={s.input}/><Pressable accessibilityRole="button" disabled={busy} onPress={()=>void enter(emailConnection,email.trim())} style={s.continue}><Text style={s.continueText}>Sign in or sign up</Text></Pressable></View>}
   {busy&&<ActivityIndicator accessibilityLabel="Opening secure sign-in" color={dark?'#e5eee8':'#164A37'}/>}
   {!enabled&&<Text style={s.body}>Account sign-in is currently unavailable. You can explore as a guest.</Text>}
   {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  </View>
  <Text style={s.divider}>OR EXPLORE WITHOUT AN ACCOUNT</Text>
  <Pressable accessibilityRole="button" onPress={()=>onGuest('')} style={s.guestButton}><Text style={s.guestText}>Continue as guest</Text></Pressable>
  {Platform.OS==='web'&&<Pressable accessibilityRole="button" accessibilityLabel="Administrator access" onPress={onAdministrator} style={s.admin}><Text style={s.adminText}>Administrator access</Text></Pressable>}
 </View>;
}
const styles=StyleSheet.create({wrap:{width:'100%',maxWidth:440,alignSelf:'center',gap:16},brand:{fontSize:38,fontWeight:'800',letterSpacing:-1.5,color:'#163A30',textAlign:'center'},subtitle:{fontSize:15,color:'#637369',textAlign:'center',marginBottom:8},card:{padding:24,gap:14,backgroundColor:'#fff',borderColor:'#DCE5D9',borderWidth:1,borderRadius:22},title:{fontSize:21,fontWeight:'700',color:'#163A30'},body:{fontSize:14,lineHeight:21,color:'#637369'},provider:{flexDirection:'row',gap:14,alignItems:'center',justifyContent:'center',minHeight:54,borderWidth:1,borderColor:'#CFDCCE',borderRadius:12,backgroundColor:'#F7F9F3'},providerText:{fontSize:16,fontWeight:'600',color:'#173C30'},logo:{width:22,height:22},mail:{fontSize:25,width:24,textAlign:'center',color:'#173C30'},disabled:{opacity:.45},label:{fontSize:13,fontWeight:'600',color:'#234D35'},input:{padding:14,fontSize:16,borderWidth:1,borderColor:'#CFDCCE',borderRadius:12,color:'#173C30',backgroundColor:'#F7F9F3'},continue:{minHeight:48,alignItems:'center',justifyContent:'center',borderRadius:12,backgroundColor:'#164A37'},continueText:{fontSize:15,fontWeight:'700',color:'white'},divider:{fontSize:10,letterSpacing:1,color:'#637369',textAlign:'center'},guestButton:{minHeight:54,alignItems:'center',justifyContent:'center',borderRadius:16,borderWidth:1,borderColor:'#CFDCCE',backgroundColor:'white'},guestText:{fontSize:15,fontWeight:'600',color:'#234D35'},admin:{alignSelf:'center',minHeight:44,justifyContent:'center',paddingHorizontal:12,marginTop:10},adminText:{fontSize:11,color:'#76867B'},error:{fontSize:13,lineHeight:20,color:'#923e31'}});
