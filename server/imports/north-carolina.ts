import { Store } from '../accounts/store';
import { northCarolinaProjects } from '../../src/data/northCarolina';
import { projects as demos } from '../../src/data/projects';
import { validateProject } from '../../src/lib/validate';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
if (existsSync('.env.server')) process.loadEnvFile('.env.server');
const file = process.env.DATA_FILE || 'server/data/projects.json';
// Validate the entire batch before opening or mutating a database.
for (const project of northCarolinaProjects) {
  const error = validateProject(project);
  if (error) throw new Error(project.id + ': ' + error);
}
const store = new Store(file + '.sqlite', file);
try {
  mkdirSync('server/data/backups', {recursive: true, mode: 0o700});
  const backup = resolve('server/data/backups/before-north-carolina-' + Date.now() + '.sqlite');
  store.db.exec(`VACUUM INTO '${backup.replaceAll("'", "''")}'`);
  const actor = 'operator:nc-curation';
  for (const project of northCarolinaProjects) {
    if (!store.project(project.id)) store.publish(project, actor);
  }
  for (const demo of demos) {
    const existing = store.project(demo.id);
    // Never archive a user-repurposed sample entry.
    if (existing && existing.name === demo.name && existing.address === demo.address && !existing.archived)
      store.publish({...existing, archived: true}, actor);
  }
  console.log('North Carolina starter coverage imported; fictional examples archived. Backup:', backup);
} finally { store.close(); }
