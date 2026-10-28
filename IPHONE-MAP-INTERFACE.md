# iPhone map interface — October 25, 2026

The phone layout (web widths below 768px and native apps) uses a map-first view with a compact header and bottom search panel. It replaces the scrolling development list with a matching record count. Desktop retains its existing list.

The bottom panel includes search, refresh, coverage information and four status filters arranged in two rows so all remain visible on small screens. Tap a selected filter again to return to all statuses. Counts reflect the complete matching catalog, not just loaded map tiles. Search and filters refocus the map after the corresponding results arrive.

Selecting an individual project pin loads a compact preview showing title, status, address, a top-right close button and Open. Open displays the existing full project page, including sources and associated meetings. Cluster zooming, state colors, status marker colors, map key, administrative editing and permissions are preserved. Cluster-picker selection also enters the preview flow on phones. Closing a pending preview invalidates its request; search/filter changes dismiss the previous preview.

Verified through the existing shared HTTPS URL at 390×844 and 320×700 browser sizes:
- Proposed: 155 records.
- In review: 264 records.
- Approved: 343 records.
- Under construction: 365 records.
- Clearing the selected filter: 1,127 records.
- Search Longleaf Trace: one Approved marker, automatically focused.
- Marker -> compact preview -> Open -> full project details.
- Close preview returns to the map.
- All four filters fit the small-screen layout.

All 58 existing tests and TypeScript passed. Web export and iOS/Hermes export succeeded. Browser screen-size checks are not physical-iPhone Safari/keyboard testing.

No development records or administrator decisions were modified. The existing temporary read-only share URL remains:
https://list-defence-backed-sequence.trycloudflare.com/
Reload to obtain the new layout. The computer must remain awake/online, as described in SHARE-PREVIEW.md.

## Layout preference and compact controls update
Settings → Display now switches between phone and web versions on any device. The choice persists locally (browser storage on web; SecureStore on native), with an automatic-layout reset. Browser-tested both switches and persistence through reload. Returned the test browser to automatic selection afterward.

Phone search height decreased from 50px to 44px, keeping 16px input text. Status filters now occupy one horizontally scrollable row with 44px touch targets. Verified swiping to Under construction and filtering to 365 records. Zoom buttons, Map key and Reset map are hidden in phone mode and remain available in web mode; pinch/drag and cluster zooming are unchanged. Settings and map controls were verified through the shared HTTPS preview at phone screen size. TypeScript and updated web/iOS exports passed. No data changes.
