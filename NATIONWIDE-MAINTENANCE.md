# Nationwide research and maintenance — audit and operating guide

Prepared October 28, 2026. Live schedules, project writes, additional states, and AI remain **off**. This is a bounded pilot implementation, not a claim that every jurisdiction is covered.

## Architecture audit

- Supabase PostgreSQL is the live backend. Initial audit: 101,676,723 bytes (97.0 MiB), 13,060 underlying projects, 1,831 map records, 969 duplicate pairs. The original SQLite databases/backups are retained locally.
- Existing curation resides in src/data and server/imports; scripts/check-nc-sources.mts and server/research/web.ts used local SQLite and interactive Codex searches. Those scripts remain available but are not used by the new worker.
- Projects retain JSON profiles, revision numbers, original source URLs/identifiers, normalized categories, indexed map projections, documented activity events, source bindings, editing history and archive policies.
- Category normalization, road significance, validation, derived events, bw_publish, notifications, map projection updates, duplicate review and archive recovery are reused.
- Existing duplicate review has exact/manual evidence plus candidate grouping. Name/proximity are leads, never merge authority. The 969 pairs remain unresolved and available; no community-relevance bulk migration was applied.
- Approved expiration uses documented approval evidence, not download dates. Under-review projects do not expire. Future construction evidence protects eligible approved projects. Unknown/absent websites do not establish completion.
- The old research code relied on Codex for source discovery, reading complicated documents, assessing context, and supplemental web searches. GitHub cannot use an interactive Codex chat as its unattended research engine. Structured adapters replace only deterministic portions; unsupported documents and ambiguous claims are queued.

## Implemented worker

Node.js/TypeScript runs in GitHub Actions and connects directly to the existing Supabase session pooler over verified TLS. No Express server or Google Cloud hosting is required.

- Initial mode is manually initiated and reprocesses configured sources; weekly mode uses conditional requests and document hashes.
- The fixed 50-state rotation is centralized in server/maintenance/policy.ts. NC is the only initially active state. The GitHub cron is commented out: 17 5 * * 1-5 with timezone America/New_York. GitHub now supports timezone-aware schedules; this handles DST. Scheduling can be delayed and is not an exact-time SLA.
- Persistent run checkpoints, leases, document hashes, source failures, findings, immutable mutation snapshots and monthly budget reservations are stored in private maintenance tables.
- No overlapping worker leases. Completed cycle keys are idempotent; interrupted runs keep checkpoints. Explicit manual keys identify independent pilots; retries of the same key resume. Scheduled recovery can resume earlier incomplete state work.
- Default state ceiling: 240 seconds, 80 source requests, 1,000 records, 20 MB downloaded. Maximum configurable: 900 seconds, 300 requests, 5,000 records. A complete workflow has a 20-minute GitHub limit and a 15-minute worker ceiling. Monthly reservations stop at 1,200 worker minutes / 10,000 source requests; reservations are deliberately conservative, including failed attempts.
- Government requests use bounded retries, backoff, per-source delays, HTTPS origin restrictions, bounded response sizes and robots-policy checks. A denied/unavailable source is reported, not bypassed.
- Source registry bootstrapping found 31 existing structured source endpoints and 2,242 exact record references. This is configured-source coverage, not comprehensive NC coverage. All sources start review-only until their field semantics, scope and coordinates are validated. Source lookup does not silently turn a permit into a development.
- Whole-development status, principal land use, an exact dated milestone, traceable evidence, point location, meaningful scope and existing validation must pass before a source approved for publication can publish. Completion/cancellation require administrator confirmation. Supporting records, road maintenance and unresolved stormwater records do not automatically publish.
- Existing fields and history are preserved. No automatic project merges occur. Cross-source name/address/location matches queue possible duplicates; existing archived/deleted/terminal records are excluded from republishing.
- Existing project changes are limited to verified milestones/meetings and keep original identity fields. In-app notifications reuse the existing deduplicated notification path. Push delivery remains separately configured.
- Every cycle captures a small mutation/provenance quality sample. This is an audit aid, not a guarantee of extraction accuracy.

## Pilot and tests

- Local dry-run against Hickory: a 50-record cap stopped safely and retained a checkpoint. A later bounded pass processed 70 additional source records while recognizing an unchanged cached page; 17 exact project matches were checked on that pass. It used 4 government requests, about 116 KB downloaded and 6 seconds of worker time. No public projects changed.
- Cary access policy denied automatic API retrieval. The run was marked partially completed, and the source failure is visible. Do not interpret this as a successful Cary scan.
- 97 unit/integration tests passed at implementation time.
- Transactional fixtures test restricted worker/admin access, password-only denial, inactive states, overlapping leases, idempotent insertion/history, undo, archived reimport exclusion, expiration, future schedule protection, in-review protection, existing archive recovery and checkpoint retries. Fixture changes are rolled back.
- GitHub pilot status and runtime are recorded separately in reports/maintenance/latest.json and the Actions execution history. Local results alone do not establish GitHub connectivity.

## Administrator interface

Admin Dashboard → Automation Management shows state activation, planned local schedule slots, live schedule/write gates, source coverage and failures, execution status, checked matches versus source records, changes, archives, review findings, AI reservations, runtime/request totals, database size and recent quality samples.

Only an administrator with MFA can read or change these controls. Additional-state activation and schedule resume remain blocked until pilot approval. Pause closes schedule/write gates. State budgets can be reduced or adjusted within server-enforced ceilings.

Queue weekly/initial dry-runs or retry an interrupted state from its checkpoint. A queued request requires the GitHub runner: Actions → BuildWatch state research and maintenance → Run workflow → enable queued_requests. This dashboard does not contain a hidden personal GitHub token or pretend a queued request has executed.

Use the existing Proposed Map Updates, Potential Duplicates and Archived Projects screens for evidence review, merging/supporting links, history and recovery. No existing duplicate pair was automatically merged. Undo refuses to overwrite later edits. Expired archive recovery requires corrected evidence through the existing archive workflow; it cannot bypass the 365-day policy.

## Secure GitHub and Supabase setup

Repository: https://github.com/Deleuzebot/BuildWatch (public, as requested).

1. Repository code must exclude .env*, local SQLite, backups, node_modules, deployments, reports and authentication files. Public client IDs / publishable Supabase keys are expected; passwords, service-role keys and OAuth tokens are not.
2. Apply the additive maintenance migrations to the existing project only. RLS stays enabled and default-deny. No new project or paid service is required.
3. Operator-only scripts/maintenance-bootstrap.mts inventories existing source URLs and exact identifiers without editing projects.
4. scripts/maintenance-credential.mts creates a dedicated buildwatch_ci LOGIN with membership only in the NOLOGIN buildwatch_worker role. That role can execute the scoped worker RPC, not read user accounts or invoke administrator functions. The private credential file is .env.maintenance and must never be committed.
5. Use the Supabase session pooler from Connect, port 5432, with a custom user of buildwatch_ci.PROJECT_REFERENCE. Verify TLS; never set rejectUnauthorized=false.
6. In GitHub Settings → Environments → buildwatch-maintenance, configure BW_WORKER_PGHOST, BW_WORKER_PGPORT, BW_WORKER_PGUSER, BW_WORKER_PGPASSWORD and BW_WORKER_CA as encrypted secrets. The password is the dedicated worker password, not your main database password or service-role key.
7. Set repository variable BUILDWATCH_MAINTENANCE_CONFIGURED=true after secrets are ready. The environment and secrets have been configured during this implementation; review them in GitHub rather than sending their values in chat.
8. Run the manual workflow with mode=initial, states=NC, dry_run=true and pilot_source set to a registered source ID. Start with source-eb945f0d43d269a3824983773bc797 (Hickory). Review execution results and sources.
9. Keep BW_ALLOW_LIVE_WRITES=false, AI off, and the cron commented out. Do not set pilot_approved, writes_enabled or schedule_enabled until the NC pilot has been reviewed and you explicitly approve activation.
10. Turn on GitHub Actions failure notifications for your account. Review missed/stale states in Automation Management; no system can send a GitHub failure notification for a workflow GitHub never started.
11. Future activation is a reviewed code/configuration change: approve source mappings, validate NC live fixture/pilot behavior, explicitly authorize production writes, then enable the database gates and timezone cron. Initial discovery for another state remains manual.

The account owner must review GitHub authorization, billing settings, failure-notification preferences, source-access permissions, source field mappings and the final production activation. Do not paste tokens or passwords into issues or chat.

## Costs and scaling

Current target remains $0: free public GitHub standard runners, existing Supabase Free and Cloudflare Pages, no AI/search subscriptions. No schedule or billable provider was enabled.

GitHub documentation currently lists free standard runners for public repositories. Private GitHub Free includes $12 of compute credit, equivalent to about 2,000 standard Linux minutes at $0.006/min; artifact allowance 500 MB. This workflow avoids uploaded artifacts/caches. Keep billing budgets at $0 with stop-usage enabled where available and do not activate larger runners or paid products.
Sources: https://docs.github.com/en/billing/concepts/product-billing/github-actions and https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule

Supabase Free currently includes a 500 MB database and 5 GB uncached egress, with separate cached-egress allowance; free projects may pause after inactivity. Free limits can cause throttling/read-only restrictions or downtime. The worker stops new claims at a conservative 450 MB database ceiling. Public map traffic shares backend quotas.
Source: https://supabase.com/pricing

Measured database after additive metadata/index setup: approximately 104 MB (about 99 MiB), versus 101.7 MB before; subsequent run metadata adds a small amount. No project records were deleted to achieve this.

Do not extrapolate the small Hickory pass into a nationwide coverage promise. At four reserved worker minutes/state/week, 50 states reserve about 14.5 worker hours/month plus setup/CI overhead; complex sources and initial discovery can take much longer. Public runners avoid private compute charges, but database storage and egress still constrain expansion.

The present aggregate footprint is roughly 8 KB per underlying record including shared database/index overhead. A rough, unbenchmarked linear projection is 400 MB for 50,000 records and 800 MB for 100,000; 500,000–1,000,000 records would be several GB before accumulated evidence/history. Full nationwide million-record coverage cannot realistically fit Supabase Free's 500 MB. Re-measure normalized records, evidence growth and query egress before each expansion; do not activate billable upgrades automatically.

AI is disabled. An optional OpenAI-compatible extraction adapter accepts retrieved evidence, requires literal supporting passages, returns review-only leads, reserves bounded tokens/requests and falls back to deterministic work when disabled/unavailable. No provider is configured or claimed free. Its explicit approval and ceilings must be reviewed before use; model confidence is never publication evidence.

## Remaining limits

- GitHub repository/workflow deployment and a real GitHub pilot must be verified in Actions before calling unattended execution operational.
- The 31 registered structured endpoints do not cover every NC jurisdiction. Other states have no source inventory yet and stay inactive.
- General web search has no configured unattended search API. Existing Codex-assisted search remains separate; news/developer documents can be added as registered supplementary document sources, with review required. No paid or unofficial search scraping is introduced.
- Unstructured agenda/PDF extraction, broad meeting coverage, verified polygon/address geocoding, source-specific status interpretation and difficult contextual classification require additional adapters and/or human review. Missing fields are not invented.
- Existing auto-publishing sources count starts at zero. A functioning scan/review pipeline is distinct from permission to publish source data unattended.
- No production bulk expiration or visibility migration has run. No real project merge, deletion or status change was applied by the pilot.
