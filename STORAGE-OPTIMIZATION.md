# Storage optimization — October 27, 2026

Applied locally before any Supabase migration. No records or history deleted.

| Metric (decimal MB) | Before | After |
| --- | ---: | ---: |
| Logical SQLite database, including committed WAL pages | 138.95 | 119.91 |
| Classification table allocation | 25.10 | 6.75 |
| Original project table allocation | 48.30 | 48.28 |
| Complete history table allocation | 48.83 | 48.83 |

Permanent logical storage savings: **19,034,112 bytes (19.03 MB, 13.7%)**.
Classification payload alone fell from 20,753,099 to 6,256,266 bytes.

The former full classification-input JSON is now represented by SHA-256 in
`project_categories.input` and `classification.inputFingerprint`. Source title,
description, municipal category and other inputs remain in original project or
override records. Classification labels, secondary categories, subtypes, reasons,
rule versions and timestamps were preserved without reclassification.
Future import/update triggers use the same compact representation. Status-only
updates still do not recompute categories. Migration is transactional/idempotent.
The migration temporarily removes and restores only the category-to-map update
trigger inside its transaction: no searchable field changes, so no full-map
reindex is needed. VACUUM then compacts SQLite without pruning records.

Verification compared every stored table, including search/spatial internals,
before and after; only the intended classification representation and migration
marker were normalized for comparison. Public project/profile data were also
compared excluding internal input/fingerprint representation. All comparisons
matched. Counts remained 13,060 projects, 13,145 history rows, 1,831 public map
entries. Integrity and foreign-key checks passed; 81 tests and typecheck passed.

WAL was checkpointed to zero during offline maintenance. Its prior 26.38 MB
file is operational transaction storage, not permanent application-data savings;
it can grow again during normal use. The remaining unused page space is largely
SQLite row/overflow-page packing; VACUUM did not reclaim it all.

Recovery snapshots and machine-readable comparisons are in
`../../work/storage-optimization/`: `pre-apply.sqlite` is the fresh pre-apply
recovery backup; `final-report.json` contains per-table hashes/counts/page sizes.
These extra backups and rehearsal copies increase local workspace usage and
are not part of the live database or a future hosted database quota.

History deduplication was intentionally deferred: preserving audit/merge/undo
semantics requires a separate version-reference migration, not pruning snapshots.
PostgreSQL compression and native indexing must be measured during a test import;
this SQLite reduction does not guarantee the same PostgreSQL savings.

Maintenance tools (server must be stopped; make a consistent backup first):

- `scripts/compact-storage.mts DATABASE_PATH`: refuses missing paths, initializes
  the storage migration, checkpoints WAL and compacts the database.
- `scripts/verify-storage.mts BEFORE_PATH AFTER_PATH REPORT_PATH`: read-only
  row/hash and integrity comparisons; writes only the requested report file.

No Supabase services, cloud deployment, paid resources or schedules were activated.
