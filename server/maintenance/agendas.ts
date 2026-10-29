import {spawn} from 'node:child_process';import {resolve} from 'node:path';import {hash} from './policy';
import {pdfProfile,type PDFProfile} from './pdf-limits';
export type PDFText={pages:{page:number;text:string}[];totalPages:number;truncated:boolean;metrics?:{wallMs:number;cpuSeconds:number;peakRSSBytes:number;expandedBytes:number}};
export function extractAgendaPDF(data:Buffer,profile:PDFProfile='standard'):Promise<PDFText>{
 const limits=pdfProfile(profile);if(data.length>limits.bytes||!data.subarray(0,5).equals(Buffer.from('%PDF-')))return Promise.reject(Error('Not a bounded PDF document'));
 return new Promise((done,reject)=>{
  const child=spawn(process.env.BW_PDF_PYTHON||'python3',['-I',resolve('scripts/extract-agenda-pdf.py'),profile],{stdio:['pipe','pipe','pipe']}),out:Buffer[]=[];let bytes=0,settled=false;
  const finish=(error?:Error,value?:PDFText)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):done(value!);};
  const timer=setTimeout(()=>{child.kill('SIGKILL');finish(Error('PDF extraction time ceiling reached'));},limits.wallMs);
  let diagnostic='';
  child.on('error',e=>finish(e));child.stdin.on('error',()=>{});
  child.stderr.on('data',b=>{diagnostic=(diagnostic+b.toString()).slice(-8192);});
  child.stdout.on('data',b=>{bytes+=b.length;if(bytes>limits.text*6+100000){child.kill('SIGKILL');finish(Error('PDF text ceiling reached'));}else out.push(b);});
  child.on('close',(code,signal)=>{if(code!==0)return finish(Error('PDF extraction failed (exit='+code+', signal='+signal+'): '+diagnostic.trim()));try{const value=JSON.parse(Buffer.concat(out).toString());if(!Array.isArray(value.pages)||value.pages.length>limits.pages||value.pages.some((p:any)=>typeof p.text!=='string')||value.pages.reduce((n:number,p:any)=>n+p.text.length,0)>limits.text)throw Error('Invalid PDF text');if(value.pages.reduce((n:number,p:any)=>n+p.text.trim().length,0)<40)return finish(Error('Insufficient PDF text; scanned or empty document requires manual review'));finish(undefined,value);}catch{finish(Error('PDF text could not be validated'));}});
  child.stdin.end(data);
 });
}
/** Evidence snippets only: an agenda request is never an approved project milestone. */
export function agendaReferences(pdf:PDFText,url:string){
 const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password)throw Error('Official HTTPS document URL required');
 const records:any[]=[];const seen=new Set<string>();
 for(const page of pdf.pages){
  const text=page.text.replace(/\r/g,'');
  const pattern=/\b(?:[A-Z]{1,5}[- ]\d{2,4}[- ]\d{1,4}|(?:case|petition|rezoning|application)\s*(?:number|no\.?|#|:)\s*[A-Z0-9][A-Z0-9.-]{2,24})\b/gi;
  for(const match of text.matchAll(pattern)){
   const identity=match[0].trim(),start=Math.max(0,match.index!-180),quote=text.slice(start,Math.min(text.length,match.index!+500)).trim();
   if(!/rezon|subdivi|development|site.plan|special.use|conditional.zon|apartments|housing|industrial|commercial/i.test(quote))continue;
   const key=hash([url,identity.toUpperCase(),quote]);if(seen.has(key))continue;seen.add(key);
   records.push({id:key,documentURL:url,page:page.page,sourceIdentifier:identity,quote,reviewRequired:true,kind:'agenda_case_reference',statusVerified:false,meetingAssociationVerified:false});if(records.length>=50)return records;
  }
 }
 return records;
}
