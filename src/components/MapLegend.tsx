import React,{useState} from 'react';
import{Modal,Pressable,ScrollView,Text,View,StyleSheet,Linking}from'react-native';
import type{MapNode}from'../lib/mapTypes';
import{clusterAppearance}from'../lib/mapAppearance';
import{statusColors}from'../data/projects';
import{stateNames}from'../lib/stateNames';
export default function MapLegend({nodes,boundaryError}:{nodes:MapNode[];boundaryError?:boolean}){
 const[open,setOpen]=useState(false);
 const states=[...new Set(nodes.filter(n=>n.count>1&&n.state&&stateNames[n.state]).map(n=>n.state!))].sort((a,b)=>stateNames[a].localeCompare(stateNames[b]));
 const row=(label:string,color:string,pin=false)=><View key={label} style={s.row}><View style={[s.swatch,{backgroundColor:color,borderRadius:pin?3:12},pin&&{transform:[{rotate:'-45deg'}]}]}/><Text style={s.text}>{label}</Text></View>;
 return <><Pressable accessibilityRole="button" accessibilityLabel="Open map color key" onPress={()=>setOpen(true)} style={s.button}><Text style={s.buttonText}>Map key</Text></Pressable>
 <Modal visible={open} transparent animationType="fade" onRequestClose={()=>setOpen(false)}><View style={s.backdrop}><View style={s.panel}>
 <View style={s.top}><Text accessibilityRole="header" style={s.title}>Map key</Text><Pressable accessibilityRole="button" onPress={()=>setOpen(false)} style={{padding:12}}><Text style={s.buttonText}>Done</Text></Pressable></View>
 <ScrollView><Text style={s.heading}>Cluster color = state</Text><Text style={s.text}>Numbered bubbles group developments. Select a bubble to zoom in. Individual pins show development status.</Text>
 {states.map(code=>row(stateNames[code],clusterAppearance(code).background))}
 {row('Multiple states or unknown state',clusterAppearance(null).background)}
 {!states.length&&<Text style={s.text}>State colors appear on clusters as you zoom out.</Text>}
 <Text style={s.heading}>Pin color = development status</Text>
 {Object.entries(statusColors).filter(([status])=>!['Completed','Cancelled'].includes(status)&&(status!=='On hold'||nodes.some(n=>n.count===1&&n.status==='On hold'))).map(([status,color])=>row(status,color,true))}
 <Text style={s.heading}>State outlines</Text><Text style={s.text}>Subtle outlines fade as you zoom in. Generalized boundaries are for orientation, not parcel or legal boundaries.</Text>
 {boundaryError&&<Text accessibilityRole="alert" style={s.text}>State outlines are temporarily unavailable. Project markers are still available.</Text>}
 <Pressable accessibilityRole="link" onPress={()=>void Linking.openURL('https://www.census.gov/geographies/mapping-files/2025/geo/carto-boundary-file.html')}><Text style={[s.text,{color:'#2466A5',paddingVertical:12}]}>Source: U.S. Census Bureau, 2025 · 1:20m ↗</Text></Pressable>
 </ScrollView></View></View></Modal></>;
}
const s=StyleSheet.create({button:{position:'absolute',top:12,left:60,zIndex:1000,backgroundColor:'#FFFFFF',borderRadius:12,paddingHorizontal:12,paddingVertical:10,shadowColor:'#000',shadowOpacity:.1,shadowRadius:3,elevation:3},buttonText:{color:'#203F36',fontWeight:'700',fontSize:13},backdrop:{flex:1,backgroundColor:'#0006',justifyContent:'center',alignItems:'center',padding:20},panel:{width:'100%',maxWidth:480,maxHeight:'80%',backgroundColor:'#F6F7F2',borderRadius:20,padding:20},top:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:10},title:{fontSize:22,fontWeight:'800',color:'#203F36'},heading:{fontSize:16,fontWeight:'700',color:'#203F36',marginTop:18,marginBottom:10},text:{color:'#344C42',fontSize:14,lineHeight:21},row:{flexDirection:'row',alignItems:'center',gap:12,marginVertical:8},swatch:{width:18,height:18,borderWidth:1,borderColor:'#0002'}});
