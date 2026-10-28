# BuildWatch — Approved expiration and supporting-permit cleanup

Implemented and applied October 25, 2026. No project records were permanently deleted, and no recurring job or paid service was created.

| Result | Count |
|---|---:|
| Stored development records before cleanup | 11,945 |
| Stored development records after cleanup | 11,945 |
| Approved projects archived by the 365-day policy | 197 |
| Stormwater-only Approved records separately archived as supporting documents | 10,616 |
| Total newly archived Approved records | 10,813 |
| Approved developments remaining publicly visible | 343 |
| In Review developments remaining publicly visible | 264 — unchanged |
| Old Approved projects retained by documented construction schedules | 3 |
| Public developments eligible for map pins before → after | 11,940 → 1,127 |
| All archived records now stored | 10,818, including 5 earlier demo archives |
| Visible Approved records lacking a reliable approval date | 233 |
| All stored Approved records lacking a reliable approval date | 10,850, mostly the now-archived stormwater entries |
| Original duplicate candidates preserved | 969 pairs / 586 groups |
| Separate classification candidates preserved | 1,223 |
| Permanent deletions performed | 0 |

Public-project counts refer to eligible developments, not the number of cluster bubbles at a particular zoom.

## Why stormwater records disappeared

A stormwater authorization alone does not establish a separately verified community-facing development. Following your additional instruction, the 10,616 permit-only records were archived with reason `supporting_permit_only`; their original Approved status, descriptions, identifiers, source references, coordinates, and timestamps remain intact. Their effective dates were not misrepresented as development approval dates.

Existing verified public-facing developments remain separate from the supporting records. No speculative name/proximity match was automatically merged or linked. In **Admin Dashboard → Archived Projects**, open a permit and enter an existing public development ID to queue supporting-record review. In **Potential Duplicates**, choose the public development as canonical, preview **Link as Supporting Record**, and confirm individually. Both records and their provenance are preserved; the supporting permit does not need its own public marker.

If a permit actually represents an independently useful development, document its community-facing physical scope and approval/construction evidence, then use Restore Selected. Adding source documentation does not restore it automatically. Permit-only records cannot bypass this verification through an ordinary restore request.

## Approved-only expiration

The rule applies exclusively to Approved projects. Documented approval + 365 × 24 hours determines the expiration threshold, including equality at the boundary. Date-only approval evidence is treated as midnight UTC; explicit timestamp offsets are respected. Import, update, creation and stormwater-effective dates do not substitute for an approval action.

Future construction exceptions require a source URL, supporting field/passage, and a concrete construction date or bounded month/year range. A documented year is retained as a calendar-year range, not an invented exact start date. The range ceases to qualify when it has fully passed. Source publication dates are retained where supplied.

The three retained old approvals are:

- **Longleaf Trace:** Council zoning action April 17, 2024, with a 2027 completion year in the Town's affordable-housing funding table. [Council action](https://chapelhill.legistar.com/LegislationDetail.aspx?GUID=F2B4E4E2-AC78-4D21-896C-0FAD00C00218&ID=6615102) · [Town construction range](https://www.chapelhillnc.gov/Town-Services/Housing/Affordable-Housing/Affordable-Housing-Funding).
- **Smoky Hollow Park:** schematic approval May 7, 2024, with the City's revised construction period continuing through 2029. [City project schedule](https://raleighnc.gov/projects/smoky-hollow-park-project).
- **Tanyard Branch Trace:** zoning approval April 27, 2022; the Town documents construction starting within the 2026 calendar-year range. This exception expires when that range ends unless newer evidence is entered. [Approval](https://www.chapelhillnc.gov/Projects/Jay-Street-Affordable-Housing) · [Town timeline](https://www.chapelhillaffordablehousing.org/jay-street-affordable-housing-development).

The collection checked every Approved municipal record's cited structured source and the identified existing construction documentation. It accepted explicit approval fields and action dates with an actual approval event; missing, ambiguous, conflicting, unavailable or non-approval dates remain for administrative review. This is not an assertion that every possible external attachment or unpublished schedule was exhaustively verified. Administrators can add newer evidence and restore qualifying records.

In Review, Proposed, and Under Construction records were not expired. All 264 previously visible In Review projects remain visible. No project was marked Completed or Cancelled by this cleanup.

## Administrator archive tools

Open **Admin Dashboard → Archived Projects** after administrator sign-in and MFA.

- Search by project name, address or record ID; filter by state, county, municipality/jurisdiction, category, approval-date bounds and archival reason.
- Review original status, source documents, archive reason/time, approval evidence, construction schedules and archival audit events.
- Use the separate missing-approval-date review queue for publicly visible Approved records needing reliable evidence.
- Select individual records, all 50 on the current page, or all records matching filters across pages.
- Restore Selected checks current approval age, future schedules, community-facing scope, classification and relationships. Expired approvals cannot be restored by erasing an already documented approval date.
- Delete Selected Permanently prepares an exact selection snapshot and requires typed **DELETE**.
- Delete All Archived Projects has a distinct all-records scope, exact-count preview, separate scope acknowledgement and typed **DELETE**. It respects protected records; it never silently deletes active or In Review projects.
- Merged/supporting relationships block deletion until their dependencies are safely undone. Duplicate-review originals, including archived pairs, remain reviewable and reversible.

Deletion is operational and tested, but no deletion was initiated on the live database. The isolated UI preview selected 10,818 archived records, identified 10,817 eligible records and one protected earlier In Review demo, and remained disabled without the required confirmations. That preview was cancelled.

## Safety and performance

Both backups were taken before live cleanup. The backup immediately preceding application is recorded in [cleanup-result.json](reports/approved-expiration/cleanup-result.json). SHA-256 comparisons verified that projects, accounts, follows, follow history, project history, entitlements, invitations, submissions, notifications, devices, role audit, duplicate candidates/decisions/relationships and the original classification queue were unchanged. Original project rows retain fingerprint `df393ea73f00eecaaec6bb9f160e1095e14bae8a03dce8e66cb789c7c6bb6f66`. Foreign-key checks pass.

Archival state and approval documentation are separate database records. Archived records are excluded in backend SQL and derived indexes, not downloaded and hidden in the browser. Existing viewport loading, server clusters, search, state colors, meetings and versioned caches remain in use. Expiration is enforced on normal API requests through indexed queues and bounded materialization; live queries exclude newly expired records immediately even before all archival metadata is materialized. No scheduler, cron, cloud function, recurring internet scan or paid hosting was added.

Manually initiated bulk operations prepare selections and process small transactional batches using keyset cursors. They yield between batches, retain progress, recheck current administrator access and each record's eligibility, and do not rely on the browser remaining open. A backend restart leaves resumable manual work; the administrator can resume after the prior worker is inactive. Failures roll back the current batch and retain exact counts for any earlier committed batches. Stale, restored or newly In Review records are blocked rather than deleted.

Deletion removes only selected eligible archived projects and their owned references. Relevant follows, history, notifications and dependent private review records are handled transactionally. Unrelated projects, accounts, devices and shared externally hosted source files are preserved. Deletion timestamp, administrator, successful count and affected project IDs are retained in audit tables. Minimal deleted-ID tombstones prevent seed imports from republishing those IDs. No in-app undo is provided for permanent deletion; existing private backups may retain prior data.

Archiving improves map relevance, not database storage usage: all original records remain. Later permanent deletion frees SQLite pages for reuse; it does not promise an immediate reduction in the operating-system file size. File compaction is separate maintenance and was not run during this cleanup.

Backups permit operator recovery. Restoring pre-cleanup map visibility also requires coordinating a visibility-policy rollback; restoring an old database alone does not disable the newly implemented rules. Do not overwrite a running SQLite database or discard its WAL files while it is open.

## Verification

58 tests pass, including exact time boundaries, invalid/ambiguous dates, In Review exemption, dynamic expiration without a scheduled task, future construction exceptions, missing-date handling, stormwater classification, supporting links and undo, restore safeguards, typed deletion confirmation, cross-page selection, distinct all-archived scope, stale-selection protection, deletion audit/foreign keys, transaction failure rollback, current administrator/MFA checks, public map counts/search/clustering and the existing account features.

TypeScript and web/iOS exports pass. Live API checks confirm 1,127 represented developments, one existing public meeting, archived project detail URLs returning 404, future-schedule exceptions remaining Approved and public, and the archives endpoint rejecting guests. Administrator controls were also exercised in a separate local test database. These exports are not a signed TestFlight build or a physical-iPhone test.
