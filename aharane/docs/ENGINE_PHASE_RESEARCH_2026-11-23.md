# Aharane current-phase research and implementation evidence — 2026-11-23

## Repository and scope
- Active implementation: open PR #80, branch `audit/aharane-complete-quality-20261123`, based on `mscc-azure`. The unrelated `main` branch must not be treated as the Aharane source baseline.
- The existing Android app uses native Kotlin/Jetpack Compose. The service is Node.js and maintains independent Private/Public session integrations.
- The package manifest pins `@itsliaaa/baileys` to **0.5.6** (not the upstream Baileys API). The published fork describes newsletters and status capabilities, but neither the package description nor an example proves actual paired-session compatibility.
- Existing `custom-node-engine.js` is a bounded, synchronous set of approved operators. It is **not** arbitrary custom-code execution.
- Existing `visual-command-builder.js` includes typed sockets, validation, flow steps and WhatsApp actions. A `flow.delay` is limited to a running workflow and is **not** a durable scheduler.
- Existing v3 owner migration has known compatibility risks. Preserve separate account credentials and authorization checks; changes require migration regression tests.

## Product reference findings
- Meta's WhatsApp documentation establishes All, Unread and Groups as first-class chat filters; additional user-defined lists also exist. Aharane's requested All → Unread → Groups → Channels → Archived is its own product navigation, not a claim of identical WhatsApp filters. Reference: https://about.fb.com/news/2024/04/whatsapp-chat-filters/
- The Blender node editor uses distinct input/output sockets, typed connections, movable nodes, canvas pan/zoom and link operations. Mobile adaptations should separate canvas panning from socket dragging and expose search/fit-to-graph. Reference: https://docs.blender.org/manual/en/3.3/interface/controls/nodes/introduction.html
- Android WorkManager persists work across process restarts, but periodic requests have a minimum 15-minute interval and execution is inexact due to battery policies. Since the WhatsApp socket lives in the Node service, production command schedules require **server-side durable jobs**, ownership checks and idempotency, not a Compose screen timer. Reference: https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started/define-work

## Engine execution security decision
New `engine-contract.js` adds schema/IO validation for a future separate Engine concept. It does **not** run uploaded JavaScript. Engine code cannot safely be executed with Node `vm` as its sole trust boundary, or in the privileged WhatsApp process without isolation. A later executor must use a sandboxed process/container with CPU/memory/time limits, no ambient credentials, a narrowly brokered HTTP capability, network egress controls and output quotas. Must test cancellation, timeouts and denial of filesystem/auth access before enabling code execution.

The Engine contract currently supports stable IDs, positive integer versions, declared `run` entry point, declared inputs/outputs, explicit permission enumeration, bounded outputs and interface compatibility checks. The only recognized future capability is `network.fetch`; this is *declaration only*, not a network implementation.

## Outstanding release gates
- No sample user JavaScript Engine runs yet; no Engine node type or Files integration exists yet.
- No persistent scheduler is implemented by the new contract.
- No real paired-session receipts, Channels, Status, stickers or media tests have been carried out during this phase.
- CI must be checked against the final commit. Existing earlier CI does not verify these new changes.
- Do not sign or deploy production builds from this branch or claim an APK is complete without install + emulator QA evidence.
