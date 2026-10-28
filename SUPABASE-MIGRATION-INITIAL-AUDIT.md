# Supabase migration status — October 27, 2026

## Current status: verified cloud copy, NOT a live database cutover

Project: `iuchstlnusdnserweutj` (existing Free project, us-east-1).
The cloud import has committed after matching every imported table's count and
row-content digest. SQLite remains the live application's database. The native
PostgreSQL connection and map query implementation are available, but the
administrator/account/merge/archive write services have not yet been ported.
Do not claim the app is using Supabase as its permanent primary database yet.

Local edits made after this snapshot are not automatically synchronized to the
cloud copy. The importer refuses to overwrite a different or subsequently edited
destination. A later cutover needs an explicit final-delta migration under a
write freeze, with conflict checks and another validation pass.

## Architecture audit

The original database is `server/data/projects.json.sqlite` (119.91 MB after
lossless classification compaction). `server/data/projects.json` and TypeScript
seed data are legacy import inputs, not the live source of truth.

`server/accounts/store.ts` owns a synchronous node:sqlite connection. The HTTP
server in `server/server.ts` constructs it; account/admin routes, duplicate,
research and archive services depend on synchronous SQL operations and nested
savepoint semantics. There are 273 database-call references across the server.
A connection-string replacement would break those services. The safe remaining
port is asynchronous transaction-scoped PostgreSQL repositories, retaining
existing Auth0 authorization and API contracts. A synchronous network shim or
silent SQLite/cloud dual-write fallback was deliberately not introduced.

The complete actual schema inventory is in
`server/postgres/migration-manifest.json`: 64 application/derived tables,
their original column names, and preserved rowid requirements. SQLite FTS5/RTree
internal tables are excluded; all original project records, archives, policy
evidence, accounts, notifications, audit logs and review queues are included.

Key relationships:

- `projects` retains original JSON and revisions; `project_overrides` retains
  administrator merge/editor overlays. Their original JSON text is preserved
  exactly. PostgreSQL can compress text with TOAST without rewriting the payload.
- `project_categories` supplies standardized labels without changing original
  municipal/source data. RFC 7396 JSON merge behavior is implemented explicitly;
  a simple JSONB concatenation would mishandle null-valued keys.
- `project_relationships`, duplicate candidates/decisions/previews and group
  members preserve canonical IDs, supporting links, preview signatures and undo
  snapshots. No merge decisions were applied by this migration.
- Meetings remain embedded in project JSON; `map_meetings` is the bounded public
  query projection. Meeting references in notifications are separate and retained.
- `history`, follows/follow history, notifications/deliveries, entitlements,
  invitations and submissions retain their IDs and existing relationships.
- Archive, approval expiration, road eligibility, classification review,
  research proposals and automation state/audit tables are preserved unchanged.
  No Monday/Friday jobs were activated.

Creation and edits currently use `Store.publish`: optimistic revision check,
transactional history and notifications, and derived SQLite triggers. Merge/undo
uses overrides and preserved original records. Archive services use reversible
archive records; explicit permanent-deletion operations have separate audits and
reference checks. None of those operations were executed by this migration.

The frontend uses the existing paginated map/catalog/browse/project endpoints.
SQLite currently applies indexed filters and spatial bounds, then aggregates
Mercator grid cells server-side with at most 512 nodes. The PostgreSQL map class
preserves the same grid algorithm, cursor IDs, filter semantics, status colors,
state grouping and response types. It uses PostGIS GiST for viewport queries and
pg_trgm GIN for literal substring search. It avoids per-marker title queries.
No nationwide catalog is loaded into the frontend.

## Implemented database/tooling

- `server/postgres/connection.ts`: native async `pg` pool (maximum 3 by default),
  verified TLS, bounded connection/statement timeouts, transaction connection
  ownership via AsyncLocalStorage, no client-side credentials.
- `001-tables.sql`: actual tables, primary/unique/check constraints, 34 deferred
  foreign keys, original indexes, BIGINT millisecond timestamps, private schema,
  and RLS on every table.
- `002-views.sql`: compatible source/profile/public/archive/active-map views and
  standardized category, state, municipality, county and status indexes.
- `003-spatial.sql`: PostGIS and pg_trgm, generated point column, spatial and
  trigram indexes. Both extensions are database capabilities, not extra hosting.
- `004-geometry-view.sql`: idempotent view repair for the first staged import;
  future fresh imports create geometry before views so it is included directly.
- `005-active-index.sql`: indexed active visibility checks without re-parsing
  the entire source JSON catalog. Profile JSON is resolved once per bounded
  candidate page, preventing poor planner choices for selective type filters.
- `migrate.ts`: repeatable snapshot importer, bounded batches, exact row counts
  and digests, deferred foreign-key validation, structural public-payload parity,
  stable project/decision rowids, advisory migration lock and atomic commit.
- `scripts/postgres-migrate.mts`: consistent SQLite recovery snapshot before
  every attempt, one cloud transaction, machine-readable report, no secret logs.
- `scripts/postgres-verify-map.mts`: comparison of SQLite/Postgres filters,
  search, activity, cluster membership/counts and meetings, plus private access.
- `scripts/postgres-rehearsal.mts`: real dataset migration in local PostgreSQL
  (PGlite), including repeat-import validation. It does not provision services.

Supabase's session pooler defaulted `extra_float_digits` to 0. That rounded map
coordinate output and caused the first imports to fail verification and roll
back. Connections now explicitly set it to 3 so IEEE-754 values round-trip
exactly. No tolerance was used to silently accept changed source coordinates.

## Security and configuration

The ignored, mode-0600 `.env.supabase` holds the database password. `.env*` files
are excluded by Git and Docker rules. Only `.env.supabase.example` is distributable.
No Supabase secret or database password is referenced from the Expo app.

The private `buildwatch` schema is not exposed through Supabase Data API.
`anon`, `authenticated` and PUBLIC have no schema/table access. There are no
anonymous RLS policies granting access to private tables. Public information
must be served through the existing backend's authorized/filtered API after
the backend port. Existing Auth0 issuer/audience/JWT verification and administrator
MFA checks remain unchanged. Supabase Auth has not replaced Auth0.

The staging/migration connection uses the project's database-owner login. Before
live backend cutover, provision a separate least-privilege server login limited
to the private application schema and switch runtime credentials to it; keep
schema-migration privileges separate. Do not expose owner credentials to clients.

The official CA came from the Dashboard → Database → Settings → SSL certificate
download link. Certificate/hostname verification is enabled, never bypassed.
Use the free session pooler on port 5432 for IPv4; no paid IPv4 add-on is needed.

Because a database password was pasted into chat, rotate it in Database Settings
after this work and update only the local ignored file. The operator should
perform credential changes themselves. No password is included in this report.

## Verification and rollback

Successful cloud import: **13,060 projects; 13,145 history rows; 1,831 public
projects; 64 tables with matching counts/digests**. Whole PostgreSQL database size
immediately after import: **98,662,067 bytes (98.66 MB)**, including Supabase's
existing system data. No records were deleted, reclassified, expired or merged.

83 automated tests and TypeScript checks passed. Live PostgreSQL verification
matched all 17 tested status/type/search/activity combinations, map cluster
memberships/counts, bounded marker responses, meeting totals and private-table
access. After query tuning, combined browse/map parity cases took about
186–379 ms over this connection (not a nationwide-scale load test). A sample
indexed type-count query executed on the server in about 2 ms. The first
untuned queries were much slower; those were not accepted as cutover-ready.

Reports and consistent SQLite recovery snapshots are under
`../../work/supabase-migration/`; reports contain hashes/counts, not private row
payloads. Source SQLite and the prior local backups remain available. Extra
rehearsal snapshots consume local disk but are not part of the hosted quota.

Current rollback is simply the unchanged running SQLite app: there has been no
cutover. For a future cutover, first freeze writes, snapshot/export cloud data,
validate the final delta, switch one backend provider, and smoke-test all routes.
Do not silently fall back to writable SQLite after cloud writes begin: that
would create divergent histories. A cloud outage should fail closed for writes.
Rollback after live cloud writes requires reconciliation/export of those writes.

Do not enable primary Postgres mode until project creation/editing, category and
road projections, evidence-only activity, expiration, all account features,
Auth0 permissions, duplicate preview/merge/supporting/undo, archive operations,
correction moderation and notification deduplication pass on PostgreSQL.

## Free-plan boundaries and hosting

No plan upgrade, paid add-on, cloud API hosting or scheduler was created.
Supabase Free currently includes 500 MB database storage and 5 GB egress; check
the project usage dashboard as imports, users and history grow. The current
dataset fits; nationwide million-record coverage will not fit that allowance.
PostGIS indexes, audit history and archived records still consume database space.
Free projects can pause from inactivity; connection limits and shared resources
also constrain workload. The pool is intentionally small and there is no
keep-alive schedule to circumvent pausing.

Database hosting does not host `server/main.ts` or the Expo web build. Even after
backend cutover, the existing local API/website still needs an approved always-on
host to work while the personal computer is off. No such host was deployed.

Official references:
- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://supabase.com/docs/guides/platform/ssl-enforcement
- https://supabase.com/pricing
