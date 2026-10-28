# North Carolina source-readiness pilot — October 28, 2026

## Outcome

All 30 registered sources other than the previously tested Hickory source were attempted in dry-run mode. This is a **source readiness sample**, not a completed North Carolina maintenance cycle or research of every jurisdiction.

- 15 sources returned readable records.
- 12 stopped because their robots.txt/access-policy request returned HTTP 403.
- 3 explicitly restricted automatic retrieval: Burlington, Cary, Kannapolis.
- 731 source records were processed; 132 matched existing projects.
- 290 records had a recognized name; 441 did not.
- 101 statuses decoded under current rules; 630 require source-specific interpretation.
- 290 verified source point locations and 335 polygon footprints were retained. The rest have no supported point/polygon representation, including road polylines.
- 718 findings were counted as awaiting review; remaining records produced no actionable change. These are not 731 newly discovered developments.
- Zero projects published, changed, or archived.
- 60 source HTTP requests, 2,256,770 downloaded bytes, approximately 90 seconds of cumulative worker runtime; zero AI requests. Database and orchestration overhead are additional.
- 28 runs are explicitly partially completed: 15 access failures and 13 sample-limit stops. Two feeds exhausted their current pages (40 and 41 records) and ended awaiting review.
- Each attempt was capped at 30 seconds, six HTTP requests, and 50 processed records. A feed reaching 50 records remains partial with its saved checkpoint.
- These checks used the existing worker from the local operator environment, saving runs/checkpoints/findings to Supabase. They were not GitHub-hosted execution tests. HTTP 403 here is not proof the government data endpoint itself is unavailable.

## Changes needed before activation

1. **Access-policy verification:** Recheck the 12 HTTP 403 cases from GitHub's runner and investigate documented API access or alternate authorized feeds. Do not bypass robots restrictions, spoof credentials, or treat failed retrievals as empty datasets. Burlington, Cary, and Kannapolis need an explicitly permitted data-access method or source-owner permission.
2. **Greenville source selection:** The registered GreenvilleLink layer 3 returns parcel/property-tax attributes (parcel number, assessed values, year built), not a development application feed. Use it only as location evidence associated with an identified project; replace it for discovery. Nothing was removed from the existing public map during this audit.
3. **Source-specific fields:** Asheville uses record_name / record_status / record_type / record_status_date; Harnett uses PROJECT_NAME / STATUS / PROJECTTYPE / PROJECTSUBTYPE / PROJECT_NO; Pender uses PROJECT_NAME or SUBDIVISION_NAME, uppercase STATUS, LOCATION and LAST_UPDATED. Generic parsing misses these fields.
4. **Status semantics and dates:** Gastonia uses coded STATUS, APPRDATE and residential subtype fields. High Point includes Closed - Plan Approved and ApprovalDate: plan approval is not completed construction. Charlotte has Complete and a historical inventory; it is transit-area coverage, not all Charlotte. Mooresville, Holly Springs, and other GIS edit timestamps must not reset the approved-project expiration clock. Pender LAST_UPDATED is not automatically approval or construction evidence.
5. **Permit significance:** Greensboro is a building-permit feed, including older single-house records. Map PermitNum, FullAddress, StatusCurrent, IssuedDate and certificate-of-occupancy fields as permit evidence; do not manufacture project titles or equate permit final inspection with whole-development completion. Harnett includes administrative appeals and historical cases; scope screening must precede publication.
6. **Transportation:** NCDOT supplies TIP identifiers, route descriptions, point/line representations and future construction years. Map the TIP identity and geometry intentionally, preserve the major-road eligibility rules, and never treat a programmed construction year as proof construction began.
7. **Incremental selection:** The sample uses stable object-ID ordering, so several feeds begin with old records. Add verified per-source change watermarks and relevant date/type filtering with periodic reconciliation before relying on weekly scans. Preserve checkpoints for partial feeds.
8. **Meetings:** These 30 registered adapters are structured project/permit feeds, not a comprehensive agenda-ingestion system. Holly Springs exposes a Public_Hearing field and Gastonia has AGENDA_LINK, but current adapters do not turn those into verified meeting events. Source-specific parsing, official dates/timezones, project association and duplicate checks still need validation. No new meeting dates were invented.
9. **Activation gate:** Keep source autopublication off until each adapter's field meanings, scope, lifecycle dates, significance, duplicates and authoritative meeting handling are validated against representative records. A readable endpoint alone is not sufficient.

## Per-source results

The layer suffix distinguishes multiple feeds for one jurisdiction. Links point to the actual registered source. Full private run evidence and checkpoints are in Supabase Automation Management; machine-readable local results are in reports/maintenance/nc-source-pilot/results.json.

| Registered source | Layer | Records | Names | Decoded statuses | Existing matches | Outcome |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| [Apex](https://services1.arcgis.com/nry3yyvaEfskMEXA/arcgis/rest/services/Development/FeatureServer/0) | 0 | 0 | 0 | 0 | 0 | Access-policy HTTP 403 |
| [Asheville planning jurisdiction](https://gis.ashevillenc.gov/server/rest/services/Permits/AccelaPlanningView/FeatureServer/1) | 1 | 50 | 0 | 1 | 0 | Partial: 50-record sample cap |
| [Brunswick County planning inventory](https://services1.arcgis.com/W6gamXPYQeLXrdAd/arcgis/rest/services/Commercial_Development/FeatureServer/82) | 82 | 0 | 0 | 0 | 0 | Access-policy HTTP 403 |
| [Brunswick County planning inventory](https://services1.arcgis.com/W6gamXPYQeLXrdAd/arcgis/rest/services/ApprovedDev_poly/FeatureServer/0) | 0 | 0 | 0 | 0 | 0 | Access-policy HTTP 403 |
| [Burlington](https://maps.regisnc.org/arcgis/rest/services/sde_baselayers/BURL_TRC_Points/FeatureServer/0) | 0 | 0 | 0 | 0 | 0 | Robots restriction |
| [Cary](https://data.townofcary.org/api/explore/v2.1/catalog/datasets/developments/records) | records | 0 | 0 | 0 | 0 | Robots restriction |
| [Charlotte transit-area development inventory](https://gis.charlottenc.gov/arcgis/rest/services/CATS/TransitStationDevelopmentPublic/MapServer/0) | 0 | 50 | 50 | 2 | 2 | Partial: 50-record sample cap |
| [City of Sanford](https://services1.arcgis.com/XuFUQlKbcaxhKrdd/arcgis/rest/services/Development_Map__October_2026__WFL1/FeatureServer/1) | 1 | 0 | 0 | 0 | 0 | Access-policy HTTP 403 |
| [Durham](https://services2.arcgis.com/G5vR3cOjh6g2Ed8E/arcgis/rest/services/Planning/FeatureServer/17) | 17 | 0 | 0 | 0 | 0 | Access-policy HTTP 403 |
| [Fayetteville](https://services.arcgis.com/j3zNT485kmwrBtMJ/arcgis/rest/services/InfrastructureProjects_allfundedprojects_c26055940a844acf9834f8717d3fe712/FeatureServer/0) | 0 | 0 | 0 | 0 | 0 | Access-policy HTTP 403 |
| [Gastonia](https://services3.arcgis.com/u6Nvh8zpOQRNNRJi/arcgis/rest/services/Gaston_County___GCLMPO___Developments_2025/FeatureServer/26) | 26 | 0 | 0 | 0 | 0 | Access-policy HTTP 403 |
| [Gastonia planning jurisdiction](https://cogserver.gastonianc.gov/serverweb/rest/services/Planning/ResidentialDevelopments/MapServer/1) | 1 | 40 | 40 | 0 | 4 | awaiting review |
| [Gastonia planning jurisdiction](https://cogserver.gastonianc.gov/serverweb/rest/services/Planning/ResidentialDevelopments/MapServer/0) | 0 | 50 | 50 | 0 | 3 | Partial: 50-record sample cap |
| [Greensboro](https://gis.greensboro-nc.gov/arcgis/rest/services/EngineeringInspections/BuildingPermits_MS/MapServer/1) | 1 | 50 | 0 | 0 | 0 | Partial: 50-record sample cap |
| [Greenville planning jurisdiction](https://gisonline.greenvillenc.gov/arcgis/rest/services/GreenvilleLink/MapServer/3) | 3 | 50 | 0 | 0 | 0 | Partial: 50-record sample cap |
| [Harnett County planning inventory](https://gis.harnett.org/arcgis/rest/services/Planning/Projects/MapServer/0) | 0 | 50 | 0 | 0 | 0 | Partial: 50-record sample cap |
| [High Point](https://giswa02.highpointnc.gov/server/rest/services/LandDevelopment/MapServer/0) | 0 | 50 | 50 | 0 | 0 | Partial: 50-record sample cap |
| [Holly Springs](https://gis.hollyspringsnc.us/ths_arcserver/rest/services/Planning/InteractiveDevelopment/FeatureServer/0) | 0 | 50 | 50 | 50 | 43 | Partial: 50-record sample cap |
| [Huntersville](https://services7.arcgis.com/CADYoH7VVBN3BQHU/arcgis/rest/services/Development_Projects/FeatureServer/0) | 0 | 0 | 0 | 0 | 0 | Access-policy HTTP 403 |
| [Kannapolis](https://maps.kannapolisnc.gov/arcgis/rest/services/Planning/Developments/FeatureServer/22) | 22 | 0 | 0 | 0 | 0 | Robots restriction |
| [Mooresville](https://gis.mooresvillenc.gov/gisadmin/rest/services/Planning/active_projects/MapServer/0) | 0 | 50 | 50 | 48 | 50 | Partial: 50-record sample cap |
| [NCDOT future transportation program](https://gis11.services.ncdot.gov/arcgis/rest/services/NCDOT_STIP/MapServer/1) | 1 | 50 | 0 | 0 | 10 | Partial: 50-record sample cap |
| [NCDOT future transportation program](https://gis11.services.ncdot.gov/arcgis/rest/services/NCDOT_STIP/MapServer/0) | 0 | 50 | 0 | 0 | 9 | Partial: 50-record sample cap |
| [Pender County planning inventory](https://gis.pendercountync.gov/arcgis/rest/services/Development_Activity/MapServer/3) | 3 | 41 | 0 | 0 | 9 | awaiting review |
| [Pender County planning inventory](https://gis.pendercountync.gov/arcgis/rest/services/Development_Activity/MapServer/1) | 1 | 50 | 0 | 0 | 0 | Partial: 50-record sample cap |
| [Pender County planning inventory](https://gis.pendercountync.gov/arcgis/rest/services/Development_Activity/MapServer/4) | 4 | 50 | 0 | 0 | 2 | Partial: 50-record sample cap |
| [Wake Forest](https://services1.arcgis.com/gqTCvanrwF2z2HEu/arcgis/rest/services/Active_Developments_2026/FeatureServer/0) | 0 | 0 | 0 | 0 | 0 | Access-policy HTTP 403 |
| [Wilmington capital improvements](https://services1.arcgis.com/GwaLJVJq0Y6voqEc/arcgis/rest/services/CIPACE_2026Updates/FeatureServer/25) | 25 | 0 | 0 | 0 | 0 | Access-policy HTTP 403 |
| [Winston-Salem](https://services.arcgis.com/XAnuVx6VEMybNvyd/ArcGIS/rest/services/Development/FeatureServer/8) | 8 | 0 | 0 | 0 | 0 | Access-policy HTTP 403 |
| [Winston-Salem](https://services.arcgis.com/XAnuVx6VEMybNvyd/ArcGIS/rest/services/Development/FeatureServer/7) | 7 | 0 | 0 | 0 | 0 | Access-policy HTTP 403 |

## Safety verification

After this pilot: 13,060 stored projects; 1,831 public map records; zero automation mutations; schedule disabled; live writes disabled; zero autopublish sources. No source configurations, project records, expiration dates, permissions, existing SQLite files or backups were changed. Only private research evidence, cache entries, source-health statistics and run/checkpoint logs were written.

The existing Hickory result remains separate: 120 named records, 24 matches, 44 reported Construction statuses, 76 unresolved Final statuses, no public changes. Combined readiness coverage now includes attempts for all 31 currently registered NC sources, not all NC cities/counties.
