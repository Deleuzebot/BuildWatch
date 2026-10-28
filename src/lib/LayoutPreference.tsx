import React,{createContext,useContext,useEffect,useRef,useState} from 'react';
import {Platform,useWindowDimensions} from 'react-native';
import {readLayout,writeLayout} from './layoutStorage';
type Preference='auto'|'phone'|'web';
const Context=createContext({mobile:false,preference:'auto' as Preference,error:'',choose:(_value:Preference)=>{}});
export function LayoutProvider({children}:{children:React.ReactNode}){
  const{width}=useWindowDimensions();
  const[preference,setPreference]=useState<Preference>('auto'),[error,setError]=useState('');
  const changed=useRef(false),writes=useRef(Promise.resolve());
  useEffect(()=>{let active=true;void readLayout().then(value=>{if(active&&!changed.current&&['auto','phone','web'].includes(value||''))setPreference(value as Preference);}).catch(()=>{});return()=>{active=false;};},[]);
  function choose(value:Preference){changed.current=true;setPreference(value);setError('');writes.current=writes.current.then(()=>writeLayout(value)).catch(()=>setError('This layout is active, but your device could not save the preference.'));}
  const mobile=preference==='phone'||(preference==='auto'&&(Platform.OS!=='web'||width<768));
  return <Context.Provider value={{mobile,preference,error,choose}}>{children}</Context.Provider>;
}
export function useLayoutPreference(){return useContext(Context);}
