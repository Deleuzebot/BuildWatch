import type { Bounds } from './mapTypes';
import {backendFetch} from './transport';
const cache=new Map<string,{value:any;etag:string|null;at:number}>();
const MAX_CACHE=32;
export function invalidateMapCache(){cache.clear();}
export async function mapRequest<T>(path:string,signal?:AbortSignal,force=false):Promise<T>{
  const entry=cache.get(path);
  if(entry&&!force&&Date.now()-entry.at<15000){cache.delete(path);cache.set(path,entry);return entry.value;}
  const response=await backendFetch(path,{signal:signal||AbortSignal.timeout(30000),headers:entry?.etag?{'If-None-Match':entry.etag}:undefined});
  if(response.status===304&&entry){entry.at=Date.now();return entry.value;}
  if(!response.ok){let message='Shared map is unavailable. Please retry.';try{message=(await response.json()).error||message;}catch{}throw new Error(message);}
  const value=await response.json();cache.set(path,{value,etag:response.headers.get('ETag'),at:Date.now()});
  while(cache.size>MAX_CACHE)cache.delete(cache.keys().next().value!);
  return value;
}
export { boundsParam, paddedBounds, containsBounds } from './mapBounds';
