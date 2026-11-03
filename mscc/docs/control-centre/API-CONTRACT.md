# NIGHT Control Centre API contract — integrated MSCC adapter

**Status:** implemented in `mscc/control-centre-api.js`; see `MSCC-INTEGRATION.md` and `NIGHT-CONTROL-CENTRE-QA.md` for the precise supported/unsupported surface.  
**Base path:** `/api/control-centre` (same-origin only, routed by the separate website server to the bot server over a private reverse proxy).

## Response envelope

Success:

```json
{ "ok": true, "data": {} }
```

Failure:

```json
{ "ok": false, "error": { "code": "VALIDATION", "message": "The submitted value is invalid." } }
```

The server never returns stack traces. Every API route except the sign-in bootstrap/login flow requires the separate NIGHT Control Centre administrator session. Unsafe methods additionally require a same-origin request and `X-CSRF-Token`.

## Authentication

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/auth/session` | Returns `{ authenticated, csrfToken }`; issues a short-lived pre-auth HttpOnly cookie when signed out. |
| `POST` | `/auth/login` | JSON `{ password }`; verifies configured `WEB_PASSWORD`, rate-limits attempts, rotates into a random server-side session, and returns a CSRF token. |
| `POST` | `/auth/logout` | Revokes the session and expires its cookie. Requires CSRF and same-origin checks. |
| `GET` | `/health` | Minimal authenticated health response. |

Cookie names are distinct from the existing panel's `mscc_session`: `night_cc_pre` and `night_cc_session`. Sessions are in memory and are invalidated when the process restarts.

## Dashboard, accounts, profiles and command settings

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/overview` | Real MSCC version/fleet/account counts and command-setting counts. Message count is `null` because the current activity API does not provide an accurate 24-hour total. |
| `GET` | `/accounts` | Normalized accounts with masked phone, role, assigned profile and connection status. |
| `POST` | `/accounts` | JSON `{ name, phone, profileId? }`; calls the existing MSCC account registry and validates profile assignment. The `control` profile cannot be assigned to a newly created linked account. |
| `POST` | `/accounts/:id/pair` | JSON `{ method: "qr" | "code" }`; invokes the existing pair operation and waits briefly for a current QR data URL or pairing code. Uses the number stored in MSCC; no browser-supplied number is accepted. |
| `GET` | `/accounts/:id/pair-status` | Authoritative status from the current MSCC account state. |
| `POST` | `/accounts/:id/reconnect` | Calls the existing MSCC reconnect callback. |
| `POST` | `/accounts/:id/disconnect` | Calls the existing MSCC disconnect callback. |
| `POST` | `/accounts/:id/repair` | Requires `{ confirm: true, method?: "code" | "qr" }`; calls the existing repair callback. |
| `PATCH` | `/accounts/:id` | JSON `{ name }` to rename or `{ profileId }` to assign an existing profile. Unknown/conflicting fields are rejected. |
| `DELETE` | `/accounts/:id?confirm=true` | Requires explicit confirmation and calls MSCC's existing removal policy. Account A remains protected by that callback. |
| `GET` | `/profiles` | Reads profiles and capability priorities from MSCC shared storage. |
| `GET` | `/profiles/:id/config` | Read-only projection of the stored profile capabilities. |
| `GET` | `/modules` | Reads the existing boolean command-availability flags from MSCC settings. |
| `PATCH` | `/modules/:id` | JSON `{ enabled: boolean }`; validates the key against current MSCC settings and invokes `setSetting`. |
| `GET` | `/settings` | Returns only existing boolean command settings. |
| `PUT` | `/settings` | Updates a non-empty patch of existing boolean command settings through `setSetting`. Arbitrary preferences are rejected. |

Profile create/edit/delete, capability-priority writes, and per-account module overrides return `501 READ_ONLY` or `501 NOT_IMPLEMENTED`; the current MSCC web-panel callback contract does not expose those operations. The UI presents only supported profile assignment and does not invent override state.

## Activity, diagnostics, server and storage

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/activity` | Bounded, paginated projection of the MSCC activity ledger; supports `limit`, `cursor`, `severity`, `accountId`, and `query`. Nested secret-like keys and phone-number patterns are redacted server-side. |
| `POST` | `/diagnostics/run` | Read-only snapshot checks for process, account registry, and private control-account presence. This is not a shell runner or a deep dependency probe. |
| `GET` | `/system/metrics` or `/server/status` | Node process memory/uptime, OS load average, runtime and current account statuses. Disk usage and per-account latency are not exposed. |
| `GET` | `/server/logs` | Bounded MSCC activity-ledger events only; this is not systemd journal output. Supports `limit` and `severity`. |
| `GET` | `/server/config` | Sanitized application, bot, integrations and deployment metadata. |
| `GET` | `/storage` | MEGA dashboard/mount metadata from existing MSCC callbacks. No credential or signed download data is returned. |

## Environment

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/env` | Lists only selected key names and configured metadata. Secret values are never returned. A small explicit allowlist of non-secret keys may return safe values. |
| `PUT` | `/env/:key` | Returns `501 READ_ONLY`. Configure deployment variables through protected service configuration, not through the browser. |

## Files

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/files/tree` | Tree of approved source/document roots only. Hidden, runtime, auth, session, database and secret-named paths are excluded. |
| `GET` | `/files/preview?path=...` | Read-only text preview for approved file types up to 512 KiB. Path containment, symlink checks and `O_NOFOLLOW` are applied. |
| `POST`, `PUT`, `DELETE` | `/files/*` | Rejected with `403 READ_ONLY`. Releases are immutable; modifications must go through reviewed source releases. |

## Audit and invariants

- Mutations require administrator session, same-origin request, and session CSRF token.
- Login attempts are rate-limited by socket address; caller-supplied forwarded IP headers are not trusted.
- Mutation metadata is appended to `/var/lib/mscc/data/mscc-admin-audit.jsonl` by default; the audit file is mode `0600` and stores no secret values.
- Account A is constrained to the private `control` profile. Other accounts cannot receive `control`. The existing MSCC account/profile callbacks remain the final authority.
- The legacy `/api/*` panel routes and their existing `mscc_session` cookie remain separate and unchanged.
