import {createServer,request} from 'node:http';
import {readFileSync,statSync,realpathSync,createReadStream} from 'node:fs';
import {resolve,sep,extname} from 'node:path';
import {pipeline} from 'node:stream';
const root=realpathSync(resolve('dist-web'));
const publicPaths=new Set(['/api/catalog','/api/browse','/api/map','/api/meetings','/api/state-boundaries/2025-20m']);
const types={'.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.ico':'image/x-icon','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf'};
let count=0,windowAt=Date.now();
const server=createServer((req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  if(Date.now()-windowAt>60000){count=0;windowAt=Date.now();}if(++count>1200){json(429,{error:'Preview is busy. Please retry shortly.'});return;}
  if(!['GET','HEAD'].includes(req.method)){json(405,{error:'This shared preview is read-only.'});return;}
  try{
    const url=new URL(req.url,'http://localhost'),path=url.pathname;
    if(path==='/api/config'){json(200,{auth:false,billing:false,push:false,linking:false,deletion:false,privacyURL:null,termsURL:null,sharedPreview:true});return;}
    if(publicPaths.has(path)||/^\/api\/public\/projects\/[^/]+$/.test(path)){
      const upstream=request({hostname:'127.0.0.1',port:8765,path:url.pathname+url.search,method:'GET',headers:{...(req.headers['if-none-match']?{'If-None-Match':req.headers['if-none-match']}:{}),...(req.headers['accept-encoding']?{'Accept-Encoding':req.headers['accept-encoding']}:{})}},response=>{
        for(const key of ['content-type','content-encoding','cache-control','etag','vary'])if(response.headers[key])res.setHeader(key,response.headers[key]);
        res.writeHead(response.statusCode||502);if(req.method==='HEAD'){response.resume();res.end();}else pipeline(response,res,()=>{});
      });
      upstream.setTimeout(30000,()=>upstream.destroy());upstream.on('error',()=>{if(!res.headersSent)json(502,{error:'Preview is unavailable. Please ask the owner to restart it.'});else res.destroy();});upstream.end();return;
    }
    if(path.startsWith('/api/')){json(403,{error:'Account and administrator tools are unavailable in this shared preview.'});return;}
    if(path==='/'||path==='/index.html'){
      let html=readFileSync(resolve(root,'index.html'),'utf8');
      html=html.replace('<title>BuildWatch</title>','<title>BuildWatch — Shared Preview</title><meta name="description" content="Explore North Carolina development projects with BuildWatch."><meta property="og:title" content="BuildWatch"><meta property="og:description" content="Explore development projects and public meetings in North Carolina."><meta name="robots" content="noindex,nofollow">');
      html=html.replace('</head>','<script>try{localStorage.setItem("buildwatch.welcome.v1","yes")}catch{}</script></head>');
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:html);return;
    }
    if(!(path.startsWith('/_expo/')||path.startsWith('/assets/')||path==='/favicon.ico')){json(404,{error:'Not found'});return;}
    const file=realpathSync(resolve(root,'.'+decodeURIComponent(path)));if(!file.startsWith(root+sep)||!statSync(file).isFile()){json(404,{error:'Not found'});return;}
    res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'public, max-age=3600'});
    if(req.method==='HEAD')res.end();else pipeline(createReadStream(file),res,()=>{});
  }catch{if(!res.headersSent)json(404,{error:'Not found'});else res.destroy();}
});
server.listen(8766,'127.0.0.1',()=>console.log('Read-only BuildWatch preview: http://127.0.0.1:8766'));
