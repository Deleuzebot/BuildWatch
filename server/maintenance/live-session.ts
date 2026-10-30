import {existsSync,mkdirSync,readFileSync,writeFileSync,renameSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';import {Budget,hash} from './policy';import {ResearchReader} from './research-reader';
export const LIVE_PILOT_REQUEST_CAP=20;
/** Manual, evidence-only session. Its ledger counts every actual attempt, including robots and retries. */
export class LiveValidationSession{
 readonly budget:Budget;readonly reader:ResearchReader;readonly state:any;
 private lockHeld=false;
 constructor(readonly directory:string,transport:typeof fetch=fetch,readonly requestCap=LIVE_PILOT_REQUEST_CAP,authorization?:{reference:string;maximumRequests:number;maximumSearches:number}){
  if(authorization&&(!authorization.reference||authorization.reference.length>1000||!Number.isInteger(authorization.maximumRequests)||authorization.maximumRequests<1||authorization.maximumRequests>50||!Number.isInteger(authorization.maximumSearches)||authorization.maximumSearches<0||authorization.maximumSearches>4))throw Error('Invalid bounded manual authorization');
  const authorizedMaximum=authorization?.reference?Math.min(50,authorization.maximumRequests):LIVE_PILOT_REQUEST_CAP;
  if(!Number.isInteger(requestCap)||requestCap<1||requestCap>authorizedMaximum)throw Error('Manual session exceeds its explicit authorization (default maximum 20)');
  mkdirSync(directory,{recursive:true});const path=join(directory,'ledger.json');
  this.state=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{createdAt:new Date().toISOString(),cap:requestCap,reservedRequests:requestCap,requests:[],responses:{},closed:false};
  if(this.state.cap!==requestCap||this.state.requests.length>requestCap)throw Error('Invalid pilot request ledger');
  if(authorization){if(this.state.authorization&&JSON.stringify(this.state.authorization)!==JSON.stringify(authorization))throw Error('Authorization does not match the resumed session');this.state.authorization=authorization;this.state.searches??=[];}
  if(!this.state.closed){writeFileSync(join(directory,'capture.lock'),JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}),{flag:'wx'});this.lockHeld=true;}
  this.budget=new Budget(240,requestCap,100,10_000_000);this.budget.requests=this.state.requests.length;
  this.budget.bytes=this.state.bytes||0;
  this.reader=new ResearchReader(this.budget,(url,response)=>{
   const file=hash(url)+'.json',entry={url,body:response.body,sha256:hash(response.body),retrievedAt:new Date().toISOString(),status:response.status,etag:response.etag,lastModified:response.modified};
   writeFileSync(join(directory,file),JSON.stringify(entry,null,2));this.state.responses[url]={file,sha256:entry.sha256,retrievedAt:entry.retrievedAt};this.save();
  },async(input,options)=>{
   if(this.state.closed||this.state.requests.length>=requestCap)throw Error('Live pilot request cap reached or session closed');
   const entry:any={ordinal:this.state.requests.length+1,url:String(input),startedAt:new Date().toISOString()};this.state.requests.push(entry);this.save();
   try{const response=await transport(input,options);entry.status=response.status;entry.completedAt=new Date().toISOString();this.save();return response;}catch(e:any){entry.error=e.message;entry.completedAt=new Date().toISOString();this.save();throw e;}
  });this.save();
 }
 save(){this.state.bytes=this.budget?.bytes||this.state.bytes||0;const path=join(this.directory,'ledger.json');writeFileSync(path+'.tmp',JSON.stringify(this.state,null,2));renameSync(path+'.tmp',path);}
 release(){if(this.lockHeld){unlinkSync(join(this.directory,'capture.lock'));this.lockHeld=false;}}
 reserveSearch(query:string){if(!this.state.authorization||!Number.isInteger(this.state.authorization.maximumSearches)||this.state.closed||typeof query!=='string'||!query.trim()||query.length>500)throw Error('Explicit bounded search authorization required');const old=this.state.searches.find((s:any)=>s.query===query);if(old)return{...old,alreadyReserved:true};if(this.state.searches.length>=this.state.authorization.maximumSearches)throw Error('Search query ceiling reached');const entry={id:this.state.searches.length+1,query,reservedAt:new Date().toISOString(),state:'reserved'};this.state.searches.push(entry);this.save();return entry;}
 recordSearch(id:number,evidenceRef:string){const entry=this.state.searches?.find((s:any)=>s.id===id);if(!entry||!evidenceRef)throw Error('Reserve the search before recording its result');entry.state='completed';entry.evidenceRef=evidenceRef;this.save();return entry;}
 async get(url:string){
  const saved=this.state.responses[url];if(saved){const response=JSON.parse(readFileSync(join(this.directory,saved.file),'utf8'));if(response.sha256!==hash(response.body))throw Error('Evidence integrity failure');return{...response,sessionReplay:true};}
  if(this.state.closed)throw Error('Pilot session closed; no new research authorized');
  const robotsURL=new URL(url).origin+'/robots.txt',policy=this.state.requests.findLast((r:any)=>r.url===robotsURL&&r.completedAt&&r.status);
  if(policy){const file=this.state.responses[robotsURL]?.file,body=file?JSON.parse(readFileSync(join(this.directory,file),'utf8')).body:undefined;this.reader.seedAccessPolicy(url,{url:robotsURL,status:policy.status,body,checkedAt:policy.completedAt});}
  try{const result=await this.reader.get(url);return{...result,retrievedAt:this.state.responses[url]?.retrievedAt,sessionReplay:false};}finally{this.save();}
 }
}
