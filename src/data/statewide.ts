import type { Project } from './projects';
import { northCarolinaProjects } from './northCarolina';
import municipal from './statewideMunicipal.json';
import counties from './curatedCounties.json';

// Keep the large permit register on the shared server rather than in iPhone bundles.
export const mapProjects: Project[] = [
  ...northCarolinaProjects.map(p => ({ ...p, county: counties[p.id as keyof typeof counties] })),
  ...(municipal as Project[]),
];
