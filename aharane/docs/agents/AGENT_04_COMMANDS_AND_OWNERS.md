# Agent 04 — Commands, permissions and Private/Public owners

**Initial status:** NOT STARTED → IMPLEMENTED (4A–4E, 4G done; 4B/4F partial) — NOT yet integrated: needs Node 24 run, Agent 10 review and device verification  
**Owner:** Agent 04  
**Last updated:** 2026-11-24

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
| RESOLVED | Is there one authorization evaluator? | `src/authorization.js`, `src/command-registry.js` `dispatchCommand`, `src/index.js` inbound path | No. Three separate helpers; `dispatchCommand` trusts caller-supplied `privateControl`/`isPublicOwner` booleans. | Added `evaluateAuthorization` (policy v1), now v2. All five entry paths (live message, dispatch, scheduler, visual workflow, admin preview) derive privilege through `resolveExecutionAuthorization`; none call the identity primitives directly. |
| RESOLVED | Do scheduled runs re-check privilege? | `executeScheduledWorkflow` in `src/index.js` | No. Hard-coded `privateControl: account==='private'` and `isPublicOwner: account==='public'`. | Now calls `evaluateAuthorization` at run time; Private denied runs fail with a reason code and are not replayed. |
| RESOLVED | Do LID-addressed Private self-chats work? | `isPrivateSelfChat` call in `src/index.js` omitted `ownLid`/`remoteJidAlt` | They failed closed (commands never ran). | Both private call sites now pass `ownLid` and `remoteJidAlt`. |
| RESOLVED | Public Owner with LID senders | `senderJid` derivation in `src/index.js` | Already prefers the paired phone JID before `isPublicOwnerSender`. No defect. | None. |
| RESOLVED | Modern group ids | `src/policy.js` | Hyphen-only pattern hid current `120363...@g.us` groups from the Private chat list and public-workflow group scope. | Shared `GROUP_JID` pattern; groups still cannot invoke ordinary commands. |
| RESOLVED | Does `dispatchCommand` trust caller-supplied flags? | `src/command-registry.js` (old lines 70-95), `test/command-registry.test.js` | Yes: it read `context.privateControl` / `context.isPublicOwner`. | `dispatchCommand` now takes a verified `auth` proof, calls the evaluator, and overwrites any caller-supplied flags. Missing/empty `auth` denies. Registry scope must match the session. |
| RESOLVED | Admin workflow test endpoint set privilege from account type | `POST /api/visual-commands/:id/test` in `src/index.js` | Hard-coded `privateControl: account==='private'`, `isPublicOwner: account==='public'`. | Now `source: 'admin-preview'` through the evaluator. Preview needs a configured owner; an unconfigured owner previews as non-owner. |
| RESOLVED | Is generic `api` a trusted source? | `test/authorization.test.js` asserts `source: 'api'` → `untrusted-source` | No, and that stays. | Added a separate, explicit `admin-preview` internal source usable only after `requireAdmin`. |
| RESOLVED | Public ordinary commands and public-workflow sender eligibility were decided inline in `index.js` | `isAllowedInbound` call sites | Policy duplicated outside the evaluator. | New privileges `public-command` (direct, non-group, non-self) and `public-automation` (eligible sender; groups need a valid participant) in the evaluator. Behaviour unchanged. |
| ASSUMPTION | Public scheduled run with no Public Owner configured | `executeScheduledWorkflow` | Runs as a non-owner rather than failing (existing behaviour, kept). Private scheduled runs still fail closed. | Revisit if a public schedule should require an owner. |
| ASSUMPTION | Studio admin API is the owner | `requireAdmin` routes in `src/index.js` | Schedule creation is trusted as the owner's act, then re-checked at run time. | Revisit if multi-admin is added. |

Use RESOLVED, ASSUMPTION, CONFLICT or BLOCKED. Resolve ordinary uncertainty independently and continue.

## Work plan and progress

| Task | Status | Evidence / notes |
|---|---|---|
| Read master context, protocol and all ten briefs | NOT DONE | This pass read only this brief and `README.md`. `MASTER_PROJECT_CONTEXT.md`, `AUTONOMOUS_EXECUTION_PROTOCOL.md` and the other nine briefs were not read; cross-agent boundaries above come from this brief alone. |
| Audit current requirements, source and tests | DONE | See decision log (4A). |
| Define acceptance tests and dependencies | DONE | 4G matrix in `test/authorization.test.js`, `test/command-registry.test.js`, `test/dual-account-foundation.test.js`. |
| Implement assigned work | DONE (4A, 4C, 4D, 4E, 4G); PARTIAL (4B, 4F) | 4C evaluator v2. 4D single dispatch path. 4E all execution paths adopted + regression guard. 4B migration/restart tests added (v1, v2, v3, corrupt, invalid, independence). 4F: owners API still only structurally tested, no behavioural round-trip test. |
| Run focused and regression tests | DONE (Node 22, offline) | See Verification evidence: 238 pass / 0 fail over 23 suites; 4 suites could not run offline. Not run on Node 24. |
| Verify real runtime/device behavior where applicable | NOT STARTED | |
| Update this document with evidence | NOT STARTED | |
| Submit integration report | NOT STARTED | |

## Files changed

- `src/command-parser.js` (new): `parseCommand`/`VALID_NAME` moved out so `authorization.js` and `command-registry.js` do not import each other. `command-registry.js` re-exports `parseCommand`.
- `src/authorization.js`: policy v2; privileges `public-command`, `public-automation`; source `admin-preview`; new `resolveExecutionAuthorization`.
- `src/command-registry.js`: `dispatchCommand` authorises via the evaluator from an `auth` proof, ignores caller flags, optional `onDenied` audit hook.
- `src/index.js`: live message path, scheduler and admin preview use `resolveExecutionAuthorization`; dispatch passes `auth`; removed direct primitive calls and unused import.
- `scripts/check.mjs`, `package.json`: register `src/command-parser.js`; foundation markers updated to the canonical resolver.
- `test/command-registry.test.js`, `test/authorization.test.js`, `test/owner-config.test.js`, `test/dual-account-foundation.test.js`: tests listed under Verification evidence.
- Not changed: `src/visual-command-builder.js` (Agent 05), `src/scheduler-*.js` (Agent 07), `src/owner-config.js` (behaviour already correct; tests added).

## Verification evidence

Environment: Node v22.23.5, no network, no `node_modules` (repo requires Node >=24).

- `node --test --test-timeout=60000 --test-force-exit test/<file>.test.js`, run per file: **238 pass / 0 fail across 23 suites.**
- **NOT RUN (missing dependency, offline):** `chat-polls`, `engine-runtime`, `source-export`, `update-manager`. They need `@itsliaaa/baileys`, `quickjs-emscripten` or `yauzl`. They reference the changed modules only as fixture path strings.
- `node scripts/check.mjs`: passed. `node --check` on `src/index.js`, `authorization.js`, `command-registry.js`, `command-parser.js`, `owner-config.js`: passed.
- NOT RUN: `npm install`, `npm test`/`npm run check` as a whole, Node 24, any real WhatsApp session or Android device.
- New negative/positive coverage: spoofed `fromMe`, group, wrong account, cross-session registry, spoofed context flags, missing/empty/`api`/undefined source, private LID/phone mismatch, Public Owner equal to Private Owner / bot number / another number, scheduler owner-removed and session-changed, owner-config v1/v2/v3 migration, corrupt file, invalid numbers, owner independence, restart round-trip, and a guard that `index.js` never calls the identity primitives or derives flags from the account type.

## Dependencies and integration contract

**Contract changes (notify Agents 03, 05, 06, 07 before merge):**
- Policy version is now 2. `AuthorizationContext` inputs: `source` (`direct`|`scheduler`|`admin-preview`), `sessionId`, `ownerConfig`, `message`, `remoteJid`, `remoteJidAlt`, `senderJid`, `participantJid`, `participantAltJid`, `ownJid`, `ownLid`. `AuthorizationDecision`: `{ allow, reason, policyVersion }`.
- `dispatchCommand({ registry, rawText, prefix, context, auth, onDenied })`: `auth` is required; flags in `context` are ignored and overwritten.
- Workflow/Engine contexts must take `privateControl`, `isPublicOwner`, `allowedPublicSender` from `resolveExecutionAuthorization(...)` and must not copy policy conditions.
- Agent 03 supplies transport identity (`ownJid`, `ownLid`, `remoteJidAlt`, `participantAltJid`); Agent 04 only evaluates it.

## Known limitations and follow-up

- `visual-command-builder.js` (Agent 05) still reads the three flags from the context it is given and does not re-verify them. Safety rests on every call site coming through the resolver, enforced by the regression test in `dual-account-foundation.test.js`. Any new workflow entry point must be added there.
- Engine execution carries no privilege context of its own; privilege reaches Engines only through the workflow context.
- 4F: no behavioural test of `GET/PUT /api/owners` (only route-presence assertions); needs a running server with dependencies.
- Not verified on Node 24, with real WhatsApp sessions, on a device, or by Agent 10.
- Multi-admin is unsupported by assumption (see decision log).

## Completion report

- **Status:** IMPLEMENTED, not integrated
- **Branch / commit / PR:** none yet. Changes exist only in the working copy of `aharane-source.zip`; not committed or pushed.
- **Requirements satisfied:** one evaluator for all execution paths (4C/4D/4E); backend enforcement; spoof/group/wrong-account/cross-session negative tests (4G); distinct owners preserved through migration and restart (4B, tested).
- **Files and APIs changed:** see Files changed. API change: `dispatchCommand` signature. No HTTP API changes.
- **Tests and exact results:** 238 pass / 0 fail on Node 22, offline; 4 suites not run (see Verification evidence).
- **Runtime/device evidence:** none.
- **Remaining limitations:** see Known limitations.
- **Ready for integration:** NO. Blocked on a Node 24 `npm test`, Agent 10 adversarial review, and runtime/device verification.

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

- [x] Separate owner fields and migrations preserve every valid owner arrangement. (unit-tested)
- [x] One evaluator is used for all execution paths. (regression-guarded)
- [x] Private self-chat cannot be bypassed through groups or other sessions. (unit-tested)
- [x] Public ordinary and privileged-owner flows both behave correctly. (unit-tested)
- [x] Public Owner never becomes conflated with Public bot number. (unit-tested)
- [x] Missing/untrusted context denies privileged/private operations. (unit-tested)
- [ ] Agent 10 passes adversarial isolation tests.

## 7. Progress/completion report

Track 4A–4G, schema/policy version, callers, migration compatibility, evidence, changed paths, exact tests/results, risks and PR. While adapters are pending, finish evaluator/schema/migration/unit tests/fixtures.

- Status: implemented, awaiting verification
- Package status: 4A done; 4B partial (tests added); 4C done; 4D done; 4E done; 4F partial; 4G done (Agent 10 review pending)
- Owner schema/migration versions: owner-config v4; v1/v2/v3 read paths tested
- Authorization contract/consumers: policy v2; consumers are live message path, `dispatchCommand`, scheduler, visual workflows, admin preview
- Execution paths covered: direct message, dispatch, scheduler, visual workflow (message and command triggers), admin preview. Engine receives privilege only via workflow context.
- Files/APIs changed: see Files changed
- Positive/negative test results: 238 pass / 0 fail (Node 22, offline); 4 suites not run
- Migration/restart evidence: `test/owner-config.test.js` (11 tests)
- Remaining risks: see Known limitations
- Branch/commit/PR: none yet
- Ready for integration: NO
