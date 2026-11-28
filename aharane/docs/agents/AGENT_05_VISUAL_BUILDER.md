# Agent 05 — Visual Command Builder and workflow editor

**Initial status:** NOT STARTED  
**Current status:** IMPLEMENTED (code complete for the packages below) — backend/schema/runtime-adapter logic VERIFIED by unit tests; HTTP routes, Android build/tests, emulator screenshots and real WhatsApp/QuickJS runs NOT RUN  
**Owner:** Agent 05  
**Last updated:** 2026-11-24

## Mandatory context — read before acting

Read `aharane/docs/MASTER_PROJECT_CONTEXT.md` and `aharane/docs/AUTONOMOUS_EXECUTION_PROTOCOL.md` in full. Then read **all ten agent briefs** in `aharane/docs/agents/`, not only this one. Inspect relevant existing project Markdown, current source, tests, build/package configuration, API contracts and current GitHub branch state. You must understand the whole Aharane product and how the other nine workstreams affect yours.

## Mission

Own visual workflow authoring: node palette/categories, canvas rendering, connections, selection, pan/zoom, drag, properties, validation, save/load and specified import/export. Coordinate execution contracts with Agent 06, permissions with Agent 04, WhatsApp actions with Agent 03 and Android foundations with Agent 01. Investigate the previously observed blank-canvas screenshot as a potential real defect.

## Acceptance criteria

Acceptance: nodes/wires render reliably; mobile editing gestures work; workflows validate and persist/reload; nodes have clear configuration; invalid graphs show useful diagnostics; saved workflows reach the real execution engine.

## Ownership and boundaries

Primary ownership: visual builder UI/model/editor and tests. Coordinate shared workflow schema and runtime contracts.

These are coordination boundaries, not permission to overwrite shared files. Check current file overlap and coordinate before changing shared contracts or files.

## Discovery and decision log

Q&A means investigating and resolving questions from repository evidence, not waiting for routine owner answers.

| Status | Question investigated | Evidence (paths/symbols/tests) | Finding and decision | Reason / consequence |
|---|---|---|---|---|
| RESOLVED | Is the per-run message limit capped at a small fixed value? | `src/visual-command-builder.js` validateWorkflow (trigger.command, trigger.message, media.sendImages) and executeVisualWorkflow (image limit); Kotlin label in `VisualCommandBuilderScreen.kt` ("1–20") | YES: hard cap of 20 in 4 JS checks + the Android label. Decision: replace with user-configurable limit bounded only by an independent system ceiling `SYSTEM_MAX_MESSAGES_PER_RUN = 500`; runtime also clamps to the ceiling (defence in depth). Time (30 s), step (200), node (100) and repeat limits are unchanged. | Brief forbids a small fixed UI cap; system protections stay. 500 is an ASSUMPTION for lead review. Tests: `test/workflow-schema-and-limits.test.js` (limit 21/100/500 valid, 501/0/-3/2.5/'abc' invalid; 25 messages really sent at limit 30; 20 enforced at runtime). |
| RESOLVED | Is the workflow document versioned? | `normalizeWorkflow` hard-coded `version: 1`; no revision; `updatedAt` rewritten on normalize | NO. Added `schemaVersion` (=2) and a server-managed `revision` counter; v1 documents (no schemaVersion/revision) migrate on load; newer/malformed schemaVersion rejected via `assertSupportedWorkflowSchema` (POST/PUT + store.save). Legacy `version` kept as an alias. | Needed for Agents 06/07 contract. Test: schema v2 + migration + round-trip + rejection. |
| RESOLVED | Can a stale editor silently overwrite a newer saved workflow? | `store.save`, PUT `/api/visual-commands/:id` | YES (last write wins). Added optional `expectedRevision`: a stale value returns HTTP 409 `{conflict:true,currentRevision}` and writes nothing. Clients that omit it keep working (backward compatible). Android client now round-trips `revision` and sends `expectedRevision`; undo/redo preserve the current revision to avoid false conflicts. | Brief: "no silent overwrite/data loss". Android part NOT COMPILED. |
| RESOLVED | Are oversized workflows silently truncated? | `normalizeWorkflow` sliced to 100 nodes/300 edges BEFORE `store.save`'s size check, so POST/PUT routes (which normalize first) truncated silently | YES (real defect). normalize now keeps MAX+1 so overflow stays detectable; validate/save reject. | Test: 101 nodes / 301 edges rejected, nothing stored. |
| RESOLVED | Duplicate node definitions? | `media.forwardOriginal` defined twice (Messages and Media categories); `definitions` Map kept only the last | Removed the second (Media) entry; added library-uniqueness test. | Palette and lookup could disagree. |
| RESOLVED | Android canvas geometry consistent? | Kotlin used 206 dp for node width in fit/extent maths; card is drawn 236 dp; pinch min zoom 0.5 vs buttons 0.35 | Introduced `NODE_CARD_WIDTH_DP`, `WORKSPACE_MIN_ZOOM/MAX_ZOOM`; all uses switched. | Right-most node was clipped after fit. NOT COMPILED/NOT RUN. |
| BLOCKED | Previously observed blank-canvas screenshot: real defect? | `VisualCommandBuilderScreen.kt` canvas block; `VisualCommandBuilderLayoutTest` (position math only); CI job `preview-screenshots` in `.github/workflows/aharane-android.yml` | NOT REPRODUCED. No Android SDK/emulator/network in this environment. Code review leads only: wires are skipped silently when socket positions are not yet measured (`?: return@forEach`); the node-width mismatch above. Added instrumented test `canvasHasMeasuredBoundsAndNodesAreVisibleInsideIt` (NOT RUN). | Cannot close finding without a visually inspected emulator screenshot (CI job). Remains OPEN. |
| ASSUMPTION | `profile.updateStatus` ("Change profile status") vs "No Status node" rule | `visual-command-builder.js` node library | Treated as WhatsApp profile About text, not the Status/Stories feature; left unchanged. | Flagged for lead review; remove if the rule is read broadly. |
| RESOLVED (draft contract) | Agents 06/07 expect an IMMUTABLE workflow ID/revision (dependency map, Agent 06 §6F, Agent 07 7A). | `store.save/getRevision/listRevisions`, `executeWorkflowRevision` | Every successful save now appends an immutable snapshot (last 50 per workflow, returned as clones, persisted in the store file, legacy workflows seeded at their current revision). `executeWorkflowRevision(id, revision, opts)` runs exactly that snapshot and refuses unsaved/unknown revisions. Routes: GET `/revisions`, GET `/revisions/:n`; test route accepts `revision`. | Contract still DRAFT: Agents 06/07 have not accepted it. Deleting a workflow deletes its history; a revision older than the newest 50 is no longer referenceable (documented limitation). |
| RESOLVED | Run states queued/running/succeeded/failed/cancelled; cancellation | `executeVisualWorkflow` wrapper, `RUN_STATUSES`, `options.onStatus`, `options.signal` | Added explicit status + runId/timestamps/workflowRevision on every result; cancel via AbortSignal between nodes and inside Wait nodes; cancelled is distinct from failed; a failure never reports succeeded. | Tests: status order, failed, send error, cancel mid-Wait (no send afterwards), pre-aborted. |
| RESOLVED | Duplicate-send prevention | `store.claimExecution`, `options.deduplicate` | Opt-in per run: key = workflow ID + trigger message ID (or `event.idempotencyKey`); persisted, 24 h TTL, max 2000 claims, dry runs never claim, claims are per workflow. Enabled in `index.js` for the real command and message-trigger paths. Scheduled runs NOT opted in (Agent 07 owns schedule idempotency). | Tests incl. restart persistence. Claim happens just before nodes run, so a run that fails mid-way cannot be replayed for the same message (safe against duplicate sends; retry needs a new message). |
| RESOLVED | Import/export | `exportWorkflow`, `importWorkflow`, GET `/:id/export`, POST `/import` | Versioned `aharane.workflow` format; import is size-limited (512 KB), schema-checked, node/edge-limited, always a fresh DISABLED draft at revision 1, unknown node types surface as validation errors (not silently fixed). | Tests: round trip, forced `enabled:true` ignored, malformed/oversized/newer schema rejected. |
| RESOLVED | Validation findings name the exact edge | `validateWorkflow` issue shape | Every finding now has `edgeId` (null for node-level findings); edge problems (missing node, bad socket, type mismatch, extra input connection, extra exec output) carry the edge ID. | Test: bad-type / ghost-edge / dup-input. |
| RESOLVED | Web Control Centre and API proxy use the builder API? | grep of `control-centre/app.js`, `production-bridge.js`, `api/aharane/[...path].js`, `index.html` | No references to visual-commands, `maxMessagesPerRun` or the old "1–20" text; the proxy passes requests through. | Nothing to change there. |
| RESOLVED | Android save conflict UX | `saveDraft()` in `VisualCommandBuilderScreen.kt` | A 409 revision conflict shows a clear message; the on-screen graph is left untouched (save failures already preserved the working graph). | NOT COMPILED. |

Use RESOLVED, ASSUMPTION, CONFLICT or BLOCKED. Resolve ordinary uncertainty independently and continue.

## Work plan and progress

| Task | Status | Evidence / notes |
|---|---|---|
| Read master context, protocol and all ten briefs | PARTIAL | Read in full: MASTER_PROJECT_CONTEXT, AUTONOMOUS_EXECUTION_PROTOCOL, this brief. Other nine briefs, dependency map and requirement ledger were searched for workflow/revision/limit contract points only, NOT read in full. |
| Audit current requirements, source and tests | DONE | Builder JS, tests, Kotlin screen/model/tests, CI workflow, control-centre, API proxy and Android repository error path audited. |
| Define acceptance tests and dependencies | DONE | `test/workflow-schema-and-limits.test.js` (8) and `test/workflow-lifecycle.test.js` (12). |
| Implement assigned work | IMPLEMENTED | 5A schema/revisions, 5D validation (edge IDs, limits), 5E save/conflict/import/export, 5F/5G run states + cancel + revision runs + duplicate protection: IMPLEMENTED and unit tested. 5B/5C Android canvas fixes: IMPLEMENTED, NOT COMPILED, NOT RUN. |
| Run focused and regression tests | DONE (JS) / NOT RUN (Kotlin, HTTP routes) | See Verification evidence. |
| Verify real runtime/device behavior where applicable | NOT RUN | No emulator, device, SDK, or network available. Blank-canvas screenshot NOT reproduced. |
| Update this document with evidence | DONE | This update, 2026-11-24. |
| Submit integration report | NOT STARTED | Not ready: Android build/tests and immutable-revision work outstanding. |

## Files changed

List every changed source, test and documentation path with its purpose.

| Path | Purpose |
|---|---|
| `src/visual-command-builder.js` | `WORKFLOW_SCHEMA_VERSION`, `SYSTEM_MAX_MESSAGES_PER_RUN`, `assertSupportedWorkflowSchema`, schemaVersion/revision + v1 migration, configurable message limit, runtime clamp, overflow no longer truncated, `store.save(input, {expectedRevision})` with conflict error, duplicate `media.forwardOriginal` removed; revision history (`listRevisions`, `getRevision`), `claimExecution`, `executeWorkflowRevision`, run-status wrapper (`RUN_STATUSES`, `onStatus`, `signal`), `exportWorkflow`/`importWorkflow`, `edgeId` on findings |
| `src/index.js` | POST/PUT `/api/visual-commands`: schema check; PUT accepts optional `expectedRevision`, returns 409 `{conflict, currentRevision}`; new GET `/:id/revisions`, GET `/:id/revisions/:revision`, GET `/:id/export`, POST `/import`; test route runs a saved revision (optional `revision`); `deduplicate: true` on real command and message-trigger execution |
| `test/workflow-lifecycle.test.js` (new) | 12 tests: immutable revisions + restart + legacy seeding, run-by-revision, run states, cancel mid-Wait, pre-aborted, duplicate protection (incl. restart), export/import round trip and rejections, unknown-node imports, edge-level diagnostics |
| `test/workflow-schema-and-limits.test.js` (new) | 8 tests: unique library, configurable limit, real 25-message send, runtime limit, schema v2/migration/round-trip, schema rejection, no silent truncation, revision/conflict/restart |
| `android/.../commands/VisualCommandModels.kt` | `VISUAL_WORKFLOW_SCHEMA_VERSION`, `revision` field, sends `schemaVersion` and `expectedRevision` |
| `android/.../commands/VisualCommandBuilderScreen.kt` | `NODE_CARD_WIDTH_DP` (236, was 206 in maths), `WORKSPACE_MIN_ZOOM/MAX_ZOOM`, "1–500" label, undo/redo keep current revision, friendly 409 conflict message |
| `android/.../androidTest/.../VisualCommandBuilderScreenTest.kt` | new `canvasHasMeasuredBoundsAndNodesAreVisibleInsideIt` (NOT RUN) |
| `docs/agents/AGENT_05_VISUAL_BUILDER.md` | this progress record |

## Verification evidence

Record exact commands/workflows, environment, pass/fail/not-run results, screenshots and runtime evidence. Never report skipped, cancelled or unrun tests as passed.

Environment: Node v22.23.5 (project asks for >=24), Linux sandbox, no network, npm dependencies NOT installed, no Android SDK/emulator/kotlinc.

| Command | Result |
|---|---|
| `node --test test/visual-command-builder.test.js test/engine-visual-command.test.js` (before and after changes) | PASS 30/30 |
| `node --test test/workflow-schema-and-limits.test.js` | PASS 8/8 |
| `node --test test/workflow-lifecycle.test.js` | PASS 12/12 |
| focused: builder + engine-visual + both new files | PASS 50/50 |
| `node --test` (full, original zip) | 242 tests: 238 pass, 4 FAIL |
| `node --test` (full, after changes) | 262 tests: 258 pass, 4 FAIL (same 4 as the original zip) |
| `node scripts/check.mjs` | PASS ("Aharane isolation checks passed.") |

The 4 failing files (`chat-polls`, `engine-runtime`, `source-export`, `update-manager`) fail identically before and after my changes with `ERR_MODULE_NOT_FOUND` for `@itsliaaa/baileys`, `quickjs-emscripten` and `yauzl` (dependencies not installed here). They are NOT RUN in effect, not passed; rerun with `npm install` on Node 24.

NOT RUN: all Kotlin unit and instrumented tests, Gradle build, emulator, screenshots. The Kotlin edits are UNCOMPILED. The new Express routes in `src/index.js` (revisions, export, import, test-by-revision) are syntax-checked only; their store/executor logic is unit tested but the HTTP layer is NOT RUN (index.js needs the uninstalled npm packages). No real WhatsApp transport or QuickJS execution was exercised; tests use a fake socket against the real `executeVisualWorkflow`.

## Dependencies and integration contract

Record upstream/downstream agents, API schemas, event formats, data ownership, permissions and contract changes. Notify dependent agents before changing a shared contract.

DRAFT contract (not accepted by any consumer yet). Consumers to notify before merge: Agent 06 (execution, per-run limit semantics), Agent 07 (workflow ID/revision reference), Agent 04 (privileged-node metadata), Agent 10 (tests).

- WorkflowDefinition additions: `schemaVersion: 2`, `revision` (server-managed integer >= 1), legacy `version` alias.
- Save API: PUT `/api/visual-commands/:id` optional `expectedRevision`; 409 `{ok:false, conflict:true, currentRevision, error}` on mismatch. POST/PUT reject `schemaVersion` greater than supported or malformed.
- Limits: `maxMessagesPerRun` and `media.sendImages.limit` accept integers 1..500 (`SYSTEM_MAX_MESSAGES_PER_RUN`); default stays 10.
- Revisions: `GET /api/visual-commands/:id/revisions` (list), `GET .../revisions/:revision` (immutable snapshot + validation). Programmatic run: `executeWorkflowRevision(workflowId, revision, options)`; result carries `runId, workflowId, workflowRevision, status, startedAt, finishedAt`.
- Run status enum: queued, running, succeeded, failed, cancelled (`options.onStatus`, `options.signal`).
- Duplicate protection: `options.deduplicate: true`; key = workflow ID + (`event.idempotencyKey` or trigger message ID). Agent 07 should pass a stable `idempotencyKey` per scheduled run if it wants the same protection.
- Import/export: `GET /api/visual-commands/:id/export`, `POST /api/visual-commands/import` (`{export, account?}`); imports are always disabled drafts.
- Findings: `{nodeId, edgeId, severity, message, fix}`.

## Known limitations and follow-up

List unresolved defects, assumptions, risks and intentionally deferred work.

- Blank-canvas finding NOT reproduced or closed; needs the CI emulator screenshot job and visual inspection. A canvas-bounds instrumented test was added but NOT RUN.
- Kotlin changes are uncompiled and untested; the first CI run may reveal compile errors.
- Express routes added in `src/index.js` have no HTTP-level tests (syntax-checked only).
- Revision history keeps the newest 50 revisions per workflow and is deleted with the workflow; Agents 06/07 have not accepted the contract.
- Duplicate protection is opt-in and not applied to scheduled runs; a run that fails after the claim cannot be replayed for the same trigger message.
- Cancellation is checked between nodes and inside Wait nodes; a node already awaiting a WhatsApp send or Engine call finishes first.
- 500-message system ceiling is an assumption; rate and payload protections outside this file still apply.
- `profile.updateStatus` node kept as profile About text; confirm against the "No Status" rule.
- No real WhatsApp transport, QuickJS, permission-matrix or device runs were performed, so "saved graph executes through the real Agent 06 runtime" is NOT VERIFIED.
- Other nine briefs were searched for contract points but not read in full.

## Completion report

- **Status:** IMPLEMENTED (unit-tested backend/schema/executor logic; Android and HTTP layers NOT RUN)
- **Branch / commit / PR:** none (delivered as a zip; no git commit or PR made)
- **Requirements satisfied (unit-tested):** configurable send amount with independent system ceiling; versioned schema with v1 migration; save-conflict detection without silent overwrite; no silent truncation; unique node library; immutable revision snapshots and run-by-revision; explicit run states and cancellation; duplicate-send protection; safe import/export; edge-level diagnostics. NOT satisfied/verified: blank-canvas closure, real Engine/transport execution trace, permission matrix on device, Agent 10 review.
- **Files and APIs changed:** see Files changed; new/changed routes listed under Dependencies.
- **Tests and exact results:** focused workflow tests 50/50; full JS suite 258/262 with the same 4 environmental failures as the original zip (missing npm packages); `scripts/check.mjs` pass; Kotlin and HTTP routes NOT RUN.
- **Runtime/device evidence:** none.
- **Remaining limitations:** see Known limitations and follow-up.
- **Ready for integration:** NO

## 1. Binding product and ownership rules

Own the Visual Command Builder and workflow-definition lifecycle: palette/catalogue, canvas, nodes/ports, edges, pan/zoom, drag, selection, configuration panels, validation, save/reopen and specified import/export. Support phone-sized editing as a first-class use case.

A saved workflow must execute through Agent 06's real runtime and supported Aharane actions; the Builder must not simulate success. Reproduce the previously observed blank-canvas screenshot and determine whether it is a renderer, state, fixture, sizing or capture-harness defect. A graph-position unit test is not proof that the canvas renders.

Builder remains More → Tools, not a duplicate top-level destination. Agent 01 owns global visual foundations; Agent 04 authorization; Agent 03 WhatsApp transport; Agent 06 Engine execution; Agent 07 consumes workflow references. User-defined message/send amount must not be arbitrarily capped at a small fixed UI value (such as 20); independent system rate, payload and resource protections remain mandatory. No Status-specific node, trigger, action or fixture.

## 2. Independent work packages

| Package | Scope and output | Can proceed while dependencies are unfinished? | Integration gate |
|---|---|---|---|
| 5A — Workflow schema/catalogue | Versioned workflow document; node IDs/types/category; typed ports; config schema; edge shape; graph metadata; migration and catalogue descriptions. | Yes; publish draft early. | Agent 06/07 accept schema version; Agent 04 reviews privileged-node metadata. |
| 5B — Canvas and palette | Responsive measured canvas, zoom/pan, grid, category/search palette, node sizing/readability, selection and empty state. | Yes, fixture graph. | Real canvas screenshot at phone and larger viewport is nonblank and legible. |
| 5C — Editing gestures/connections | Add/move/delete/duplicate; connect/disconnect typed ports; edge routing; selection; drag cancellation; undo/redo only where specified. | Yes, local graph state. | Gesture tests pass; Agent 01 confirms navigation does not steal gestures. |
| 5D — Properties and validation | Node property forms, required fields/defaults, type compatibility, missing node/edge/cycle diagnostics, inline fix guidance. | Yes; local validator first. | Frontend/backend validation agree on fixtures. |
| 5E — Save/load/import/export | Persistence adapter, schema versioning, save/dirty state, safe import/export, conflicts and restore. | Yes, fake repository. | Real persistence API accepted; no silent overwrite/data loss. |
| 5F — Action catalogue and run hand-off | Trigger/condition/variable/command/Engine/WhatsApp node configuration; privilege metadata; run/result state. | Catalogue UI uses fixtures. | Agent 03 confirms actions; Agent 04 authorizes; Agent 06 executes exact saved schema. |
| 5G — Real execution and QA | Create → validate → save → close → reopen → execute; node results/errors; send limits and duplicate prevention. | Harness/test graphs can be prepared now. | Real Engine/transport trace and Agent 10 verification. |

### No idle waiting
While Agent 06 builds runtime, finish schema, canvas, gestures, configuration, validation and serialization. While Agent 03 builds WhatsApp action adapters, use explicit test fixtures behind the same action contract. Never label a fixture run as a live execution.

## 3. Workflow contract

Publish versioned WorkflowDefinition with stable workflow ID, owner context, revision/schema version, trigger metadata, nodes, typed input/output port IDs, config objects, directed edges and execution options. Include per-node validation findings, severity and actionable references. Run requests must reference a saved revision; an unsaved graph is not a deployed workflow.

Agent 06 owns execution semantics; Agent 05 owns editor serialization/client validation; backend validation is authoritative at save/run. Agent 07 references an immutable workflow ID/revision. Agent 04 supplies privilege metadata and policy decisions.

## 4. File boundaries

Own Builder screens/components, graph models/editor state, palette/node forms, canvas renderer/gestures, graph validator, serialization adapter and Builder tests. Existing audit leads include visual-command-builder.js, VisualCommandBuilderScreen.kt and visual model package; verify current exact paths.

Do not own shared theme/navigation (01), WhatsApp runtime actions (03), authorization evaluator (04), sandbox/execution runtime (06), schedule runner (07) or generic file manager/encryption (08). If a mixed file contains both graph definition and runtime execution, split a pure schema/adapter boundary and agree a single owner for each side.

## 5. Canvas and data-integrity requirements

Canvas must have measured non-zero bounds and handle system/keyboard insets; no zero-size or clipped canvas. Nodes remain readable at normal phone zoom. Pan/zoom must preserve selection and connection state. Dragging must not trigger parent navigation. Port compatibility is explicit. Opening/closing properties must not reset node values or camera. Save failures preserve the working graph. Validation identifies exact node/edge and fix. Run status distinguishes queued/running/succeeded/failed/cancelled; connected builds never show fake success.

## 6. Verification and gates

Test schema round-trip/migration; add/move/delete nodes; typed edges; invalid graph diagnostics; large graph; pan/zoom/edge hit targets; keyboard/narrow viewport; save/reopen/conflict; actual runtime; permissions; abort/timeout; configured send volume and duplicate prevention. Reproduce and close blank-canvas finding with visually inspected evidence.

- [ ] Versioned schema shared with Agents 06/07.
- [ ] Real canvas renders nodes/wires at phone size.
- [ ] Gestures, connections and property forms work.
- [ ] Validator provides actionable node/edge errors.
- [ ] Save/reopen/import/export preserves graph.
- [ ] Saved graph executes through real Agent 06 runtime.
- [ ] Permission, user-configured amount and system safety limits hold.
- [ ] No Status feature/node exists.
- [ ] Agent 10 reviews screenshots and tests.

## 7. Progress/completion report

Track 5A–5G, schema version/consumers, blank-canvas reproduction, changed files, save/load/validation evidence, real execution trace, safety checks, tests, limitations and PR. If runtime is blocked, complete editor and fixture-backed tests.

- Status:
- Package status:
- Workflow schema/version and consumers:
- Files/APIs changed:
- Canvas screenshot/blank-canvas proof:
- Save/load/validation:
- Real execution trace:
- Safety/limits/deduplication:
- Limitations:
- Branch/commit/PR:
- Ready for integration: NO
