import type { Project } from '../../src/data/projects';
import { mapProjects } from '../../src/data/statewide';
import permits from './data/ncConstructionPermits.json';
export const statewideCatalog: Project[] = [...mapProjects, ...(permits as Project[])];
