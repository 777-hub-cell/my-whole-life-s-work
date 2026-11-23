# Agent 02 — Chat, conversations and messaging experience

**Initial status:** NOT STARTED  
**Owner:** Agent 02  
**Last updated:** 2026-11-23

## Mandatory context — read before acting

Read `aharane/docs/MASTER_PROJECT_CONTEXT.md` and `aharane/docs/AUTONOMOUS_EXECUTION_PROTOCOL.md` in full. Then read **all ten agent briefs** in `aharane/docs/agents/`, not only this one. Inspect relevant existing project Markdown, current source, tests, build/package configuration, API contracts and current GitHub branch state. You must understand the whole Aharane product and how the other nine workstreams affect yours.

## Mission

Own conversation list, filters, conversation screen, composer, reply gestures, media viewer, stickers, voice notes, polls, receipts, contact identity, archive/pin/mute and offline chat behavior. Coordinate backend event/data contracts with Agent 03, UI foundations with Agent 01 and notifications with Agent 09.

Read `aharane/docs/WHATSAPP_ANDROID_FEATURE_RESEARCH_2026-11-23.md` in full before implementation. It defines the research baseline, capability audit matrix, WhatsApp-style interactions and motion references. **Channels are included; Status is explicitly excluded everywhere.** Stickers are a required first-class feature. Verify each capability against the actual installed library and backend; do not assume official WhatsApp app features are automatically available through Aharane's integration.

## Acceptance criteria

Acceptance: intended filters and gestures work; send/receive and media interactions work; receipts reflect actual sent/delivered/read events; offline/reconnect states behave correctly; mock status is never presented as real.

## Ownership and boundaries

Primary ownership: Chat and Conversation feature screens/models/tests. Coordinate shared navigation, repository, database and backend contract changes.

These are coordination boundaries, not permission to overwrite shared files. Check current file overlap and coordinate before changing shared contracts or files.

## Discovery and decision log

Q&A means investigating and resolving questions from repository evidence, not waiting for routine owner answers.

| Status | Question investigated | Evidence (paths/symbols/tests) | Finding and decision | Reason / consequence |
|---|---|---|---|---|
| NOT STARTED | Initial project and implementation audit | — | — | — |

Use RESOLVED, ASSUMPTION, CONFLICT or BLOCKED. Resolve ordinary uncertainty independently and continue.

## Work plan and progress

| Task | Status | Evidence / notes |
|---|---|---|
| Read master context, protocol and all ten briefs | NOT STARTED | |
| Audit current requirements, source and tests | NOT STARTED | |
| Define acceptance tests and dependencies | NOT STARTED | |
| Implement assigned work | NOT STARTED | |
| Run focused and regression tests | NOT STARTED | |
| Verify real runtime/device behavior where applicable | NOT STARTED | |
| Update this document with evidence | NOT STARTED | |
| Submit integration report | NOT STARTED | |

## Files changed

List every changed source, test and documentation path with its purpose.

## Verification evidence

Record exact commands/workflows, environment, pass/fail/not-run results, screenshots and runtime evidence. Never report skipped, cancelled or unrun tests as passed.

## Dependencies and integration contract

Record upstream/downstream agents, API schemas, event formats, data ownership, permissions and contract changes. Notify dependent agents before changing a shared contract.

## Known limitations and follow-up

List unresolved defects, assumptions, risks and intentionally deferred work.

## Completion report

- **Status:** NOT STARTED
- **Branch / commit / PR:**
- **Requirements satisfied:**
- **Files and APIs changed:**
- **Tests and exact results:**
- **Runtime/device evidence:**
- **Remaining limitations:**
- **Ready for integration:** NO

## 1. Non-negotiable product rules

- Private and Public conversations are separate data domains. Conversation identity includes stable account ID plus JID; same JID under two sessions is not one conversation.
- Required filters: All, Unread, Groups, Channels and Archived.
- Receipts mean actual transport events. Never infer delivered/read from online presence, socket connection or message age.
- Swipe-to-reply is the primary gesture. Do not add a duplicate Reply action unless accessibility testing proves a distinct need.
- Stickers are required first-class functionality. Animated formats/GIFs must be capability-checked and resource-bounded.
- Agent 02 owns channel inbox entries, channel timeline and update rendering. Agent 09 owns channel discovery/subscription management and notification preferences. Agent 03 owns transport capability/events.
- Status is explicitly excluded: no tab, filter, feed, viewer, composer, upload, setting, notification, route, placeholder or fixture.
- No fake online states, contacts/photos, receipts, progress or send success. Each action has one canonical entry point.

## 2. Independent work packages

| Package | Scope and output | Can proceed while upstream is unfinished? | Integration gate |
|---|---|---|---|
| 2A — Inbox/index | Private/Public switcher; five filters; search; unread counts; last-message preview; pin/archive/mute/star display; empty/loading/error/offline states. | Yes, using fixture conversations and ChatRepository interface. | Agent 03 conversation contract, Agent 08 persistence interface, Agent 01 shell. |
| 2B — Timeline | Stable message ordering/keys; direct/group/channel bubbles; date separators; pagination; unread marker/scroll-to-latest; sender identity; reactions/edit/revoke state. | Yes, with deterministic message fixtures. | Agent 03 event schema and Agent 08 durable store; echo deduplication verified. |
| 2C — Composer/actions | Text composer/send state; keyboard insets; attachment menu; swipe reply/quote; edit, react, long-press, copy, forward, delete, star and selection. | Yes, against ChatActions interface. | Agent 03 operations, Agent 04 permissions, Agent 01 gesture/inset contract. |
| 2D — Media and rich attachments | Image/video preview and viewer; documents; contacts; locations; download/retry; viewer/back/keyboard behaviour. | UI/viewer can use local assets. | Agent 03 media descriptors/downloads; Agent 08 cache/retention. |
| 2E — Voice, stickers and GIFs | Record/cancel/send/play voice; waveform only from real decoded samples; sticker tray/packs/recents/favourites; static/animated rendering and GIFs. | Picker/rendering can use licensed/test assets. | Agent 03 send formats; Agent 08 cache/queue; unsupported Lottie/TGS/proprietary payloads handled honestly. |
| 2F — Groups and Channels reader | Group timeline/participants/supported actions; Channels filter, channel identity, update timeline and supported renderers. | Layouts/renderers use fixtures. | Agent 03 proves capabilities; Agent 09 provides discovery/subscription contract. |
| 2G — Offline state/reconciliation | Cache-first load; stale/offline state; pending/failed text sends; retry/dedupe; reconcile edits/revokes/receipts; failed sync preserves cache. | State machine and tests can be built before persistence. | Agent 08 owns encrypted store/outbox; Agent 03 owns server events/results. |
| 2H — Real integration | Private/Public send/receive, receipts, media, voice, stickers, reply, Channels and offline/reconnect. | Prepare test cases now. | Real test accounts/server; Agent 10 independently verifies. |

### Work that must continue during dependency waits
While Agent 03 builds transport, complete 2A–2F with fixture-backed adapters matching the future real interface. While Agent 08 builds storage, complete offline state transitions and repository contracts. Mocks belong only in test/debug source; connected production sessions must never silently show fabricated messages. Report UI verification separately from real backend verification.

## 3. Chat contract

Publish and consume a versioned client contract with:
- Stable AccountId; ConversationId = account scope + JID; message ID and stable ordering key.
- Conversation kind (direct/group/channel); do not overload group as channel.
- Author/direction, text/caption, timestamp, type, reply target, reactions, edit/revoke markers and receipt state.
- Separate pending, sent, delivered, read and failed states with event provenance/timestamps.
- Attachment states: remote, cached, downloading, queued, failed, expired/unavailable. View-once media never enters ordinary permanent cache.
- Operations for list/sync/history, text/media/sticker/voice send, edit/delete/reaction and supported retry.
- Explicit unsupported, unauthorized, offline, rate-limited and server-error outcomes.

Agent 03 owns transport shapes; Agent 08 owns persistent schema/encryption/migrations/cache; Agent 04 owns authorization. Agent 02 maps these contracts into UI/domain states and does not independently redefine backend events or Room schema.

## 4. File boundaries

Own native Chat/conversation screens, message presentation/actions, chat-specific reducers/view models, chat adapters, fixtures and tests. Verify current exact paths; ConversationScreen.kt is an audit lead.

Do not own WhatsApp sockets/pairing (03), owner policy (04), global theme/navigation (01), DB encryption/schema/cache (08), notifications or channel subscription management (09). If a Room column, server event or endpoint is needed, file a contract change request; the relevant owner implements the shared change. Agree one editor before touching shared repository/API files.

## 5. Verification gates

- [ ] Account-scoped list/search/cache/media/forwarding/notification links never cross Private/Public.
- [ ] Real sent/delivered/read events update receipts; online presence never does.
- [ ] Stickers send/render for proven formats; unsupported formats show clear fallback.
- [ ] Channels reading exists and Status is absent.
- [ ] Swipe-to-reply works without redundant Reply controls.
- [ ] Keyboard, media viewer, nested gestures and back behaviour work.
- [ ] Offline cache/outbox survives restart and avoids duplicate accepted sends.
- [ ] Unit, UI, contract, real integration and API 26/API 36 tests are separately reported.
- [ ] Screenshots cover inbox, populated/empty chat, keyboard, reply, media, stickers, voice, Channels and offline/error states; every image inspected.
- [ ] Agent 10 independently verifies isolation/security.

## 6. Progress and completion report

Track package status 2A–2H, contract version/consumers, files changed, exact tests, real Private/Public evidence, media/sticker/voice/channel capability matrix, screenshot review, offline/reconnect evidence, limitations, branch/commit/PR and next unblocked package. A blocked upstream integration must not stop fixture-based work.

- Status:
- Package status:
- Chat contract version/consumers:
- Files/APIs changed:
- Tests/results:
- Real Private/Public evidence:
- Media/sticker/voice/Channel capability matrix:
- Screenshot index/review:
- Offline/reconnect/deduplication evidence:
- Limitations:
- Branch/commit/PR:
- Ready for integration: NO
