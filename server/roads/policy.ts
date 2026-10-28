import type {Project} from '../../src/data/projects';
export const ROAD_POLICY_VERSION=1;
export type RoadDecision={road:boolean;qualifies:boolean;reason:string;scope:string;signals:string[]};
/** Scope only: addresses, verification boilerplate, budgets alone and route proximity are not construction evidence. */
export function roadDecision(p:Project):RoadDecision{
 const scope=[p.name,p.description].join(' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
 const t=scope.toLowerCase(), signals:string[]=[];
 const result=(road:boolean,qualifies:boolean,reason:string)=>({road,qualifies,reason,scope,signals});
 const category=p.originalCategory??p.category; // Normalizing display labels must not change the established eligibility scope.
 const agency=p.developer==='NCDOT'||p.id.startsWith('nc-dot-')||/^NCDOT\b/i.test(p.jurisdiction||'');
 if(!agency&&category!=='Transportation')return result(false,true,'Non-road category and source; road references are ancillary.');
 const roadAction=/\b(?:widen(?:ing)?|reconstruct(?:ion)?|resurfac(?:e|ing)|repav(?:e|ing)|interchange|roundabouts?|intersection improvements?|bridge replacement|replace (?:the )?bridge|new (?:road|highway|expressway)|roadway|highway construction|bypass|freeway|expressway|guardrail|restrip|pothole|traffic signals?|turn lanes?|road (?:extension|connector))\b/i.test(t);
 const bridge=/\bbridges?\b/.test(t)&&/\b(?:us|nc|i|sr)[ -]?\d|\b(?:road|street|highway|blvd|boulevard)\b/.test(t);
 const nonroad=/\b(?:hotel|warehouse|showroom|apartments?|subdivision|residential|sewer pump|sewer line|data storage|school building|hospital|office building)\b/.test(t);
 const walking=/\b(?:greenway|sidewalk|multi[- ]use path|bicycle|bike lanes?|pedestrian|riverwalk)\b/.test(t)||(/\bbridges?\b/.test(t)&&/\btrai\s*l\b/.test(t)&&!/\broad(?:way)?\b/.test(t));
 // Standalone walking/cycling/rail/airport projects are outside this road cleanup.
 if(!roadAction&&!bridge&&!(agency&&category==='Transportation'))return result(false,true,'No independent road-construction scope.');
 if(nonroad&&!agency&&!/\b(?:widen|reconstruct|new highway|interchange)\b/.test(t))return result(false,true,'Physical development scope is non-road; address/category does not determine eligibility.');
 if(walking&&!/\b(?:widen|widening|reconstruct|interchange|freeway|expressway|bypass)\b/.test(t))return result(false,true,'Standalone walking/cycling development is preserved.');
 if(!agency&&category!=='Transportation'&&!/\b(?:road|highway|interstate|expressway|freeway|interchange|roadway)\b/.test(t))return result(false,true,'Non-road development.');
 if(agency&&(/\b(?:airport|taxiway|runway)\b/.test(t)||/^nc-dot-(?:planned|active)-p-\d/.test(p.id)))return result(false,true,'Aviation or rail development is outside this road cleanup.');
 if(!p.sources?.some(source=>{try{return new URL(source.url).protocol==='https:';}catch{return false;}}))return result(true,false,'Road construction scope lacks a traceable HTTPS source; retain privately for verification.');
 const interstate=/\bi[ -]?\d{1,3}\b|\binterstate\b/.test(t);
 const highway=/\b(?:us|u\.s\.|nc|va|state (?:route|highway)|sr)[ -]?\d+\b/.test(t);
 // SR in North Carolina means secondary road, not a numbered state highway.
 const primary=/\b(?:us|u\.s\.|nc|va|state (?:route|highway))[ -]?\d+\b/.test(t);
 const maintenance=/\b(?:resurfac\w*|repav\w*|pavement preserv\w*|potholes?|restrip\w*|guardrails?|bridge preserv\w*|bridge rehabilitation|deck repair|painting|routine maintenance|drainage repair|signal replacement|lighting|mast arm)\b/.test(t);
 const expansion=/\b(?:widen(?:ing)?|reconstruct(?:ion)?|new (?:limited[- ]access )?(?:highway|expressway|freeway)|construct.*?new location|new location.*?construct|bypass)\b/.test(t);
 const interchangeScope=/\b(?:construct|reconstruct|replace|upgrade|convert|new|develop)\w*\b[^.;]{0,80}\binterchanges?\b|\binterchanges?\b[^.;]{0,40}\b(?:reconstruct|replace|upgrade|improv|construct)\w*\b|\binterchanges? (?:of|at)\b/.test(t)||(/\binterchanges?\b/i.test(p.name)&&!/roundabout|lighting|signal/i.test(p.name));
 const interchange=interchangeScope&&!/\b(?:signal|lighting|signing|landscap|ramp meter)\w*/.test(t);
 const bridgeReplacement=/\b(?:replace|replacement|new bridges?|reconstruct)\b/.test(t)&&/\bbridges?\b/.test(t);
 const length=[...t.matchAll(/(\d+(?:\.\d+)?)\s*[- ]?(?:miles?|mi\b)/g)].map(m=>Number(m[1]));
 const corridor=length.some(n=>n>=2)||/\b(?:regional|limited[- ]access|controlled[- ]access|freeway|expressway|bypass|connect(?:s|ing)? (?:two|regional)|new river crossing)\b/.test(t);
 const lanes=/\b(?:[4-9]|four|six|eight)[ -]?lane|\bmulti[ -]?lanes?\b/.test(t);
 const costs=[...t.matchAll(/\$\s*(\d+(?:\.\d+)?)\s*(million|billion|m\b|b\b)/g)].map(m=>Number(m[1])*(m[2].startsWith('b')?1000:1));
 const months=[...t.matchAll(/(\d+(?:\.\d+)?)\s*[- ]?(months?|years?)\s*(?:of )?(?:construction|construction duration|construction period)/g)].map(m=>Number(m[1])*(m[2].startsWith('year')?12:1));
 const largeSustained=costs.some(n=>n>=50)&&months.some(n=>n>=24);
 if(costs.length)signals.push('documented-budget:'+Math.max(...costs)+'m');if(months.length)signals.push('documented-duration:'+Math.max(...months)+'months');
 if(interstate)signals.push('interstate');if(primary)signals.push('numbered-primary-highway');if(expansion)signals.push('expansion/reconstruction');if(corridor)signals.push('regional/corridor scope');if(lanes)signals.push('multi-lane capacity');
 if(maintenance&&!expansion&&!bridgeReplacement)return result(true,false,'Maintenance, preservation or equipment work; route class does not override scope.');
 const mainlineExpansion=expansion&&(/\b(?:reconstruct|reconstruction|new|bypass|freeway|expressway)\b/.test(t)||lanes||length.some(n=>n>=2));
 if(interstate&&(mainlineExpansion||bridgeReplacement||interchange))return result(true,true,'Substantial interstate capacity, reconstruction, bridge replacement or interchange scope.');
 if(expansion&&primary&&(corridor||lanes||largeSustained))return result(true,true,'Primary-highway expansion/reconstruction with multi-lane or regional corridor evidence.');
 if(interchange&&primary&&/\b(?:construct|new|convert|replace|reconstruct)\b/.test(t))return result(true,true,'New or reconstructed grade-separated interchange on a primary highway.');
 if(expansion&&corridor&&(highway||/\b(?:road|highway|expressway|freeway)\b/.test(t)))return result(true,true,'New or reconstructed regional connection with explicit corridor scope.');
 if(bridgeReplacement&&corridor&&primary)return result(true,true,'Primary-highway bridge replacement with documented regional crossing impact.');
 return result(true,false,'Local road/bridge/intersection work or insufficient evidence of substantial regional impact. Cost, duration and a route mention alone do not qualify.');
}
