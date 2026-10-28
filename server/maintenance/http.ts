import{lookup}from'node:dns/promises';
import{isIP}from'node:net';
import{Budget,LimitReached}from'./policy';
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
function privateAddress(ip:string){return ip.includes(':')?!/^2|^3/.test(ip):/^(?:0|10|127|169\.254|192\.168|172\.(?:1[6-9]|2\d|3[01])|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7]))\./.test(ip);}
export async function safeURL(value:string,origin:string){
 const u=new URL(value);if(u.protocol!=='https:'||u.origin!==origin||u.username||u.password||u.port&&u.port!=='443'||isIP(u.hostname))throw Error('Only registered HTTPS source origins are allowed');
 const ips=await lookup(u.hostname,{all:true});if(!ips.length||ips.some(v=>privateAddress(v.address)))throw Error('Private network source refused');
 return u;
}
export class SourceHTTP{
 private last=0;
 constructor(public budget:Budget,public origin:string,private transport:typeof fetch=fetch){}
 async get(url:string,headers:Record<string,string>={}){
  await safeURL(url,this.origin);
  for(let attempt=0;attempt<3;attempt++){
   this.budget.check();await wait(Math.max(0,1000-(Date.now()-this.last)));this.budget.check();this.budget.requests++;this.last=Date.now();
   const r=await this.transport(url,{redirect:'manual',signal:AbortSignal.timeout(Math.min(15000,Math.max(1000,this.budget.seconds*1000-(Date.now()-this.budget.started)-5000))),headers:{'User-Agent':'BuildWatch/1.0 development monitoring; official public sources',...headers}});
   if([429,500,502,503,504].includes(r.status)&&attempt<2){await r.body?.cancel();await wait(Math.min(4000,1000*2**attempt));continue;}
   if(r.status===304)return{status:304,body:'',etag:r.headers.get('etag'),modified:r.headers.get('last-modified')};
   if(!r.ok){await r.body?.cancel();throw Error('Official source HTTP '+r.status);}
   const max=Math.min(2_000_000,this.budget.maxBytes-this.budget.bytes),reader=r.body!.getReader();let size=0;const chunks:Uint8Array[]=[];
   try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;this.budget.bytes+=part.value.byteLength;if(size>max)throw new LimitReached('Document download ceiling reached');chunks.push(part.value);}}catch(e){await reader.cancel();throw e;}
   return{status:r.status,body:Buffer.concat(chunks).toString('utf8'),etag:r.headers.get('etag'),modified:r.headers.get('last-modified')};
  }throw Error('Source retry limit reached');
 }
}
