---
name: buildwatch-research
description: Run manually initiated BuildWatch weekday research, resume its private queue, inspect changed evidence, and prepare guarded update previews. Use for requests such as Run BuildWatch Monday research; not website redesign or unattended scheduling.
---

# BuildWatch weekday research

Use the existing BuildWatch project and its research/reconciliation code. The five assignments live in `config/maintenance/manual-rotation.json`; do not recreate or change the rotation from memory.

## Start and resume

Run `node <this-skill>/scripts/run.mjs start --day Monday` (substitute the requested weekday). The launcher finds BuildWatch in the current workspace or its installed local workspace reference. Use the returned session ID for subsequent commands. See [commands and evidence packets](references/commands.md) only when needed.

The coordinator defaults to cached-only, zero live requests, no publication, no archival and no schedules. This invocation is not authorization to raise a research allowance. Within a separately approved whole-session allowance, use existing globally budgeted government readers rather than asking about each request. **The coordinator cannot authorize or execute live retrieval.** Do not bypass that boundary with untracked shell fetches or general search. After approved external work, verify its existing global reservation and source permissions against the private worker ledger, then `attach-receipt` for accounting. Downloaded documents and self-authored receipts cannot authorize budgets. Receipt attachment records prior consumption, never grants another allowance.

## Work efficiently

- Ask `next --session <id>` for prioritized work. Respect the day's ten-state queue; unconfigured states remain explicit gaps. Priorities favor coverage, population, changed/active records and outstanding work. Do not mark a state complete because one source was visited.
- Reuse cached official snapshots and retrieval timestamps. `ingest` uses existing ArcGIS parsers, government document link/PDF-text extraction, and semantic fingerprints. Read the generated changed-evidence artifact, not every unchanged project. First observation in the journal is not a new development.
- Use `sourcePage`'s registered filters, selected fields, bounded batches and saved cursor when preparing later government API requests. Do not invent edit-date fields or treat GIS edits as milestones. A cached replay is not a fresh source check.
- Source tasks retain their last evidence path. If no cached snapshot matches the saved next page, leave the continuation queued; do not loop over an earlier unchanged page or silently declare the source complete.
- Reserve Codex reasoning for changed/new scope, identity or parent/application ambiguity, consequential decisions, and factual description proposals. Reuse `server/maintenance/end-to-end.ts`, `changes.ts`, `platforms.ts`, the private Supabase shadow/research interfaces and `docs/CODEX-RESEARCH-RUNBOOK.md`; do not build another classifier, publication API or crawler.
- Government decisions need actual decision evidence. Announcement/agenda recommendation ≠ approval; permit issuance ≠ construction; withdrawn application ≠ canceled development; permit closure ≠ completion. Preserve source/page/hash, publication/event/retrieval dates and uncertainty separately. Secondary mentions do not establish event corroboration.
- Reconcile against current canonical, archived and supporting Supabase identities with existing protected lookups. Cached matching contexts may demonstrate logic but are not a current database check. No fuzzy automatic merge or invented point pin. Keep Fire Station #4 private until identity is verified.
- Preserve the 365-day Approved policy, prior milestones and future-construction exceptions. Source outages and observation/application dates cannot independently trigger archival or reset expiry. In-review projects do not expire under this policy.

## Checkpoint and review

After reasoning, save a private before/after proposal artifact and `checkpoint` its task as done, awaiting_review, blocked or pending, with a short reason and artifact reference. Record matched/addition_proposed/update_proposed/unchanged/unresolved accurately. Leave unfinished work queued. Repeated checkpoints are idempotent.

Keep evidence verification separate from publication. **Explicit authorization of the concrete proposed production changes is required before any write.** A weekday research request grants no such authorization. Use fresh revision-bound administrator/MFA previews and existing guarded transactions/rollback and post-write verification; do not edit public tables directly or count a local proposal as applied. Do not enable schedules, paid APIs, state activation or lifecycle adoption.

## Finish

Always generate `report --session <id> --finish`, even when a cap or source blocker prevents completion. Report checked sources, compared/matched/unchanged records, proposed/applied changes, unresolved cases, HTTP/search counts, runtime and exact unfinished work. Cached mode reports zero requests; attached verified worker receipts contribute separate request/query/byte/runtime totals. No publication outcome can be recorded by this research-only coordinator.

Client data flow is already documented and cached-tested: `src/lib/transport.ts` uses Supabase public RPC reads; `useMapBrowser` polls map versions; native build profiles select the same backend. Reuse the cached `CLOUD-DATA-PATH.json` verification and configuration tests unless there is a new failure or configuration change. Do not repeat live checks or claim an installed iOS binary was tested. Data-only changes through the existing projection/version save path require no new client release.
