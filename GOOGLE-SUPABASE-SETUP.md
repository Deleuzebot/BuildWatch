# Google sign-in via Supabase — setup status

Google Cloud project: BuildWatch Authentication (sinuous-gist-514017-f8). Created without a billing account or trial.
Supabase project: iuchstlnusdnserweutj (existing Free project).
Website origin: https://buildwatch-3ky.pages.dev
Google authorized JavaScript origin: https://buildwatch-3ky.pages.dev
Google authorized redirect URI: https://iuchstlnusdnserweutj.supabase.co/auth/v1/callback
Scopes: openid, email, profile only. No Gmail, Drive, Calendar, offline data access, AI APIs or billing.

The app uses Supabase signInWithOAuth and automatically shows the Google button only when the provider is enabled. Account selection is explicit. Guest browsing is preserved on web and phone; administrator UI remains hidden in phone mode.

Administrator isolation is enforced server-side: the existing administrator binding requires a verified password authentication method plus Duo TOTP. An OAuth-only session, even with TOTP or matching email, cannot use that binding. Existing roles/history are unchanged. UI also directs OAuth sessions back to the administrator password fields. Ordinary Google accounts receive no editing permissions.

Supabase can automatically associate verified same-email provider identities (see official Identity Linking docs). This does not merge BuildWatch project records or grant roles. The server-side password/MFA guard is required even if the platform associates Google with the administrator's Supabase user.

Setup still requires: owner-approved support/contact address; Google consent configuration and public External audience; web client creation; owner privately transferring the client secret to Supabase Google provider; exact Supabase production redirect settings; Google publishing status appropriate for non-test users; interactive sign-in using a non-administrator Google account. Do not call Google login operational until these steps and live tests pass. Never commit client secrets or use chat to transfer them.

Validation completed: TypeScript; 209 passing Node tests (2 platform skips); rollback database checks for ordinary identities, missing sessions, administrator MFA and OAuth/password separation; server-only identity RPC privileges. No projects, timelines or statuses changed. Scheduling/publication/billing remain unchanged.

At the point this file was written, Google provider enablement and OAuth configuration were still pending. The project and source code are prepared, not a claim of successful public Google login.
