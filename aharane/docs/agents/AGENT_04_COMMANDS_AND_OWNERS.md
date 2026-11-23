# Agent 04 — Commands, permissions and Private/Public owners

**Initial status:** NOT STARTED  
**Owner:** Agent 04  
**Last updated:** 2026-11-23

## Mandatory context — read before acting

Read `aharane/docs/MASTER_PROJECT_CONTEXT.md` and `aharane/docs/AUTONOMOUS_EXECUTION_PROTOCOL.md` in full. Then read **all ten agent briefs** in `aharane/docs/agents/`, not only this one. Inspect relevant existing project Markdown, current source, tests, build/package configuration, API contracts and current GitHub branch state. You must understand the whole Aharane product and how the other nine workstreams affect yours.

## Mission

Own command registry/execution, owner configuration, permission policy and Private/Public separation. Preserve independent Private Owner and Public Owner settings. Private self-chat commands are restricted to the intended Private session self-chat and verified Private Owner; Public ordinary commands follow public policy while privileged actions remain owner-authorized. Audit every entry path, including API, workflow, scheduled and synthetic events. Coordinate Agents 03, 05, 06 and 07.

## Acceptance criteria

Acceptance: backend authorization is enforced; spoofed sender, group, wrong account and cross-session tests fail safely; valid owner/public flows work; owner config survives migration/restart; no general sender allowlist substitutes for intended policy.

## Ownership and boundaries

Primary ownership: command registry, policy/authorization and owner configuration. Coordinate workflow/scheduler authorization contracts.

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

## 1. Binding owner rules

Own command dispatch, independent Private/Public Owner settings and the canonical server-side authorization evaluator. Hiding Android controls is not security.

- Private commands are accepted only in the intended Private session self-chat and only from verified Private Owner. Reject groups, unrelated chats, Public session messages, spoofed sender fields and ambiguous identity.
- Public ordinary commands follow the intended open public policy. Privileged operations are restricted to configured Public Owner.
- Public Owner may be the Private Owner, the Public session's own number, or another configured number.
- Do not introduce a general public sender allowlist as a substitute.
- Apply the same policy to API, direct chat, command, Engine, workflow, scheduler, synthetic/test and internal trigger paths.
- Agent 03 proves transport identity; Agent 04 evaluates policy. These are separate responsibilities.

## 2. Independent work packages

| Package | Scope and output | Parallel readiness | Integration gate |
|---|---|---|---|
| 4A — Identity/owner audit | Trace session IDs, paired numbers, owner settings, aliases, LID/JID mapping, migrations and UI round-trips; create data lineage/defect register. | Independent first task. | Identity sources and legacy formats documented. |
| 4B — Owner schema/migration | Separate PrivateOwner/PublicOwner fields; validate identity forms; preserve distinct owners; atomically migrate supported old versions; handle ambiguity without guessing. | Design and fixture tests start immediately. | Migration/rollback plan reviewed; tests pass. |
| 4C — Canonical policy evaluator | One evaluator receives verified session/account, sender, conversation/self-chat proof, privilege and execution source; returns structured allow/deny reason. | Unit tests use synthetic contexts. | Contract accepted by Agents 03/05/06/07. |
| 4D — Command registry/dispatch | Registry metadata, parsing, aliases/help, privilege classification and one dispatch path that always calls evaluator. | Parsing can use a fake evaluator. | Command descriptor/dispatch contract published. |
| 4E — Execution-path enforcement | Apply evaluator to API/direct command, workflow, Engine, scheduler, synthetic triggers and internal bridges. Reject untrusted/missing context. | Adapters start as soon as evaluator API is stable. | Positive and negative tests for every entry path. |
| 4F — Owner configuration API | Stable read/write schema for independent owners, separate Public bot identity, validation errors and migration state; coordinate UI with Agent 01. | UI can use fixture contract. | Round-trip/restart/API compatibility tests pass. |
| 4G — Adversarial regression suite | Cross-account, spoofing, group/self-chat, owner variants, privilege escalation, API/workflow/schedule and migration tests. | Matrix can be created immediately. | Agent 10 independently reviews/runs it. |

## 3. Canonical authorization contract

Publish versioned AuthorizationContext and AuthorizationDecision structures. Context distinguishes:
- Server-resolved AccountId and Private/Public role.
- Authenticated sender and verified LID/JID/phone mapping.
- Conversation JID/type and independently established self-chat/fromMe proof.
- Command/action privilege classification.
- Execution source: direct message, authenticated API, workflow, Engine, scheduler or internal operation.
- Trusted creator/owner context where needed, never a caller-provided display label.

Decision contains allow/deny, stable reason code, policy version and safe audit metadata. Missing, stale, conflicting or unverifiable context denies privileged/private operations. Public ordinary commands remain available under the explicit public policy. Re-evaluate permissions when a workflow/schedule executes; do not persist stale owner approval.

## 4. File boundaries

Own owner configuration model/schema/migrations, canonical evaluator, command privilege descriptors, dispatch enforcement modules and focused server tests. Recheck exact source paths; owner-config.js is an audit lead.

Do not own WhatsApp identity transport (03), Engine sandbox (06), workflow graph/editor (05), scheduler lifecycle (07), Android global shell (01) or generic encryption/storage (08). Agents 03/05/06/07 call the shared evaluator; they must not copy policy conditions. Agent 04 fixes missed authorization adapters; feature owners retain invocation mechanics and UI.

## 5. Security and migration invariants

- Default-deny when context cannot be verified for privileged/private operations.
- Public bot/session identity is not the Public Owner field.
- Changing one owner never silently changes the other or the Public bot number.
- Preserve valid distinct owners; surface ambiguous legacy configuration for safe resolution.
- Validate before atomic persistence and provide recoverable rollback for destructive transforms.
- Never trust Android-provided owner labels or isOwner booleans.
- Do not normalize LID/JID in a way that merges identities across accounts.
- Audit denials using safe reason codes, never full message content or secrets.

## 6. Verification gates

Test Public Owner equal to Private Owner, Public session number and a different configured number. Test ordinary Public command from non-owner; privileged Public rejection for non-owner and acceptance for correct Public Owner; Private self-chat from verified owner; rejections from non-owner, group, unrelated self-chat, Public account, spoofed fromMe, wrong LID/JID and absent account. Repeat through API, Engine, workflow and scheduled paths. Test every supported config migration and restart.

- [ ] Separate owner fields and migrations preserve every valid owner arrangement.
- [ ] One evaluator is used for all execution paths.
- [ ] Private self-chat cannot be bypassed through groups or other sessions.
- [ ] Public ordinary and privileged-owner flows both behave correctly.
- [ ] Public Owner never becomes conflated with Public bot number.
- [ ] Missing/untrusted context denies privileged/private operations.
- [ ] Agent 10 passes adversarial isolation tests.

## 7. Progress/completion report

Track 4A–4G, schema/policy version, callers, migration compatibility, evidence, changed paths, exact tests/results, risks and PR. While adapters are pending, finish evaluator/schema/migration/unit tests/fixtures.

- Status:
- Package status:
- Owner schema/migration versions:
- Authorization contract/consumers:
- Execution paths covered:
- Files/APIs changed:
- Positive/negative test results:
- Migration/restart evidence:
- Remaining risks:
- Branch/commit/PR:
- Ready for integration: NO
