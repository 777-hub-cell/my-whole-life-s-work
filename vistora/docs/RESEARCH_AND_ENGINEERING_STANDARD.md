# VISTORA — HTML engineering and maintenance standard

## Application technology

VISTORA is a plain HTML, CSS and JavaScript application.

- Keep the main app in `index.html`.
- Use browser-native APIs and vanilla JavaScript.
- Do not introduce Kotlin, Jetpack Compose, React, a build framework, bundler, or backend unless the owner explicitly changes the platform decision.
- Keep the original prototype's UI and visual hierarchy intact.

## Change discipline

1. Inspect the existing HTML/CSS/JS before changing it.
2. Make small, local edits; do not replace large sections of the prototype for stylistic preference.
3. Preserve IDs, action names, local data shape, and navigation routes unless a functional fix requires a migration.
4. Test on a narrow phone viewport as well as a desktop viewport.
5. Check text overflow, bottom safe area, keyboard overlap, sheet scrolling, and tap target behaviour.
6. Do not add decorative cards, badges, gradients, icons, or sections without a clear product reason.

## Local data

The existing app uses browser `localStorage`. Keep reads/writes guarded against malformed JSON and storage errors. Preserve the existing backup/import compatibility when changing data structures. Do not transmit personal notes or the library to a remote service.

The current prototype stores optional provider keys in local storage. Treat these as user-local browser data; never hard-code real keys or print them to logs.

## Offline support

The PWA manifest and service worker cache the app shell only. Catalogue API requests and externally hosted font files are not guaranteed to work offline. Do not cache private API responses or introduce background sync of personal data.

## Quality checks

Run:

```bash
node vistora/scripts/validate-html.mjs
```

Before accepting UI changes, inspect the app in a real browser at a phone-sized viewport. A successful HTML parse is not visual sign-off.
