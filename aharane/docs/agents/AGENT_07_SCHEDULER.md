# Agent 07 — Scheduler and automation

**Initial status:** NOT STARTED  
**Owner:** Agent 07  
**Last updated:** 2026-11-23

## Mandatory context — read before acting

Read `aharane/docs/MASTER_PROJECT_CONTEXT.md` and `aharane/docs/AUTONOMOUS_EXECUTION_PROTOCOL.md` in full. Then read **all ten agent briefs** in `aharane/docs/agents/`, not only this one. Inspect relevant existing project Markdown, current source, tests, build/package configuration, API contracts and current GitHub branch state. You must understand the whole Aharane product and how the other nine workstreams affect yours.

## Mission

Own durable schedule lifecycle and execution: create/edit/delete, once/interval/daily/weekly recurrence, IANA timezones, enable/pause/resume, persistence, restart recovery, single-flight execution, failure outcomes and Android UI/API integration. Scheduled workflows preserve the same account, owner, permission and Private/Public rules as interactive execution. Coordinate Agents 03/04/05/06 and Android owners 01/08.

## Acceptance criteria

Acceptance: schedules persist and calculate next runs correctly across timezone/DST; restart behavior avoids unintended duplicates; correct connected account and authorization are used; Android controls call real APIs; failures/retries are explicit.

## Ownership and boundaries

Primary ownership: scheduler store/runner, APIs and scheduler UI. Coordinate shared repository/API and workflow execution contracts.

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

## 1. Mission and invariants

Own schedule lifecycle from definition through durable persistence, due-time calculation, claiming, execution orchestration, pause/resume, cancellation, history and Android management. Schedules may invoke commands/workflows/Engine, but must preserve the same account identity and authorization as interactive execution. Prevent unintended duplicate sends on restart/network failure.

Re-audit scheduler-store.js, scheduler-runner.js, API routes in index.js and Android repository/UI coverage before assuming any existing gap or behaviour. Existing at-most-once interruption semantics must be deliberately reviewed, not silently changed.

## 2. Independent work packages

| Package | Scope and output | Parallel readiness | Integration gate |
|---|---|---|---|
| 7A — Domain/API contract | Schedule ID, creator/owner, target account, Private/Public identity, command/workflow reference+revision, recurrence, IANA timezone, enabled/paused, next run, status/history and failure policy. | Yes; publish schema first. | Agents 04/05/06/08 accept fields/ownership. |
| 7B — Durable persistence/migration | CRUD, atomic writes/transactions, versioning, bounds, corruption recovery, retention and audit history. | Yes, fixtures/fault injection. | Restart/migration tests preserve schedules and states. |
| 7C — Recurrence/time calculation | Once/interval/daily/weekly; IANA zone; DST gap/overlap; clock/timezone change; next-run and missed-run policy. | Yes; pure deterministic tests. | DST/misfire policy documented and matrix passes. |
| 7D — Claiming/runner/idempotency | Single-flight, atomic claim/lease, concurrency, restart recovery, stale claim, correlation, timeout/cancel and terminal outcomes. | Yes, fake executor. | Fault injection proves documented duplicate/at-most-once guarantee. |
| 7E — Authorization/execution adapters | Invoke approved command/workflow/Engine services; bind account and creator; re-evaluate Agent 04 at run time; call Agents 03/05/06. | Contract work starts early. | Private/Public and privilege tests pass for scheduled runs. |
| 7F — Android Scheduler UI | List/create/edit/detail/pause/resume/delete, account/workflow/command selection, timezone, next-run, history, errors and empty/offline/loading states. | Use fake ScheduleRepository. | Real API/repository integration; no fake schedules when connected. |
| 7G — Outcome events/notifications hand-off | Publish schedule result events and retry/failure explanation. | Yes. | Agent 09 consumes outcome contract without duplicate notification ownership. |
| 7H — Real end-to-end test | Create → persist → restart → claim → authorize → actual workflow/Engine/command → outcome/history. | Harness can be prepared now. | Agent 10 independently reproduces. |

## 3. Time, failure and delivery contract

Explicitly decide and document: stored IANA timezone; behaviour in DST gaps/repeated times; clock/timezone changes; interval anchor; missed-run handling (skip/run once/catch up); retry/backoff/max attempts; atomic claim/lease; process death before claim/after claim/during execution/after external send/before outcome save; pause/delete while running; schedule edit during claim; correlation/idempotency passed to Agent 03/05/06.

Do not claim exactly-once delivery unless external transport and durable side effects prove it. State whether the real guarantee is at-most-once attempt (possible missed run), at-least-once (possible duplicate without idempotent side effect), or another proven model. Surface the trade-off clearly.

## 4. File boundaries

Own scheduler store/runner/API modules and Scheduler Android feature screen/view-model/repository adapter/tests. Existing leads include scheduler-store.js, scheduler-runner.js and scheduler routes in index.js.

Do not own global shell/theme (01), command policy (04), workflow schema/editor (05), Engine runtime (06), generic DB/encryption/offline queue primitives (08) or global notification delivery/WorkManager policy (09). Agent 07 emits schedule outcomes; Agent 09 owns notification presentation/delivery. Coordinate shared AharaneRepository.kt, route registries and app navigation with one editor.

## 5. Dependency hand-offs

- Agent 04: authorization evaluator; evaluate at execution time.
- Agent 05: immutable workflow ID/revision/schema.
- Agent 06: Engine invocation/result and sandbox budgets.
- Agent 03: WhatsApp send correlation/idempotency and account runtime.
- Agent 08: atomic persistence/transaction primitive.
- Agent 09: schedule outcome and notification contract.
- Agent 01: route, UI components, keyboard/adaptive rules.
- Agent 10: DST/restart/idempotency/security tests.

If an executor is unfinished, implement against a typed fake executor while completing store, runner and UI. Replace the adapter at integration; do not wait idle.

## 6. Verification gates

Use deterministic clock/time-zone database. Test month/year boundary, leap day, multiple IANA DST transitions, invalid zones, server timezone change, missed runs, multiple pollers, crashes at every claim/send/persist boundary, expired lease, pause/delete/edit while claimed, permission revoked before due time, wrong account and outcome history.

- [ ] Versioned account-scoped schedule model/API.
- [ ] Recurrence, timezone, DST and misfire behaviour explicit/tested.
- [ ] Persistence survives restart/migration.
- [ ] Runner avoids unintended concurrent/duplicate execution under documented guarantee.
- [ ] Agent 04 authorization checked at run time.
- [ ] Workflow/Engine/WhatsApp contracts used.
- [ ] Android controls call real APIs.
- [ ] Agent 09 notifications derive from persisted outcomes.
- [ ] Agent 10 passes time, recovery and isolation tests.

## 7. Progress/completion report

Track 7A–7H, contract version, recurrence/failure policy, changed files, exact time-zone and restart tests, actual authorized invocation, device evidence, limitations and PR. A blocked executor does not block scheduler core tests.

- Status:
- Package status:
- Schedule schema/API version:
- Time/DST/misfire policy:
- Idempotency/delivery guarantee:
- Files/APIs changed:
- Persistence/restart/fault results:
- Real authorized execution:
- Android API evidence:
- Risks:
- Branch/commit/PR:
- Ready for integration: NO
