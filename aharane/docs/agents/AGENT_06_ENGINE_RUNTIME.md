# Agent 06 — Engine runtime, sandbox and Engine Library

**Initial status:** NOT STARTED  
**Current status:** IN PROGRESS — host-side policy, single invocation path (contract v1), Library run/capabilities API and diagnostics IMPLEMENTED and unit-tested offline; Android test-run dialog written but UNCOMPILED; the REAL QuickJS sandbox has still NOT RUN (a ready-to-run real-sandbox suite exists and currently SKIPS)
**Owner:** Agent 06  
**Last updated:** 2026-11-24

## Mandatory context — read before acting

Read `aharane/docs/MASTER_PROJECT_CONTEXT.md` and `aharane/docs/AUTONOMOUS_EXECUTION_PROTOCOL.md` in full. Then read **all ten agent briefs** in `aharane/docs/agents/`, not only this one. Inspect relevant existing project Markdown, current source, tests, build/package configuration, API contracts and current GitHub branch state. You must understand the whole Aharane product and how the other nine workstreams affect yours.

## Mission

Own Engine file lifecycle and execution: create/edit/save/load, runtime integration, QuickJS sandbox, permission model, approved HTTPS hosts, resource/time limits and error reporting. Verify saved source executes in the real runtime; mocked output is not end-to-end proof. Coordinate Agent 05, Agent 04, Agent 03 and Agent 08.

## Acceptance criteria

Acceptance: saved source persists and executes through the real sandbox; permissions/host allowlists are enforced; unsafe operations are denied; limits/failures are handled; supported WhatsApp actions are integration-tested; secrets do not leak.

## Ownership and boundaries

Primary ownership: Engine runtime/store/library and sandbox. Coordinate shared file manager, workflow schema, API and WhatsApp adapters.

These are coordination boundaries, not permission to overwrite shared files. Check current file overlap and coordinate before changing shared contracts or files.

## Discovery and decision log

Q&A means investigating and resolving questions from repository evidence, not waiting for routine owner answers.

| Status | Question investigated | Evidence (paths/symbols/tests) | Finding and decision | Reason / consequence |
|---|---|---|---|---|
| RESOLVED | Is the runtime testable without QuickJS? | `src/engine-runtime.js` imported `quickjs-emscripten` at module top | NO, so the whole module (policy, limits) was untestable offline. Decision: load QuickJS lazily (`loadQuickJS`, injectable `options.quickjs`); a startup failure is reported as an `infrastructure` outcome. | Host-side logic is now unit tested. Fake-guest tests drive the host bridge only and are NOT proof of real isolation. |
| RESOLVED | Can a guest promise that never settles hang the runtime? | `executeCustomEngine`: interrupt handler only fires while guest code runs; `await hostResult` had no timer | YES (real defect, by code reading). Added a deadline/cancel guard racing every await (`createGuard`); slot and context are released on every path. | Offline test with a never-settling fake guest. The real-QuickJS behaviour is NOT verified (see limitations). |
| RESOLVED | Is the network policy enforced on every call? | `approvedFetch`, `options.networkFetch` hook | Policy was inside the real transport only, so an injected transport skipped it. Extracted `assertFetchAllowed` and run it on EVERY fetch before any transport. Added per-run budgets (20 requests, 2 MiB total response). | Tests: unsafe URL shapes, headers whitelist, injected transport cannot widen allowlist, budgets. |
| RESOLVED | DNS rebinding / private addresses | `approvedFetch` lookup | Already pinned and checked; now testable through injected `lookup`. Tests cover private, loopback, link-local, CGNAT, 0.0.0.0, mixed public+private and empty answers. | Real TLS/pinning against a live server NOT RUN. |
| RESOLVED | Concurrency and cancellation | none existed | Added `createConcurrencyLimiter` (4 active, 16 queued, 30 s queue wait) and `options.signal` (cancel before start, while queued, during a network call, and via the interrupt handler). | Overload returns `resource_exhausted`; cancel returns `cancelled`. |
| RESOLVED | Structured results | thrown generic `Error` | `EngineExecutionError.outcome`: input_invalid, invalid_source, policy_denied, timeout, cancelled, resource_exhausted, runtime_error, infrastructure. Results add `outcome`, `sourceSha256`, `networkCalls`, `denials` (denials are reported even when the guest swallows the error). Workflow traces keep `outcome`. | Messages unchanged for existing callers. |
| RESOLVED | Are Engine revisions immutable? | `src/engine-store.js` kept only the latest file; version could stay the same while code changed | NO. Every save is now a numbered revision with a sha256 over manifest+code; last 20 revisions kept in `<id>.history.json`; `getRevision`/`listRevisions`; legacy files load as revision 1. Two editors at the same version are now detected via optional `expectedRevision` (409 conflict; older clients unaffected). | Fixes a silent lost-update. History files were also being counted against the 100-Engine limit; fixed. |
| RESOLVED | Can a workflow pin an Engine revision? | `visual-command-builder.js`, `index.js runStoredEngine` | Node config `engineRevision` is validated and passed to `runStoredEngine(id, inputs, {revision, signal})`, which runs that exact snapshot; the source hash appears in the trace. | Coordinated with Agent 05's file (small edit, listed below). Agent 07 invocation NOT done. |
| RESOLVED | Do Builder, Scheduler and Library tests share one execution path? (6F) | `index.js runStoredEngine` previously re-implemented store lookup; new `src/engine-invocation.js` (`invokeEngine`, `createEngineRunner`), `test/engine-invocation.test.js` | No single path existed. Production now builds `runStoredEngine` with `createEngineRunner`; the workflow executor, the scheduled-workflow path (which runs the same executor) and the new Library test route all call `invokeEngine`. Request: `{engineId, revision?, inputs, source, account?, correlationId?}`; sources `workflow` / `scheduler` / `library-test` only. | One validated request, one revision resolution, one envelope. Tests prove a pinned revision runs the OLD saved text after a newer revision exists, for both workflow and scheduler sources. |
| RESOLVED | Who decides the invocation `source` and `account`? | `visual-command-builder.js` Engine node call; test "derives the invocation source and account from run state" | Derived from run state (`event.scheduledExecution`, `event.sessionId`), never from node config or any request body; the Library route hard-codes `library-test`. `api` and `admin-preview` are rejected as invocation sources. | A hostile workflow node cannot claim to be the scheduler or another account. |
| RESOLVED | Do results identify what ran? | envelope `engine:{id,version,revision,sourceSha256,pinned}`; trace text | Yes. Unpinned runs record the revision they actually resolved (`pinned:false`, traced as "latest, not pinned"). Store hash and runtime hash are asserted equal. | An operator can tie any run to an exact saved revision. |
| RESOLVED | Can an unexpected failure leak host details? | `invokeEngine` catch; test "unexpected failures never leak host paths" | Previously any non-`EngineExecutionError` could surface its raw message. Now it is returned as `infrastructure` with a fixed message; only codes are logged. Unknown outcome strings are normalised to `infrastructure`. | Verified by test with a path and fake token in the thrown message. |
| RESOLVED | Engine Library run/diagnostics (6G backend) | `POST /api/engines/:id/run`, `GET /api/engines/:id/capabilities`, `describeEngineCapabilities`, `diagnoseEngine` | Admin-only. Run executes a SAVED revision only (never unsaved text), cancels when the client disconnects, and logs engine/revision/outcome/correlationId, never inputs or outputs. Engine-level failures are HTTP 200 with `ok:false`; invalid request 400; missing 404; infrastructure 503; non-200 bodies carry `error` because the Android client reads that field. Diagnostics are advisory only. | Route handlers themselves are NOT run offline (no express); the response mapping is unit tested through `httpResponseForEnvelope`. |
| ASSUMPTION | 6E: should Engine guest code be able to send WhatsApp messages? | `PERMISSIONS` has only `network.fetch`; Builder owns send limits and duplicate protection | DECISION PENDING OWNER REVIEW. I did NOT add a WhatsApp capability. Engines return structured outputs; workflow nodes perform sends, so Agent 04 authorization, send-volume limits and duplicate prevention (Agent 05) still apply. A direct guest send path would bypass those and needs Agent 03/04/05 sign-off. Instead the no-socket/no-credential property is tested: the guest receives exactly `__aharaneContext` and `__aharaneInputs`, the context has only `network` (and `network.fetch` only when granted), canary secrets never reach guest or results, and a static test forbids secret/socket references in the Engine modules. | If you want guest-initiated replies, say so; it is a separate, security-sensitive capability. |
| ASSUMPTION | Agent 04 coverage for Engine runs | `library-test` route is `requireAdmin`; workflow/scheduler runs reach the Engine only after the executor and Agent 04 resolver have authorised the workflow | The Studio admin is treated as the owner for test runs (same assumption as the workflow dry-run). The sandbox additionally enforces its own capability checks on every call, so both must pass. | A `library-test` run does make real GET/POST calls to approved hosts. |
| ASSUMPTION | Limits (4 concurrent, 16 queued, 20 fetches, 2 MiB, 20 revisions) | `ENGINE_LIMITS` | Chosen conservatively, not measured on real hardware. | Confirm with Agent 10 under load. |
| BLOCKED | Real QuickJS execution, memory/stack exhaustion, hostile-script suite against the real sandbox | `test/engine-runtime.test.js` (needs `quickjs-emscripten`) | Package cannot be installed (no network). The 4 existing runtime tests fail with "Cannot find package" before and after my changes. | Must be run with `npm install` on Node 24. |

Use RESOLVED, ASSUMPTION, CONFLICT or BLOCKED. Resolve ordinary uncertainty independently and continue.

## Work plan and progress

| Task | Status | Evidence / notes |
|---|---|---|
| Read master context, protocol and all ten briefs | PARTIAL | Master context, protocol and the Agent 05 and 06 briefs read; other briefs searched for contract points only. |
| Audit current requirements, source and tests | DONE (backend) | Runtime, contract, store, API routes, workflow invocation, existing tests and Android Engine Library save path audited. |
| Define acceptance tests and dependencies | DONE | `engine-sandbox-policy` (19), `engine-revisions` (6). |
| Implement assigned work | IN PROGRESS | 6A, 6B (host side), 6C, 6D, 6F, 6G-backend: IMPLEMENTED and unit tested offline. 6G-UI: Android test-run dialog written, UNCOMPILED. 6E: no guest WhatsApp capability by decision (pending owner review); no-secret/no-socket property tested. 6H: real-sandbox suite written, never run (skips without QuickJS). |
| Run focused and regression tests | DONE (offline) | See Verification evidence: 302 pass / 7 fail (all missing packages) / 11 skipped. |
| Verify real runtime/device behavior where applicable | NOT RUN | No QuickJS, emulator or device. |
| Update this document with evidence | DONE | 2026-11-24. |
| Submit integration report | NOT STARTED | |

## Files changed

List every changed source, test and documentation path with its purpose.

| Path | Purpose |
|---|---|
| `src/engine-runtime.js` | Lazy QuickJS load; `EngineExecutionError` outcomes; `createConcurrencyLimiter`; `assertFetchAllowed` on every call; `brokerFetch` with injectable lookup/signal; deadline/cancel guard; per-run fetch and response budgets; `sourceSha256`, `networkCalls`, `denials` in results |
| `src/engine-store.js` | Numbered revisions, sha256, `<id>.history.json` (20), `getRevision`, `listRevisions`, `expectedRevision` conflict, legacy load, history cleanup, Engine-count fix |
| `src/index.js` | `runStoredEngine(id, inputs, {revision, signal})`; PUT `/api/engines/:id` passes `expectedRevision`; new GET `/api/engines/:id/revisions` and `/revisions/:revision` |
| `src/visual-command-builder.js` (Agent 05 file, small edit) | passes `signal` and optional `engineRevision` to `runEngine`; validates the pin; records `outcome` and source hash in traces |
| `test/engine-sandbox-policy.test.js` (new) | 19 offline policy/limit/cancel/outcome tests (fake guest, no real QuickJS) |
| `test/engine-revisions.test.js` (new) | 6 tests: revisions, conflicts, history window, legacy files, workflow pin and outcome trace |
| `test/engine-store.test.js` | stored shape now includes `revision` and `sha256` |
| `android/.../AharaneRepository.kt`, `features/files/EngineLibraryScreen.kt` | track the opened revision and send `expectedRevision` (UNCOMPILED) |
| `src/engine-invocation.js` (new) | Contract v1: `normalizeInvocationRequest`, `invokeEngine`, `createEngineRunner`, envelope/outcome mapping, `httpResponseForEnvelope`, `describeEngineCapabilities`, `diagnoseEngine` |
| `src/engine-runtime.js` | exports `assertEngineSource` (diagnostics only; no behaviour change) |
| `src/index.js` | `runStoredEngine` is now `createEngineRunner(...)`; new `GET /api/engines/:id/capabilities` and `POST /api/engines/:id/run`; removed direct `executeCustomEngine` import |
| `src/visual-command-builder.js` (Agent 05 file, small edit) | Engine node passes `source`, `account`, `correlationId` derived from run state; run ID threaded into the executor; trace shows revision and "latest, not pinned" |
| `test/engine-invocation.test.js` (new) | 19 offline tests: request contract, pinned revisions through the real store, outcome mapping, no-leak, workflow+scheduler routing, source-from-run-state, capabilities, diagnostics, secret-leak audit, malformed source/inputs/outputs, HTTP mapping |
| `test/engine-real-quickjs.test.js` (new) | 11 REAL-sandbox hostile tests; SKIP when `quickjs-emscripten` is absent; never executed by me |
| `android/.../AharaneRepository.kt`, `EngineLibraryScreen.kt` | `engineCapabilities`, `runEngine`; "Test run" dialog showing grants, diagnostics, outputs or structured outcome (UNCOMPILED) |
| `package.json` | `check` script also syntax-checks `src/engine-invocation.js` |
| `docs/agents/AGENT_06_ENGINE_RUNTIME.md` | this record |

## Verification evidence

Record exact commands/workflows, environment, pass/fail/not-run results, screenshots and runtime evidence. Never report skipped, cancelled or unrun tests as passed.

Environment: Node v22.23.5, Linux sandbox, no network, `quickjs-emscripten`, `yauzl` and `@itsliaaa/baileys` NOT installed, no Android SDK.

| Command | Result |
|---|---|
| `node --test test/engine-sandbox-policy.test.js` | PASS 19/19 (fake guest; NOT real QuickJS) |
| `node --test test/engine-revisions.test.js` | PASS 6/6 |
| `node --test` full, original zip | 242 tests, 4 files FAIL (missing packages) |
| `node --test` full, now | 290 tests: 283 pass, 7 FAIL, all `Cannot find package` (chat-polls, source-export, update-manager files; 4 tests in `engine-runtime.test.js`) |
| `node scripts/check.mjs` | PASS |

**Second pass (this delivery), same environment (Node v22.23.5, offline, no `node_modules`):**

| Command | Result |
|---|---|
| `node --test test/engine-invocation.test.js` | PASS 19/19 (real store, real `invokeEngine`/`executeCustomEngine` host code, recording FAKE guest) |
| mutation checks (temporarily broke the code, then restored) | pinned-revision ignored: 4 tests failed; host leaks an env value into the guest context: 2 tests failed; invocation source taken from workflow data: 1 test failed; restored: 0 failed |
| `node --test test/engine-real-quickjs.test.js` | 11 SKIPPED ("quickjs-emscripten is not installed"). NOT passed, NOT run. |
| `node --test` per file, whole suite | 302 pass, 7 fail, 11 skipped. The 7 failures are the same environmental ones: 4 in `engine-runtime.test.js` and the load failures of `chat-polls`, `source-export`, `update-manager` (missing `@itsliaaa/baileys` / `yauzl`) |
| `node scripts/check.mjs`, `node --check src/*.js` | PASS |
| Kotlin | brace/paren balance only; NOT compiled |
| Express routes, real HTTP | NOT run |

`engine-runtime.test.js` now loads (QuickJS is imported lazily), so its 4 tests fail individually instead of as one file; they remain NOT RUN in effect, not passed. Real-sandbox evidence (saved source through actual QuickJS, hostile scripts, memory/stack exhaustion) is MISSING. Express routes and Kotlin are not run.

## Dependencies and integration contract

Record upstream/downstream agents, API schemas, event formats, data ownership, permissions and contract changes. Notify dependent agents before changing a shared contract.

DRAFT contract, not yet accepted by consumers (Agents 05, 07, 10; Agent 08 for storage; Agent 04 for authorization).
- Engine file: `{manifest, code, revision (int >= 1), sha256, createdAt, updatedAt}`; `GET /api/engines/:id/revisions`, `GET /api/engines/:id/revisions/:revision`; `PUT` accepts optional `expectedRevision` (409 on mismatch).
- Invocation: `runStoredEngine(engineId, inputs, {revision?, signal?})`; workflow node config `engineRevision` pins an exact revision.
- Result: `{outputs, durationMs, engineId, engineVersion, sourceSha256, outcome:'success', networkCalls, denials[]}`; failure: `EngineExecutionError{outcome, message, denials}` with outcome in input_invalid | invalid_source | policy_denied | timeout | cancelled | resource_exhausted | runtime_error | infrastructure.
- Capability schema unchanged: only `network.fetch` with exact HTTPS hosts; GET/POST only; whitelisted headers; 16 KiB request; 512 KiB response; 2 MiB and 20 requests per run.
- **Invocation contract v1 (`src/engine-invocation.js`), still DRAFT until Agents 05/07/10 accept it:** request `{engineId, revision?, inputs, source: 'workflow'|'scheduler'|'library-test', account?: 'private'|'public', correlationId?}`; the correlation ID is 1-120 chars of `[A-Za-z0-9._:-]` or generated. Envelope `{ok, outcome, contractVersion, correlationId, source, account, engine:{id,version,revision,sourceSha256,pinned}, outputs?, durationMs?, networkCalls?, denials[], message?}`; outcomes: success, invalid_request, not_found, revision_unavailable, input_invalid, invalid_source, policy_denied, timeout, cancelled, resource_exhausted, runtime_error, infrastructure.
- Workflow executor to runner: `runEngine(id, inputs, {signal, revision, source, account, correlationId})` and nothing else (no socket, message or credentials), asserted by test. The run ID forms the correlation ID (`<runId>:<nodeId>`).
- API: `POST /api/engines/:id/run {revision?, inputs}` (saved revision only) and `GET /api/engines/:id/capabilities` return the envelope / `{capabilities, diagnostics, revision, sha256}`. Capabilities list `network.fetch` with exact hosts, methods GET/POST, HTTPS only, the byte/request limits, and a fixed `neverGranted` list (filesystem, process, environment, shell, module-loader, timers, whatsapp, credentials, internal-objects).
- Still not provided: Agent 07 invoking an immutable WORKFLOW revision (an Agent 05/07 contract; Engine revisions are pinned correctly once the workflow runs); a guest WhatsApp capability (see decision log).

## Known limitations and follow-up

List unresolved defects, assumptions, risks and intentionally deferred work.

- The REAL QuickJS sandbox is unverified in this delivery: no saved-source execution, no hostile-script suite (process/fs/env/module loader/timers/internal objects), no real memory/stack exhaustion, no TLS/redirect/slow-response tests against a live server. Run `npm install` and `node --test` on Node 24 first.
- The never-settling-promise guard, job draining and "dispose while suspended" behaviour were written from reading the QuickJS integration, and are tested only against a fake; they may behave differently in real QuickJS.
- Cancellation stops between awaits, in the interrupt handler and in network calls; a guest already inside a long synchronous call stops at the next interrupt check.
- Revisions beyond the newest 20 per Engine are not referenceable; deleting an Engine deletes its history; a workflow pinned to a pruned revision fails with "revision is not available".
- The REAL-sandbox suite (`test/engine-real-quickjs.test.js`) was written without ever being run. Several assertions are marked OBSERVE (how a host denial surfaces inside the guest, the exact outcome label for memory/stack exhaustion, which `__` globals exist); expect to adjust them from real output rather than trusting either a first pass or a first fail.
- The Android Test-run dialog is uncompiled and untested, and the Engine test route and its client-disconnect cancellation were never exercised over real HTTP. The Android HTTP client has a 30 s read timeout, so a run that queues and then runs near the 30 s Engine limit can time out on the phone while the server finishes.
- `library-test` is authorised by `requireAdmin` alone (Studio admin treated as owner); that run really calls approved hosts.
- `diagnoseEngine` is heuristic (regex) and advisory; a clean result is not a security claim.
- No guest-initiated WhatsApp actions exist (6E decision pending); the Scheduler path was verified through the shared executor and runner, not against a live WhatsApp session.
- Authorization (Agent 04) for Engine-triggering workflows relies on the workflow executor's checks (now fed by `resolveExecutionAuthorization`); the Engine layer adds only the per-call `network.fetch` capability check.
- Secret-leak audit is by code reading and offline tests only: the runtime passes no environment, credentials or socket to guest code, and results/errors carry no host paths in tests.
- Limits are assumptions (see decision log). Kotlin changes are uncompiled.

## Completion report

- **Status:** IN PROGRESS (host-side policy/limits/revisions implemented and unit-tested offline; real QuickJS NOT RUN)
- **Branch / commit / PR:** none (delivered as a zip)
- **Requirements satisfied (offline-tested, second pass adds invocation contract v1, pinned-revision runs for workflow and scheduler sources, Library run and capabilities API, advisory diagnostics, no-leak and secret-canary audit):** per-call capability and host policy; DNS private-address refusal; request/response/per-run budgets; concurrency cap; cancellation; timeout for never-settling guests; structured outcomes and denial records; immutable hashed Engine revisions with conflict detection; workflow revision pin. NOT satisfied/verified: saved source through real QuickJS, hostile-code suite, Builder AND Scheduler real invocation, WhatsApp bridge, Engine Library diagnostics UI, Agent 10 review.
- **Files and APIs changed:** see Files changed and the DRAFT contract.
- **Tests and exact results:** new tests 25/25 (first pass) and 19/19 (second pass); full suite 302 pass / 7 fail / 11 skipped, the 7 failures all missing npm packages and the 11 skips the real-QuickJS suite; `scripts/check.mjs` pass.
- **Runtime/device evidence:** none.
- **Remaining limitations:** see Known limitations and follow-up.
- **Ready for integration:** NO

## 1. Binding responsibility and security boundary

Own Engine source lifecycle and real execution: create/open/save/resolve Engine files, QuickJS integration, sandbox, permission enforcement, approved HTTPS hosts, resource limits, async bridge and structured results. Own Engine Library feature UI; Agent 08 owns generic workspace file management.

Saved Engine code must run through the actual sandbox, not mocked output or an unrestricted Node process. Treat source, configuration, workflow input and network responses as untrusted. No ambient filesystem, process, shell, environment secrets or unrestricted network. Runtime capability checks are mandatory even if the UI hides an action. Agent 04 authorization and Agent 06 sandbox capability checks must both pass. No secrets or raw WhatsApp credentials are exposed to user code.

## 2. Independent work packages

| Package | Scope and output | Parallel readiness | Integration gate |
|---|---|---|---|
| 6A — Engine inventory/file lifecycle | Audit Engine Library, source editing/persistence, IDs/revisions, create/edit/save/load/rename/delete/import/export and runtime entry paths. | Fully independent. | Generic workspace file ownership separated from executable Engine lifecycle. |
| 6B — QuickJS runtime core | One runtime entry point; load saved source; compile/execute in isolated context; deterministic input/output; cleanup. | Isolated runtime tests now. | Saved source executes through actual QuickJS in backend tests. |
| 6C — Sandbox/capabilities | Explicit capabilities; deny ambient globals; HTTPS host allowlist; permission-scoped bridge and structured denials. | Yes; hostile-script tests. | Security review and deny-by-default tests pass. |
| 6D — Resource budgets | Time/interrupt, memory/stack, output/input size, concurrency, network timeout/response size and cancellation. | Stress/fault harness now. | Exhaustion does not destabilize service. |
| 6E — WhatsApp/action bridge | Expose approved high-level actions via Agent 03; call Agent 04 for privileged operations; never expose credentials/socket. | Stub contract until adapters ready. | Account, owner, permission and isolation tests pass. |
| 6F — Builder/Scheduler invocation | Run saved Engine revision from Agent 05 workflow and Agent 07 schedule through same runtime and policy. | Invocation contract/fixtures now. | Real QuickJS run for both sources with immutable revision. |
| 6G — Engine Library UI/diagnostics | Engine-specific file list/detail, permissions/host display, save/run states, output/errors and empty/loading/offline views. | Fixture UI now. | Agent 01 UI contract and Agent 08 storage adapter. |
| 6H — Adversarial integration | Save → run → policy → bridge → result; hostile code, cancellation, secret-leak tests. | Harness now. | Agent 10 independently verifies. |

## 3. Contract-first hand-off

Publish Engine file ID/revision/hash and save/load contract; invocation request with file ID and immutable revision, account/owner context, execution source, validated input and correlation ID; capability schema and effective grants; approved hosts/method scope; structured result distinguishing success, runtime error, policy denial, timeout, cancellation and infrastructure failure; resource-budget outcomes.

Agent 05 references a saved file revision, not arbitrary unsaved content unless a separately approved preview flow exists. Agent 07 calls the same execution path. Agent 04 is authoritative for user authorization; Agent 06 for technical sandbox capabilities.

## 4. File boundaries

Own Engine runtime/sandbox modules under server source, capability schema/tests, Engine Library feature code and Engine source adapter. Existing audit leads: engine-runtime.js, EngineLibraryScreen.kt and Engine API/model area; verify exact paths.

Do not own generic file browser/editor/ENV/Notes persistence (08), command/owner policy (04), WhatsApp transport (03), Builder schema/canvas (05), Scheduler store/runner (07) or global theme/navigation (01). Agent 08 owns underlying generic storage; Agent 06 owns Engine adapter/execution lifecycle.

## 5. Required adversarial tests

Valid, malformed and empty scripts; attempts to access process/filesystem/environment/shell/module loader/unrestricted fetch/timers/internal objects; unapproved/non-HTTPS hosts and redirects; oversized/slow responses; missing/revoked capabilities; account mismatch; infinite loops, memory/stack exhaustion, oversized input/output and concurrent pressure; Engine file revision changed after workflow creation; async bridge rejection; server restart/cancellation cleanup. Real saved-source invocation from Builder and Scheduler is mandatory; mocked executor tests alone do not pass.

- [ ] Saved source executes through actual QuickJS.
- [ ] No ambient filesystem/process/environment/secret access.
- [ ] Host allowlist and permissions checked on each call.
- [ ] Agent 04 authorization applied to privileged actions/every source.
- [ ] Resource exhaustion is contained.
- [ ] Builder/Scheduler invoke intended saved revision.
- [ ] WhatsApp actions use Agent 03 adapter without exposing credentials.
- [ ] Engine Library storage boundary is clear.
- [ ] Agent 10 passes hostile-code and real integration tests.

## 6. Progress/completion report

Track 6A–6H, runtime/capability contract versions, consumers, file revisions, adversarial tests/results, real QuickJS evidence, limitations and PR. If WhatsApp/Scheduler is blocked, complete core sandbox, capability denials, budgets and saved-source tests with deterministic bridge.

- Status:
- Package status:
- Runtime/permission contract:
- Engine source lifecycle:
- Files/APIs changed:
- QuickJS real-source evidence:
- Security/resource tests:
- Builder/Scheduler invocation evidence:
- Secret-leak audit:
- Limitations:
- Branch/commit/PR:
- Ready for integration: NO
