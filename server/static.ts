import{createServer}from'node:http';
import{readFileSync,statSync}from'node:fs';
import{resolve,sep,extname}from'node:path';
import{gzipSync}from'node:zlib';
/** Local preview only. It never opens SQLite, runs jobs, or handles account data. */
export function createStaticPreview(webRoot:string){
 const root=resolve(webRoot),cache=new Map<string,{stamp:string;raw:Buffer;gzip?:Buffer}>();
 const types:Record<string,string>={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.ttf':'font/ttf'};
 return createServer((req,res)=>{
  try{
   const url=new URL(req.url||'/','http://localhost');
   if(url.pathname.startsWith('/api/')){res.writeHead(410,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'The application backend has moved to Supabase. Reload the app.'}));return;}
   if(!['GET','HEAD'].includes(req.method||'')){res.writeHead(405);res.end();return;}
   const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
   if(!path.startsWith(root+sep)){res.writeHead(403);res.end();return;}
   let stat;try{stat=statSync(path);}catch{res.writeHead(404);res.end();return;}if(!stat.isFile()){res.writeHead(404);res.end();return;}
   const stamp=stat.mtimeMs+':'+stat.size;let asset=cache.get(path);
   if(!asset||asset.stamp!==stamp){const raw=readFileSync(path);asset={stamp,raw,...(/\.(js|css|html|svg|json)$/.test(path)?{gzip:gzipSync(raw)}:{})};if(cache.size>=32)cache.delete(cache.keys().next().value!);if(raw.length<8*1024*1024)cache.set(path,asset);}
   const tag='W/"'+stamp+'"';res.setHeader('Content-Type',types[extname(path)]||'application/octet-stream');res.setHeader('ETag',tag);res.setHeader('Cache-Control','no-cache');res.setHeader('Vary','Accept-Encoding');res.setHeader('X-Content-Type-Options','nosniff');
   if(req.headers['if-none-match']===tag){res.writeHead(304);res.end();return;}
   const compressed=asset.gzip&&/(?:^|,)\s*gzip\s*(?:,|$)/.test(req.headers['accept-encoding']||'');const body=compressed?asset.gzip!:asset.raw;if(compressed)res.setHeader('Content-Encoding','gzip');res.setHeader('Content-Length',body.length);res.end(req.method==='HEAD'?undefined:body);
  }catch{res.writeHead(400);res.end();}
 });
}
