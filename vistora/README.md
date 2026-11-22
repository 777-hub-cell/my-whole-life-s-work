# VISTORA

**Your entertainment, all in one place.**

VISTORA is a personal entertainment library and watch diary. The actual application is plain **HTML, CSS and JavaScript**. It is not a native Kotlin app and it is not a streaming player.

## Open the app

- Main application: [index.html](index.html)
- Original design/reference file: [Vistora.prototype.html](reference/Vistora.prototype.html)
- PWA install settings: [manifest.webmanifest](manifest.webmanifest)
- Offline app-shell cache: [sw.js](sw.js)

Open `index.html` in a browser to use the app. When hosted over HTTPS (or localhost), VISTORA also registers its service worker and can be installed as a Progressive Web App from the browser.

## Important project decision

The original HTML prototype is now the real application entrypoint. Its layout, typography, category tiles, navigation, sheets, posters, and interaction patterns are intentionally preserved. Do not translate it into Compose, React, or another framework, and do not redesign the screens as part of ordinary maintenance.

## Data and privacy

- The library, progress, ratings, notes, and appearance settings are stored locally in the browser using `localStorage`.
- There is no VISTORA backend, account, login, cloud database, or automatic sync.
- The core library remains usable offline once the app shell has been cached by the service worker.
- Catalogue discovery is optional and needs an internet connection. API credentials entered in the current HTML prototype are stored in browser local storage, so use a trusted personal device and browser profile.
- Use the app's backup/export controls before clearing browser data or moving to another device.

## Main structure

- `index.html` — the running HTML/CSS/JavaScript application.
- `reference/Vistora.prototype.html` — the original prototype retained unchanged.
- `manifest.webmanifest` — installable web app metadata.
- `sw.js` — offline app-shell caching.
- `vistora-icon.svg` — application icon.
- `docs/` — product and maintenance notes.
- `scripts/validate-html.mjs` — lightweight source/manifest validation.

The previous native Android experiment is no longer the application or build target. Its source was removed from the active project branch; the earlier Git history still retains it.
