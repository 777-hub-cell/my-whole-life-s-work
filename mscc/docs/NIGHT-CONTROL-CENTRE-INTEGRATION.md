# NIGHT Control Centre — separate-host MSCC integration

**Status:** review-branch implementation; not deployed.

## Hosting topology

The dashboard is hosted on a separate website server. MSCC stays on its existing bot server. This patch adds an authenticated API to the existing MSCC web-panel process, but it deliberately does not serve `/control-centre/` or any static frontend assets from the bot server. The existing `/` panel and `/api/*` endpoints remain unchanged.

The website host serves `mscc/control-centre/` with the bundled Node server and reverse-proxies `/api/control-centre/*` to the bot server over a private network or authenticated HTTPS tunnel. The browser therefore calls a same-origin path. The proxy sets the browser-facing host in `X-Forwarded-Host` and scheme in `X-Forwarded-Proto`; this lets the API enforce same-origin requests and issue Secure cookies without CORS or cross-site cookies. For Bot-Hosting.net use `control-centre/HOSTING-QUICKSTART.md` and `control-centre/hosting/README.md`. The Nginx example remains an alternative for static website hosts.

Do not expose the bot's MSCC listener directly to the public internet. The website server must be the only permitted network peer for this API route. The exact private address, tunnel and hosting-server proxy configuration are deployment-specific and are not guessed or configured by this source patch.

## Connected operations

The API uses the existing callbacks supplied by `index.js` to `startWebPanel`: `getState`, `getActivity`, `createAccount`, `renameAccount`, `assignAccountProfile`, `pairAccount`, `reconnectAccount`, `disconnectAccount`, `repairAccount`, `removeAccount`, `setSetting`, `getCloudDashboard`, and `getCloudMounts`. `index.js` is not changed, so the current production `index.js` and its newer approved music-delivery changes remain intact.

- Separate NIGHT admin session, pre-auth token, CSRF token and logout; the legacy panel cookie remains separate.
- Account list, masked number, create/pair by QR or pairing code, reconnect, disconnect, repair, rename and remove.
- Assign an existing MSCC behaviour profile. Account A remains on `control`; `control` cannot be assigned to linked accounts.
- Read existing profile capabilities and boolean command-availability flags; change only existing boolean flags through MSCC's `setSetting` callback.
- Read bounded and redacted MSCC activity, process/runtime metrics, sanitized configuration, cloud-storage metadata and allowlisted source/document previews.
- Administrative audit rows are written before and after mutations to `/var/lib/mscc/data/mscc-admin-audit.jsonl` (mode `0600`); if the audit path is not writable, mutations fail closed.

## Deliberate limits

Per-account module overrides and profile CRUD/capability-priority writes are not available through the inspected `startWebPanel` callback contract. Environment writes and secret reveal/export are disabled. File writes/uploads/deletes/archive extraction, arbitrary shell commands, process restarts, systemd journal access and raw credential access are not exposed.

The dashboard does not invent telemetry. Disk usage, actual 24-hour message totals, per-account latency and systemd journal logs are not available from the current callbacks; unsupported measurements are labelled unavailable. The activity page reads the MSCC activity ledger only.

## Validation

From `mscc/` run:

```bash
npm run check:control-centre
```

The normal repository `npm run check` includes this command. GitHub CI runs on Node 24. This integration branch must still pass the repository's complete PR checks and exact-head workflow before any release. Browser-rendered visual/mobile/accessibility QA and a live WhatsApp lifecycle test are still release gates.

## Deployment sequence

1. Deploy the website-only ZIP to the separate website host. On Bot-Hosting.net use the Node server start command `node server.mjs`; verify mock mode first.
2. Configure the authenticated HTTPS tunnel to the private MSCC listener, then set the upstream and service-token secrets in the website hosting panel. Do not expose the MSCC listener publicly.
3. Confirm the bot service has a strong protected `WEB_PASSWORD`, trusted HTTPS proxy headers and a writable audit directory.
4. Review the PR and full CI. Use the repository's combined NIGHT release-batch process; do not merge an individual feature PR directly into `mscc-azure`.
5. For production, install only into a new immutable MSCC release through the protected `mscc-production` workflow. Never unpack into `/opt/mscc/current` or an active release directory.
6. Verify website login/logout, same-origin proxy behaviour, audit permissions, Account A protection, linked account behavior, and old `/` panel compatibility. Use a disposable linked account for pairing tests. Preserve and verify rollback.

No server was changed by this patch.
