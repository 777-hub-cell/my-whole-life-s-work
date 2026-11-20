# Aharane web-to-native UI parity contract

This document defines how the Android application translates the existing Aharane Local Studio interface into native Android controls. The web Studio remains the visual and behavioural source of truth. The Android application must be implemented with Kotlin and Jetpack Compose primitives; it must not embed the website in a WebView or use HTML/CSS as its rendered UI.

## Source of truth

Use these files on the `mscc-azure` base branch as the reference:
- `aharane/control-centre/index.html`
- `aharane/control-centre/styles.css`
- `aharane/control-centre/app.js`
- `aharane/control-centre/production-bridge.js`

Do not derive the production UI from the static prototype under `aharane/prototype/`. Server data, account sessions, file operations, and logs must only be displayed when supplied by the authenticated Aharane server. An unlinked Android installation must show an explicit unconnected/empty state, not sample activity, fake files, mock chats, or invented uptime.

## Native implementation rules

- Kotlin + Jetpack Compose, using custom native components and layouts. Do not default to stock Material 3 surfaces, scaffolds, component colours, or placeholder pages.
- Reproduce the web layout and interaction details: hierarchy, type scale, spacing, dimensions, borders, surfaces, icon weight, alignment, menu anchoring, sheets/dialogs, navigation and screen transitions.
- Keep the normal Android status/navigation areas and handle their insets correctly.
- Use the exact web typefaces: Bricolage Grotesque for display/section headings and Instrument Sans for interface/body text. Both are SIL Open Font License 1.1. The Android build pins source commits and bundles the font assets and their license notices into the APK. Do not fetch fonts at app runtime.
- Maintain both light and dark palettes. Light tokens: background #F2F4F3, surface #FFFFFF, ink #12181B, muted #66726F, line #E1E6E4, accent #0E7A5C, soft #DDF1EA, error #C2372D. Dark tokens: background #0C1110, surface #151C1B, ink #EAF0EE, muted #8B9895, line #25302E, accent #3CC79A, soft #133A2E, error #FF7A6E.
- The main content is a narrow mobile-first surface (web max-width 640px), with 16dp horizontal content padding. Match the CSS metrics proportionally: 30sp display title, 17sp section title, 15sp body, 12.5–13sp supporting text, 18dp cards, 12dp controls, 40dp avatars, 38dp icon tiles, 46dp search fields, 44dp standard and 36dp compact buttons.
- Use small, intentional motion and pressed states. Keep the neutral restrained green/grey palette. No neon, decorative gradients, inflated cards or excess badge/chip treatment.
- Verify on an Android emulator using the same device dimensions for all screens. Compare screenshots against the web Studio at equivalent viewport dimensions, then correct spacing, typography and clipping. A successful compilation alone is not design acceptance.

## Shared shell

The header has the 26dp Aharane brand mark, Bricolage Grotesque wordmark, and a compact status control. The bottom navigation is a fixed 58dp five-destination bar in the exact web order (Home, Files, ENV, Chats, More), with 20dp line icons and compact 11.5sp labels. The selected destination uses the accent colour without a Material selected-pill background. Hide the global header/navigation while the source editor or a conversation occupies the full screen.

## Screens

### Home

Translate the live web dashboard structure:
1. “Welcome back” page title and “Your Aharane workspace.” subtitle.
2. A compact service-status card: “Aharane service”, the actual service-connection state, and the explanation that the two WhatsApp accounts are independent.
3. “WhatsApp accounts” rows for Private WhatsApp and Public WhatsApp, each with its real state and Link account / Manage / Reconnect action as appropriate.
4. “Setup” / Configuration row with Private Owner, Public Owner and Public bot number configuration state.
5. “Recent activity” and the real activity log surface.

Do not invent service state, account state, identities, owner numbers or log entries. Until the service is linked, show offline/not-connected state and explain that account linking requires the server. Do not show fake uptime or synthetic message metrics.

### Chats

Translate the Chats heading and the single Private/Public account switch, account/conversation subtitle, search field without a leading glyph, and All / Unread / Groups / Archived segmented filter. Keep chat preferences in More → Chat settings/Appearance rather than adding settings controls to the Chats tab. Keep the order and control sizes of the current web toolbar. The empty state is one compact centered “No chats match.” line inside a single card. Connected state must render real conversation rows with web-equivalent avatars, previews, relative timestamps, unread count, pinned/muted and outgoing status indicators. Account counts, unread counts, search and actions must stay scoped to the selected Private or Public account.

Opening a conversation is a full-screen native route with a top bar, in-conversation search and date filtering, a media gallery with Photos/Videos/Audio/Files/Stickers filters, message timeline, date separators, incoming/outgoing bubbles, attachments/media previews, reply/attachment actions and composer. Preserve the user's chat privacy invariants: opening messages must not send read receipts or presence, and view-once image/video media must only be opened once. Do not advance Aharane's inbox read marker merely because the screen was rendered. History uses the authenticated read-only incremental sync API. Text/media sending, OGG/Opus voice-note recording, replies, reactions, starring, copying, same-account forwarding, deletion requests, media opening and view-once image/video viewing are wired to the existing server.

### Files and bot/server Code Editor

Translate the Files title and subtitle, search without a leading glyph, naturally wrapping New file / Upload / New folder / Export Bot Source actions, breadcrumb, selection toolbar, file/folder list, and Update packages section with View all and a real server-backed package count. The Files Code Editor edits only Aharane bot/server workspace files. Do not add a route for editing the installed Android application's own Kotlin, Java, HTML, CSS or JavaScript source.

The virtual Update packages folder and Update packages manager use the authenticated package API. ZIP upload sends SHA-256-checked chunks, then waits for the server's aharane-update.json manifest/archive validator. Only server-validated packages are listed. Each saved ZIP has Update bot and Remove actions. Deployment requires explicit confirmation, polls the server update status and relies on the server's separate-release health check and automatic rollback. A pending manual edit prevents ZIP deployment on the server. Folders must sort A–Z first, then files A–Z. Do not add View or Sort controls. The empty list card includes the centered empty message, sorting hint and Code editor / Open editor callout inside that same card.

A file's three-dot menu is a compact white floating native popup anchored at that row's three-dot control, approximately 190dp wide. It contains Rename, Duplicate, Move, Download as ZIP and Delete. It overlays the existing rows, does not add a row or spacing, does not resize the list or expand the selected row, and dismisses on outside tap or action selection. Keep the popup white even when the Studio theme is dark, matching the web menu.

Opening an Aharane server source file switches to the dedicated full-screen dark editor. This is not an Android application source editor. Translate the web editor's visual language: #1e1e1e editor canvas, #252526 toolbar/explorer, #2d2d2d tab strip, selected tab with #007acc top accent, monospaced code at 13–14sp / 21dp line height, line-number gutter, file explorer drawer, editor keyboard accessory row, and #007acc status strip. Keep the global tab navigation hidden in editor mode. Multiple tabs, an active-file Explorer tree, selection-aware accessory-key insertion and keyboard-safe layout are implemented; preserving each document's selection and scroll position across tab switches remains a refinement.

### ENV

Translate the ENV heading and the current subtitle: “Managed environment values for the Private and Public accounts. Command prefixes are fixed by Aharane.” Render the actual server-provided environment values with fixed/read-only labels where appropriate, and the current prominent Save changes action. The empty disconnected state is a quiet single divider/rule before Save changes; do not add demo variables or an invented Add variable action. Saving must report the result returned by the server and never display a false success.

### More

Keep the current compact More sections and order:
- Accounts & owners.
- Tools: Activity and logs; Storage information.
- Preferences: Appearance (System / Light / Dark / AMOLED, accent, interface size, corners, spacing and editor preferences).
- Support: Help; About Aharane.
- Change password and Sign out actions.

Use plain title/subtitle rows rather than decorative icon tiles. Account state and owner identities, activity and storage summaries, password change and sign-out use the authenticated server where their controls are enabled. Some secondary activity actions (live tail, copy/export) remain inactive.

Dialogs and bottom sheets should preserve web Studio spacing/radius, white/dark surface, type hierarchy and dismissal behaviour.

## Current implementation state

The current native branch contains a real Android application, not a static mock-up. The normal app launch is gated by HTTPS server verification and Studio password sign-in. Debug-only sample screens are enabled only in a debuggable APK with the explicit `aharane_preview_mode` launch extra. Preview displays a visible banner and uses local fixtures; server-changing callbacks are guarded so Preview actions do not reach a live server.

Implemented and connected:

- Kotlin + Jetpack Compose shell, web-matched navigation order, bundled Bricolage Grotesque and Instrument Sans fonts, light/dark/AMOLED palettes, and on-device appearance preferences.
- Secure server connection and password sign-in. The received HTTP-only session cookie is persisted in Android Keystore-encrypted storage; the Studio password is not saved.
- Home status and account state, Private/Public account pairing/reconnect/repair/stop/restart actions, owner settings, configuration and recent activity.
- Chats list and conversation history scoped to the selected Private or Public account, account-specific visibility and appearance settings, starred messages, incremental delta sync, older-page loading, offline search by text/sender/media filename/date, per-conversation sync state and read-only history retrieval. Opening a conversation does not mark messages read or send WhatsApp receipts.
- Conversation composer for text, media attachments and OGG/Opus voice notes; reply composition; message star/unstar, emoji reactions, copy, same-account forwarding and delete requests; animated GIF/WebP where Android supports decoding, inline video controls, document opening/saving, audio seek/speed and PCM-derived voice-note waveforms when supported, structured contact cards, coordinate-backed map links, read-only poll options and one-time view-once image/video handling.
- Files tree and full-screen bot/server Code Editor connected to the authenticated file API. Supported actions include creating files/folders, uploading, viewing/editing, checksum-aware save, rename, duplicate, move, delete, download and ZIP export, plus server-side Apply/Discard for staged edits. The Android app's own source is not editable from More.
- Update packages are loaded from the real package endpoint; native upload, checksum/chunk transfer, server validation, saved-package removal, confirmed deployment and update-status polling are wired to the existing API. The server retains release isolation and health-check rollback.
- Code Editor syntax colouring supports JavaScript/JSON, HTML/XML, CSS/SCSS and YAML. The Problems panel calls the server's real Node syntax checker for JS and JSON and can navigate to reported lines. The Console panel reads actual persisted server ActivityStore entries and supports refresh/clear.
- ENV load/save, owner-identity load/save, account management, activity retrieval/clear, storage summary, password change and sign-out.
- WorkManager Wi-Fi/unmetered-only chat delta sync every 12 hours, plus existing periodic notification checks; both are subject to OS scheduling and battery/network policy.
- Debug-only emulator fixtures isolated from normal app launch and production data.

Current limitations / remaining acceptance work:

- The one-time admin password setup must first be completed in the web Studio; Android does not yet accept the one-time setup code.
- Foreground refresh currently polls the authenticated API; a persistent WebSocket stream is not implemented. Background notification checks are periodic jobs, not guaranteed push delivery.
- Conversations and message history are cached in Room backed by SQLCipher; the database passphrase is wrapped with Android Keystore. Authenticated delta sync uses a stable account/JID/timestamp/message-ID cursor and does not send read receipts. A 12-hour Wi-Fi/unmetered WorkManager sync is scheduled. Normal media opened/downloaded by the user can be saved in account-scoped AES-GCM cache in no-backup storage. Text messages use a durable encrypted Room outbox with a server idempotency key; retries after an uncertain result are blocked from duplicate sending and shown as Failed/uncertain instead of falsely Sent. Media/voice-note messages are not yet queued offline. Optional app lock uses the Android device credential and stays independent of server login.
- Animated GIF/WebP previews work on supported Android versions; Lottie/TGS vector stickers and some proprietary formats remain unsupported. Contacts and locations show supported available fields. Poll options are read-only because server voting APIs are not available.
- Source diagnostics currently run real Node --check for JavaScript and JSON.parse for JSON; CSS/HTML/YAML are syntax-coloured but not server-validated. The Console is the stored runtime activity feed from the server, not raw system stdout/stderr or journalctl streaming.
- The media gallery browses synchronised messages; a cross-conversation central media library and offline media downloads not yet explicitly marked as kept are not implemented. The durable idempotent queue currently covers text messages; media/voice-note messages remain online-only. Poll voting is not supported by the existing server API. The Code Editor still has the documented limited JS/JSON diagnostics, not a full language server.
- The debug APK is not a signed production release. Release signing needs an owner-supplied signing key and separate release validation.
- Latest web reference captures are available, but the updated native build and emulator screenshot suite for the latest combined change set must pass and be visually inspected before acceptance. A previous commit's build or screenshot does not prove the current commit.
- Final real-device verification still requires installing the APK on the Samsung Galaxy A16 (Android 16) and connecting it to the actual Aharane HTTPS server. Emulator verification cannot prove the device's microphone, media codecs, notification delivery, OS battery behaviour or live server connection.

## Delivery roadmap

1. **Close native feature gaps:** finish conversation actions, keep every request aligned to the server contract, improve foreground refresh and fix remaining disconnected or disabled secondary actions.
2. **Visual acceptance:** capture every important native screen on an Android 16 emulator, compare it with the actual web Studio at the same viewport, and fix layout, scrolling, touch-target, font-scale and keyboard issues.
3. **Device QA:** install the generated APK on the Galaxy A16, test server sign-in, both WhatsApp accounts, media/voice notes, file editing, ENV saving, notifications, permission flows, rotation, and app restarts.
4. **Release preparation:** configure a secure release signing process, build and validate a signed APK, then request explicit approval before merging or deploying anything.

The current PR is a development candidate, not a production release. UI parity is not accepted until the latest screenshot suite passes and the captures have been inspected. End-to-end server acceptance and physical-device testing are separate requirements.

## Acceptance checklist

- [ ] Compare Home, Chats, Files, ENV and More against the web Studio at the same viewport size.
- [ ] Check narrow Android phone width, large font settings and both system themes.
- [ ] Confirm menus overlay rows without layout movement and close on outside tap.
- [ ] Confirm conversation and source editor are full screen with global navigation hidden.
- [ ] Confirm the editor's document field, line numbers, explorer, tabs and keyboard layout behave correctly.
- [ ] Confirm appearance settings update the interface and survive an app restart.
- [ ] Confirm no fake server data, no mock conversations and no fake save/start/stop success.
- [ ] Run unit tests, debug APK build, and real Android emulator screenshot capture.
- [ ] Review every screenshot for clipping, overflows, text mismatch and layout drift before treating the UI as accepted.


## Chat Appearance Studio and encrypted offline chat (development status)

The native Chat settings expand into a Chat Appearance Studio with layered global/account/conversation inheritance, live sample preview, Photo Picker wallpapers, presets, bubble and typography settings, layout and media appearance, and importable/exportable custom profiles. Private and Public settings are independent. The full-screen Compose conversation resolves and applies these appearance settings.

Room plus SQLCipher provides the local database foundation. The random database passphrase is wrapped with Android Keystore, and the encrypted database plus media cache use app-private no-backup storage. A read-only server sync API supports timestamp-based deltas and older message pages; native chat loading reads local history first, then updates it without wiping history on failure. Offline search operates on saved messages. Normal media can be stored with AES-GCM and integrity verification, while view-once media is never cached.

This remains a development branch, not a completed release. Current-head CI, encrypted storage/migration/key-loss/media/search instrumentation, emulator screenshots and visual parity review must pass. Remaining work includes a durable idempotent outgoing-message queue, media-gallery browser, more complete state reconciliation for archive/pin/mute state, vector sticker support and poll voting if the server adds that API. Galaxy A16 / Android 16 live testing is required.


### Remote deletion retention

When WhatsApp reports that another participant deleted an incoming message, the native Hub retains the original message content and marks it as deleted on WhatsApp. The marker is persisted in SQLCipher-backed Room using the 3→4 schema migration and appears in the conversation UI. The account owner's own deletion path remains unchanged. This does not bypass view-once protections; view-once media is not cached or restored by the retained-message marker.


## Remote message deletion retention

When WhatsApp reports that the other participant deleted an incoming message, Aharane retains the original saved message content and any already-downloaded non-view-once attachment in the Hub. The conversation displays “Deleted by the other person on WhatsApp · retained in Hub.” The server stores a remote-deletion marker and timestamp without creating a deletion tombstone. Outgoing messages, unknown-direction messages and view-once media are not converted by this incoming-message retention path. Whole-conversation remote clear events mark known incoming messages rather than wiping the Hub's saved history. Incremental sync includes a separate remote-deletion marker feed so an already-cached message receives the marker even when its original message timestamp is old; Android updates the encrypted Room row and retains its content. The explicit owner-side Delete message action remains separate and keeps its existing delete semantics.
