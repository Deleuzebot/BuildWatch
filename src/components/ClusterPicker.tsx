import React,{useEffect,useRef,useState} from 'react';
import {Modal,Pressable,ScrollView,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {MapNode,BrowseResult,ProjectSummary} from '../lib/mapTypes';
import {boundsParam,mapRequest} from '../lib/mapClient';
export default function ClusterPicker({node,query,status,types=[],activity=null,onClose,onSelect}:{node:MapNode|null;query:string;status:string;types?:string[];activity?:string|null;onClose:()=>void;onSelect:(id:string)=>void}){
  const[items,setItems]=useState<ProjectSummary[]>([]),[total,setTotal]=useState(0),[cursor,setCursor]=useState<string|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const request=useRef<AbortController|null>(null),loading=useRef(false);
  const path=node?'/api/browse?'+new URLSearchParams({bbox:boundsParam(node.bounds),search:query.trim(),status,types:types.join(','),activity:activity||'',limit:'50'}).toString():'';
  async function load(next:string|null){if(!path||loading.current)return;loading.current=true;setBusy(true);const controller=new AbortController();request.current=controller;
    try{const page=await mapRequest<BrowseResult>(path+(next?'&cursor='+next:''),controller.signal);if(controller.signal.aborted)return;setItems(old=>next?[...old,...page.items]:page.items);setTotal(page.total);setCursor(page.nextCursor);setError('');}
    catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Could not load records.');}finally{if(!controller.signal.aborted){setBusy(false);loading.current=false;}}
  }
  useEffect(()=>{request.current?.abort();loading.current=false;setItems([]);setTotal(0);setCursor(null);if(path)void load(null);return()=>request.current?.abort();},[path]);
  return <Modal visible={!!node} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}><SafeAreaView style={{flex:1,backgroundColor:'#F6F7F2',padding:22}}>
    <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:16}}><Text style={{fontSize:20,fontWeight:'800',color:'#203F36'}}>Developments at this location</Text><Pressable accessibilityRole="button" onPress={onClose}><Text style={{padding:12,color:'#203F36'}}>Done</Text></Pressable></View>
    <Text>{busy&&!items.length?'Loading records…':`${total.toLocaleString()} matching records`}</Text>{!!error&&<Text accessibilityRole="alert">{error}</Text>}
    <ScrollView>{items.map(p=><Pressable key={p.id} accessibilityRole="button" onPress={()=>onSelect(p.id)} style={{padding:16,marginVertical:6,backgroundColor:'white',borderRadius:14}}><Text style={{fontWeight:'700',color:'#203F36'}}>{p.name}</Text><Text>{p.address}</Text><Text>{p.status}</Text></Pressable>)}
      {cursor&&<Pressable accessibilityRole="button" disabled={busy} onPress={()=>void load(cursor)}><Text style={{padding:16,color:'#203F36'}}>{busy?'Loading…':'Load more developments'}</Text></Pressable>}
    </ScrollView>
  </SafeAreaView></Modal>;
}
