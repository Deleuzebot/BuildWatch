import type {Bounds} from './mapTypes';
import {clusterColor,countTextColor} from './stateColors';
import {stateNames} from './stateNames';
export function clusterAppearance(state:string|null){const code=state?.toUpperCase()||'';const background=clusterColor(code);return{background,text:countTextColor(background),label:stateNames[code]||'Multiple states or unknown state'};}
export function boundaryOpacity(zoom:number){if(zoom<3||zoom>=12)return 0;if(zoom<=6)return .45;if(zoom<=10)return .45-(zoom-6)*.0625;return .2*(12-zoom)/2;}
export function overlapsBounds(line:Bounds,view:Bounds){return line.south<=view.north&&line.north>=view.south&&(view.west<=view.east?line.west<=view.east&&line.east>=view.west:line.east>=view.west||line.west<=view.east);}
export const boundaryStyle={color:'#334A40',width:.8};
