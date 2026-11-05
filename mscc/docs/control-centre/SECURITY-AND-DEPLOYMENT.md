# Security and deployment — separately hosted NIGHT Control Centre

## Trust boundary and network topology

The browser loads static frontend files from the separate website server. The bot server runs MSCC and only exposes `/api/control-centre/*` through the existing web-panel process. The website server reverse-proxies this path over a private network or authenticated tunnel. Do not expose the bot's admin listener directly to the public internet.

The browser uses the same-origin website path `/api/control-centre`; this is intentional. The trusted proxy must set `X-Forwarded-Host` to the browser-facing website host and `X-Forwarded-Proto` to the original HTTPS scheme. The API uses the forwarded host for its origin check; the MSCC listener must therefore remain private behind that trusted proxy/tunnel and must not accept arbitrary direct callers that could spoof forwarded headers. The API checks `Origin`, uses HttpOnly `SameSite=Strict` cookies and marks cookies Secure behind HTTPS. Unsafe requests require a session-bound CSRF token. Do not solve cross-server communication with permissive CORS or third-party cookies.

## Authentication and audit

The API has a distinct `night_cc_pre` pre-auth cookie and `night_cc_session` administrator cookie, separate from the legacy `mscc_session`. Sessions are random, held in memory and invalidated on restart. Login is limited to ten attempts per ten-minute window by the socket peer. Mutations write an audit record to `/var/lib/mscc/data/mscc-admin-audit.jsonl`; the file is mode `0600`. Mutations fail closed if the audit cannot be written. No secret values, raw phone numbers, pairing codes or session material are included in audit metadata.

A strong `WEB_PASSWORD` must be set in protected service configuration. The same password is used for the legacy panel login and the new admin login, but sessions and CSRF tokens are isolated. Use HTTPS from the browser to the website server and a trusted private route to the bot server. Configure the proxy to overwrite, not pass through, forwarded host/scheme headers.

## Account and profile invariants

- Account A is the permanent private owner/control account and stays on profile `control`.
- Other accounts cannot be assigned `control`.
- The existing account registry and shared profile store remain authoritative.
- The new API does not create a parallel account/profile/session store.
- Account removal and profile assignment are delegated to existing MSCC callbacks after explicit validation.

## Environment and files

Environment metadata is read-only; secret values are never sent to the browser. Environment writes are disabled. The file browser is read-only and exposes selected source/document roots and file types; it excludes hidden, runtime, auth, session, database and secret paths, checks symlinks, validates canonical containment and limits previews to 512 KiB. No arbitrary shell execution, archive extraction, file mutation, systemd control or raw credential view is exposed.

## Supported telemetry

The available callbacks expose process/runtime state, OS load average, process memory, account connectivity and the bounded MSCC activity ledger. They do not expose reliable 24-hour message totals, disk usage, per-account network latency or systemd journal data through this adapter. Unsupported measures are shown as unavailable.

## Website host proxy

For Bot-Hosting.net, use the bundled `mscc/control-centre/server.mjs` as the Node web process. It binds the platform `SERVER_PORT`, serves only the public dashboard assets, and proxies `/api/control-centre/*` server-to-server to a fixed `NIGHT_API_UPSTREAM`. Optional Cloudflare Access service-token credentials are read only from hosting-panel environment variables. Keep the app in mock mode until this authenticated HTTPS upstream is configured.

For other static hosts, use the example in `mscc/control-centre/deployment/nginx-control-centre-api.conf.example` or an equivalent private reverse-proxy rule. The proxy upstream must be reachable only over a private network or authenticated tunnel. The website host serves static files; the bot host serves only the API.

## Rollout

1. Deploy the website-only ZIP to the separate website host. On Bot-Hosting.net use `node server.mjs`; confirm the default mock mode loads and no bot API is contacted.
2. Configure an authenticated HTTPS tunnel from the website server to the private MSCC listener. Set `NIGHT_API_UPSTREAM` and, when using Cloudflare Access, the two masked service-token variables in the hosting panel. Keep the bot port blocked from public ingress.
3. Run `npm run check:control-centre` locally and require the repository Node 24 CI suite to pass.
4. Open a feature PR targeting `mscc-azure`. Do not update `mscc/release-batch.json` or merge this feature PR individually. Include it in the next approved combined release batch.
5. After user-authorized release approval, install into a new immutable release via the protected `mscc-production` workflow. Keep the prior release for rollback.
6. Verify both website proxy and bot API, auth/cookies/CSRF, audit file permissions, legacy panel compatibility, Account A policy and a disposable linked-account lifecycle before opening access to admins.

This source patch does not deploy either server or configure its private network.
