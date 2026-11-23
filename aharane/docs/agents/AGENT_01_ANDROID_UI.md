# Agent 01 — Android UI, Navigation, Design System & Motion

**Initial status:** NOT STARTED  
**Owner:** Agent 01  
**Last updated:** 2026-11-23

## 1. Mission

Deliver a cohesive, polished native Android application that faithfully matches the approved Aharane Studio web UI while behaving like a well-crafted Android app. Own the shared shell, navigation, design tokens, reusable components, app-wide interaction patterns, motion system, accessibility and cross-screen visual QA.

“Modern” is not permission to invent a new visual identity. The existing web Studio is the visual source of truth. Translate it into Kotlin/Jetpack Compose; do not embed HTML or use a WebView. Do not replace it with generic Material templates, oversized cards, neon colours, decorative gradients or excessive pills.

## 2. Mandatory context and research

Read MASTER_PROJECT_CONTEXT.md, AUTONOMOUS_EXECUTION_PROTOCOL.md and all ten agent briefs. Also inspect:
- aharane/android/WEB-TO-NATIVE-UI-SPEC.md
- aharane/control-centre/index.html
- aharane/control-centre/styles.css
- aharane/control-centre/app.js
- aharane/control-centre/production-bridge.js
- Android README, requirement ledger, audit/research docs, build files, tests and screenshot workflows.

The current web Studio files—not an old screenshot, prototype or memory—are the visual source of truth. Compare at equivalent viewport sizes. Record conflicts and resolve them using the autonomous decision protocol.

## 3. Binding visual and product requirements

### Exact web-to-native parity
- Reproduce the Studio's hierarchy, layout, typography, spacing, dimensions, borders, surfaces, icon weight, alignment, anchored menus, sheets, dialogs and interactions.
- Native Kotlin + Jetpack Compose only. No WebView, HTML-rendered screens or generic placeholder pages.
- Preserve bottom navigation order: Home, Files, ENV, Chats, More.
- Hide global header/navigation in full-screen conversation and source editor.
- Brand wordmark belongs on Home only; do not repeat it on every screen.
- Do not add top-level back buttons; use contextual back navigation inside nested destinations.
- Do not add duplicate shortcuts. Visual Command Builder remains More → Tools; do not add a duplicate top-level Files or Builder destination.
- Do not repeat “Preview”/“Online” pills. Show actual state once.
- Accounts & Owners remain within the approved Configuration/More information architecture, not a duplicate destination.
- **Channels are included. Status is excluded completely:** no Status tab, feed, viewer, composer, upload, setting, notification control, shortcut, placeholder or navigation entry. Inherited Status references are conflicts with this explicit owner decision.
- No two buttons, menu entries, gestures or routes should perform the same action. Every action has one canonical entry point and a unique purpose. Add another entry only for a demonstrably distinct context and document why.

### Typography, palette and dimensions
Use the approved WEB-TO-NATIVE-UI-SPEC.md values and verify against current CSS.

Fonts:
- Bricolage Grotesque for display and section headings.
- Instrument Sans for interface/body.
- Bundle licensed font assets in the APK; never fetch at runtime.

Light palette:
- Background #F2F4F3; surface #FFFFFF; ink #12181B; muted #66726F.
- Line #E1E6E4; accent #0E7A5C; soft accent #DDF1EA; error #C2372D.

Dark palette:
- Background #0C1110; surface #151C1B; ink #EAF0EE; muted #8B9895.
- Line #25302E; accent #3CC79A; soft accent #133A2E; error #FF7A6E.

Approved baseline metrics:
- Mobile content max width 640dp; 16dp horizontal padding.
- Display title 30sp; section title 17sp; body 15sp; supporting text 12.5–13sp.
- Card radius 18dp; control radius 12dp; avatar 40dp; icon tile 38dp.
- Search field 46dp; standard button 44dp; compact button 36dp.
- Bottom navigation 58dp, 20dp line icons, 11.5sp labels.
- Preserve actual CSS dimensions where they differ; these metrics are a baseline, not a reason to ignore source styles.

### Component and information architecture
- Use compact meaningful surfaces; do not wrap every row or setting in a card.
- Prefer whitespace, dividers and clear hierarchy over stacked card containers.
- Use consistent icon family, stroke weight and optical alignment.
- Menus anchor to their invoking control and overlay content without resizing rows or shifting the page.
- Preserve actual source labels, ordering and action placement. Do not invent extra controls.
- Empty, loading, error, disconnected and populated states use the same design system.
- Never show fabricated activity, fake counts, fake account state or sample production content.
- Horizontal swipe between main destinations must not steal nested gestures such as media carousels or swipe-to-reply.
- Every control has one clear purpose, one canonical action and real behaviour. No dead controls or duplicate actions.

## 4. Animation and motion system — first-class responsibility

Motion is part of product design, not decoration. Establish shared duration/easing tokens and reusable Compose motion primitives. Keep motion subtle, quick, responsive and consistent. Never delay an action just to finish an animation.

### Motion principles
1. Motion communicates cause, continuity, hierarchy or state. If it communicates nothing, omit it.
2. The UI remains responsive and usable while motion runs.
3. Prefer transform/alpha/clip animation over expensive relayout, large blur or heavy shadows.
4. Avoid playful spring overshoot and long elastic curves unless the reference explicitly uses them.
5. Do not animate every item on every recomposition.
6. New data must not flash the screen, jump content or replay entrance animations.
7. Handle interruption, rapid taps, back navigation, process recreation and reduced-motion settings.
8. Animation never substitutes for real progress or confirmed success.
9. Respect Android system animation scale and app reduced-motion preference.
10. Motion must not block touch, scroll, keyboard input, accessibility focus or screen-reader announcements.

### Shared timing targets
Treat these as starting targets and tune against the web reference and real devices.

| Motion | Target |
|---|---:|
| Press / tiny feedback | 80–140 ms |
| Icon/toggle/state change | 120–180 ms |
| Message arrival/send settle | 160–220 ms |
| Menu/popover | 140–200 ms |
| Bottom sheet | 200–280 ms |
| Screen transition | 180–260 ms |
| Chart enter/update | 220–360 ms |
| Media viewer enter/exit | 180–260 ms |

Use restrained deceleration for entering content, acceleration for exiting content and standard/ease-in-out for state changes. Avoid hard-coded durations scattered across screens; maintain one shared motion token source.

### Required animation behaviours

**Navigation**
- Destination changes feel continuous and quick, without a blank flash.
- Nested-screen entry has spatial continuity; returning restores scroll and selection state.
- Do not replay every list entrance animation after returning.
- Back/system navigation safely cancels or completes transitions.

**Charts and analytics**
- First load reveals chart data smoothly from baseline or with restrained fade/scale.
- Date/account changes transition without flashing or misleading interpolation between unrelated datasets.
- Keep axes, labels and tooltips stable; do not animate every data point excessively.
- While fetching, show compact skeleton/progress; never animate an empty chart as if it contained data.
- On error, show a clear retry state; stale data may remain only if marked stale.

**Loading and asynchronous work**
- Consistent progress treatment for initial loading, refresh, pairing, saving, upload and download.
- Prefer inline progress for local actions; full-screen loading only when the whole destination is unusable.
- Keep progress in a stable position so content does not jump.
- Never show success before backend confirmation.
- Show real byte/step progress when available. For indeterminate work, use honest indeterminate feedback; never invent percentages.

**Media downloads**
- Each media item visibly distinguishes not downloaded, queued, downloading, paused/retrying, complete and failed.
- Show smooth progress ring/bar near the thumbnail or download affordance using actual transferred bytes when available.
- Throttle/coalesce progress updates to avoid jank.
- On completion, transition to open/play affordance without shifting thumbnail or row geometry.
- On failure, show concise error and retry; preserve resume capability if backend supports it.
- Cancellation stops the actual transfer and settles to truthful state.
- Do not show an endless generic spinner when actual progress/state exists.

**Chat motion — coordinate with Agent 02**
- Outgoing bubble appears promptly and settles naturally; reconcile server echo without duplicate bubbles.
- Incoming message inserts smoothly without unexpectedly moving the user's reading position.
- Reply gesture follows the finger, progressively reveals its affordance and snaps back cleanly on cancel.
- Reactions use subtle pop/settle without bubble layout jumps.
- Sticker selection/send has visual continuity where feasible, but actual sending never waits for decoration.
- Media selection/send preserves thumbnail continuity where feasible.
- Voice recording shows clear recording state and live waveform/progress; never obscure duration or cancel/send controls.
- Typing/recording indicators appear/disappear without shifting the whole conversation.
- Agent 02 owns message-specific implementation; Agent 01 owns shared motion tokens/primitives and cross-app consistency.

**Sheets, dialogs, menus and controls**
- Sheets rise/fade from their actual anchor; dismissal by back/outside/swipe follows the component's intended behaviour.
- Menus remain anchored and never resize rows.
- Toggle motion reflects persisted state; revert if save fails.
- Press feedback does not imply operation success.

**Splash/startup**
- Branded splash is short and purposeful; never delay app readiness for decoration.
- Do not disguise server verification as a decorative animation.
- Startup must not wait on an animation completion callback.

### Motion performance and accessibility
- Target stable 60 fps on supported devices; use higher refresh where available.
- Avoid main-thread image decode, synchronous I/O, heavy compositing and per-frame allocations.
- Use lazy lists and stable keys.
- Animated GIFs/stickers must not all animate in long lists. Pause offscreen items and expose user controls.
- Respect system reduced motion; screen readers must not announce animation frames.
- API 26 must not invoke unguarded newer APIs.

## 5. Interaction specifications

### General
- Every tappable control has one clear label/purpose and visible pressed/disabled/loading feedback.
- Every control invokes a real action. No dead buttons, fake toggles or false success.
- Do not duplicate actions across toolbar, overflow, bottom navigation and contextual menus.
- Destructive actions require clear confirmation and must not be placed where accidental taps are likely.
- Touch targets should be at least 48dp where practical while retaining compact visuals through internal padding.
- Handle rapid taps, double submission, offline state, permission denial and process recreation.
- Icon-only controls need meaningful accessibility descriptions.

### Gestures
- Main-tab swipe must not hijack media gallery swipe or message reply gesture.
- Define gesture ownership and nested-scroll priority explicitly.
- Swipe-to-reply belongs to Agent 02 and is the primary reply gesture if confirmed by approved design; do not also add a redundant Reply menu item unless required for accessibility/platform reasons.
- Long-press opens contextual message actions; avoid duplicating primary actions elsewhere.
- Drag/drop shows target feedback and recovers from cancellation.

### Data states
Every data-driven screen defines first-load, refresh, empty, no-results, disconnected/offline, recoverable error/retry, permission-required and stale-data states. Keep existing content visible during background refresh when safe.

## 6. Android compatibility and performance

- Minimum OS: **Android 8.0 / API 26**.
- Maximum validation target: **Android 16 / API 36**.
- Do not silently raise minSdk. Inspect Gradle and dependency minSdk before adding libraries.
- Guard newer platform APIs and provide compatible paths for API 26–35.
- Test API 26, a representative mid-range device/API and API 36.
- Test compact phones, large font/display scaling, light/dark, keyboard open/closed, portrait and supported rotation.
- Keep scrolling, navigation, media opening and composition smooth on lower-memory devices.
- Use lazy rendering, stable keys, image downsampling/caching and bounded decode memory.
- Avoid unbounded media caches, eager full-resolution image decoding and offscreen animated stickers.
- Never block UI thread with disk/network/JSON/image work.
- Record frame/jank observations and memory-sensitive scenarios.

## 7. Screenshot acceptance — every screen, no redundancy

Build a screenshot inventory from the real navigation graph. Capture every implemented user-facing screen and each meaningfully distinct state, not just Home/dashboard.

Coverage includes:
- Home: connected and disconnected.
- Files: populated, empty, selection/menu and editor.
- ENV: loaded and disconnected/error.
- Chats: Private/Public, filters, empty/search.
- Conversation: normal, keyboard/composer, reply/context interaction, media viewer, sticker tray, voice note, loading/offline/error.
- Channels list/detail and implemented channel update types.
- More, Preferences/Appearance, Accounts & Owners/Configuration, Help/About and distinct nested settings.
- Pairing/reconnect/repair.
- Visual Builder, Engine Library, Scheduler, Notes and other feature screens: coordinate with owners and include them in integrated screenshot suite without taking feature ownership.
- Distinct high-risk dialogs/sheets/menus.

Rules:
1. Capture from a real running build with realistic non-sensitive fixtures or a connected test environment. Never fake production data.
2. Use a consistent device profile/viewport for comparison.
3. Capture light/dark for shared shell and representative screens; include other appearance modes where relevant.
4. Include API 26/API 36 screenshots for compatibility-sensitive layouts.
5. Use descriptive filenames and an index mapping image → screen/state/device/theme.
6. Inspect every image for clipping, overflow, wrong typography, misalignment, missing assets, blank canvas, stale loading, duplicate controls and visual drift.
7. Automation producing a file is not visual acceptance; human inspection is mandatory.
8. One capture per distinct state/interaction; no near-identical duplicates without a stated comparison purpose.
9. Never include phone numbers, credentials, private messages or secrets.

## 8. Collaboration and ownership

- Agent 01 owns shared tokens, global shell/navigation, reusable controls, shared motion primitives, app-wide interaction conventions and general visual QA.
- Agent 02 owns Chat/conversation layouts and message-specific interactions; Agent 01 supplies foundations and consistency review.
- Agents 03–09 own their feature behaviour/APIs. Agent 01 must not duplicate feature logic.
- Agent 10 independently verifies cross-workstream integration.
- Agree component APIs before changing shared files. Avoid concurrent edits to shell/theme files.
- Maintain canonical action inventory and single entry points.

## 9. Implementation plan

1. Audit live HTML/CSS/JS and Compose implementation; produce screen-by-screen parity gap table.
2. Inventory routes, controls, duplicate actions, states and animations.
3. Extract/verify design tokens and implement one source for typography, colours, dimensions, components and motion.
4. Fix shared navigation, insets, nested gestures and keyboard behaviour.
5. Implement reusable loading/progress/empty/error states and transition primitives.
6. Coordinate application across feature screens.
7. Capture/inspect screenshot inventory; fix and repeat.
8. Run API 26/API 36 builds/tests and physical-device performance checks.
9. Update this manifest with decisions, paths, screenshots, tests and evidence.

## 10. Acceptance checklist

- [ ] Native Kotlin/Compose; no WebView/HTML rendering.
- [ ] Screen-by-screen parity with current Studio HTML/CSS/JS.
- [ ] Correct Bricolage Grotesque and Instrument Sans typography.
- [ ] Exact light/dark tokens and measured spacing/components.
- [ ] Five destinations in approved order; full-screen conversation/editor correct.
- [ ] No Status feature anywhere; Channels retained.
- [ ] No duplicate controls/actions or redundant navigation.
- [ ] Shared motion tokens used consistently.
- [ ] Navigation, charts, downloads, media, loading, dialogs and chat motion verified.
- [ ] Reduced motion/system animation scale respected.
- [ ] No fake progress, false success or indefinite spinner when real progress exists.
- [ ] Android 8/API 26 minimum and Android 16/API 36 verified.
- [ ] Smooth scrolling/interactions on lower-end supported device.
- [ ] Screenshot inventory covers every screen/state without redundant captures.
- [ ] Every screenshot visually inspected; blank/missing content fails.
- [ ] TalkBack, touch targets, font scaling, keyboard insets and nested gestures verified.
- [ ] Tests/regressions pass; skipped/cancelled checks disclosed.

## 11. Decision log and progress

Record evidence and decisions, not unanswered questions. Status values: RESOLVED, ASSUMPTION, CONFLICT, BLOCKED.

| Status | Question / requirement | Evidence | Finding / decision | Consequence |
|---|---|---|---|---|
| RESOLVED | Visual source of truth | WEB-TO-NATIVE-UI-SPEC.md and live Studio HTML/CSS/JS | Match web Studio using native Compose | No WebView/generic redesign |
| RESOLVED | Android compatibility | Owner instruction 2026-11-23 | API 26 through API 36 | Android 8 minimum |
| RESOLVED | Status feature | Explicit owner instruction 2026-11-23 | Exclude Status; retain Channels | Remove/ignore inherited Status references |
| RESOLVED | Duplicate controls | Explicit owner instruction 2026-11-23 | One canonical action per purpose | Audit screens for redundant controls |
| IN PROGRESS | Full screen inventory/parity | To be audited | — | Capture every distinct screen/state |

## 12. Completion report

- Status:
- Branch / commit / PR:
- Screen parity audit:
- Design/motion tokens added:
- Canonical action/duplicate audit:
- Files and APIs changed:
- Tests and exact results:
- API 26/API 36/device evidence:
- Screenshot index and visual review:
- Performance/accessibility evidence:
- Remaining limitations:
- Ready for integration:
