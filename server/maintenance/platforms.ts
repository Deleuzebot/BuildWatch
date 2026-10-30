import type {Source} from './policy';
import {noticeLinks} from './notices';
import {hash} from './policy';
import {extractAgendaItems} from './end-to-end';
import {applicationVote,groundedDescription} from './document-decisions';
import type {PDFText} from './agendas';

/** Platform reuse does not imply a shared authority or permission to crawl a tenant. */
export function governmentPlatform(url:string){
 const u=new URL(url);
 if(/\/(FeatureServer|MapServer)(?:\/\d+)?(?:\/query)?$/i.test(u.pathname))return 'arcgis';
 if(/\/AgendaCenter(?:\/|$)|\/DocumentCenter\/|\/Archive\.aspx/i.test(u.pathname))return 'civicplus';
 if(u.hostname.endsWith('.portal.civicclerk.com'))return 'civicclerk';
 if(u.hostname.endsWith('.legistar.com'))return 'legistar';
 return 'official_html';
}
/** Link dates prioritize retrieval only. They never become approval/construction dates. */
export function evidenceDocuments(source:Source,html:string){
 const documents=noticeLinks(source,html).map(link=>{
  const value=decodeURIComponent(link.url)+' '+link.title;
  const m=value.match(/(?:_|\/)(\d{2})(\d{2})(20\d{2})(?:-|\b)/);
  let indexDate:string|null=null;
  if(m){const date=`${m[3]}-${m[1]}-${m[2]}`,n=Date.parse(date+'T00:00:00Z');if(Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===date)indexDate=date;}
  return {...link,indexDate,role:/minutes/i.test(value)?'minutes':/agenda|packet/i.test(value)?'agenda':'planning_document'};
 });
 return documents.sort((a,b)=>(b.indexDate||'').localeCompare(a.indexDate||'')||a.url.localeCompare(b.url));
}
/** Common PDF-to-private-proposal stage. No unknown status, coordinates or parent are invented. */
export function planningDocumentFindings(source:Source,pdf:PDFText,url:string,documentHash:string){
 const evidence={url,sha256:documentHash,pages:pdf.pages,official:source.authority==='official'};
 const first=pdf.pages[0]?.text||'',m=first.match(/Minutes of (?:the )?Meeting[\s\S]{0,80}?([A-Z][a-z]+\s+\d{1,2},\s+20\d{2})/);
 const n=m?Date.parse(m[1]+' 00:00:00 UTC'):NaN,date=Number.isFinite(n)?new Date(n).toISOString().slice(0,10):null;
 return extractAgendaItems(pdf.pages).map(item=>{
  const externalId=item.caseId.replace(/^Rezoning\s+/i,'').toUpperCase();
  const decision=source.config.decisionProfile==='kannapolis-resolution-v1'&&date?applicationVote(evidence,externalId,date):null;
  const quote=item.evidence[0]?.quote||'';
  return {externalId,name:externalId,description:quote,address:item.addresses.length===1?item.addresses[0]:'',latitude:null,longitude:null,rawStatus:'',category:item.principalUse||'',developer:'',url,quote,principalUseVerified:false,locationVerified:false,wholeDevelopment:false,recordKind:'planning_document_case',documentHash,documentPage:item.evidence[0]?.page,extractionTruncated:pdf.truncated,sourceDates:{},sourceFacts:{},
   documentProposal:{decision,description:groundedDescription(evidence,quote,''),scope:'application',publication:false,archival:false,approvalDateChange:null,requiresReview:true,identityVerified:false,issues:[...item.unresolved,...(pdf.truncated?['Document was truncated; do not infer absence of a later decision']:[])]},
   evidence:item.evidence,id:hash([source.id,externalId,documentHash])};
 });
}
