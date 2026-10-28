# Standardized development types

The Types button beside Under construction opens an eight-option menu in the web and phone layouts. Select multiple types; matching is OR across types and AND with status, search and viewport. Mixed-Use projects also match their documented secondary uses. Clear deselects all types. The menu allows map zooming while open, and changing types preserves the current map position and zoom. Icons use a consistent monochrome outline style. Primary labels use exactly Residential, Mixed-Use, Commercial, Industrial, Civic, Transportation, Utilities and Environment. Industrial, Civic, Utilities and Environment are the short labels requested for the longer functional groups.

## Migration results

| Primary category | All stored records | Public projects |
|---|---:|---:|
| Residential | 2,360 | 748 |
| Mixed-Use | 115 | 103 |
| Commercial | 348 | 166 |
| Industrial | 287 | 86 |
| Civic | 556 | 199 |
| Transportation | 790 | 299 |
| Utilities | 205 | 11 |
| Environment | 138 | 80 |
| Needs classification | 8,261 | 139 |
| Total | 13,060 | 1,831 |

These are primary-category counts. Filter counts may be larger because substantial documented secondary uses also match. For example, Industrial matches 87 public projects, including a secondary Industrial use; Industrial plus Under construction matches 27. No project is counted twice within a filter result.

Unresolved records remain preserved and retain the same public/private eligibility. Of 8,261 unresolved records, 8,122 are already private, mostly permit records without sufficient intended-use information. Generic permit names, unsupported categories and address-only information are not treated as proof of land use. Unresolved projects appear under all types but not under an invented type.

Administrators can open **Admin Dashboard → Classification Review → Development types** for category totals and a paginated unresolved list, with public cases first. This report is separate from the pre-existing 1,223 community-relevance review candidates. The API requires the existing administrator role and completed MFA.

## Data and evidence

Original source payloads, IDs, revisions, descriptions, dates, sources, locations, permissions, follows, history, meetings, duplicate decisions, relationships and archive rows were compared to the backup and preserved exactly. The exact same 1,831 projects remain public, including unresolved classifications. Existing road significance, stormwater-only, completed/cancelled and approval-expiration policies remain in force. No merge, deletion, status advancement or lifecycle extension occurred.

Classifications live in `project_categories` as derived overlays. Public records expose `primaryCategory`, `secondaryCategories`, `subtype`, `originalCategory` and classification reason/status. A source-provided `originalMunicipalCategory` is preserved when available; a legacy BuildWatch category is not falsely represented as a known municipal label when that provenance is unavailable. Original payloads remain accessible through the protected record interfaces.

The shared nationwide dictionary in `src/lib/categories.ts` considers title, description, specific source/legacy land-use categories and available housing-unit metadata. Facility function takes precedence over company ownership or a road address. Explicit mixed uses and housing amenities are handled separately. Surrounding land uses do not establish the site's purpose. It does not download or invent contents of linked planning documents; newly verified document evidence must be reflected in stored project scope or metadata.

## Imports, updates and performance

Database triggers classify inserts and material title/description/source-category/use-metadata changes, including raw SQL imports and merged-profile overrides. Status-only, verification-date and source-URL-only updates do not recompute land use. Existing and future manual or automated update paths therefore share one classifier. No scheduled service was activated by this change.

Materialized category membership indexes support primary and secondary filtering in map, browse, cluster drilldown and meeting queries. Secondary categories and subtype are searchable through the existing FTS index. Classifications are computed on writes, not by scanning every record for each map viewport. Map styling and state/status colors are unchanged.

## Validation and recovery

All 76 tests passed, including representative real records, synonyms, ambiguous names, amenities, mixed-use secondary filtering, status-only updates, direct imports, existing merge/undo behavior and indexed map queries. Administrator/MFA access to the report was tested. TypeScript checks and web/iOS exports passed. The browser Types menu and combined status filters were exercised in web and phone layouts; no claim is made of testing on physical iPhone hardware.

Backup: `../../work/categories/before-categories.sqlite`. Rehearsal: `../../work/categories/rehearsal-release.sqlite`. Complete totals and unresolved records: [CATEGORY-CLASSIFICATION.json](reports/CATEGORY-CLASSIFICATION.json). `scripts/category-report.mts` reproduces the report and validates source/relationship preservation, public membership, SQLite integrity and foreign keys against the backup.
