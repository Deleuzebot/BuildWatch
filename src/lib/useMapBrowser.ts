import type {ActivityPeriod} from './activity';
import { useCallback, useEffect, useRef, useState } from 'react';
import {AppState} from 'react-native';
import {olderMapVersion} from './mapVersion';
import type { Project, Status } from '../data/projects';
import type { BrowseResult, CatalogInfo, MapResult, ProjectSummary, Viewport } from './mapTypes';
import { boundsParam, containsBounds, invalidateMapCache, mapRequest, paddedBounds } from './mapClient';
export function useMapBrowser(query:string,status:Status|'All',types:string[]=[],activity:ActivityPeriod|null=null) {
  const [activityWindow,setActivityWindow]=useState(activity);
  useEffect(()=>{const t=setTimeout(()=>setActivityWindow(activity),80);return()=>clearTimeout(t);},[activity]);
  const [activityClock,setActivityClock]=useState(0);const activityRef=useRef(activity);activityRef.current=activity;
  const [term,setTerm]=useState(query.trim());
  const [version,setVersion]=useState('');
  const [catalog,setCatalog]=useState<CatalogInfo|null>(null);
  const [browse,setBrowse]=useState<BrowseResult|null>(null);
  const [browseKey,setBrowseKey]=useState('');
  const [feed,setFeed]=useState<MapResult|null>(null);
  const [viewport,setViewport]=useState<Viewport|null>(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [moreLoading,setMoreLoading]=useState(false);
  const moreBusy=useRef(false);
  const [tick,setTick]=useState(0);
  const active=useRef(true),versionRef=useRef(''),coverage=useRef<{key:string;feed:MapResult}|null>(null);
  const moveTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const prefix=new URLSearchParams({search:term,status,types:[...types].sort().join(','),activity:activityWindow||'',...(activityWindow&&activityWindow!=='5y'?{activityClock:String(activityClock)}:{})}).toString();
  const filterRef=useRef(prefix);filterRef.current=prefix;
  const requestPrefix=prefix+"&v="+version;
  useEffect(()=>{const timer=setTimeout(()=>setTerm(query.trim()),250);return()=>clearTimeout(timer);},[query]);
  const acceptVersion=useCallback((v:string)=>{
    if(olderMapVersion(v,versionRef.current||'0'))return false;
    if(v!==versionRef.current){versionRef.current=v;invalidateMapCache();coverage.current=null;setVersion(v);}
    return true;
  },[]);
  useEffect(()=>{
    active.current=true;let busy=false;const controller=new AbortController();
    const poll=async()=>{if(busy||(AppState.currentState&&AppState.currentState!=='active')||(typeof document!=='undefined'&&document.hidden))return;busy=true;try{const c=await mapRequest<CatalogInfo>('/api/catalog',controller.signal,true);if(active.current&&!controller.signal.aborted){acceptVersion(c.version);setCatalog(old=>old?.version===c.version?old:c);if(activityRef.current&&activityRef.current!=='5y')setActivityClock(Math.floor(Date.now()/15000));}}catch(e){if(!controller.signal.aborted&&active.current){setError(e instanceof Error?e.message:'Map unavailable.');setLoading(false);}}finally{busy=false;}};
    void poll();const timer=setInterval(()=>void poll(),15000);
    const state=AppState.addEventListener('change',s=>{if(s==='active')void poll();});const visible=()=>{if(!document.hidden)void poll();};if(typeof document!=='undefined')document.addEventListener('visibilitychange',visible);
    return()=>{active.current=false;controller.abort();clearInterval(timer);clearTimeout(moveTimer.current);state.remove();if(typeof document!=='undefined')document.removeEventListener('visibilitychange',visible);};
  },[acceptVersion,tick]);
  useEffect(()=>{
    if(!version)return;
    const controller=new AbortController();setLoading(true);
    void mapRequest<BrowseResult>('/api/browse?'+requestPrefix,controller.signal).then(list=>{
      if(controller.signal.aborted)return;
      if(list.version!==versionRef.current){acceptVersion(list.version);return;}
      setBrowse(list);setBrowseKey(prefix);setError('');setLoading(false);
    }).catch(e=>{if(!controller.signal.aborted){setError(e instanceof Error?e.message:'Map unavailable.');setLoading(false);}});
    return()=>controller.abort();
  },[prefix,version,tick,acceptVersion]);
  useEffect(()=>{
    if(!viewport||!version)return;
    const key=version+'|'+prefix+'|'+viewport.zoom;
    if(coverage.current?.key===key&&containsBounds(coverage.current.feed.bounds,viewport))return;
    const controller=new AbortController();const bounds=paddedBounds(viewport);
    const path='/api/map?'+requestPrefix+'&zoom='+viewport.zoom+'&bbox='+encodeURIComponent(boundsParam(bounds));
    void mapRequest<MapResult>(path,controller.signal).then(result=>{
      if(controller.signal.aborted)return;
      if(result.version!==versionRef.current){acceptVersion(result.version);return;}
      coverage.current={key,feed:result};setFeed(result);setError('');
    }).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Map unavailable.');});
    return()=>controller.abort();
  },[prefix,viewport,version,tick,acceptVersion]);
  const onViewport=useCallback((next:Viewport)=>{
    clearTimeout(moveTimer.current);
    moveTimer.current=setTimeout(()=>setViewport(old=>old&&boundsParam(old)===boundsParam(next)&&old.zoom===next.zoom?old:next),200);
  },[]);
  const refresh=useCallback(()=>{invalidateMapCache();coverage.current=null;setTick(v=>v+1);},[]);
  const select=useCallback((id:string)=>mapRequest<Project>('/api/public/projects/'+encodeURIComponent(id),undefined,true),[]);
  const loadMore=useCallback(async()=>{
    if(!browse?.nextCursor||moreBusy.current)return;
    moreBusy.current=true;setMoreLoading(true);const expected=prefix+'|'+version;
    try{const page=await mapRequest<BrowseResult>('/api/browse?'+requestPrefix+'&cursor='+browse.nextCursor);
      if(!active.current||page.version!==versionRef.current||filterRef.current!==prefix)return;
      setBrowse(current=>current&&current.version===page.version&&expected===prefix+'|'+version?{...page,items:[...current.items,...page.items.filter(p=>!current.items.some(x=>x.id===p.id))],bounds:current.bounds}:current);
    }catch(e){setError(e instanceof Error?e.message:'Could not load more.');}finally{moreBusy.current=false;setMoreLoading(false);}
  },[browse,prefix,version,moreLoading]);
  return{items:browse?.items||[] as ProjectSummary[],total:browse?.total||0,feed,catalog,focusBounds:browse?.bounds||catalog?.bounds||null,resultsCurrent:query.trim()===term&&activityWindow===activity&&browseKey===prefix,loading,error,refresh,select,onViewport,loadMore,hasMore:!!browse?.nextCursor,moreLoading};
}
