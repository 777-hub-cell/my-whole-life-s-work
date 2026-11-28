# Aharane requirements ledger — initial source-audit checkpoint

**Baseline source:** `07745d7dfc8d041d33ed6595afa379a1e17b80ea`

Status vocabulary: NOT STARTED | IN PROGRESS | IMPLEMENTED | TESTED | VERIFIED ON EMULATOR | VERIFIED AGAINST BOT | BLOCKED.
This ledger is conservative: baseline CI success is evidence of existing tests, **not** evidence that the entire feature is tested.

| Area | Requirement | Status | Evidence / next gate |
|---|---|---|---|
| Foundation | Preserve source and existing PR | IMPLEMENTED | Separate branch `audit/aharane-complete-quality-20261123` based on verified PR SHA; PR remains open |
| Foundation | Baseline Android unit/instrumentation job | TESTED | Previous GitHub Actions run 45118820802 native test job success, not independently rerun here |
| Foundation | Baseline backend tests | TESTED | Previous GitHub Actions run 45118820802 backend test job success, not independently rerun here |
| Foundation | Baseline emulator screenshot job | TESTED | Previous GitHub Actions run 45118820802 screenshot job success; image review pending |
| Foundation | Clean release build | BLOCKED | CI run 45118820802 failed retrieving Maven dependencies (HTTP 429), not a verified source failure |
| Chat | Real account-scoped conversations, contact identities and photos | IN PROGRESS | Source/API inventory needed; no real account verification |
| Chat | Swipe-to-reply on bubbles | NOT STARTED | No new implementation or gesture tests |
| Chat | Quotes, media, message actions, history and scroll | NOT STARTED | Need complete backend/UI path and staging verification |
| Visual Editor | Readable node library and canvas | IN PROGRESS | Source confirmed 9–10.5sp node typography and 206dp width; emulator review pending |
| Visual Editor | Node drag/pan/zoom/connect lifecycle | NOT STARTED | Existing position test only; no new gesture tests |
| Visual Editor | Save/reload/execute actual engine workflows | NOT STARTED | End-to-end trace and engine fixtures pending |
| Engine | Extensible typed executable user-defined nodes | NOT STARTED | Architecture and sandbox execution contract pending |
| Security | Independent Private/Public Owners | IN PROGRESS | v3 owner-config mirrors both owner fields; coordinated versioned migration required |
| Security | Private self-chat LID/fromMe authorization | NOT STARTED | Helpers exist but strict end-to-end staging test pending |
| Security | Open ordinary Public access with Owner-only privileges | NOT STARTED | Source and existing tests need security audit |
| Status/Channels | Actual supported API/media access | NOT STARTED | Exact installed fork `@itsliaaa/baileys@0.5.6` capabilities unverified |
| Notes | Persistence, editing and keyboard | NOT STARTED | Pending source and emulator review |
| AI Reply | Only editable text drafts, explicit send | NOT STARTED | Pending source and integration audit |
| Appearance | Same contrast in preview/live, keyboard fixes | NOT STARTED | Pending source and emulator review |
| Startup | Branded nonblocking splash | NOT STARTED | Pending manifest/startup audit |
| Release | Signed versionCode > 747, exact cert SHA-256 | BLOCKED | No verified final APK or approved signing secret in this environment |

## Baseline bug register
- AH-001: Single shared Owner schema erases distinct Public Owner on migration (verified in `src/owner-config.js`).
- AH-002: Android Public configuration currently conflates displayed Owner with `PUBLIC_BOT_NUMBER` (verified in `ConfigurationScreen.kt`).
- AH-003: Visual Editor category/node typography is too small (source sizes verified; visual impact requires emulator screenshots).
- AH-004: Existing workflow layout unit test covers only node position independence and does not establish execution behaviour (verified).
- AH-005: Existing release candidate build failed on Maven HTTP 429 (CI evidence; must retry rather than paper over).

## Regression tests to add before closing bugs
- AH-001: v2 distinct Owners survive migration; v3 ambiguous lost Public Owner is handled explicitly rather than guessed; distinct same/self Public Owner valid; atomic persistence.
- AH-002: Android + web studio config API round trips both fields without changing Public bot identity.
- AH-003: Compose semantics/typography and narrow phone canvas screenshot validation.
- AH-004: Node save/reopen, invalid graph, typed edge mismatches, real executor integration and backend errors.
- AH-005: Clean unsigned candidate succeeds from release commit, then independently signed candidate verifies fingerprint and install/start.

No item is implicitly complete merely because it exists in source.
