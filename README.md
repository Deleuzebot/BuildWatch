# BuildWatch

An Expo SDK 58 / React Native TypeScript application for public development tracking, with an interactive browser map and native Apple Maps on iPhone. Existing projects, project editing, meeting listings, search and filters are preserved.

## North Carolina coverage

The shared map includes 1,324 curated/municipal tracker entries and 10,616 clearly labeled permit-only records across all 24 municipalities and 52 counties with populations of at least 50,000. This is coverage of public inventories, not a complete verified census of active projects. NC DEQ permit evidence is dated August 10, 2026 and does not establish current construction. Read [STATEWIDE-COVERAGE.md](STATEWIDE-COVERAGE.md) for sources, screening and gaps. Use Coverage & sources in the app to browse by county. Fresh installations import the initial catalog with a backup. Existing installations skip catalog-module loading; explicit data imports handle future batches while preserving edits.

## Map performance and meeting coverage

The public map uses indexed viewport queries, bounded server clusters, paginated project summaries and on-demand details. Read [PERFORMANCE-REPORT.md](PERFORMANCE-REPORT.md) for the million-record synthetic benchmark, preservation checks, meeting diagnosis, limits and prioritized UX recommendations. The approved fixed state colors now style clusters; individual pins keep their development-status colors. Subtle Census state outlines fade out at local zoom levels. Use Map key for the accessible legend. [STATE-COLOR-PROPOSAL.html](STATE-COLOR-PROPOSAL.html) now records the approved palette. Meeting coverage currently consists of one manually researched Chapel Hill hearing, not an automated statewide agenda service.

## Preview without Terminal

Ask Codex: **“Start BuildWatch with its shared-data server and open the preview.”** Codex runs `pnpm preview`. Local preview: http://127.0.0.1:8765. On first launch, choose Continue as Guest, Google, or Apple. The guest choice is remembered on that device/browser. Use Menu → Welcome / Sign in to reopen the welcome screen. Google/Apple remain visibly unavailable until the identity service is configured. Settings, login, following and moderator tools are reached through Menu. The full account flow requires the identity-service setup below; unconfigured providers are labelled unavailable.

The browser uses Leaflet/OpenStreetMap tiles with attribution. iPhone uses react-native-maps/Apple Maps without a maps API key. Map tiles need an internet connection. A localhost URL works only on its host computer; sharing needs HTTPS hosting.

## Accounts and launch configuration

Read **[ACCOUNT-SETUP.md](ACCOUNT-SETUP.md)** for:

1. Auth0 Google/Apple/email configuration and secure one-time assignment of your own administrator account, with MFA.
2. Verified-email, single-use collaborator invitations and immediate revocation.
3. Private correction/feedback review and project edit history.
4. RevenueCat iOS StoreKit and web subscriptions, priced at US $9.99/month, sandbox validation and cancellation/restore.
5. In-app notification events, preference persistence, and optional Expo/APNs delivery configuration/testing.
6. External accounts, credentials, deployment, backups and remaining release checks.

No live identity provider, payment processor or push delivery is activated by this source package. Public browsing remains accessible. Ordinary users and guests cannot edit map data; the old shared editor key and localhost write bypass are removed. Paying for Plus never grants editing permission.

## Data and backend

The Node API imports existing `server/data/projects.json` once into `server/data/projects.json.sqlite`, retaining the JSON file. All subsequent writes use server-only SQLite transactions. Projects, roles, follows/history, entitlements, invitations, feedback/corrections, audit history and notifications are persisted. Back up the WAL database consistently; never put this directory in Git or a public web root. Never run an old shared-key server release alongside this service.

`.env.example` documents public client variables. `.env.server.example` documents server-only secrets; `.env.server` is loaded at API/bootstrap startup and ignored by Git/Docker. Do not put management keys, RevenueCat secret keys, webhook credentials or Expo access tokens in EXPO_PUBLIC variables. New provider configuration requires a web rebuild and a new native build when native settings/dependencies change.

The Node server serves both the browser export and `/api`. `pnpm web` alone is only Metro UI development; configure EXPO_PUBLIC_API_URL and WEB_ORIGIN for its separate API origin. `pnpm preview` is the complete local flow.

## Checks and builds

Use Node >=22.13 and pnpm 11.25.0. GitHub Actions runs frozen dependency installation, strict TypeScript/tests, Expo Doctor and both platform exports.

- `pnpm check`: strict TypeScript and integration/data tests.
- `pnpm doctor`: Expo configuration/dependency health.
- `pnpm export:web`: static assets in dist-web (requires the Node API for accounts/data).
- `pnpm export`: iOS JavaScript/Hermes assets, not an IPA.
- `pnpm serve`: API plus built browser assets.

For the complete iPhone account/purchasing/push experience, use a signed development or production build. Expo Go and Snack do not support all required native capabilities. EAS profiles remain in eas.json. Replace com.example.buildwatch with your unique bundle ID before first signing and link the real Expo account/project. Apple Developer membership, App Store Connect, signing and physical-device tests remain required for TestFlight.

Expo Launch's GitHub workflow requires a public repository with the static app.json at its root. No GitHub repository or hosting has been provisioned. If you later create one, this folder is its root; do not include node_modules, generated exports, environment secrets or server/data. The Dockerfile provides the Node service; production hosting also needs HTTPS, private persistent disk, environment secrets and a notification scheduler kept running.

The current single-service SQLite architecture is a first deployment foundation, not a tested national-scale deployment. Account-linking a secondary account with billing history or elevated permissions requires a reviewed transfer. Browser push, email event delivery, document uploads, project discussions, and a forum are not implemented in this checkout. Source-document links are supported. Existing hypothetical forum code was not present and was not replaced.


## Administrator review of Codex research

Open **Admin Dashboard → Proposed Map Updates** after administrator MFA. Research is review-only until individual approval. Potential Duplicates remains connected for merge, supporting-record links, distinct decisions, and undo. See [the current proposed updates](NC-PROPOSED-UPDATES.md) and [manual update workflow](MANUAL-MAP-UPDATES.md). Google Cloud deployment is deferred; no unattended source-check schedule is enabled.

## Archived projects and supporting permits

**Admin Dashboard → Archived Projects** provides documented approval/construction evidence, protected restoration, filtering, selection across pages and manually confirmed permanent deletion. Approved-only expiration and stormwater-only supporting-record visibility are enforced by backend queries without a scheduled job. The requested initial cleanup is complete; see [the cleanup report](APPROVED-EXPIRATION-REPORT.md). No live permanent deletion was performed.
# Research and maintenance

See [NATIONWIDE-MAINTENANCE.md](NATIONWIDE-MAINTENANCE.md) for the architecture audit, disabled weekly state rotation, worker safety controls, administrator dashboard, pilot results, cost limits and activation steps. Live scheduling, project writes and AI remain off pending review.
