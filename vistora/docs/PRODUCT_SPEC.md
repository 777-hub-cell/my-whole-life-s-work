# VISTORA — Product and interaction specification

**Tagline:** Your entertainment, all in one place.  
**Product type:** Personal entertainment library and watch diary.  
**Platform:** HTML, CSS and vanilla JavaScript; installable PWA when hosted over HTTPS.  
**Backend:** None.

## 1. Product intent

VISTORA helps one person organise films and series, record what they have watched, track episodes, rate titles, and keep personal reflections. It does not stream or play video.

The original HTML prototype is the visual and interaction source of truth. The running app at `index.html` retains that design. Do not replace its layout with a native-app redesign or a framework-generated template.

A new browser profile starts with an empty personal library. Demonstration/starter titles must never be inserted as if they were the user's viewing history. Any optional starter/sample data action must be explicitly chosen by the user.

## 2. Main navigation

Persistent bottom navigation:

1. Home
2. Library
3. Discover
4. Stats
5. Settings

Keep the existing subtle translucent bottom bar, active-state treatment, and single phone-width layout.

## 3. Home

- VISTORA wordmark and the original headline.
- Four category entry points: Movies, K-Dramas, Anime, TV Series.
- My Watchlist shelf.
- Preserve the original two-column category tile styling and all complete category labels.
- Do not add a streaming hero, video player, Continue Watching shelf, or a new navigation destination.

## 4. Library

- Search and filter actions in the sticky header.
- Combined type, status, rating, and watchlist filters.
- Sorting and user-selectable 2–5-column poster grid.
- Status is displayed on each poster.
- Floating Add Title action.
- Real empty/no-results states; never invent personal library counts.

## 5. Title Details

- Back action and overflow menu.
- Poster, title, metadata, and interactive rating.
- Synopsis and genres.
- Personal status and manually tracked progress.
- Relevant dates.
- Episode Notes, saved-note list, and separate Overall Thoughts.
- Movies do not show episode progress or episode notes.

## 6. Discover

Discovery is optional and is never required to use the local library. The prototype includes preview and production-provider modes. Remote provider calls require an internet connection; local library features do not.

Do not add a VISTORA proxy/server. Do not expose new API credentials in source control.

## 7. Stats and notes

Statistics are calculated from the user's actual local library. My Notes remains a searchable diary of overall and episode-specific reflections.

## 8. Settings

Preserve the prototype's existing appearance controls, grid preference, provider settings, and data backup/import controls. Destructive actions must require deliberate confirmation.

## 9. Visual design

The HTML prototype defines the approved visual language:

- Ink background `#101114`, quiet surfaces, and restrained burgundy/dusty-rose accents.
- Newsreader-style display serif paired with Hanken Grotesk/system UI.
- Compact poster layouts, carefully spaced text, subtle borders, and the original bottom navigation.
- No neon, generic Material UI, excessive cards, or unrelated redesigns.

The goal is fidelity to the original HTML, not reinterpretation in another UI toolkit.

## 10. Data and offline behaviour

- User records and preferences are stored in browser `localStorage`.
- The service worker caches the HTML app shell for offline reopening when served from HTTPS or localhost.
- Remote fonts and catalogue APIs may be unavailable offline; the browser's local/system font fallback and local library remain usable.
- No sign-in, remote account, VISTORA server, analytics, or automatic cloud sync.
- API keys used by the current prototype are stored in browser local storage. They are not encrypted by a server or Android Keystore.

## 11. Supported delivery

The primary deliverable is the HTML application. It can be opened directly as a local HTML file. PWA installation and service-worker offline caching require a secure web origin (HTTPS or localhost).
