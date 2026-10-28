import type { Project } from '../data/projects';
export type MapCluster = {
  id: string;
  latitude: number;
  longitude: number;
  projects: Project[];
};
/** Screen-space grouping keeps statewide maps small; every record remains searchable. */
export function clusterProjects(projects: Project[], zoom: number, cellSize = 64): MapCluster[] {
  if (zoom >= 17 || projects.length < 60)
    return projects.map(p => ({ id: p.id, latitude: p.latitude, longitude: p.longitude, projects: [p] }));
  const scale = 256 * 2 ** zoom;
  const groups = new Map<string, MapCluster>();
  for (const p of projects) {
    const lat = Math.max(-85, Math.min(85, p.latitude)) * Math.PI / 180;
    const x = (p.longitude + 180) / 360 * scale;
    const y = (1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2 * scale;
    const id = `cluster-${Math.floor(zoom)}-${Math.floor(x / cellSize)}-${Math.floor(y / cellSize)}`;
    const group = groups.get(id);
    if (group) {
      group.projects.push(p);
      group.latitude += p.latitude;
      group.longitude += p.longitude;
    } else groups.set(id, { id, latitude: p.latitude, longitude: p.longitude, projects: [p] });
  }
  return [...groups.values()].map(g => ({ ...g, latitude: g.latitude / g.projects.length, longitude: g.longitude / g.projects.length }));
}
