# North Carolina statewide preparation — October 29, 2026

## Safety and scope

This work used cached evidence: **zero government/secondary research HTTP requests**, no budget increases, no new services. The seven remaining research requests were not spent. Publication, production archival, legacy lifecycle adoption and scheduling remain disabled. Fire Station #4 remains private. No migration or public-data edit was performed.

## Coverage assessment

The reusable inventory is `config/maintenance/nc-statewide-inventory.json`: 100 counties and 550 municipalities from cached OSBM Vintage 2025 tables. It includes source observations, capability flags, failure evidence, hashes, population provenance, missing coverage and inactive execution settings. It is **not** an enabled maintenance registry.

| Highest observed capability | Counties | Municipalities |
| --- | ---: | ---: |
| Sample project reconciliation | 0 | 4 |
| Structured retrieval, partial scope | 3 | 12 |
| Document index retrieval or cached replay only | 16 | 2 |
| Source identified, not validated | 33 | 6 |
| Development source missing | 48 | 526 |
| Total | 100 | 550 |

All 650 entities have `fullJurisdictionVerified=false`. “Missing” means the inventory has no development endpoint, not that no projects exist. County homepages are not counted as development feeds. County feed coverage is not inherited by incorporated cities.

There are 221 distinct evidence/reference URLs, including homepages, query variants, individual PDFs and project pages. These are **not 221 independent working integrations**. Evidence levels: 168 identified only; 26 structured retrieval samples; 5 reconciliation source URLs; 10 live-tested index URLs; 8 cached index replays; 4 extracted PDFs. Source capability and entity coverage totals answer different questions; query variants can refer to the same provider.

Sample-reconciled municipalities: Apex, Cary, Chapel Hill and Huntersville. Structured county coverage: Brunswick, Harnett and Pender. Other structured city samples include Asheville, Charlotte (transportation scope only), Durham, Fayetteville, Gastonia, High Point, Holly Springs, Mooresville, Raleigh (supporting permits only), Wake Forest, Wilmington and Winston-Salem. These observations establish historical sample retrieval, not current access or complete jurisdictional maintenance.

The statewide NCDOT feeds can provide substantial transportation evidence across jurisdictions, subject to the existing major-road eligibility filter. DEQ stormwater records are supporting evidence, not a statewide development catalogue. Census/DEQ boundaries and OSBM population data support geography/eligibility only. Agenda platforms and regional news feeds can share adapters; shared coverage must be proven before reducing jurisdiction checks.

Roster caveats: balance-of-county and two whole-county rows were excluded. Holly Ridge's partial-place label is retained for review. Dellview and Spencer Mountain occur only in the older boundary cache and are separate boundary-review entries, not silently added to the municipal roster. Only 24 municipalities have explicit cached official county attributes; 526 have spatial candidate associations needing verification. These are not assertions of planning/ETJ authority.

## Implemented and tested in this phase

1. **Historical document interpretation:** `server/maintenance/document-decisions.ts` identifies case-section boundaries across pages, separates a consistency vote from a resolution-to-zone vote, and extracts explicit construction-start statements across PDF line breaks. Outputs retain URL, hash, page, quote and event scope.
2. **Conservative corroboration:** a secondary mention cannot corroborate an event unless a reviewed identity binding, date, event and component scope agree with primary evidence. This rule is tested; broad automatic extraction of secondary articles is still incomplete.
3. **Grounded description proposals:** extractive text must exist in the official evidence. Numbers and forecasts are retained; invented text is rejected. This does not autonomously summarize arbitrary documents or reset approval dates.
4. **Identity and duplicate safeguards:** reviewed source bindings are required to attach document milestones. Exact existing event identity suppresses repeat proposals; unknown bindings go to identity review.
5. **Decision-minute discovery:** minutes are recognized as document leads and can be retrieved only through explicit `includeDecisionMinutes` adapter opt-in. No source opt-in was enabled. Finding a minutes link does not establish an approved decision.
6. **Unattended offline entry point:** `scripts/nc-cached-maintenance.mts` executes these stages without Codex or an AI API and writes a private report. It makes no HTTP requests or database writes.

### Real evidence versus controlled tests

| Evidence | Detection and result | Limit |
| --- | --- | --- |
| Apex official FID 712, October 22, 2026 TRC action | Existing actual worker detects application/component approval and preserves parent status and history in rollback audit | Does not establish approval of the broader hospital |
| Kannapolis adopted January 20, 2026 minutes, CZ-2025-05, PDF page 6 | Resolution-to-zone motion approved six to two; prior consistency motion and next case excluded | Application-level proposal; canonical binding and final legal/appeal effect still require review |
| Cary FY2024 fourth-quarter report, PDF page 39 (printed page 37) | Black Creek/Cary Parkway component construction explicitly started June 3 | Year inferred from report period, flagged for confirmation; no whole-greenway completion or location correction |
| Same Cary report's three-phase construction forecast | Exact extractive description proposal preserves “anticipated” language | Prior description is a **controlled baseline**, not a claimed historical Supabase version |

Official documents:

- [Kannapolis January 2026 minutes](https://www.kannapolisnc.gov/Portals/0/Kannapolis/Departments/Planning/Documents/Planning%20Commission/Minutes/January%202026%20Minutes.pdf?ver=4pI_0GeAGuDk8KTdABZytQ%3d%3d)
- [Cary FY2024 quarterly report](https://www.carync.gov/home/showpublisheddocument/33660/638581074120600000)

The cached-document run found two real historical statements, one controlled description comparison, **zero newly verified canonical matches**, and no public changes. Historical extraction demonstrations are not new discoveries.

The separate Supabase behavior audit passed all 13 cases using the actual worker and SQL clones checked against current production function bodies. Tests covered approval, construction, withdrawal versus cancellation, completion, expiration, outage protection, checkpoint re-verification, description/milestone preservation, idempotent discovery, unchanged records, future schedules, real cached Apex component approval and atomic failure rollback. All writes were in the isolated audit schema inside a rolled-back transaction. Production guard equality and empty audit tables were verified afterward. Most lifecycle cases are controlled simulations, not historical before/after source pairs.

## What remains incomplete

| Capability | Readiness |
| --- | --- |
| Structured worker comparison, lifecycle/history and rollback safeguards | Implemented and tested for validated source configurations |
| Cached historical decision/construction extraction | Implemented for tested document patterns; private proposals only |
| PDF sandbox, 50 MB/200-page opt-in profile | Existing bounded implementation retained; not broadly enabled |
| Automatic OCR for scanned documents | Unavailable; queue unreadable documents, no paid OCR |
| Arbitrary minutes layouts, motions, appeals and final decision authority | Source-specific validation required |
| Secondary article event extraction/corroboration at statewide scale | Partial; rule implemented, general adapters and permitted feeds incomplete |
| Verified source aliases and parent/component relationships | Partial; ambiguous Burlington/Kannapolis and other identities stay private |
| Description generation | Extractive proposal path implemented; general evidence-grounded summary generation incomplete |
| Pagination/incremental watermarks | Existing structured adapters support bounded continuation; every new source must validate stable order, update fields and deletions |
| Complete statewide registry and autonomous coverage | Roster complete for cached vintage; operational source coverage incomplete |

No accuracy percentage is claimed from two documents. The deterministic assertions pass on selected examples; a larger independently reviewed holdout is needed before publication.

## Implementation priorities and eventual rotation

1. Finish semantic validation and exact source identity bindings for existing Apex/Cary/Chapel Hill/Huntersville adapters. Validate consequential events with adopted decisions, not agenda recommendations or permit issuance.
2. Add source-specific document profiles and date/authority rules to the current private-proposal path. Validate PDFs against the sandbox and benchmark limits; OCR failures remain review cases. The new generic functions must not be treated as publication authority.
3. Reconcile the existing Burlington/Kannapolis evidence and phased Black Creek corridor before accepting those proposals. Keep application withdrawal separate from whole-development cancellation.
4. Resolve missing sources by reusable provider groups, starting with identified endpoints and high-population gaps. Verify municipality versus county planning responsibility. Register only permitted regional secondary feeds.
5. Add a reviewed holdout for each provider, including unchanged pages, revised applications, duplicate source references, late amendments and source outages. Test incremental pages with stable IDs and overlap watermarks; GIS edit timestamps cannot reset approval clocks.
6. Benchmark a bounded statewide **shadow** rotation before separately requesting scheduling/publication approval.

Proposed future execution uses one bounded GitHub Actions coordinator with source-group queues and persistent Supabase checkpoints, per-state/source request/time/byte ceilings, cached robots/ETag/Last-Modified/hash checks, bounded retries and explicit partial completion. Changed documents alone enter extraction. Review proposals preserve before values, provenance and reasons for withholding. Prioritize upcoming hearings and pending decisions; resume lower-priority work rather than silently claiming full coverage. Initial discovery is manual and separate from weekly maintenance. NC remains the only initial eligible state; no nationwide schedule is enabled here.

## Workload and costs — planning estimates, not a benchmark

The cached 14 structured source inventories contain about 101,702 underlying records, approximately 413 pages at 250 rows/page. These are permits/applications/historical rows, **not 101,702 unique meaningful projects**. Do not refetch every page weekly; use validated incremental feeds where available.

Independent checks across 650 entities could consume roughly 3,000–4,000 requests/week (13,000–17,000/month) after robots, indexes, pages, PDFs and retries. That would exceed the current 11,000-request monthly safety cap. A hypothetical consolidation to 350 proven provider groups could approach 1,700/week (~7,400/month), but such consolidation is not yet established. No budget was raised. These estimates exclude unlimited initial discovery and assume few changed documents.

At 0.2–1 MB of retained changed evidence for 100 documents/week, raw cache growth is roughly 80–430 MB/month; do not store unbounded PDF bodies in the database. Keep hashes, citations, compact extracts and bounded retention, and benchmark before allocating storage. PDF CPU maximums are ceilings, not typical durations: 100 documents at a 60-second wall cap can alone use 100 runner-minutes/week. Actual changed-document counts and retries must determine the runtime estimate.

No new billable service or AI dependency was introduced: **$0 incremental services activated**. Existing GitHub/Supabase free allowances are finite, and statewide $0 operation is not established by this preparation. Benchmark runtime, database growth, network egress and proposal accumulation before enabling a schedule. Exceeding a hard budget must yield a partial/resumable run, not extra spending or a false success.

## Before activation

Require validated source permissions, identity and event/date semantics; a manually reviewed historical holdout; measured NC request/runtime/storage use within existing caps; tested private-review/rollback paths; reliable failure reporting; and explicit administrator approval of frequency and publication policy. Scheduling and production writes need separate authorization. None was granted or enabled in this phase.
