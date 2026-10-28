/** Exact official application identity. Numeric suffixes and project names are not identities. */
export function caryApplicationId(value:string):string|undefined{
 try{const url=new URL(value);if(url.origin!=='https://data.townofcary.org'||url.pathname!=='/api/explore/v2.1/catalog/datasets/developments/records')return;
 const match=(url.searchParams.get('where')||'').match(/^\s*applicationnumber\s*=\s*(['"])([^'"]+)\1\s*$/i);return match?.[2];
 }catch{return;}
}
