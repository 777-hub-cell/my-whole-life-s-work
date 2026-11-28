# Agent 09 — Analytics, notifications, Channels and updates

**Initial status:** NOT STARTED  
**Owner:** Agent 09  
**Last updated:** 2026-11-23

## Mandatory context — read before acting

Read `aharane/docs/MASTER_PROJECT_CONTEXT.md` and `aharane/docs/AUTONOMOUS_EXECUTION_PROTOCOL.md` in full. Then read **all ten agent briefs** in `aharane/docs/agents/`, not only this one. Inspect relevant existing project Markdown, current source, tests, build/package configuration, API contracts and current GitHub branch state. You must understand the whole Aharane product and how the other nine workstreams affect yours.

## Mission

Own activity insight and update surfaces: accurate sent/incoming/handled analytics, charts/date ranges, notification delivery/background refresh, Channels presentation/compatibility, update experience and related Android lifecycle behavior. Coordinate event sources with Agent 03, chat with Agent 02, background/storage with Agent 08 and visual foundations with Agent 01. Distinguish total incoming/outgoing from bot-handled events.

## Acceptance criteria

Acceptance: metrics derive from correct persisted events; default date range/chart behavior matches requirements; notifications respect permissions/lifecycle; Channels match supported backend capabilities; update flow is safe and understandable.

## Ownership and boundaries

Primary ownership: analytics, notifications, updates and Channels feature surfaces. **Status is excluded from Aharane** and must not be implemented or surfaced by this workstream. Coordinate shared event schemas, background workers and API contracts.

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

## 1. Mission and exclusions

Own analytics aggregation/surfaces, Android notifications/background checks, Channel discovery/subscription management and update-package user experience. Metrics must derive from persisted source events. Distinguish total incoming/outgoing from bot-handled messages.

**Status is explicitly excluded**: no Status screen, metric, feed, notification, viewer, composer, setting, deep link or placeholder. Channels are included as a separate feature, not a renamed Status implementation.

## 2. Independent work packages

| Package | Scope and output | Parallel readiness | Integration gate |
|---|---|---|---|
| 9A — Event/metric inventory | Map persisted activity/message/session events; define incoming/outgoing/bot-handled/success/failure, attribution, time and dedupe. | Yes; audit and fixtures. | Agent 03/server confirms raw event IDs, timestamps and retention. |
| 9B — Analytics API/charts | Account/date selectors if approved, totals/trends, chart labels/axes, empty/error/stale states and aggregation performance. | UI can use fixtures. | Chart totals reconcile against raw event ledger. |
| 9C — Notification model/delivery | Categories, Android channel IDs, permission timing, deep links, foreground refresh, WorkManager/background, dedupe/grouping/cancel/preferences. | Notification matrix/worker tests with fake event source. | Real event contract and Agent 08 lifecycle/storage; OS permission tests. |
| 9D — Channels management | Discovery/list metadata, follow/unfollow only if supported, mute/notification preferences, metadata and hand-off to Agent 02 reader. | Directory UI uses fixtures. | Agent 03 proves installed-library operation; Agent 02 owns timeline/rendering. |
| 9E — Update-package experience | Package list/details/version/hash/compatibility; stage/select/apply/confirm; real deployment state/polling/notification/failure/retry/rollback messaging. | UI can use fixtures. | Agent 08 owns generic file staging; server safeguards and explicit confirmation remain authoritative. |
| 9F — Background/privacy/observability | Doze/battery/network constraints, denied permissions, retry policy, lock-screen privacy, metric retention and safe logging. | Yes; platform matrix. | API 26–36 and target-device checks. |
| 9G — Cross-feature event integration | Subscribe to schedule outcomes (07), transport/account events (03) and message events (02) without double counting or duplicate notifications. | Contract tests with fixtures. | Producer event IDs and ownership accepted. |
| 9H — Real end-to-end acceptance | Reconcile analytics, OS notification delivery, supported Channel management and confirmed update flow. | Harness can be prepared now. | Real server/device proof; Agent 10 independent verification. |

## 3. Channel ownership split

- Agent 03: transport capabilities and channel protocol events/operations.
- Agent 09: discover/manage subscriptions, follow/unfollow when supported, channel metadata and notification preferences.
- Agent 02: Channels inbox filter, channel timeline and update rendering.
- Agent 01: global navigation/theme/components only.
- Agent 10: independent end-to-end verification.

When the installed library cannot perform an operation, present a truthful unsupported state. Never fake a subscription change or show mock Channels as live.

## 4. Analytics definitions and contracts

Publish definitions before implementation:
- Incoming total = qualifying inbound messages in selected account and period.
- Outgoing total = qualifying outbound messages in selected account and period.
- Bot-handled total = the subset actually processed/handled by the bot under a documented definition; it is not a substitute for incoming/outgoing total.
- Name command-generated responses/system events separately if they are counted.
- Define dedupe key, timezone/period boundaries, retention, edits/revokes and late/missing event treatment.
- Private/Public are separate unless explicit combined view is approved.
- Do not show zero when data is unavailable; show unavailable/error/stale state.

Agent 03 owns transport event truth; Agent 09 owns metric definitions/aggregation/view contract. Agent 10 reconciles charts with raw records.

## 5. Update flow and file boundaries

Update UI must explain package/version/checksum/validation/target/impact/current state and failure. Do not infer success from request acceptance; wait for server deployment and health result. Require explicit confirmation and preserve rollback safeguards. Agent 08 owns generic package staging/integrity storage; Agent 09 owns update lifecycle presentation and notifications.

Own analytics aggregation/UI, notification worker/channels/preferences/deep links, Channel discovery/subscription feature and update-package presentation/state machine. Do not own chat timeline (02), transport (03), authorization (04), scheduler execution (07), generic storage/package files (08) or global shell/theme (01). Coordinate shared WorkManager/repository/route registries with a single editor.

## 6. Verification gates

Reconcile metrics with raw ledger, including duplicates, late events, edits/revokes, inbound/outbound and bot-handled subsets. Verify account/date boundaries and timezone. Test API 26 legacy notifications, API 33+ runtime notification permission, API 36 behaviour, Doze, battery saver, denial, offline and restart. Test dedupe/grouping, lock-screen privacy and deep links. Test Channel operations only when supported and verify opening enters Agent 02 reader. Update validation/confirmation/actual deployment/health/failure/rollback. Check no Status path is introduced.

- [ ] Incoming/outgoing/bot-handled definitions separate and reconcile to persisted events.
- [ ] Charts have truthful loading/empty/stale/error states.
- [ ] Notifications use actual events, OS permissions and dedupe.
- [ ] Background checks honestly state OS-deferred periodic nature.
- [ ] Channels management distinct from Agent 02 reader and backed by proven capability.
- [ ] Update flow waits for actual deployment/health result and explicit confirmation.
- [ ] No Status surface/reference added.
- [ ] Agent 10 verifies end-to-end.

## 7. Progress/completion report

Track 9A–9H, metric/event versions, raw reconciliation, Channel evidence, notification/platform matrix, update state machine, files, test/device results, limitations and PR.

- Status:
- Package status:
- Metric definition/event source:
- Raw-event reconciliation:
- Notification matrix/device results:
- Channel capability/subscription evidence:
- Update deployment/health evidence:
- Files/APIs changed:
- Status-exclusion audit:
- Limitations:
- Branch/commit/PR:
- Ready for integration: NO
