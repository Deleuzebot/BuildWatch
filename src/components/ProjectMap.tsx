import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Text,View,useWindowDimensions} from 'react-native';
import MapView,{Marker,Polyline,Circle} from 'react-native-maps';
import {statusColors} from '../data/projects';
import {center,ProjectMapProps} from './ProjectMap.types';
import {clusterProjects} from '../lib/mapClusters';
import MapLegend from './MapLegend';
import{clusterAppearance,boundaryOpacity,overlapsBounds}from'../lib/mapAppearance';
import{useStateBoundaries}from'../lib/stateBoundaries';
import type{Bounds}from'../lib/mapTypes';
import type {MapNode} from '../lib/mapTypes';
export default function ProjectMap({projects,onSelect,resetKey,onPlace,nodes,onViewport,onSelectId,onCluster,focusBounds,onBackgroundPress,selectedProjectId,showControls=true}:ProjectMapProps){
  const ref=useRef<MapView>(null),fitted=useRef<number|null>(null),region=useRef(center);
  const[zoom,setZoom]=useState(7),[ready,setReady]=useState(false);const{width}=useWindowDimensions();
  const[extent,setExtent]=useState<Bounds|null>(null);
  const outlines=useStateBoundaries(ready&&boundaryOpacity(zoom)>0);
  const visibleLines=useMemo(()=>extent&&boundaryOpacity(zoom)>0?(outlines.data?.lines||[]).filter(line=>overlapsBounds(line.bounds,extent)):[],[extent,outlines.data,zoom]);
  const display=useMemo<MapNode[]>(()=>nodes||clusterProjects(projects,onPlace?17:zoom).map(g=>({id:g.id,count:g.projects.length,latitude:g.latitude,longitude:g.longitude,state:g.projects.every(p=>p.state&&p.state===g.projects[0].state)?g.projects[0].state!:null,bounds:{west:Math.min(...g.projects.map(p=>p.longitude)),east:Math.max(...g.projects.map(p=>p.longitude)),south:Math.min(...g.projects.map(p=>p.latitude)),north:Math.max(...g.projects.map(p=>p.latitude))},...(g.projects.length===1?{projectId:g.projects[0].id,name:g.projects[0].name,status:g.projects[0].status}:{})})),[nodes,projects,onPlace,zoom]);
  useEffect(()=>{if(!ready||fitted.current===resetKey)return;let b=focusBounds;if(!b&&nodes===undefined&&projects.length)b={west:Math.min(...projects.map(p=>p.longitude)),east:Math.max(...projects.map(p=>p.longitude)),south:Math.min(...projects.map(p=>p.latitude)),north:Math.max(...projects.map(p=>p.latitude))};if(!b)return;fitted.current=resetKey;ref.current?.fitToCoordinates([{latitude:b.south,longitude:b.west},{latitude:b.north,longitude:b.east}],{edgePadding:{top:40,bottom:40,left:40,right:40},animated:true});},[ready,resetKey,focusBounds,nodes,projects]);
  return <View style={{flex:1}}><MapView ref={ref} style={{flex:1}} initialRegion={center} accessibilityLabel="Development projects and permit records"
    onMapReady={()=>setReady(true)} onRegionChangeComplete={r=>{region.current=r;const z=Math.max(0,Math.min(20,Math.floor(Math.log2(width*360/(256*Math.max(.0001,r.longitudeDelta))))));setZoom(z);const wrap=(v:number)=>((v+180)%360+360)%360-180;const extent={west:r.longitudeDelta>=360?-180:wrap(r.longitude-r.longitudeDelta/2),east:r.longitudeDelta>=360?180:wrap(r.longitude+r.longitudeDelta/2),south:Math.max(-90,r.latitude-r.latitudeDelta/2),north:Math.min(90,r.latitude+r.latitudeDelta/2),zoom:z};setExtent(extent);onViewport?.(extent);}}
    onPress={e=>{if(e.nativeEvent.action==='marker-press')return;onBackgroundPress?.();onPlace?.(e.nativeEvent.coordinate.latitude,e.nativeEvent.coordinate.longitude);}} showsCompass={showControls} showsScale={showControls} toolbarEnabled={showControls}>
    {visibleLines.map(line=><Polyline key={line.id} coordinates={line.coordinates.map(([longitude,latitude])=>({latitude,longitude}))} strokeColor={`rgba(51,74,64,${boundaryOpacity(zoom)})`} strokeWidth={.8} tappable={false} zIndex={0}/>)}
    {display.filter(n=>n.count===1&&n.projectId===selectedProjectId).map(n=><Circle key={'selection-'+n.id} center={n} radius={Math.max(6,region.current.longitudeDelta*111320*Math.cos(n.latitude*Math.PI/180)/width*22)} strokeColor="#214D3B" strokeWidth={3} fillColor="rgba(33,77,59,0.18)" zIndex={5}/>)}
    {display.map(n=>n.count>1?<Marker zIndex={10} key={`${n.id}:${n.count}:${n.state}`} coordinate={n} title={`${n.count.toLocaleString()} map records · ${clusterAppearance(n.state).label}. Zoom in`} accessibilityLabel={`${n.count.toLocaleString()} map records · ${clusterAppearance(n.state).label}. Zoom in`} tracksViewChanges={false}
      onPress={e=>{e.stopPropagation();if(zoom>=17&&onCluster){onCluster(n);return;}ref.current?.animateToRegion({latitude:n.latitude,longitude:n.longitude,latitudeDelta:Math.min(region.current.latitudeDelta/2,Math.max(.00001,n.bounds.north-n.bounds.south)*1.3),longitudeDelta:Math.min(region.current.longitudeDelta/2,Math.max(.00001,n.bounds.east-n.bounds.west)*1.3)});}}>
      <View style={{minWidth:46,height:46,paddingHorizontal:5,borderRadius:23,backgroundColor:clusterAppearance(n.state).background,borderWidth:3,borderColor:'white',alignItems:'center',justifyContent:'center'}}><Text style={{color:clusterAppearance(n.state).text,fontWeight:'700'}}>{n.count.toLocaleString()}</Text></View>
    </Marker>:<Marker zIndex={n.projectId===selectedProjectId?1000:10} key={n.id} identifier={n.projectId} coordinate={n} pinColor={statusColors[n.status||'Proposed']} title={n.name} description={n.status} onPress={e=>{e.stopPropagation();if(n.projectId&&onSelectId)onSelectId(n.projectId);else{const p=projects.find(p=>p.id===n.projectId);if(p)onSelect(p);}}}/>)}
  </MapView>{showControls&&<MapLegend nodes={display} boundaryError={outlines.error}/>}</View>;
}
