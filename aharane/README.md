# Aharane — standalone WhatsApp bot

Aharane is deployed beside NIGHT/MSCC on the same Azure host, but it is a separate application and service. It does **not** run inside the MSCC process or use MSCC account management.

## Isolation contract

| Resource | NIGHT / MSCC | Aharane |
|---|---|---|
| Linux service | `mscc.service` | `aharane.service` |
| Application | `/opt/mscc/current` | `/opt/aharane/current` |
| Persistent state | `/var/lib/mscc` | `/var/lib/aharane` |
| Environment | `/etc/mscc.env` | `/etc/aharane.env` |
| WhatsApp auth | MSCC account auth root | `/var/lib/aharane/whatsapp-auth` (public) and `/var/lib/aharane/whatsapp-auth-private` (private) |
| HTTP listener | MSCC's existing port | `127.0.0.1:8790` |
| Node dependencies | MSCC package install | Aharane's own package install |

Aharane has its own Node process, Baileys socket, auth state, allowlist and release directory. It shares only the host's CPU, memory, disk and network. Restarting or updating one system must not restart, rewrite, or delete the other's files or process.

## Baileys security baseline

Aharane uses the official `@whiskeysockets/baileys` package, pinned to `7.0.0-rc14`. The upstream maintainer's advisory for CVE-2026-48063 identifies `7.0.0-rc12` as the first patched v7 release; Aharane is pinned beyond that threshold. Aharane also disables history-message sync and rejects `messages.upsert` events containing `requestId` as defense in depth. Do not replace this pin with a third-party fork without reviewing its published source and package contents.

## Private and public WhatsApp identities

Aharane runs one bot engine with two independently authenticated WhatsApp sessions:

- **Private session:** the Private Owner's own WhatsApp account. Its Chats tab displays new live messages received in that account's direct chats, group chats and supported LID chats; it does not import older WhatsApp history. Private bot commands are a separate permission and may run only when sent from that account's verified self-chat, using the narrow Account A pattern from MSCC.
- **Public session:** the public-facing Aharane WhatsApp bot account. The Public Owner is the separate sender number you use to message this account; it must not be the bot account's own paired number. The session accepts direct messages only from that owner or explicitly allowlisted public senders.
- **Owner identities:** Private Owner and Public Owner are separate phone-number identities and must be different. Public `ownerOnly` commands check only the Public Owner. A Private Owner does not inherit public owner privileges.
- **Commands:** `commands/` and `private-commands/` are separate registries. Public and private commands cannot fall through into one another.
- **Shared code:** `plugins/`, `lib/`, the bot engine and common configuration remain shared. A shared plugin must still enforce authorization if it registers its own message, event, HTTP or scheduled entry point.
- **Sessions:** `/var/lib/aharane/whatsapp-auth` is retained as the existing public session. `/var/lib/aharane/whatsapp-auth-private` is the new private session. They are never allowed to share or nest auth directories.
- **Recovery:** the Studio can stop, reconnect, restart and separately back up/re-pair either account. A rejected session is backed up before fresh authentication is created.

The Chats tab is a forward-only inbox, not a WhatsApp archive: full-history sync is disabled, only new live `notify` messages received after the feature is active are captured, and bot replies to those new conversations are included. No prior WhatsApp chat history is imported. For the private session, newly received messages from supported direct, group and LID chats are captured and shown; private command execution remains restricted to the exact self-chat. For the public session, the Chats inbox may capture new supported direct, group and LID chats and lets the owner control which appear. Public bot commands and automatic command replies remain restricted to direct phone-number senders on the configured allowlist; groups, LID-only senders, broadcasts and unknown senders cannot invoke commands. Admin APIs require the existing authenticated Local Studio session. Aharane remains completely separate from NIGHT/MSCC services, databases, auth and deployment.

## Pairing and owner setup

Open Local Studio → **More / Pairing** (or the account-management screen) through the existing HTTPS site.

1. Set the Private Owner number and the different Public Owner number.
2. Save owner settings.
3. Pair the **Private account** using the Private Owner number. Its private command console is that WhatsApp account's own chat.
4. Pair the **Public account** using the phone number that will operate the public-facing Aharane bot. The existing session at `/var/lib/aharane/whatsapp-auth` is retained as Public; do not delete it.
5. Add any other direct-message senders to the optional public allowlist. They do not become Public Owner.

The API also provides account-scoped routes under `/api/accounts/private/*` and `/api/accounts/public/*` for pairing, reconnect, restart, stop and safe re-pair. The older `/api/pair-code` endpoint remains a public-session alias for compatibility.

The service binds to loopback at `127.0.0.1:8790`. Do not expose this port directly to the public internet. The owner settings are stored in `/var/lib/aharane/owner-config.json` with restrictive permissions; they are not source files or environment secrets.

For existing installations, `AHARANE_OWNER_NUMBER` and `AHARANE_ALLOWED_SENDERS` are read as migration aliases for the new public settings. New deployments should use `AHARANE_PRIVATE_OWNER_NUMBER`, `AHARANE_PUBLIC_OWNER_NUMBER` and `AHARANE_ALLOWED_PUBLIC_SENDERS`, or configure the identities in Local Studio.

## Shared AI Reply

AI Reply is an optional, shared text-drafting feature for incoming messages in both Private and Public Chats. Configure `AI_API_KEY`, `AI_MODEL` and optionally `AI_API_BASE_URL` in Local Studio → ENV, or provide the equivalent server environment variables. The default base URL is the OpenAI-compatible `https://api.openai.com/v1`; custom endpoints must support the Chat Completions API. The API key is stored server-side in Aharane's protected Studio settings file and is never returned in ENV or general settings responses.

The long-press **AI Reply** action is shown only when the server reports a usable provider key, model and endpoint. If the provider is not configured, the action is omitted. The feature creates editable text drafts only; the user must review the draft and press Send manually. It never generates voice notes or sends automatically.

For each generation request, Aharane sends only the selected incoming message, the single directly quoted message when that exact quoted message is already loaded locally, plus the user's optional tone and instructions. It does not search or fetch chat history, read other conversations, or send chat identifiers/history to the AI provider. If the quoted message is not already loaded, it is omitted rather than retrieved. Message content is not written to the Aharane activity log.

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


## Aharane Local Studio PWA

The complete Aharane Control Centre is an installable PWA served by Aharane at `/aharane/studio/` through the existing Nginx HTTPS site. It uses same-origin `/aharane/api/*` and `/aharane/ws`, not Vercel or ngrok. Aharane stays on `127.0.0.1:8790`; Nginx strips the isolated `/aharane/` prefix and forwards to that loopback listener. See [infra/DIRECT-HTTPS.md](infra/DIRECT-HTTPS.md).

The plain HTML/CSS/JS app includes its own on-device source editor for `index.html`, `styles.css`, `app.js` and the manifest. Overrides are stored in IndexedDB and applied locally by the service worker. `/studio/recover.html` restores the original PWA if custom code breaks it. Local project files remain usable offline; remote bot functions need internet and sign-in.
## ZIP update packages

See [UPDATE-PACKAGE.md](UPDATE-PACKAGE.md) for the required root-level `aharane-update.json` marker, ZIP layout, protected paths, file limits and rollback behavior. A valid package can be generated independently by an AI coding assistant or another build environment; it does not need to come from GitHub.


## Direct same-origin authentication

The PWA submits the admin token only to Aharane over HTTPS at the isolated same-origin `/aharane/api/` route. Aharane issues a short-lived HMAC-signed HttpOnly, Secure, SameSite=Strict cookie; browser JavaScript cannot read it. API requests and WebSocket upgrades use that same-origin cookie. The permanent admin token stays in `/etc/aharane.env`.

The old Vercel proxy and ngrok-router path are not used by the PWA. Do not change NIGHT/MSCC's existing public routing when enabling the Aharane HTTPS hostname.

### Inbox visibility

Each WhatsApp account has independent visibility settings for individual chats and group chats. Each category can show all conversations except explicitly hidden ones, or show only selected conversations. Per-chat overrides are preserved as new messages arrive. Visibility affects the Chats tab only; it does not change WhatsApp receipt, and it never expands command permissions. Private commands remain self-chat-only, while public bot commands remain limited to the configured allowed direct senders. Broadcast/status/newsletter feeds are excluded.

### View-once media

Incoming WhatsApp view-once photos and videos are labelled separately and are never exposed through the normal reusable attachment URL. Opening one uses an authenticated single-use endpoint: the server marks it consumed, removes its cached media file, and returns it with no-store headers. Local Studio opens it in a temporary in-memory viewer and revokes the object URL when the viewer closes; it does not offer a download action. This limits the Local Studio copy to one viewing session, but cannot prevent screenshots, screen recording or photography of the display.
