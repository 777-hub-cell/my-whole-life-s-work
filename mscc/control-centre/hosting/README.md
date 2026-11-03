# Deploy NIGHT Control Centre on Bot-Hosting.net

This package is the **website only**. The existing WhatsApp bot and its authenticated management API stay on the Azure/MSCC server. The website host uses a small Node.js process to serve the files and, once configured, proxy same-origin `/api/control-centre/*` requests to the secured Azure API.

## Upload and start

1. Create a **Node.js** deployment on Bot-Hosting.net and choose Node.js 24 (or another supported Node.js 18+ runtime).
2. Upload this ZIP as the deployment archive and extract it at the project root. `package.json`, `server.mjs`, `index.html`, `css/` and `js/` should be directly in the root.
3. Set the startup command to `node server.mjs`.
4. Activate the free HTTPS subdomain in the deployment's **Domains** tab. The app listens on `0.0.0.0` and the platform-provided `SERVER_PORT` (with `PORT` as a fallback).
5. Start the deployment. With no API upstream configured, the dashboard deliberately runs in **demo/mock mode** and cannot change the real bot.

No database, build tool, or third-party npm dependency is required for the website package.

## Connect it to the real bot later

Do not expose the Azure MSCC admin port directly to the public internet. Create an authenticated HTTPS tunnel/private route from the website host to the MSCC web-panel listener on Azure. A Cloudflare Tunnel protected by a Cloudflare Access **service-token policy** is one option.

In the Bot-Hosting deployment's **Environment** settings, set:

- `NIGHT_API_UPSTREAM` — the HTTPS origin of the protected tunnel, e.g. `https://night-api.example.net` (origin only; no path, query or credentials).
- `NIGHT_API_ACCESS_CLIENT_ID` — Cloudflare Access service-token client ID, when using Cloudflare Access.
- `NIGHT_API_ACCESS_CLIENT_SECRET` — matching Cloudflare Access service-token secret.

Keep both Access credentials as masked/secret environment variables. Never paste them into `runtime-config.js`, the ZIP, browser JavaScript, or chat. The app forwards them server-to-server and never exposes them to the browser. Both Access variables must be set together; omit both when the private route uses another authentication mechanism.

The website automatically switches to live mode only when `NIGHT_API_UPSTREAM` is present. It sends browser requests to the same-origin `/api/control-centre/*` path, and the Node server proxies them to the configured Azure upstream while preserving the website's Host/HTTPS context for MSCC's origin and secure-cookie checks.

On Azure, keep the MSCC listener private (ideally bound to loopback behind the tunnel), set a strong existing `WEB_PASSWORD`, and allow only the tunnel agent to reach the local listener. The API uses its own admin password/session and CSRF controls. Do not disable same-origin checks or make the API a public unrestricted port.

## Verify

- `GET /healthz` should return `mode: "mock"` before the API is connected and `mode: "live"` after it is configured.
- Confirm the HTTPS subdomain loads the dashboard.
- Once the secure tunnel is configured, verify sign-in, sign-out, read-only overview, a reversible module toggle, Account A protection and the existing `/` panel.
- Test pairing/reconnect/disconnect only with a disposable linked WhatsApp account, after the read-only checks pass.

This deployment does not move, restart, or replace the WhatsApp bot. Website files live here; the bot/API remains on Azure.
