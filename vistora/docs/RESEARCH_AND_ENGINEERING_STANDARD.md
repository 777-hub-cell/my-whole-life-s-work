# VISTORA — Android/Kotlin engineering standard

Research checked **22 November 2026**. Official Android and Kotlin documentation is preferred over tutorials or outdated blog posts. This document is the project's default engineering policy; revisit dependency versions before each release.

## 1. Recommended technical stack

- Kotlin, using official Kotlin coding conventions.
- One Android Activity.
- Jetpack Compose for all application UI.
- Material 3 as an implementation foundation, with a VISTORA-owned theme and custom components.
- Navigation Compose for destinations and system back behaviour.
- ViewModel + immutable StateFlow screen state.
- Kotlin coroutines and Flow for asynchronous work and database observation.
- Room as the canonical local data store.
- Preferences DataStore for non-secret preferences.
- Android Keystore-backed AES-GCM encryption for the user's optional TMDB credential. AniList's public GraphQL endpoint does not require a key for anime search.
- Android Photo Picker for poster selection.
- Storage Access Framework for explicit backup export/import.
- JUnit, Room instrumentation tests, and Compose UI tests.

### Version baseline

Use these compatible current/stable versions as the initial checked baseline. The existing Aharane Kotlin foundation in this same repository provides the Gradle/Kotlin baseline; AndroidX libraries below were checked against official release pages on the research date.

| Component | Baseline |
|---|---:|
| Android Gradle Plugin | 9.3.1 (existing Aharane Android foundation) |
| Gradle wrapper | 9.5.0 (existing Aharane Android foundation) |
| Kotlin | 2.4.21 (existing Aharane Android foundation) |
| Compose BOM | 2026.09.00 |
| Activity Compose | 1.13.0 |
| Lifecycle | 2.12.0 |
| Navigation Compose | 2.10.2 |
| Room | 2.8.5 |
| DataStore | 1.3.0 |
| KSP | 2.3.12 |

Do not blindly upgrade to alpha/beta artifacts for production. Keep related Compose libraries aligned through the BOM. Confirm toolchain compatibility in CI before adopting any new major Gradle/Kotlin/AGP version.

## 2. Architecture: simple layers, clear boundaries

Use a pragmatic layered architecture:

```
Compose screens
    ↓ user actions / immutable state
ViewModels (screen state, orchestration)
    ↓ repository APIs
Repositories (business rules and source selection)
    ↓
Room DAOs + local file store + DataStore
             ↘ optional provider APIs for Discover only
```

- UI layer: composables render state and forward user intent. Do not put database queries, network calls, JSON migration, sorting of large collections, or domain rules in composable bodies.
- Data layer: repositories expose the application data and contain the bulk of data-source logic. Even a repository with one source is useful because it prevents the UI from depending on Room directly.
- Domain/use-case layer: add only where a meaningful rule is reused or complexity justifies it. Do not create layers and abstractions for their own sake.
- Single source of truth: Room owns library truth. Screens observe repository Flow; no parallel mutable UI copy of the title library.
- UDF: events flow from UI to ViewModel/repository; immutable UI state flows back to UI.
- ViewModels expose StateFlow, not MutableStateFlow. Collect with collectAsStateWithLifecycle.
- Pass plain data and event lambdas into reusable composables, not ViewModel instances.
- Keep Android Context, Activity, and framework APIs at platform boundaries. Do not retain Activity references in repositories/ViewModels.

## 3. Local-first data design

Room is the durable source of truth:
- `MediaItem`: title, type, release year/state, episode total, watched episode count, personal status, personal rating, synopsis, genres, poster path, watchlist flag, dates, timestamps, overall thoughts.
- `EpisodeNote`: media item ID, episode number, body, created timestamp, updated timestamp. Enforce a unique (mediaItemId, episodeNumber) constraint. Foreign key deletion should cascade when a title is removed.
- Keep database entities separate from presentation models where that simplifies migration and testing.
- Use explicit schema export, checked-in schema snapshots, and tested migrations. Never rely on destructive migration for user data.
- Keep poster binaries outside SQLite; store an app-private relative path/URI in the database.
- Use transactions for compound changes (for example, status + progress updates).
- Never impose an arbitrary maximum on the number of titles visible in the library.

DataStore is for lightweight preferences such as grid columns, sort, appearance, and discovery source. It is not a substitute for Room for structured library records.

## 4. Offline-first and no-server rules

- The app must start and display its local library without network.
- A failed provider request must never block or erase local data.
- Discover is a separate optional network capability, not a dependency of Home, Library, Title Details, Stats, notes, or backups.
- Network result is not the app's source of truth. Only an explicit Add action imports a result into Room.
- No VISTORA backend, proxy, account service, push service, analytics service, cloud sync, Firebase, or remote database.
- Request INTERNET permission only because optional catalogue discovery exists. Do not request broad storage/media permissions.
- Keep API keys out of source control and backup files. Encrypt them with an Android Keystore-backed key and store only ciphertext in app-private preferences.

## 5. Visual craft: do not ship default-looking Compose

Compose and Material 3 are the foundation, not the finished design.

Build a small VISTORA design system before building screens:
- Central colour tokens, typography scale, spacing scale, shape scale, elevations, motion timings, and component states.
- Define disabled, pressed, focused, selected, loading, empty, error, and destructive states.
- Create reusable VISTORA components: app scaffold, bottom navigation, section heading, poster tile, status label, filter sheet, rating selector, progress control, text field, action button, modal sheet, empty state, and toast/snackbar.
- Use Material/Foundation primitives when they provide correct touch, focus, semantics, and interaction behaviour, but style them with VISTORA's tokens and composition.
- Text fields should have bespoke surface, border, cursor/accent, shape, label, supporting/error text, content padding, and focus transitions. Avoid untouched default OutlinedTextField/Material buttons everywhere.
- Prefer a small number of meaningful surfaces over a stack of cards. Use the background, typography, dividers, poster art, and whitespace to create hierarchy.
- Avoid neon, uncontrolled gradients, glassmorphism everywhere, thick shadows, oversized pill controls, excessive icons, and decorative elements that compete with content.
- Preserve the established dark ink / burgundy / dusty-rose identity. Use status colours quietly and always retain text labels.
- Respect system bars, cutouts, IME, edge-to-edge, predictive back, and scroll behaviour.

## 6. Accessibility and adaptable layouts

- Interactive targets must be at least 48dp × 48dp.
- Every icon-only action has a meaningful content description.
- Custom controls expose semantics and selected/checked/progress values.
- Status is communicated by label and visual treatment, not colour alone.
- Maintain readable contrast; do not use muted secondary text so faint that it disappears.
- Support font scaling without clipping or truncating important controls.
- Test TalkBack focus order, keyboard focus, system back, and reduced-motion behaviour.
- Use responsive constraints and window size classes. The phone layout is the primary design, but medium/expanded widths should use the extra width (for example, a navigation rail and wider two-pane details) rather than merely stretching a phone column.
- Poster grids respond to width; retain the user's 2/3/4/5 column preference without producing unusably narrow cells.

## 7. Compose performance

- Use LazyColumn/LazyVerticalGrid for unbounded collections, stable item keys, and contentType where useful.
- Downsample poster images to the displayed size; do not decode full-resolution images on the main thread.
- Do not sort/filter 1,000+ items repeatedly in composable bodies. Derive query state in ViewModel/repository and use Flow/Room.
- Keep composables small and focused; keep state as low as possible while preserving ownership.
- Avoid unnecessary recompositions, backward writes, unstable mutable collections, and expensive work during composition.
- Use remember/derivedStateOf only for actual repeated or high-frequency calculations, not as decoration.
- Use lifecycle-aware collection.
- Measure on real hardware. Optimise from traces and benchmarks rather than guessing.
- Build and test release configuration with R8. Add a Baseline Profile for the important path when the user journeys are stable.

## 8. Kotlin quality

- Prefer immutable data classes and read-only collection interfaces across boundaries.
- Use sealed types/enums for bounded app states such as media type and personal status.
- Use suspend functions for one-shot work, Flow for streams, and structured concurrency.
- Do not launch unowned GlobalScope coroutines.
- Do not swallow errors silently; convert expected failures into a typed result/UI state.
- Avoid giant Activities, giant composable files, global mutable state, singletons holding UI state, stringly typed status checks, and magic numbers.
- Use meaningful class/file names, official Kotlin formatting, and small functions.
- Keep dependencies injected at construction boundaries; a small manual application container is enough for this app. Do not introduce a heavy DI framework without a real need.

## 9. Images and files

- Use Android Photo Picker for a user-selected poster; copy/resize/compress to app-private storage immediately so access does not depend on a temporary external URI grant.
- Generate a small cached poster variant for grid display.
- Avoid remote poster requests in core library screens unless the user explicitly imported/selected a remote result; local posters must remain available offline.
- Backup export should be explicit via SAF. Include structured library data, notes, settings that are safe to export, and optionally poster files in a ZIP.
- Do not export API credentials, Keystore material, or private app internals.
- Restore should validate the archive, enforce size/type limits, handle duplicates and malformed data, and commit database changes transactionally.
- Round-trip test: export → clear test database → import → compare title, progress, status, rating, note, genre, date, and poster fidelity.

## 10. Testing and release quality gates

### Unit
- Status transitions and episode count bounds.
- Movie vs episodic title behaviour.
- Rating bounds and rating distribution.
- Filter combinations and sorting.
- Statistics calculations.
- Backup/restore validation and migration logic.

### Database
- DAO insert/update/delete.
- Unique episode note per title/episode.
- Cascade deletion.
- Transaction behaviour.
- Every schema migration from a checked-in historical schema.

### UI
- Empty Home and populated Home.
- Search and combined filter paths.
- 2–5 column grid selection.
- Add/edit/remove title.
- Tap status to change; no extra arrow or separate status button.
- Mark episode progress; status updates correctly.
- Save, reopen, edit, and delete an episode note.
- Rating selection.
- Backup and restore flows.
- Rotation/process recreation and state restoration.
- Accessibility semantics for custom controls.

### Device and performance
- Test a real Samsung Galaxy A16-class device and at least one smaller/larger display.
- Verify offline use in airplane mode.
- Check startup feedback, scrolling, poster memory, no main-thread disk/network work, no ANRs, and no crashes.
- Inspect release build with R8 enabled.
- Run lint and tests in CI; use Macrobenchmark/trace-based checks before claiming performance improvements.

## 11. Explicit anti-patterns

Do not:
- wrap the HTML in a WebView as the final Android product;
- put Room, networking, or file I/O in composables;
- store all data in a single JSON preference string;
- use default Material widgets without a VISTORA skin;
- block the library while Discover performs a network request;
- use fake stats or pretend user history;
- store poster binaries directly in Room rows;
- store API keys as plaintext or include them in backups;
- request broad filesystem permission to select one image;
- use a destructive database migration;
- run sorting/large computations every recomposition;
- make status meaning depend only on colour;
- sacrifice accessibility for compact visuals;
- add cloud or server features "for convenience" without a separate explicit product decision.

## 12. Primary references

- [Android architecture guide](https://developer.android.com/topic/architecture)
- [Android Keystore system](https://developer.android.com/privacy-and-security/keystore)
- [TMDB API documentation](https://developer.themoviedb.org/docs)
- [TMDB API attribution and branding FAQ](https://www.themoviedb.org/faq/api) — add the current official TMDB logo asset and required attribution before public release.
- [AniList API documentation](https://docs.anilist.co/)
- [Android architecture recommendations](https://developer.android.com/topic/architecture/recommendations)
- [UI layer and unidirectional data flow](https://developer.android.com/topic/architecture/ui-layer)
- [State holders and UI state](https://developer.android.com/topic/architecture/ui-layer/stateholders)
- [Kotlin coroutine best practices](https://developer.android.com/kotlin/coroutines/coroutines-best-practices)
- [Offline-first architecture](https://developer.android.com/topic/architecture/data-layer/offline-first)
- [Room release notes](https://developer.android.com/jetpack/androidx/releases/room)
- [DataStore release notes](https://developer.android.com/jetpack/androidx/releases/datastore)
- [Compose BOM guidance](https://developer.android.com/develop/ui/compose/bom)
- [Compose setup and current stable BOM](https://developer.android.com/develop/ui/compose/setup-compose-dependencies-and-compiler)
- [Compose performance](https://developer.android.com/develop/ui/compose/performance)
- [Compose testing](https://developer.android.com/develop/ui/compose/testing)
- [Compose accessibility](https://developer.android.com/develop/ui/compose/accessibility)
- [Android accessibility target sizes](https://developer.android.com/guide/topics/ui/accessibility/apps)
- [Adaptive Compose layouts](https://developer.android.com/develop/ui/compose/build-adaptive-apps)
- [Navigation Compose](https://developer.android.com/guide/navigation)
- [Kotlin coding conventions](https://kotlinlang.org/docs/coding-conventions.html)
