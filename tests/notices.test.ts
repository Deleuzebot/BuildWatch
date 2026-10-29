import test from 'node:test';import assert from 'node:assert/strict';import {noticeLinks} from '../server/maintenance/notices';
test('decision minutes are discoverable only with an explicit adapter opt-in',()=>{
 const s:any={url:'https://government.example/planning',config:{noticeDiscovery:true,noticePathPattern:'^/'}};
 const html='<a href="/DocumentCenter/View/8/Planning-Minutes">Planning Minutes</a>';
 assert.equal(noticeLinks(s,html).length,0);
 const links=noticeLinks({...s,config:{...s.config,includeDecisionMinutes:true}},html);
 assert.equal(links.length,1);assert.equal((links[0] as any).decision,undefined);
});
test('official notice indexes retain same-origin document links, deduplicate and never infer meeting facts',()=>{
 const source:any={url:'https://www.burlingtonnc.gov/Archive.aspx?AMID=46',config:{noticePathPattern:'^/Archive\\.aspx\\?ADID=\\d+'}};
 const links=noticeLinks(source,'<a href="/Archive.aspx?ADID=123&amp;packet=true">October <b>meeting packet</b></a><a href="/Archive.aspx?ADID=123&amp;packet=true">duplicate</a><a href="https://evil.example/Archive.aspx?ADID=2">external</a><a href="javascript:alert(1)">bad</a>');assert.deepEqual(links,[{title:'October meeting packet',url:'https://www.burlingtonnc.gov/Archive.aspx?ADID=123&packet=true'}]);assert.equal((links[0] as any).startsAt,undefined);
});
test('dynamic document adapter excludes navigation, forms, cancelled meetings and external documents',()=>{
 const s:any={url:'https://government.example/planning',config:{noticeDiscovery:true,noticePathPattern:'^/',noticeLimit:20}};
 const links=noticeLinks(s,'<a href="#main">Skip to main content</a><a href="/DocumentCenter/View/1/Rezoning-Applicationpdf">Rezoning Application.pdf</a><a href="/DocumentCenter/View/2/Agenda">Planning agenda</a><a href="/DocumentCenter/View/3/Agenda">Cancelled meeting</a><a href="https://elsewhere.example/agenda.pdf">Planning agenda</a>');assert.deepEqual(links,[{title:'Planning agenda',url:'https://government.example/DocumentCenter/View/2/Agenda'}]);
 assert.deepEqual(noticeLinks(s,'<a href="/DocumentCenter/View/4/Planning-Board-Schedule">2026 Meeting Schedule</a><a href="/DocumentCenter/View/5/Planning-Board-Bylaws">Planning Board Bylaws</a>'),[]);
});
