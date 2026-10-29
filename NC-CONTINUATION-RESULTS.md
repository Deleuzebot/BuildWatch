# NC permitted alternatives and continuation results

October 28, 2026 — review only. No automatic updates enabled.

## How this works

GitHub Actions executes the research worker independently of the laptop. It reads registered official sources, applies source-specific mappings and evidence gates, and saves findings/checkpoints in Supabase. Administrator review remains separate from publishing to the public map. These runs were manual dry-runs, not an enabled weekly schedule.

## Alternative sources found and tested

| Area | Permitted public source tested | Result | Limitation |
| --- | --- | --- | --- |
| Cary | [Official active-development GIS API](https://maps-apis.carync.gov/server/rest/services/Development/ActiveDevelopment/FeatureServer/0) | 50 structured development records read; 37 exact existing-project matches | Polygon footprints; no invented pins, approval dates, or completed milestones. The old restricted open-data API was not accessed. |
| Burlington | [Official Planning and Zoning agenda archive](https://www.burlingtonnc.gov/Archive.aspx?AMID=46) | 20 official document links saved for private review | Document index only. Contents still need review; not a replacement for complete live GIS inventory. |
| Kannapolis | [Official planning-board page](https://www.kannapolisnc.gov/Government-Departments/Planning/Planning-Zoning-Commission-Board-of-Adjustment) | 20 official planning-document links saved for private review | Includes historical packets. The live development map still references the restricted GIS host. |

Cary's [official map page](https://www.carync.gov/projects-initiatives/maps/interactive-development-map) identifies its public development-map resources. The separate maps-apis.carync.gov host supplies a public Query API and returned 404 for robots.txt. The old data.townofcary.org API remains disallowed for this crawler.

Burlington's normal public archive path is permitted under its published robots rules; its crawl delay was respected. Its official development dashboard still points to maps.regisnc.org/portal, which is restricted and was not fetched. Kannapolis' public planning page permits access while its maps.kannapolisnc.gov/arcgis service remains restricted.

An unrelated wildcard rule such as /*/ctl/ previously caused the conservative matcher to reject every Kannapolis public page. Added correct wildcard/end-anchor matching and checked each requested URL against the resulting policy, including query endpoints. No Googlebot impersonation, token workaround, login bypass, or restricted GIS request was used.

The document indexer retains only same-origin official links and their titles, deduplicates them, and queues them for review. It does not fetch the linked PDFs, invent project facts, create meeting dates, or use AI. Published access is not a claim of blanket copyright licensing or guaranteed nationwide completeness.

[Successful GitHub alternative-source test](https://github.com/Deleuzebot/BuildWatch/actions/runs/40794373195).

## Continuing beyond 50 records

[Successful GitHub checkpoint continuation](https://github.com/Deleuzebot/BuildWatch/actions/runs/40791020328).

- Resumed all 22 partially processed source runs from saved offset 50.
- Processed **1,686 additional structured records**, with at most 100 additional records per source in this pass.
- Nine sources reached the end of their current data; 13 remain partial with saved checkpoints.
- Used 82 additional source HTTP requests for continuation.
- Added Cary's 50-record alternative-source test separately: **1,736 additional structured records overall**, plus 40 document pointers.
- The latest combined pilot has processed 2,999 structured source records. These are not 2,999 new projects or unique physical developments.
- No public project inserts, status changes, merges, or archives were applied.

The saved pre-run offsets are used below. The initial wrapper's progress label referenced a mutable checkpoint object and could display the ending cursor as the starting offset for budget-limited feeds; that reporting bug was fixed by taking a snapshot. The underlying worker resumed the correct saved pages.

| Source | Layer | Starting offset | Additional records | Cumulative records in source run | Outcome |
| --- | --- | ---: | ---: | ---: | --- |
| Durham | 17 | 50 | 100 | 150 | More records pending; checkpoint saved |
| Asheville planning jurisdiction | 1 | 50 | 100 | 150 | More records pending; checkpoint saved |
| Holly Springs | 0 | 50 | 43 | 93 | Source exhausted; findings await review |
| Harnett County planning inventory | 0 | 50 | 100 | 150 | More records pending; checkpoint saved |
| Fayetteville | 0 | 50 | 46 | 96 | Source exhausted; findings await review |
| Greensboro | 1 | 50 | 100 | 150 | More records pending; checkpoint saved |
| Wake Forest | 0 | 50 | 68 | 118 | Source exhausted; findings await review |
| Charlotte transit-area development inventory | 0 | 50 | 100 | 150 | More records pending; checkpoint saved |
| High Point | 0 | 50 | 100 | 150 | More records pending; checkpoint saved |
| City of Sanford | 1 | 50 | 47 | 97 | Source exhausted; findings await review |
| NCDOT future transportation program | 1 | 50 | 100 | 150 | More records pending; checkpoint saved |
| Brunswick County planning inventory | 82 | 50 | 100 | 150 | More records pending; checkpoint saved |
| Gastonia | 26 | 50 | 19 | 69 | Source exhausted; findings await review |
| Apex | 0 | 50 | 100 | 150 | More records pending; checkpoint saved |
| Pender County planning inventory | 1 | 50 | 55 | 105 | Source exhausted; findings await review |
| Mooresville | 0 | 50 | 100 | 150 | More records pending; checkpoint saved |
| Gastonia planning jurisdiction | 0 | 50 | 29 | 79 | Source exhausted; findings await review |
| Huntersville | 0 | 50 | 100 | 150 | More records pending; checkpoint saved |
| Pender County planning inventory | 4 | 50 | 9 | 59 | Source exhausted; findings await review |
| Hickory planning jurisdiction | 0 | 50 | 70 | 120 | Source exhausted; findings await review |
| Brunswick County planning inventory | 0 | 50 | 100 | 150 | More records pending; checkpoint saved |
| NCDOT future transportation program | 0 | 50 | 100 | 150 | More records pending; checkpoint saved |

## Budget and safety

The monthly ceiling stayed at **10,000 source-request reservations**. For the 22 continuations and three alternative tests, the state per-attempt request limit was temporarily lowered from 80 to eight so small tests did not reserve a full 80-request allowance. The original 80-request setting was restored afterward. Reserved usage is now 9,560/10,000; actual HTTP requests are lower. No paid service, AI API, billing commitment, or schedule was activated.

All 115 local tests and TypeScript checks passed. [GitHub verification passed](https://github.com/Deleuzebot/BuildWatch/actions/runs/40794359543), including the source-policy and document-index tests. Secrets scanning passed before upload.

Final database check: 13,060 stored project records, zero automation mutations, zero autopublish sources, schedule disabled, live writes disabled, pilot approval false. The registry now contains 34 sources, including the three additions. Existing sources, identifiers, source references, histories and backups were preserved. Exact Cary application references were copied to the alternative source without merging projects.

The public map count is now 1,830 rather than the earlier 1,831. Investigation found that an existing approval-policy deadline for project nc-local-40aece704bc0f3 was reached at 8:00 PM America/New_York on October 28. That policy was last set October 25 by operator:requested-cleanup. The existing time-dependent map view excludes it automatically; these pilots did not change that project, its approval date, or its policy.

## Before enabling automatic publication

- Continue the 13 still-partial original feeds and the new Cary feed; do not call the state fully verified yet.
- Burlington/Kannapolis live-GIS coverage still requires permission or a genuinely permitted complete feed. Agenda indexes offer limited evidence monitoring, not complete project inventory.
- Review document contents and associate verified project-specific hearings with exact dates/times/venues before sending meeting notifications.
- Review ambiguous statuses, meaningful-development scope and duplicate candidates using the existing administrator workflow.
- Respect the remaining monthly reservation budget; no ceiling was silently raised.
- Obtain explicit user approval before enabling scheduled or automatic updates.
