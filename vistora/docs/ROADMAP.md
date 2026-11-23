# VISTORA delivery roadmap

Each milestone must preserve the original HTML reference and keep all personal library functionality local.

## Milestone 1 — Native foundation
- Standalone Android Studio project under `vistora/android`.
- Kotlin + Compose, custom VISTORA theme, navigation shell, responsive system bars.
- Room schema and repository, ViewModel with immutable StateFlow.
- DataStore preferences.
- Empty-first library and settings baseline.
- CI build, lint, unit tests.

## Milestone 2 — Core library
- Add/edit title sheet and local poster picker.
- Home categories and personal shelves.
- Library search, combined filters, sort, 2–5 columns, no result cap.
- Title details, status transitions, rating, dates, episode progress.
- Episode Notes + Overall Thoughts, edit/delete/read.
- Room migrations and migration tests.

## Milestone 3 — Offline data safety
- JSON/ZIP backup export and validated restore through Storage Access Framework.
- Poster copy/downsample/caching.
- API key vault with Android Keystore encryption.
- No auto cloud backup or sync.
- Round-trip backup tests.

## Milestone 4 — Discovery and stats
- Offline preview catalog.
- Optional direct TMDB discovery for films/TV/K-dramas and AniList public GraphQL for anime. Do not use Jikan or OMDb.
- Clear offline/error/rate-limit/key-invalid states.
- Add-to-library explicit confirmation.
- Live statistics calculated only from Room.

## Milestone 5 — Polish and release hardening
- Responsive layout for compact/medium/expanded widths.
- Typography scaling, contrast, TalkBack, focus, touch target QA.
- Motion and reduced-motion support.
- Poster memory optimisation; Lazy grid performance.
- Release/R8 build, CI lint/tests, Macrobenchmark/Baseline Profile for key journeys.
- Manual testing on real Samsung Galaxy A16-class hardware.

## Current branch status\n\n- The original HTML reference and product/research documentation are committed.\n- The native Compose project, Room schema/repository, ViewModel, main screens, local episode diary, dates, local ZIP backup/restore, secure TMDB credential storage, and direct optional provider search are implemented in source.\n- Automated GitHub Actions build/test/lint workflow is committed. Its result must be checked before calling this a verified build.\n- Final release checks still include full CI success, a release/R8 build, device QA, TalkBack/large-font QA, and official TMDB logo/branding asset placement per its current guidelines.\n\n## Definition of done

- No server/backend/account required.
- Home, Library, Title Details, notes, Stats, Settings, and backups work without internet.
- Episode notes survive force-stop and app restart.
- Data can be exported and restored without losing user-authored content.
- Custom UI looks unmistakably like VISTORA and does not resemble untouched Material samples.
- All core flows are tested and no known crash/lint blocker remains.
