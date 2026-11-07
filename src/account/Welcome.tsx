import React,{createContext,useContext,useEffect,useState} from "react";
import {Pressable,ScrollView,StyleSheet,Text,View} from "react-native";
import {SafeAreaProvider,SafeAreaView} from "react-native-safe-area-context";
import {StatusBar} from "expo-status-bar";
import {useSession} from "./Session";
import {hasChosenAccess,rememberAccessChoice,forgetAccessChoice} from "./welcomeStorage";
import AccountEntry from "./AccountEntry";
import AdministratorAccess from "./AdministratorAccess";
import {useTheme,useThemeStyles} from "../lib/Theme";
const WelcomeContext=createContext({showWelcome:()=>{},guestSearch:null as string|null,clearGuestSearch:()=>{},exploreAsGuest:(_query:string)=>{}});
export const useWelcome=()=>useContext(WelcomeContext);
export default function WelcomeGate({children}:{children:React.ReactNode}){
 const{account}=useSession(),theme=useTheme(),s=useThemeStyles(styles);
 const[chosen,setChosen]=useState<boolean|null>(null),[reopened,setReopened]=useState(false),[adminOpen,setAdminOpen]=useState(false),[guestSearch,setGuestSearch]=useState<string|null>(null);
 useEffect(()=>{void hasChosenAccess().then(setChosen).catch(()=>setChosen(false));},[]);
 useEffect(()=>{if(account){setChosen(true);setReopened(false);void rememberAccessChoice().catch(()=>{});}},[account?.id]);
 function exploreAsGuest(query:string){setGuestSearch(query);setChosen(true);setReopened(false);void rememberAccessChoice().catch(()=>{});}
 const value={showWelcome:()=>{void forgetAccessChoice().catch(()=>{});setChosen(false);setReopened(true);},guestSearch,clearGuestSearch:()=>setGuestSearch(null),exploreAsGuest};
 return <WelcomeContext.Provider value={value}>{(chosen||account)&&!reopened?children:<SafeAreaProvider><SafeAreaView style={s.page}><StatusBar style={theme.dark?"light":"dark"}/><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.scroll}>{adminOpen?<View style={s.admin}><Pressable accessibilityRole="button" onPress={()=>setAdminOpen(false)} style={s.back}><Text style={s.text}>← Back to BuildWatch</Text></Pressable><AdministratorAccess/></View>:<AccountEntry onGuest={exploreAsGuest} onAdministrator={()=>setAdminOpen(true)}/>}</ScrollView></SafeAreaView></SafeAreaProvider>}</WelcomeContext.Provider>;
}
const styles=StyleSheet.create({page:{flex:1,backgroundColor:"#F6F7F2"},scroll:{flexGrow:1,padding:24,justifyContent:"center"},admin:{width:"100%",maxWidth:520,alignSelf:"center",gap:16},back:{minHeight:44,justifyContent:"center"},text:{color:"#163A30",fontSize:14}});
