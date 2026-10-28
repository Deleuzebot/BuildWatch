// Reproduce the approved palette from pinned Census adjacency. Writes stateColors.ts; review changes before shipping.
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
const states='AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
const graph=Object.fromEntries(states.map(s=>[s,new Set()]));
const sourcePath=process.argv.find(v=>v.startsWith('--source='))?.slice(9)||'../../work/map-audit/county-adjacency-2026.txt';
const response=existsSync(sourcePath)?null:await fetch('https://www2.census.gov/geo/docs/reference/county_adjacency/county_adjacency2026.txt');
if(response&&!response.ok)throw new Error('Census adjacency download failed; supply --source=path.');
const source=existsSync(sourcePath)?readFileSync(sourcePath,'utf8'):await response.text();
if(!source.startsWith('County Name|County GEOID|Neighbor Name|Neighbor GEOID|Length'))throw new Error('Unexpected source format.');
for(const line of source.split('\n').slice(1)){const [name,,neighbor,,length]=line.trim().split('|');const a=name?.slice(-2),b=neighbor?.slice(-2);if(graph[a]&&graph[b]&&a!==b&&Number(length)>0){graph[a].add(b);graph[b].add(a);}}
const colors={NC:0};
function solve(){const left=states.filter(s=>colors[s]===undefined);if(!left.length)return true;left.sort((a,b)=>new Set([...graph[b]].map(n=>colors[n]).filter(c=>c!==undefined)).size-new Set([...graph[a]].map(n=>colors[n]).filter(c=>c!==undefined)).size||graph[b].size-graph[a].size||a.localeCompare(b));const state=left[0],used=new Set([...graph[state]].map(s=>colors[s]));for(let c=0;c<4;c++){if(used.has(c))continue;colors[state]=c;if(solve())return true;delete colors[state];}return false;}
if(!solve())throw new Error('Four-color proposal requires review of adjacency graph.');
const palette=['blue','teal','amber','purple'];
const assignment=Object.fromEntries(states.map(s=>[s,palette[colors[s]]]));
writeFileSync('src/lib/stateColors.ts',`/** Approved fixed 50-state palette; individual pins retain status colors. */\nexport const stateColors = { enabled: true, palette: { blue:'#4477AA', teal:'#228B83', amber:'#D69A32', purple:'#8464A8', mixed:'#5B676C' }, assignments: ${JSON.stringify(assignment,null,2)} } as const;\nexport const stateNeighbors: Record<string,string[]> = ${JSON.stringify(Object.fromEntries(states.map(s=>[s,[...graph[s]].sort()])),null,2)};\nexport function clusterColor(state: string|null) { const key=state ? stateColors.assignments[state.toUpperCase() as keyof typeof stateColors.assignments] : undefined; return stateColors.palette[key || 'mixed']; }\nexport function contrast(a:string,b:string){const light=(hex:string)=>{const c=hex.slice(1).match(/../g)!.map(v=>parseInt(v,16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);return c[0]*0.2126+c[1]*0.7152+c[2]*0.0722;};const x=light(a),y=light(b);return(Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);}\nexport function countTextColor(background:string){return contrast(background,'#FFFFFF')>=contrast(background,'#000000')?'#FFFFFF':'#000000';}\n`);
console.log(JSON.stringify({states:states.length,edges:Object.values(graph).reduce((s,v)=>s+v.size,0)/2,assignments:assignment},null,2));
