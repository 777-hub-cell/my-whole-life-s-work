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

Opening a conversation is a full-screen native route with a top bar, in-conversation search, message timeline, date separators, incoming/outgoing bubbles, attachments/media previews, reply/attachment actions and composer. Preserve the user's chat privacy invariants: opening messages must not send read receipts or presence, and view-once image/video media must only be opened once. Do not mark a conversation read merely because the screen was rendered. (The native conversation surface is implemented; authenticated message loading, media playback, voice capture, and transport-backed privacy enforcement remain to be connected.)

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

Use plain title/subtitle rows rather than decorative icon tiles. The native Studio source page must explain that Kotlin app source is bundled into the installed package and cannot be edited as a web HTML file at runtime. Account, activity, storage, password and sign-out operations remain unavailable until their authenticated services are connected.

Dialogs and bottom sheets should preserve web Studio spacing/radius, white/dark surface, type hierarchy and dismissal behaviour.

## Current implementation state

Implemented in the native Kotlin branch:
- A custom Studio shell with the exact Home / Files / ENV / Chats / More navigation order, web-matched light/dark palettes, and bundled Bricolage Grotesque + Instrument Sans typefaces.
- A Home dashboard translated to the current service-status, WhatsApp-account, setup/configuration and recent-activity sections, with no generated uptime, activity or message totals.
- A Chats inbox with account separation, search, four filters, sorting, previews, unread counts, pinned/muted indicators, four current toolbar controls, and compact empty state. Chat visibility/starred/appearance dialogs are present; their server-backed data/settings are not wired yet.
- A full-screen native conversation surface with its own header, in-thread search, date dividers, incoming/outgoing message styling, reply preview, attachment action, view-once treatment, and message composer. Conversation data, searches, reply lookups and unread counts are scoped to the active account/JID key; rendering the screen does not mark messages read or send presence.
- A Files browser with naturally wrapping actions, breadcrumbs, search, folder-first A–Z ordering, selection/bulk-action surfaces, Update packages section, and a row-anchored 190dp white floating action menu with the live web actions (Rename, Duplicate, Move, Download as ZIP, Delete). The menu dismisses on outside tap and selection. Disconnected actions show explicit server-connection feedback.
- A native full-screen editor workbench with tabs, expandable Explorer tree, monospaced editable document surface, JavaScript/JSON syntax token colours, synchronized line-number gutter, cursor-aware accessory-key row, Problems / Console panel and status strip. File open/content/save callbacks are exposed; server-backed file access is still pending.
- An API-ready ENV variable presentation with a quiet disconnected state and Save changes action. No invented variables are shown; server save awaits the authenticated API adapter.
- More sections in web order, including Accounts & owners, Activity and logs, Storage information, Appearance, Help, About, Development / Studio source, Change password and Sign out. Appearance controls for theme, accent, interface size, corners, spacing, editor palette, editor font size and line-number visibility persist on-device.
- Debug-only emulator design fixtures for conversations, messages, file trees and source documents. They require both a debuggable APK and the explicit `aharane_preview_mode` launch extra; they are not loaded in normal launches or release builds.
- A design contract and acceptance checklist in this document.

Not implemented yet:
- Secure Android pairing/session authentication and the authenticated Aharane API adapter.
- Live server-backed account state, chats/messages, chat preferences, file tree/content, file mutations, ENV values and ENV saves, logs and storage metrics.
- Media/video/audio playback, voice recording, message reactions and full view-once enforcement at the Android transport layer.
- Full language-server syntax highlighting, cursor/selection and scroll restoration across document switches, and a live bot console.
- Complete configuration/setup workflows and end-to-end permission/error handling.
- Securely integrating server-backed account rows, owner identities, activity/storage details, chat tools, ENV and password actions.
- Final screenshot-by-screenshot review of the newest native APK (both populated debug preview and normal disconnected UI) against the current Chromium web reference, followed by verification on the target Galaxy A16.

## Delivery roadmap

1. **Native UI parity (this PR):** complete every top-level and full-screen surface, reproduce menus, editor, conversation and appearance interactions, capture actual emulator screens, compare with the web source, and correct visual defects. Debug fixtures are allowed only in explicit debug preview mode.
2. **Secure server linking:** add secure initial pairing/sign-in, persistent authenticated session storage, logout/re-link, certificate/TLS validation and server identity checks. Never store a server password or admin token in frontend preferences or source.
3. **Live dashboard and messaging:** connect Home status/metrics, Private and Public accounts, inbox/search/filters, message history and outbound text sending. Opening a chat must not produce read receipts or presence. View-once must be enforced by the message/media transport, not only the UI.
4. **Media and interaction:** implement image/video/audio/document/sticker/GIF rendering, media viewer, voice-note capture/playback, replies, reactions, and message delivery/error states.
5. **Files, editor and operations:** connect the authenticated file tree and content API; implement create, rename, move, delete, upload, download, export, local draft conflicts and verified saving. Wire ENV, Configuration, activity/logs and storage data and saving.
6. **Device QA and release:** validate on the Samsung Galaxy A16 (Android 16), cover system font scale, light/dark themes, permission/keyboard/rotation/accessibility cases, then prepare a signed release. Merge and production deployment require separate explicit approval.

The UI phase is accepted only when the latest APK builds, tests pass, actual emulator screenshots have been inspected, all principal flows in the debug preview are reachable, and a corresponding web-reference comparison has been reviewed. Backend phases are separate: an attractive offline UI is not proof of server integration.

Any UI control whose backing service does not exist must be disabled or clearly identified as a disconnected/local-only draft. A disabled backend operation must never show a false success state. The Android application remains independent from NIGHT/MSCC; no production deployment is part of this PR.

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
