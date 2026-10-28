# Major road projects — classification and cleanup

Applied October 26, 2026 to the local BuildWatch database after rehearsal on a database copy.

| Public map | Before | After |
|---|---:|---:|
| Qualifying road developments | — | 122 |
| Road developments archived in this cleanup | 403 | 0 visible |
| Other developments | 1,709 | 1,709 |
| Total | 2,234 | 1,831 |

All 13,060 underlying project records remain. No project JSON, revisions, source identifiers, meetings, follows, account permissions, project history, duplicate decisions, classification candidates or relationships were changed. Archive events and significance decisions were added. No merge or permanent deletion occurred.

## Inclusion policy

The backend examines the actual project name and construction description, rather than its address or category alone. Interstate references and budgets alone are insufficient. The policy retains substantial interstate reconstruction, capacity expansion, bridge replacement and interchange work. Non-interstate projects require stronger evidence: a primary highway and substantial capacity/corridor scope, a new grade-separated interchange, a new limited-access or regional connection, or a replacement bridge with explicit regional impact.

Corroborating scope includes multi-lane capacity and corridors of at least two miles. Where explicitly documented, a budget of at least $50 million together with at least 24 months of construction can corroborate primary-highway reconstruction; neither budget nor duration alone qualifies. Missing values are never invented. A traceable HTTPS source is required. A proposed future letting remains Proposed; this policy does not advance construction status or reset approval expiration.

Routine preservation, resurfacing, lighting, guardrails, signals, local intersection work, ordinary local bridges and insufficiently substantiated regional impact are excluded. Location clauses referencing an interstate interchange do not establish interchange construction. Non-road developments, standalone walking/cycling, rail and aviation are preserved, including records incorrectly tagged Transportation.

This is a conservative, deterministic scope screen using existing evidence. It is not an engineering assessment of every project's regional impact. Insufficient evidence results in a recoverable private record, not deletion or an invented finding of completion.

## Enforcement and recovery

- `server/roads/policy.ts` defines the versioned decision and reason.
- `road_project_policy` stores each road decision with its supporting scope and signals.
- Database triggers run on raw imports, editor changes and duplicate profile overrides. Nonqualifying roads are archived transactionally with reason `road_not_significant` and an `archive_events` entry.
- The public map's indexing predicate independently enforces eligibility. Removing an archive row alone cannot republish excluded roadwork. Map queries retain the existing spatial/FTS indexes, bounded clusters and state/status colors; classification is performed on writes, not for every viewport request.
- Authenticated administrators can find these records in **Archived Projects**, filter by **road not significant**, and inspect the road decision and original source links. Restoration is blocked while the scope fails the policy. Correct the project through the existing protected editor with sourced qualifying scope; automatic policy archives are cleared when the corrected scope qualifies. Other archival and expiration rules still apply.
- Existing source-ID duplicate prevention, manual merge confirmation and undo remain in place. This cleanup neither merges suspected duplicates nor automatically restores older archives for unrelated reasons.

## Backup and validation

Pre-change database: `../../work/road-policy/before-major-road-policy.sqlite` (private local backup). Rehearsal: `../../work/road-policy/rehearsal-release.sqlite`. Public decisions: `../../work/road-policy/public-audit.json`; counts: `../../work/road-policy/summary.json`.

All 74 tests passed, including scope, non-road preservation, direct import enforcement, overrides, recovery after scope correction, transaction rollback, reopening/idempotency, map clustering and existing merge/undo tests. TypeScript checking and web export passed. Live SQLite integrity/foreign-key checks passed and the public map API returned the expected 1,831 records.

The earlier NC coverage report predates this intentional road reduction. Its per-area counts must not be used as current coverage totals or as justification to reimport excluded roadwork.
