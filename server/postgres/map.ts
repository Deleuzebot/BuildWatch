import {activitySince}from'../../src/lib/activity';
import {primaryCategories}from'../../src/lib/categories';
import type{Filters}from'../map/queries';
import{validBounds,MAX_NODES}from'../map/queries';
import type{Bounds,MapNode,MapResult,BrowseResult,CatalogInfo,MeetingResult,ProjectSummary}from'../../src/lib/mapTypes';
import type{SqlSession}from'./migrate';
export function postgresWhere(filters:Filters,bounds?:Bounds){
 const clauses=['true'],args:any[]=[];const bind=(v:any)=>{args.push(v);return'$'+args.length;};
 const search=(filters.search||'').trim().toLowerCase();
 if(search)clauses.push(`m.searchtext LIKE ${bind('%'+search.replace(/[\\%_]/g,'\\$&')+'%')} ESCAPE '\'`);
 if(filters.status&&filters.status!=='All')clauses.push('m.status='+bind(filters.status));
 if(filters.state)clauses.push('m.state='+bind(filters.state));
 if(filters.types?.length){if(filters.types.some(t=>!primaryCategories.includes(t as any)))throw Object.assign(Error('Invalid development types.'),{status:400});clauses.push(`EXISTS(SELECT 1 FROM buildwatch.map_types t WHERE t.rid=m.rid AND t.category=ANY(${bind(filters.types)}::text[]))`);}
 if(filters.activity&&filters.activity!=='5y')clauses.push(`m.id IN (SELECT coalesce(r.target_id,a.project_id) FROM buildwatch.project_activity a LEFT JOIN buildwatch.project_relationships r ON r.source_id=a.project_id WHERE a.occurred_at>=${bind(activitySince(filters.activity))} AND a.occurred_at<=${bind(Date.now())})`);
 if(bounds){if(!validBounds(bounds))throw Object.assign(Error('Invalid bounds.'),{status:400});
  const {west,east,south,north}=bounds;
  const envelope=(w:number,e:number)=>`m.geom OPERATOR(extensions.&&) extensions.st_makeenvelope(${bind(w)},${bind(south)},${bind(e)},${bind(north)},4326)`;
  clauses.push(west<=east?envelope(west,east):'('+envelope(west,180)+' OR '+envelope(-180,east)+')');
  // Exact coordinates retain existing viewport edge behavior.
  clauses.push(`m.latitude>=${bind(south)} AND m.latitude<=${bind(north)}`);
  clauses.push(west<=east?`m.longitude>=${bind(west)} AND m.longitude<=${bind(east)}`:`(m.longitude>=${bind(west)} OR m.longitude<=${bind(east)})`);
 }return{sql:clauses.join(' AND '),args,bind};
}
const table='buildwatch.active_map_index';
const toSummary=(row:any):ProjectSummary=>{
 const p=JSON.parse(row.data);
 return {id:p.id,name:p.name,address:p.address??null,neighborhood:p.neighborhood??null,category:p.category,
  primaryCategory:p.primaryCategory??null,subtype:p.subtype??null,status:row.status,latitude:row.latitude,longitude:row.longitude,
  homes:p.homes??null,city:p.city??null,county:p.county??null,state:row.state,evidenceType:p.evidenceType??null,sourceAsOf:p.sourceAsOf??null} as ProjectSummary;
};
/** Same bounded server-side clustering contract as SQLite, using native PostGIS. */
export class PostgresMapQueries{
 constructor(readonly db:SqlSession){}
 private async rows(sql:string,args:any[]=[]){return(await this.db.query(sql,args)).rows;}
 private async one(sql:string,args:any[]=[]){return(await this.rows(sql,args))[0];}
 async version(){return String((await this.one('SELECT version FROM buildwatch.map_meta WHERE id=1')).version);}
 async catalog():Promise<CatalogInfo>{const row=await this.one(`SELECT count(*)::int total,min(longitude) west,max(longitude) east,min(latitude) south,max(latitude) north FROM ${table}`);const{total,...bounds}=row;return{version:await this.version(),total,bounds:row.west===null?null:bounds};}
 async browse(filters:Filters,cursor=0,limit=50,bounds?:Bounds):Promise<BrowseResult>{
  if(!Number.isSafeInteger(cursor)||cursor<0||!Number.isInteger(limit)||limit<1||limit>100)throw Object.assign(Error('Invalid page.'),{status:400});
  const w=postgresWhere(filters,bounds),total=(await this.one(`SELECT count(*)::int n FROM ${table} m WHERE ${w.sql}`,w.args)).n;
  // Limit indexed candidates before resolving profile JSON. Selecting profile
  // text once also avoids repeating its merge function for every summary field.
  const rows=await this.rows(`WITH candidates AS MATERIALIZED (SELECT m.* FROM ${table} m WHERE ${w.sql} AND m.rid>${w.bind(cursor)} ORDER BY m.rid LIMIT ${w.bind(limit+1)})
   SELECT m.rid,m.status,m.latitude,m.longitude,m.state,p.data FROM candidates m JOIN buildwatch.public_projects p ON p.id=m.id ORDER BY m.rid`,w.args);
  const more=rows.length>limit,page=rows.slice(0,limit);
  const wb=postgresWhere(filters,bounds),box=cursor===0?await this.one(`SELECT min(longitude) west,max(longitude) east,min(latitude) south,max(latitude) north FROM ${table} m WHERE ${wb.sql}`,wb.args):null;
  return{version:await this.version(),total,items:page.map(toSummary),nextCursor:more?String(page.at(-1)!.rid):null,bounds:box?.west===null?null:box};
 }
 async map(filters:Filters,bounds:Bounds,zoom:number):Promise<MapResult>{
  if(!Number.isInteger(zoom)||zoom<0||zoom>20||!validBounds(bounds))throw Object.assign(Error('Invalid map viewport.'),{status:400});
  const w=postgresWhere(filters,bounds),total=(await this.one(`SELECT count(*)::int n FROM ${table} m WHERE ${w.sql}`,w.args)).n;
  const y=(lat:number)=>(1-Math.log(Math.tan(Math.PI/4+Math.max(-85,Math.min(85,lat))*Math.PI/360))/Math.PI)/2;
  let effectiveZoom=zoom;
  const cells=(z:number)=>{const s=256*2**z/64,lo=Math.floor((bounds.west+180)/360*s),hi=Math.floor((bounds.east+180)/360*s);return(bounds.west<=bounds.east?hi-lo+1:Math.ceil(s)-lo+hi+1)*(Math.floor(y(bounds.south)*s)-Math.floor(y(bounds.north)*s)+1);};
  while(effectiveZoom>0&&cells(effectiveZoom)>MAX_NODES)effectiveZoom--;
  let nodes:MapNode[];
  if((zoom>=17||total<60)&&total<=MAX_NODES){const rows=await this.rows(`WITH candidates AS MATERIALIZED (SELECT m.* FROM ${table} m WHERE ${w.sql}) SELECT m.id,m.latitude,m.longitude,m.state,m.status,p.data::jsonb->>'name' name FROM candidates m JOIN buildwatch.public_projects p ON p.id=m.id`,w.args);nodes=rows.map(p=>({...p,projectId:p.id,count:1,bounds:{west:p.longitude,east:p.longitude,south:p.latitude,north:p.latitude}}));}
  else{
   const scale=256*2**effectiveZoom/64,param=w.bind(scale);
   const rows=await this.rows(`SELECT floor(m.x*${param})::int cx,floor(m.y*${param})::int cy,count(*)::int n,
    avg(m.latitude) latitude,avg(m.longitude) longitude,min(m.longitude) west,max(m.longitude) east,min(m.latitude) south,max(m.latitude) north,
    CASE WHEN count(m.state)=count(*) AND min(m.state)=max(m.state) THEN min(m.state) ELSE NULL END state,
    min(m.id) "projectId",min(m.status) status,min(m.rid) rid
    FROM ${table} m WHERE ${w.sql} GROUP BY cx,cy`,w.args);
   // One bounded title query avoids N+1 database requests for single-marker cells.
   const single=rows.filter(r=>r.n===1).map(r=>r.rid),names=new Map<string,string>();
   if(single.length)for(const p of await this.rows("WITH wanted AS MATERIALIZED (SELECT rid,id FROM buildwatch.map_index WHERE rid=ANY($1::bigint[])) SELECT m.rid,p.data::jsonb->>'name' name FROM wanted m JOIN buildwatch.public_projects p ON p.id=m.id",[single]))names.set(String(p.rid),p.name);
   nodes=rows.map(r=>({id:r.n===1?r.projectId:`cell-${effectiveZoom}-${r.cx}-${r.cy}`,count:r.n,latitude:r.latitude,longitude:r.longitude,state:r.state,bounds:{west:r.west,east:r.east,south:r.south,north:r.north},...(r.n===1?{projectId:r.projectId,status:r.status,name:names.get(String(r.rid))}:{})}));
  }return{version:await this.version(),total,nodes,bounds,zoom,effectiveZoom};
 }
 async meetings(filters:Filters,cursor=0,limit=100,now=Date.now()):Promise<MeetingResult>{
  if(!Number.isSafeInteger(cursor)||cursor<0||!Number.isInteger(limit)||limit<1||limit>100)throw Object.assign(Error('Invalid meeting page.'),{status:400});
  const w=postgresWhere(filters),date=w.bind(now),total=(await this.one(`SELECT count(*)::int n FROM buildwatch.map_meetings mm JOIN ${table} m ON m.rid=mm.project_rid WHERE mm.starts>=${date} AND ${w.sql}`,w.args)).n;
  const rows=await this.rows(`WITH candidates AS MATERIALIZED (SELECT mm.data meeting,mm.starts,mm.id meeting_id,m.id,m.status,m.latitude,m.longitude,m.state,m.rid FROM buildwatch.map_meetings mm JOIN ${table} m ON m.rid=mm.project_rid WHERE mm.starts>=${date} AND ${w.sql} ORDER BY mm.starts,mm.project_rid,mm.id LIMIT ${w.bind(limit)} OFFSET ${w.bind(cursor)}) SELECT m.*,p.data FROM candidates m JOIN buildwatch.public_projects p ON p.id=m.id ORDER BY m.starts,m.rid,m.meeting_id`,w.args);
  return{version:await this.version(),total,items:rows.map(r=>({...JSON.parse(r.meeting),project:toSummary(r)})),nextCursor:cursor+limit<total?String(cursor+limit):null};
 }
}
