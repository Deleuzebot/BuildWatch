# NC mapping repairs and GitHub dry-run results

October 28, 2026. This report supersedes the earlier source-readiness findings where noted.

## What changed

- Applied 27 versioned, source-specific mappings verified against retrieved official field definitions. Hickory's existing mapping remains in place. No mapping was guessed for the three restricted sources.
- Corrected case/name/status/category/description/address bindings for Asheville, Durham, Harnett, Pender, Brunswick, Wake Forest and other readable jurisdictions.
- Decoded Gastonia's official status codes. Withdrawn remains unresolved rather than becoming cancelled physical development.
- Separated Fayetteville's physical project phase from executive/funding approval. Construction is preserved as reported construction; closeout is not automatically completed.
- Added explicit Wilmington physical-phase and Sanford planning-approval translations after the full pilot exposed those remaining gaps.
- Excluded the Greenville parcel/tax layer from discovery while preserving its identity and possible use as location evidence.
- Marked Greensboro's building-permit feed as supporting-only; individual permits cannot independently establish public developments. Administrative/historical record types in Harnett and Asheville remain held.
- Preserved submitted, permit, plan-approval, source-status, actual/planned construction and board dates under their own labels. GIS edit timestamps do not reset expiration. Numeric years cannot be parsed as Unix millisecond timestamps.
- Retained official polygon/polyline bounds without inventing point pins or centroids. NCDOT TIP identifiers, schedules and scope remain distinct from verified physical milestones. Existing road significance filters remain enforced.
- Restricted mapped queries to required fields, reducing irrelevant data transfer. Added stable ordering using source-specific dates where available; this is not a complete per-jurisdiction incremental-watermark implementation.
- Added source names, mapping versions and evidence-only roles to administrator execution history. Restored missing source labels in this pilot's budget-limited reports without changing their outcomes.

## Access-policy repair and GitHub tests

[Original blocked-source GitHub test](https://github.com/Deleuzebot/BuildWatch/actions/runs/40786965676) reproduced all 15 original failures, establishing that the issue was not unique to the local computer.

Twelve failures were a handling bug: the ArcGIS host returned 403 for robots.txt, which the worker treated as an explicit prohibition. [RFC 9309 section 2.3.1.3](https://www.rfc-editor.org/rfc/rfc9309.html#section-2.3.1.3) distinguishes an unavailable robots file from published Disallow rules. The correction permits that unavailable-file fallback only for registered official ArcGIS API sources. Actual API authorization failures, network/server failures, rate limits and explicit robots restrictions still stop retrieval.

Burlington, Cary and Kannapolis explicitly restrict automated access. They remain blocked; no restriction, login, CAPTCHA or access control was bypassed. They need a documented permitted feed or source-owner authorization before unattended ingestion.

## Corrected pilot results

[Full 31-source GitHub pilot](https://github.com/Deleuzebot/BuildWatch/actions/runs/40788582824), followed by [Wilmington/Sanford verification](https://github.com/Deleuzebot/BuildWatch/actions/runs/40789871130).

The table and totals use the latest result for each source, replacing the two earlier results rather than double-counting their records.

| Measure | Latest per-source results |
| --- | ---: |
| Registered sources assessed | 31 |
| Readable development/supporting feeds | 27 |
| Parcel-only reference sources skipped | 1 |
| Explicit access restrictions | 3 |
| Sample records processed | 1,263 |
| Records with recognized names/official identifier labels | 1,213 |
| Records without a project-title field (Greensboro permits) | 50 |
| Reported statuses decoded | 884 |
| Statuses unresolved | 379 |
| Existing project matches | 463 |
| Findings counted as awaiting review | 1,145 |
| Potential duplicate candidates retained for review | 1 |
| Previously archived records excluded from reimport | 55 |
| Verified source point geometries | 338 |
| Polygon / polyline footprints | 822 / 50 |
| Published / changed / archived projects | 0 / 0 / 0 |
| AI requests | 0 |

These are source records, not 1,263 new developments or 463 proposed updates. Existing source identifiers can match old, supporting or unchanged records. The remaining 118 records include 55 already-archived records excluded from reimport, one potential duplicate retained for review, and 62 records producing no actionable change. Unresolved status information is retained privately.

Each source attempt was capped at 50 processed records, eight HTTP requests and 40 seconds. Twenty-two feeds stopped at the deliberate sample limit; five exhausted their current pages and await review; three have access restrictions; one completed its reference-only skip. The audit harness completed, but this is not a completed statewide maintenance cycle.

Latest per-source worker totals: 84 HTTP requests, about 250 seconds of worker processing, 3,733,796 downloaded bytes. The two-source follow-up used six additional requests. GitHub installation/check overhead and database requests are additional. No paid services or AI APIs were enabled.

## Per-source results

| Source | Layer | Records | Names/IDs | Statuses decoded | Outcome |
| --- | --- | ---: | ---: | ---: | --- |
| [Apex](https://services1.arcgis.com/nry3yyvaEfskMEXA/arcgis/rest/services/Development/FeatureServer/0) | 0 | 50 | 50 | 49 | Partial: 50-record sample limit |
| [Asheville planning jurisdiction](https://gis.ashevillenc.gov/server/rest/services/Permits/AccelaPlanningView/FeatureServer/1) | 1 | 50 | 50 | 17 | Partial: 50-record sample limit |
| [Brunswick County planning inventory](https://services1.arcgis.com/W6gamXPYQeLXrdAd/arcgis/rest/services/Commercial_Development/FeatureServer/82) | 82 | 50 | 50 | 50 | Partial: 50-record sample limit |
| [Brunswick County planning inventory](https://services1.arcgis.com/W6gamXPYQeLXrdAd/arcgis/rest/services/ApprovedDev_poly/FeatureServer/0) | 0 | 50 | 50 | 0 | Partial: 50-record sample limit |
| [Burlington](https://maps.regisnc.org/arcgis/rest/services/sde_baselayers/BURL_TRC_Points/FeatureServer/0) | 0 | 0 | 0 | 0 | Blocked by explicit robots policy |
| [Cary](https://data.townofcary.org/api/explore/v2.1/catalog/datasets/developments/records) | records | 0 | 0 | 0 | Blocked by explicit robots policy |
| [Charlotte transit-area development inventory](https://gis.charlottenc.gov/arcgis/rest/services/CATS/TransitStationDevelopmentPublic/MapServer/0) | 0 | 50 | 50 | 50 | Partial: 50-record sample limit |
| [City of Sanford](https://services1.arcgis.com/XuFUQlKbcaxhKrdd/arcgis/rest/services/Development_Map__October_2026__WFL1/FeatureServer/1) | 1 | 50 | 50 | 50 | Partial: 50-record sample limit |
| [Durham](https://services2.arcgis.com/G5vR3cOjh6g2Ed8E/arcgis/rest/services/Planning/FeatureServer/17) | 17 | 50 | 50 | 23 | Partial: 50-record sample limit |
| [Fayetteville](https://services.arcgis.com/j3zNT485kmwrBtMJ/arcgis/rest/services/InfrastructureProjects_allfundedprojects_c26055940a844acf9834f8717d3fe712/FeatureServer/0) | 0 | 50 | 50 | 48 | Partial: 50-record sample limit |
| [Gastonia](https://services3.arcgis.com/u6Nvh8zpOQRNNRJi/arcgis/rest/services/Gaston_County___GCLMPO___Developments_2025/FeatureServer/26) | 26 | 50 | 50 | 50 | Partial: 50-record sample limit |
| [Gastonia planning jurisdiction](https://cogserver.gastonianc.gov/serverweb/rest/services/Planning/ResidentialDevelopments/MapServer/1) | 1 | 40 | 40 | 37 | awaiting review |
| [Gastonia planning jurisdiction](https://cogserver.gastonianc.gov/serverweb/rest/services/Planning/ResidentialDevelopments/MapServer/0) | 0 | 50 | 50 | 50 | Partial: 50-record sample limit |
| [Greensboro](https://gis.greensboro-nc.gov/arcgis/rest/services/EngineeringInspections/BuildingPermits_MS/MapServer/1) | 1 | 50 | 0 | 0 | Partial: 50-record sample limit |
| [Greenville planning jurisdiction](https://gisonline.greenvillenc.gov/arcgis/rest/services/GreenvilleLink/MapServer/3) | 3 | 0 | 0 | 0 | Reference only; discovery skipped |
| [Harnett County planning inventory](https://gis.harnett.org/arcgis/rest/services/Planning/Projects/MapServer/0) | 0 | 50 | 50 | 49 | Partial: 50-record sample limit |
| [High Point](https://giswa02.highpointnc.gov/server/rest/services/LandDevelopment/MapServer/0) | 0 | 50 | 50 | 50 | Partial: 50-record sample limit |
| [Holly Springs](https://gis.hollyspringsnc.us/ths_arcserver/rest/services/Planning/InteractiveDevelopment/FeatureServer/0) | 0 | 50 | 50 | 50 | Partial: 50-record sample limit |
| [Huntersville](https://services7.arcgis.com/CADYoH7VVBN3BQHU/arcgis/rest/services/Development_Projects/FeatureServer/0) | 0 | 50 | 50 | 46 | Partial: 50-record sample limit |
| [Kannapolis](https://maps.kannapolisnc.gov/arcgis/rest/services/Planning/Developments/FeatureServer/22) | 22 | 0 | 0 | 0 | Blocked by explicit robots policy |
| [Mooresville](https://gis.mooresvillenc.gov/gisadmin/rest/services/Planning/active_projects/MapServer/0) | 0 | 50 | 50 | 50 | Partial: 50-record sample limit |
| [NCDOT future transportation program](https://gis11.services.ncdot.gov/arcgis/rest/services/NCDOT_STIP/MapServer/1) | 1 | 50 | 50 | 0 | Partial: 50-record sample limit |
| [NCDOT future transportation program](https://gis11.services.ncdot.gov/arcgis/rest/services/NCDOT_STIP/MapServer/0) | 0 | 50 | 50 | 0 | Partial: 50-record sample limit |
| [Pender County planning inventory](https://gis.pendercountync.gov/arcgis/rest/services/Development_Activity/MapServer/3) | 3 | 41 | 41 | 41 | awaiting review |
| [Pender County planning inventory](https://gis.pendercountync.gov/arcgis/rest/services/Development_Activity/MapServer/1) | 1 | 50 | 50 | 48 | Partial: 50-record sample limit |
| [Pender County planning inventory](https://gis.pendercountync.gov/arcgis/rest/services/Development_Activity/MapServer/4) | 4 | 50 | 50 | 45 | Partial: 50-record sample limit |
| [Wake Forest](https://services1.arcgis.com/gqTCvanrwF2z2HEu/arcgis/rest/services/Active_Developments_2026/FeatureServer/0) | 0 | 50 | 50 | 5 | Partial: 50-record sample limit |
| [Wilmington capital improvements](https://services1.arcgis.com/GwaLJVJq0Y6voqEc/arcgis/rest/services/CIPACE_2026Updates/FeatureServer/25) | 25 | 49 | 49 | 43 | awaiting review |
| [Winston-Salem](https://services.arcgis.com/XAnuVx6VEMybNvyd/ArcGIS/rest/services/Development/FeatureServer/8) | 8 | 7 | 7 | 4 | awaiting review |
| [Winston-Salem](https://services.arcgis.com/XAnuVx6VEMybNvyd/ArcGIS/rest/services/Development/FeatureServer/7) | 7 | 26 | 26 | 19 | awaiting review |
| [Hickory planning jurisdiction](https://arcgis.hickorync.gov/server/rest/services/EconomicDevelopment/Hickory_Development_Projects/MapServer/0) | 0 | 50 | 50 | 10 | Partial: 50-record sample limit |

## Remaining review before any automatic publication

- Resolve the three access restrictions through permitted sources or owner authorization.
- Verify whole-development status and milestone semantics for each jurisdiction. Brunswick residential has approval dates/unit counts but no explicit current status; NCDOT schedules do not prove construction began; Wake Forest Active/Closed and Wilmington Right of Way remain unresolved.
- Continue the saved checkpoints beyond the first 50 records. Complete incremental selection/watermark validation and reconciliation before describing weekly coverage as comprehensive.
- Verify dates/times/timezones/venues and project associations for meetings. Holly Springs Public_Hearing is Yes/No, not a date. Gastonia agenda links and Winston-Salem board dates are now retained as evidence, but no unsupported meeting event or reminder is generated.
- Validate exact duplicates/supporting relationships and ambiguous permit scope through existing administrator review. No records were automatically merged.
- Missing project names, ambiguous categories and absent coordinates remain unresolved; no values were fabricated.
- The pilot deliberately does not execute statewide expiration. Existing expiration rules are unchanged, and dates were not reset. Source outages never triggered archiving.

## Verification and safety

Local TypeScript checking and all 113 tests passed, including real-source schema fixtures, phase/approval distinctions, supporting-only exclusion, parcel-feed skip, year/date validation, geometry handling, robots restrictions, and budget-limited report labels. The failed GitHub email referred to one missing TypeScript annotation in the new selector; it was corrected in the next commit. [The verification run passed](https://github.com/Deleuzebot/BuildWatch/actions/runs/40790106324), including TypeScript, all 113 tests, Expo Doctor and both exports.

The public dashboard update was deployed to the existing free Cloudflare Pages site. All 20 production checks passed, including Supabase public-map retrieval and protected endpoint rejection for unauthenticated requests.

Final safety query: 13,060 stored projects; 1,831 public map records; zero automation mutations; scheduling off; live writes off; pilot approval false; zero adapters approved for autopublication. Original databases, records, history and backups remain intact.

Private Supabase storage is about 105.5 MiB after pilot evidence and logs. Conservative monthly reservations are 9,360/10,000 source requests; reservations exceed actual HTTP usage. Further tests must respect the existing ceiling rather than increasing it silently.

No live schedule or automatic update is approved by this report.
