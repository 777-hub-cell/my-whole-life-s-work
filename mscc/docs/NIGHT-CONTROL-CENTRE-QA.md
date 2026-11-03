# NIGHT Control Centre — integration QA

**Date:** 3 November 2026  
**Scope:** frontend, API bridge and legacy web-panel coexistence; no live-server deployment.

## Locally verified

- Backend API self-test passed: anonymous rejection, pre-auth/session login, CSRF, same-origin validation, Account A profile lock, linked-account `control` rejection, account repair/removal guards, command-setting mutations, readonly file paths, nested secret redaction and mode-0600 audit log.
- Web-panel integration self-test passed: API-only backend routing, reverse-proxy Host/HTTPS origin handling, Secure/HttpOnly/SameSite cookies, CSRF rejection, authorized settings mutation, and legacy `/` panel plus `/api/login` and `/api/state` compatibility.
- Frontend `npm run check` passed: JavaScript syntax checks and 12 tests (12 passed, 0 failed).
- Local UI preview remains mock-only and does not call the live backend.
- `index.js` is unchanged by this patch. The checked-in `mscc/web-panel.js` and `mscc/package.json` match the current repository baseline at the start of this feature branch.

## Not yet verified

- The repository's full Node 24 `npm run check` has not yet run against the exact GitHub feature commit.
- No browser-rendered visual, mobile, keyboard or accessibility acceptance run was completed in this environment.
- No live API proxy has been configured from the separate website server to the bot server. The correct private address, firewall allowlist and tunnel/route must be supplied by the actual hosting environment.
- No live WhatsApp account creation, QR/code pairing, reconnect, disconnect, repair or removal was exercised against a real session. Use a disposable linked account for such tests; never test lifecycle operations on Account A.
- No Azure deployment, production release approval or live server modification was performed.

## Known limits

- Profile CRUD, capability-priority writes and per-account command overrides are not exposed because the current MSCC callback contract does not provide safe writers for those stores.
- Environment values are metadata-only for secrets; environment writes are disabled.
- File browsing is read-only and allowlisted; shell, systemd control, file mutation and archive extraction are not exposed.
- The activity pane reads the MSCC activity ledger, not systemd journal output.
- Disk usage, exact 24-hour message totals and per-account network latency are unavailable and are not fabricated.

## Release posture

This is a review candidate only. The website stays on its separate host. MSCC exposes API routes only. The UI's checked-in `runtime-config.js` remains in mock mode; use `deployment/runtime-config.live.js` on the website host only after the private reverse proxy is ready. Do not update `mscc/release-batch.json`, merge directly to `mscc-azure`, or deploy as part of an individual feature PR.
