# BuildWatch: community-relevant catalog audit and proposed migration

**October 25, 2026 — read-only dry run; approval required before implementation.**

The live map still shows 11,940 records. No development record, classification, account, follow, history entry, schema or public-map behavior has been changed for this audit. The approved state colors, subtle state outlines, status pins and bounded spatial loading remain intact. No recurring searches, ingestion jobs or scheduled updates were created.

## Decision to approve

Use a project-first public catalog with immutable supporting evidence and an administrator review queue. The conservative dry run proposes **98 public project candidates**, **10,617 supporting administrative records**, **1,223 records requiring review**, and **two maintenance-only records**. Five previously archived demo records remain archived. All original rows and source information are retained.

**98 is an initial, deliberately cautious estimate, not a claim that only 98 meaningful developments exist.** It comprises 78 of the previously researched 80 projects and 20 individually selected municipal examples with described physical scope. Most municipal entries remain in review until their scope, relationships and freshness are checked. The 1,324 curated/municipal records are a candidate pool, not 1,324 verified independent projects. Environmental-only records may also lead to legitimate projects after verification.

These are publication recommendations based on stored evidence, not a new live verification of all project statuses or completion dates. Older approvals, an agency's generic “Active” state, conflicting counts, phases and ambiguous matches require explicit review. An approval of this plan would authorize implementing the workflow and applying the reviewed manifest; unresolved status or identity conflicts must stay unpublished. No automatic merge or parent association is proposed.

## What exists and why the map is noisy

The SQLite `projects` table currently mixes curated developments, municipal application entries and environmental certificates in one JSON-backed entity. The public index excludes only `archived` records. There is no classification/publication eligibility field, parent/source relationship or reversible merge system.

| Existing cohort | Public rows | Current treatment |
|---|---:|---|
| Previously curated projects | 80 | Public projects |
| Municipal inventories | 1,244 | Public projects regardless of physical relevance |
| NC DEQ construction-stormwater records | 10,616 | Public markers, all displayed as Approved |
| Total | **11,940** | Counted and clustered together |

There are **11,945 stored project rows**, including five archived demo projects. The public rows retain **11,838 permit/certificate identifier references**; grouped permit records can contain several identifiers. This reference count is not a count of unique developments.

The publication importer (`server/imports/statewide.ts`) validates each normalized record and publishes every new catalog ID. Shape validation does not establish community relevance. The research builder (`work/statewide/build-catalog.mjs`) grouped some related permits and excluded some ancillary entries, but it also:

- Promoted environmental authorizations to independent public entries without verified development scope.
- Inferred broad categories through word matching. A family medical practice became Housing; a grocery store mentioning stormwater became Civic.
- Interpreted Cary's generic Active application state as Approved in the public record, while the description correctly warns that this is an administrative state.
- Used name/distance heuristics for prior deduplication, including phase-name stripping. Those historical groupings should be examined, not treated as proof of one development.
- Discarded some ancillary records from the generated public catalog rather than storing a first-class source association. Saved source files and exclusion logs still exist locally; the database does not contain every original agency response as an immutable raw record.

The public API, spatial queries and legacy snapshot currently read this mixed inventory. The editor category field is free text. The existing Auth0 backend already provides administrator MFA, collaborator permissions, edit history and moderation; these should be extended, not replaced.

## Read-only audit and concrete dry run

The audit tool opens SQLite with `readOnly: true` and session `query_only=ON`, never imports the mutating Store constructor, and issues no schema or project writes. It records a project/revision digest for later stale-preview protection.

Artifacts:

- [Summary](reports/community-refocus/summary.json)
- [Record-level dry-run CSV — all 11,945 original rows](reports/community-refocus/dry-run-manifest.csv)
- [98 public candidates, with reasons and source URLs](reports/community-refocus/public-candidates.json)
- [106 representative records and their stored evidence](reports/community-refocus/review-samples.json)
- [969 possible duplicate pairs — CSV](reports/community-refocus/duplicate-candidates.csv)
- [Duplicate-pair evidence — JSON](reports/community-refocus/duplicate-candidates.json)
- [Explicitly selected examples and review decisions](reports/community-refocus/reviewed-examples.json)
- [Reproducible read-only audit tool](scripts/audit-community-catalog.mjs)

The representative set spans all 11 municipal-source jurisdictions and a permit example from each of the 52 covered counties. This is a representative audit, not individual government-source re-research of every permit or municipal row. The original curated descriptions were also examined for physical scope. Proposed classifications distinguish source-record purpose from the existence of a potentially meaningful development behind that source.

| Proposed classification | Rows | Public by default? | Disposition |
|---|---:|---|---|
| Public-facing development | **98** | Yes, after approval and publication checks | Project-centered cards and one marker per approved parent |
| Supporting administrative record | **10,617** | No independent marker | 10,616 environmental entries plus one watershed-plan revision; retain all evidence, queue unresolved parent relationships |
| Requires review | **1,223** | No | 1,221 municipal entries and two curated entries needing clearer scope; administrators can approve or reclassify them |
| Minor or unrelated activity | **2** | No | Retain full records and permit an override |
| Existing archived records | **5** | No change | Preserve existing archive state |

The supporting-record queue is separate from the Requires review classification: an environmental certificate is known to be supporting evidence, but its correct parent may still be unknown. It must remain searchable by administrators and may justify creating a new verified parent later.

The provisional public set currently covers **11 named municipalities and seven counties**, rather than the old inventory's broad permit footprint. Empty areas must be labeled as coverage/review gaps, not “no development.” The population eligibility criteria do not guarantee verified project coverage.

### Sample decisions based on physical scope

| Record | Proposed handling | Reason |
|---|---|---|
| Carolina North former-airport proposal | Public · Mixed-Use | Documented campus-development footprint; preserve the distinction from the larger forest |
| Lucky Auto Repair | Public · Commercial | A proposed auto-service facility; “repair” in a business name is not routine repair work |
| Liberty View / Revolution apartments | One public Residential project | Existing curated scope already groups related apartment-building permits |
| Mitchell Water Treatment Plant improvements | Public · Public Infrastructure | Treatment basins, pumps, storage and related plant works are a substantial construction project |
| Wayland Drive drainage improvements | Public · Public Infrastructure | Creates floodwater storage and improves conveyance; independent flood-control construction, not a compliance record |
| Locks Creek drainage improvements | Public · Public Infrastructure | Raises a roadway and upsizes a culvert |
| Flaherty Park tennis-court renovations | Public · Parks & Environment | Includes a new restroom building and accessible connections, beyond resurfacing alone |
| Bombay Grocery Store | Public · Commercial | Source describes a 10,000-square-foot grocery building; preserve the old Civic label as original source data |
| Tricity Family Medicine | Public · Commercial candidate | Source describes a 19,200-square-foot medical office, not homes; an older approval still needs its date/basis shown and current-stage review |
| Flats at Old Winston | Requires review | Description says 48 apartments while the structured homes field says 1; do not publish an invented correction or treat parcel counts as dwelling counts |
| Bryton subdivision revision / master-plan changes | Requires review | Verify whether the entry describes a new independent physical project, a phase or an amendment to an existing parent |
| Croasdaile Village Commons / Pi Kappa Phi addition | Requires review | Scope lacks enough scale/context to confidently distinguish significant construction from a small alteration |
| New Century Track resurfacing | Minor activity | Described work replaces existing track surfacing |
| Mazarick Park tennis resurfacing | Minor activity, overridable | Described scope replaces existing courts/surfaces without an added facility; review broader context if available |
| HPU watershed-plan revision #16 | Supporting administrative record | A plan revision alone does not establish independent construction |
| Isolated NC DEQ certificate | Supporting, parent unresolved | Preserve certificate, location, issuer, dates and URLs; do not assert an independent development or construction start |

No blanket rule excludes drainage, renovation, repairs, environmental work or land clearing. Qualification depends on documented physical scope, not the presence or absence of those words. Major flood-control projects and genuinely substantial redevelopment remain eligible. A minor record may acquire a parent without becoming a separate public project.

## Duplicate and parent-link findings

The read-only matcher found **969 candidate pairs**, not 969 proven duplicates or 969 removable markers:

| Pair type | Candidates |
|---|---:|
| Municipal + permit | 64 |
| Curated + permit | 5 |
| Municipal + municipal | 27 |
| Permit + permit | 873 |

It examines exact normalized names within a county, retained permit identifiers, and spatially blocked nearby candidates using names, numeric addresses and named developers. Phase identifiers are not stripped by this new dry run. Coordinates and names alone never authorize a merge. Same-name rows farther apart are explicitly flagged as uncertain, not collapsed. Raw parcel identifiers are generally absent from the current normalized project model and must not be fabricated.

Examples worth reviewing:

- Omni Raleigh Convention Hotel ↔ Omni Raleigh Hotel permit record: approximately **38 m** apart.
- Windsor Chavis community complex ↔ Windsor Chavis Joint Facility – North: approximately **102 m** apart.
- Science Center Biodome expansion ↔ Science Center Parking Expansion: approximately **103 m** apart; existing curated scope already mentions related parking.
- East Civic Tower ↔ Phase 1–East Civic Tower: approximately **120 m** apart; confirm phase coverage before linking.
- Comet Lake Jeanette Apartments ↔ Comet Lake Jeanette certificate: approximately **197 m** apart.
- The Willows at Burlington municipal entry ↔ The Willows @ Burlington certificate: approximately **7 m** apart.

The dry run applies **zero merges and zero links**. Shared sites, similar names, common developers, outparcels and phased projects can be legitimately separate. A certificate covering several projects may need several explicit scope-qualified links rather than a forced single parent.

## Proposed project-centered model

Reuse the existing `projects` identities for canonical developments and keep every legacy row. Add a small number of related structures in the existing SQLite database:

1. **Record classification:** original record ID, one of the four classifications, publication decision, public category, reason, reviewer, decision version, policy version and batch ID. Existing `archived` state remains independent. Classification changes do not overwrite source JSON.
2. **Immutable source records:** issuer, external ID, original URL, source date, observation time, payload format, content hash, preserved payload and ingestion batch. Capture the current legacy JSON as a clearly labeled **legacy normalized snapshot**, not falsely as a raw agency response. Retain available raw agency downloads separately with their true provenance; future imports capture original responses before normalization. Original identifiers, permit arrays, timestamps and source links remain intact.
3. **Project/source associations:** approved parent ID, source ID, relationship (permit, planning application, environmental review, amendment, phase or duplicate evidence), reviewer and history. Unassigned evidence goes to a matching queue. Multiple sources per parent and scope-qualified many-to-many links are supported.
4. **Reversible aliases/merges and catalog decision log:** preserve both original project IDs and rows, record the chosen canonical ID and field decisions, and retain reversible link/visibility changes. Existing project editing history remains intact; catalog decisions record classification/link/merge events rather than masquerading as rewritten agency data.
5. **Migration batches:** approved manifest digest, policy version, exact operations, before/after decisions, rollback state and operator identity.

No separate authentication service, public collaborator registration or second database is needed. Originals can be retained as evidence while the canonical public profile evolves through normal audited editing. Original agency/source payloads must stay immutable.

### Public categories

Use these seven validated categories on the public profile, with original source category preserved separately:

| Public category | Initial candidate count |
|---|---:|
| Residential | 39 |
| Commercial | 9 |
| Industrial | 5 |
| Transportation | 3 |
| Public Infrastructure | 21 |
| Parks & Environment | 5 |
| Mixed-Use | 16 |

Public Infrastructure includes public/community facilities; the category alone must not claim public ownership. Private medical offices remain Commercial, and residential fraternity/sorority houses remain Residential when the documented construction qualifies. A broad Civic or Land development source label needs scope review. Do not force unknown records into a category merely to publish them. No new city/category chip strip or major map redesign is proposed.

Status is independent of category and classification. Preserve source status, source date and approval basis. Environmental coverage, funding approval and generic administrative Active states are not equivalent to construction. Resolve contradictory stages before publication, or leave the record in review; never manufacture a stage or map all approvals to construction. Existing source qualifications and public meetings remain attached.

## Administrator workflow to implement after approval

Extend the existing Auth0/MFA-protected Admin Dashboard with a **Catalog Review** area:

- **Review queue:** server-paginated filters by classification, locality, source, parent-link state and issue. Show physical scope, source/date, proposed category/status basis, conflicts and full original records on demand.
- **Classification review:** select classification and one of the seven public categories, record rationale and source evidence, preview public appearance, then approve or return to review.
- **Associate evidence:** search for an existing canonical project, compare identifiers/parcels/address/location/developer/scope, preview the association and approve it. A new meaningful development requires its own verified parent profile.
- **Merge candidates:** show both complete records and sources side by side, choose a canonical project, resolve field/status/meeting conflicts explicitly, preview marker/count and followed-project consequences, then commit atomically. No automatic ambiguous merges.
- **Original sources and decision history:** read-only original payloads, URLs, certificates, timestamps, prior decisions and who changed them.
- **Rollback:** preview and reverse a migration batch or individual catalog decision without deleting originals or later user activity.

All endpoints must call existing `requireAdmin`, including MFA and current server-side roles. Collaborators can maintain already approved projects and submit draft/new evidence; they cannot bypass classification review or perform administrator merge/override actions. An administrator adding a qualified development can approve its classification in the same audited workflow. Paying for Plus grants no catalog privileges.

The ordinary project PUT route must not provide a backdoor to publish a supporting/review record. Public detail URLs, legacy snapshots, search, cards, meeting lists, cluster counts and notifications must all use the same publication predicate. Administrators retain separate protected access to the underlying records. Hidden rows must not leak through a guessed public ID or stale cache.

Existing saved follows/history are not deleted. For hidden records, the account can indicate that the saved item awaits review. For an approved merge, resolve aliases to the canonical project in views and active-tracking calculations without erasing original follows/history; avoid charging multiple slots or sending duplicate notifications for one parent. Existing notifications remain historical records. Do not send mass “development updated” notifications merely because records were reclassified.

## Migration and rollback sequence

1. **Approve the policy and reviewed manifest.** Resolve disputed examples and scope/status issues. The current digest is in the summary and each manifest row retains its original SHA-256 and revision. The preview is not executable approval by itself.
2. **Build and test against an isolated database copy.** Take a consistent private SQLite backup, preserve every original table and capture all available source snapshots. Verify all original project bytes and account/follow/history rows remain unchanged after migration.
3. **Add classification/source/link/audit structures and protected controls.** Do not change the live public catalog yet. Default newly imported records to Requires review; environmental evidence defaults to supporting with parent review required, never a public marker solely because the permit exists.
4. **Populate a staged batch.** Use the reviewed manifest, excluding already archived demos. Present exact display/hide/link/merge counts. Unknown identifiers, changed source revisions or a changed project digest stop the apply operation and require a refreshed dry run. No fuzzy match is applied automatically.
5. **Apply the approved visibility batch atomically.** Keep existing project/source rows unchanged. Update derived public RTree/search/meeting indexes, global counts, detail visibility and cache version together. Preserve state colors, individual status colors, viewport loading and clustering. Replace the coverage panel's old permit-footprint claims with honest public-project/review coverage.
6. **Validate.** Check map/list/count parity, source detail access controls, admin MFA, all four classifications, canonical/alias selection, existing corrections/follows, deduplicated notifications, meetings, categories, merge conflicts and stale-write denial. Test rollback on the isolated copy before the live apply. Recheck TypeScript, web/iOS exports and browser behavior. No production-scalability claim is implied by this audit script.
7. **Rollback if requested.** Apply the recorded inverse classification/link/alias operations, regenerate public indexes and increment cache version. Refuse to overwrite subsequent administrator decisions automatically. Preserve decision history and source snapshots. A full database backup is a disaster-recovery option, not the normal rollback path: restoring the whole database could otherwise erase accounts or follows created since the migration.

## Future collection, without scheduled work

Prefer official planning/site-plan/subdivision inventories, rezoning and land-use applications, municipal project trackers, transport construction schemes, capital-project descriptions and agenda items tied to an actual case. Source authority alone is not enough: a STIP or capital-budget row can still describe routine maintenance or a program rather than one independent physical project.

Use environmental/grading/building permits as evidence attached to an existing parent, or as a lead for manual research into a new parent. A permit with a specific verified new-building scope can support a meaningful project; a certificate alone cannot supply missing scope. Capture every source before excluding it from public display.

Manual, administrator-initiated import batches should stage originals, normalize typed fields, identify candidate parents and show a preview. Approval publishes project profiles, not every incoming permit. Source adapters need stable issuer-scoped IDs, source timestamps, units distinct from lots/parcels, phase relationships and status-basis mappings. Avoid business-name or incidental-utility keyword classification. No scheduler, weekly automation or recurring discovery search is part of this phase. Existing account notification workers and small public-map refresh polling need not be removed.

Useful verified official entry points:

- [NC DEQ NPDES construction program](https://www.deq.nc.gov/about/divisions/energy-mineral-and-land-resources/stormwater/stormwater-program/npdes-construction-program): environmental coverage is supporting evidence.
- [Cary maps and development inventory](https://www.carync.gov/projects-initiatives/maps): project/site-plan discovery, with individual stage and scope checks.
- [Raleigh current development activity](https://raleighnc.gov/planning/services/current-development-activity): distinguish application/plat/plan types and actual physical proposals.
- [NCDOT STIP planning](https://connect.ncdot.gov/projects/planning/Pages/State-Transportation-Improvement-Program.aspx) and [official geoservice](https://gis11.services.ncdot.gov/arcgis/rest/services/NCDOT_STIP/MapServer): transport candidates with explicit scope and stage review.
- [Fayetteville official Wayland drainage capital action](https://cityoffayetteville.legistar.com/LegislationDetail.aspx?GUID=7CA413CC-112A-40C2-9B5E-86A74E0CFF7E&ID=8073940&Options=&Search=): an example of an independent flood-control construction scheme that should not be filtered out for containing drainage terminology.

For eventual one-million underlying records, keep public spatial indexes limited to approved canonical parents. Index issuer/external IDs, parent links, classification/review state, normalized addresses/developers and actual parcel IDs when supplied. Use RTree/FTS candidate blocking and server pagination; do not compare every pair or download all evidence into the browser. Stream future imports in bounded batches. The current one-off dry run reads today's catalog in memory and is not a million-record production matching benchmark. SQLite and the existing bounded public map can be retained while measuring future ingestion/admin-query load.

## Approval requested

Approve this conservative staged migration, the proposed classifications/categories and the protected review/link/merge/rollback workflow. **No live data will be hidden or merged until that approval.** The estimate can grow as administrators approve additional genuine developments; the purpose is to replace misleading record volume with evidence-backed projects, not to discard their supporting records.
