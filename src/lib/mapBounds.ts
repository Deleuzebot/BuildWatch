import type { Bounds } from './mapTypes';
export function boundsParam(b:Bounds){return [Math.floor(b.west*1e6)/1e6,Math.floor(b.south*1e6)/1e6,Math.ceil(b.east*1e6)/1e6,Math.ceil(b.north*1e6)/1e6].join(',');}
export function paddedBounds(b:Bounds):Bounds{
  const width=b.east>=b.west?b.east-b.west:360-b.west+b.east;
  if(width*1.4>=360)return{west:-180,east:180,south:Math.max(-90,b.south-(b.north-b.south)*.2),north:Math.min(90,b.north+(b.north-b.south)*.2)};
  const wrap=(x:number)=>((x+180)%360+360)%360-180;
  return{west:wrap(b.west-width*.2),east:wrap(b.east+width*.2),south:Math.max(-90,b.south-(b.north-b.south)*.2),north:Math.min(90,b.north+(b.north-b.south)*.2)};
}
export function containsBounds(outer:Bounds,inner:Bounds){
  const width=(b:Bounds)=>b.east>=b.west?b.east-b.west:360-b.west+b.east;
  const offset=((inner.west-outer.west)%360+360)%360;
  return inner.south>=outer.south&&inner.north<=outer.north&&(width(outer)>=360-1e-9||offset+width(inner)<=width(outer)+1e-9);
}
