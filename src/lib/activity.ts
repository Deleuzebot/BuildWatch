export const activityPeriods=[{value:'30d',label:'Past 30 days'},{value:'3m',label:'Past 3 months'},{value:'1y',label:'Past 1 year'},{value:'5y',label:'Past 5 years'}] as const;
export type ActivityPeriod=typeof activityPeriods[number]['value']|`${number}d`;
export type ActivityEvent={id:string;projectId:string;type:string;date:string;description:string;sourceUrl:string|null;recordedAt:number};
export type ActivityPage={items:ActivityEvent[];total:number;nextCursor:string|null};
/** Inclusive UTC calendar-day bounds for date-only evidence; calendar months/years clamp month-end. */
export function activitySince(period:ActivityPeriod,now=Date.now()){
 const d=new Date(now),year=d.getUTCFullYear(),month=d.getUTCMonth(),day=d.getUTCDate();
 if(/^\d+d$/.test(period))return Date.UTC(year,month,day-Number(period.slice(0,-1)));
 const months=period==='3m'?3:period==='1y'?12:period==='5y'?60:NaN;if(!Number.isFinite(months))throw Error('Invalid activity period.');
 const first=new Date(Date.UTC(year,month-months,1)),last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
 return Date.UTC(first.getUTCFullYear(),first.getUTCMonth(),Math.min(day,last));
}
export function activityDays(period:ActivityPeriod,now=Date.now()){const d=new Date(now);return Math.round((Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())-activitySince(period,now))/86400000);}
export function validActivityPeriod(value:string,now=Date.now()):value is ActivityPeriod{return activityPeriods.some(p=>p.value===value)||(/^\d+d$/.test(value)&&Number(value.slice(0,-1))>=30&&Number(value.slice(0,-1))<activityDays('5y',now));}
/** Piecewise continuous scale gives useful space to recent days while retaining calendar reference marks. */
export function activityFromPosition(position:number,now=Date.now()):ActivityPeriod{
 const p=Math.max(0,Math.min(1,position))*3,marks=activityPeriods.map(v=>activityDays(v.value,now));if(p>=3)return '5y';
 const i=Math.min(2,Math.floor(p)),days=Math.round(marks[i]+(marks[i+1]-marks[i])*(p-i));
 const mark=marks.indexOf(days);return mark>=0?activityPeriods[mark].value:`${days}d`;
}
export function activityPosition(period:ActivityPeriod|null,now=Date.now()){
 if(!period||period==='5y')return 1;const days=activityDays(period,now),marks=activityPeriods.map(p=>activityDays(p.value,now));
 for(let i=0;i<3;i++)if(days<=marks[i+1])return Math.max(0,(i+(days-marks[i])/(marks[i+1]-marks[i]))/3);return 1;
}
export function activityLabel(period:ActivityPeriod|null){return !period?'Disabled':period==='5y'?'All current projects':activityPeriods.find(p=>p.value===period)?.label||`Past ${period.slice(0,-1)} days`;}
