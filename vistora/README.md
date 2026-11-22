# VISTORA

**Your entertainment, all in one place.**

VISTORA is a private, personal entertainment library and watch diary. It is a native Android application written in Kotlin with Jetpack Compose. It is not a streaming player.

## Project layout

- `android/` — native Kotlin/Jetpack Compose Android application.
- `reference/Vistora.prototype.html` — the original HTML prototype preserved unchanged as the product/design reference.
- `docs/PRODUCT_SPEC.md` — agreed product behaviour and screen requirements.
- `docs/RESEARCH_AND_ENGINEERING_STANDARD.md` — Android/Kotlin research, engineering standards, do's and don'ts.
- `docs/ROADMAP.md` — implementation milestones and quality gates.

## Non-negotiable product decisions

- No VISTORA backend, server, login, account, cloud sync, or remote database.
- Core library, progress, ratings, personal notes, and settings are stored on this device.
- The library must remain usable in airplane mode.
- Optional catalogue discovery may call public provider APIs directly from the device. It is not required to use the library.
- API keys, when configured by the user, are stored locally and never committed or included in exported backups.
- VISTORA is not a video player. No playback screen and no player-style "Continue Watching" hero.
- The four categories are **Movies**, **K-Dramas**, **Anime**, and **TV Series**. Anime Movies belong under Anime.
- Navigation: **Home**, **Library**, **Discover**, **Stats**, **Settings**.
- Default library grid is two columns; the user can choose 2, 3, 4, or 5.
- Series progress is manually tracked as episodes watched / total episodes.
- Episode Notes are separate entries, one per title and episode number, editable and readable later. Overall thoughts are supported separately.
- Titles and statistics are user data, not hard-coded demo counts. A fresh install starts with an empty personal library.

## Design direction

Retain the prototype's ink-black background, muted burgundy, dusty rose, quiet secondary surfaces, serif display typography, compact poster grid, and restrained status colours. Refine the visual system rather than replacing it with a generic template. Avoid neon, excessive cards, overly heavy typography, default-looking controls, and unnecessary decoration.

## Build

Open `android/` as a standalone project in Android Studio. The source uses Kotlin, Jetpack Compose, Room, DataStore, Navigation Compose, and lifecycle-aware ViewModels. See the engineering standard for pinned baseline versions and release checks.

## Current development branch

`feature/vistora-kotlin-native-android-20261122`

This branch is independent of Aharane's runtime/deployment branches. Do not merge VISTORA files into Aharane's service or deployment workflow.
