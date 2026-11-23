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
