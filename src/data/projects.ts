export const statuses = [
  "Proposed",
  "In review",
  "Approved",
  "Under construction",
  "Completed",
  "Cancelled",
  "On hold",
] as const;
export type Status = (typeof statuses)[number];
export type Meeting = {
  originalMeetings?:{projectId:string;meetingId:string;startsAt?:string}[];
  id: string;
  title: string;
  startsAt: string;
  venue: string;
  agenda: string;
};
export type Project = {
  relatedRecordIds?:string[];
  city?: string;
  county?: string;
  jurisdiction?: string;
  evidenceType?: "municipal" | "permit";
  sourceAsOf?: string;
  sourceStatus?: string;
  sourceStatusDate?: string;
  verificationNote?: string;
  permitNumbers?: string[];
  state?: string;
  reviewedAt?: string;
  archived?: boolean;
  id: string;
  revision?: number;
  sources?: { title: string; url: string }[];
  name: string;
  address: string;
  neighborhood: string;
  status: Status;
  category: string;
  primaryCategory?: import('../lib/categories').PrimaryCategory | null;
  secondaryCategories?: import('../lib/categories').PrimaryCategory[];
  subtype?: string | null;
  originalCategory?: string;
  originalMunicipalCategory?: string | null;
  classification?: {version:number;status:string;reason:string;input?:string;inputFingerprint?:string};
  latitude: number;
  longitude: number;
  description: string;
  developer: string;
  homes: number;
  completion: string;
  meetings: Meeting[];
};
export const statusColors: Record<Status, string> = {
  Proposed: "#7555A3",
  "In review": "#AE6B16",
  Approved: "#2466A5",
  "Under construction": "#B84932",
  Completed: "#23725B",
  Cancelled: "#6A7076",
  "On hold": "#607D8B",
};
function future(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(18, 30, 0, 0);
  return date.toISOString();
}
export const projects: Project[] = [
  {
    id: "river",
    name: "Riverline Commons",
    address: "120 River Street",
    neighborhood: "Waterfront",
    status: "In review",
    category: "Mixed use",
    latitude: 42.363,
    longitude: -71.052,
    description:
      "A former warehouse block reimagined with mixed-income homes, small storefronts, and a continuous public river walk. The proposal includes a shaded plaza and flood-resilient landscaping.",
    developer: "Riverline Community Partners",
    homes: 184,
    completion: "2029",
    meetings: [
      {
        id: "river-hearing",
        title: "Riverfront design hearing",
        startsAt: future(7),
        venue: "Harbor Community Hall · Room 2",
        agenda:
          "Review building heights, affordable housing, and access to the waterfront.",
      },
    ],
  },
  {
    id: "garden",
    name: "Garden Street Homes",
    address: "48 Garden Street",
    neighborhood: "West End",
    status: "Approved",
    category: "Housing",
    latitude: 42.365,
    longitude: -71.067,
    description:
      "An all-electric residential building with family-sized apartments, a shared courtyard, and ground-floor childcare. Forty homes are reserved for income-qualified residents.",
    developer: "Garden Neighborhood Housing",
    homes: 96,
    completion: "2028",
    meetings: [
      {
        id: "garden-update",
        title: "Construction kickoff briefing",
        startsAt: future(12),
        venue: "West End Library · Assembly room",
        agenda:
          "Meet the site team and discuss work hours, truck routes, and pedestrian access.",
      },
    ],
  },
  {
    id: "market",
    name: "Market Yard",
    address: "310 Market Lane",
    neighborhood: "Downtown",
    status: "Under construction",
    category: "Mixed use",
    latitude: 42.355,
    longitude: -71.059,
    description:
      "A new neighborhood market and apartments on a former surface parking lot. Wider sidewalks, protected bicycle parking, and new street trees connect the block to downtown.",
    developer: "Market Yard Cooperative",
    homes: 72,
    completion: "2027",
    meetings: [
      {
        id: "market-update",
        title: "Neighborhood site update",
        startsAt: future(3),
        venue: "Downtown Civic Center",
        agenda:
          "Discuss progress, temporary sidewalk changes, and upcoming utility work.",
      },
    ],
  },
  {
    id: "canopy",
    name: "Canopy Learning Center",
    address: "85 Canal Avenue",
    neighborhood: "North Quarter",
    status: "Proposed",
    category: "Civic",
    latitude: 42.369,
    longitude: -71.058,
    description:
      "A public learning center with a lending library, maker studios, and a green roof. Early concepts include flexible classrooms and free after-school programs.",
    developer: "North Quarter Civic Trust",
    homes: 0,
    completion: "2030",
    meetings: [
      {
        id: "canopy-workshop",
        title: "Community vision workshop",
        startsAt: future(18),
        venue: "North Quarter School · Gymnasium",
        agenda:
          "Help shape the library, workshops, outdoor space, and accessibility priorities.",
      },
    ],
  },
  {
    id: "green",
    name: "Foundry Green",
    address: "16 Foundry Way",
    neighborhood: "East Wharf",
    status: "Completed",
    category: "Public space",
    latitude: 42.358,
    longitude: -71.045,
    description:
      "A former industrial parcel transformed into a public park with rain gardens, accessible play equipment, and a small performance lawn. The park is open daily.",
    developer: "East Wharf Parks Alliance",
    homes: 0,
    completion: "Open now",
    meetings: [],
  },
];
