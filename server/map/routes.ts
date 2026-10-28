import type { IncomingMessage, ServerResponse } from 'node:http';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import stateBoundaries from './data/state-boundaries-2025.json';
import type { Store } from '../accounts/store';
import { MapQueries, parseBounds, parseFilters } from './queries';
/** Small, version-keyed LRU responses. Account data never enters this cache. */
export function mapRoutes(store: Store) {
  const queries=new MapQueries(store.db);
  const cache=new Map<string,{etag:string;body:Buffer;gzip:Buffer}>();
  let cachedBytes=0;
  const send=(req:IncomingMessage,res:ServerResponse,key:string,make:()=>unknown)=>{
    let value=cache.get(key);
    if(value){cache.delete(key);cache.set(key,value);}
    else{
      const body=Buffer.from(JSON.stringify(make()));value={etag:'W/"'+createHash('sha256').update(body).digest('hex')+'"',body,gzip:gzipSync(body)};
      cache.set(key,value);cachedBytes+=body.length+value.gzip.length;
      while(cache.size>96||cachedBytes>8*1024*1024){const first=cache.keys().next().value!;const old=cache.get(first)!;cache.delete(first);cachedBytes-=old.body.length+old.gzip.length;}
    }
    res.setHeader('ETag',value.etag);res.setHeader('Cache-Control','public, max-age=0, must-revalidate');res.setHeader('Vary','Origin, Accept-Encoding');res.setHeader('Access-Control-Expose-Headers','ETag, Server-Timing');
    if(req.headers['if-none-match']?.split(',').map(v=>v.trim()).includes(value.etag)){res.writeHead(304);res.end();return;}
    const gzip=(req.headers['accept-encoding']||'').split(',').some(v=>{const[name,...p]=v.trim().split(';');const q=p.find(s=>s.trim().startsWith('q='));return name==='gzip'&&(!q||Number(q.trim().slice(2))>0);});
    res.setHeader('Content-Type','application/json');if(gzip)res.setHeader('Content-Encoding','gzip');res.writeHead(200);res.end(gzip?value.gzip:value.body);
  };
  return (req:IncomingMessage,res:ServerResponse,url:URL)=>{
    if(req.method!=='GET')return false;
    const path=url.pathname;
    if(path==='/api/state-boundaries/2025-20m'){send(req,res,'boundaries-census-2025-20m-v1',()=>stateBoundaries);return true;}
    if(!['/api/catalog','/api/browse','/api/map','/api/meetings'].includes(path)&&!path.startsWith('/api/public/projects/'))return false;
    // One read snapshot keeps counts, nodes and the cache version consistent with external imports.
    store.db.exec('BEGIN');
    try {
    const start=performance.now(),version=queries.version();
    const filters=parseFilters(url.searchParams),bounds=parseBounds(url.searchParams.get('bbox'));
    const integer=(name:string,fallback:number)=>{const raw=url.searchParams.get(name);const n=raw===null?fallback:Number(raw);if(!Number.isSafeInteger(n)||n<0)throw Object.assign(new Error('Invalid '+name),{status:400});return n;};
    const key=version+'|'+url.pathname+'?'+[...url.searchParams.entries()].sort().map(x=>JSON.stringify(x)).join('&')+(path==='/api/meetings'||(filters.activity&&filters.activity!=='5y')||path.endsWith('/activity')?'|'+Math.floor(Date.now()/15000):'');
    const make=()=>{
      let value:unknown;
      if(path==='/api/catalog')value=queries.catalog();
      else if(path==='/api/browse')value=queries.browse(filters,integer('cursor',0),integer('limit',50),bounds);
      else if(path==='/api/map'){
        if(!bounds)throw Object.assign(new Error('Viewport bounds are required.'),{status:400});
        value=queries.map(filters,bounds,integer('zoom',7));
      }else if(path==='/api/meetings')value=queries.meetings(filters,integer('cursor',0),integer('limit',100));
      else{
        const activityPath=path.endsWith('/activity');
        const id=decodeURIComponent(path.slice('/api/public/projects/'.length,activityPath?-9:undefined));
        if(!id||id.length>160)throw Object.assign(new Error('Invalid project identifier.'),{status:400});
        const project=store.project(id);
        if(!project||!store.publicEligible(project.id))throw Object.assign(new Error('Project not found.'),{status:404});
        if(activityPath){const ids=store.componentIds(project.id),marks=ids.map(()=>'?').join(','),cursor=integer('cursor',0),limit=integer('limit',20);if(limit<1||limit>100||cursor>1000000)throw Object.assign(new Error('Invalid activity page.'),{status:400});const now=Date.now(),total=store.one('SELECT count(*) n FROM project_activity WHERE project_id IN ('+marks+') AND occurred_at<=?',...ids,now).n;const items=store.all('SELECT id,project_id projectId,type,event_date date,description,source_url sourceUrl,recorded_at recordedAt FROM project_activity WHERE project_id IN ('+marks+') AND occurred_at<=? ORDER BY occurred_at DESC,id LIMIT ? OFFSET ?',...ids,now,limit,cursor);value={total,items,nextCursor:cursor+limit<total?String(cursor+limit):null};}
        else value=project;
      }
      res.setHeader('Server-Timing',`query;dur=${(performance.now()-start).toFixed(2)}`);
      return value;
    };
    send(req,res,key,make);store.db.exec('COMMIT');return true;
    } catch(error){store.db.exec('ROLLBACK');throw error;}
  };
}
