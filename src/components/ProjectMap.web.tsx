import React, { useEffect, useMemo, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { statusColors } from '../data/projects';
import { center, ProjectMapProps } from './ProjectMap.types';
import { clusterProjects } from '../lib/mapClusters';
import MapLegend from './MapLegend';
import {clusterAppearance,boundaryOpacity,boundaryStyle,overlapsBounds} from '../lib/mapAppearance';
import {useStateBoundaries} from '../lib/stateBoundaries';
import type {Bounds} from '../lib/mapTypes';
import type { MapNode } from '../lib/mapTypes';
export default function ProjectMap({ projects, onSelect, resetKey, onPlace, nodes, onViewport, onSelectId, onCluster, focusBounds, onBackgroundPress, selectedProjectId, showControls = true }: ProjectMapProps) {
  const container=useRef<HTMLDivElement>(null),map=useRef<Leaflet.Map|null>(null),library=useRef<typeof Leaflet|null>(null);
  const markers=useRef(new Map<string,{marker:Leaflet.Marker;signature:string}>());
  const callbacks=useRef({onPlace,onSelect,onViewport,onSelectId,onCluster,onBackgroundPress});callbacks.current={onPlace,onSelect,onViewport,onSelectId,onCluster,onBackgroundPress};
  const projectsRef=useRef(projects);projectsRef.current=projects;
  const [ready,setReady]=useState(false),[zoom,setZoom]=useState(7),[tileError,setTileError]=useState(false),[loadError,setLoadError]=useState(false);
  const [extent,setExtent]=useState<Bounds|null>(null);
  const outlines=useStateBoundaries(ready&&boundaryOpacity(zoom)>0);
  const lines=useRef(new Map<string,Leaflet.Polyline>());
  const fitted=useRef<number|null>(null);
  const display=useMemo<MapNode[]>(()=>nodes||clusterProjects(projects,onPlace?17:zoom).map(g=>({id:g.id,count:g.projects.length,latitude:g.latitude,longitude:g.longitude,state:g.projects.every(p=>p.state&&p.state===g.projects[0].state)?g.projects[0].state!:null,bounds:{west:Math.min(...g.projects.map(p=>p.longitude)),east:Math.max(...g.projects.map(p=>p.longitude)),south:Math.min(...g.projects.map(p=>p.latitude)),north:Math.max(...g.projects.map(p=>p.latitude))},...(g.projects.length===1?{projectId:g.projects[0].id,name:g.projects[0].name,status:g.projects[0].status}:{})})),[nodes,projects,zoom,onPlace]);
  const currentNodes=useRef(new Map<string,MapNode>());currentNodes.current=new Map(display.map(n=>[n.id,n]));
  useEffect(()=>{
    let disposed=false;let observer:ResizeObserver|undefined;
    void import('leaflet').then(L=>{
      if(disposed||!container.current)return;library.current=L;
      const instance=L.map(container.current,{zoomControl:showControls}).setView([center.latitude,center.longitude],7);map.current=instance;
      const boundaryPane=instance.createPane('stateBoundaries');boundaryPane.style.zIndex='350';boundaryPane.style.pointerEvents='none';boundaryPane.setAttribute('aria-hidden','true');
      const notify=()=>{const b=instance.getBounds(),width=b.getEast()-b.getWest();const wrap=(v:number)=>((v+180)%360+360)%360-180;
        const extent={west:width>=360?-180:wrap(b.getWest()),east:width>=360?180:wrap(b.getEast()),south:Math.max(-90,b.getSouth()),north:Math.min(90,b.getNorth()),zoom:Math.max(0,Math.min(20,instance.getZoom()))};setExtent(extent);callbacks.current.onViewport?.(extent);};
      instance.on('zoomend',()=>setZoom(instance.getZoom()));instance.on('moveend',notify);
      instance.on('click',e=>{callbacks.current.onBackgroundPress?.();callbacks.current.onPlace?.(e.latlng.lat,e.latlng.lng);});
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).on('tileerror',()=>setTileError(true)).addTo(instance);
      observer=new ResizeObserver(()=>instance.invalidateSize());observer.observe(container.current);setReady(true);notify();
    }).catch(()=>{if(!disposed)setLoadError(true);});
    return()=>{disposed=true;observer?.disconnect();map.current?.remove();map.current=null;markers.current.clear();lines.current.clear();};
  },[]);
  useEffect(()=>{
    const instance=map.current;if(!ready||!instance)return;
    if(showControls){if(!instance.zoomControl&&library.current)instance.zoomControl=library.current.control.zoom();instance.zoomControl?.addTo(instance);}else instance.zoomControl?.remove();
  },[ready,showControls]);
  useEffect(()=>{
    const L=library.current,instance=map.current;if(!ready||!L||!instance)return;
    const keys=new Set(display.map(n=>n.id));for(const[key,value]of markers.current)if(!keys.has(key)){value.marker.remove();markers.current.delete(key);}
    for(const node of display){
      const appearance=clusterAppearance(node.state);
      const selected=node.count===1&&!!node.projectId&&node.projectId===selectedProjectId;
      const signature=node.count>1?'cluster:'+node.count+':'+appearance.background:'project:'+node.status+':'+selected;
      const title=node.count>1?`${node.count.toLocaleString()} map records · ${appearance.label}. Zoom in`:`${node.name||'Development'} · ${node.status}`;
      const icon=()=>node.count>1?L.divIcon({className:'',html:`<span style="display:flex;align-items:center;justify-content:center;min-width:42px;height:42px;padding:0 5px;border-radius:50%;background:${appearance.background};color:${appearance.text};border:3px solid white;box-shadow:0 2px 6px #0005;font-weight:700">${node.count.toLocaleString()}</span>`,iconSize:[48,48],iconAnchor:[24,24]}):L.divIcon({className:'',html:`<span style="display:block;width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${statusColors[node.status||'Proposed']};border:3px solid white;box-shadow:${selected?'0 0 0 5px #214D3B,0 0 0 10px #ffffffbb,0 3px 9px #0006':'0 2px 6px #0005'}"></span>`,iconSize:[28,28],iconAnchor:[14,28]});
      const existing=markers.current.get(node.id);
      if(existing){const at=existing.marker.getLatLng();if(at.lat!==node.latitude||at.lng!==node.longitude)existing.marker.setLatLng([node.latitude,node.longitude]);if(existing.signature!==signature){existing.marker.setIcon(icon());existing.signature=signature;}const element=existing.marker.getElement();element?.setAttribute('title',title);element?.setAttribute('aria-label',title);element?.setAttribute('aria-pressed',String(selected));existing.marker.setZIndexOffset(selected?1000:0);continue;}
      const marker=L.marker([node.latitude,node.longitude],{icon:icon(),title,alt:title,keyboard:true,autoPanOnFocus:false,bubblingMouseEvents:false}).addTo(instance);
      marker.setZIndexOffset(selected?1000:0);marker.getElement()?.setAttribute('aria-pressed',String(selected));
      marker.on('click',()=>{const n=currentNodes.current.get(node.id);if(!n)return;
        if(n.count>1){if(instance.getZoom()>=17&&callbacks.current.onCluster){callbacks.current.onCluster(n);return;}const box=L.latLngBounds([[n.bounds.south,n.bounds.west],[n.bounds.north,n.bounds.east]]);
          const current=instance.getZoom();
          if(instance.getBoundsZoom(box,false,L.point(80,80))<=current)instance.setView([n.latitude,n.longitude],Math.min(18,current+1));
          else instance.fitBounds(box,{padding:[40,40],maxZoom:Math.min(18,current+3)});}
        else if(n.projectId){if(callbacks.current.onSelectId)callbacks.current.onSelectId(n.projectId);else{const p=projectsRef.current.find(p=>p.id===n.projectId);if(p)callbacks.current.onSelect(p);}}
      });markers.current.set(node.id,{marker,signature});
    }
  },[display,ready,selectedProjectId]);
  useEffect(()=>{
    if(!ready||!map.current||fitted.current===resetKey)return;
    let b=focusBounds;
    if(!b&&nodes===undefined&&projects.length)b={west:Math.min(...projects.map(p=>p.longitude)),east:Math.max(...projects.map(p=>p.longitude)),south:Math.min(...projects.map(p=>p.latitude)),north:Math.max(...projects.map(p=>p.latitude))};
    if(!b)return;fitted.current=resetKey;map.current.fitBounds([[b.south,b.west],[b.north,b.east]],{padding:[40,40],maxZoom:15});
  },[ready,resetKey,focusBounds,projects,nodes]);
  useEffect(()=>{
    const L=library.current,instance=map.current;if(!ready||!L||!instance||!extent)return;
    const opacity=boundaryOpacity(zoom);
    const visible=opacity>0?(outlines.data?.lines||[]).filter(line=>overlapsBounds(line.bounds,extent)):[];
    const ids=new Set(visible.map(line=>line.id));
    for(const[id,line]of lines.current)if(!ids.has(id)){line.remove();lines.current.delete(id);}
    for(const line of visible){const old=lines.current.get(line.id);if(old){old.setStyle({opacity});continue;}
      lines.current.set(line.id,L.polyline(line.coordinates.map(([longitude,latitude])=>[latitude,longitude] as [number,number]),{pane:'stateBoundaries',color:boundaryStyle.color,weight:boundaryStyle.width,opacity,interactive:false,smoothFactor:1}).addTo(instance));
    }
  },[ready,zoom,extent,outlines.data]);
  return <div style={{flex:1,position:'relative',minHeight:180,isolation:'isolate'}}>
    <div ref={container} aria-label="Interactive development project map. Use arrow keys to pan and plus or minus to zoom." style={{position:'absolute',inset:0,background:'#E1E8DA'}} />
    {showControls&&<MapLegend nodes={display} boundaryError={outlines.error}/>}
    {(tileError||loadError)&&<div role="status" style={{position:'absolute',zIndex:1000,top:60,left:12,right:12,padding:10,background:'white',color:'#234D35',borderRadius:8,fontSize:13}}>{loadError?'Map could not load.':'Some map tiles could not load. Check your internet connection.'} Refresh the map to try again.</div>}
  </div>;
}
