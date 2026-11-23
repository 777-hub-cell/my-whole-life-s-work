# Aharane — Autonomous Execution Protocol

All ten agents must follow this protocol. The purpose is to keep work moving without repeatedly asking the owner routine questions.

## Mandatory reading

Before changing code, every agent must:
1. Read `MASTER_PROJECT_CONTEXT.md` in full.
2. Read this protocol in full.
3. Read **all ten agent briefs** under `aharane/docs/agents/`, not only its own.
4. Read relevant existing Markdown requirements and specifications in GitHub.
5. Inspect current source, tests, build/package configuration and API contracts.
6. Check the current repository/branch state and avoid stale assumptions.

The master context explains the whole product. The ten briefs explain each other's scope and dependencies. The assigned brief defines primary ownership.

## Autonomous discovery and decisions

Do not turn ordinary uncertainty into questions for the owner. Investigate and resolve it in this order:
1. Explicit product requirements.
2. Approved specifications and design documents.
3. Existing source behavior and architecture.
4. Tests and API contracts.
5. Project-wide principles in the master context.
6. Technical research and established engineering practice.

When evidence is incomplete, choose the safest consistent solution, document the assumption and rationale, and continue. When documents conflict, record both sides, inspect implementation/tests, choose the interpretation best supported by project intent and flag it for lead review.

Ask the owner only for genuinely product-defining, irreversible, destructive, legally/security-sensitive or otherwise critical decisions that cannot safely be resolved from project evidence. Do not stop unrelated work while waiting.

## Discovery report: Q&A without waiting

Maintain a decision log in your own brief with:
- Question investigated
- Evidence (file paths, symbols, tests, API contracts)
- Finding
- Decision
- Reason
- Implementation/test consequence

Each item is RESOLVED, ASSUMPTION, CONFLICT or BLOCKED. These are investigation prompts, not questions that automatically require an owner response.

## Implementation workflow

1. Audit current behavior before editing.
2. Define objectively testable acceptance criteria.
3. Identify dependencies and agree API/data contracts.
4. Establish file ownership and avoid overlapping edits.
5. Implement in small, reviewable commits on an isolated branch.
6. Add/update tests at the correct layer.
7. Run focused tests and relevant regressions.
8. Inspect actual runtime/device behavior where applicable.
9. Update your own GitHub Markdown progress record.
10. Submit a concise integration report with commit/PR and evidence.

Do not claim code works merely because it compiles. Do not replace real integration tests with mocks when acceptance requires real integration.

## Status definitions

- NOT STARTED — no implementation work yet.
- IN PROGRESS — investigation or implementation underway.
- IMPLEMENTED — code exists, acceptance verification incomplete.
- VERIFIED — acceptance criteria passed with recorded evidence.
- DONE — verified, reviewed, integrated where applicable, with no known blocking limitation.
- BLOCKED — a specific external dependency or critical decision prevents progress; explain what can still proceed.

A passing unit test alone does not prove full feature completion.

## Required per-agent progress record

Each agent updates only its own brief unless a shared-document owner coordinates otherwise. Maintain status/date, scope, acceptance criteria, findings/decisions, files changed, exact tests/results, runtime/device/screenshot evidence, dependencies/contracts, limitations, branch/commit/PR and completion report. Preserve original requirement text; add progress/evidence alongside it.

## Cross-agent collaboration

Read all briefs. Agree API schemas, event contracts, data ownership and authorization assumptions with dependent agents. Notify relevant agents before changing shared contracts. Avoid concurrent edits to the same files. Agent 10 reviews integration/security; feature agents remain responsible for their own correctness. The lead integrator coordinates sequencing and resolves conflicts.

## Completion report

Every workstream reports: what changed; requirements satisfied; files/APIs affected; tests and exact results; actual behavior evidence; remaining limitations/risks; commit and PR; readiness for integration.

## Safety and release boundaries

Never expose secrets, tokens, pairing credentials or private user data in docs/logs/screenshots/commits. Never weaken authorization, encryption, sandboxing, rate limits or isolation to pass tests. Do not perform destructive migrations without a recovery plan. Do not merge to the production/base branch, publish releases or deploy without explicit owner approval. Mark skipped, cancelled or unrun tests accurately as NOT RUN.
