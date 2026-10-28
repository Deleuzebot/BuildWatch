# BuildWatch map, meetings and usability audit

**Update — approved styling implemented October 25, 2026:** The user approved state colors and subtle state boundaries after the audit below. Both platforms now use the fixed state palette for clusters, gray for mixed/unknown states, unchanged status colors for individual pins, a compact Map key, and deduplicated Census 2025 1:20m outlines that fade out by zoom 12. Outlines load once per app session through a compressed public endpoint (225 paths, 9,486 unique segments; 231 KB decoded / 80 KB gzip in addition to the small project feed). All 35 tests, TypeScript and web/iOS exports pass. Larger layout and meeting-ingestion proposals remain unimplemented. The remainder of this report records the original audit and proposal.

October 25, 2026. Implemented incrementally in the existing Expo application. **All 11,940 public project records remain intact.** Leaflet/OpenStreetMap on web and react-native-maps/Apple Maps on iPhone remain in place. State colors, state outlines, a new legend and major layout changes have **not** been activated.

## 1. What already worked

The app already stored projects and private account data in SQLite, enforced editing permissions on the server, virtualized the public project cards, grouped nearby points with a 64-pixel grid, and expanded clusters on zoom. The public snapshot already supported gzip, ETags and revalidation. Authentication, MFA, follows, subscription entitlements, correction moderation, project history and the existing data editor were reused. No map-library replacement or new package dependency was necessary.

However, the old clustering ran on the device after downloading every full project. Virtualizing cards did not limit downloaded data or clustering input. There was no viewport-based project API.

## 2. Initial loading delay

The old public snapshot was **23,972,729 bytes decoded JSON / 1,281,747 bytes gzip**, containing every full description, source and meeting. The browser also bundled a 1,324-record starter inventory. SQLite rows were parsed into full objects, serialized and compressed on snapshot generation; the client parsed the response, searched and clustered the full array. Local isolated measurements: server parse 40.9 ms, serialize 41.4 ms, gzip 128.6 ms; warm local HTTP transfer/decode/parse totaled 149.2 ms, including 39.3 ms JSON parsing. These overlapping measurements must not be added together as a browser-load estimate.

Server startup also imported the large statewide JSON catalog even on an already populated installation. The reminder scheduler decoded every project once a minute. Static JavaScript was served without compression. Tile/network latency, JavaScript execution, and device performance also affect what a person sees; there is no before/after physical-phone or production first-paint measurement.

## 3. Implemented changes

- Added rebuildable SQLite metadata, RTree point, FTS5 trigram search and meeting-date indexes. Existing project JSON, revisions and private account tables are untouched. Supported Store writes maintain derived indexes and their version transactionally. Public map requests use a consistent read snapshot, including their cache version.
- Added public `/api/catalog`, `/api/map?bbox=west,south,east,north&zoom=…`, `/api/browse`, `/api/meetings` and `/api/public/projects/:id` routes. Optional search/status/state filters use the same predicates for counts and records. Invalid coordinates and unbounded page sizes are rejected.
- Map responses contain at most **512 nodes**, coarsening the grid when necessary rather than truncating projects. Cluster counts sum to the exact filtered viewport count. Small/high-zoom results return individual points. Dense coincident points remain selectable through a paginated location picker.
- The client fetches 50 lightweight cards per page, at most 100 meetings per page, and full details only when selected. It no longer imports the 1,324-record bootstrap or downloads the full public snapshot on startup.
- Viewport requests wait until movement ends, debounce for 200 ms, and reuse a 20% geographic margin on each side. Search waits 250 ms. Obsolete requests are aborted or ignored. A small client LRU, version-keyed server LRU, gzip and ETags avoid repeated transfers. Catalog polling checks a small version response every 15 seconds.
- Leaflet now reconciles existing markers instead of clearing and recreating all markers on every render. Native receives the same bounded node feed. Existing cluster dimensions, green cluster styling and individual status colors remain. Cluster clicks also guarantee a closer zoom when fitting bounds in a short map would otherwise stall.
- Requests covering the whole inventory bypass unnecessary RTree candidate materialization. Exact coordinate comparisons correct the RTree's outward floating-point rounding. Antimeridian queries and tiny coordinate bounds are tested. See [SQLite RTree documentation](https://www.sqlite.org/rtree.html).
- The reminder worker now queries only indexed meetings due within 24 hours. It retains existing notification preferences, entitlement limits and deduplication.
- Existing Edit Map search/list controls now fetch 50 full editor records per page. Project Management retrieves edited IDs directly rather than parsing the entire inventory. Existing editor, pins, revision checks and authorization are preserved.
- Existing installations skip the large seed-module import. Fresh installations still receive the seed; future data batches use the explicit import workflow. Static assets now support gzip, ETags and immutable caching for hashed bundles.
- The legacy whole-catalog public/editor endpoint still works for today's inventory, but refuses catalogs above 20,000 public records rather than allocating an unlimited snapshot. Updated clients use the bounded routes. Older app versions must be updated before that threshold.

**Current measured initial public data:** 25,310 decoded bytes / 5,692 gzip bytes for catalog, first 50 cards, first meeting page and a statewide map response containing 37 nodes representing all 11,940 records. This is about **99.9% less decoded project data** than the old snapshot. Actual viewport size changes node counts/payload. Basemap tiles and app code are separate: the current entry bundle is approximately 814 KB decoded / 233 KB gzip; Leaflet loads separately. Measurements and request timings are in [reports/optimized.json](reports/optimized.json). This is a payload/query improvement, not a claim of a 99.9% reduction in total perceived load time.

## 4. Measured scalability and readiness

Local Node v24.22.1, macOS arm64, SQLite; deterministic synthetic points distributed across the contiguous US. Three sequential samples per map query; table shows **median query milliseconds**, without network, tile loading or rendering. Synthetic state labels are test labels, not real geographic assignments. All data stayed in isolated benchmark databases and was never published.

| Records | National clusters | Regional viewport | Local viewport | National status filter | Selective national search | First 50 cards |
|---:|---:|---:|---:|---:|---:|---:|
| 100,000 | 65.0 | 4.8 | 0.21 | 19.3 | 0.87 | 1.13 |
| 500,000 | 397.2 | 24.8 | 0.35 | 123.0 | 0.80 | 3.56 |
| 1,000,000 | 1,058.2 | 81.6 | 1.30 | 264.2 | 2.53 | 7.04 |

At one million records the national response contained **84 nodes, 16,624 JSON bytes, with exactly 1,000,000 represented records**. The regional response represented 29,237 records in 120 nodes; the local response represented 66 records. The synthetic database occupied about 1.06 GB, including fixture records and derived indexes. Fixture descriptions are shorter than the real catalog, and the fixtures contain no meetings; this disk figure is not a production storage forecast. See [raw results](reports/synthetic-benchmark.json) and [benchmark script](scripts/benchmark-map.ts).

**Ready for controlled expansion beyond North Carolina:** yes, provided new data has valid coordinates, stable identifiers, state metadata, official sources and explicit coverage limits. State-based metadata is already returned by clusters, without activating visual colors. Source quality and meeting coverage remain the larger product gaps.

**One million records:** the implemented query path has actually been exercised at that size and avoids downloading/rendering a million records. This is not a tested million-record national production service. The uncached national query takes roughly 1.0–1.1 seconds and blocks the current synchronous SQLite server while it runs. Short one/two-character searches cannot benefit from trigram indexing; common searches can touch many rows. The cache helps repeat views but does not solve cold-query concurrency. No multi-user load, handset frame rate, peak-memory, APNs throughput or million-meeting ingestion benchmark was run.

Before a national high-traffic release, add precomputed/coarse cluster tiles by state/status, query workers or an equivalent isolated read service, concurrency/load and dense-city tests, cache hit metrics, memory/disk budgets, backup/restore drills and ingestion monitoring. PostGIS or vector tiles are options when measured traffic warrants them, not mandatory replacements now. Deep meeting OFFSET pages and very large personal-follow/editor-history lists also deserve keyset pagination when usage grows. A deliberate offline cache would be separate work; current nationwide browsing needs the shared API. The map heading and coverage explanation remain NC-specific; generalize those source/coverage labels when adding another state. Native builds need a reachable HTTPS `EXPO_PUBLIC_API_URL` and physical-device validation.

## 5. Data preservation and verification

A private SQLite backup was created before the changes. Before/after row counts and SHA-256 hashes matched for **projects, users, follows, follow_history, history, entitlements, invitations, submissions, notifications, devices and role_audit**. There are 11,945 stored project rows: 11,940 public records plus five previously archived demo projects. No existing record, source, coordinate, status, meeting, follow or account was rewritten by this work. New data structures are derived tables/indexes and migration metadata.

31 automated tests pass. Coverage includes exact edges and dateline queries; lossless and mixed-state clustering; filters; literal Unicode/punctuation search; keyset pagination; on-demand details; publication/move/archive/delete/rollback invalidation; malformed input; bounded public API; ETag revalidation; existing account security/MFA/role revocation; follows, corrections, notification preferences and reminder deduplication. Meeting tests cover multiple entries on one project, past-date exclusion, archived-project exclusion, pagination and project association. Web and iOS/Hermes exports pass. Exports are not signed iOS builds or physical-device tests.

Browser verification covers the real catalog, search, cluster expansion, status filters, project details, meeting navigation and existing menu. Live OAuth/payment/push flows were not retested or reconfigured. No fictional benchmark meeting or project was added to the public map.

## 6. Proposed four-color state system — approval required

The proposal is committed as **unused configuration**, `src/lib/stateColorProposal.ts`; live map components do not import it. [Open the visual proposal](STATE-COLOR-PROPOSAL.html).

| Color | Fixed state assignments |
|---|---|
| Blue `#4477AA` | AL, AK, AR, HI, IA, KS, KY, ME, MA, MI, NV, NM, NC, ND, PA, WA, WY |
| Teal `#228B83` | DE, FL, IL, LA, MN, MT, NE, NH, NY, OK, OR, SC, TN, UT, WV |
| Amber `#D69A32` | AZ, CO, CT, GA, ID, MS, MO, NJ, OH, SD, TX, VT, VA, WI |
| Purple `#8464A8` | CA, IN, MD, RI |
| Neutral gray `#5B676C` | Mixed states, missing/unknown state, DC and territories pending a separate assignment |

A deterministic four-color graph assignment anchors NC blue and passes all **108 shared-edge adjacencies** derived from the [Census 2026 county adjacency file](https://www.census.gov/geographies/reference-files/time-series/geo/county-adjacency.2026.html). Point-only contacts were excluded: Arizona and Colorado share amber at Four Corners. Alaska/Hawaii can reuse blue. The assignments are stable across sessions/devices, not generated per user. Palette values remain configurable.

A cluster is single-state only when every member has that same known state; otherwise it is gray. Filtering recalculates this from the actual matching members. Bubble sizes and numerical count labels stay unchanged. White/black count text is selected for at least 4.5:1 contrast. Single-project markers keep **existing status colors and definitions**. State color disappears naturally when a cluster resolves to individual pins.

Proposed accessible Map key: “Cluster color = state; pin color = development status,” with full names for states currently represented, a mixed/unknown gray swatch, status labels, and accessible cluster descriptions. Color will supplement labels rather than carry the meaning alone. Legend and state-specific accessible labeling remain proposals; they are not active UI features.

## 7. Proposed state boundaries — approval required

Keep the current basemaps. Add a separately cached, generalized state-outline overlay below project markers, using a primary government boundary dataset and lazy loading by zoom/extent. Suggested dark green `#334A40`, approximately 0.8 points, opacity 0.45 at zooms 3–6, fading toward 0.2 at zoom 10 and hidden by zoom 12. No state fill, county outlines, extra labels or basemap replacement. Web/native opacity and stroke need a small device trial. Do not download detailed national boundary geometry on every pan.

**Approval is required before enabling the state cluster colors, new Map key legend or boundary overlay.** The existing visual design remains active.

## 8. Why only one public meeting appears

The root cause is **sparse collection**, not a permissions or pagination defect hiding a larger public inventory.

| Stored category | Entries | Projects | Public upcoming |
|---|---:|---:|---:|
| Current real project — 306 West Franklin, Chapel Hill | 1 | 1 | 1 |
| Archived fictional demo projects: Riverline, Garden Street, Market Yard, Canopy | 4 | 4 | 0 |
| Past meeting entries anywhere in the current database | 0 | 0 | 0 |
| Invalid-date meeting entries | 0 | 0 | 0 |
| Total stored meeting entries | **5** | **5** | **1** |

Audit time: October 25, 2026. All five stored dates were in the future at audit time, but four records are attached to archived fictional projects and correctly excluded. Those dates are not real public-meeting coverage.

The public entry belongs to `nc-ch-306-franklin`, with a stored Council hearing on November 18, 2026 at 6 p.m. Eastern, Council Chambers. The [official Town project page](https://www.chapelhillnc.gov/Projects/306-West-Franklin-Street) currently lists that hearing and links to participation details. Direct automated retrieval returned 403, but the indexed official page exposed the published schedule; confirm the Town agenda before attending. The page also lists earlier meetings that were never imported. Their absence is an ingestion gap, not the upcoming filter deleting history.

**Current working coverage:** one manually researched project schedule in Chapel Hill, geographically Orange County. This does **not** establish Orange County-government meeting coverage. There are no automated working meeting connectors for any municipality or county, and no other non-archived project's meeting array contains an entry. Raleigh, Durham, Greensboro and the rest of the 24-city/52-county project inventory have no structured meeting records in this database. Municipal project GIS snapshots and the NC DEQ construction-stormwater register are project/permit sources, not agenda feeds. Their entries have empty meeting arrays. Some descriptions mention hearings or meeting links, but prose was not parsed into scheduled events.

Meetings are currently embedded as `Project.meetings[]` with ID, title, ISO date/time with offset, venue and agenda. Projects support up to 50 meeting entries with unique IDs; the editor already adds/removes multiple entries. Each event is associated through its containing project, and the new derived meeting index retains that project link. The public query excludes archived projects and uses `startsAt >= now`; it applies the selected search/status filters and pages at up to 100 events. Guest access is allowed. The project detail still holds all original meeting data, while its existing Upcoming section displays future entries only.

An empty array cannot distinguish “officially no meeting scheduled” from “not checked / information unavailable.” The safe copy now says that meeting information has not been collected, rather than implying that no meeting exists. The agenda also distinguishes loading and request failure from an empty result. No dates/times/locations were invented or changed. No major ingestion system was installed.

## 9. Reliable nationwide meeting collection — proposed, not running

Start with a small monitored NC pilot, then expand by **jurisdiction and governing body**, not by population alone. Keep city and county coverage separate because a county includes municipal areas but does not necessarily decide their zoning cases.

Candidate official sources verified in this audit:

| Jurisdiction / body | Official discovery source | Current BuildWatch connector |
|---|---|---|
| Chapel Hill Council / Planning Commission / BOA | [Town Legistar calendar](https://chapelhill.legistar.com/Calendar.aspx) and individual Town project schedules | None; one manual project entry |
| Raleigh Council / planning bodies | [Official agendas portal](https://raleighnc.gov/government/services/city-council-boards-and-commissions-agendas-and-minutes) | None |
| Durham City–County Planning Commission | [Commission page](https://www.durhamnc.gov/1367/Planning-Commission), [Agenda Center](https://www.durhamnc.gov/AgendaCenter) | None |
| Greensboro Planning and Zoning | [Official commission agendas page](https://www.greensboro-nc.gov/departments/planning/boards-commissions-meetings/planning-and-zoning-commission/agendas-minutes-videos), linked eSCRIBE portal | None |
| Orange County Planning Board / Commissioners | [County Agenda Center](https://www.orangecountync.gov/AgendaCenter) | None |
| Durham County Commissioners | [Official agenda/video library](https://dconc.gov/Board-of-Commissioners/Meetings-and-Announcements/BOCC-Agendas-and-Video-Library) | None |
| Guilford County Planning Board | [Official board page](https://www.guilfordcountync.gov/government/departments-and-agencies/planning-and-development/boards-and-commissions/planning-board) | None |

Raleigh has moved Council records from BoardDocs to eSCRIBE and may have body-specific transitions; the registry must track current official links instead of assuming one vendor per city. [Official transition notice](https://raleighnc.gov/government/news/software-change-public-meeting-agendas-and-documents).

Recommended pipeline:

1. Maintain a source registry: jurisdiction/FIPS, body, official home/calendar URLs, vendor/tenant, local IANA timezone, access method, polling policy, coverage window, last successful check, parser version and health. Discover links through official government sites. A functioning calendar is not proof of project-specific coverage.
2. Prefer documented read APIs and published ICS/RSS feeds. [Legistar's official API](https://webapi.legistar.com/Help) provides events, agenda items and attachments; validate tenant access and tokens. Its [examples](https://webapi.legistar.com/Home/Examples) document a 1,000-result limit and paging. For eSCRIBE, CivicClerk, CivicPlus Agenda Center, OnBase and BoardDocs, use documented/licensed feeds where offered, otherwise official public HTML/PDF adapters with appropriate access and throttling. Do not assume an unsupported private API is stable or bypass a block.
3. Queue incremental fetches with conditional requests, per-host rate limits, retry/backoff and response hashing. Daily baseline polling, more frequent checks for published imminent meetings, are a starting policy to tune per source. Preserve raw official documents and extraction evidence/version for review. A failed fetch marks coverage stale; it must never erase previously verified events or declare no meetings.
4. Normalize **meetings separately from agenda items and project links**: provider event ID, body, jurisdiction, source URL, agenda-item URL/page, published/checked times, local timezone and UTC timestamp, venue/remote access, status (scheduled/canceled/rescheduled), document versions and confidence. One meeting may discuss several projects, and one project may have many meetings. Retain immutable provenance and revisions.
5. Link agenda items by official case/application ID and parcel ID first, then address/name plus jurisdiction. Keep predecessor/revised applications separate. Name-only or AI/PDF extraction is a candidate match requiring review, not a published fact. Do not turn a recurring board calendar into a project-specific hearing. Leave unknown dates, venues and times unknown.
6. Stage proposed matches/corrections for administrator review, using existing moderation patterns. Publish only verified facts, retain canceled/past/rescheduled history, and send idempotent notifications only after verified changes. Reconcile changes to reminder times and suppress canceled reminders. Distinguish upcoming, past, officially no scheduled event (as of a recorded check), and unavailable/stale information.
7. Track coverage by body and jurisdiction, freshness, ingestion errors, reviewed matches, duplicate rates and missing agenda links. Test holiday/DST changes, cancellations, amended agendas, PDFs/OCR, unknown venue, provider pagination, multi-project hearings and duplicate IDs. Pilot Chapel Hill plus one other vendor and county before national rollout.

This needs a scheduler/worker, source/document storage, adapters and monitoring. It is separate approved future ingestion work. No external crawler jobs or recurring automation were created. Notifications cannot compensate for data that was never collected.

## 10. Layout / UX recommendations and approval boundary

The existing map already distinguishes green circular count bubbles from colored single-project pins; that is useful and should remain. Search already covers municipalities, counties, names, addresses, categories, jurisdiction and permit numbers. Developer names are **not currently searched**, despite existing detail fields; this is a small future index enhancement. Both the map and virtualized list already coexist; the Meetings tab offers another view. A wholesale redesign would add risk without solving sparse source data.

| Priority | Improvement | Usability benefit | Difficulty / performance | Decision |
|---|---|---|---|---|
| 1 | Honest loading, failure and unknown-meeting copy | Prevents mistaking missing research for no public hearing | Low; no new data request | Implemented safely in existing text areas |
| 1 | Bounded viewport loading, list/editor pagination, preserved detail selection | Faster startup and predictable interactions | Implemented; bounded payload/markers | Implemented |
| 1 | Expand structured meeting collection and provenance | Makes participation features genuinely useful | High; asynchronous ingestion, review and monitoring | Approve pilot scope first |
| 2 | Developer search; clearer search hint | Finds projects by responsible organization | Low/medium; derived search-index migration, no large client array | Recommended next; not active |
| 2 | One “Upcoming meetings” filter and a location search suggestion | Easier discovery of actionable local cases | Medium; indexed meeting predicate and matching exact counts; no city/category chip clutter | UI/control proposal; approve first |
| 2 | Small exact **visible viewport** count alongside global matched count | Explains why only some records are on screen | Low/medium; count exact viewport separately from padded fetch bounds | Approve label/control placement first; current count remains global matches |
| 2 | Compact “Next meeting” and verified “Updated” lines on cards | Prioritizes status, place and timely action | Medium; add only small summary fields; define substantive update timestamps | Approve card changes first |
| 3 | Mobile Map / List toggle using current views | Gives either map or list more screen space | Medium; retain viewport/filter state and virtualized list | Major layout change; approval required |
| 3 | Past-meeting view and coverage/freshness badge | Separates history, absence and missing collection | Medium; explicit provenance and past-event query needed | Approve information design first |
| 3 | Proposed state colors, collapsed accessible Map key, subtle state boundaries | Nationwide orientation without status confusion | Medium; cached simplified outlines, fixed palette, native QA | Explicit visual approval required |

The highest-value next product work is trustworthy meeting coverage, followed by a small upcoming-meeting filter and developer search. Add controls sparingly; avoid map-obstructing panels on small screens. Do not label every record “recently updated” merely because a bulk import occurred. Editor revision/history time, source check time and substantive government decision date are different facts.

**Awaiting your approval:** the color/legend/boundary proposal, larger map/list or card/control changes, and the scope of an automated meeting-ingestion pilot. All performance, data-preservation, correctness and safe copy changes described as implemented are already complete.
