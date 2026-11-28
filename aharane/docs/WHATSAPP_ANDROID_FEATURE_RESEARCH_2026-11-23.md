# WhatsApp Android Feature & Motion Research — 23 November 2026

**Purpose:** Research reference for Aharane Agent 02 (Chat) and Agent 01 (shared Android UI/motion). This is a product-design reference, not a promise that Aharane's current WhatsApp transport library exposes every capability. Verify each feature against the actual installed Baileys fork/version, server event model, API contract and account/session policy before implementation.

**Research date:** 2026-11-23  
**Target:** Android 8 (API 26) through Android 16 (API 36)  
**Binding owner decision:** Aharane includes **Channels** but excludes **Status completely**. Do not implement Status even though it remains part of WhatsApp.

## 1. How to use this research

- Use WhatsApp as an interaction/feature reference, not as a reason to copy every screen or product area.
- Reproduce familiar chat behaviours within Aharane's established native visual identity and web-to-native parity rules.
- Separate stable officially documented behaviour from beta/gradual-rollout reports.
- Mark a capability SUPPORTED only after proving the installed library, backend and Android client work end-to-end.
- If backend does not expose an action, omit it or show a truthful unavailable state. Never fake it.
- Preserve Private/Public session separation, server-side authorization and privacy invariants.
- Do not introduce Status as a fallback for Channels.

## 2. Core Chat experience

### Conversation list
- Private/Public account switcher; rows, search, unread counts and actions scoped to selected account.
- Search conversations by identity and supported message content.
- Filters: **All, Unread, Groups, Channels, Archived**. Channels is explicitly required; Status is explicitly excluded.
- Rows show actual contact/group identity, avatar, latest message/media preview, timestamp, unread count where applicable.
- Pinned/muted indicators appear only when true.
- Outgoing status uses actual transport/receipt state; never infer delivery/read from online/presence.
- Distinct empty, no-results, offline, loading and error states.
- Archive/pin/mute must reconcile with server/session state, not local-only fake toggles.

### Conversation header and timeline
- Header identifies real contact/group/channel and selected account context.
- Contextual in-chat search/date filtering if supported by current design.
- Chronological messages, date separators, replies, reactions, media/document/audio/contact/location/poll previews and system events.
- Preserve scroll position when opening/closing contextual views and loading older history.
- Incoming messages must not yank user away from older history. Auto-scroll only when already near latest message or explicitly requested.
- Do not mark history read merely because a screen rendered. Follow Aharane's approved read-receipt policy and real server events.
- View-once media must not be cached, persist as a thumbnail, or appear in a gallery after viewing.

### Composer and attachments
- Multiline text composer with send, emoji/sticker access and attachment entry.
- Attachment picker exposes supported content types without multiple buttons for the same operation.
- Investigate photos, videos, documents/files, audio/voice notes, contacts, location and polls.
- Preserve native keyboard/IME insets; composer stays visible without jumping or overlapping.
- Uploads show real progress, cancellation/retry where supported and truthful completion.
- Do not claim sent until transport/server confirms acceptance. Reconcile optimistic UI with actual message identity and avoid duplicate bubbles on server echo.

## 3. Messaging features to audit and implement where supported

### Text and formatting
- Text, multiline entry, links and link previews.
- WhatsApp-style bold, italic, strikethrough, monospace/code and quote formatting only after verifying syntax and transport support.
- Edit/delete only if protocol/API confirms support and permissions; show eligibility/time limits only when known.
- Copy, same-account forwarding, reply/quote, star/save and search.
- Do not add a duplicate Reply menu item if swipe-to-reply is the approved primary interaction, unless accessibility/platform needs justify it.

### Reactions
- Emoji reaction, counts/list, add/change/remove own reaction.
- Reconcile real reaction events and removals.
- Keep reaction UI compact and attached to message; never obscure text.
- Double-tap quick reaction only if it does not conflict with approved swipe-to-reply and is consistently implemented.

### Voice messages and video notes
- Record, cancel/discard, send, playback, pause/resume, seek and speed where supported.
- Display duration and waveform; waveform must reflect actual media amplitude when available, not decorative fake bars.
- Transcript/speed controls only if backend/API supplies them.
- Video notes are distinct round/inline video messages; implement only if transport support is verified.
- Handle permission denial, interrupted recording, microphone contention, low storage and backgrounding.

### Photos, videos, documents and audio
- Inline previews, fullscreen viewer, zoom where appropriate, video controls, document opening/saving and audio playback.
- Preserve aspect ratio; never stretch.
- Show upload/download state in place with actual progress.
- Use thumbnails and bounded decode sizes; do not decode full-resolution media in list rows.
- Media viewer hides chat keyboard while open, dismisses correctly and restores conversation state.
- View-once media is excluded from persistent cache/gallery and enforces one-time viewing.
- Documents show name/type/size and use safe content URIs.

### Stickers and GIFs — required first-class feature
- Sticker tray/picker integrated into composer.
- Recently used stickers and installed/downloaded packs.
- Pack browsing, metadata, add/remove where protocol permits.
- Static and animated stickers.
- Correct transparency/aspect ratio; no unwanted white/black background.
- GIF search/selection/playback only if supported.
- Sticker send must be reliable and immediate, with message identity/retry/error handling.
- Sticker messages render as expressive media, not oversized generic file bubbles.
- Avoid animating all stickers in long conversations; pause offscreen items and expose animation controls/preferences.
- Test actual formats from transport. Current native implementation notes say GIF/WebP decode works on supported Android versions while Lottie/TGS vector stickers remain a gap; do not assume support without tests.

**2026-11 observation:** WABetaInfo reported sticker reactions rolling out to some Android beta testers on 18 November 2026, including static/animated stickers and up to 20 sticker reactions per message. This is a beta/gradual rollout report, not a stable universal contract. Treat sticker reactions as research-only until protocol support and stable availability are verified.

### Groups
Investigate group identity, participants/profile image, metadata/permissions, mentions/member identity, polls, events, replies, reactions, media, participant changes/system messages, pin/mute/archive and notification controls.
Group voice chat/calling is outside assumed scope unless product owner explicitly adds it and transport supports it.

Official WhatsApp group pages describe polls, events/RSVPs, large file sharing, group customization, disappearing messages and view-once messages. The official August 2026 group update describes poll expiry, anonymous voting, editing a poll within 15 minutes, and @all mentions with restrictions for large groups. Implement only the subset exposed by Aharane's actual API.

### Polls and events
- Poll display shows question, options, actual vote totals and whether user voted.
- Voting requires a real API action; read-only display is not voting.
- Multiple choice, anonymous voting, expiry, editing or quiz support each require verified API capability.
- Events may show title, time, location, details and RSVP only if backend supports them.
- Never show controls that cannot persist changes.

### Contact, location and links
- Contact cards show available fields and actual contact identity/photo where permitted.
- Location previews use real coordinates and safe external map links; no fabricated map pin.
- Link previews are compact and resilient to missing metadata.
- In-chat search includes only content types actually indexed by backend.

## 4. Channels — include; Status — exclude

### Channels required
Aharane must provide a distinct Channels experience/filter, not a combined Status/Channels feed.

Research/implement where supported:
- Channels list and channel detail/feed.
- Channel identity, name, icon, description and follow state.
- Updates containing text, images, videos, audio/voice notes, stickers, polls and links as supported.
- Reactions and aggregate counts.
- Forward/share update where protocol/API supports it.
- Polls/quizzes only with real voting/results data.
- Notification/mute preference if supported.
- Search/discovery only with a real backend source.
- Distinguish one-way broadcast updates from normal two-way conversations in models/UI.
- Keep channel actions/data separate from private/group conversations.
- Respect privacy: follower identity/phone number must not be exposed to other followers. Do not claim privacy guarantees the integration cannot prove.

Official WhatsApp describes Channels as one-way broadcast updates, separate from personal chats, with text, photos, videos, stickers, polls and reactions. Its privacy guidance says followers are not generally visible to other viewers/followers.

### Status explicitly prohibited
- No Status tab, feed, viewer, composer, upload, archive, settings, notification controls or status navigation.
- Do not display Status alongside Channels.
- No Status placeholder or disabled option.
- Do not implement Status because WhatsApp groups Channels and Status under Updates.
- If code/docs mention Status, record it as excluded by owner decision and ensure it does not surface in app.

## 5. WhatsApp-style motion and animation reference

The target is restrained continuity and responsiveness, not copying proprietary animation assets.

### Message arrival and send
- New message appears promptly and settles into chronological position with subtle fade/translation or shape transition.
- Sending should not make bubble jump from composer to unrelated position.
- Do not animate old history when new content arrives.
- Reconcile optimistic message with server echo by stable identity; no duplicate.
- Preserve scroll position when user reads older messages.

### Sticker and GIF motion
- Sticker tray opens/closes smoothly and preserves selected pack/tab.
- Selecting sticker may visually transition toward chat position, but send never waits for decorative motion.
- Animated stickers/GIFs loop only while visible/allowed; pause offscreen or when preference disabled.
- Avoid simultaneous high-frame-rate animation in busy groups.
- Provide user control for animated stickers/GIFs independently where implemented.

### Media transition and viewer
- Media selection preserves visual continuity into message preview where feasible.
- Viewer opens anchored to tapped thumbnail; closing returns to same message/scroll position.
- Download progress remains attached to media tile and transitions to open/play state when complete.
- Viewer controls appear/disappear on interaction without hiding essential actions.
- Audio/video progress follows actual playback position.

### Reply gesture and reactions
- Swipe-to-reply follows finger with restrained affordance; threshold/cancel/haptic feedback tested.
- No competing horizontal gesture hijacks reply.
- Reactions pop/settle subtly without text layout jump.
- If quick double-tap reaction is added, document default emoji and ensure no conflict with swipe-to-reply.

### Loading and synchronization
- Initial conversation loading uses stable skeleton/placeholder rows with no layout shift.
- Older-history pagination uses small inline progress at timeline edge; never replace conversation.
- Background sync indicator appears only when useful; no constant spinner.
- Media upload/download shows actual progress, retry/cancel states; never invented percentages.
- Connection loss/reconnect causes a clear but quiet state change; no full-screen flash/replayed entrance.
- Keep last valid content visible during refresh where safe.

### Motion controls
- Respect Android system animation scale and reduced-motion preference.
- Provide separate animated sticker/GIF controls if included.
- Never force autoplay when motion disabled.
- Screen readers must not announce animation frames.

## 6. Privacy, correctness and session isolation

- Every conversation, message, media item, channel and action is scoped to authenticated Private or Public session.
- No cross-account search, forwarding, media cache, unread count or action leakage.
- Server validates authorization; hiding a button is not security.
- Never infer delivery/read from online presence.
- Do not send read receipts merely because conversation opened if Aharane's approved privacy policy forbids it.
- View-once media must not be cached, retained, exported or added to gallery.
- Do not expose phone numbers/private follower information through Channels.
- Do not leak message content, media URLs, credentials or phone numbers in logs/screenshots.
- Offline states are explicit; queued, sent, delivered, read and failed are distinct.
- Retry must not duplicate outgoing messages.

## 7. Backend capability audit matrix

Agent 02 coordinates with Agent 03 and inspects actual installed library/server code. Fill with exact evidence:

| Capability | Library event/method | Backend API/model | Android implementation | End-to-end test | Status |
|---|---|---|---|---|---|
| Text send/receive | | | | | |
| Delivery/read receipts | | | | | |
| Edit/delete | | | | | |
| Emoji reactions | | | | | |
| Sticker send/receive | | | | | |
| Animated sticker formats | | | | | |
| GIF | | | | | |
| Voice note | | | | | |
| Video note | | | | | |
| Photo/video upload/download | | | | | |
| Document/file | | | | | |
| Contact/location | | | | | |
| Poll display/vote | | | | | |
| Group events/RSVP | | | | | |
| Archive/pin/mute | | | | | |
| Channels list/feed/reactions | | | | | |
| Channel polls/quizzes | | | | | |
| Offline queue/retry | | | | | |

## 8. Testing and screenshot requirements

Test:
- Unit tests for mapping, state transitions, formatting and progress.
- Repository/API tests for account scoping, errors, pagination, retries and idempotency.
- Instrumentation for gestures, keyboard, viewer, picker, stickers and navigation.
- End-to-end against a real test WhatsApp session where possible.
- API 26/API 36 and lower-end physical Android device.
- Offline, reconnect, slow network, interrupted transfer, permission denial, low storage and process recreation.
- Light/dark, large font, TalkBack and reduced motion.

Capture each distinct Chat/Channels screen and meaningful state, without near-identical duplicates:
- conversation list for Private/Public and filters;
- normal conversation, long message, media, reply, reactions and keyboard open;
- sticker tray, static sticker, animated sticker and GIF;
- voice recording/playback;
- media download in progress, complete and failed/retry;
- fullscreen media viewer;
- channel list/detail and supported update types;
- empty/loading/disconnected/offline/error states.

Review images visually. Blank canvas, missing poster, broken sticker, clipped composer, keyboard overlap, wrong account identity or fake progress is failure.

## 9. Research sources checked 23 November 2026

Official:
- WhatsApp Messaging: https://www.whatsapp.com/messaging
- WhatsApp Groups: https://www.whatsapp.com/groups
- WhatsApp Channels: https://www.whatsapp.com/channels
- Help Center — reactions: https://faq.whatsapp.com/424198503229937/
- Help Center — pin a message: https://faq.whatsapp.com/294619079641794/
- Help Center — create a Channel: https://faq.whatsapp.com/794229125227200/
- Help Center — channel polls/quizzes: https://faq.whatsapp.com/223836640775084/
- Help Center — group events: https://faq.whatsapp.com/3313983622238973/
- Meta group poll/@all update, 4 Aug 2026: https://blog.whatsapp.com/your-group-chats-upgraded-introducing-better-polls-all-and-more
- Meta group chat upgrades: https://about.fb.com/news/2026/08/were-upgrading-your-whatsapp-group-chats/

Motion and beta/rollout research:
- WABetaInfo, Android message sending animation, 13 Jun 2026: https://wabetainfo.com/whatsapp-is-rolling-out-chat-message-animations-on-android/
- WABetaInfo, animated content controls: https://wabetainfo.com/whatsapp-beta-for-android-2-25-11-10-whats-new/
- WABetaInfo, sticker reactions Android beta, 18 Nov 2026: https://wabetainfo.com/whatsapp-is-rolling-out-message-sticker-reactions-on-android/
- WABetaInfo, Lottie sticker support: https://wabetainfo.com/whatsapp-is-rolling-out-an-enhanced-sticker-experience-with-lottie-framework/

Official pages define documented feature families and behaviours. WABetaInfo is secondary reporting used only for observed motion/gradual beta features. Beta/rollout reports are not universal availability or guaranteed protocol contracts.

## 10. Agent 02 completion report

- Actual installed library/fork/version audited:
- Capability matrix evidence:
- Implemented and deliberately omitted features:
- Status exclusion verified across UI/routes/models:
- Channels support and privacy limitations:
- Sticker formats supported and tested:
- Animation behaviours implemented:
- API 26/API 36/device tests:
- Screenshot inventory and visual review:
- Known limitations:
- Branch/commit/PR:
