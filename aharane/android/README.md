# Aharane — Native Android companion

Aharane Android is a native Kotlin + Jetpack Compose companion to Aharane Local Studio. It is not a WebView wrapper and it does not run a second WhatsApp/Baileys bot. It connects to the same authenticated Aharane server used by the web Studio.

## What is implemented

- Native Home, Files, ENV, Chats, More, Configuration, Accounts & owners, and Appearance screens using the web Studio's layout, typefaces and restrained visual system. The app does not provide an editor for its own Kotlin/Java/application source. The Files Code Editor remains for Aharane bot/server workspace files.
- HTTPS server discovery and password sign-in. The app stores the authenticated session cookie in Android Keystore-encrypted storage; it does not store the Studio password or a permanent admin token.
- Live server-backed service/account state, owner identities, environment values, activity, storage summary and workspace files.
- Native file/folder create, upload, open, edit, rename, duplicate, move, delete, download and ZIP export operations, including the server's staged Apply/Discard flow.
- A real update-package library in Files: 50 MB ZIP upload, SHA-256 chunking, server-side manifest/archive validation, saved-package listing, Remove, explicitly confirmed Update bot deployment, and polling of the server deployment/health-check state. Release switching and rollback remain server-owned safeguards.
- Private and Public WhatsApp inboxes kept separate, with account-scoped chat filters, search, visibility controls, starred messages, and conversation history.
- Text and media sending, OGG/Opus voice-note recording, reply composition, message reactions, starring, copying, forwarding within the same account, deletion requests and single-use view-once image/video handling.
- Conversation media rendering with inline image/sticker previews, video thumbnails and external playback, native audio playback controls, decoded voice-note waveforms where the Android codec exposes PCM samples, document details and Save actions, and contact/location cards. Unsupported or unavailable attachments show explicit states.
- Account reconnect/repair/stop/restart/pairing controls, owner configuration, ENV save, appearance preferences, password change and sign-out.
- A server-backed Code Editor Problems panel for JavaScript and JSON syntax diagnostics, with line/column results and navigation; syntax colouring for JavaScript/JSON, HTML/XML, CSS/SCSS and YAML.
- An editor Console panel using the authenticated Web Studio activity feed (/api/activity) with real stored runtime event messages, source, severity, timestamps and details. It is not a raw systemd/journal terminal or a guaranteed continuous stdout stream.
- Foreground inbox refresh and OS-scheduled background notification checks. Android may defer periodic jobs based on battery and network conditions.
- A visible Preview banner and explicit no-server-write guards for demo actions. Sample accounts, chats, files, package entries and editor examples remain separate from live server state.
- Explicit debug-only design fixtures for emulator screenshot testing. Fixtures require both a debuggable build and the explicit `aharane_preview_mode` launch extra; normal application launches never load the samples.

## Connecting the app

1. Make sure the existing Aharane service is running and reachable over HTTPS through the configured reverse proxy.
2. Complete the one-time Studio password setup in the Aharane web Studio if it has not already been done. The native app does not generate or display the server's one-time setup code.
3. Install and open Aharane Android.
4. Enter the HTTPS address of your web Studio, for example `https://your-host/aharane/studio`.
5. Connect to the server, then sign in with the Studio password you already created.

The WhatsApp sessions, bot commands, persistent chat history and workspace files remain on the Aharane server. Pairing or reconnecting an account in the app operates on that existing server session. Private and Public account operations remain independent.

## Privacy and behaviour

- The app uses HTTPS only; cleartext traffic is disabled.
- The password is used for the sign-in request only. The received session cookie is encrypted with an Android Keystore key.
- Opening a conversation reads cached history and calls the read-only incremental sync endpoint when connected. It does not update Aharane's inbox read marker, call WhatsApp's read-receipt API, or expose online presence.
- View-once media is requested through the server's single-use endpoint. View-once video is played from a temporary app-cache file and that file is deleted when its viewer closes.
- The built-in syntax checker currently supports JavaScript (Node --check) and JSON (JSON.parse); other source types receive a clear unsupported-checker state even when they have syntax highlighting. Full language-server diagnostics are not implemented.
- Animated GIF and animated WebP playback use Android's animated image decoder on supported Android versions. Lottie/TGS vector stickers and some proprietary sticker payloads remain unsupported. Contact cards expose available vCard name/phone/email/address fields; location messages with coordinates can open a map. Poll options render read-only because the server has no voting endpoint.
- Audio waveform bars are only drawn when Android successfully decodes actual PCM samples. If the codec does not expose samples, the player omits the waveform rather than fabricating it.
- The editor Console reads the server's persisted ActivityStore feed; raw process stdout/stderr and system journal streaming are not exposed by the existing server API.
- Background notification checks are periodic, not push delivery. Android Doze, battery saver and network policy can delay them.
- Debug fixtures are never used as connected account data. A disconnected app shows the real connection/sign-in screen and does not invent chats, files, account status or uptime.

## Known limits

- The first admin password must be created in the web Studio; initial one-time setup is not part of the Android sign-in UI.
- Chats use an encrypted Room/SQLCipher offline cache and timestamp/message-ID delta sync. A WorkManager job checks for sync every 12 hours on unmetered networks; it is OS-scheduled and can be delayed. The bot/server Files workspace itself is still server-backed and is not mirrored offline.
- Regular audio/video playback uses installed Android apps. This is separate from the in-app, temporary view-once video player.
- The debug APK produced by CI is for testing. A production-signed release requires a release signing key and separate release validation.
- The final acceptance step is installation and end-to-end use on the target Samsung Galaxy A16 against the actual Aharane HTTPS server. An emulator build cannot prove device-specific permissions, media codecs, notifications, or server connectivity. The current PR remains a development candidate until the latest commit passes unit/build and emulator screenshot capture, then package/media/editor/live/offline/Preview acceptance checks are performed.

## Build and test

Requirements: JDK 17 and Android SDK platform 36 (Android 16).

```sh
./gradlew testDebugUnitTest assembleDebug
```

The bundled Bricolage Grotesque and Instrument Sans font assets and OFL notices are checked into the Android source. Gradle does not download fonts during a build.

APK output:

```
app/build/outputs/apk/debug/app-debug.apk
```

## Project boundaries

- Do not create a second WhatsApp runtime or copy WhatsApp auth directories to Android.
- Do not read, modify, deploy or share NIGHT/MSCC services, data, auth directories or environment files.
- Do not place permanent server secrets, admin tokens or WhatsApp credentials in the APK, source tree, preferences or logs.
- Merge, production deployment and signed release publication are separate approval steps.


## Chat appearance and offline storage work on this branch

The existing Chat settings now include the native Chat Appearance Studio. It supports global defaults, separate Private/Public account overrides and individual conversation overrides. Current controls include Android Photo Picker wallpapers, built-in solid/gradient choices, crop/fit and blur/dim/brightness, incoming/outgoing bubble styling, typography, conversation density, avatar/sender/date/time visibility, media radius and audio style, and reusable starter/custom profiles with JSON import/export. The resolved appearance is applied to the full-screen Compose conversation UI.

The local-first chat foundation uses Room with SQLCipher. A random database passphrase is wrapped by an Android Keystore AES key; encrypted database/key material and cached media live under app-private no-backup storage. Conversation identity is account plus WhatsApp JID; message identity adds the server message ID. The native app loads cached rows before syncing. A separate read-only GET /api/chats/:accountId/:jid/sync endpoint accepts timestamp cursors for incremental and older-page reads without advancing WhatsApp inbox/read markers. Cached search covers message text, sender and media filename. Failed sync keeps prior cached rows.

Normal attachments can be encrypted using AES-GCM after downloading. The file is verified before the database records it as available offline. Private/Public media is isolated and separately limited. View-once media is excluded from permanent storage.

### Remaining release acceptance

This implementation still needs a clean current-head Android build, unit and instrumentation tests, emulator walkthrough and screenshot review, and real Galaxy A16 / Android 16 testing. It is not yet release-complete. There is no durable idempotent outgoing message queue, optional app lock, WorkManager constrained sync, full cross-conversation/date search UI, complete state reconciliation for every edit/delete/pin/mute/archive event, or fully implemented animated/vector sticker, inline video-control and poll interaction parity. Migration and Keystore invalidation recovery also need dedicated test coverage. No production deployment or merge is authorised by this development work.
