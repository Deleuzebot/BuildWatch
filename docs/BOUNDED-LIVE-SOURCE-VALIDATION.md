# Bounded live-source validation

The manual pilot scripts are separate from publication and scheduling. They cannot call a project mutation, expiry, merge or lifecycle-adoption API.

`scripts/nc-live-source-pilot.mts` captures actual HTTPS responses for the existing Apex service and evaluation-only Chapel Hill/Raleigh services. It requires a private approval receipt recording an explicitly authorized 20-request reservation within the existing monthly allowance. It never increases or self-authorizes a budget. The current pilot session is closed; creating another live session requires fresh authorization and a reserved allowance.

`LiveValidationSession` counts every HTTP attempt before sending it, including robots, retries and redirects. The cap is 20. A persistent ledger and exclusive capture lock prevent restarts or overlapping processes from silently resetting it. Runtime, byte limits, HTTPS/DNS checks, timeouts, rate limits and source access restrictions remain enforced by the existing `SourceHTTP`/`ResearchReader` implementation. Same-session robots results may be reused for one hour; explicit restrictions and the existing narrow unavailable-policy rules are preserved. Failed/stale locks require inspection, not automatic deletion and restarting.

Raw evidence and the ledger stay outside the repository. Successful responses retain source URLs, retrieval times and integrity hashes. Replaying this session's evidence is identified as replay; it is not reported as another live verification. A closed session cannot request a new URL.

`scripts/nc-live-source-report.mts` reads those responses and compares identities, sources, milestones, archive state and policies in a PostgreSQL **read-only transaction**. It verifies the immutable production baseline before and after. It uses exact source references or corroborated official project-page/address relationships, and keeps name/address/proximity-only candidates unresolved. Report generation makes no government HTTP requests. The server-only local database credential is reused; it is never uploaded to GitHub or exposed to clients.

The report preserves application-level decisions separately from parent-development status. Chapel Hill's combined stage and undated completion labels require review. Raleigh records are supporting evidence only: permit issuance, finaling, voiding, occupancy and closure do not establish whole-project construction, cancellation or completion. Narratives and scope checks override unreliable mapped class/size fields; routine repairs and private residential amenities do not create markers. New-significance thresholds here select pilot evidence, not a replacement for nationwide eligibility policy.

Private outputs:

- `reports/maintenance/nc-live-source-pilot.json`: per-record evidence, matches, decisions, uncertainty, request ledger and an unapplied manual batch preview.
- `reports/maintenance/NC-LIVE-SOURCE-PILOT.md`: full evidence report.

No new source is registered for automatic publication. The scripts are not attached to a schedule or a live GitHub workflow. A future manual cloud pilot needs an appropriate least-privilege read-context path and a separately approved request allocation; the current worker credential is not replaced by an owner credential.

Regression tests exercise persistent request exhaustion, overlapping capture rejection, closed-session behavior, access-policy caching, real-world mapping patterns, principal construction scope, dated application decisions and scheduled-hearing extraction. Test HTTP transports are synthetic and do not consume the live research allowance.
