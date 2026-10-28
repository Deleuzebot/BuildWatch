import {validActivityPeriod,activitySince,type ActivityPeriod} from '../../src/lib/activity';
import {primaryCategories} from '../../src/lib/categories';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type { Bounds, BrowseResult, CatalogInfo, MapResult, MapNode, MeetingResult, ProjectSummary } from '../../src/lib/mapTypes';
import { statuses } from '../../src/data/projects';
export type Filters = { search?: string; status?: string; state?: string; types?: string[]; activity?: ActivityPeriod };
export const MAX_NODES = 512;
export function validBounds(b: Bounds) {
  return Object.values(b).every(Number.isFinite) && b.west >= -180 && b.west <= 180 && b.east >= -180 && b.east <= 180 && b.south >= -90 && b.north <= 90 && b.south <= b.north;
}
const invalid = (message: string): never => { throw Object.assign(new Error(message), { status: 400 }); };
export function parseBounds(value: string | null): Bounds | undefined {
  if (value === null) return undefined;
  const parts=value.split(','); if(parts.length!==4||parts.some(v=>!v.trim()))return invalid('Use west,south,east,north bounds.');
  const [west,south,east,north]=parts.map(Number), b={west,south,east,north};
  if(!validBounds(b))return invalid('Map bounds are invalid.'); return b;
}
export function parseFilters(params: URLSearchParams): Filters {
  const search=(params.get('search')||'').trim(); const status=params.get('status')||'All';const state=(params.get('state')||'').toUpperCase();
  if(search.length>200)return invalid('Search must be at most 200 characters.');
  if(status!=='All'&&!statuses.includes(status as any))return invalid('Choose a valid status.');
  if(state&&!/^[A-Z]{2}$/.test(state))return invalid('Use a two-letter state code.');
  const types=[...new Set((params.get('types')||'').split(',').filter(Boolean))];if(types.some(t=>!primaryCategories.includes(t as any)))return invalid('Choose valid development types.');
  const activity=params.get('activity')||'';if(activity&&!validActivityPeriod(activity))return invalid('Choose a valid activity period.');
  return {search,status,state,...(types.length?{types}:{}),...(activity?{activity:activity as ActivityPeriod}:{})};
}
function where(filters: Filters, bounds?: Bounds) {
  const clauses=['1=1'], args: SQLInputValue[]=[];
  const search=(filters.search||'').trim().toLowerCase();
  if(search){
    if(Array.from(search).length>=3){ clauses.push('m.rid IN (SELECT rowid FROM map_search WHERE map_search MATCH ?)'); args.push('"'+search.replaceAll('"','""')+'"'); }
    clauses.push('instr(m.searchtext,?)>0'); args.push(search);
  }
  if(filters.status&&filters.status!=='All'){clauses.push('m.status=?');args.push(filters.status);}
  if(filters.types?.length){if(filters.types.some(t=>!primaryCategories.includes(t as any)))return invalid('Choose valid development types.');clauses.push('m.rid IN (SELECT rid FROM map_types WHERE category IN ('+filters.types.map(()=>'?').join(',')+'))');args.push(...filters.types);}
  if(filters.activity&&filters.activity!=='5y'){clauses.push('m.id IN (SELECT coalesce(r.target_id,a.project_id) FROM project_activity a LEFT JOIN project_relationships r ON r.source_id=a.project_id WHERE a.occurred_at>=? AND a.occurred_at<=?)');args.push(activitySince(filters.activity),Date.now());}
  if(filters.state){clauses.push('m.state=?');args.push(filters.state);}
  if(bounds){
    if(!validBounds(bounds))return invalid('Map bounds are invalid.');
    // RTree coordinates are outward-rounded floats; exact metadata checks prevent edge leaks.
    clauses.push('m.rid IN (SELECT rid FROM map_spatial WHERE maxLat>=? AND minLat<=? AND '+(bounds.west<=bounds.east?'maxLon>=? AND minLon<=?':'(maxLon>=? OR minLon<=?)')+')');
    args.push(bounds.south,bounds.north,bounds.west,bounds.east);
    clauses.push('m.latitude>=? AND m.latitude<=?');args.push(bounds.south,bounds.north);
    clauses.push(bounds.west<=bounds.east?'m.longitude>=? AND m.longitude<=?':'(m.longitude>=? OR m.longitude<=?)');args.push(bounds.west,bounds.east);
  }
  return {sql:clauses.join(' AND '),args};
}
const summarySQL=`p.id,
 json_extract(p.data,'$.name') AS name,json_extract(p.data,'$.address') AS address,
 json_extract(p.data,'$.neighborhood') AS neighborhood,json_extract(p.data,'$.category') AS category,
 json_extract(p.data,'$.primaryCategory') AS primaryCategory,json_extract(p.data,'$.subtype') AS subtype,
 m.status,m.latitude,m.longitude,json_extract(p.data,'$.homes') AS homes,
 json_extract(p.data,'$.city') AS city,json_extract(p.data,'$.county') AS county,m.state,
 json_extract(p.data,'$.evidenceType') AS evidenceType,json_extract(p.data,'$.sourceAsOf') AS sourceAsOf`;
const projectBounds=(db: DatabaseSync, sql: string,args: SQLInputValue[])=>{
  const row=db.prepare(`SELECT min(longitude) AS west,min(latitude) AS south,max(longitude) AS east,max(latitude) AS north FROM active_map_index m WHERE ${sql}`).get(...args) as any;
  return row?.west===null?null:row as Bounds;
};
export class MapQueries {
  constructor(public db: DatabaseSync) {}
  version(){return String((this.db.prepare('SELECT version FROM map_meta WHERE id=1').get() as any).version);}
  catalog(): CatalogInfo {
    // Separate indexed min/max lookups, rather than scanning every project for a combined aggregate.
    const b=this.db.prepare(`SELECT (SELECT min(longitude) FROM active_map_index) AS west,(SELECT max(longitude) FROM active_map_index) AS east,(SELECT min(latitude) FROM active_map_index) AS south,(SELECT max(latitude) FROM active_map_index) AS north`).get() as any;
    return {version:this.version(),total:(this.db.prepare('SELECT count(*) AS n FROM active_map_index').get() as any).n,bounds:b.west===null?null:b};
  }
  private queryBounds(bounds?: Bounds){
    if(!bounds)return undefined;
    if(!validBounds(bounds))return invalid("Map bounds are invalid.");
    const all=this.catalog().bounds;
    // A nationwide viewport covering the entire index needs no RTree ID materialization.
    return all&&bounds.west<=all.west&&bounds.east>=all.east&&bounds.south<=all.south&&bounds.north>=all.north?undefined:bounds;
  }
  browse(filters: Filters, cursor=0, limit=50, bounds?: Bounds): BrowseResult {
    if(!Number.isSafeInteger(cursor)||cursor<0||!Number.isInteger(limit)||limit<1||limit>100)return invalid('Invalid page size or cursor.');
    const w=where(filters,this.queryBounds(bounds));
    const total=(this.db.prepare(`SELECT count(*) AS n FROM active_map_index m WHERE ${w.sql}`).get(...w.args) as any).n;
    const rows=this.db.prepare(`SELECT m.rid,${summarySQL} FROM active_map_index m JOIN public_projects p ON p.rowid=m.rid WHERE ${w.sql} AND m.rid>? ORDER BY m.rid LIMIT ?`).all(...w.args,cursor,limit+1) as any[];
    const more=rows.length>limit; const page=rows.slice(0,limit);
    return {version:this.version(),total,items:page.map(({rid,...p})=>p) as ProjectSummary[],nextCursor:more?String(page.at(-1)!.rid):null,bounds:cursor===0?(w.sql==='1=1'?this.catalog().bounds:projectBounds(this.db,w.sql,w.args)):null};
  }
  map(filters: Filters,bounds: Bounds,zoom: number): MapResult {
    if(!Number.isInteger(zoom)||zoom<0||zoom>20)return invalid('Map zoom must be an integer from 0 to 20.');
    const w=where(filters,this.queryBounds(bounds));
    const total=(this.db.prepare(`SELECT count(*) AS n FROM active_map_index m WHERE ${w.sql}`).get(...w.args) as any).n;
    const y=(lat:number)=>(1-Math.log(Math.tan(Math.PI/4+Math.max(-85,Math.min(85,lat))*Math.PI/360))/Math.PI)/2;
    let effectiveZoom=zoom;
    const cells=(z:number)=>{
      const s=256*2**z/64;
      const lo=Math.floor((bounds.west+180)/360*s),hi=Math.floor((bounds.east+180)/360*s);
      const cols=bounds.west<=bounds.east?hi-lo+1:Math.ceil(s)-lo+hi+1;
      return cols*(Math.floor(y(bounds.south)*s)-Math.floor(y(bounds.north)*s)+1);
    };
    // Bound the response geometrically before querying. Never truncate clusters/counts.
    while(effectiveZoom>0&&cells(effectiveZoom)>MAX_NODES)effectiveZoom--;
    let nodes: MapNode[];
    if((zoom>=17||total<60)&&total<=MAX_NODES){
      const rows=this.db.prepare(`SELECT m.id,m.latitude,m.longitude,m.state,m.status,json_extract(p.data,'$.name') AS name FROM active_map_index m JOIN public_projects p ON p.rowid=m.rid WHERE ${w.sql}`).all(...w.args) as any[];
      nodes=rows.map(p=>({...p,projectId:p.id,count:1,bounds:{west:p.longitude,east:p.longitude,south:p.latitude,north:p.latitude}}));
    }else{
      const scale=256*2**effectiveZoom/64;
      const rows=this.db.prepare(`SELECT cast(floor(m.x*?) AS INTEGER) AS cx,cast(floor(m.y*?) AS INTEGER) AS cy,
        count(*) AS n,avg(m.latitude) AS latitude,avg(m.longitude) AS longitude,
        min(m.longitude) AS west,max(m.longitude) AS east,min(m.latitude) AS south,max(m.latitude) AS north,
        CASE WHEN count(m.state)=count(*) AND min(m.state)=max(m.state) THEN min(m.state) ELSE NULL END AS state,
        min(m.id) AS projectId,min(m.status) AS status,min(m.rid) AS rid
        FROM active_map_index m WHERE ${w.sql} GROUP BY cx,cy`).all(scale,scale,...w.args) as any[];
      nodes=rows.map(r=>({id:r.n===1?r.projectId:`cell-${effectiveZoom}-${r.cx}-${r.cy}`,count:r.n,latitude:r.latitude,longitude:r.longitude,state:r.state,bounds:{west:r.west,east:r.east,south:r.south,north:r.north},...(r.n===1?{projectId:r.projectId,status:r.status,name:(this.db.prepare("SELECT json_extract(data,'$.name') AS name FROM public_projects WHERE rowid=?").get(r.rid) as any).name}:{})}));
    }
    return {version:this.version(),total,nodes,bounds,zoom,effectiveZoom};
  }
  meetings(filters: Filters,cursor=0,limit=100,now=Date.now()): MeetingResult {
    const w=where(filters);
    if(!Number.isSafeInteger(cursor)||cursor<0||!Number.isInteger(limit)||limit<1||limit>100)return invalid("Invalid meeting page.");
    const total=(this.db.prepare(`SELECT count(*) AS n FROM map_meetings mm JOIN active_map_index m ON m.rid=mm.project_rid WHERE mm.starts>=? AND ${w.sql}`).get(now,...w.args) as any).n;
    const rows=this.db.prepare(`SELECT mm.data AS meeting,${summarySQL} FROM map_meetings mm JOIN active_map_index m ON m.rid=mm.project_rid JOIN public_projects p ON p.rowid=m.rid WHERE mm.starts>=? AND ${w.sql} ORDER BY mm.starts,mm.project_rid,mm.id LIMIT ? OFFSET ?`).all(now,...w.args,limit,cursor) as any[];
    return {version:this.version(),total,items:rows.map(({meeting,...project})=>({...JSON.parse(meeting),project})),nextCursor:cursor+limit<total?String(cursor+limit):null};
  }
}
