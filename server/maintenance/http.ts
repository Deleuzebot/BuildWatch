import{lookup}from'node:dns/promises';
import{isIP}from'node:net';
import{Budget,LimitReached}from'./policy';
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const lastByOrigin=new Map<string,number>();
export class DocumentTooLarge extends Error{}
function privateAddress(ip:string){return ip.includes(':')?!/^2|^3/.test(ip):/^(?:0|10|127|169\.254|192\.168|172\.(?:1[6-9]|2\d|3[01])|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7]))\./.test(ip);}
export async function safeURL(value:string,origin:string){
 const u=new URL(value);if(u.protocol!=='https:'||u.origin!==origin||u.username||u.password||u.port&&u.port!=='443'||isIP(u.hostname))throw Error('Only registered HTTPS source origins are allowed');
 const ips=await lookup(u.hostname,{all:true});if(!ips.length||ips.some(v=>privateAddress(v.address)))throw Error('Private network source refused');
 return u;
}
export class SourceHTTP{
 minimumInterval=1000;
 accessPolicy?: (url:URL)=>boolean;
 /** Explicit same-origin canonical document redirects only; off by default. */
 redirectPolicy?: (url:URL)=>boolean;
 constructor(public budget:Budget,public origin:string,private transport:typeof fetch=fetch){}
 async get(url:string,headers:Record<string,string>={},redirects=0):Promise<{status:number;body:string;rawBody:Buffer;etag:string|null;modified:string|null}>{
  const target=await safeURL(url,this.origin);if(this.accessPolicy&&!this.accessPolicy(target))throw Error('robots.txt restricts automatic retrieval for this request.');
  for(let attempt=0;attempt<3;attempt++){
   this.budget.check();const delay=Math.max(0,this.minimumInterval-(Date.now()-(lastByOrigin.get(this.origin)||0)));if(delay>this.budget.seconds*1000-(Date.now()-this.budget.started)-5000)throw new LimitReached('Source rate limit requires a later attempt');await wait(delay);this.budget.check();this.budget.requests++;lastByOrigin.set(this.origin,Date.now());
   let r:Response;try{r=await this.transport(url,{redirect:'manual',signal:AbortSignal.timeout(Math.min(15000,Math.max(1000,this.budget.seconds*1000-(Date.now()-this.budget.started)-5000))),headers:{'User-Agent':'BuildWatch/1.0 development monitoring; official public sources',...headers}});}catch(e){if(attempt===2)throw Error('Source network retries exhausted');await wait(1000*2**attempt);continue;}
   if([429,500,502,503,504].includes(r.status)&&attempt<2){await r.body?.cancel();const retryAfter=Number(r.headers.get('retry-after'))||0;if(retryAfter>10)throw new LimitReached('Source Retry-After deferred to a later run');await wait(Math.max(retryAfter*1000,Math.min(4000,1000*2**attempt)));continue;}
   if([301,302,307,308].includes(r.status)&&this.redirectPolicy&&redirects<2){
    const location=r.headers.get('location');await r.body?.cancel();if(!location)throw Error('Document redirect has no target');const next=await safeURL(new URL(location,url).href,this.origin);
    if(!this.redirectPolicy(next))throw Error('Document redirect target is not approved');return this.get(next.href,headers,redirects+1);
   }
   if(r.status===304)return{status:304,body:'',rawBody:Buffer.alloc(0),etag:r.headers.get('etag'),modified:r.headers.get('last-modified')};
   if(!r.ok){await r.body?.cancel();throw Error('Official source HTTP '+r.status);}
   const max=Math.min(2_000_000,this.budget.maxBytes-this.budget.bytes),reader=r.body!.getReader();let size=0;const chunks:Uint8Array[]=[];
   try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;this.budget.bytes+=part.value.byteLength;if(size>max){if(max<2_000_000)throw new LimitReached('Run download ceiling reached');throw new DocumentTooLarge('Document exceeds 2 MB; deferred for manual review');}chunks.push(part.value);}}catch(e){await reader.cancel();throw e;}
   const rawBody=Buffer.concat(chunks);return{status:r.status,body:rawBody.toString('utf8'),rawBody,etag:r.headers.get('etag'),modified:r.headers.get('last-modified')};
  }throw Error('Source retry limit reached');
 }
}
