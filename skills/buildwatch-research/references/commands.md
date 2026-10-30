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

A cached packet has `format` (`arcgis`, `html`, `pdf-text`), `url`, `observedAt` (original cached retrieval time), and `body` (the original JSON/HTML or extracted PDF JSON string). Optional `context` maps source external IDs to existing protected Supabase lookup results. Preserve the context's retrieval provenance. Raw PDFs must first use the existing bounded Linux `extractAgendaPDF`; do not bypass its platform or resource checks.

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
