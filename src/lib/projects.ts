import { Project, Status } from "../data/projects";
export function filterProjects(
  projects: Project[],
  query: string,
  status: Status | "All",
  city = "All cities",
  category = "All categories",
): Project[] {
  const term = query.trim().toLowerCase();
  return projects.filter(
    (p) =>
      !p.archived && !["Completed","Cancelled"].includes(p.status) &&
      (city === "All cities" || p.city === city) &&
      (category === "All categories" || p.category === category || p.secondaryCategories?.includes(category as any)) &&
      (status === "All" || p.status === status) &&
      [p.name, p.address, p.neighborhood, p.category, ...(p.secondaryCategories||[]),p.subtype||'', p.city || "", p.county || "", p.county ? `${p.county} County` : "", p.jurisdiction || "", p.permitNumbers?.join(" ") || "", p.state || ""].some((value) =>
        value.toLowerCase().includes(term),
      ),
  );
}
export function upcomingMeetings(projects: Project[], now = Date.now()) {
  return projects
    .flatMap((project) =>
      project.meetings.map((meeting) => ({ ...meeting, project })),
    )
    .filter((m) => Date.parse(m.startsAt) >= now)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}
export function meetingTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).format(new Date(value));
}
