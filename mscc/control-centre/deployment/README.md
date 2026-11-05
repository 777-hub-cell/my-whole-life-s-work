# Separate-host deployment notes

The NIGHT Control Centre frontend is a static website with a small bundled Node.js host (`server.mjs`). The MSCC process on the bot server exposes only `/api/control-centre/*`; it does not serve the frontend.

## Bot-Hosting.net Node.js deployment

For the Node.js hosting panel, upload the complete website ZIP and extract it so `server.mjs`, `package.json`, `index.html`, `css/` and `js/` are in the deployment root. Set the start command to `node server.mjs`, then activate the provider's HTTPS subdomain. The server binds `0.0.0.0` and `SERVER_PORT` (or `PORT`). It starts in safe mock mode.

To connect the real bot, configure the server-side `NIGHT_API_UPSTREAM` environment variable with an authenticated HTTPS tunnel to Azure. For Cloudflare Access, also set `NIGHT_API_ACCESS_CLIENT_ID` and `NIGHT_API_ACCESS_CLIENT_SECRET` as masked secrets in the hosting panel. Do not put credentials in the ZIP or browser runtime. See `../hosting/README.md`.

## Static hosting with an external reverse proxy

1. Deploy the contents of this directory to the website server's web root, excluding `deployment/`, `tests/`, `tools/`, `hosting/`, and the Node package files if the host only needs static assets.
2. Keep `runtime-config.js` in mock mode for previews. On the production website host, serve `deployment/runtime-config.live.js` as `/runtime-config.js`.
3. Configure the website server to reverse-proxy `/api/control-centre/` to the MSCC web-panel listener over a private network or authenticated tunnel. Use the Nginx example here or an equivalent Caddy/Apache rule. The proxy must set the original website host in `X-Forwarded-Host` and forward the original HTTPS scheme in `X-Forwarded-Proto`.
4. Keep the bot management listener private. Do not publish the MSCC port directly.
5. Set a strong `WEB_PASSWORD` in protected MSCC service configuration and ensure `/var/lib/mscc/data/` is writable by the MSCC service account for the mode-0600 admin audit log. Keep HTTPS enabled on the website.
6. Test sign-in, logout, API reads, a reversible command-setting toggle, Account A protection and the legacy `/` panel before enabling any state-changing account operations. Use a disposable linked account for pairing tests.

The reverse proxy is necessary because the browser client intentionally uses same-origin cookies and requests. Do not change the frontend to permissive CORS or cross-site cookies as a shortcut. The API trusts forwarded host/scheme only when the MSCC listener is reachable through a trusted proxy/tunnel; do not accept arbitrary public traffic with spoofable forwarded headers.

This repository change does not deploy either server or configure its private network. The website server's deployment and the private route must be configured separately.
