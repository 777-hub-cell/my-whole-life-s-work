# Agent 05 — Visual Command Builder and workflow editor

**Initial status:** NOT STARTED  
**Owner:** Agent 05  
**Last updated:** 2026-11-23

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
