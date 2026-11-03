# NIGHT Control Centre

NIGHT Control Centre is the standalone website for managing the existing MSCC WhatsApp runtime. **The website and bot are hosted on separate servers.**

- The website server serves these static frontend files.
- The bot server runs MSCC and exposes the authenticated `/api/control-centre/*` API through its existing web-panel process. It does not serve the website assets.
- The website server reverse-proxies `/api/control-centre/` to the bot server over a private network or authenticated tunnel. The browser sees a same-origin API path, so HttpOnly/Secure cookies and CSRF protection work without permissive CORS.

## Preview

The checked-in `runtime-config.js` defaults to mock data. From this directory run:

```bash
npm run check
npm run serve
```

Open the local preview at `http://127.0.0.1:4173`. It has no live API and cannot change the bot.

## Live website deployment

See `deployment/README.md`. The website host must serve `deployment/runtime-config.live.js` as `/runtime-config.js` and proxy `/api/control-centre/` to the private MSCC web-panel address. Never expose the bot admin listener publicly.

## Supported live operations

The bridge uses existing MSCC account lifecycle callbacks, the account registry, profile store, command-setting writer, activity ledger and cloud-storage callbacks. Account A remains the private owner/control account and cannot be removed or moved away from the `control` profile. Other accounts cannot be assigned `control`.

The UI exposes account creation/pairing, reconnect/disconnect/repair, rename, profile assignment, existing boolean command settings, activity, read-only diagnostics, process metrics, sanitized configuration, storage metadata and bounded source browsing.

Profile CRUD and capability-priority writes, per-account module overrides, raw environment writes, secret reveal/export, filesystem mutation, archive extraction, shell execution, systemd control and arbitrary commands are intentionally not implemented. The file browser is read-only because MSCC uses immutable releases and rollback.
