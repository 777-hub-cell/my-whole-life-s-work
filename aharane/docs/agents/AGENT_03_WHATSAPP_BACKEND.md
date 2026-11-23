# Agent 03 — WhatsApp backend, pairing and session reliability

**Initial status:** NOT STARTED  
**Owner:** Agent 03  
**Last updated:** 2026-11-23

## Mandatory context — read before acting

Read `aharane/docs/MASTER_PROJECT_CONTEXT.md` and `aharane/docs/AUTONOMOUS_EXECUTION_PROTOCOL.md` in full. Then read **all ten agent briefs** in `aharane/docs/agents/`, not only this one. Inspect relevant existing project Markdown, current source, tests, build/package configuration, API contracts and current GitHub branch state. You must understand the whole Aharane product and how the other nine workstreams affect yours.

## Mission

Own WhatsApp transport/runtime and session lifecycle: pairing QR/code, connect/reconnect, credentials, account runtime, event normalization, incoming/outgoing delivery, receipts, media transport, groups, Channels/Status compatibility and session health. Coordinate Android contracts with Agents 01/02, authorization with Agent 04 and scheduled execution with Agent 07. Verify the installed Baileys package from manifests/runtime, not stale docs.

## Acceptance criteria

Acceptance: pairing/reconnect are reliable; Private/Public sessions remain distinct; events are attributed correctly; supported media and receipts work end-to-end; failures recover without credential leakage or duplicate sends.

## Ownership and boundaries

Primary ownership: WhatsApp transport, session/account runtime and pairing backend. Coordinate shared API, event schema, storage and authorization changes.

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

## 1. Binding responsibility

Own WhatsApp transport integration and reliability: installed-library compatibility, QR/pairing-code lifecycle, Private/Public sessions, connect/reconnect, credential handling, event normalization, message send/receive, actual delivery/read receipts, media, and proven group/Channel transport. Do not own business authorization, command policy, Engine sandbox, scheduler semantics or Android chat UI.

First verify the package/version from current lockfiles, manifests and runtime imports. Previous documentation conflicts about Baileys are an audit lead, not proof. Status is excluded from Aharane.

## 2. Independent work packages

| Package | Scope and output | Can proceed independently? | Integration gate |
|---|---|---|---|
| 3A — Library audit | Exact package/fork/version, Node support, event/API differences, media formats, group/Channel capability and reconnect behaviour; evidence-backed matrix. | Yes; first. | Lockfile and runtime import verified. |
| 3B — Pairing lifecycle | QR/pair code generation/expiry, scan/connect states, credential save/restore, disconnect/reconnect/repair/stop/restart, per-account health. | Yes; state machine first. | Versioned lifecycle/API contract; credentials never exposed. |
| 3C — Session isolation | Separate sockets, credentials, listeners, retry loops, identity attribution, locks and shutdown for Private/Public. | Fake transport tests can start immediately. | Two live sessions prove isolation. |
| 3D — Event normalization | Versioned message, edit/revoke, receipt, reaction, media, contact, group and Channel events. | Sanitized captured fixtures. | Agents 02/04/08/09 accept schema; compatibility tests pass. |
| 3E — Outbound/media | Text, image/video/document, sticker/GIF and voice sends; upload/download/thumbnail; validation, size limits, timeout/retry and message-key reconciliation. | Implement each proven operation separately. | Installed library and real test session prove capability. |
| 3F — Receipts/groups/Channels | Map actual sent/delivered/read events; group metadata/participants; supported Channel update/subscription events. | Starts from 3A capability findings. | Real protocol events; no presence inference; consumers accept contract. |
| 3G — Reliability/diagnostics | Backoff/jitter, reconnect-storm prevention, stale socket cleanup, listener dedupe, safe logs, graceful shutdown, health and send reconciliation. | Fake transport/fault tests now. | Restart/network interruption tests pass. |
| 3H — Live integration | Pair, use two sessions, exchange messages, receipts, attachments, group and Channel events. | Harness can be prepared immediately. | Agent 10 independently reproduces evidence. |

## 3. Contract-first delivery

Publish a versioned session/transport contract as soon as 3A and initial 3B are understood:
- Server-resolved account identity and lifecycle state; never expose auth files or pairing secrets.
- Pairing start/status/complete/cancel/retry and stable error codes.
- Normalized conversation, message, media, group, Channel and receipt event shapes.
- Send request/result with idempotency or correlation ID, server message key and failure semantics.
- Pagination/incremental-sync cursor and ordering guarantees.
- Capability flags for media/group/Channel operations plus explicit unsupported results.
- Event ordering, retries, deduplication and version compatibility.
- Safe health/diagnostic fields for Android.

Agent 02 can build against these contracts; Agent 09 can build charts/notifications against normalized events. Agent 04 is authoritative for policy decisions; this agent must call that boundary rather than implement duplicate owner rules.

## 4. File boundaries

Own WhatsApp client adapters, account session lifecycle/transport handlers, pairing/session routes, normalized transport event modules/tests and capability docs in the server source tree. Recheck exact current paths.

Do not own canonical owner policy (04), Builder (05), Engine (06), Scheduler store/runner (07), generic encrypted data store (08), or Android screens (01/02/05/06/07/08/09). Existing index/session/socket/chat routes are audit leads, not permission to rewrite a whole mixed-purpose file. Extract transport modules and coordinate a single editor for shared route registries.

## 5. Security and reliability gates

Private/Public credentials, sockets, listeners, event subscriptions, stores and media operations remain isolated. Bind events to server-known account/session, not client labels. Redact pairing codes, auth state, tokens, phone numbers and message contents. Prevent duplicate sockets/listeners and reconnect storms. A socket send is not delivery/read. Use IDs/idempotency to reconcile retries. Validate media type/size/duration and incoming payloads. No Status transport/product path.

- [ ] Installed dependency and runtime import documented.
- [ ] Private/Public session stores and runtime instances isolated.
- [ ] Pairing, expiry, reconnect and repair work via stable APIs.
- [ ] Event contract is versioned and consumed.
- [ ] Receipts use real protocol events only.
- [ ] Media, voice, stickers, groups and Channels have evidence-backed capability results.
- [ ] Cross-account, idempotency and credential-redaction tests pass.
- [ ] Agent 10 independently verifies.

## 6. Progress/completion report

Track packages 3A–3H, package/version, session and event contract versions, consumers, capability matrix, exact test commands/results, real-session evidence, changed paths, limitations and PR. Work not requiring test credentials continues; only live-session proof is BLOCKED.

- Status:
- Package status:
- Installed package/fork/version:
- Session/pairing contract:
- Event contract:
- Capability matrix/evidence:
- Files/APIs changed:
- Tests/results:
- Two-session isolation/reconnect evidence:
- Limitations:
- Branch/commit/PR:
- Ready for integration: NO
