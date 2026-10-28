import type { Project, Status } from '../data/projects';
export type Bounds = { west: number; south: number; east: number; north: number };
export type Viewport = Bounds & { zoom: number };
export type ProjectSummary = Pick<Project, 'id' | 'name' | 'address' | 'neighborhood' | 'category' | 'primaryCategory' | 'subtype' | 'status' | 'latitude' | 'longitude' | 'homes' | 'city' | 'county' | 'state' | 'evidenceType' | 'sourceAsOf'>;
export type MapNode = { id: string; count: number; latitude: number; longitude: number; state: string | null; bounds: Bounds; projectId?: string; name?: string; status?: Status };
export type MapResult = { version: string; total: number; nodes: MapNode[]; bounds: Bounds; zoom: number; effectiveZoom: number };
export type BrowseResult = { version: string; total: number; items: ProjectSummary[]; nextCursor: string | null; bounds: Bounds | null };
export type MeetingResult = { version: string; total: number; items: (Project['meetings'][number] & { project: ProjectSummary })[]; nextCursor: string | null };
export type CatalogInfo = { version: string; total: number; bounds: Bounds | null };
