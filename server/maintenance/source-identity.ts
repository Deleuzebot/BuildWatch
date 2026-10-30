/** Exact source-scoped identity only; never collapse neighboring layers or multi-ID queries. */
export function arcgisReferenceId(base:string,url:string,idField='OBJECTID'){
 try{const root=new URL(base),u=new URL(url);if(u.origin!==root.origin||u.pathname.replace(/\/query$/i,'').toLowerCase()!==root.pathname.toLowerCase())return null;
  const objectIds=u.searchParams.get('objectIds');if(objectIds&&/^\d+$/.test(objectIds))return objectIds;
  const predicate=u.searchParams.get('where')||'',escaped=idField.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),m=predicate.match(new RegExp('^\\s*'+escaped+'\\s*=\\s*([\x27]?)(\\d+)\\1\\s*$','i'));return m?.[2]||null;
 }catch{return null;}
}
