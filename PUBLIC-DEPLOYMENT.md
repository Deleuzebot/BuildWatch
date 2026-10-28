# BuildWatch public deployment — October 27, 2026

**Public URL: https://buildwatch-3ky.pages.dev/**

The Cloudflare Pages project is `buildwatch`. Cloudflare assigned the `-3ky` suffix because the plain hostname was unavailable. This is a permanent project hostname, not a temporary tunnel or preview URL. No custom domain was purchased.

## Architecture

Cloudflare Pages serves the Expo web export from its global static hosting network. The deployment contains 17 files totaling about 2.2 MB uncompressed. It has no Pages Functions, Worker application, D1 database, local proxy, or Node server.

Public requests go directly to the existing Supabase `iuchstlnusdnserweutj` project. Its restricted read API serves paginated projects and bounded map clusters. Private requests go to the existing Supabase Edge Function, which verifies Auth0 tokens; PostgreSQL checks administrator roles, verified accounts, and MFA. The website and a future iPhone application can use this same backend.

The dataset remains 13,060 projects with 1,831 currently public projects. All original SQLite files and backups remain local and unchanged by deployment. None were uploaded. The website does not need the laptop or Codex to run. Verification succeeded while the local preview port was not responding.

## Production security configuration

- Existing Auth0 web application retained. The exact production origin was added to callback, logout, and web-origin allowlists. Local development entries were retained; no wildcard callback was added.
- Supabase Vault's `PUBLIC_APP_URL` now points to the production website, including collaborator invitation links.
- Public configuration is in `config/public-web.json`. Auth0 application IDs and the Supabase publishable key are public identifiers, not server credentials.
- The production build ignores local dotenv files and only injects the explicit public configuration. The asset scan found no SQLite driver, local API URL, database password, private key, or Auth0 management secret. Only `dist-public` was uploaded.
- Pages headers set CSP, MIME protection, frame protection, referrer policy, and appropriate caching. Auth0 popup linking remains compatible. PostgreSQL/Edge authorization remains authoritative; CORS is not used as a substitute for permissions.
- No database migration, paid plan, domain purchase, recurring task, or scheduler was enabled. Supabase automation remains paused.

## Verification results

- 86 application tests passed, including the regression test for preserving internal provenance while editing public project cards. TypeScript passed.
- 46 live Supabase checks passed, covering status/type/activity filters, bounded clustering, project details, meetings, state boundaries, forged-token rejection, and private RPC denial.
- 20 production checks passed: served files match the checked build, HTTPS/security headers, SPA fallback, production-origin public data access, Edge CORS, and rejection of unauthorized admin requests.
- Browser tests passed for guest entry, clustering, status filtering, search, marker selection, descriptions and source links, guest follow authentication, and phone layout at 390 × 844.
- The owner completed production Auth0 MFA. The admin dashboard and duplicate queue loaded 586 groups / 969 pending pairs; 1,223 classification-review cases remain accessible.
- A real administrator save of Carolina North through the public website advanced revision 2 to 3, created its audit history entry, and was immediately returned by the public Supabase API. Name, description, status, coordinates, sources, meetings, category, developer, address and home count were unchanged. No website redeployment was needed. No real duplicate pairs were merged.

Detailed machine-readable reports are in the task's `work/public-deployment/` folder.

## Website updates without Terminal

For ordinary project edits, sign in on the public website and use Edit Map or the administrator tools. The public map's existing foreground refresh sees database changes without publishing a new application version.

For code/design changes, ask Codex to update and deploy the website. `pnpm build:public` creates the checked static export and copies the Pages routing/security headers. Uploading a new deployment to the existing `buildwatch` Pages project retains the same public URL and deployment rollback history. You do not need to operate Terminal yourself.

An opt-in GitHub workflow is prepared at `.github/workflows/pages.yml`. It builds/tests/deploys on a push to `main` or a manual GitHub action; it has no schedule. It is **not connected or active**, because this checkout has no GitHub repository. To enable it later, have Codex create a sanitized repository, add a Pages-edit deployment token scoped to this Cloudflare account as the repository secret `CLOUDFLARE_API_TOKEN`, and set repository variable `BUILDWATCH_DEPLOY_ENABLED=true`. Never upload `.env.server`, `.env.supabase`, databases, or backups to GitHub. Direct Upload Pages projects support CI deployments through Wrangler even though they cannot later switch to the native Pages Git integration.

## Cost and remaining limits

**New website hosting cost: $0/month.** No billing details or pay-as-you-go plan were added. Supabase remains on Free, with the database currently about 101 MB.

- Cloudflare static Pages requests are free and unlimited. Free Pages permits 20,000 files and 25 MiB per asset; this deployment is well below both. Dashboard drag-and-drop supports up to 1,000 files. Managed Git builds have a 500/month Free limit; future GitHub Actions deployments also depend on the GitHub account's included build minutes.
- Supabase Free includes a 500 MB database, 5 GB uncached egress plus its cached-egress allowance, and 500,000 Edge invocations/month. Public map reads use the Data API instead of an Edge invocation per poll. Foreground polling pauses when the application is hidden.
- Supabase may pause a Free project after one week of inactivity. Free services have no production uptime guarantee; quotas or a paused backend can interrupt data/account access while the static website remains online. No keep-alive automation was added.
- **Auth0 currently displays 18 trial days remaining.** Its Free plan advertises 25,000 monthly active users, but MFA is a subscription-dependent feature. Existing MFA was retained and no paid subscription was activated. Confirm an appropriate no-cost entitlement with Auth0 before the trial expires; otherwise preserving this exact MFA setup may require a later architecture/security decision. Do not assume the current trial guarantees permanent free MFA.
- Apple sign-in, payments and push delivery retain their prior configuration and limitations; this deployment does not activate unconfigured services. Existing Google sign-in worked in production. Provider development-key/production-readiness requirements should be reviewed before a broad launch.
- OpenStreetMap tiles remain the existing community tile source, subject to its usage policy and availability. Nationwide/high-traffic expansion will need capacity planning for both database and map tiles. A million records are not a promise of Free-plan capacity.

Official references: [Pages limits](https://developers.cloudflare.com/pages/platform/limits/), [Pages static requests](https://developers.cloudflare.com/pages/functions/routing/), [Direct Upload with CI](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/), [Supabase pricing](https://supabase.com/pricing), [Supabase usage limits](https://supabase.com/docs/guides/platform/billing-on-supabase), [Auth0 pricing](https://auth0.com/pricing).
