# Commands

Use the project's Node 22+ runtime. If `node` is absent from the tool environment, use the bundled workspace runtime. The user does not need Terminal.

```text
node <skill>/scripts/run.mjs start --day Monday
node <skill>/scripts/run.mjs next --session <returned-id> --limit 5
node <skill>/scripts/run.mjs ingest --session <id> --task <task-id> --file <cached-packet.json>
node <skill>/scripts/run.mjs checkpoint --session <id> --task <task-id> --file <decision.json>
node <skill>/scripts/run.mjs attach-receipt --session <id> --file <verified-worker-receipt.json>
node <skill>/scripts/run.mjs report --session <id> --finish
```

`start --id <existing-id>` resumes an unfinished session. Finished/expired sessions retain their queue; start a new manually named session with `--id` to continue. This grants no live request allowance. No `apply`, `publish` or schedule command exists.

A cached packet has `format` (`arcgis`, `html`, `pdf-text`), `url`, `observedAt` (original cached retrieval time), and `body` (the original JSON/HTML or extracted PDF JSON string). For bounded latest-record samples, add `snapshotOnly:true`: this compares semantic fingerprints while preserving the full-scan cursor and leaving continuation pending. Never advance a keyset scan using a date-ordered sample. Optional `context` maps source external IDs to existing protected Supabase lookup results. Preserve the context's retrieval provenance. Raw PDFs must first use the existing bounded Linux `extractAgendaPDF`; do not bypass its platform or resource checks.

`ingest` returns a private changed-evidence file. Use existing Supabase reconciliation against only those changed IDs. For ambiguous records, keep an awaiting-review decision instead of repeatedly downloading the same evidence. Description changes and additional phases still require evidence and scope review.

A decision JSON has `status` (`pending`, `awaiting_review`, `blocked`, `done`), `note`, optional `outcome` (`matched`, `addition_proposed`, `update_proposed`, `unchanged`, `unresolved`), optional `matched` boolean and `proposalRef`. Proposed changes require a private preview reference. Applied/publication outcomes are rejected.

The journal is private at `work/buildwatch-manual-research/checkpoints.sqlite` relative to the task workspace; it contains metadata/cursors/fingerprints/references, not a second project database. Reports and evidence files stay in ignored `reports/manual-research/<session>/`. Do not commit the journal, credentials, approval receipts or private evidence. Keep session IDs and file references returned by the tool rather than deriving them from prose.

`attach-receipt` imports accounting only after the agent verifies an existing authorized worker's ledger. The receipt contains `runId`, `state`, `dryRun:true`, `productionUnchanged:true`, `publication:false`, `archival:false`, `scheduling:false`, `reservation:{reference,maxRequests,maxQueries}` and `stats:{requests,searchQueries,downloadBytes,seconds}`. Preserve the original private receipt reference. Counters must be bounded nonnegative integers and within the existing reservation; duplicate run IDs are idempotent and conflicting receipts are rejected. This records no authorization, executes no requests and changes no global budget. Do not use a historical run as consumption of the current session.

Useful existing resources (relative to BuildWatch):

- `config/maintenance/nc-statewide-inventory.json`: coverage evidence and gaps, not enabled sources.
- `config/maintenance/nc-registry.json`, `nc-mappings.json`, `nc-platform-plan.json`: registered URLs, mappings and tested candidates.
- `server/maintenance/research-reader.ts`, `http.ts`, `live-session.ts`: counted retrieval, access controls and existing bounded capture.
- `scripts/nc-evidence-shadow.mts`: private Supabase reconciliation under its existing manual reservation; do not call during cached-only sessions.
- `scripts/preview-manual-nc-research.mts`: cached guarded Apex example; it does not publish.
- `scripts/verify-guarded-milestone.mts`: optional read-only database verification after relevant authorization; do not run for every unrelated session.

## Explicitly authorized live NC pilot

`live` delegates to `scripts/buildwatch-live.mts`; it requires server-only Supabase access and refuses a scheduled invocation or enabled production gates. The current bridge supports a maximum 50-HTTP/four-search manual NC approval, never recurring authorization. Save the exact user's instruction in a private approval JSON (`id`, `state:NC`, `maximumRequests:50`, `maximumSearches:4`, `approvedAt`, `userInstruction`, and `publication`, `archival`, `scheduling`, `paidServices` all false). Initialize once, then resume the same run ID:

```text
node <skill>/scripts/run.mjs live init --run manual-nc-live-<id> --approval <private-approval.json>
node <skill>/scripts/run.mjs live fetch --run <id> --plan <private-url-plan.json>
node <skill>/scripts/run.mjs live reserve-search --run <id> --query <query>
node <skill>/scripts/run.mjs live record-search --run <id> --id <returned-number> --file <private-search-results.json>
node <skill>/scripts/run.mjs live receipt --run <id> --finish
node <skill>/scripts/run.mjs live guard --run <id>
```

A URL plan is at most 20 `{key,url}` entries. Fetches use the existing permission-aware, SSRF-protected reader and cached responses; the ledger persists across commands. Reserve each search **before** calling the search tool, then preserve its results. Search-provider internal HTTP cannot be observed and is disclosed separately; fetching cited pages must use `live fetch`. Never call another search after four reservations. Stop safely at the HTTP cap, including robots/retry overhead.

Use `scripts/plan-manual-nc-live.mts` only with captured official metadata to prepare bounded API queries, and `scripts/reconcile-manual-nc-live.mts` to compare captured records against current canonical/archived Supabase identities, history and pending proposals in a read-only transaction. Latest-record snapshots are samples, not complete keyset scans: reconciliation may sort a copy to validate unique IDs but must not advance a full-scan cursor from date-ordered samples. Neither script publishes. Keep ambiguous application phases and missing dates private. `receipt --finish` closes further HTTP/search use and fixes the final usage receipt. Finish with a field-level before/after preview and the receipt; verify unchanged production hashes, then attach accounting to the manual session. Do not commit private captures or credentials.
