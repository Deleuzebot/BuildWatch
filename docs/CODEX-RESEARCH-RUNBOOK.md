# Human-initiated BuildWatch research

## Assessment

Codex can conduct a bounded, manually initiated research session, inspect primary records and credible reporting, reconcile findings with BuildWatch, and prepare auditable changes. This avoids building a complete unattended interpreter for every jurisdiction. Keep the deterministic identity, classification, lifecycle, duplicate and transaction safeguards: Codex's interpretation is evidence to validate, not database authorization.

No Codex automation, GitHub cron, publication gate, archival gate, paid search or AI API was enabled. The earlier shared-platform work is retained as reusable tooling, not a requirement to finish every adapter before manual research.

## Data reaches clients without a data-only app release

The deployed website was checked directly. Its Expo bundle points to the existing Supabase project; a public catalog request and the Apex project detail both returned successfully from Supabase's `buildwatch_read` RPC. Four read-only requests were used for each deployment verification (website, bundle, catalog, project detail); these were BuildWatch services, not government research requests.

`src/lib/transport.ts` sends public reads to `/rest/v1/rpc/buildwatch_read` using the public publishable key. Privileged requests go to the existing Supabase Edge Function. No separately hosted Express server or local SQLite file is required for that cloud path. `useMapBrowser` polls the catalog version every 15 seconds while active, invalidates its bounded cache when the version changes, and fetches project details from the backend.

The same React Native source powers native iOS map reads. EAS development, preview and production profiles now explicitly set the same three public Supabase configuration values, avoiding a silent fallback to an old local API configuration. No private credential was added. **An installed iOS binary was not tested or released.** An older binary built against localhost would first need a correctly configured build. After a cloud-configured build, database-only edits need no App Store release. App code/UI changes still require the appropriate app update. An already open detail card may need reopening; this is version polling, not instantaneous realtime push.

Verification artifact: `reports/maintenance/CLOUD-DATA-PATH.json`.

## Proposed weekday queues

These are manually chosen work queues, not scheduled jobs or guarantees of complete state coverage. All 50 states occur once. Illinois moved to Monday and Vermont to Friday compared with the old unattended rotation.

| Day | Queue |
| --- | --- |
| Monday | CA, IL, OR, NV, HI, AK, ID, MT, WY, UT |
| Tuesday | TX, OK, AR, LA, KS, NE, NM, MS, AL, ND |
| Wednesday | FL, GA, SC, TN, KY, WV, DE, MD, ME, NH |
| Thursday | NY, NJ, CT, MA, RI, PA, OH, MI, IN, SD |
| Friday | NC, VA, WA, CO, AZ, MN, WI, IA, MO, VT |

`config/maintenance/manual-rotation.json` defaults to cached-only, zero new live requests and zero production writes. Only NC has a validated demonstration; the other entries do not activate sources, publication or nationwide coverage.

## One run

1. The user starts a session with a weekday/state queue and an existing approved total research budget. Read the current allowance and safety gates first. Do not infer a new allowance from a new day/month. No permission prompt is needed for each individual allowed retrieval; ask only if the approved total or permissions must change.
2. Use cached source registries and last successful work first. Prioritize upcoming hearings, active applications, meaningful recent changes and incomplete investigations. Search by jurisdiction/topic rather than separately searching every project.
3. Capture official source URL/identifier, raw evidence hash, publication/retrieval/event dates separately, page/section, exact supporting facts, application/component scope, location provenance and secondary corroboration. A secondary identity mention alone is not corroboration of a milestone.
4. Reconcile using exact source-scoped identifiers or a reviewed source binding. Exact title/address/jurisdiction can generate a candidate; ambiguous aliases, shared names, multipart corridors and supporting permits remain private. Check canonical, archived and supporting identities before suggesting insertion.
5. Build typed proposals: new significant development, status, scoped milestone, description, supporting link, duplicate review or no change. Preserve numeric scope and uncertainty in descriptions. Announcement ≠ approval; permit issuance ≠ construction; withdrawn application ≠ canceled development; permit closure ≠ completion.
6. Evaluate the existing 365-day policy only for applicable Approved projects. Use verified subsequent substantive movement/future construction schedules. Application-level actions, observation dates and source outages must not reset the clock or independently cause archival. In-review projects are excluded. No archival is authorized in this demonstration.
7. Produce an exact before/after batch with per-item sources, reasons, uncertainty, duplicate checks, expected history and notification effects. List unchanged/rejected/unresolved cases and unvisited jurisdictions. Stop at the limit and preserve unfinished work.
8. Initially, obtain explicit administrator approval of the concrete batch, not permission for each research request. Use the current authenticated admin/MFA routes and fresh, revision-bound confirmation previews. Apply only approved items transactionally; re-read after commit, verify history, projections, map version and notifications, and retain rollback information. Stale or conflicting items return to review.

Suggested daily instruction:

> Run the Friday research queue, prioritizing North Carolina and unfinished work. Use the existing approved request allowance, cached evidence first, and primary government sources with credible secondary corroboration. Prepare a private before/after batch and coverage report. Do not publish or archive anything until I approve the batch. Stop safely at the budget.

This sentence does not increase the allowance. At the end of this cached demonstration, the seven previously remaining government research requests were unspent. Seven requests are insufficient to promise meaningful fresh verification of ten states.

## Exact cached North Carolina demonstration

Existing pending proposal `e33172acb9b0d5fce1cba9376b70da7f27dc2c06d8a718704c72af66261c88a1`, project `nc-local-82a43dcb917317`, **NC Childrens Health Infrastructure**:

| Item | Current | After an individually confirmed write |
| --- | --- | --- |
| Overall status | Proposed | Proposed |
| Project revision | 1 | 2 |
| Application milestone | Absent | Application Approval, 2026-10-22 |
| History entries | 1 | 2 |
| Location | 35.69644540055417, -78.86317481071825 | Same |
| Description and original sources | Current values | Same |
| Approval policy | No row | No row |
| Notifications | No new notification | No new notification for this timeline-only edit |

Exact event:

```json
{
  "key": "application-approval|source-8ad50df7b7918cceaf0e16245fd827|712|2026-10-22",
  "type": "Application Approval",
  "date": "2026-10-22",
  "at": 1792627200000,
  "description": "TRC approved this specific application/component. This does not establish approval or construction of the broader development.",
  "url": "https://services1.arcgis.com/nry3yyvaEfskMEXA/arcgis/rest/services/Development/FeatureServer/0/query?f=json&objectIds=712&outFields=*&outSR=4326"
}
```

The official cached attributes are FID 712, matching project name, `Action_Taken=TRC Approved`, `Action_Date=1792627200000`. The original response hash, retrieval date and source identity are retained. This approves the infrastructure application, not the broader hospital.

Would write: one `project_activity` event; unchanged project fields with revision increment; one before/after `history` entry; the existing projection/map-version update; proposal status and authenticated research audit decision. Would not write: location, description, overall status, approval policy, archived record or notification.

The current Supabase proposal, project fields, policy, history and absence of a duplicate milestone were checked read-only. No application or public data was modified. Exact private artifacts:

- `reports/maintenance/MANUAL-NC-WRITE-PREVIEW.json` — field-level effects and withheld cases.
- `reports/maintenance/GUARDED-APPLICATION-MILESTONE.json` — complete before/after project snapshots.
- `reports/maintenance/GUARDED-MILESTONE-VERIFICATION.json` — current pending/unchanged verification.

Black Creek's component/history discrepancy, Fire Station #4's unverified canonical identity, and Wilson's missing statuses/current identity checks remain withheld. No new public project, status transition, description edit or archive is justified by this demonstration. The cached Wilson adapter yields 40 record candidates with descriptions/points, not 40 approved insertions. The 17 cached document indexes establish retrieval leads, not 17 end-to-end verified municipal update systems.

## Permissions, limits and unfinished engineering

- The least-privilege maintenance account can research/reconcile and use protected worker functions; it cannot directly UPDATE public projects. The anonymous publishable key cannot grant admin privileges. Keep elevated credentials server-only. A Codex session's ability to read a database does not authorize an arbitrary SQL write or bypass MFA/audit checks.
- Existing administrator review supports individual status, meeting, information and guarded application-milestone changes. This demonstration adds a preview artifact, not a new general-purpose production batch writer. A single atomic multi-project batch-approval endpoint would need implementation and rollback tests if desired. New-project acceptance still needs validated identity, significance, coordinates, status and source evidence through existing admin creation/review controls.
- Manual reasoning reduces adapter development, but not source access restrictions, evidence ambiguity or verification workload. Government sources may be blocked, scanned, outdated or require interactive access. Do not bypass restrictions or claim inaccessible sources were checked.
- Codex sessions use the user's existing plan allowance; workload, context, model, retrieval and tool use affect consumption. A task is not an unlimited research reservation. No paid API is needed for this manual demonstration, and no additional credits/API billing were enabled. [Official Codex usage guidance](https://learn.chatgpt.com/docs/pricing).
- Strict government HTTP budgets require retrieval through the existing counted transport, including redirects/retries/robots. General web-search tools can expose query counts without exposing every upstream HTTP request; do not silently equate one search invocation with one HTTP request or claim an exact combined HTTP total. Use a separately approved query allowance if general search is used in future live runs. This demonstration used no government/secondary-source retrieval; official OpenAI product documentation was checked separately for this assessment.
- Ten-state *comprehensive initial discovery* is not a credible one-session guarantee. California alone can exceed the available time and source budget. Incremental maintenance of a curated portfolio is more realistic. Report time/request limits, checked sources, covered jurisdictions, exclusions and carryover; do not mark a whole state current merely because its queue was visited.
- Native data loading is configured, but no iOS build/device or App Store submission was performed. Live new-source access, description acceptance, new-project insertion and a multi-state manual production batch remain unvalidated here.

The next safe step is a small live NC manual run within an explicitly available budget, a reviewed preview, and one separately approved transaction. Nationwide activation and unattended schedules remain off.
