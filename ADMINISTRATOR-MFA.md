# Free administrator login

BuildWatch supports an additional Supabase Auth password-and-authenticator login for the existing administrator. It uses the existing Free Supabase project. Auth0 remains enabled and unchanged for existing logins.

## Enrollment

1. Open https://buildwatch-3ky.pages.dev/ and sign in using your original Auth0 method and MFA.
2. Open Menu → Account → Set up or manage free administrator MFA.
3. Personally enter a unique 14–72 byte passphrase and its confirmation. Never send it in chat.
4. Select Create free administrator login. This creates an unprivileged Supabase Auth identity for your already verified administrator email. It does not yet grant BuildWatch access.
5. Enroll and verify one authenticator. A backup is optional, not required. Do not share QR codes or verification codes.
6. Select Confirm ownership and finish setup. A separate Auth0 window obtains fresh MFA proof once, without replacing or losing the Supabase enrollment session. The backend requires both your original verified Auth0 MFA identity and the new verified Supabase MFA session. Matching email addresses alone is insufficient. After linking, normal administrator sign-in uses the BuildWatch password and either authenticator without Auth0.

The screen restores the current MFA assurance level and checks the binding through the protected backend. A verified authenticator resumes at the final ownership confirmation; Open administrator account appears only after linkage is confirmed. A session that needs MFA shows the code step, and Sign in again with my BuildWatch password resumes expired sessions without deleting enrolled factors. Setup progress labels are not authorization: the backend still enforces all existing checks. If the Auth0 popup is blocked, allow popups for this site and retry the final confirmation; enrollment is retained.

Future sign-in: Menu → Account → Administrator login, enter the new password, verify either enrolled authenticator, and open the administrator account. Sessions survive a page refresh in the same tab using sessionStorage and refresh-token rotation; they are not stored in application project data. A new browser/tab may require another sign-in.

Duo Mobile supports this enrollment as a third-party account: Add → Use QR code. Use its generated six-digit code, not Duo Push. Keep the existing Guardian/Auth0 entry. If scanning fails, select Enter setup key manually and enter that key privately in Duo Mobile's Add other account flow. The key is shown only on request and is not retained in BuildWatch project/history storage.

The QR renderer encodes the SDK's SVG payload, including colour hashes that would otherwise be interpreted as URL fragments. If an earlier incomplete enrollment was left behind after a refresh, use Cancel incomplete enrollment, then start a new primary enrollment. The cancel action rechecks that the factor is still unverified and refuses to remove a verified factor. No existing Auth0 factor is changed.

## What is preserved

The bridge maps the Supabase identity to your original BuildWatch account ID and Auth0 subject. It does not create a second BuildWatch profile, promote an account based on email, or change administrator permissions, follows, projects, editing history, billing, or notifications. It never trusts user-editable role metadata. Your current Auth0 path remains available during and after enrollment; no Auth0 MFA policy has been disabled.

## Backend enforcement

The Edge Function verifies Supabase bearer tokens with GoTrue before accepting their claims. It requires the configured issuer/audience, a verified user, an unexpired token, AAL2 and an authenticator AMR event. A service-role-only PostgreSQL function then checks the exact live Auth session, its verified TOTP factor, the explicit identity binding, and the current BuildWatch administrator role/disabled state. Revoked roles, expired sessions, removed factors and logged-out sessions fail closed. An ordinary Supabase account, even with MFA and administrator-looking metadata, cannot use the bridge.

Only service-role RPCs can create/read bindings. TOTP secrets are managed by Supabase Auth, not stored in BuildWatch's project/account tables, audit messages, or deployment configuration. Passwords are sent over HTTPS to Auth and are never included in project history or logs. Initial provisioning does not replace an existing Supabase identity's password.

## Recovery and fallback

- Test your authenticator sign-in before relying on the new path after the Auth0 trial.
- Store the passphrase in a password manager. Without a backup, loss of the authenticator requires protected operator recovery. Supabase app MFA does not provide recovery codes in this implementation.
- If a phone is lost and no other authenticator is available, use the protected operator recovery procedure; password-only sign-in cannot open the administrator dashboard.
- During the trial, the original Auth0 MFA path remains a fallback. It is not a promise of free Auth0 MFA after trial expiration.
- Loss of the password and all factors requires the protected operator recovery procedure using the separately secured Supabase platform account. There is deliberately no public password/MFA reset or email-only administrator promotion endpoint. Recovery must confirm the original administrator account and existing binding, reset only the intended Auth credential/factor through supported Auth administration APIs, preserve the BuildWatch account ID, and be followed by fresh MFA enrollment and access tests. Do not change the administrator role or remove application MFA checks to recover access.

Self-service password-reset emails and a full native iOS enrollment UI have not been added. The website and iPhone browser support this new login; native Auth0 sign-in remains as before.

## Testing and activation status

Automated tests cover valid/invalid claims, online token validation, dual-proof linkage, unchanged administrator profile/permissions, single verified authenticator enforcement, unlinked identity denial, stale-authentication denial, role/session/factor revocation, client ACLs, and merge/undo using the Supabase-resolved identity. Database fixture changes are rolled back. Personal linkage and authenticator sign-in still require the account owner and must be confirmed before marking the migration complete.

No paid subscription, phone/SMS MFA, additional cloud service, or scheduled automation is required or enabled. Supabase Free quotas and inactivity policies still apply.
