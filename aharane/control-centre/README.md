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

The Control Centre includes sign-in, runtime status, WhatsApp pairing, direct ZIP deployment and a Files Manager ZIP package library. Each stored ZIP has a three-dot menu with Update Aharane and Remove ZIP actions. The individual source-file browser/editor remains a separate feature and is not yet connected in this first delivery.
