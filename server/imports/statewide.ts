import { Store } from '../accounts/store';
import { statewideCatalog } from './catalog';
import { validateProject } from '../../src/lib/validate';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function importStatewide(store: Store, databaseFile: string) {
  const ids = new Set<string>();
  const additions = [], enrichments = [];
  for (const p of statewideCatalog) {
    const error = validateProject(p);
    if (error || ids.has(p.id)) throw new Error(`${p.id}: ${error || 'Duplicate ID'}`);
    ids.add(p.id);
    if(store.one('SELECT 1 FROM deleted_project_ids WHERE project_id=?',p.id))continue;
    const existing = store.project(p.id);
    if (!existing) additions.push(p);
    else if (!existing.county && p.county && existing.latitude === p.latitude && existing.longitude === p.longitude)
      enrichments.push({ ...existing, county: p.county });
  }
  if (!additions.length && !enrichments.length) return { added: 0, countyMetadataAdded: 0, published: store.list().length };
  const folder = resolve(dirname(databaseFile), 'backups');
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  const backup = resolve(folder, `before-statewide-${Date.now()}.sqlite`);
  store.db.exec(`VACUUM INTO '${backup.replaceAll("'", "''")}'`);
  for (const p of [...additions, ...enrichments]) store.publish(p, 'operator:nc-statewide');
  return { added: additions.length, countyMetadataAdded: enrichments.length, published: store.list().length, backup };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (existsSync('.env.server')) process.loadEnvFile('.env.server');
  const file = process.env.DATA_FILE || 'server/data/projects.json';
  const store = new Store(file + '.sqlite', file);
  try { console.log(JSON.stringify(importStatewide(store, file + '.sqlite'))); }
  finally { store.close(); }
}
