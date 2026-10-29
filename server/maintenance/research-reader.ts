import {SourceHTTP} from './http';import {Budget,hash} from './policy';import {robotsAllows,robotsUnavailableAllows} from './worker';
/** Manual research reader: policies checked at every origin and redirect target. */
export class ResearchReader{
 private policies=new Map<string,Promise<string>>();private cache=new Map<string,Promise<any>>();
 snapshotHits=0;private snapshots=new Set<string>();
 constructor(private budget:Budget,private onRead?:(url:string,response:any)=>void){}
 /** Snapshot time stays distinct from a new successful network verification. */
 seed(snapshot:{url:string;body:string;checkedAt:string;hash:string},now=Date.now()){
  const age=now-Date.parse(snapshot.checkedAt),u=new URL(snapshot.url);if(u.protocol!=='https:'||u.username||u.password||!Number.isFinite(age)||age<0||age>86400000||Buffer.byteLength(snapshot.body)>2_000_000||hash(snapshot.body)!==snapshot.hash)return false;
  this.cache.set(snapshot.url,Promise.resolve({url:snapshot.url,body:snapshot.body,rawBody:Buffer.from(snapshot.body),snapshotAt:snapshot.checkedAt,fromSnapshot:true}));this.snapshots.add(snapshot.url);return true;
 }
 get(url:string):Promise<{body:string;rawBody:Buffer;url:string;snapshotAt?:string;fromSnapshot?:boolean}>{if(this.snapshots.has(url))this.snapshotHits++;if(!this.cache.has(url))this.cache.set(url,this.read(url));return this.cache.get(url)!;}
 private async read(url:string,depth=0):Promise<any>{
  if(depth>2)throw Error('Canonical redirect ceiling reached');const original=new URL(url);let redirected='';
  const transport:typeof fetch=async(input,options)=>{const response=await fetch(input,options);if(response.status>=300&&response.status<400)redirected=response.headers.get('location')||'';return response;};
  const http=new SourceHTTP(this.budget,original.origin,transport);
  try{
   if(!this.policies.has(original.origin))this.policies.set(original.origin,(async()=>{try{return(await http.get(original.origin+'/robots.txt')).body;}catch(e:any){if(robotsUnavailableAllows({authority:'official',adapter:/\/(?:FeatureServer|MapServer)\/\d+/.test(url)?'arcgis':'document',url} as any,e.message))return'';throw e;}})());
   const policy=await this.policies.get(original.origin)!;http.accessPolicy=u=>robotsAllows(policy,u.pathname+u.search);
   http.minimumInterval=Math.max(1,...[...policy.matchAll(/^crawl-delay:\s*(\d+(?:\.\d+)?)/gim)].map(v=>Number(v[1])))*1000;if(http.minimumInterval>60000)throw Error('Crawl delay requires a separate bounded run');
   http.redirectPolicy=u=>!/(?:login|signin|authenticate)/i.test(u.pathname);const response=await http.get(url);this.onRead?.(url,response);return{...response,url};
  }catch(e:any){
   if(redirected&&/HTTP 30[1278]$/.test(e.message)){const next=new URL(redirected,url);if(next.protocol==='https:'&&!next.username&&!next.password&&next.hostname.replace(/^www\./,'')===original.hostname.replace(/^www\./,'')){
    if(next.pathname==='/robots.txt'){next.pathname=original.pathname;next.search=original.search;}return this.read(next.href,depth+1);
   }}throw e;
  }
 }
}
export function linkedArcGISServices(value:any){
 const urls=new Map<string,number>(),ids=new Map<string,number>();
 const walk=(v:any,depth:number)=>{if(depth>20||!v)return;if(Array.isArray(v)){for(const x of v.slice(0,200))walk(x,depth+1);return;}if(typeof v!=='object')return;
  for(const[key,item]of Object.entries(v)){if(typeof item==='string'){
   const label=[v.title,v.label,v.name,v.sourceLabel].filter(x=>typeof x==='string').join(' ');
   if(/^https:\/\/[^\s]+\/(?:FeatureServer|MapServer)(?:\/\d+)?(?:\?|$)/i.test(item)&&!/boundary|parcel|(?:^|_)roads?|street|\bETJ\b|flood|zoning.district/i.test(label))urls.set(item.replace(/\?.*$/,''),/development|project|planning.case|rezoning/i.test(label)?2:0);
   if(/^(?:itemId|webmap|webMapId)$/i.test(key)&&/^[a-f0-9]{32}$/i.test(item))ids.set(item,/web.?map/i.test(String(v.type||'')+' '+key)?2:0);
  }else walk(item,depth+1);}
 };walk(value,0);return{urls:[...urls].sort((a,b)=>b[1]-a[1]).slice(0,12).map(v=>v[0]),itemIds:[...ids].sort((a,b)=>b[1]-a[1]).slice(0,4).map(v=>v[0])};
}
