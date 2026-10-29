# NC source adapter results — October 29, 2026

**Dry-run only. Not ready to enable automatic updates. No public projects or meetings were added, changed, archived or merged.**

## Implemented

- Deterministic discovery of resources explicitly linked from official pages, including bounded ArcGIS application configuration discovery and exact metadata-based mapping proposals.
- Reusable document-index adapters for **16 of the 57 previously pending areas**: Alamance, Burke, Caldwell, Carteret, Catawba, Davidson, Duplin, Guilford, Iredell, Johnston, Moore, Randolph, Rowan, Sampson, Stanly and Watauga counties. These locate relevant official document links; they do not establish verified project facts.
- All 16 adapters passed replay against downloaded official snapshots. Replay makes no network requests. Source URLs, retrieval times and hashes are retained.
- Bounded PDF extraction in the Linux maintenance worker: 2 MB input, 50 pages, 120,000 text characters, subprocess memory/CPU limits and a 15-second parent timeout. Unsupported, encrypted, malformed, scanned or oversized documents require review. There is no paid OCR or AI fallback.
- Exact agenda excerpts can retain case references and page citations. Requests for approval, document dates and calendar entries are never automatically treated as approvals, project milestones or confirmed project meetings.
- Explicit same-origin document redirects are rechecked against public-address, path and robots policies. Redirects are disabled by default and bounded when approved.
- Oversized individual documents are distinguished from exhaustion of the entire run budget. Unresolved PDF failures remain partial on resume rather than disappearing behind a completed index checkpoint.
- Built configurations and readiness metadata were saved in the existing private administrator source registry. New candidates remain disabled; no RLS permissions, administrator roles or authentication settings were loosened.

## Live and cached tests

- **59 candidate pages attempted** in the initial access survey. Its 112 HTTP requests were bounded by a 300-request reservation.
- A separate bounded follow-up used 100 requests to inspect actual linked indexes, canonical redirects and embedded configurations. Eight follow-ups were deferred at its ceiling. A deferral does not mean a site is unavailable or an area was verified.
- [Linux source pilot: 24 selected sources](https://github.com/Deleuzebot/BuildWatch/actions/runs/40902191918). Eleven index pages were retrieved and thirteen retained access/server failures. The workflow finished, but partial source outcomes remain explicit. Four retrieved indexes were later rejected because they only supplied schedules or bylaws. Caldwell's general ordinance notice is also excluded from document discovery.
- The first 22 apparent document-index matches were reduced to 16 after quality review. Cleveland, Columbus, Cumberland and Nash only supplied schedules/bylaws in the selected pages. Pitt and Wilkes require a board-specific filter rather than importing every board's agenda.
- [Linux agenda PDF pilot](https://github.com/Deleuzebot/BuildWatch/actions/runs/40902899752): Burlington's three sampled packets exceeded 2 MB after their official redirects were handled correctly. Kannapolis had two oversized packets; one smaller document parsed successfully but yielded zero safely identifiable project references. Both source results remain **partially completed**. No meeting dates or locations were invented.
- [Initial code checks](https://github.com/Deleuzebot/BuildWatch/actions/runs/40902106386) passed, including the real PDF sandbox regression on Linux and Expo exports. The final local suite has 124 tests: 123 passed and the Linux-only sandbox test was skipped on macOS; it is exercised by GitHub. Final code checks are linked from the repository's Actions page.

## Still needs fixing

**41 of the original 57 areas still require usable project-specific adapters or further extraction work.** The two original agenda sources also remain incomplete. Even the 16 new index adapters still require document-to-project extraction and verification before they can maintain public development records.

1. **Government access failures:** Buncombe, Chatham, Franklin, Granville, Henderson, Onslow, Orange, Rutherford, Rockingham and Union counties; Greenville, Raleigh and Rocky Mount. GitHub reproduced 403, 520 or robots/canonical-redirect failures. These need permitted alternative sources or verified canonical URLs; restrictions were not bypassed.
2. **Burlington:** find a lighter official agenda/text format or separately validate a secure larger-document processing strategy. The download ceiling was not raised.
3. **Kannapolis:** obtain current, smaller agendas or a permitted live source. Parsing a historical smaller document does not establish current meeting coverage. The restricted GIS source was not accessed.
4. **Forsyth:** the observed residential approval layer contains docket/parcel/year fields without verified project names or substantive event dates. Its metadata is retained for mapping review, not published as independent developments.
5. **Embedded maps and portals:** some configuration links resolve to roads, parcels or boundaries. These reference layers are excluded. App configuration, portal API permissions, correct project layers and source-specific schemas still need validation in affected areas.
6. **Schedules, bylaws and broad agenda directories:** these are not qualifying development records. They are excluded or flagged for board-specific filtering rather than being counted as successful development coverage.
7. **Project facts and meetings:** dates, locations, identities, decisions and associations still require authoritative evidence. The PDF reader deliberately queues uncertain excerpts rather than fabricating a public meeting or resetting approval expiration.

See the [full 59-area readiness table](NC-ADAPTER-COVERAGE.md) for source references, observed errors, snapshot tests and selected Linux results. The original 17 areas with limited tested feeds remain separate from this work; no complete statewide verification is claimed.

## Safety, storage and budget

- Existing stored project count: **13,060**. Automated project mutations: **0**. Schedules, writes and pilot publication approval remain off. New candidates enabled for unattended processing: **0**.
- Supabase database: approximately **203 MB**. Full PDF files are not embedded in the database; only bounded review evidence and provenance are retained.
- The user explicitly approved 500 additional internal dry-run requests. The cap was increased from 10,000 to **10,500**, and the prior 20 available slots plus those 500 are now conservatively reserved. No cap was silently reset or raised again. Actual HTTP use is lower than reservations; reservations include unused retry allowances.
- No paid services, AI APIs, recurring workflows or additional states were enabled. Further live tests must wait for available budget or receive additional explicit capacity approval. Local snapshot replay and code tests remain available without research requests.

Automatic publication should remain disabled until permitted source coverage, substantive evidence extraction, project identity/location checks and meeting associations pass representative validation.
