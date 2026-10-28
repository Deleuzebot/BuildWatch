import {useEffect,useState} from 'react';
import {mapRequest} from './mapClient';
import type {Bounds} from './mapTypes';
export type StateLine={id:string;bounds:Bounds;coordinates:[number,number][]};
export type StateBoundaries={version:string;source:string;states:Record<string,string>;lines:StateLine[]};
let cached:Promise<StateBoundaries>|undefined;
export function useStateBoundaries(visible:boolean){
 const[data,setData]=useState<StateBoundaries|null>(null),[error,setError]=useState(false);
 useEffect(()=>{if(!visible)return;let active=true;
  cached??=mapRequest<StateBoundaries>('/api/state-boundaries/2025-20m').catch(error=>{cached=undefined;throw error;});
  void cached.then(value=>{if(active){setData(value);setError(false);}}).catch(()=>{if(active)setError(true);});
  return()=>{active=false;};
 },[visible]);return{data,error};
}
