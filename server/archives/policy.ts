export const YEAR=365*86400000;
export type ApprovalEvidence={date:string;url:string;quote:string;published?:string};
export type ConstructionEvidence={date:string;kind:'start'|'completion'|'schedule-through';url:string;quote:string;published?:string};
export function exactDate(value:string){
 if(typeof value!=='string')return undefined;
 if(/^\d{4}-\d{2}-\d{2}$/.test(value)){const n=Date.parse(value+'T00:00:00Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===value?n:undefined;}
 if(/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)){if(exactDate(value.slice(0,10))===undefined)return undefined;const n=Date.parse(value);return Number.isFinite(n)?n:undefined;}
 return undefined;
}
/** Year/month values are documented ranges, never invented exact construction dates. */
export function constructionUntil(value:string){
 if(/^\d{4}$/.test(value))return Date.UTC(Number(value)+1,0,1);
 if(/^\d{4}-(0[1-9]|1[0-2])$/.test(value))return Date.UTC(Number(value.slice(0,4)),Number(value.slice(5)),1);
 const day=exactDate(value);return day===undefined?undefined:day+(value.length===10?86400000:0);
}
export function validateSourceEvidence(e:any){if(!e||typeof e.url!=='string'||e.url.length>2048||typeof e.quote!=='string'||!e.quote.trim()||e.quote.length>4000)throw Error('Include a source URL and the specific supporting passage/field.');try{if(new URL(e.url).protocol!=='https:')throw Error();}catch{throw Error('Use an HTTPS source URL.');}if(e.published&&(exactDate(e.published)===undefined))throw Error('Source publication date must be an exact ISO date or timestamp.');}
export function policyValues(approval:ApprovalEvidence|null,schedules:ConstructionEvidence[],now=Date.now()){
 if(!Array.isArray(schedules)||schedules.length>30)throw Error('Use at most 30 documented construction dates/ranges.');
 let approvalAt:number|null=null;if(approval){validateSourceEvidence(approval);const n=exactDate(approval.date);if(n===undefined||n>now)throw Error('Use a documented approval date that has already occurred. Missing or ambiguous dates require review.');approvalAt=n;}
 let until:number|null=null;for(const e of schedules){validateSourceEvidence(e);if(!['start','completion','schedule-through'].includes(e.kind))throw Error('Choose construction start, completion, or schedule-through.');const n=constructionUntil(e.date);if(n===undefined)throw Error('Use an explicit construction date, month, or year; undated future statements do not qualify.');until=Math.max(until||0,n);}
 const expires=approvalAt===null?null:approvalAt+YEAR;
 return{approvalAt,expiresAt:expires,exceptionUntil:until,dueAt:expires===null?null:Math.max(expires,until||0),reviewReason:approval?'':'Documented approval date missing or ambiguous. Effective, creation, import and modification dates are not approval evidence.'};
}
