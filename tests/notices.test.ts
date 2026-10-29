import test from 'node:test';import assert from 'node:assert/strict';import {noticeLinks} from '../server/maintenance/notices';
test('official notice indexes retain same-origin document links, deduplicate and never infer meeting facts',()=>{
 const source:any={url:'https://www.burlingtonnc.gov/Archive.aspx?AMID=46',config:{noticePathPattern:'^/Archive\\.aspx\\?ADID=\\d+'}};
 const links=noticeLinks(source,'<a href="/Archive.aspx?ADID=123&amp;packet=true">October <b>meeting packet</b></a><a href="/Archive.aspx?ADID=123&amp;packet=true">duplicate</a><a href="https://evil.example/Archive.aspx?ADID=2">external</a><a href="javascript:alert(1)">bad</a>');assert.deepEqual(links,[{title:'October meeting packet',url:'https://www.burlingtonnc.gov/Archive.aspx?ADID=123&packet=true'}]);assert.equal((links[0] as any).startsAt,undefined);
});
