import React,{createContext,useContext,useEffect,useMemo,useRef,useState,useCallback} from 'react';
import {Platform,type ViewStyle,type TextStyle,type ImageStyle} from 'react-native';
import {readTheme,writeTheme} from './themeStorage';import {darkStyles} from './themePalette';
const Context=createContext({dark:false,error:'',choose:(_dark:boolean)=>{}});
export function ThemeProvider({children}:{children:React.ReactNode}){
 const[dark,setDark]=useState(false),[error,setError]=useState(''),changed=useRef(false),writes=useRef(Promise.resolve());
 useEffect(()=>{let active=true;void readTheme().then(v=>{if(active&&!changed.current)setDark(v==='dark');}).catch(()=>{});return()=>{active=false;};},[]);
 useEffect(()=>{if(Platform.OS==='web'){document.documentElement.style.colorScheme=dark?'dark':'light';document.body.style.backgroundColor=dark?'#101b16':'#F6F7F2';document.body.style.color=dark?'#e5eee8':'#163A30';}},[dark]);
 function choose(value:boolean){changed.current=true;setDark(value);setError('');writes.current=writes.current.then(()=>writeTheme(value?'dark':'light')).catch(()=>setError('This appearance is active, but your device could not save it.'));}
 return <Context.Provider value={{dark,error,choose}}>{children}</Context.Provider>;
}
export const useTheme=()=>useContext(Context);
export function useThemeStyles<T extends Record<string,any>>(styles:T):T{const{dark}=useTheme();return useMemo(()=>dark?darkStyles(styles):styles,[styles,dark]);}
export function useThemeStyle(){const{dark}=useTheme();return useCallback(<T extends ViewStyle|TextStyle|ImageStyle>(value:T):T=>dark?darkStyles({value}).value:value,[dark]);}
