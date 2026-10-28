# BuildWatch Supabase-only backend

The deployed backend is project `iuchstlnusdnserweutj`. Auth0 remains the identity provider. Applications use the public Supabase URL and publishable key; they never receive database passwords, service-role keys, or Auth0 management credentials.

## Runtime architecture

Public map/catalog/browse/project/activity/meeting/boundary requests call the restricted `public.buildwatch_read` Data API function. It returns eligible active records, paginated summaries, and at most 512 map nodes. Indexed eligibility, geographic, category, and activity projections remain in PostgreSQL. Public project responses omit internal verification and classification metadata.

Account and administrative requests call the `buildwatch` Edge Function. It verifies Auth0 RS256 access-token signatures, issuer, audience, expiration, and account claims. The database checks the stored account role, verification, disabled state, and administrative MFA. Client claims cannot assign roles. The privileged database gateway is executable only by the service role; anonymous clients cannot supply an identity directly.

The Edge platform's Supabase service credential is supplied by Supabase. Existing Auth0 server settings are encrypted in Supabase Vault under `buildwatch_backend_config`; the runtime-config function is service-role-only. `.env.server` and `.env.supabase` remain local recovery/migration inputs and must never be bundled or committed.

`server/main.ts` in Supabase mode serves static preview files only. The application does not require a separately deployed Node/Express server. A public web version still needs static website hosting; packaged iOS/desktop clients contact Supabase directly. Creating a desktop installer and an App Store release are separate packaging tasks.

## Data safety

The original 64 application tables were verified by counts and content digests before cutover. Original SQLite files and migration snapshots are retained for recovery. They are no longer the live write target. Do not import an old SQLite snapshot over live cloud edits.

Merge and supporting-link operations retain raw source records and identifiers. Preview signatures reject stale decisions. Database transactions protect the relationship, override, notification, projection, and audit changes together. Undo checks for later edits before restoring prior state. Existing 969 duplicate candidates remain unresolved; no automatic merge or bulk visibility migration was performed.

The cloud regression runner uses fixture records inside one transaction and always rolls the transaction back. It covers merge/undo, supporting links, stale previews, injected failure rollback, permissions/MFA, free following, corrections, invitations, notifications, archive operations, and map/filter parity. Run it during a maintenance/test window because its temporary function replacements hold DDL locks until rollback.

## Schedules, notifications, and payments

No recurring scheduled job is enabled. Monday/Friday automation remains paused. Research/duplicate review and user-initiated archive batches are available. Large archive operations checkpoint and can be resumed from the administrator interface.

In-app notifications remain persisted and preference-aware. Meeting reminders are prepared on authenticated account/notification requests. Device push remains disabled; there is no claim of background delivery while everyone is offline. Activating reliable timed delivery later requires explicit scheduling approval and end-to-end device testing.

RevenueCat billing remains disabled until its store products, web checkout, credentials and webhook are configured and tested. Existing saved follows and entitlements are preserved. Apple sign-in remains governed by the application's existing configured provider flag.

## Deploying changes

Apply reviewed SQL migrations through Supabase migrations. Bundle `supabase/functions/buildwatch/index.ts` using `scripts/supabase-bundle.mts`, then deploy the generated function plus its `deno.json`. Supabase gateway JWT verification is off for this function because its handler verifies Auth0 tokens itself; never remove that verifier.

`scripts/supabase-configure.mts` copies an allowlist of existing server settings into Vault and sanitized public settings/boundaries into a private asset table. It first refuses to proceed if local/cloud baseline records differ. It is an initial-cutover tool, not a routine synchronization command after cloud edits begin.

Rebuild web/iOS exports after changing public environment variables. Ordinary project edits update PostgreSQL immediately and require no app-store release. A local preview is available at `http://127.0.0.1:8765/` while the static preview process is running.

## Free plan and operational limits

The existing project remains on Free; no paid compute, hosting, branches, or schedules were enabled. Public polling uses the Data API rather than consuming an Edge invocation for every map refresh, and pauses while the app is in the background. Map payloads remain viewport-bounded and pages are capped at 100.

Free resources still have storage, egress, invocation and inactivity limits. Monitor the Supabase Usage dashboard; this is not a promise of unlimited nationwide capacity. Keep local recovery snapshots. Do not enable paid upgrades or recurring ingestion without reviewing cost and execution limits.

The security advisor's `RLS enabled without policy` notices are intentional default-deny private tables: client roles have no direct schema/table privileges. The public read function's security-definer notice is intentional: its fixed search path and explicit read whitelist provide the guest API. See [Supabase's public-function advisory](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).
