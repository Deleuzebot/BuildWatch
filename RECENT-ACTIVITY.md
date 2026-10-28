# Recent Activity and Project Activity

Implemented October 27, 2026. No automation, scheduled workflows, source discovery, scraping, cloud services or background jobs were introduced or activated.

## Map and project details

Recent Activity appears beside Types in both map layouts. It starts disabled on each app launch. The compact non-modal popover offers a four selectable buttons: Past 30 days, Past 3 months, Past 1 year and Past 5 years. The 5-year endpoint and Disable both show the full currently eligible dataset, subject to other selected filters. The 5-year endpoint is a full-view shortcut, not a claim that all records have documented activity in five years. Undated and older active projects are included there without inventing activity dates. Shorter and intermediate windows require documented past events. Map gestures remain available outside the popover; changing the period preserves the current viewport.

Activity combines with status, primary/secondary type, search, state and viewport filters, including cluster drilldown and meeting queries. Projects without documented activity remain available with the filter disabled or at the 5-year full-view endpoint. No ninth status or additional marker animation was added.

Each detail panel now has Project Activity, showing dated events newest first, concise descriptions and available source links. Histories load only when a project is opened, in pages of 20 events. Records without reliable events show “No documented activity history available.” Future scheduled meetings remain in the existing meeting interface; their scheduled dates are not treated as already-occurred activity or as announcement dates.

## Evidence audit and migration

The existing database has `approval_policy.approval_evidence`, exact `sourceStatusDate`/`sourceStatus` pairs, documented construction schedules and project meetings. Its ordinary `history.created` values are edit/import timestamps, not reliable event dates; approximately 13,000 editing-history rows therefore do not become 13,000 recent development events. An audit of the source-dated fields in those historical snapshots found no additional qualifying dates beyond the projected events.

The initial projection contains **498 events** across public and private records:

| Event type | Stored events |
|---|---:|
| Approval | 433 |
| Permit / Regulatory Decision | 15 |
| Proposal / Application | 22 |
| Review Update | 23 |
| Public Meeting | 5 |

Four stored meeting dates are still future dates, including meetings on private records. Only already-occurred events qualify for date-filtered windows or the Project Activity timeline. No exact construction-start events could be established from the existing evidence. Generic Under Construction status dates can actually be old approval/action dates, so they are deliberately excluded as construction-start evidence. Year-only or month-only schedules are not expanded into invented dates.

**273 of the 1,831 public projects** have at least one documented past event; 1,558 do not. These missing histories are not interpreted as inactivity, rejection or completion. The oldest supported events remain in project history; the 5-year full-view endpoint does not require a dated event.

Documented municipal status/action dates identify review, application and decision activity with the source's actual wording. They are not all labeled final approvals or construction starts. Issuance is explicitly described as a municipal planning/regulatory decision. Approval-policy evidence takes precedence over a duplicate approval status-date entry. Last-checked dates, `reviewedAt`, `sourceAsOf`, record creation/import dates, category normalization and descriptive corrections do not advance activity dates.

## Storage, preservation and performance

`project_activity` stores project ID, event type/date, description, source URL and a separate recorded timestamp. Occurrence dates and recording timestamps are distinct columns. Date-only evidence is indexed as a UTC calendar day, not presented as a claimed exact time. Calendar-month/year windows clamp month-end and leap days. Thirty days uses inclusive UTC calendar-day bounds.

The projection is populated once from existing evidence. Synchronous database triggers maintain source-dated events during ordinary project/approval updates; they do not fetch sources or initiate work. Prior source-dated lifecycle events remain available when a later lifecycle stage is recorded. Meeting edits update or remove the corresponding association, avoiding obsolete dates after rescheduling. The ordinary editing audit remains unchanged.

Indexes on occurrence date/project ID and project ID/date support filtering and detail pagination. Public histories are not downloaded with map markers. Existing relationship resolution includes events from merged/supporting records without changing their identities. Recent Activity is an additional predicate over the existing active spatial index, so archived, expired, deleted, completed and cancelled projects are not restored.

Time-sensitive responses expire through the existing request cache and foreground map metadata refresh. There is no scheduled server worker or recurring ingestion timer. An 80-ms UI debounce limits redundant filter queries; elapsed-time filtering is evaluated in SQL when the existing map interface makes a request.

All 13,060 original project payloads, overrides, revisions, histories, source references, dates, follows, accounts, permissions, duplicate decisions, classification-review records, relationship records, approval policies and archive rows were compared to the backup and preserved. The exact original 1,831 public project IDs remain available when filtering is disabled. SQLite integrity and foreign-key checks passed.

## Verification

On the existing NC dataset, with no other filters:

| Window | Matching projects | Cluster/marker nodes | Local request time |
|---|---:|---:|---:|
| Past 30 days | 14 | 14 | 15 ms |
| Past 3 months | 61 | 12 | 4 ms |
| Past 1 year | 203 | 15 | 3 ms |
| 5 years — full current view | 1,831 | 29 | 4 ms |

Intermediate ranges are supported (for example, 200 days currently matches 127 projects). Counts are time-sensitive, not a promise of complete historical coverage. Cluster counts sum exactly to filtered totals. Tests cover four windows, calendar boundaries, future dates, invalid dates, old approvals imported recently, minor corrections, combined filters, archive/expiry exclusions, idempotent reopening, history API pagination and hidden-project access controls. Existing map, merge/undo and permissions tests also pass. Browser checks verified the disabled default, enabled filter, and the Salisbury project's sourced October 6 approval event.

Backup: `../../work/activity/before-activity.sqlite`. Rehearsal: `../../work/activity/rehearsal.sqlite`. Measured results: `../../work/activity/validation.json`.
