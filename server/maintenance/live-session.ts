import {existsSync,mkdirSync,readFileSync,writeFileSync,renameSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';import {Budget,hash} from './policy';import {ResearchReader} from './research-reader';
export const LIVE_PILOT_REQUEST_CAP=20;
/** Manual, evidence-only session. Its ledger counts every actual attempt, including robots and retries. */
export class LiveValidationSession{
 readonly budget:Budget;readonly reader:ResearchReader;readonly state:any;
 private lockHeld=false;
 constructor(readonly directory:string,transport:typeof fetch=fetch){
  mkdirSync(directory,{recursive:true});const path=join(directory,'ledger.json');
  this.state=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{createdAt:new Date().toISOString(),cap:LIVE_PILOT_REQUEST_CAP,reservedRequests:20,requests:[],responses:{},closed:false};
  if(this.state.cap!==LIVE_PILOT_REQUEST_CAP||this.state.requests.length>LIVE_PILOT_REQUEST_CAP)throw Error('Invalid pilot request ledger');
  if(!this.state.closed){writeFileSync(join(directory,'capture.lock'),JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}),{flag:'wx'});this.lockHeld=true;}
  this.budget=new Budget(240,LIVE_PILOT_REQUEST_CAP,100,10_000_000);this.budget.requests=this.state.requests.length;
  this.budget.bytes=this.state.bytes||0;
  this.reader=new ResearchReader(this.budget,(url,response)=>{
   const file=hash(url)+'.json',entry={url,body:response.body,sha256:hash(response.body),retrievedAt:new Date().toISOString(),status:response.status,etag:response.etag,lastModified:response.modified};
   writeFileSync(join(directory,file),JSON.stringify(entry,null,2));this.state.responses[url]={file,sha256:entry.sha256,retrievedAt:entry.retrievedAt};this.save();
  },async(input,options)=>{
   if(this.state.closed||this.state.requests.length>=LIVE_PILOT_REQUEST_CAP)throw Error('Live pilot request cap reached or session closed');
   const entry:any={ordinal:this.state.requests.length+1,url:String(input),startedAt:new Date().toISOString()};this.state.requests.push(entry);this.save();
   try{const response=await transport(input,options);entry.status=response.status;entry.completedAt=new Date().toISOString();this.save();return response;}catch(e:any){entry.error=e.message;entry.completedAt=new Date().toISOString();this.save();throw e;}
  });this.save();
 }
 save(){this.state.bytes=this.budget?.bytes||this.state.bytes||0;const path=join(this.directory,'ledger.json');writeFileSync(path+'.tmp',JSON.stringify(this.state,null,2));renameSync(path+'.tmp',path);}
 release(){if(this.lockHeld){unlinkSync(join(this.directory,'capture.lock'));this.lockHeld=false;}}
 async get(url:string){
  const saved=this.state.responses[url];if(saved){const response=JSON.parse(readFileSync(join(this.directory,saved.file),'utf8'));if(response.sha256!==hash(response.body))throw Error('Evidence integrity failure');return{...response,sessionReplay:true};}
  if(this.state.closed)throw Error('Pilot session closed; no new research authorized');
  const robotsURL=new URL(url).origin+'/robots.txt',policy=this.state.requests.findLast((r:any)=>r.url===robotsURL&&r.completedAt&&r.status);
  if(policy){const file=this.state.responses[robotsURL]?.file,body=file?JSON.parse(readFileSync(join(this.directory,file),'utf8')).body:undefined;this.reader.seedAccessPolicy(url,{url:robotsURL,status:policy.status,body,checkedAt:policy.completedAt});}
  try{const result=await this.reader.get(url);return{...result,retrievedAt:this.state.responses[url]?.retrievedAt,sessionReplay:false};}finally{this.save();}
 }
}
