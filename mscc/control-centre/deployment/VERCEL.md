# NIGHT Control Centre on Vercel

Vercel project root: `mscc/control-centre`. Framework: Other (no frontend framework). Build command: `node tools/build-vercel.mjs`. Output directory: `dist`. The build includes only `index.html`, `css/`, and `js/`; application source, local host, tests and docs must not be served as static assets.

## Architecture and isolation

The existing MSCC bot, WhatsApp sessions, database and MEGA transfers remain on Azure. The existing web app runs on Vercel with a small same-origin API proxy. It does not handle media or long-running bot processes.

All Vercel Preview and Development environments remain mock-only. The server-side policy requires `VERCEL_ENV=production` **and** `VERCEL_GIT_COMMIT_REF=mscc-azure` and a valid HTTPS upstream before live mode is enabled. A deployment of `main` remains mock-only even when marked production. Confirm the Vercel-managed Git reference exists at function runtime.

## Configuration

Set only for Vercel Production, and only after validating the **existing** authenticated HTTPS route:

- `NIGHT_API_UPSTREAM`: HTTPS origin of the existing secure upstream, without path, query, userinfo or fragment. It must not be a directly exposed Azure administration port.
- `NIGHT_API_ACCESS_CLIENT_ID` / `NIGHT_API_ACCESS_CLIENT_SECRET`: optional paired service-token variables for an already operating trusted upstream. Do not create a new Cloudflare service for this task.

Keep `WEB_PASSWORD`, `WEB_SESSION_SECRET`, MEGA credentials, WhatsApp authentication, and bot data on Azure. Do not put access tokens in frontend JavaScript or a GitHub commit. The default mock UI works with no production secrets.

## Proxy and security

`/api/control-centre/*` rewrites to `api/night-proxy.js`. `/runtime-config.js` and `/healthz` rewrite to their respective Vercel functions. The API proxy forwards request body (maximum 64 KiB), accepted method, query parameters, cookies, CSRF, and Origin. It overwrites forwarded host/protocol, rejects redirects, caps API response at 2 MiB and uses a bounded timeout. Sensitive responses are no-store. This is not a MEGA download/upload transport.

The Azure backend remains authoritative for login, sessions, permissions, Account A protection, CSRF and administrative audit logs. Login throttling currently relies on the Azure socket peer, which can combine multiple visitors behind a single proxy. Never use unverified client IP headers as a quick fix. Only introduce a cryptographically authenticated proxy identity if justified and tested.

## Tests and release

Run `npm --prefix mscc/control-centre run check` and `npm --prefix mscc/control-centre run build:vercel` from the repository root, `npm --prefix mscc run check:mega`, `npm --prefix mscc run check:control-centre`, and finally `npm --prefix mscc run check` on Node 24 with project dependencies installed.

Inspect the deployed Vercel preview itself: static resources, runtime mock configuration, health endpoint, API 503, and mobile/desktop layouts. A green source check is not a deployed preview check.

Production deployment must be reviewed under `mscc/AGENTS.md` and integrated into the approved NIGHT release batch. Keep the previous Vercel deployment and Azure release for rollback. Promote a previously verified Vercel deployment or revert the source/configuration if the website fails; use the existing protected Azure rollback path for bot failures.

**Not yet established by source-level tests:** a live secure upstream, production login and mutations, real MEGA contributor-side decryption/permissions, and actual device rendering. Do not report these as verified until tested.
