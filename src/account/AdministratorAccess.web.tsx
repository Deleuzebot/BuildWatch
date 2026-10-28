import React,{useEffect,useState}from'react';
import{View,Text,TextInput,Pressable,StyleSheet}from'react-native';
import{authenticatorQrSource}from'./authenticatorQr';
import{adminClient,administratorToken,activateAdministrator,administratorSelected}from'./adminAuth';
import{useSession}from'./Session';
import{api}from'./http';
import{backendFetch}from'../lib/transport';
import{login}from'./auth.web';
import{administratorStep,normalizeAuthenticatorCode}from'./adminSetup';
export default function AdministratorAccess(){
 const session=useSession(),setup=session.account?.role==='admin'&&!administratorSelected();
 const[email,setEmail]=useState(session.account?.email||''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[code,setCode]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[signed,setSigned]=useState(false),[factors,setFactors]=useState<any[]>([]),[enrolling,setEnrolling]=useState<any>(null),[verifiedNow,setVerifiedNow]=useState(false),[done,setDone]=useState(false);
 const[linked,setLinked]=useState(administratorSelected()),[needsPassword,setNeedsPassword]=useState(false),[restoring,setRestoring]=useState(true);
 const[pending,setPending]=useState<any[]>([]),[showKey,setShowKey]=useState(false),[qrError,setQrError]=useState(false);
 const run=async(fn:()=>Promise<void>)=>{setBusy(true);setMessage('');try{await fn();}catch(e:any){setMessage(e.code==='mfa_verification_failed'?'That code did not match. Wait for a fresh code in the Duo entry you just scanned, then try again.':e.message||'Unable to complete administrator sign-in. Your Auth0 login is unchanged.');}finally{setBusy(false);}};
 const load=async()=>{const{data,error}=await adminClient().auth.mfa.listFactors();if(error)throw error;setFactors(data.totp.filter(f=>f.status==='verified'));setPending(data.all.filter(f=>f.factor_type==='totp'&&f.status==='unverified'));
 const assurance=await adminClient().auth.mfa.getAuthenticatorAssuranceLevel();if(assurance.error)throw assurance.error;
 const elevated=assurance.data.currentLevel==='aal2';setVerifiedNow(elevated);
 if(elevated){const token=await administratorToken();const response=await backendFetch('/api/admin/login/status',{headers:{Authorization:'Bearer '+token}});if(response.ok){const status=await response.json();setLinked(status.linked===true);}else if(response.status===401||response.status===403)setLinked(false);else throw Error('Unable to check setup progress. Try again shortly.');}
 };
 useEffect(()=>{void adminClient().auth.getSession().then(async({data,error})=>{if(error)throw error;if(data.session){setEmail(data.session.user.email||'');await load();setSigned(true);}}).catch(()=>{setNeedsPassword(true);setMessage('Please sign in with your BuildWatch password to resume. Your verified authenticator is preserved.');}).finally(()=>setRestoring(false));},[]);
 const signIn=async()=>{const{error}=await adminClient().auth.signInWithPassword({email:setup?session.account!.email:email.trim(),password});if(error)throw error;setPassword('');setConfirm('');setSigned(true);setNeedsPassword(false);setVerifiedNow(false);await load();};
 const enroll=async()=>{const{data,error}=await adminClient().auth.mfa.enroll({factorType:'totp',friendlyName:(factors.length?'BuildWatch backup ':'BuildWatch administrator ')+new Date().toISOString()});if(error)throw error;setEnrolling(data);setShowKey(false);setQrError(false);setCode('');};
 const verify=async(factorId:string)=>{const{error}=await adminClient().auth.mfa.challengeAndVerify({factorId,code:normalizeAuthenticatorCode(code)});if(error)throw error;setCode('');setEnrolling(null);setVerifiedNow(true);await load();};
 const button=(title:string,fn:()=>Promise<void>,disabled=false)=><Pressable accessibilityRole="button" disabled={busy||disabled} onPress={()=>void run(fn)} style={[s.button,(busy||disabled)&&{opacity:.5}]}><Text style={s.buttonText}>{title}</Text></Pressable>;
 const field=(label:string,value:string,change:(value:string)=>void,secure=false)=><View style={{gap:5}}><Text style={s.label}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={change} secureTextEntry={secure} autoCapitalize="none" autoCorrect={false} style={s.input}/></View>;
 const step=administratorStep(signed,factors.length,verifiedNow,linked);
 const finish=async()=>{
 if(!linked){
 const proof=await login(undefined,true,true);
 const token=await administratorToken();
 const response=await backendFetch('/api/admin/login/link',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+proof},body:JSON.stringify({secondaryToken:token}),signal:AbortSignal.timeout(20000)});
 const result=await response.json();if(!response.ok)throw Error(result.error||'Unable to confirm ownership. Your authenticator setup is saved; try again.');setLinked(true);
 }
 await activateAdministrator();await session.refresh();setDone(true);
 };
 const qrSource=(()=>{if(!enrolling)return null;try{return authenticatorQrSource(enrolling.totp.qr_code);}catch{return null;}})();
 return <View style={s.card}><Text accessibilityRole="header" style={s.heading}>Administrator security</Text><Text style={s.text}>Use your BuildWatch administrator password and Duo code. Setup progress is saved in this tab. Your projects, permissions, and history stay with your existing account.</Text>
 {!!message&&<Text accessibilityRole="alert" style={s.notice}>{message}</Text>}{busy&&<Text style={s.text}>Working…</Text>}
 {restoring?<Text style={s.text}>Restoring your setup progress…</Text>:done?<><Text style={s.text}>Supabase administrator login is active and verified. You can now open Admin Dashboard. Keep your password and authenticator safe.</Text></>:<>
 {(!signed||needsPassword)?<>
 {setup&&!needsPassword?<Text style={s.text}>Account: {session.account?.email}. Setup requires a recent Auth0 login with MFA. Use a new, unique passphrase of 14–72 UTF-8 bytes.</Text>:field('Administrator email',email,setEmail)}
 {field(setup?'New or existing administrator password':'Administrator password',password,setPassword,true)}
 {setup&&!needsPassword&&<>{field('Confirm new administrator password',confirm,setConfirm,true)}{button('Create free administrator login',async()=>{if(password!==confirm)throw Error('Passwords do not match.');await api('/api/admin/login/provision','POST',{password});await signIn();},!password||password!==confirm)}{button('Verify current Auth0 login',async()=>session.signIn(undefined,true))}</>}
 {button('Sign in with administrator password',signIn,!password||(!setup&&!email.trim()))}
 <Text style={s.text}>If you forgot this password, use your still-working Auth0 login or the protected Supabase Dashboard recovery procedure. Creating an account or matching this email never grants administrator access.</Text>
 </>:<>
 <Text style={s.text}>{step==='primary'?'Step 2 of 3 — Add your authenticator.':step==='verify'?'Enter a fresh Duo code to continue.':step==='link'?'Step 3 of 3 — Your authenticator is verified. Confirm administrator ownership once to finish.':'Your administrator login is ready.'}</Text>
 {enrolling?<><Text style={s.label}>In Duo Mobile, choose Add → Use QR code, then scan privately.</Text>{qrSource&&<img alt="Private authenticator enrollment QR code" src={qrSource} width={220} height={220} onError={()=>setQrError(true)} style={{display:'block',alignSelf:'center',background:'#fff',maxWidth:'100%'}}/>}{(qrError||!qrSource)&&<Text style={s.notice}>The QR image could not load. Use the private manual setup key below.</Text>}{button(showKey?'Hide private setup key':'Enter setup key manually',async()=>setShowKey(!showKey))}{showKey&&<><Text style={s.text}>In Duo Mobile, choose Add → Add other account and enter this key. Keep it private.</Text><Text selectable accessibilityLabel="Private authenticator setup key" style={s.label}>{enrolling.totp.secret}</Text></>}{field('Authenticator setup code',code,setCode)}{button('Verify new authenticator',()=>verify(enrolling.id),!/^\d{6}$/.test(normalizeAuthenticatorCode(code)))}{button('Cancel this unverified enrollment',async()=>{const{error}=await adminClient().auth.mfa.unenroll({factorId:enrolling.id});if(error)throw error;setEnrolling(null);setShowKey(false);setCode('');await load();})}</>:<>
 {pending.length>0&&<><Text style={s.text}>An earlier setup was not verified. These incomplete entries do not grant access.</Text>{pending.map(f=><React.Fragment key={f.id}>{button('Cancel incomplete enrollment '+(f.friendly_name||''),async()=>{const{data,error}=await adminClient().auth.mfa.listFactors();if(error)throw error;if(data.all.find(v=>v.id===f.id)?.status==='verified'){await load();throw Error('That authenticator is now verified and was kept.');}const result=await adminClient().auth.mfa.unenroll({factorId:f.id});if(result.error)throw result.error;await load();})}</React.Fragment>)}</>}
 {factors.length>0&&!verifiedNow&&<>{field('Authenticator code',code,setCode)}{factors.map(f=><React.Fragment key={f.id}>{button(factors.length>1?'Verify with '+(f.friendly_name?.startsWith('BuildWatch backup')?'backup authenticator':'primary authenticator'):'Verify Duo code',()=>verify(f.id),!/^\d{6}$/.test(normalizeAuthenticatorCode(code)))}</React.Fragment>)}</>}
 {step==='primary'&&button('Set up authenticator',enroll)}

 {(step==='link'||step==='ready')&&<>{step==='link'&&<Text style={s.text}>A one-time Auth0 window confirms that you own the old administrator account. This prevents someone from claiming your permissions. After linking, sign in with your BuildWatch password and Duo; Auth0 stays available as a fallback.</Text>}{button(step==='link'?'Confirm ownership and finish setup':'Open administrator account',finish)}</>}
 {button('Sign in again with my BuildWatch password',async()=>{setNeedsPassword(true);setVerifiedNow(false);setEnrolling(null);setCode('');})}
 </>}
 </>}
 </>}
 {!administratorSelected()&&button('Use existing Auth0 login instead',async()=>{window.sessionStorage.setItem('buildwatch-admin-setup-return','1');await session.signIn(undefined,true);})}
 <Text style={s.text}>One authenticator is required. If you lose access to it, administrator recovery will be needed. Never share passwords, QR codes, setup keys, or verification codes in chat.</Text></View>;
}
const s=StyleSheet.create({card:{padding:18,gap:14,borderRadius:18,backgroundColor:'#fff',borderColor:'#dce3dd',borderWidth:1},heading:{fontSize:21,fontWeight:'700',color:'#173d31'},text:{fontSize:14,lineHeight:21,color:'#4e6057'},label:{fontSize:14,fontWeight:'600',color:'#173d31'},input:{padding:12,borderWidth:1,borderColor:'#cad5cc',borderRadius:10,fontSize:16,color:'#183c30'},button:{padding:13,borderRadius:11,backgroundColor:'#214b3c'},buttonText:{color:'#fff',fontWeight:'600',textAlign:'center'},notice:{color:'#8e342a',fontSize:14,lineHeight:20}});
