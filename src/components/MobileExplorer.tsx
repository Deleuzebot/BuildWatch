import ActivityFilter from './ActivityFilter';
import type {ActivityPeriod} from '../lib/activity';
import TypeFilter from './TypeFilter';
import type {PrimaryCategory} from '../lib/categories';
import React from 'react';
import {ActivityIndicator,Keyboard,KeyboardAvoidingView,Platform,Pressable,StyleSheet,Text,TextInput,View,ScrollView} from 'react-native';
import ProjectMap from './ProjectMap';
import type {Project,Status} from '../data/projects';
import {statusColors} from '../data/projects';
import type {MapNode} from '../lib/mapTypes';
import type {useMapBrowser} from '../lib/useMapBrowser';

const filters:Status[]=['Proposed','In review','Approved','Under construction'];
type Props={browser:ReturnType<typeof useMapBrowser>;query:string;status:Status|'All';activity:ActivityPeriod|null;onActivity:(v:ActivityPeriod|null)=>void;types:PrimaryCategory[];onTypes:(v:PrimaryCategory[])=>void;onQuery:(v:string)=>void;onStatus:(v:Status|'All')=>void;preview:Project|null;onSelect:(p:{id:string})=>void;onOpen:()=>void;onDismiss:()=>void;onCluster:(n:MapNode)=>void;onMenu:()=>void;onCoverage:()=>void;onRefresh:()=>void;resetKey:number;message:string;canEdit:boolean;onAdd:()=>void};
export default function MobileExplorer(p:Props){
  return <KeyboardAvoidingView style={s.page} behavior={Platform.OS==='ios'?'padding':undefined}>
    <View style={s.header}>
      <Text accessibilityRole="header" style={s.brand}>BuildWatch<Text style={{color:'#D36D43'}}>.</Text></Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Open navigation menu" onPress={p.onMenu} style={s.menu}><Text style={s.buttonText}>Menu</Text></Pressable>
    </View>
    <View style={s.map}>
      <ProjectMap projects={[]} nodes={p.browser.feed?.nodes||[]} onViewport={p.browser.onViewport} onSelectId={id=>{Keyboard.dismiss();p.onSelect({id});}} onSelect={p.onSelect} onCluster={p.onCluster} focusBounds={p.browser.focusBounds} resetKey={p.resetKey} showControls={false} selectedProjectId={p.preview?.id} onBackgroundPress={()=>{Keyboard.dismiss();p.onDismiss();}}/>
      {!!p.message&&<View pointerEvents="none" style={{position:"absolute",top:12,left:12,right:12}}><Text accessibilityRole="status" style={{backgroundColor:"#F6F7F2",padding:10,borderRadius:10,color:"#6D613C",fontSize:12}}>{p.message}</Text></View>}
    </View>
    <View style={s.dock}>
      <View style={s.handle}/>
      {p.preview&&<View style={s.preview}>
        <View style={s.previewTop}><View style={{flex:1,gap:8}}><Text accessibilityRole="header" style={s.title}>{p.preview.name}</Text><View style={s.status}><View style={[s.dot,{backgroundColor:statusColors[p.preview.status]}]}/><Text style={s.statusText}>{p.preview.status}</Text></View></View><Pressable accessibilityRole="button" accessibilityLabel="Close project preview" onPress={p.onDismiss} style={s.close}><Text style={s.closeText}>×</Text></Pressable></View>
        <Text numberOfLines={1} style={s.address}>{p.preview.address}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={'Open '+p.preview.name} onPress={p.onOpen} style={s.open}><Text style={s.openText}>Open</Text><Text style={s.openText}>↗</Text></Pressable>
      </View>}
      <View style={s.countRow}><Text accessibilityRole="status" style={s.count}>{p.browser.loading&&!p.browser.catalog?'Loading records…':p.browser.total.toLocaleString()+' '+(p.browser.total===1?'record':'records')}</Text><View style={s.tools}>{p.browser.loading&&<ActivityIndicator size="small" color="#315C49"/>}{p.canEdit&&<Pressable accessibilityRole="button" accessibilityLabel="Add development project" onPress={p.onAdd} style={s.tool}><Text style={s.buttonText}>＋ Add</Text></Pressable>}<Pressable accessibilityRole="button" accessibilityLabel="Refresh map" onPress={p.onRefresh} style={s.tool}><Text style={s.buttonText}>↻</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Coverage and sources" onPress={p.onCoverage} style={s.tool}><Text style={s.buttonText}>ⓘ</Text></Pressable></View></View>
      {!p.browser.loading&&!p.browser.error&&p.browser.total===0&&<Text style={s.message}>No matching developments. Try another search or clear the selected filter.</Text>}
      <View style={s.searchRow}><Text accessible={false} style={s.searchIcon}>⌕</Text><TextInput accessibilityLabel="Search projects" placeholder="Search projects or places" placeholderTextColor="#64756C" value={p.query} onChangeText={p.onQuery} returnKeyType="search" onSubmitEditing={()=>Keyboard.dismiss()} autoCorrect={false} style={s.search}/>{!!p.query&&<Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={()=>p.onQuery('')} style={s.tool}><Text style={s.closeText}>×</Text></Pressable>}</View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel="Development status filters" contentContainerStyle={s.filters} style={{flexGrow:0}}>{filters.map(status=><Pressable key={status} accessibilityRole="button" accessibilityLabel={'Filter '+status} accessibilityState={{selected:p.status===status}} onPress={()=>{Keyboard.dismiss();p.onStatus(p.status===status?'All':status);}} style={[s.filter,p.status===status&&s.active]}><View style={[s.dot,{backgroundColor:statusColors[status]}]}/><Text style={[s.filterText,p.status===status&&s.activeText]}>{status}</Text></Pressable>)}<TypeFilter selected={p.types} onChange={p.onTypes}/><ActivityFilter value={p.activity} onChange={p.onActivity}/></ScrollView>
    </View>
  </KeyboardAvoidingView>;
}
const s=StyleSheet.create({
  page:{flex:1,minHeight:0,backgroundColor:'#F6F7F2'},header:{height:56,paddingHorizontal:18,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},brand:{fontSize:24,fontWeight:'800',letterSpacing:-.9,color:'#173D32'},menu:{padding:12,borderRadius:22,backgroundColor:'#E2EAE2'},buttonText:{fontSize:14,fontWeight:'700',color:'#254D3C'},map:{flex:1,minHeight:150,position:'relative',overflow:'hidden'},dock:{backgroundColor:'#F6F7F2',borderTopLeftRadius:24,borderTopRightRadius:24,paddingHorizontal:16,paddingBottom:10,marginTop:-18,shadowColor:'#173D32',shadowOpacity:.13,shadowRadius:12,elevation:8},handle:{width:32,height:4,borderRadius:2,backgroundColor:'#C5CFC6',alignSelf:'center',marginTop:8,marginBottom:6},countRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',minHeight:44},count:{fontSize:17,fontWeight:'800',color:'#214537'},tools:{flexDirection:'row',alignItems:'center'},tool:{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'},searchRow:{flexDirection:'row',alignItems:'center',borderRadius:16,backgroundColor:'#E7ECE6',minHeight:44,marginBottom:8},searchIcon:{fontSize:26,color:'#566D5F',paddingLeft:13,paddingRight:8},search:{flex:1,minWidth:0,fontSize:16,color:'#173D32',paddingVertical:10,paddingRight:8},filters:{flexDirection:'row',gap:8,paddingRight:4},filter:{flexShrink:0,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7,minHeight:44,paddingHorizontal:14,borderRadius:14,backgroundColor:'white',borderWidth:1,borderColor:'#DAE3D9'},active:{backgroundColor:'#214D3B',borderColor:'#214D3B'},filterText:{fontSize:12,fontWeight:'600',color:'#45614E'},activeText:{color:'white'},dot:{width:8,height:8,borderRadius:4},preview:{position:'absolute',bottom:'100%',left:12,right:12,padding:16,backgroundColor:'#F6F7F2',borderRadius:22,marginBottom:10,gap:10,shadowColor:'#173D32',shadowOpacity:.15,shadowRadius:12,elevation:10},previewTop:{flexDirection:'row',alignItems:'flex-start',gap:8},title:{fontSize:20,lineHeight:25,fontWeight:'800',color:'#193F32'},status:{flexDirection:'row',alignItems:'center',gap:6},statusText:{fontSize:13,fontWeight:'600',color:'#4A6352'},close:{width:44,height:44,alignItems:'center',justifyContent:'center',backgroundColor:'#E5EBE3',borderRadius:22},closeText:{fontSize:24,color:'#42604D'},address:{fontSize:13,color:'#617263'},open:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:17,minHeight:46,backgroundColor:'#214D3B',borderRadius:14},openText:{color:'white',fontSize:16,fontWeight:'700'},message:{fontSize:12,lineHeight:18,color:'#6D613C',paddingBottom:8}
});
