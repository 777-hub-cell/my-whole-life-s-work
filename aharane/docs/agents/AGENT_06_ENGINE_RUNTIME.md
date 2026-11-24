# Agent 06 — Engine runtime, sandbox and Engine Library

**Initial status:** NOT STARTED  
**Owner:** Agent 06  
**Last updated:** 2026-11-23

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
