# Aharane — Native Android companion

Aharane Android is a native Kotlin + Jetpack Compose companion to Aharane Local Studio. It is not a WebView wrapper and it does not run a second WhatsApp/Baileys bot. It connects to the same authenticated Aharane server used by the web Studio.

## What is implemented

- Native Home, Files, ENV, Chats, More, Configuration, Accounts & owners, Appearance, and full-screen source editor screens using the web Studio's layout, typefaces and restrained visual system.
- HTTPS server discovery and password sign-in. The app stores the authenticated session cookie in Android Keystore-encrypted storage; it does not store the Studio password or a permanent admin token.
- Live server-backed service/account state, owner identities, environment values, activity, storage summary and workspace files.
- Native file/folder create, upload, open, edit, rename, duplicate, move, delete, download and ZIP export operations, including the server's staged Apply/Discard flow.
- Private and Public WhatsApp inboxes kept separate, with account-scoped chat filters, search, visibility controls, starred messages, and conversation history.
- Text and media sending, OGG/Opus voice-note recording, reply composition, message reactions, starring, copying, forwarding within the same account, deletion requests, normal media opening, and single-use view-once image/video handling.
- Account reconnect/repair/stop/restart/pairing controls, owner configuration, ENV save, appearance preferences, password change and sign-out.
- Foreground inbox refresh and OS-scheduled background notification checks. Android may defer periodic jobs based on battery and network conditions.
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
- Opening a conversation updates Aharane's local inbox read marker; it does not call WhatsApp's read-receipt or presence APIs.
- View-once media is requested through the server's single-use endpoint. View-once video is played from a temporary app-cache file and that file is deleted when its viewer closes.
- Regular image media can be previewed in the app. Other regular audio/video/document attachments are handed to a compatible Android viewer/player.
- Background notification checks are periodic, not push delivery. Android Doze, battery saver and network policy can delay them.
- Debug fixtures are never used as connected account data. A disconnected app shows the real connection/sign-in screen and does not invent chats, files, account status or uptime.

## Known limits

- The first admin password must be created in the web Studio; initial one-time setup is not part of the Android sign-in UI.
- The app refreshes live server data while open and uses periodic Android jobs for background notification checks; it does not yet use a persistent WebSocket connection or a Room-backed offline copy of the workspace.
- Regular audio/video playback uses installed Android apps. This is separate from the in-app, temporary view-once video player.
- The debug APK produced by CI is for testing. A production-signed release requires a release signing key and separate release validation.
- The final acceptance step is installation and end-to-end use on the target Samsung Galaxy A16 against the actual Aharane HTTPS server. An emulator build cannot prove device-specific permissions, media codecs, notifications, or server connectivity.

## Build and test

Requirements: JDK 17 and Android SDK platform 36 (Android 16).

```sh
./gradlew testDebugUnitTest assembleDebug
```

The build fetches pinned Bricolage Grotesque and Instrument Sans font assets and their OFL notices. The machine performing a clean build therefore needs network access.

APK output:

```
app/build/outputs/apk/debug/app-debug.apk
```

## Project boundaries

- Do not create a second WhatsApp runtime or copy WhatsApp auth directories to Android.
- Do not read, modify, deploy or share NIGHT/MSCC services, data, auth directories or environment files.
- Do not place permanent server secrets, admin tokens or WhatsApp credentials in the APK, source tree, preferences or logs.
- Merge, production deployment and signed release publication are separate approval steps.
