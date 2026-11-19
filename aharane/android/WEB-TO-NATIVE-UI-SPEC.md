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

The header has the 26dp Aharane brand mark, Bricolage Grotesque wordmark, and a compact status control. The bottom navigation is a fixed 58dp five-destination bar (Home, Chats, Files, ENV, More), with 20dp line icons and compact 11.5sp labels. The selected destination uses the accent colour without a Material selected-pill background. Hide the global header/navigation while the source editor or a conversation occupies the full screen.

## Screens

### Home

Translate the live web dashboard structure:
1. “Welcome back” page title and “Your private bot workspace.” subtitle.
2. Aharane bot hero card with connection state, uptime when available, 24-hour message bars and actual handled-message count, then Start/Stop/Restart actions.
3. Private and Public account rows with their real account identity and connection state.
4. Setup / Configuration row.
5. Recent activity section and View all action.

Never generate uptime, message counts, status, account identities or log entries locally to make the dashboard look populated. Until linked, show neutral not-connected status, unavailable chart values and disabled service controls.

### Chats

Translate the actual inbox header, account switcher, account identity/count text, search field, and All / Unread / Groups / Archived segmented filter. Connected state must render real conversation rows with web-equivalent avatars, previews, relative timestamps, unread count, pinned/muted and outgoing status indicators. The account switcher must keep Private and Public inboxes separate.

Opening a conversation is a full-screen native route with a top bar, in-conversation search, message timeline, date separators, incoming/outgoing bubbles, attachments/media previews, reply/attachment actions and composer. Preserve the user's chat privacy invariants: opening messages must not send read receipts or presence, and view-once image/video media must only be opened once. Do not mark a conversation read merely because the screen was rendered. (Conversation list/backend and conversation detail/media routes remain to be connected/implemented.)

### Files and source editor

Translate the Files title, search, New file / Upload / New folder / Export Bot Source actions, breadcrumb, selection toolbar, and file/folder list. Folders must sort A–Z first, then files A–Z. Do not add View or Sort controls.

A file's three-dot menu is a compact white floating native popup anchored at that row's three-dot control, approximately 190dp wide. It overlays the existing rows, does not add a row or spacing, does not resize the list or expand the selected row, and dismisses on outside tap or action selection. Keep the popup white even when the Studio theme is dark, matching the web menu.

Opening a source file switches to the dedicated full-screen dark editor. Translate the web editor's visual language: #1e1e1e editor canvas, #252526 toolbar/explorer, #2d2d2d tab strip, selected tab with #007acc top accent, monospaced code at 13–14sp / 21dp line height, line-number gutter, file explorer drawer, editor keyboard accessory row, and #007acc status strip. Keep the global tab navigation hidden in editor mode. Preserve multiple open tabs, selection/cursor, scroll position and keyboard-safe layout as editor functionality is completed.

### ENV

Translate the ENV heading and subtitle, Show all secrets control, compact variable cards, monospace 13sp variable labels, value fields, per-variable Show/Hide, three-dot actions, Add variable and Save changes. Secret visibility must be explicit and must not leak into logs or clipboard actions without user selection. Server save is unavailable until the authenticated API adapter exists; never display a false success.

### More

Keep the compact grouped sections:
- Tools: Activity and logs; Storage information.
- Preferences: Appearance (System / Light / Dark, accent, text size and editor preferences as supported).
- Support: Help; About Aharane.

Dialogs and bottom sheets should preserve web Studio spacing/radius, white/dark surface, type hierarchy and dismissal behaviour.

## Current implementation state

Implemented in the native Kotlin branch:
- A custom Studio shell with Home / Chats / Files / ENV / More navigation, web-matched light/dark palettes, and bundled Bricolage Grotesque + Instrument Sans typefaces.
- A dashboard with truthful disconnected states and no generated uptime, activity, or message totals.
- A data-driven Chats inbox UI with account separation, search, four filters, sorting, previews, unread counts, and pinned/muted indicators.
- A full-screen native conversation surface with its own header, in-thread search, date dividers, incoming/outgoing message styling, reply preview, attachment action, view-once treatment, and a message composer. It is not yet wired to the server message stream or media/voice providers.
- A Files browser model with breadcrumbs, search, folder-first A–Z ordering, selection/bulk-action surfaces, and a row-anchored 190dp white floating action menu. The menu dismisses on outside tap and selection.
- A native full-screen editor workbench with tabs, explorer drawer, find field, monospaced editable document surface, synchronized line-number gutter, optional keyboard accessory row, Problems / Output / Terminal panel, and status strip. File contents and save/open callbacks are exposed but still need to be connected to authenticated server file operations.
- Local ENV variable drafts with secret reveal controls. Server save is intentionally unavailable until the secure API adapter exists.
- More / Appearance controls for theme, accent, interface scale, corners, row spacing, editor palette, editor font size, and line-number visibility. These preferences persist on the device.
- A design contract and acceptance checklist in this document.

Not implemented yet:
- Secure Android pairing/session authentication and the authenticated Aharane API adapter.
- Live server-backed account state, chats/messages, chat preferences, file tree/content, file mutations, ENV values and ENV saves, logs and storage metrics.
- Media/video/audio playback, voice recording, message reactions and full view-once enforcement at the Android transport layer.
- Full syntax highlighting, editor selection/cursor preservation across file switches, and a live bot terminal.
- Complete configuration/setup workflows and end-to-end permission/error handling.
- Screenshot-by-screenshot comparison against the live web Studio and verification on the target Galaxy A16.

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
