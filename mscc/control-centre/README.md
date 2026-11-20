# NIGHT Control Centre

NIGHT Control Centre is the standalone website for managing the existing MSCC WhatsApp runtime. **The website and bot are hosted on separate servers.**

- The website server serves these static frontend files.
- The bot server runs MSCC and exposes the authenticated `/api/control-centre/*` API through its existing web-panel process. It does not serve the website assets.
- The website host serves these files with the bundled `server.mjs`, which also reverse-proxies `/api/control-centre/*` to the bot server over a private network or authenticated HTTPS tunnel. The browser sees a same-origin API path, so HttpOnly/Secure cookies and CSRF protection work without permissive CORS.

## Preview

The checked-in `runtime-config.js` defaults to mock data. From this directory run:

```bash
npm run check
npm start
```

Open the local preview at `http://127.0.0.1:3000`. It has no live API and cannot change the bot. The production host binds to `0.0.0.0` and the platform's `SERVER_PORT`.

## Live website deployment

For Vercel, follow `deployment/VERCEL.md`. For legacy Bot-Hosting.net hosting, follow `HOSTING-QUICKSTART.md` and `hosting/README.md`: upload the website ZIP, use the start command `node server.mjs`, and activate the provider's HTTPS subdomain. The bundled Node server selects live mode when `NIGHT_API_UPSTREAM` is set and proxies the API server-side. Never expose the bot admin listener publicly. `deployment/README.md` retains the alternative static-web-server/Nginx setup.

## Supported live operations

The bridge uses existing MSCC account lifecycle callbacks, the account registry, profile store, command-setting writer, activity ledger and cloud-storage callbacks. Account A remains the private owner/control account and cannot be removed or moved away from the `control` profile. Other accounts cannot be assigned `control`.

The UI exposes account creation/pairing, reconnect/disconnect/repair, rename, profile assignment, command availability toggles, activity, read-only diagnostics, honest process metrics, sanitized configuration, a complete allowlisted environment inventory (with secret values masked), and bounded source browsing. Configuration contains Bot configuration and Environment variables tabs. General Settings are kept separate from Commands & modules.

Profile CRUD and capability-priority writes, per-account module overrides, raw environment writes, secret reveal/export, filesystem mutation, archive extraction, shell execution, systemd control and arbitrary commands are intentionally not implemented. The File Explorer retains its normal navigation, preview/editor and action layout, but production write actions are visibly disabled because MSCC uses immutable releases and rollback. Storage page loading is passive; an explicit administrator action performs a MEGA connection check.
