# Display-only state outlines

Source: U.S. Census Bureau 2025 Cartographic Boundary File, states and equivalents, 1:20,000,000.
https://www.census.gov/geographies/mapping-files/2025/geo/carto-boundary-file.html
https://www2.census.gov/geo/tiger/GENZ2025/kml/cb_2025_us_state_20m.zip

Downloaded October 25, 2026. Only the 50 states are retained. Coordinates are rounded to five decimals. Shared segments are deduplicated and joined into paths; segments crossing the longitude discontinuity are split to avoid lines across the world. No source project records are read or modified. Generalized outlines are for orientation, not legal or parcel-boundary use.

To reproduce, download the pinned KML ZIP and run `python3 scripts/build-state-boundaries.py /path/to/cb_2025_us_state_20m.zip` from the app root. The Python script uses only the standard library. Ask Codex to run this if needed; no manual Terminal work is required.

Client geometry loads lazily through `/api/state-boundaries/2025-20m` and is retained for the app session. Rendering filters paths by viewport; outlines fade from opacity 0.45 at zooms 3–6 to zero at zoom 12. They have no fill and cannot intercept project-selection clicks.
