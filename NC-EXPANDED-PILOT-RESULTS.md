# North Carolina expanded pilot — October 29, 2026

**Dry-run only. Scheduled execution, project writes, AI and automatic publication remain disabled.**

## Checks completed

- [Expanded GitHub pilot](https://github.com/Deleuzebot/BuildWatch/actions/runs/40891944267): 50 bounded continuation attempts, 39,559 additional source records processed. This run completed as a workflow, but correctly retained a partial checkpoint for an oversized NCDOT geometry page.
- Two additional read-only continuations used 100-record pages for that feed. All 1,943 NCDOT line records were then paged successfully, adding the remaining 1,293 records. Download limits were preserved.
- Total additional records this round: **40,852**. Cumulative pilot source records: **43,851**. These include historical cases and supporting records; they are not 43,851 verified active developments or new map projects.
- All 27 readable registered development feeds now reached their current endpoint. Results remain awaiting review because application/permit status, dates, principal use, or geometry may not establish a verified whole-development change.
- The existing 13,060 stored projects were preserved. Automation project mutations: **0**. No automatic merges, archiving, new map pins, timeline changes, or notifications were applied.
- Database size after the evidence checks: approximately **203 MB**, below the existing 450 MB safety ceiling.

| Feed | Records paged across pilot | Remaining source pages |
| --- | ---: | --- |
| Durham planning cases | 22,780 | None at the checked snapshot |
| Asheville planning cases | 12,178 | None at the checked snapshot |
| Harnett planning cases | 2,266 | None at the checked snapshot |
| Charlotte transit-area inventory | 561 | None at the checked snapshot |
| High Point | 939 | None at the checked snapshot |
| Cary active development alternative | 53 | None at the checked snapshot |
| Brunswick commercial / residential | 186 / 155 | None at the checked snapshot |
| Apex | 195 | None at the checked snapshot |
| Mooresville | 164 | None at the checked snapshot |
| Huntersville | 162 | None at the checked snapshot |
| NCDOT program lines / points | 1,943 / 1,120 | None at the checked snapshot |

Reaching an endpoint does not prove all jurisdiction projects were individually verified. Historical records were not assumed current; program years were not treated as approval dates or construction milestones. Existing road/stormwater eligibility and expiration safeguards remain in place.

## Statewide source coverage

The [complete 76-area coverage table](NC-STATEWIDE-COVERAGE.md) lists all **24 municipalities and 52 counties** meeting the official NC OSBM Vintage 2025 population threshold. Each has an official planning, development or agenda reference. City and county coverage are tracked separately.

- **17 areas:** at least one tested development feed, with limited scope explicitly retained. This does not establish complete area coverage.
- **2 areas:** working agenda indexes only — Burlington and Kannapolis. Their links still require document extraction, verified project identities and meeting association.
- **57 areas:** official source candidates identified, but adapters, access verification, field mapping and dry-run validation remain pending. New candidates are disabled in the existing administrator source registry. They are not functioning automated coverage.
- The statewide directory incorrectly points Mecklenburg at the Charlotte website; the county reference uses Mecklenburg's own Land Use and Environmental Services page instead.
- Sanford's official page explicitly identifies the joint Sanford/Lee County planning service. It is recorded as Lee's reference without assuming the already-tested city feed covers the entire county.

## Still missing before activation

1. **57 area adapters and two agenda-extraction workflows.** The source table identifies each affected area and its official reference. Some are HTML pages or public portals, not APIs; they need a permitted, source-specific retrieval method.
2. **Restricted legacy feeds:** Burlington GIS, the original Cary API, and Kannapolis GIS still restrict automated retrieval. Those restrictions were respected. Cary has a working alternative; Burlington and Kannapolis have agenda indexes, not equivalent live GIS replacement coverage.
3. **Greensboro:** its approximately 59,000-row building-permit archive is supporting evidence, not a development inventory. The 150-record sample was retained; the remaining routine-permit archive was deliberately not bulk imported. Its official planning source is registered for a dedicated development adapter.
4. **Greenville:** the existing GIS layer is parcel/location data, so it was excluded from development discovery. A planning source is registered but still needs a project-specific adapter.
5. **Verification and meetings:** readable feeds frequently lack substantive event dates or whole-development status evidence. Agenda pointers are not confirmed meetings. Extraction and representative evidence review must precede publication approval.
6. **Incremental maintenance:** large historical case archives should use verified modification/date fields or stable-ID checkpoints for future changes; repeatedly rescanning every historical row is unnecessary. Initial inventory checks do not establish an unattended weekly maintenance benchmark.
7. **Budget:** 9,980 of the unchanged 10,000 monthly request reservations have been consumed. Reservations are conservative and include unused slots. No cap was increased or reset. Additional automated source tests must fit the remaining reservation capacity or wait for the next budget period.

## Reliability and the reported failure

The failed [app check](https://github.com/Deleuzebot/BuildWatch/actions/runs/40891896073) was an Expo dependency compatibility mismatch: React Native 0.88.0 versus required 0.88.1. The patch and lockfile were updated. The [replacement GitHub checks](https://github.com/Deleuzebot/BuildWatch/actions/runs/40892690191) passed, including Expo validation and exports.

The worker now supports bounded, transactional dry-run evidence batches, honors actual returned page cardinality, and processes the response from the last permitted HTTP request without making an extra request. Batching is restricted to dry-runs on sources without publication approval. Live publishing behavior was not enabled. Local verification: TypeScript and 117 tests passed.

**Automatic updates should remain off.** The readable feed checks are complete; statewide operational coverage and publication validation are not.
