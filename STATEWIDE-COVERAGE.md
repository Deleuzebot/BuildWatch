# Statewide North Carolina coverage

Reviewed October 25, 2026. **11,940 map records**, comprising 80 original curated entries, 1,244 additional municipal-tracker entries, and 10,616 permit-only records.

## Scope and limits

The population threshold uses NC OSBM's **July 1, 2025 standard estimates**, published October 1, 2026: [municipalities](https://www.osbm.nc.gov/facts-figures/population-demographics/state-demographer/municipal-population-estimates/municipal-population-change) and [counties](https://www.osbm.nc.gov/facts-figures/population-demographics/state-demographer/municipal-population-estimates/municipal-and-non-municipal-population). There are **24 municipalities and 52 counties** at or above 50,000 residents. Smaller towns and unincorporated sites are included within qualifying counties. Postal addresses, source planning jurisdictions, and physical city/county locations are stored separately where available.

This is coverage of named public inventories, **not a verified census of every active development**. Every qualifying city/county has mapped records, but local project research remains incomplete outside the original four cities and the additional inventories below. Some towns' inventories retain old status dates. No live agency synchronization is claimed.

## Permit-only records

NC DEQ's public NCG01 construction-stormwater register is dated **August 10, 2026**. It is the statewide discovery source, not evidence that every listed site is currently under construction or locally approved in full. All permit entries are visibly labeled **Permit record / Activity unverified**, have a source-as-of date, and explain that their Approved badge refers only to environmental coverage. Permits may remain active after work ends. Never substitute a permit expiration for a project completion date.

Records were selected from active NCG010000 coverage with Active status/reason, no termination, qualifying reported county, usable NC coordinates, and a coordinate county matching the reported county. Explicit individual-home permits were screened out. Related phase/lot certificates were grouped by normalized name, county, and proximity; potential local-project overlaps were held rather than guessed. Source records with missing/mismatched locations or unresolved duplicate matches are not published (150 held for review). This screening does not establish completion status for every site.

The source register has 13,636 rows; 12,272 met initial active/type/county criteria before screening and grouping. 165 municipal/permit duplicate matches were suppressed. Permit references and source links remain on each published permit record; no unconfirmed home counts, meeting times, developer roles, or construction starts were invented. The named organization on a permit entry is labeled Permit holder.

## Municipal sources reviewed

Only each layer's relevant public fields are copied. Personal staff contacts, private account data, and source-system credentials are not included. Completed, withdrawn, expired, and denied project records are excluded where explicit status fields identify them. High Point final plats are excluded as ancillary records; closed administrative plan approvals from 2025 onward may remain Approved, which does not mean an entire development is complete. Cary uses new-plan Active/In Review records and approvals from 2025 onward, excluding ancillary modifications. Raw source-status text and available dates are retained.

| Source jurisdiction | Additional records | Official inventory |
| --- | ---: | --- |
| Apex | 189 | [Source](https://www.apexnc.org/2119/Demographic-and-Development-Data) |
| Huntersville | 156 | [Source](https://huntersville.org/461/Projects-Map) |
| Kannapolis | 48 | [Source](https://storymaps.arcgis.com/stories/0f9c148eae464255a9953cafcfb0c773) |
| Mooresville | 164 | [Source](https://experience.arcgis.com/experience/6bae748dbea446dbb770b9132548984e) |
| Gastonia | 67 | [Source](https://gastonianc.gov/plans-and-maps2/maps) |
| Burlington | 114 | [Source](https://www.burlingtonnc.gov/2689/Burlington-Development-Dashboard) |
| Fayetteville | 67 | [Source](https://www.fayettevillenc.gov/City-Development) |
| Wake Forest | 103 | [Source](https://www.wakeforestnc.gov/planning/development-review/development-activity-dashboard) |
| Holly Springs | 83 | [Source](https://www.hollyspringsnc.gov/devmap) |
| High Point | 118 | [Source](https://www.highpointnc.gov/2019/Development-Activity) |
| Cary | 135 | [Source](https://data.townofcary.org/explore/assets/developments/view/) |

The original Chapel Hill, Raleigh, Durham and Greensboro research is preserved in [NORTH-CAROLINA.md](NORTH-CAROLINA.md). Source inventories can extend beyond their publishing municipality; mapped county membership takes priority for statewide inclusion. NC DEQ county polygons and Census incorporated-place polygons supplied approximate point-based location checks, not parcel surveys. A polygon centroid can fall outside its footprint and requires source verification before field use.

## App and data management

- The four public status chips remain unchanged. County names and certificate numbers are searchable; no city/category filter rows were reintroduced.
- Coverage & sources explains verification limits and provides county search links, population counts and source dates.
- Web and iPhone maps cluster dense records; the project list renders incrementally. The large permit register stays on the shared server, rather than bloating native offline bundles.
- Public snapshots use gzip and conditional ETags; unchanged refreshes do not redownload the complete statewide register. Private account responses remain uncached.
- Server startup runs the idempotent operator import. It validates the complete catalog and creates a private SQLite backup before adding missing IDs. Existing project data is preserved; only missing county metadata is added when the old coordinates exactly match the catalog. Roles, accounts, follows and subscriptions are unaffected. Imported changes use operator:nc-statewide in edit history.
- Public-source datasets are stored in src/data/statewideMunicipal.json and server/imports/data/ncConstructionPermits.json. Population/coverage metadata lives in src/data/northCarolinaCoverage.json. The operator entry point is server/imports/statewide.ts; it is not a client-accessible import route.
- The initial shared-server import added 11,860 records and county metadata to 80 existing records. Future startups skip already imported IDs, preserving administrator edits. Updating a source snapshot requires reviewed data and an explicit migration for existing records; it is not an automatic agency feed.

## County register

| County | Population (2025) | All records | Curated / municipal | Permit only |
| --- | ---: | ---: | ---: | ---: |
| Alamance | 187,982 | 280 | 110 | 170 |
| Brunswick | 176,619 | 454 | 0 | 454 |
| Buncombe | 278,235 | 366 | 0 | 366 |
| Burke | 90,346 | 87 | 0 | 87 |
| Cabarrus | 251,342 | 270 | 40 | 230 |
| Caldwell | 82,192 | 54 | 0 | 54 |
| Carteret | 71,659 | 96 | 0 | 96 |
| Catawba | 171,604 | 129 | 0 | 129 |
| Chatham | 84,505 | 395 | 24 | 371 |
| Cleveland | 102,115 | 73 | 0 | 73 |
| Columbus | 50,341 | 45 | 0 | 45 |
| Craven | 108,175 | 96 | 0 | 96 |
| Cumberland | 341,048 | 342 | 67 | 275 |
| Davidson | 181,248 | 186 | 1 | 185 |
| Duplin | 50,548 | 33 | 0 | 33 |
| Durham | 345,085 | 253 | 20 | 233 |
| Forsyth | 400,766 | 461 | 1 | 460 |
| Franklin | 82,732 | 122 | 6 | 116 |
| Gaston | 249,916 | 263 | 67 | 196 |
| Granville | 61,020 | 47 | 0 | 47 |
| Guilford | 557,963 | 573 | 140 | 433 |
| Harnett | 149,841 | 273 | 0 | 273 |
| Haywood | 64,522 | 35 | 0 | 35 |
| Henderson | 123,440 | 108 | 0 | 108 |
| Hoke | 56,642 | 78 | 0 | 78 |
| Iredell | 214,151 | 410 | 164 | 246 |
| Johnston | 257,598 | 481 | 0 | 481 |
| Lee | 70,161 | 118 | 0 | 118 |
| Lenoir | 54,904 | 36 | 0 | 36 |
| Lincoln | 98,409 | 132 | 0 | 132 |
| Mecklenburg | 1,224,717 | 1370 | 155 | 1215 |
| Moore | 112,063 | 222 | 0 | 222 |
| Nash | 100,148 | 109 | 0 | 109 |
| New Hanover | 245,917 | 293 | 0 | 293 |
| Onslow | 217,827 | 236 | 0 | 236 |
| Orange | 151,404 | 108 | 19 | 89 |
| Pender | 71,328 | 108 | 0 | 108 |
| Pitt | 182,281 | 268 | 0 | 268 |
| Randolph | 148,941 | 126 | 0 | 126 |
| Robeson | 118,295 | 61 | 0 | 61 |
| Rockingham | 94,004 | 68 | 0 | 68 |
| Rowan | 155,298 | 129 | 9 | 120 |
| Rutherford | 65,089 | 46 | 0 | 46 |
| Sampson | 61,009 | 52 | 0 | 52 |
| Stanly | 68,617 | 72 | 0 | 72 |
| Surry | 72,264 | 55 | 0 | 55 |
| Union | 271,383 | 261 | 0 | 261 |
| Wake | 1,259,530 | 1733 | 501 | 1232 |
| Watauga | 55,213 | 42 | 0 | 42 |
| Wayne | 120,861 | 140 | 0 | 140 |
| Wilkes | 65,995 | 32 | 0 | 32 |
| Wilson | 81,209 | 113 | 0 | 113 |

## Qualifying municipalities

| Municipality | Population (2025) | Mapped records | Curated / municipal |
| --- | ---: | ---: | ---: |
| Apex | 77,453 | 215 | 165 |
| Asheville | 97,700 | 109 | 0 |
| Burlington | 62,377 | 130 | 97 |
| Cary | 190,336 | 174 | 117 |
| Chapel Hill | 63,483 | 53 | 20 |
| Charlotte | 959,079 | 803 | 0 |
| Concord | 116,941 | 103 | 0 |
| Durham | 306,475 | 201 | 20 |
| Fayetteville | 211,282 | 205 | 67 |
| Gastonia | 87,621 | 119 | 59 |
| Greensboro | 307,952 | 248 | 20 |
| Greenville | 97,120 | 97 | 0 |
| High Point | 118,208 | 165 | 117 |
| Holly Springs | 50,499 | 95 | 60 |
| Huntersville | 67,842 | 223 | 140 |
| Jacksonville | 71,101 | 72 | 0 |
| Kannapolis | 59,965 | 101 | 46 |
| Mooresville | 60,297 | 208 | 145 |
| Raleigh | 504,445 | 213 | 20 |
| Rocky Mount | 55,966 | 19 | 0 |
| Wake Forest | 60,658 | 132 | 83 |
| Wilmington | 126,247 | 125 | 0 |
| Wilson | 50,691 | 80 | 0 |
| Winston-Salem | 260,060 | 227 | 0 |
