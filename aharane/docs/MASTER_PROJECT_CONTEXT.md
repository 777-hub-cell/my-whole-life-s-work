# Aharane — Master Project Context

**Purpose:** Shared context for every Aharane workstream and agent. Read this first, then read the execution protocol and all ten agent briefs.

## Product vision

Aharane is a mobile-first Android application integrated with a WhatsApp automation/backend system. It brings together WhatsApp session management, native chat, commands, visual workflows, Engine execution, scheduling, files, Notes, analytics and updates. It is one integrated product, not ten independent features.

## Product principles

- Product-first, human-directed design. Avoid generic AI/SaaS templates, unnecessary cards, neon colors and decorative clutter.
- Mobile-first reality. Validate on Android emulator and real target hardware; do not rely on desktop-only workflows.
- Functional over cosmetic. A control is incomplete until its real operation works.
- Safe by default. Enforce authorization server-side, isolate sessions, protect credentials and prevent unintended duplicate sends.
- Evidence-based completion. Code presence or a Markdown status is not proof.
- Independent progress, coordinated integration. Keep work bounded, document contracts and integrate in reviewable increments.

## High-level architecture

1. **Android native client:** Home, Chat, conversations, pairing, configuration, commands, visual builder, Engine Library, scheduler, files, Notes, preferences, updates and analytics.
2. **Backend:** API, WhatsApp session/account runtime, command and owner policy, workflow execution, Engine sandbox, scheduler, persistence and integrations.

The Android repository/API layer connects the client to the backend. Hiding a control in Android is never a substitute for backend authorization.

Important source areas include `aharane/android/` and `aharane/src/`. Verify exact test paths and current architecture in GitHub before editing.

## Core product rules

### Identity and authorization
- Private and Public are distinct WhatsApp session identities with independently configurable owners.
- Public Owner may be the Private Owner, the Public session's own number, or another configured number.
- Private self-chat commands are restricted to the intended Private session self-chat and verified Private Owner. They must not work in groups, unrelated chats or other accounts.
- Public ordinary commands follow the intended public policy; privileged operations remain owner-authorized.
- Do not invent a general public sender allowlist as a replacement for this model.
- Enforce important permissions server-side and test spoofed, group-originated and cross-account events.

### Chat and messaging
- Intended filters: All, Unread, Groups, Channels and Archived.
- Delivery/read receipts must reflect actual WhatsApp receipt events, never online presence.
- Media, stickers, voice notes, polls, profile photos, archive/pin/mute and offline behavior require real backend verification, not only mocked UI.
- Preserve agreed gestures/navigation and avoid redundant branding/status pills.

### Visual workflows and Engine
- Builder must create, edit, connect, validate, save, reload and execute workflows.
- Saved Engine source must run through the real permission-scoped runtime; mocked Engine output is not end-to-end proof.
- Message limits should be user-configurable rather than arbitrarily capped at a small fixed number; retain separate system-level safety/rate/payload protections.
- Enforce sandbox permissions, approved network hosts and workflow ownership on the backend.

### Scheduler
- Durable persistence, timezone-aware execution and safe restart behavior are required.
- Scheduled execution must preserve the same account, owner, Private/Public and command authorization rules as interactive execution.
- Prevent unintended duplicate sends and document failure/retry semantics.
- Android scheduler controls must use real APIs, not disconnected mock state.

### Data and resilience
- Protect credentials and sensitive local data; honor encrypted Notes/storage requirements.
- Define offline cache, queue, sync and recovery behavior.
- Respect Android lifecycle and permission constraints.
- Avoid destructive migrations and preserve user data.

## Design and interaction standards

Use the established Aharane direction and approved references. Keep layouts compact, restrained and readable. Verify touch targets, keyboard insets, scrolling, loading/empty/error states, accessibility and small-screen overflow. Screenshots must show actual rendered content; a blank canvas or unloaded poster is a product defect.

## Shared documentation map

Every agent must inspect current GitHub versions of:
- `aharane/README.md`
- `aharane/android/README.md`
- `aharane/android/WEB-TO-NATIVE-UI-SPEC.md`
- `aharane/docs/REQUIREMENT_LEDGER_2026-11-23.md`
- `aharane/docs/AUDIT_RESEARCH_PLAN_2026-11-23.md`
- `aharane/docs/ENGINE_PHASE_RESEARCH_2026-11-23.md`
- Other relevant feature, infrastructure, API and security documentation.

Documents may be incomplete, stale or contradictory. Compare them with source, tests and runtime behavior. Do not treat a Markdown statement as proof that code works. Record conflicts and resolve using strongest evidence; do not silently delete or weaken original requirements.

## Ten-agent map

All agents must read this entire document, the execution protocol and **all ten agent briefs** before starting. This gives every agent the full product context and reveals dependencies.

1. Agent 01 — Android UI, navigation and design system.
2. Agent 02 — Chat, conversations and messaging experience.
3. Agent 03 — WhatsApp backend, pairing and session reliability.
4. Agent 04 — Commands, permissions and Private/Public owners.
5. Agent 05 — Visual Command Builder and workflow editor.
6. Agent 06 — Engine runtime, sandbox and Engine Library.
7. Agent 07 — Scheduler and automation.
8. Agent 08 — Files, Notes, offline storage and synchronization.
9. Agent 09 — Analytics, notifications, Channels, Status and updates.
10. Agent 10 — QA, security, cross-workstream integration and release readiness.

Agent 10 independently reviews integration and security; it does not take over feature ownership. A lead integrator coordinates sequencing, resolves ownership conflicts and reviews integration. No agent may merge to the production/base branch or deploy without explicit owner approval.

## Shared working rules

- Each agent owns its own brief/progress record. Do not have ten agents concurrently rewriting one shared progress file.
- Before editing shared files, check ownership in the briefs and coordinate with the owner.
- Use isolated branches and reviewable commits/PRs.
- Verify current repository state; do not rely on stale SHAs, line numbers or old implementation summaries.
- Reuse sound architecture; avoid duplicate implementations.
- Preserve original requirements. Add status and evidence rather than rewriting away unfinished requirements.
- DONE requires acceptance evidence. IMPLEMENTED is not VERIFIED.
- For critical uncertainty, record the blocker and continue independent work. Ask the owner only for irreversible, high-risk or product-defining decisions that cannot safely be resolved from project evidence.

## Known audit leads (recheck; not presumed current defects)

Previous reviews flagged possible Android scheduler/API gaps, mocked rather than real Engine execution tests, a suspicious blank visual-builder screenshot, stale screenshot automation looking for “Chats” when the app label is “Chat”, Android README items needing real-device verification (foreground updates, pairing/password setup, media/voice-note queueing, stickers, polls, archive/pin/mute and editor diagnostics), conflicting Baileys package descriptions, and incomplete/cancelled prior CI checks. Recheck all against current source and workflows before making claims.

## Definition of integrated completion

Aharane is ready only when Android and backend contracts agree, session identity and authorization are correct, important features work end-to-end, data survives expected lifecycle events, security boundaries are tested, the UI is visually inspected on target devices, and all release gates pass. Individually passing feature tests are not sufficient if integration fails.
