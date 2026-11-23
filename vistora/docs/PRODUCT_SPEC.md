# VISTORA — Product and interaction specification

**Tagline:** Your entertainment, all in one place.  
**Product type:** Private, local-first entertainment library and watch diary.  
**Platform:** Native Android, Kotlin + Jetpack Compose.  
**Backend:** None.

## 1. Product intent

VISTORA helps one person organise films and series, record what they have watched, track episodes, rate titles, and keep personal reflections. It does not stream or play video.

The HTML prototype at `reference/Vistora.prototype.html` is the source reference. Its information architecture and meaningful behaviours should be reproduced, while the native app can improve spacing, responsive behaviour, motion, touch feedback, accessibility, and visual consistency.

A new install starts with an empty personal library. Titles shown in the original prototype are reference/sample content, not assumed personal viewing history.

## 2. Main navigation

Persistent bottom navigation:

1. Home
2. Library
3. Discover
4. Stats
5. Settings

Keep the navigation visually subtle, polished, compact, and clear. The selected item receives a restrained surface/highlight. Do not add a sixth destination.

## 3. Home

- VISTORA wordmark and a search action; notification/plan reminder may be retained if it is useful and does not introduce fake notifications.
- Headline: "What you've watched, and what's next."
- "Find something to watch" category entry points.
- Exactly four categories: Movies, K-Dramas, Anime, TV Series.
- The approved Home layout contains one **My Watchlist** shelf after the four categories. Do not add player-style sections or generic status shelves.
- Sections are hidden or replaced by a helpful empty state when there is no matching user data.
- No "Continue Watching" hero, video player action, or streaming-oriented UI.

## 4. Library

- Page title: My Library.
- Search and sliders/filter actions in the header.
- No permanent row of status filter pills below the heading; filters are opened from the sliders control.
- Filters support status, content type, rating, and watchlist.
- Common combinations must work, such as Status = Completed + Type = Movies, or Completed + TV Series.
- Sort: recently added, recently updated, title A–Z, title Z–A, highest rated, newest release.
- Grid: 2 columns by default; selectable 2 / 3 / 4 / 5 columns.
- No arbitrary title-count cap. The grid must support large collections with lazy rendering and stable keys.
- The status label overlays the lower part of each poster as a small rounded rectangle; do not add a duplicate status row under posters.
- A floating Add Title action opens an elegant editor.
- Provide real empty and no-results states; never fake item totals.

## 5. Title Details

Top-to-bottom order:

1. Back action, "Title Details", overflow menu. No pencil icon in the top bar.
2. Poster on the left; title aligned beside it.
3. One metadata line: content type · series airing state (when applicable) · total episode count (when applicable). This is catalogue metadata, not personal progress.
4. Five interactive rating stars beside the title block. One to five stars; tapping the selected score again may clear it. No duplicate rating section lower down.
5. Synopsis, with a compact three-line preview and Read more/Show less.
6. Compact genre tags.
7. Personal library status as a tappable rounded rectangle with no adjacent dropdown arrow or separate Change Status button. Statuses: Plan to Watch, Watching, Completed, On Hold, Dropped.
8. For episodic content, My Progress: watched episodes / total episodes, percentage/progress bar, and accessible decrement/increment controls. Reaching the episode total marks the title Completed. Starting progress from Plan to Watch, On Hold, or Dropped changes the status to Watching. Progress cannot become negative or exceed the total.
9. Dates where relevant: started, finished, or movie watched-on date.
10. Episode Notes as a substantial bottom section.

### Episode Notes

- Notes are keyed by the combination of title ID and episode number.
- One editable note per episode; saving again updates it rather than creating a duplicate.
- Selecting an episode loads its saved note, if any.
- Show previously saved episode notes with episode number, date, and a readable preview. Tapping one selects it for reading/editing.
- Saving, editing, and deleting are explicit actions with clear feedback.
- Provide separate Overall Thoughts for the entire series or film.
- The episode-note editor should be large enough for genuine reflections. The saved-notes list should remain comfortably readable below it.
- For movies, hide episode progress and episode selector; retain overall thoughts and watched date.

## 6. Discover

- Discover is optional convenience, never a prerequisite for using the local library.
- Keep a built-in offline preview catalogue or explicit offline state.
- Optional live providers: TMDB for films, TV series and Korean-language TV results (K-dramas); AniList public GraphQL API for anime. Jikan is not used.
- No proxy server or VISTORA backend. The Android app calls provider APIs directly. Public Jikan API is discontinued and must not be added as a provider.
- Do not bundle real API credentials. The user enters their own key locally.
- Search results are not added silently. User must choose Add.
- Provider metadata is copied to the local library only when the user adds a title.
- Handle no connection, provider rate limits, rejected keys, and empty results with clear, non-blocking states.

## 7. Stats

Calculate from the local database only:
- Completed titles.
- Episodes and films watched.
- Average personal rating.
- Currently watching count.
- Breakdown by status.
- Breakdown by content type.
- Top genres.
- Rating distribution.

All displayed values must be derived from actual stored data. Empty values should be presented honestly.

## 8. My Notes

- Accessible from Settings; it is a subpage, not a sixth bottom-navigation destination.
- Combine every title's Overall Thoughts and all episode-specific notes into one searchable diary.
- Search by title, episode label, and note body.
- Sort newest-edited first; opening an episode entry returns to Title Details with that episode selected.
- Returning from a note opened here returns to My Notes.

## 9. Settings

- Appearance: dark theme as the default; restrained accent options; headline typography; poster corner treatment; text size; motion preference.
- Library grid preference.
- Data source/provider settings, with API key fields concealed by default and a test action.
- Local notes index/search.
- Explicit Backup and Restore using Android's Storage Access Framework.
- Reset/clear actions must require deliberate confirmation.
- Explain that no cloud account or automatic cloud sync exists.

## 10. Visual design system

Base palette from the approved prototype:

| Token | Value |
|---|---|
| Background | #101114 |
| Surface | #202126 |
| Raised surface | #222329 |
| Input surface | #17181C |
| Divider/track | #34353B |
| Primary text | #F0EBEC |
| Secondary text | #C3BEC5 |
| Muted text | #9B979F |
| Burgundy accent | #63333A |
| Accent highlight | #7A3F47 |
| Dusty rose | #C17B83 |

Status colours are muted, distinct, and never the sole indicator of meaning:

- Watching: dark ochre surface, warm gold text.
- Completed: deep green surface, sage text.
- Plan to Watch: slate-blue surface, pale blue text.
- On Hold: muted plum surface, lavender text.
- Dropped: muted red-brown surface, dusty red text.

Use a display serif paired with a clean sans-serif UI face, deliberate spacing, subtle borders, restrained elevation, and smooth but quiet motion. Keep the look recognisably VISTORA.

## 11. Data and privacy

- All user library records, progress, personal writing, preferences, and poster copies are local.
- No sign-in, remote account, telemetry, analytics, server logging, or server-side data store.
- Network is used only for optional metadata discovery.
- No API secrets in source control, logs, analytics, crash reports, or backup exports. The optional TMDB credential is stored encrypted with Android Keystore-backed AES-GCM; AniList public anime search needs no key.
- User-selected poster images are copied into app-private storage after selection; do not request broad media/storage permissions.
- Manual export/import must be tested for round-trip fidelity.
