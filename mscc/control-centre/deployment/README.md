# Separate-host deployment notes

The NIGHT Control Centre frontend is a static website. The MSCC process on the bot server exposes only `/api/control-centre/*`; it does not serve the frontend.

1. Deploy the contents of `mscc/control-centre/` (excluding `deployment/`, `tests/`, `tools/`, and the Node package files if the host only needs static assets) to the website server's web root.
2. Keep the checked-in `runtime-config.js` in mock mode for previews. On the production website host, copy `deployment/runtime-config.live.js` to the web root as `runtime-config.js`.
3. Configure the website server to reverse-proxy `/api/control-centre/` to the MSCC web-panel listener on the bot server. Use the Nginx example here or an equivalent Caddy/Apache rule. The proxy must preserve the browser-facing `Host` and forward the original HTTPS scheme as `X-Forwarded-Proto`.
4. Keep the bot management listener private. Use a private network or authenticated tunnel and allow inbound access only from the website server. Do not publish the bot's MSCC port directly.
5. Set a strong `WEB_PASSWORD` in protected MSCC service configuration and ensure `/var/lib/mscc/data/` is writable by the MSCC service account for the mode-0600 admin audit log. Keep HTTPS enabled on the website.
6. Test sign-in, logout, API reads, a reversible command-setting toggle, Account A protection and the legacy `/` panel before enabling any state-changing account operations. Use a disposable linked account for pairing tests.

The reverse proxy is necessary because the browser client intentionally uses same-origin cookies and requests. Do not change the frontend to permissive CORS or cross-site cookies as a shortcut.

This repository change does not deploy either server. The website server's deployment and the private network route must be configured separately.
