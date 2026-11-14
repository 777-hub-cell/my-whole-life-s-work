# MDD 03 — A–Z account slots (initial implementation)

## Identity and migration

NIGHT/MSCC retains its existing internal account IDs as permanent identifiers for authentication directories, shared storage, message indexes, group routes, profiles and session operations. The new `slot` property is the A–Z owner-facing identifier. The permanent main/control account keeps ID and slot `A`. Existing IDs such as `account-3` remain unchanged and receive the first available visible slot after reserving explicitly letter-named accounts.

Registry format version 3 persists slot assignments. On first migration, a private `accounts.json.pre-az-<uuid>.bak` snapshot is retained next to the registry. No WhatsApp credentials are copied, removed or moved by the slot migration. A duplicate slot, duplicate phone number, missing Account A, malformed registry or more than 26 records fails startup validation before any session sockets are opened. Reopening a migrated registry does not allocate new slots or repeat the backup.

This is a *registry migration*, not an authentication restoration. Before a production rollout, independently back up the registry, shared metadata and all auth directories using the established protected backup process. Do not commit them to Git.

## Slot allocation

Slots A–Z are the capacity ceiling. Account A cannot be removed or reassigned. Creating a linked account accepts an optional `slot` from B through Z; omission allocates the lowest unused slot. Existing legacy account IDs remain valid in APIs and owner commands; slot aliases resolve to their stable internal IDs. Requests for occupied slots fail. Removing an account frees its visible slot but deliberately preserves its original auth directory. A later account using the same slot receives a **fresh random auth-directory path**, never the old account's credentials.

Configuration `MAX_ACCOUNTS` defaults to 26 and is clamped at 26 in the registry and runtime. An existing administrator override below 26 still limits active account records until explicitly changed. This controls *available records*, not automatic creation or simultaneous connection of 26 WhatsApp sockets. No 26-socket load claim has been validated.

## Existing HTTP surfaces

- MSCC `GET /api/state` / local `GET /state` return account records with `slot`, `accountSlots` (all 26 with occupancy) and entitlement capacity/available slots.
- The authenticated MSCC `POST /api/accounts` and local `POST /accounts` accept `{phoneNumber, displayName, slot?}`. The server owns auth paths; clients never specify them.
- The Control Centre API `GET /accounts` retains original `id` and adds `slot`. `GET /account-slots` lists all 26 slots and occupancy. `POST /accounts` accepts `{name, phone, profileId?, slot?}` and returns a stable-ID account DTO with `slot`.
- Existing pair, reconnect, pause/disconnect, repair, profile assignment and remove endpoints continue to operate on stable IDs, and slot aliases resolve through the MSCC registry.
- Diagnostics snapshots add `slot` without returning credentials.

Cortex Android UI support must be confirmed against the actual Android repository/build. This change exposes backend slot data; it does **not** claim that every Android screen has been updated.

## Local validation

Run `cd mscc && npm run check:sessions` and `npm run check` under Node 24 or newer with dependencies installed. `account-az-slots-selftest.js` tests 26 slots, 27th rejection, concurrent creation, migration backup/idempotence, legacy ID resolution, auth isolation and malformed registries. The existing account and session suites must also remain green.

## Rollback and release

Keep the original registry backup and application release. For rollback, stop MSCC, back up the *current* registry and affected metadata, and restore a compatible registry/app pair under operator supervision. Never restore a stale registry over newly created accounts without reconciling changes; doing so can orphan sessions. Never rename auth folders because of a slot change.

This component branch must be merged only through an authorized NIGHT Release Batch per `mscc/AGENTS.md`. Do **not** modify `mscc/release-batch.json` in a feature PR. Until GitHub Actions and live checks pass, consider this feature **not deployed**.

## Remaining acceptance work

This initial patch does **not** cover full MDD 03 acceptance: verify end-to-end Cortex Agent and Android presentation, per-account operation progress, pairing timeouts, comprehensive auth-backup integrity and retention, complete Cortex contract integration tests, 26-socket resource measurements, production rollout and live recovery verification. These require separate implementation and evidence before MDD 03 can be declared complete.
