# Agent 10 — QA, security, cross-workstream integration and release readiness

**Initial status:** NOT STARTED  
**Owner:** Agent 10  
**Last updated:** 2026-11-23

## Mandatory context — read before acting

Read `aharane/docs/MASTER_PROJECT_CONTEXT.md` and `aharane/docs/AUTONOMOUS_EXECUTION_PROTOCOL.md` in full. Then read **all ten agent briefs** in `aharane/docs/agents/`, not only this one. Inspect relevant existing project Markdown, current source, tests, build/package configuration, API contracts and current GitHub branch state. You must understand the whole Aharane product and how the other nine workstreams affect yours.

## Mission

Independently review all workstreams: requirement traceability, threat modeling, API/data contract review, cross-account/session isolation, regression suites, Android/backend integration, screenshot/device QA, CI and release readiness. Read all briefs and track dependencies. Reproduce defects and verify fixes; do not take over feature ownership. Re-run workflows rather than trusting historical statuses.

## Acceptance criteria

Acceptance: critical authorization/isolation/security tests pass; Android/backend contracts integrate; important end-to-end flows work; screenshots and target-device checks are inspected; CI results are complete and accurately reported; unresolved risks are explicit. Cancelled/skipped/unrun checks prevent a clean release-ready claim.

## Ownership and boundaries

Primary ownership: test strategy, integration tests, security review, QA evidence and release-readiness report. Coordinate any feature-file fixes with its owner.

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

## 1. Mission and independence

Independently verify that the ten workstreams form one coherent, secure Aharane product. Own test strategy, contract checks, cross-account/security regressions, CI evidence, screenshot/device review coordination and final readiness report. Coordinate integration gates but do not take feature implementation ownership.

Agent 10 must work from the beginning: prepare tests, fixtures, threat model, dependency board and CI diagnostics while agents implement. Do not wait for all features to finish before writing the test plan.

## 2. Independent work packages

| Package | Scope and output | Can proceed before implementation completes? | Integration gate |
|---|---|---|---|
| 10A — Requirement traceability | Map every owner requirement to manifest package, owner, source path, test and acceptance evidence; audit stale claims/conflicts. | Yes; start immediately. | Every critical requirement has owner/status/proof. |
| 10B — Contract verification | Validate UI, chat, transport, authorization, workflow, Engine, Scheduler, storage and analytics/notification versions; add compatibility tests. | Yes as draft contracts arrive. | Producer and every consumer pass same fixtures/version. |
| 10C — Security/isolation suite | Threat model and adversarial tests for Private/Public, spoofing, API/workflow/Engine/scheduler bypass, secrets, encryption and sandbox. | Yes; matrix first. | Critical allow/deny cases pass against integrated server. |
| 10D — Functional end-to-end | Pairing, chat, media, stickers, Channels, commands, Builder, real Engine, scheduler, Files/ENV/Notes, analytics, notifications, updates and recovery. | Harness/fixtures now; live E2E after test environment. | Critical flows pass against actual services; mocks are not final proof. |
| 10E — Android visual/device/accessibility | Coordinate screenshots; inspect unique screen/states; API 26/API 36/target device; TalkBack, fonts, keyboard/insets, lifecycle, codecs and performance. | Inventory and automation now. | Real non-sensitive screenshots linked to exact build/device/theme and inspected. |
| 10F — CI/build/release evidence | Audit workflows, variants, dependency/security checks, APK metadata/signature, provenance and cancelled/skipped jobs. | Yes. | Latest candidate commit has complete relevant CI; incomplete jobs remain open gates. |
| 10G — Integration coordination | Maintain dependency board, contract readiness, conflict resolution, small integration slices and commit verification. No base merge/deploy. | Yes. | Each integration PR has owner review, contract checks and rollback path. |
| 10H — Release readiness | Evidence-based GO/NO-GO covering requirements, open defects, security, device, CI, signing, deployment approval and limitations. | Template now; decision only after evidence. | Explicit owner approval; no automatic merge/release/deploy. |

## 3. Independent verification rules

Do not accept “works” without reproducing the test or inspecting evidence. Distinguish unit, contract, integration, E2E, emulator, physical-device and production checks. A mock proves only behaviour against that mock. Re-run current-head CI; historical runs do not prove current code. Cancelled/skipped/blocked/unrun jobs are NOT RUN/INCOMPLETE and cannot be called passed. Record exact commit SHA, build variant, device/API, environment, command/workflow and artifact. Report flaky tests honestly. Agent 10 owns tests/fixtures/CI assertions; feature owner owns feature fixes.

## 4. Integration order versus parallel execution

Use interface readiness order, not serial implementation:
1. Agent 01 publishes UI Foundation Contract.
2. Agent 03 publishes transport/session/event contract and capability matrix.
3. Agent 04 publishes owner schema and authorization evaluator.
4. Agent 05 publishes workflow schema/validation contract.
5. Agent 06 publishes Engine invocation/capability contract.
6. Agent 07 publishes schedule/time/idempotency contract.
7. Agent 08 publishes storage/encryption/migration/sync contracts.
8. Agent 09 publishes metric/event, notification, Channel management and update contracts.
9. Agent 02 maps chat client behaviour to Agent 03/08 contracts.
10. Integrate small vertical slices and independently verify each.

This is the order in which contracts become integration-ready; agents can audit, implement independent packages and test adapters concurrently. For every slice record versions, producer, consumers, fixtures, owner and compatibility plan. Contract changes notify all consumers with migration/adapter instructions.

## 5. Minimum security matrix

Test Private Owner vs Public Owner distinct/same/Public-session number/other number; Private self-chat valid owner and rejection from non-owner/group/wrong account/spoofed identity; Public ordinary access and privileged rejection/acceptance; API/direct chat/workflow/Engine/scheduled paths all use same policy; cross-account messages/search/cache/media/notification deep links; pairing/session/ENV/Engine/DB secret redaction; QuickJS escape/host/resource limits; scheduler restart/duplicate/permission-revoked-before-run; migrations/Keystore loss/media integrity/view-once exclusion; and absence of Status from navigation/screens/settings/notifications/routes/fixtures.

## 6. Branch and file ownership

Own test plans/suites/instrumentation/contract harness, safe QA fixtures, screenshot index/review, threat model, CI test automation and release evidence report. Do not own production feature source or schema. Coordinate test-driven fixes with feature owner. Shared build/Gradle/CI changes are announced before modification.

All feature work happens on isolated branches. No shared branch concurrent editing. For a conflict, pause only the conflicting file/package, identify declared owner, request owner change or approved patch, integrate smallest slice and rerun affected tests. No agent merges to production/base branch, publishes a signed release or deploys without explicit owner approval. Agent 10 recommends GO/NO-GO but cannot authorize.

## 7. Completion gates

- [ ] Every critical requirement mapped to owner and evidence.
- [ ] Producer/consumer contract tests pass.
- [ ] Critical auth and cross-account tests pass.
- [ ] Real messaging, Engine and scheduled execution verified.
- [ ] Data protection/migration/offline recovery tested.
- [ ] Every screenshot is real and visually inspected.
- [ ] API 26, API 36 and target Galaxy A16 evidence recorded.
- [ ] Current relevant CI complete; skipped/cancelled jobs disclosed.
- [ ] Release metadata/signature/rollback and approval boundaries checked.
- [ ] Open risks are explicit; owner makes release decision.

## 8. Progress/completion report

Track 10A–10H, contract versions/integration SHAs, reproducible bugs, threat-model changes, CI links, device evidence, exact commands/results, risks and recommendation. Maintain central dependency map without overwriting individual agent reports.

- Status:
- Package status:
- Requirement traceability:
- Contract compatibility:
- Security/isolation:
- Real E2E:
- Screenshot/device/accessibility:
- Latest CI commit/job matrix:
- Open defects/risks:
- Release recommendation: NO-GO until all required evidence and explicit owner approval.
- Branch/commit/PR:
