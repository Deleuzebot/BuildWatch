# Private NC maintenance validation

The October 30 session is a one-time, explicitly authorized 500-HTTP/20-search validation, not a standing allowance. Its durable ledger and private evidence live outside Git in `work/buildwatch-live/manual-nc-live-statewide-20261030`. Once closed, do not reopen it or increase its limits. A subsequent live session needs its own authorization and reservation.

## Implementation

- `nc-private-maintenance-cycle.mts` reuses the existing worker with a local review-only RPC. It reads current Supabase identities, projects, history and policy, and persists checkpoints/evidence privately. No project write, archive or publish operation exists in that RPC.
- `incremental-query.ts` generates metadata-typed ArcGIS filters. Numeric row identifiers remain numeric; business application numbers are separate aliases; unsupported date types are never guessed. Date-window discovery is partial when undated records exist.
- Sources are capped at four pages per invocation. A saved continuation is partial work, not successful full-jurisdiction coverage. Current known project identifiers are included where a safe bounded query permits it.
- `nc-additional-sources.json` contributes the Union consolidated development inventory and a separate supporting rezoning feed to subsequent manual research sessions. Both remain disabled for production publication. County planning authority must not be assumed to cover incorporated municipalities.
- `nc-private-cycle-report.mts` does no government retrieval and reconciles cached observations against Supabase in an enforced read-only transaction. It separates historical observations, undated candidates, supporting records, exact canonical matches, duplicate milestones and private update previews.
- `nc-pdf-source-validation.mts` is a fixed-host, manually dispatched Linux document check. Its maximum eight actual requests are reserved from the same session ceiling before dispatch and imported afterward. There is no scheduler, database credential or publication path in that workflow.

## Safety and accounting

The HTTP ledger counts robots requests, failed attempts, redirects, retries and downloads before execution. A reservation for remote PDF work prevents local work from consuming those same slots. Finalization rejects outstanding remote receipts. Search queries have a distinct explicit ceiling; search-provider internal fetches are not observable as government HTTP attempts.

Never substitute the worker's cumulative row observations for newly discovered significant projects. The first historical Asheville scan exposed an unbounded pagination problem; per-source limits and metadata-backed query scoping now prevent it from dominating subsequent runs. Previously captured historical records remain cached, not published.

The current isolated Supabase audit uses the least-privilege maintenance credential, cloned production helper bodies and a rollback-only transaction. Its cached Apex baseline was revalidated after an unrelated, authorized three-project publication changed the database-wide checksum. The Apex project itself was unchanged; no assertion was removed.

## Remaining limitations

Source retrieval does not establish accurate decisions, current activity or complete jurisdiction coverage. Scanned PDFs need manual review; malformed PDFs remain rejected by the strict parser. Agendas, draft minutes, staff recommendations and application decisions need separate evidence scopes. Missing dates, multi-phase parent identities, parcel boundaries and source outages remain review items. Do not infer construction from issuance, cancellation from withdrawal, or completion from closure.

No new public status, description, location, expiration clock, notification or project record is authorized by this validation. Research previews are private local artifacts; they are not an approved production batch. Use existing authenticated administrator previews and guarded commit/rollback only after a separately authorized exact batch.

Before claiming statewide readiness, finish queued pagination, replace permitted broken sources, validate document-to-project associations, audit description proposals, and demonstrate repeated incremental checks. The 100-county/550-municipality inventory includes many merely identified sources and must not be presented as 650 working integrations. Leave publication, archival, legacy lifecycle adoption and scheduling off.
