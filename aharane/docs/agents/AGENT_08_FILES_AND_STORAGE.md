# Agent 08 — Files, Notes, offline storage and synchronization

**Initial status:** NOT STARTED  
**Owner:** Agent 08  
**Last updated:** 2026-11-23

## Mandatory context — read before acting

Read `aharane/docs/MASTER_PROJECT_CONTEXT.md` and `aharane/docs/AUTONOMOUS_EXECUTION_PROTOCOL.md` in full. Then read **all ten agent briefs** in `aharane/docs/agents/`, not only this one. Inspect relevant existing project Markdown, current source, tests, build/package configuration, API contracts and current GitHub branch state. You must understand the whole Aharane product and how the other nine workstreams affect yours.

## Mission

Own file management, code/file editing integration where assigned, encrypted Notes, local persistence, media cache, offline search/queue and synchronization/recovery. Coordinate Engine Library file lifecycle with Agent 06, chat media cache with Agent 02, background execution with Agent 09 and Android storage foundations with Agent 01. Preserve user data through migrations/lifecycle events.

## Acceptance criteria

Acceptance: files/notes persist and remain editable; sensitive content is protected; offline operations have clear sync/recovery; media cache handles expected sizes and cleanup; storage errors do not silently lose data; restart/migration tests pass.

## Ownership and boundaries

Primary ownership: files/notes/storage/sync and tests. Coordinate shared database, file manager and repository changes.

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

## 1. Mission and data boundaries

Own Files/ENV/Notes feature data and shared persistence infrastructure: workspace file operations, editor persistence, encrypted Notes, encrypted local database/storage primitives, migrations, offline caches, media cache storage and sync primitives. Feature agents own their UI/domain semantics; Agent 08 owns durable data integrity/storage mechanics.

Distinguish the server-backed bot workspace from Android local caches. Server workspace remains server source of truth; offline chat cache is a separate encrypted copy. Never read or alter NIGHT/MSCC services, files, credentials or environments.

## 2. Independent work packages

| Package | Scope and output | Parallel readiness | Integration gate |
|---|---|---|---|
| 8A — Workspace files/folders | List/create/upload/open/rename/duplicate/move/delete/download/ZIP, staged Apply/Discard and server errors. | Yes, API fixtures. | Real server operations and conflicts/recovery pass. |
| 8B — Code editor/ENV data | Editor read/write, dirty/save state, diagnostics boundary, file operations, ENV load/update and secret redaction. | Mock file/config API initially. | Server round-trip verified; secrets never logged/exported. |
| 8C — Notes | Encrypted CRUD/edit/delete/search, keyboard, conflict handling, retention and recovery. | Local model/UI adapter and unit tests. | At-rest encryption, migration, restart and CRUD tests pass. |
| 8D — Encrypted local persistence | Room/SQLCipher, Keystore-wrapped DB key, account-scoped identities, transactions, schema migrations, Keystore-loss behaviour. | Yes; architecture/migration fixtures. | API 26/API 36 lifecycle and migration checks. |
| 8E — Offline cache/sync | Cache policy, incremental cursors, media cache lifecycle, account partitions, retention/tombstones, integrity and disk quotas. | Yes, fixture server. | Agents 02/09 accept contracts; interrupted sync preserves good cache. |
| 8F — Durable queue primitives | Generic queue/transaction/lease interface, retry state, idempotency/correlation and account scope. Consumer owns its retry meaning. | Yes; interface/tests first. | Agents 02/07/09 adopt contract; no false exactly-once claims. |
| 8G — Migration/backup/recovery | Version inventory, backup before destructive change, corruption, disk-full, interrupted writes and Keystore-loss recovery plan. | Yes; fault injection. | Supported upgrades/restarts preserve data or report explicit recovery. |
| 8H — Integrated storage acceptance | Workspace, Notes, chat cache/media, queues, process lifecycle, isolation and cleanup. | Harness can be built immediately. | API 26/36 and target device; Agent 10 independent verification. |

## 3. Data ownership contract

- Agent 08 owns local DB schema, encryption, migrations, disk cache, generic queue mechanics and storage recovery.
- Agent 02 owns message/conversation presentation and chat-specific state; Agent 08 supplies storage APIs.
- Agent 03 owns WhatsApp transport/server message data and credentials; Agent 08 owns Android's encrypted cache, not server auth storage.
- Agent 06 owns Engine execution/capabilities; Agent 08 supplies generic file persistence only.
- Agent 07 owns schedule records and due/claim policy; Agent 08 may supply atomic storage primitives but must not redefine scheduler semantics.
- Agent 09 owns analytics meaning and notification delivery; Agent 08 may provide event/cache storage.
- All account-bound rows and media paths include unambiguous account scope; Private/Public caches never mix.

Publish storage API/transaction contract, DB version/migration policy, encryption design, identity keys, cache/retention policy, view-once exclusion, queue state machine/idempotency, sync cursor/pagination and error/recovery semantics. Consumer domain owners define meaning; Agent 08 proposes safe schema/API implementation.

## 4. File boundaries

Own generic storage/database/cache/migration code; Files/ENV/editor data adapters; Notes feature/persistence; Android sync/cache/outbox infrastructure. Verify exact paths before edits.

Do not own global shell (01), chat presentation/actions (02), WhatsApp credentials/server events (03), authorization (04), Builder graph (05), Engine sandbox (06), schedule execution semantics (07), or analytics/notification policy (09). Shared repository interfaces are protected: Agent 08 owns storage contracts/migrations but not every consumer's domain model.

## 5. Security and durability rules

No plaintext Notes, DB key, session token or ENV secret in logs/backups/external storage. Define Keystore invalidation/reinstall/restore behaviour. Verify media checksum before available-offline. Bound caches and cleanup safely. Never persist view-once media as ordinary content. Protect against path traversal, symlink/path confusion, archive bombs and oversized ZIPs. Keep ENV values redacted. Preserve staged Apply/Discard and destructive confirmation. Never claim server files are offline when not mirrored.

## 6. Verification gates

Test file conflicts, Notes CRUD, DB migrations from supported versions, Keystore loss, app upgrade/restart, disk full, interrupted writes/downloads, corrupted media, quota cleanup, account separation, encryption at rest, cache-first start, pagination/sync failure, view-once exclusion, queue retries, archive/path validation and ENV redaction.

- [ ] Files/ENV use real server APIs and preserve staging/confirmation.
- [ ] Notes encrypted and survive restart/migration.
- [ ] DB encryption/key wrapping and recovery are tested/documented.
- [ ] Private/Public cache and media isolation is proven.
- [ ] Failed sync never erases known-good cache.
- [ ] View-once media never enters permanent storage.
- [ ] Queue consumers use shared primitives without duplicate retry policy.
- [ ] Cache/disk usage bounded and cleanup safe.
- [ ] Agent 10 passes migration/data-loss/security suite.

## 7. Progress/completion report

Track 8A–8H, schema/encryption versions, consumer list, migration notes, contracts, exact API/device results, data-loss risks, limitations and PR. If a consumer or remote endpoint is blocked, complete local primitives and fixture tests.

- Status:
- Package status:
- Storage schema/encryption version:
- Contracts/consumers:
- Files/APIs changed:
- Migration/restart/Keystore results:
- Files/ENV/Notes evidence:
- Offline/cache/queue evidence:
- API 26/API 36/device evidence:
- Risks:
- Branch/commit/PR:
- Ready for integration: NO
