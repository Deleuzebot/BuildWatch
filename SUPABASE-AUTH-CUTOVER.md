# Supabase authentication cutover — November 7, 2026

BuildWatch's deployed website and Edge Function use Supabase Auth only. The retired issuer is rejected before any remote key lookup. The public build no longer contains the Auth0 SDK or public Auth0 settings. The local legacy account verifier also rejects logins; SQLite test tooling remains isolated.

Administrator login: Account → Administrator access → existing BuildWatch administrator email/password → code from the existing BuildWatch Duo Mobile entry. The original administrator binding and canonical BuildWatch account are unchanged. No new account linking, email-based role assignment, or second authenticator is required. Duo Mobile supplies TOTP codes; Supabase manages identity and password verification. This does not configure Duo enterprise SSO or Duo Push.

Ordinary accounts: Supabase email/password sign-in and registration with email verification. Optional Google OAuth uses Supabase and is displayed only when Supabase reports the provider enabled. Google is currently disabled and requires a Google OAuth client, the Supabase provider callback, and the existing public website redirect URL. No paid services were enabled. Built-in Supabase email delivery has restrictions and is not a production-wide SMTP solution; verify delivery and configure a suitable free SMTP provider before advertising public email registration.

Existing legacy non-administrator accounts remain stored. They are not automatically merged with new Supabase identities based on email. Migration of their saved data requires identity ownership verification; the existing administrator has already completed this binding.

The new service-only identity RPC validates live auth.sessions, confirms email, and requires the existing AAL2/TOTP administrator resolver for bound administrator accounts. Anonymous and authenticated clients cannot call it. User metadata never controls roles. The original administrator subject string is preserved as a historical identifier.

Validation: TypeScript; full Node suite; rollback-only database fixture checks for ordinary identity, missing sessions, administrator MFA denial and existing binding; deployed Edge health and denial of retired tokens and anonymous RPC calls. Full interactive password/MFA sign-in still requires the owner to complete the form privately. No real signup emails or credentials were submitted by Codex.

Unchanged before/after cutover: 13,060 public project rows; 13,149 history rows; 2 role-audit events; 1 administrator binding; 2 existing accounts; 0 notifications; map version 13,488. Scheduling, publication and archival controls remain off.

Files: supabase/migrations/20261107163853_supabase_only_identity.sql; scripts/supabase-identity-rollback.sql. Active cloud runtime config retains PUBLIC_APP_URL and PUSH_DELIVERY_ENABLED only. Historical migrations/reports and the external retired-provider account were not destroyed.
