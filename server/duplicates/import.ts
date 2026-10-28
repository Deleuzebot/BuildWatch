import type{Store}from'../accounts/store';
import{DuplicateService}from'./service';
export function importReviewMetadata(store:Store,candidates:any[],classifications:any[],actor='operator:review-import'){
 if(!Array.isArray(candidates)||!Array.isArray(classifications))throw Error('Expected review arrays.');
 return store.tx(()=>{const service=new DuplicateService(store);let added=0,unchanged=0;
  for(const c of candidates){const result=service.register(c.a,c.b,c.reasons,{distanceMetres:c.distanceMetres,discovery:'community-refocus-audit'},actor);if(result.unchanged)unchanged++;else added++;}
  service.regroup();
  for(const c of classifications){if(!store.originalProject(c.id))throw Error('Unknown classification candidate '+c.id);store.run('INSERT OR IGNORE INTO classification_review_candidates VALUES(?,?,?,?,?)',c.id,c.reason,c.hash,c.revision,Date.now());}
  return{addedOrRefreshed:added,unchanged,...service.stats(),publicRecords:store.one('SELECT count(*) AS n FROM map_index').n};
 });
}
