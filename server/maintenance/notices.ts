import type {Source} from './policy';
import {officialResources} from './source-discovery';
const decode=(v:string)=>v.replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&nbsp;/gi,' ');
/** Index official document links only. This does not assert any project or meeting facts. */
export function noticeLinks(source:Source,html:string){
 const origin=new URL(source.url).origin,allowed=new RegExp(source.config.noticePathPattern),seen=new Set<string>(),links:{title:string;url:string}[]=[];
 if(source.config.noticeDiscovery===true)return officialResources(source.url,html).filter(r=>r.kind==='document'&&new URL(r.url).origin===origin&&allowed.test(new URL(r.url).pathname+new URL(r.url).search)&&!/minutes|cancelled|canceled|member|calendar|rules.of.procedure|bylaws|meeting.schedule|submittal.deadline|zoning.ordinance|application.form/i.test(r.title+' '+r.url)).slice(0,Math.min(20,source.config.noticeLimit||20)).map(r=>({title:r.title||'Official document',url:r.url}));
 for(const match of html.matchAll(/<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi)){
  let url:URL;try{url=new URL(decode(match[2]),source.url);}catch{continue;}
  const title=decode(match[3].replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
  let path:string;try{path=decodeURIComponent(url.pathname)+url.search;}catch{continue;}
  if(url.protocol!=='https:'||url.origin!==origin||url.username||url.password||!allowed.test(path)||source.config.noticeExcludePattern&&new RegExp(source.config.noticeExcludePattern,'i').test(path+' '+title)||!title||seen.has(url.href))continue;
  seen.add(url.href);links.push({title:title.slice(0,500),url:url.href});if(links.length>=Math.min(20,source.config.noticeLimit||20))break;
 }
 return links;
}
