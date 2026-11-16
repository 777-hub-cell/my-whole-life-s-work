# Aharane Control Centre

A private, separate Vercel website for the independently deployed Aharane WhatsApp bot. It does not share MSCC credentials, paths, accounts, APIs or process state.

## Vercel project settings

Set the project's Root Directory to `aharane/control-centre`. It is a static site with one Node.js serverless API route; no build command is required.

Configure these environment variables on the Vercel project:

- `AHARANE_API_UPSTREAM`: the HTTPS origin of a private, authenticated reverse tunnel to Aharane's loopback API. It must route requests to Aharane's port 8790 without exposing that port directly.
- `AHARANE_API_ACCESS_CLIENT_ID` and `AHARANE_API_ACCESS_CLIENT_SECRET`: optional Cloudflare Access service-token credentials. Set both or neither. When enabled, the service token is added server-side and never reaches the browser.

The existing Aharane service binds to `127.0.0.1:8790`. Do not change it to bind publicly. The tunnel must be outbound from Azure, protected by HTTPS and Access credentials, and route only to Aharane's own listener. Do not reuse the NIGHT/MSCC listener or point this project at its API.

The page asks for Aharane's own admin token. After validation, the Vercel function sets an HttpOnly, Secure, SameSite=Strict cookie and sends the bearer token to Azure server-side. The token is not written to localStorage or included in URLs.

## ZIP upload flow

The browser splits the selected ZIP into 1 MiB chunks. Each request is below the Vercel function body limit. Azure verifies the assembled archive's SHA-256 hash and the root `aharane-update.json` manifest before showing the preview. Deploying creates a new immutable-style release and switches Aharane's own `current` symlink. WhatsApp auth and persistent data remain under `/var/lib/aharane`; environment settings remain in `/etc/aharane.env`.

See [../UPDATE-PACKAGE.md](../UPDATE-PACKAGE.md) for the required ZIP structure and protected files.

## Current scope

The Control Centre includes sign-in, runtime status, WhatsApp pairing, direct ZIP deployment and a Files Manager ZIP package library. Each stored ZIP has a three-dot menu with Update Aharane and Remove ZIP actions. The Files Manager also includes a separately saved source-file browser/editor for approved Aharane code and text files. Save operations do not restart the bot; Apply changes runs the project checks and restarts with automatic backup/rollback. The editor is limited to the Azure Aharane application release and does not edit the Vercel Control Centre source or environment secrets.

## Local Studio and offline use

The Control Centre also includes an installable, offline-capable Local Studio. It reuses this frontend rather than introducing a second dashboard.

- Open **Local Studio** from the sign-in page to use the device-only workspace without an Aharane admin session.
- Import individual files or an extracted project folder. The local workspace supports up to 250 files, 2 MB per file and 20 MB total.
- Files and edits are saved in the browser's IndexedDB on the phone. Protected paths and secret files such as `.env`, credentials, auth folders, `node_modules`, `.git`, backups and logs are excluded from import.
- The website preview loads local HTML, CSS, JavaScript and local image assets in an isolated sandboxed frame. External services and JavaScript module imports may need a deployed preview.
- **Export backup** downloads a JSON backup of the local workspace. Keep a copy outside the browser in case browser data is cleared.
- Install the app from the browser's install prompt, or use the browser's Add to Home screen option. Open it online once so the service worker can cache the application shell.

The service worker caches only the static application shell. It never caches `/api/` responses, admin sessions, bot status, pairing codes or deployment data. Local Studio can be opened offline after its first successful online load; remote bot management still requires an internet connection and a valid sign-in.

Local Studio edits do not modify the live Azure bot or the deployed Control Centre. Use the existing remote Files Manager or validated ZIP deployment workflow when you intentionally want to change Aharane.


## Live bot connection

After sign-in, the dashboard opens `/api/studio/socket` using the browser's same-origin secure session cookie. The Vercel function verifies the request origin and session, then proxies the WebSocket to Aharane's `/aharane/ws` endpoint. The permanent Aharane admin token and any tunnel service credentials never enter browser JavaScript.

The first live protocol supports status snapshots, pings, WhatsApp connection changes and safe command activity events. It does not expose message contents or arbitrary command execution. The client reconnects automatically when a Vercel Function reaches its configured maximum duration.

The shared reverse tunnel must route WebSocket upgrades for `/aharane/ws` to Aharane's loopback port 8790 as well as the existing `/aharane/api/*` HTTP routes. Port 8790 remains private; the router and ngrok configuration must not bypass or replace NIGHT/MSCC root routing.
