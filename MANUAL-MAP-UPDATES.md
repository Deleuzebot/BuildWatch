# Manual updates through Codex

BuildWatch now uses administrator-reviewed local research. Google Cloud deployment and unattended Monday/Friday discovery are deferred. No paid service or cloud scheduler was activated.

Ask Codex: “Check supported North Carolina sources and prepare proposed updates for administrator review.” Codex runs collection, refines source identities and status semantics, takes a backup, and imports review metadata. You do not need Terminal.

Sign in with your existing administrator account, complete MFA, and open **Admin Dashboard → Proposed Map Updates**. Guests and other roles cannot access its API. Review source fields and dates, filter or paginate the queue, defer/dismiss proposals, and inspect individual publication previews. Confirmation publishes one status or associated meeting update through the existing revision-checked project editor/history/notification infrastructure. Tokens expire, belong to the administrator, and cannot be replayed; changed records or decisions block stale approvals.

Meeting notices without a unique project match remain private. Enter the correct existing project ID and choose **Prepare meeting association**; inspect the resulting proposal and preview before publishing. Do not attach board-wide recurring meetings to arbitrary projects. If the physical development is not yet verified/mapped, create it through Edit Map first.

Discoveries are unclassified source records, not automatically approved new developments. Use the existing Edit Map editor after verifying scope, status, and coordinates. Several government records lack geometry; a missing pin must not be guessed.

For possible duplicates or supporting permits, enter an existing primary project ID and send the proposal to **Potential Duplicates**. This creates a private staged source if needed; it does not add a marker or merge records. Compare originals, select canonical fields, generate a merge/supporting-link preview, and confirm individually. Distinct / review-later decisions and dependency-safe undo remain available. Audit events and original source records are retained. No confidence percentage is invented.

All 969 original candidate pairs are retained in 586 connected groups. The 1,223 classification candidates remain in **Classification Review**, separately from duplicate decisions. No 98-project relevance migration is applied.

## Internal operator steps (Codex performs these)

Use the app's Node runtime with `--import tsx` and a writable temporary directory:

1. `scripts/check-nc-sources.mts`: read-only collection from supported official sources. Bounded retries, timeouts, ID-based pages, and conservative limits. Its raw results are unverified and must not be imported directly.
2. `scripts/refine-nc-proposals.mts`: exact full application matching, source-specific ambiguity checks, historical/supporting triage, cited-record checks for large datasets, and the current manually verified meeting review batch. The hardcoded hearing notice entries are a dated research batch, not a permanent meeting crawler; Codex must reverify/replace them for a future check.
3. Inspect `reports/manual-research/nc-reviewed-proposals.json`, source coverage and errors, before running `scripts/import-research-report.mts --review-only reports/manual-research/nc-reviewed-proposals.json`.
4. Import the existing duplicate/classification review metadata with `scripts/import-duplicate-review.mjs --apply-review-metadata` only when needed. Identical source evidence preserves earlier administrator decisions.
5. Run TypeScript, tests, and relevant exports; restart the local backend after backend changes. Never invoke proposal commit or merge endpoints merely to load a research batch.

Both importers back up SQLite first and compare protected original-table hashes after import. Research tables are private and do not invalidate public map caches. Source observations and preview decisions never trigger project notifications. Notifications follow existing preferences only after a deliberate publication; external push delivery still depends on its existing configuration.

The current review covers supported municipal trackers and selected official hearing pages, not every North Carolina project. The environmental-permit cohort is not sufficient evidence of physical construction or whole-development completion. Unknown, missing, closed, expired, or withdrawn applications retain their last map status. Blocked and incomplete sources are reported rather than silently treated as no activity.

The local app must run for browser preview and administrator review. Research runs only when requested through Codex; it does not run while your computer is off. Keeping the app publicly available still requires future hosting approval.
