# Maintenance repair validation — 29 October 2026

Production publication and scheduling remain disabled. This is validation of the real worker and PostgreSQL write paths, not activation of statewide automatic updating.

## Repaired behavior

| Capability | Validation | Operational scope |
| --- | --- | --- |
| New approval | Controlled official-API fixture updates status, records approval and notification, appends milestone | Explicitly verified whole-development source mappings |
| Timeline preservation | Previous approval remains after a new decision; matching dates deduplicate | Append-only decision history; meeting reconciliation remains separate |
| Subsequent movement | A newer verified approval extends the due date without replacing the original approval date | Substantive dated decisions, never import/edit timestamps |
| Description changes | Changed 200-to-240-home description creates private information proposal; confirmation preview and isolated application tested | Administrator confirmation required; no silent editorial replacement |
| Construction | Explicit construction-start evidence changes status and appends milestone | A scheduled date or old approval date does not establish construction starting |
| Cancellation | Verified whole-development cancellation archives and hides the project; application withdrawal leaves the development alone | Requires explicit registry attestation and dated decision evidence |
| Completion | Verified completion archives and hides the project; exact-reference rediscovery cannot republish it | Original project, followers, sources and history remain |
| Approved expiration | 366-day approval archives after successful authoritative verification in the same run | Managed lifecycle only; review-stage projects are exempt |
| Source outage | Failed source does not archive; managed overdue project stays visible | Successful download alone does not constitute project verification |
| Future construction | Existing and newly retrieved explicit future construction schedules protect approval expiration | Only specifically verified schedule fields; cited schedule retained separately |
| New development | Verified structured record inserted once; repeat and unchanged records do not create duplicate projects/history | Existing identity, geographic and significance gates remain |
| Transaction failure | Deliberately malformed projection fails after write begins and restores all tested state | PostgreSQL statement/savepoint rollback |

## Real-source unattended demonstration

The worker replays the cached official [Apex development feature 712](https://services1.arcgis.com/nry3yyvaEfskMEXA/arcgis/rest/services/Development/FeatureServer/0/query?f=json&objectIds=712&outFields=*&outSR=4326): **NC Childrens Health Infrastructure**, `Action_Taken = TRC Approved`, `Action_Date = 1792627200000` (22 October 2026).

The existing Supabase project is matched by its registered source identifier and exact normalized name. Its current public baseline is copied into the isolated audit namespace with an audit-only project ID. The worker parses the actual cached government fields, creates an **Application Approval** milestone, and applies it using the same SQL implementation as production. Repetition creates neither another milestone nor another history revision. The broader project status, coordinates, description and approval policy are unchanged. The source's component-semantic attestation is enabled **only inside the rolled-back test**.

This demonstrates one real scoped government change. Approval, construction, cancellation, completion, expiration, future-schedule and information-change scenarios use clearly labeled controlled fixtures. They are not claimed as newly verified real-world changes.

## Reproduction and evidence

Run `scripts/maintenance-behavior-audit.mts` with the existing least-privilege maintenance credential, or manually dispatch the maintenance workflow with `validation_mode=behavior-audit`. The GitHub job requires no interactive Codex reasoning, AI API or live government HTTP. Source parsing, comparison, evidence gates and SQL writes run unattended.

The audit checks that production and isolated SQL bodies match, executes 12 scenarios, verifies production project/approval hashes and safety gates before and after, and rolls back all fixture data. Its JSON and full observations appear in the GitHub step summary. Desired behavior failures now fail the job, rather than merely being reported as observations.

Local verification: 12/12 isolated scenarios passed; TypeScript and public static export passed. Full unit suite: 144 tests, 143 passed and one Linux-only test skipped on macOS. The Linux cloud job provides the independent execution check.

## Remaining limitations

- No production source is newly authorized to publish. All production write/schedule/pilot-approval switches remain false.
- Existing legacy visibility is deliberately preserved. Newly managed records use verification-gated expiration. Adopting the legacy dataset requires a separate reviewed rollout; this repair does not unhide or bulk reclassify existing projects.
- No universal interpretation of arbitrary permit labels is attempted. Completion/cancellation and component decisions require source-specific semantics. Withdrawn applications are not automatically canceled developments.
- Existing description/category/location errors, including the Apex housing description, remain private review matters. The test does not publish corrections.
- Free-text or scanned documents, uncertain locations, and unmatched identities remain review cases. This is not statewide verification of all jurisdictions or all projects.
- In-app notification creation is tested; external push/email delivery is not certified by these tests.
- Rollback is proven in isolated transactions. Reversing later production decisions still uses guarded administrator/history tools and may require correcting related approval evidence; unsafe dependent changes are not silently overwritten.
- No additional research requests, paid services, AI inference, new jurisdictions or scheduled executions are needed for this validation.
