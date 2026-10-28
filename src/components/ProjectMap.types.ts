import type { Project } from "../data/projects";
import type { Bounds, MapNode, Viewport } from '../lib/mapTypes';
export type ProjectMapProps = {
  projects: Project[];
  onSelect: (project: Project) => void;
  resetKey: number;
  showControls?: boolean;
  selectedProjectId?: string | null;
  onBackgroundPress?: () => void;
  onPlace?: (latitude: number, longitude: number) => void;
  nodes?: MapNode[];
  onViewport?: (viewport: Viewport) => void;
  onSelectId?: (id: string) => void;
  onCluster?: (node: MapNode) => void;
  focusBounds?: Bounds | null;
};
export const center = {
  latitude: 35.5,
  longitude: -79.8,
  latitudeDelta: 4,
  longitudeDelta: 8,
};
