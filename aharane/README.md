# Aharane — standalone WhatsApp bot

Aharane is deployed beside NIGHT/MSCC on the same Azure host, but it is a separate application and service. It does **not** run inside the MSCC process or use MSCC account management.

## Isolation contract

| Resource | NIGHT / MSCC | Aharane |
|---|---|---|
| Linux service | `mscc.service` | `aharane.service` |
| Application | `/opt/mscc/current` | `/opt/aharane/current` |
| Persistent state | `/var/lib/mscc` | `/var/lib/aharane` |
| Environment | `/etc/mscc.env` | `/etc/aharane.env` |
| WhatsApp auth | MSCC account auth root | `/var/lib/aharane/whatsapp-auth` |
| HTTP listener | MSCC's existing port | `127.0.0.1:8790` |
| Node dependencies | MSCC package install | Aharane's own package install |

Aharane has its own Node process, Baileys socket, auth state, allowlist and release directory. It shares only the host's CPU, memory, disk and network. Restarting or updating one system must not restart, rewrite, or delete the other's files or process.

## Baileys security baseline

Aharane uses the official `@whiskeysockets/baileys` package, pinned to `7.0.0-rc14`. The upstream maintainer's advisory for CVE-2026-48063 identifies `7.0.0-rc12` as the first patched v7 release; Aharane is pinned beyond that threshold. Aharane also disables history-message sync and rejects `messages.upsert` events containing `requestId` as defense in depth. Do not replace this pin with a third-party fork without reviewing its published source and package contents.

## Initial behavior

- One independent WhatsApp identity.
- Pairing-code API and a small mobile-friendly pairing page.
- `!ping` and `!help` are the only initial commands.
- Direct messages are denied unless the sender is explicitly allowlisted in Aharane's environment.
- Group messages, LID-only identities, broadcasts and unknown senders are rejected.
- The admin API is protected by a server-generated bearer token.
- Auth files are stored outside the public directory with restrictive filesystem permissions.
- No shared MSCC database, accounts, commands, environment variables or credentials.

This is the independent runtime foundation. Additional Aharane commands and AI features can be developed inside this directory without changing NIGHT.

## Pairing after installation

The service binds to loopback at `127.0.0.1:8790`. Do not expose this port directly to the public internet.

From the server shell (for example, through ConnectBot), request a pairing code without exposing the local API publicly:

```bash
TOKEN="$(sudo sed -n 's/^AHARANE_ADMIN_TOKEN=//p' /etc/aharane.env | tail -1)"
curl --fail-with-body -fsS -X POST http://127.0.0.1:8790/api/pair-code \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"2348012345678"}'
unset TOKEN
```

Replace the sample number with the number that will become Aharane. Enter the returned code in WhatsApp → Linked devices → Link with phone number. The linked identity is Aharane's own; it is not an MSCC linked account.

The page at `http://127.0.0.1:8790/` can also be opened through a trusted authenticated reverse proxy to this local port. Do not put the token in a URL, shell history, a chat, or source control.

## Configure inbound access

Edit only Aharane's environment file:

```dotenv
AHARANE_OWNER_NUMBER=2348012345678
AHARANE_ALLOWED_SENDERS=2348012345678,14155550123
```

Both settings accept comma-separated international digits. Leave the allowlist empty to deny all incoming commands. The initial release does not support group messages.

After changing the environment file:

```bash
sudo systemctl restart aharane.service
sudo systemctl status aharane.service --no-pager
```

## Development

Requires Node.js 24.

```bash
npm install
npm test
npm run check
npm start
```

Set `AHARANE_DATA_DIR` to a dedicated local directory and set `AHARANE_ADMIN_TOKEN` to a random value of at least 32 characters. Never point it at an MSCC auth or data directory.

## Deployment

The separate GitHub workflow `.github/workflows/aharane-azure.yml` runs tests on pull requests and pushes. Production deployment is available only through an explicit manual dispatch on `mscc-azure` with the confirmation value `deploy`, followed by the existing protected Azure environment approval.

The installer creates a dedicated `aharane` Linux service account and only changes `/opt/aharane`, `/var/lib/aharane`, `/etc/aharane.env` and `aharane.service`. It does not edit or restart `mscc.service`, the MSCC release symlink, MSCC configuration, or MSCC auth data.


## ZIP update packages

The Aharane Control Centre has a separate **Deploy update** workflow. It does not replace the Files Manager. A ZIP is eligible only when it contains a root-level `aharane-update.json` manifest identifying it as an Aharane update. See [UPDATE-PACKAGE.md](UPDATE-PACKAGE.md) for the exact format and file rules.

ZIP updates install to a fresh directory under `/opt/aharane/releases`, atomically switch only `/opt/aharane/current`, and preserve `/var/lib/aharane` and `/etc/aharane.env`. The service checks the new release on startup and restores the previous release when the local health check fails. The updater never changes the NIGHT/MSCC service or files.


## Aharane Control Centre

The separate Vercel project lives under `aharane/control-centre`. It provides private sign-in, runtime status, WhatsApp pairing, direct ZIP deployment and a ZIP package library in the Files Manager. Each stored package has a three-dot menu with **Update Aharane** and **Remove ZIP** actions. The Files Manager also includes a separately saved source-file browser/editor for approved Aharane code and text files under `src`, `public`, `scripts`, `test` and `examples`. It creates a clean release backup before the first edit, runs project checks before applying changes, restarts Aharane and uses the startup health check to roll back failures. Pending edits can be discarded to restore the clean backup. The editor does not expose environment variables, WhatsApp auth or persistent data.

The Control Centre requires an authenticated HTTPS tunnel to Aharane's loopback API at `127.0.0.1:8790`. Never bind that listener to a public interface. See [control-centre/README.md](control-centre/README.md).

## ZIP update packages

See [UPDATE-PACKAGE.md](UPDATE-PACKAGE.md) for the required root-level `aharane-update.json` marker, ZIP layout, protected paths, file limits and rollback behavior. A valid package can be generated independently by an AI coding assistant or another build environment; it does not need to come from GitHub.
