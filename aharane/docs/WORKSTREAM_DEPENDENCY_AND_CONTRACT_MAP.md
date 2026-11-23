# Aharane — Ten-Agent Dependency, Contract and File-Ownership Map

**Status:** Operating design for the ten workstreams  
**Last updated:** 2026-11-23  
**Purpose:** Allow concurrent implementation without hidden blockers, duplicated logic, conflicting file edits or unsafe integration.

## 1. The central rule

The agents do not work as ten serial stages. Each agent divides its mission into independently executable packages. Every package has a named deliverable, contract, file owner, tests and an integration gate. A missing upstream implementation blocks only the dependent integration package, not all other work.

Examples:
- Agent 02 can build inbox, timeline, composer, stickers and media UI using deterministic fixtures while Agent 03 implements WhatsApp transport.
- Agent 05 can complete graph schema, canvas, editing, validation and save/load adapters while Agent 06 implements QuickJS execution.
- Agent 07 can finish recurrence calculations, persistence, claiming and Android UI against a fake executor while Agent 04/05/06 finish authorization/workflow/Engine interfaces.
- Agent 09 can build analytics charts and notification workers against event fixtures while Agents 02/03/07 publish real event producers.
- Agent 10 writes test matrices, threat model, contract tests and screenshot inventory immediately; final live integration waits for real services.

A fixture or mock enables parallel development only. It is never proof of real transport, actual QuickJS, notification delivery, persisted data or end-to-end success.

## 2. Dependency map

Arrows indicate a contract or integration dependency, not a requirement to wait before all work can start.

| Producer / owner | Publishes | Main consumers | What consumers can do before implementation is ready |
|---|---|---|---|
| Agent 01 — UI foundation | Theme tokens, typography, common components, insets, route registration, shared motion | Android feature owners 02, 05, 06, 07, 08, 09 | Build using a small documented contract and previews; do not fork global theme/navigation. |
| Agent 03 — WhatsApp transport | Account/session lifecycle, pairing API, normalized events, send/media/receipt/Channel capability contract | 02, 04, 09; indirectly 05/06/07 | Build views, adapters, fixtures and contract tests; never claim fixture data is live. |
| Agent 04 — Authorization | Owner schema/migrations, AuthorizationContext/Decision, canonical policy evaluator | 03, 05, 06, 07, protected APIs | Build policy adapters against a typed interface; privileged integration remains gated until evaluator is real. |
| Agent 05 — Workflow definition | Versioned WorkflowDefinition, node/port schemas, validation findings, immutable workflow revision | 06, 07, 10 | Build Engine/scheduler stubs and schema tests from versioned examples. |
| Agent 06 — Engine runtime | Engine file/revision, sandbox capability, invocation/result contract | 05, 07 | Build node configuration and scheduler adapters against contract; actual execution must wait for runtime. |
| Agent 07 — Scheduler | Schedule schema, recurrence/time semantics, claim/outcome/idempotency contract | 04, 05, 06, 09, Android UI | Implement UI and time/store/runner with deterministic clock/fake executor. |
| Agent 08 — Storage | DB schema, encryption/migration, cache/sync and generic durable queue contracts | 02, 06, 07, 09, Files/ENV/Notes | Use repository interfaces and in-memory test implementations; production state cannot use fakes. |
| Agent 09 — Analytics/notifications/Channels management/updates | Metric definitions, event aggregation, notification and Channel-management/update contracts | 01, 02, 03, 07, 08, 10 | Build chart/worker/management UI from deterministic event/package fixtures. |
| Agent 02 — Chat client | Chat state/action mapping and inbox/channel reader UI | 01, 03, 08, 09 | Publish UI-state/action interface early; complete screens and reducers using fixtures. |
| Agent 10 — QA/integration | Requirement matrix, contract suites, security matrix, screenshot index, CI/release evidence | All | Start immediately; add tests as contracts emerge; perform live E2E only when dependencies exist. |

### Critical dependency chains

1. **Chat:** Agent 01 foundation + Agent 03 transport contract + Agent 08 storage interface → Agent 02 real chat integration. Agent 04 controls command/owner authorisation in any command action. Agent 09 supplies Channel discovery/subscription and notifications; Agent 02 owns the Channel reader.
2. **Visual workflows:** Agent 05 owns graph schema/editor → Agent 06 owns actual execution → Agent 03 supplies transport action adapter; Agent 04 authorizes privileged actions. Agent 07 references a saved immutable workflow revision.
3. **Scheduler:** Agent 07 owns recurrence/store/runner; Agent 04 authorizes at execution time; Agent 05 supplies workflow revision; Agent 06 supplies Engine invocation; Agent 03 supplies message-send correlation; Agent 08 may supply atomic persistence; Agent 09 owns notification delivery for persisted outcomes.
4. **Files/Notes/offline:** Agent 08 owns persistence/encryption/migrations; feature owners supply domain meaning and consume the storage contract. Android server workspace files remain distinct from encrypted local chat cache.
5. **Analytics/Channels/updates:** Agent 03 and Agent 02/07 produce source events; Agent 09 defines/aggregates metrics and delivers notifications; Agent 08 may retain data; Agent 02 owns Channel conversation rendering; Agent 08 owns generic package/file staging and Agent 09 owns update experience.
6. **Visual quality:** Agent 01 owns shared foundations; feature owners own their screens; Agent 10 independently inspects final rendered app and device behaviour.

## 3. Contract register — required minimum

A contract is ready only when it has a version, owner, consumers, schema/examples, error semantics, compatibility policy and tests.

| Contract | Owner | Minimum content | Consumers |
|---|---|---|---|
| UI Foundation | 01 | Theme token IDs, typography, shared components, insets, route registration, motion, accessibility | 02, 05–09 |
| Session/Pairing | 03 | Account identity, Private/Public role, pairing lifecycle, safe status/errors, credential boundary | 01, 02, 04 |
| Message/Event | 03 | Message/conversation/media IDs, event ordering, receipts, edit/revoke, groups, Channels, capability flags | 02, 09, 10 |
| Chat Client | 02 | Chat state model, action requests, account-scoped identity, receipt semantics and unsupported states | 01, 03, 08, 09 |
| Authorization | 04 | Verified identity context, command privilege, execution source, allow/deny reason, policy version | 03, 05, 06, 07 |
| Workflow Definition | 05 | Versioned graph/node/port/edge model, immutable revision, validation findings, execution request | 06, 07, 10 |
| Engine Invocation | 06 | File ID/revision, account and source context, capability grants, budgets, outputs/errors/cancel | 05, 07 |
| Schedule | 07 | Target account, recurrence, IANA zone, misfire/retry, atomic claim, idempotency, outcome event | 04, 05, 06, 09 |
| Storage/Sync | 08 | Database version, encryption, account partition, transactions, cache, cursor, queue and recovery | 02, 06, 07, 09 |
| Analytics Events | 09 | Metric definitions, event identity/dedupe, period/timezone, attribution, freshness and aggregation | 03, 02, 07, 10 |
| Notification | 09 | Event source, channel ID, permission, deep link, dedupe key, privacy and cancellation | 02, 03, 07, 08 |
| QA evidence | 10 | Requirement ID, test level, exact commit/device, command/result, screenshot/artifact, risk | Owner/release decision |

A proposal or draft contract can unblock interface work, but it must be marked DRAFT. A dependent adapter can be built against a draft contract and must be updated when the owner approves a version. Do not let consumers silently invent schemas.

## 4. File-ownership and collision policy

Before editing, the agent must check the current branch's actual files and search for recent changes. File names below are ownership domains, not permission to modify a mixed-purpose file without inspection.

| Area / protected surface | Primary owner | Other agents' permitted involvement |
|---|---|---|
| Root Compose theme, typography, app shell, NavHost, global insets and shared components | 01 | Feature agents consume public APIs; route registration only through agreed interface. |
| Chat screens, message state and chat interactions | 02 | 01 supplies primitives; 03 supplies APIs/events; 08 supplies storage. |
| WhatsApp runtime/socket/session/pairing/event transport | 03 | 04 supplies policy; clients consume routes/contracts. |
| Owner config/migration, command registry/dispatch, policy evaluator | 04 | 03/05/06/07 call the published evaluator; no duplicated policy branches. |
| Builder graph schema/editor/canvas/validator | 05 | 06 consumes schema; 07 references saved workflow revision. |
| Engine runtime/sandbox/capabilities and Engine Library adapter | 06 | 05/07 invoke versioned endpoint; 08 supplies generic storage. |
| Scheduler store/runner/API and Scheduler feature adapter | 07 | 04/05/06/03 provide policy/execution contracts; 09 handles notification. |
| Generic local DB/encryption/migrations/cache/queue; Files/ENV/Notes persistence adapters | 08 | Feature owners define domain requirements; 08 owns underlying persistence. |
| Analytics aggregation, notification delivery, Channel discovery/subscription, update experience | 09 | 02 owns Channel reader; 03 owns transport; 08 owns generic package storage. |
| Tests, contract harness, threat model, screenshot index, CI evidence | 10 | Feature owners fix their own production defects. |

Shared hotspots require one editor at a time: root navigation/theme, MainActivity, repository interfaces, API route registries, Room schema/migrations, common models, Gradle/workflow files. For each hotspot, record the declared owner, proposed change, affected consumers, reviewer and merge order. Do not let two agents edit one file concurrently.

If a package needs a file owned by another agent:
1. Open a small interface/change request with desired behaviour, fields, reason and test.
2. Continue unrelated packages.
3. The file owner implements or explicitly delegates the file edit.
4. Both agents add/update contract tests.
5. Notify every consumer before a breaking version change.
6. Integrate the smallest reviewable commit and rerun affected tests.

## 5. Parallel execution stages

### Stage A — Discovery and interfaces
All agents read master context, protocol and all manifests. Each audits real source/tests, produces file map and discrepancy list, identifies contracts and publishes draft interfaces. No bulk overlapping edits.

### Stage B — Independent implementation
Each agent works on packages that do not require unfinished dependencies. Use deterministic fixtures and typed adapters for external services. Keep mocks out of production behaviour. Agent 10 builds test matrices in parallel.

### Stage C — Contract integration
When both producer and consumer interfaces are ready, run contract tests and connect the adapters. A contract-ready milestone does not imply the backend implementation is complete.

### Stage D — Thin vertical slices
Integrate one real user journey at a time (for example pairing → open inbox → send text → receive receipt). Fix boundaries without delaying unrelated packages. Every slice has tests, logs without secrets and screenshots where UI exists.

### Stage E — Hardening and acceptance
Real accounts/server, failure/restart/offline, security, Android API 26/API 36, target Samsung device, actual screenshots and latest CI. A feature cannot be marked DONE while its own integration gate remains unverified.

## 6. Blocker and status rules

- Block a package, not an entire agent, wherever possible.
- A BLOCKED item must state: missing dependency, owner, exact contract/decision needed, what has already been prepared, workaround and next unblocked package.
- The agent continues work against the agreed draft interface unless doing so would create security risk or significant rework.
- Record DRAFT/ACCEPTED/DEPRECATED contract state separately from implementation status.
- Never label mocks as integrated, screenshots as visually accepted without inspection, or tests as passed when skipped/cancelled.
- Feature agents own feature correctness; Agent 10 independently verifies.
- Lead integration coordinates boundaries and review. No base merge, production deployment or release publication without explicit owner approval.

## 7. Per-package hand-off template

Each package should record:
- Package ID and agent.
- Goal and explicit non-goals.
- Owned files and protected/shared files touched.
- Inputs/contracts and their version/status.
- Output/API/artifact.
- Independent work possible before dependency.
- Tests at unit/contract/integration/device levels.
- Acceptance gate and proof.
- Consumers and migration notes.
- Current state, blocker and next unblocked task.

## 8. Readiness definition

The ten agents are ready to start in parallel when: all manifests define package boundaries; every shared hotspot has an owner; each cross-agent dependency has an interface owner; draft contracts and fixture strategy exist; each agent has an isolated branch; and Agent 10 has the initial requirement/security/test matrix. This does not imply that all implementations or integrations are already complete.
