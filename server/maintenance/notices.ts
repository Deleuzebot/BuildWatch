import type {Source} from './policy';
const decode=(v:string)=>v.replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&nbsp;/gi,' ');
/** Index official document links only. This does not assert any project or meeting facts. */
export function noticeLinks(source:Source,html:string){
 const origin=new URL(source.url).origin,allowed=new RegExp(source.config.noticePathPattern),seen=new Set<string>(),links:{title:string;url:string}[]=[];
 for(const match of html.matchAll(/<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi)){
  let url:URL;try{url=new URL(decode(match[2]),source.url);}catch{continue;}
  const title=decode(match[3].replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
  if(url.protocol!=='https:'||url.origin!==origin||url.username||url.password||!allowed.test(decodeURIComponent(url.pathname)+url.search)||!title||seen.has(url.href))continue;
  seen.add(url.href);links.push({title:title.slice(0,500),url:url.href});if(links.length>=Math.min(20,source.config.noticeLimit||20))break;
 }
 return links;
}
