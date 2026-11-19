# Aharane — Native Android

This is the native Android app for Aharane Local Studio, built with Kotlin and Jetpack Compose. It is not a WebView wrapper. The existing web Studio and Aharane server remain unchanged while native features are developed.

## Boundaries
- The Android app will use Aharane's existing backend; it will not create a second bot runtime.
- WhatsApp sessions, Baileys sockets, commands and persistent bot data remain on the Aharane server.
- Private and Public WhatsApp identities stay separate.
- Never read, modify, deploy or share NIGHT/MSCC services, data, auth directories or environment files.
- Use HTTPS only. Cleartext traffic is disabled.
- Never embed permanent admin tokens, WhatsApp credentials or server secrets in the APK, source, preferences or logs.
- Native sign-in needs a dedicated secure device-session flow. Do not copy the PWA bootstrap token into Android storage.

## First milestone
- Native Android project and Gradle build.
- Home, Chats, Files, ENV and More destinations matching the current Studio.
- Aharane light/dark design tokens.
- Explicit Private/Public account models and account-scoped chat/message models.
- Honest not-yet-linked and empty states, with no fabricated chats or server status.
- Unit tests and a CI-built debug APK.

## Chat invariants
- Private and Public inboxes remain separate.
- Inbox remains forward-only; do not silently import historical WhatsApp chats.
- Opening or previewing a message must not accidentally send read receipts or presence updates.
- Existing hidden-online and read-receipt controls remain authoritative on the server.
- Private bot commands remain restricted to the verified Private self-chat.
- Public command authorization remains restricted to configured Public allowlist and owner rules.
- View-once media retains one-time handling and must not become a reusable download.

The initial shell is not connected to the live server yet.

## Build
Requirements: JDK 17 and Android SDK platform 37.

    ./gradlew testDebugUnitTest assembleDebug

APK output: app/build/outputs/apk/debug/app-debug.apk

## Next steps
1. Design a secure native device-session handshake with the Aharane backend.
2. Add account-scoped Chat loading and pagination.
3. Add Room-backed offline cache and reliable synchronisation.
4. Build full-screen conversations and media viewer.
5. Add notifications and background sync without bypassing privacy settings.
6. Rebuild Files, ENV, Bot Control, account management and remaining Studio features natively.
