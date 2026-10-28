# Sharing BuildWatch with a phone

Current temporary preview: https://list-defence-backed-sequence.trycloudflare.com/

Send the URL in a text message. Open it in Safari on iPhone; no Expo installation, registration, or App Store build is required. This preview opens directly as a guest.

This free Cloudflare Quick Tunnel is temporary. The Mac must remain awake, online, and running the BuildWatch backend (8765), read-only preview server (8766), and cloudflared tunnel. Closing/stopping these processes, losing connectivity or restarting the computer interrupts access. Restarting a Quick Tunnel normally produces a new link. It is not permanent hosting or a production uptime guarantee. No paid services or billing were activated.

Anyone who has the link can view the public development data. The preview deliberately disables authentication, billing, following, feedback submissions, and administration. Only approved public map read endpoints and exported web assets are available. Existing localhost account/admin access remains unchanged.

Implemented in scripts/share-preview.mjs. It does not read server secrets or account tables, strips incoming credentials, denies writes and non-public APIs, rejects filesystem paths outside exported assets, and requests no search indexing. It forwards public map reads to the existing backend, so published project changes appear without rebuilding the phone app.

Validated the external HTTPS catalog (1,127 public projects), private/admin route denial, mutation denial, and secret/database-file denial. Browser checked at 390 by 844 pixels with map clusters and project details. Actual physical iPhone Safari testing remains for your partner.

Ask Codex to stop the shared preview to revoke this URL, or restart it to obtain a new one. Ask for permanent hosting separately if access should continue while this computer is off.

Cloudflare documentation: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/
