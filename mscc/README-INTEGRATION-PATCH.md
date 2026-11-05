# NIGHT Control Centre — integration PR

This is an additive, separately hosted website + MSCC API integration for `777-hub-cell/my-whole-life-s-work`. It targets the current `mscc-azure` baseline through the feature branch `feature/night-control-centre-20261102`.

- The website is deployed on its separate hosting server from `mscc/control-centre/`.
- The bot server keeps the current MSCC runtime and exposes API routes only under `/api/control-centre/`.
- The website server reverse-proxies that API path to the bot server over a private network or authenticated tunnel.
- The existing root `/` panel and legacy `/api/*` endpoints remain unchanged.
- `mscc/index.js`, account/auth/session stores, production environment files and `mscc/release-batch.json` are not changed.

See `mscc/docs/NIGHT-CONTROL-CENTRE-INTEGRATION.md` and `mscc/control-centre/deployment/README.md` for exact topology and deployment requirements. No production server is changed by this source patch.
