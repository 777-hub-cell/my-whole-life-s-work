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

Translate the Chats heading, account switcher, chat visibility control, starred-message control, chat-appearance control, account/conversation subtitle, search field without a leading glyph, and All / Unread / Groups / Archived segmented filter. Keep the order and control sizes of the current web toolbar. The empty state is one compact centered “No chats match.” line inside a single card. Connected state must render real conversation rows with web-equivalent avatars, previews, relative timestamps, unread count, pinned/muted and outgoing status indicators. Account counts, unread counts, search and actions must stay scoped to the selected Private or Public account.

Opening a conversation is a full-screen native route with a top bar, in-conversation search, message timeline, date separators, incoming/outgoing bubbles, attachments/media previews, reply/attachment actions and composer. Preserve the user's chat privacy invariants: opening messages must not send read receipts or presence, and view-once image/video media must only be opened once. Do not mark a conversation read merely because the screen was rendered. (Conversation history is loaded through the authenticated Aharane API. Text/media sending, OGG/Opus voice-note recording, replies, reactions, starring, copying, same-account forwarding, deletion requests, media opening and view-once image/video viewing are wired to the existing server. Opening history may advance Aharane's local inbox read marker, but it does not call WhatsApp read-receipt or presence APIs.)

### Files and source editor

Translate the Files title and subtitle, search without a leading glyph, naturally wrapping New file / Upload / New folder / Export Bot Source actions, breadcrumb, selection toolbar, file/folder list, and Update packages section with View all and package count. Folders must sort A–Z first, then files A–Z. Do not add View or Sort controls. The empty list card includes the centered empty message, sorting hint and Code editor / Open editor callout inside that same card.

A file's three-dot menu is a compact white floating native popup anchored at that row's three-dot control, approximately 190dp wide. It contains Rename, Duplicate, Move, Download as ZIP and Delete. It overlays the existing rows, does not add a row or spacing, does not resize the list or expand the selected row, and dismisses on outside tap or action selection. Keep the popup white even when the Studio theme is dark, matching the web menu.

Opening a source file switches to the dedicated full-screen dark editor. Translate the web editor's visual language: #1e1e1e editor canvas, #252526 toolbar/explorer, #2d2d2d tab strip, selected tab with #007acc top accent, monospaced code at 13–14sp / 21dp line height, line-number gutter, file explorer drawer, editor keyboard accessory row, and #007acc status strip. Keep the global tab navigation hidden in editor mode. Multiple tabs, an active-file Explorer tree, selection-aware accessory-key insertion and keyboard-safe layout are implemented; preserving each document's selection and scroll position across tab switches remains a refinement.

### ENV

Translate the ENV heading and the current subtitle: “Managed environment values for the Private and Public accounts. Command prefixes are fixed by Aharane.” Render the actual server-provided environment values with fixed/read-only labels where appropriate, and the current prominent Save changes action. The empty disconnected state is a quiet single divider/rule before Save changes; do not add demo variables or an invented Add variable action. Saving must report the result returned by the server and never display a false success.

### More

Keep the current compact More sections and order:
- Accounts & owners.
- Tools: Activity and logs; Storage information.
- Preferences: Appearance (System / Light / Dark / AMOLED, accent, interface size, corners, spacing and editor preferences).
- Support: Help; About Aharane.
- Development: Studio source.
- Change password and Sign out actions.

Use plain title/subtitle rows rather than decorative icon tiles. The native Studio source page must explain that Kotlin app source is bundled into the installed package and cannot be edited as a web HTML file at runtime. Account state and owner identities, activity and storage summaries, password change and sign-out use the authenticated server where their controls are enabled. Some secondary activity actions (live tail, copy/export) remain inactive.

Dialogs and bottom sheets should preserve web Studio spacing/radius, white/dark surface, type hierarchy and dismissal behaviour.

## Current implementation state

The current native branch contains a real Android application, not a static mock-up. The normal app launch is gated by HTTPS server verification and Studio password sign-in. Debug-only sample screens are enabled only in a debuggable APK with the explicit `aharane_preview_mode` launch extra.

Implemented and connected:

- Kotlin + Jetpack Compose shell, web-matched navigation order, bundled Bricolage Grotesque and Instrument Sans fonts, light/dark/AMOLED palettes, and on-device appearance preferences.
- Secure server connection and password sign-in. The received HTTP-only session cookie is persisted in Android Keystore-encrypted storage; the Studio password is not saved.
- Home status and account state, Private/Public account pairing/reconnect/repair/stop/restart actions, owner settings, configuration and recent activity.
- Chats list and conversation history scoped to the selected Private or Public account, account-specific visibility and appearance settings, starred messages, search/filter controls, local inbox unread markers, and foreground refresh while the app is open.
- Conversation composer for text, media attachments and OGG/Opus voice notes; reply composition; message star/unstar, emoji reactions, copy, same-account forwarding and delete requests; normal media opening; and one-time view-once image/video handling.
- Files tree and full-screen editor connected to the authenticated file API. Supported actions include creating files/folders, uploading, viewing/editing, checksum-aware save, rename, duplicate, move, delete, download and ZIP export, plus server-side Apply/Discard for staged edits.
- ENV load/save, owner-identity load/save, account management, activity retrieval/clear, storage summary, password change and sign-out.
- Periodic Android background notification checks, subject to OS scheduling and battery/network policy.
- Debug-only emulator fixtures isolated from normal app launch and production data.

Current limitations / remaining acceptance work:

- The one-time admin password setup must first be completed in the web Studio; Android does not yet accept the one-time setup code.
- Foreground refresh currently polls the authenticated API; a persistent WebSocket stream is not implemented. Background notification checks are periodic jobs, not guaranteed push delivery.
- There is no Room-backed offline cache or reliable offline workspace sync. Text drafts survive Compose save/restore for the conversation screen but are not a durable outbox.
- Normal image media can be previewed in-app. Regular audio/video/document attachments are opened by installed Android apps; the single-use view-once video path is app-local and cache-backed.
- Some secondary Activity actions such as live tail/copy/export are still disabled. Full media-gallery management, message pagination, full editor language-server features and all web-only management tools are not yet parity-complete.
- The debug APK is not a signed production release. Release signing needs an owner-supplied signing key and separate release validation.
- Latest CI unit tests and debug APK assembly passed. The web reference screenshots were captured, but the native emulator capture script then failed because it did not scroll the Home list to the Configuration row. That test flow is being corrected and must pass before screenshot parity is accepted.
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
