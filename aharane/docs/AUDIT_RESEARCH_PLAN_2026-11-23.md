# Aharane research and implementation plan — 2026-11-23

## Scope and baseline
Source baseline: `07745d7dfc8d041d33ed6595afa379a1e17b80ea` (open PR #77, based on `mscc-azure`).
Working branch: `audit/aharane-complete-quality-20261123`. No production deployment, merge or signing-key modification authorized.
This is an **initial, incomplete audit**. Do not infer verification for features not investigated.

## Baseline CI evidence
GitHub Actions run 45118820802 at baseline commit:
- Native Android tests and debug APK: success.
- Aharane server logic and workflow tests: success.
- Emulator screenshot capture: success (screenshots not yet individually reviewed).
- Unsigned release candidate: failure, Maven Central returned HTTP 429 fetching Kotlin Gradle plugin and other artifacts. **Not** established to be a code regression.
- Signed release: skipped.
Azure run 45118820794: success. CI green elsewhere does not prove real account/bot behaviour.
Local build and emulator testing not available in current execution environment (Android SDK, adb and Gradle unavailable). Existing CI results are not new tests run on this branch.

## Verified source findings
- `aharane/package.json` specifies `@itsliaaa/baileys: 0.5.6`. Pin capability analysis to this installed fork and version.
- `aharane/src/owner-config.js` version 3 mirrors one `ownerNumber` into `privateOwnerNumber` and `publicOwnerNumber`, discarding a previously distinct Public Owner. This explicitly conflicts with the new requirement.
- `aharane/src/authorization.js` already has distinct private and public Owner authorization helper parameters; migration must preserve security rather than bypass it.
- `aharane/src/index.js` configuration route, pairing checks, readiness/status and API responses rely on the shared Owner model. Fixing only the settings screen or config normalization is unsafe.
- `aharane/control-centre/production-bridge.js` presents a shared Owner field and sends shared Owner payloads; requires coordinated contract changes.
- Android `ConfigurationScreen.kt` uses `PUBLIC_BOT_NUMBER` in the Public profile's current owner-number field; the Public Owner must be exposed separately without confusing it with session identity.
- `VisualCommandBuilderScreen.kt` currently has category/node labels around 9–10.5sp and canvas nodes 206dp wide. Restore readable sizes only after screenshot and gesture impact review.
- Android `VisualCommandBuilderLayoutTest.kt` checks positional independence but does not demonstrate save/reload or real execution.
- The PR itself describes a shared Owner assumption which the newer product requirement overrides.

## Research log
1. Android Compose gestures: https://developer.android.com/develop/ui/compose/touch-input/pointer-input/understand-gestures — pointer event consumption, gesture recognition, scroll/drag coordination for message swipe and canvas handling.
2. Android Compose testing: https://developer.android.com/develop/ui/compose/testing — semantics, gesture input, deterministic assertions and UI tests.
3. Android Compose animation: https://developer.android.com/develop/ui/compose/animation — animation APIs; verify currently maintained documentation as individual page routes change.
4. Android accessibility: https://developer.android.com/design/ui/mobile/guides/foundations/accessibility — contrast, touch target sizing and motion support.
5. Android splash: https://developer.android.com/reference/androidx/core/splashscreen/SplashScreen — platform-compatible splash lifecycle and nonblocking exit.
6. Material 3: https://m3.material.io/ — typography, restrained surfaces, accessible component anatomy.
7. Baileys fork: https://github.com/itsliaaa/baileys — fork capabilities need verification against installed `0.5.6` API, not just README claims at current HEAD.

## Dependency-aware implementation sequence
0. **Baseline gate:** obtain complete source inventory, confirm CI checks/artifacts and review existing screenshots. Record persistent storage and API contracts. Do not overwrite existing working features.
1. **Chat:** account-scoped real identities and profile-photo access, message model and quoted-message mapping, tested swipe-to-reply and stable scroll position. Confirm actual bot operations and media semantics before exposing controls.
2. **Visual editor:** baseline screenshot and typography correction; gesture/canvas tests; validate node library vs engine; persistence/reload; trace execution. Do not present synthetic execution as real.
3. **Custom-node engine:** audited typed schemas, limited execution permissions, validation, bounded loops/timeouts, cancellation and execution-trace API; safe versioned custom-node loading with no unrestricted code execution.
4. **Account migration:** design v4 two-Owner schema with deterministic preservation of separate v2 identities and documented handling of v3 data that already lost Public Owner. Update Android, web studio, backend, authorization and pairing contract together. Test same/different/Public-self Owner scenarios and LID security.
5. **Remaining screens:** Notes, AI text-draft-only, Appearance/keyboard, startup, Status/Channels capability matrix, Files and recovery/error states.
6. **Release:** run full bot + UI integration and emulator matrix; perform a clean release build from final commit; sign only with protected existing key and independently verify certificate and APK SHA-256.

## Mandatory release blockers
- No successful unsigned release from this baseline CI run.
- No signed final APK or verified certificate for this branch.
- Real WhatsApp staging accounts, credentials and production signing secrets are not present in this audit environment.
- No direct local Android SDK/emulator available.
- No proof yet that Status/Channels and custom-node execution are supported through the pinned library.

## Evidence policy
Only mark TESTED for a test actually executed, VERIFIED ON EMULATOR for live emulator interaction, and VERIFIED AGAINST BOT for actual integrated session observations. Code inspection alone is insufficient.
