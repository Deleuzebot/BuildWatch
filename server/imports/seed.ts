import type { Store } from '../accounts/store';
const marker='statewide_catalog_2026_10_25';
/** Existing installations never import the large JSON module on the startup path. */
export async function ensureStatewideSeed(store:Store,file:string){
  if(store.one('SELECT value FROM meta WHERE key=?',marker))return;
  // Existing imported or archived records are respected. Explicit operator imports handle future data batches.
  if(!store.one("SELECT id FROM projects WHERE id GLOB 'nc-permit-*' LIMIT 1")){
    const {importStatewide}=await import('./statewide');
    importStatewide(store,file);
  }
  store.run('INSERT OR IGNORE INTO meta VALUES(?,?)',marker,'1');
}
