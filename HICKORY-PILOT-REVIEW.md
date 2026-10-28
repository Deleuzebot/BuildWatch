# Hickory mapping correction and North Carolina pilot

Verified October 28, 2026. No automatic publication or scheduled updates enabled.

## Source mapping

The [official Hickory GIS layer](https://arcgis.hickorync.gov/server/rest/services/EconomicDevelopment/Hickory_Development_Projects/MapServer/0?f=pjson) uses these fields:

| Source field | Meaning retained in BuildWatch |
| --- | --- |
| OBJECTID | Original record identifier |
| P_Name | Project name |
| D_Name | Developer |
| Comments | Source description and qualifications |
| Type | Decoded municipal category; original code retained |
| Status | Decoded municipal status; original code retained |
| PSD | Plans submitted date, never an approval date |
| Per_Date | Permit date, never an assumed construction start |
| RU / Units / Per_Num | Residential subtype, units, permit identifier |
| Polygon geometry | Official footprint bounds, not a verified point pin |

Pre = Preliminary, AP = Approved Plans, Con = Construction, Fin = Final. Final remains unresolved: the service does not establish that it means completed physical construction. Office/Institutional likewise remains contextual rather than automatically becoming Civic.

Required field names and coded-domain meanings are checked against official metadata. Mapping-version cache keys permit reprocessing previously downloaded records after a mapping correction without deleting evidence history.

## Corrected GitHub pilot

[Successful workflow execution](https://github.com/Deleuzebot/BuildWatch/actions/runs/40784787201), commit 5ae6ebe7fbf8c479576c886a1570ce2564b2ee8e. Supabase run 38784dc0-8b1b-4233-91c6-e43eac579998.

| Measure | Result |
| --- | ---: |
| Source records processed / named | 120 / 120 |
| Existing projects matched | 24 |
| Reported Construction statuses decoded | 44 |
| Final statuses requiring review | 76 |
| Polygon footprints retained | 120 |
| Verified point pins supplied by source | 0 |
| Plans submitted dates / permit dates | 41 / 20 |
| Conflicting comment evidence | 1 |
| Source retrieval failures in this pilot | 0 |
| Published projects / status changes / archives | 0 / 0 / 0 |
| Runtime / HTTP requests / downloaded bytes | 24 seconds / 5 / 186,440 |
| AI requests | 0 |

The run finished as **awaiting review**, with all 120 findings held privately. This was the selected Hickory source within the North Carolina pilot, not verification of all North Carolina jurisdictions. The broader quality audit still records an earlier Cary source-access failure, separate from this successful Hickory retrieval.

Preston Ridge Phase 1 reports Construction but its comments say prior approval lapsed and new plans/permits must be approved. That conflict is explicitly flagged; no cancellation, expiration, or status change is inferred from it.

The feed does not provide an address field, verified point pins, or reliable status milestone dates. Plan/permit dates do not reset approved-project expiration. Further evidence is required before publication or consequential lifecycle changes.

## Verification and safety

- 102 tests passed, including real Hickory fixtures, ambiguous Final status, conflicting notes, dates, polygons, and schema drift.
- GitHub checks, TypeScript checks, and the public static build passed.
- Stored projects remain 13,060; public map records remain 1,831.
- Automated project mutations remain zero. Source mapping configuration and private pilot evidence/logs were saved.
- Scheduling, live project writes, and source autopublication remain off.
- Original records, history, SQLite databases, and backups were preserved.

Review in BuildWatch: Admin Dashboard → Automation Management → Refresh execution status → latest NC initial dry-run → Review ambiguous findings. No live activation is authorized by this report.
