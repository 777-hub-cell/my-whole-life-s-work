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
