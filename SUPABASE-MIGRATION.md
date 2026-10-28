# Supabase migration — October 27, 2026

BuildWatch now uses Supabase as its cloud backend. Auth0 remains the identity provider. The local preview serves static files only; it does not open SQLite or execute background workers.

- All 64 migrated application tables matched their original row counts and content digests before cutover.
- Preserved 13,060 projects, 13,145 history entries, 969 duplicate pairs, and 1,223 classification-review candidates. The public map still contains 1,831 eligible projects.
- Database footprint measured after deployment: 101,258,931 bytes (about 101 MB / 96.6 MiB). The organization remains on Free.
- No scheduled jobs were installed or enabled. The automation settings remain paused; no cron job table is installed.
- Auth0 access tokens are verified by the deployed Edge Function. Administrator permissions and MFA are checked by PostgreSQL.
- Merge, supporting links, undo, stale-preview protection, failure rollback, following, corrections, invitations, archive operations, and anonymous-access restrictions passed cloud database regression tests. Fixture changes were rolled back.
- All 86 application tests and TypeScript checks passed. Web and iOS exports succeeded.
- 46 live HTTPS smoke checks passed, including all status/type/activity filters, project details, meetings, state boundaries, bounded clusters, forged-token rejection, and privileged-RPC denial.
- Browser checks verified map loading, search, category filters, marker popup, project details and Auth0 MFA entry. The owner completed MFA successfully; the live dashboard recognizes the existing administrator and loads 586 duplicate groups / 969 pending pairs.

Billing and device push remain disabled pending their original external setup and testing. In-app notifications remain available. Static public website hosting, an iOS store release, and a desktop installer are separate distribution tasks.

Original SQLite files and migration snapshots remain intact for recovery. Do not reimport stale local data over subsequent cloud edits.

See [SUPABASE-OPERATIONS.md](SUPABASE-OPERATIONS.md) for deployment, security, recovery and Free-plan constraints. The original pre-cutover audit is retained in [SUPABASE-MIGRATION-INITIAL-AUDIT.md](SUPABASE-MIGRATION-INITIAL-AUDIT.md).
