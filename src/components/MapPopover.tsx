import React,{createContext,useCallback,useContext,useEffect,useRef,useState} from 'react';
import {Platform,StyleSheet,View,type GestureResponderEvent} from 'react-native';
type Rect={x:number;y:number;width:number;height:number};
type Popover={content:React.ReactNode;rect:Rect;button:Rect;dismiss:()=>void};
const Context=createContext<{show:(p:Popover)=>void;hide:()=>void}|null>(null);
const inside=(r:Rect,x:number,y:number)=>x>=r.x&&x<=r.x+r.width&&y>=r.y&&y<=r.y+r.height;
/** A root-level, non-modal portal. Only the menu catches input; the map remains interactive. */
export function MapPopoverProvider({children}:{children:React.ReactNode}){
 const[popover,setPopover]=useState<Popover|null>(null),touch=useRef<{outside:boolean;moved:boolean}|null>(null);
 const current=useRef<Popover|null>(null);
 const hide=useCallback(()=>{current.current=null;setPopover(null);},[]);
 const show=useCallback((p:Popover)=>{if(current.current&&current.current.dismiss!==p.dismiss)current.current.dismiss();current.current=p;setPopover(p);},[]);
 useEffect(()=>{if(Platform.OS!=='web'||!popover)return;const click=(e:MouseEvent)=>{if(!(e.target instanceof Element)||e.target.closest('#bw-types-menu,#bw-types-button,#bw-activity-menu,#bw-activity-button'))return;popover.dismiss();};const key=(e:KeyboardEvent)=>{if(e.key==='Escape')popover.dismiss();};document.addEventListener('click',click);document.addEventListener('keydown',key);return()=>{document.removeEventListener('click',click);document.removeEventListener('keydown',key);};},[popover]);
 const start=(e:GestureResponderEvent)=>{if(!popover)return;const{x,y}= {x:e.nativeEvent.pageX,y:e.nativeEvent.pageY};touch.current={outside:!inside(popover.rect,x,y)&&!inside(popover.button,x,y),moved:e.nativeEvent.touches.length>1};};
 return <Context.Provider value={{show,hide}}><View style={{flex:1}} {...(Platform.OS==='web'?{}:{onTouchStartCapture:start,onTouchMoveCapture:()=>{if(touch.current)touch.current.moved=true;},onTouchEndCapture:()=>{if(touch.current?.outside&&!touch.current.moved)popover?.dismiss();touch.current=null;}})}>{children}{popover&&<View pointerEvents="box-none" style={[StyleSheet.absoluteFill,{zIndex:10000}]}>{popover.content}</View>}</View></Context.Provider>;
}
export function useMapPopover(){const value=useContext(Context);if(!value)throw Error('MapPopoverProvider is required.');return value;}
