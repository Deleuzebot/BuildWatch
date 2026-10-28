import { Project, statuses } from "../data/projects";
export function validateProject(value: unknown): string | null {
  if (!value || typeof value !== "object") return "Project data is required.";
  const p = value as Project;
  for (const key of ["city", "county", "jurisdiction", "state", "reviewedAt", "sourceAsOf", "sourceStatusDate"] as const) {
    if (p[key] !== undefined && (typeof p[key] !== "string" || p[key]!.length > 100))
      return `${key} must be text of at most 100 characters.`;
  }
  if (p.evidenceType !== undefined && !["municipal", "permit"].includes(p.evidenceType))
    return "Choose a valid evidence type.";
  for (const key of ["sourceStatus", "verificationNote"] as const) {
    if (p[key] !== undefined && (typeof p[key] !== "string" || p[key]!.length > 2000))
      return `${key} must be text of at most 2000 characters.`;
  }
  if (p.permitNumbers !== undefined && (!Array.isArray(p.permitNumbers) || p.permitNumbers.length > 500 || p.permitNumbers.some(n => typeof n !== "string" || n.length > 100)))
    return "Permit references must be a list of at most 500 short identifiers.";
  if (p.archived !== undefined && typeof p.archived !== "boolean")
    return "Archived must be true or false.";
  for (const key of [
    "name",
    "address",
    "neighborhood",
    "category",
    "description",
    "developer",
    "completion",
  ] as const) {
    if (typeof p[key] !== "string" || !p[key].trim())
      return `${key} is required.`;
    if (p[key].length > 8000) return `${key} is too long.`;
  }
  if (!statuses.includes(p.status)) return "Choose a valid status.";
  if (
    !Number.isFinite(p.latitude) ||
    Math.abs(p.latitude) > 90 ||
    !Number.isFinite(p.longitude) ||
    Math.abs(p.longitude) > 180
  )
    return "Enter valid latitude (-90 to 90) and longitude (-180 to 180).";
  if (!Number.isSafeInteger(p.homes) || p.homes < 0)
    return "Homes must be a nonnegative whole number.";
  if (!Array.isArray(p.meetings) || p.meetings.length > 50)
    return "Use at most 50 meetings.";
  for (const m of p.meetings) {
    if (
      !m ||
      typeof m.id !== "string" ||
      !m.id ||
      ["title", "venue", "agenda"].some(
        (k) =>
          typeof m[k as "title" | "venue" | "agenda"] !== "string" ||
          !m[k as "title" | "venue" | "agenda"].trim() ||
          m[k as "title" | "venue" | "agenda"].length > 8000,
      ) ||
      typeof m.startsAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$/.test(m.startsAt) ||
      !Number.isFinite(Date.parse(m.startsAt))
    )
      return "Each meeting needs a title, venue, agenda and ISO date with timezone (for example 2026-11-10T18:30:00-05:00).";
  }
  if (new Set(p.meetings.map((m) => m.id)).size !== p.meetings.length)
    return "Meeting IDs must be unique.";
  if (p.sources !== undefined) {
    if (!Array.isArray(p.sources) || p.sources.length > 30)
      return "Use at most 30 source links.";
    for (const source of p.sources) {
      if (
        !source ||
        typeof source.title !== "string" ||
        !source.title.trim() ||
        source.title.length > 200 ||
        typeof source.url !== "string" ||
        source.url.length > 2048
      )
        return "Each source needs a title and URL.";
      try {
        const url = new URL(source.url);
        if (url.protocol !== "https:") return "Source links must use HTTPS.";
      } catch {
        return "Enter a valid source URL.";
      }
    }
  }
  return null;
}
