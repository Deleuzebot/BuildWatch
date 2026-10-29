/** Offline-safe document interpretation. Outputs are private proposals, never publication authority. */
export type EvidencePage={page:number;text:string};
export type DocumentEvidence={url:string;sha256:string;pages:EvidencePage[];official:boolean};
const clean=(s:string)=>s.replace(/\s+/g,' ').trim();
function valid(d:DocumentEvidence){return d.official&&/^https:\/\//.test(d.url)&&/^[a-f0-9]{64}$/.test(d.sha256);}
/** Case headings delimit continuations across pages. Votes before/after the section cannot leak in. */
export function applicationVote(d:DocumentEvidence,caseId:string,date:string){
 if(!valid(d)||!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
 const pages=d.pages.slice().sort((a,b)=>a.page-b.page),text=pages.map(p=>p.text).join('\n');
 const parsed=new Date(date+'T00:00:00Z');if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)return null;
 const label=parsed.toLocaleDateString('en-US',{timeZone:'UTC',month:'long',day:'numeric',year:'numeric'});
 if(!clean(text).toLowerCase().includes(label.toLowerCase()))return null;
 // Only headings, not mentions of a case in discussion, establish a new section.
 const headings=[...text.matchAll(/(?:^|\n)\s*((?:CZ|Z)-\d{4}-\d+)\s*[–—-]/g)];
 const heading=headings.find(h=>h[1]===caseId);if(!heading)return null;
 const start=heading.index!,next=headings.find(h=>h.index!>start),section=text.slice(start,next?.index??text.length);
 // A statement-of-consistency vote is distinct from the actual resolution to zone.
 const resolution=section.search(/motion regarding the Resolution to Zone/i);if(resolution<0)return null;
 const decision=section.slice(resolution),vote=decision.match(/motion (?:was )?(?:approved|carried)\b[\s\S]{0,100}?(?:six to two|\d+\s*(?:to|-)\s*\d+|unanimously)/i);
 if(!vote)return null;
 // Require approval motion in the same section; staff recommendations alone never qualify.
 if(!/motion to approve/i.test(decision.slice(0,decision.indexOf(vote[0])+vote[0].length)))return null;
 const offset=start+resolution+decision.indexOf(vote[0]);let length=0,page=pages[0]?.page;
 for(const p of pages){if(offset<length+p.text.length){page=p.page;break;}length+=p.text.length+1;}
 return {kind:'application_decision',caseId,date,scope:'application',wholeProjectStatus:null,requiresReview:true,url:d.url,sha256:d.sha256,page,quote:clean(vote[0]),reason:'Recorded application vote; authority, appeal period, and parent development status need separate verification.'};
}
/** Explicit past-tense construction evidence only. Context year must be supplied and documented. */
export function constructionStatement(d:DocumentEvidence,heading:string,contextYear:number){
 if(!valid(d)||contextYear<2000||contextYear>2100)return null;
 for(const p of d.pages){const normalized=clean(p.text),start=normalized.toLowerCase().indexOf(clean(heading).toLowerCase());if(start<0)continue;
 const section=normalized.slice(start),match=section.match(/[^.!?]*(?:construction[^.!?]*started|started[^.!?]*construction) on (January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:\s*,?\s*(20\d{2}))?[^.!?]*[.!?]/i);
 if(!match||/\b(?:anticipated|expected|scheduled|will|may|could)\b/i.test(match[0]))continue;
 const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
 const year=Number(match[3]||contextYear),month=months.findIndex(m=>m.toLowerCase()===match[1].toLowerCase())+1,day=Number(match[2]);
 const date=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
 const parsed=new Date(date+'T00:00:00Z');if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)continue;
 return {kind:'construction_started',date,dateBasis:match[3]?'explicit_year':'document_period_requires_confirmation',scope:'described_component',wholeProjectStatus:null,requiresReview:true,url:d.url,sha256:d.sha256,page:p.page,quote:clean(match[0])};
 }return null;
}
/** Secondary evidence can corroborate a bound identity/event, not establish a government decision. */
export function corroborates(a:{projectId:string;event:string;date:string;scope:string;official:boolean},b:{projectId:string;event:string;date:string;scope:string;official:boolean},identityBindingVerified:boolean){
 return identityBindingVerified&&a.official&&!b.official&&!!a.projectId&&a.projectId===b.projectId&&a.event===b.event&&a.date===b.date&&a.scope===b.scope;
}
/** Extractive descriptions retain numbers and modal language; no generated facts or dates. */
export function groundedDescription(d:DocumentEvidence,quote:string,previous:string){
 const after=clean(quote);if(!valid(d)||after.length<40||after.length>2000||!d.pages.some(p=>clean(p.text).includes(after))||clean(previous)===after)return null;
 return {before:previous,after,url:d.url,sha256:d.sha256,requiresReview:true,approvalDateChange:null,statusChange:null};
}
/** A reviewed source-record binding is mandatory. Name/proximity candidates cannot attach events. */
export function reconcileDocumentProposal(evidence:{url:string;sha256:string;date:string;kind:string;scope:string},context:{projectId:string|null;binding:{url:string;verified:boolean}|null;events:{url:string;date:string;kind:string;scope:string}[]}){
 const bound=!!context.projectId&&context.binding?.verified===true&&context.binding.url===evidence.url;
 const duplicate=bound&&context.events.some(e=>e.url===evidence.url&&e.date===evidence.date&&e.kind===evidence.kind&&e.scope===evidence.scope);
 return {projectId:bound?context.projectId:null,outcome:!bound?'identity_review':duplicate?'unchanged':'proposed_milestone',duplicateSuppressed:duplicate,evidence,publication:false,archival:false,approvalDateChange:null,wholeProjectStatus:null,requiresReview:!duplicate};
}
