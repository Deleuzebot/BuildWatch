/** Catalog revisions include an expiration boundary without requiring a timer job. */
export function olderMapVersion(candidate:string,current:string){
 const[a,at=0]=candidate.split(':').map(Number),[b,bt=0]=current.split(':').map(Number);
 return Number.isFinite(a)&&Number.isFinite(b)&&(a<b||(a===b&&at<bt));
}
