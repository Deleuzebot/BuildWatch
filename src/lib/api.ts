import { api } from "../account/http";
import type { Project } from "../data/projects";
import {backendFetch} from './transport';
let cachedProjects: Project[] | undefined;
let cachedETag: string | null = null;
export async function loadProjects(): Promise<Project[]> {
  const response = await backendFetch('/api/projects', {
    headers: cachedETag ? { "If-None-Match": cachedETag } : undefined,
    signal: AbortSignal.timeout(30000),
  });
  if (response.status === 304 && cachedProjects) return cachedProjects;
  if (!response.ok) throw new Error("Shared map is unavailable. Please retry.");
  cachedProjects = await response.json();
  cachedETag = response.headers.get("ETag");
  return cachedProjects!;
}
export async function saveProject(project: Project): Promise<Project> {
  return api(`/api/projects/${encodeURIComponent(project.id)}`, "PUT", project);
}
