# VISTORA delivery roadmap

The original HTML/CSS/JavaScript prototype is the running application and must remain visually recognisable.

## Milestone 1 — Restore the intended platform

- [x] Make the original HTML prototype the real `index.html` entrypoint.
- [x] Preserve the original prototype separately in `reference/`.
- [x] Add a web app manifest, icon, and service worker for PWA installation/offline shell caching.
- [ ] Verify the HTML application in an Android browser at phone width.
- [ ] Verify install and offline reopen from an HTTPS origin.

## Milestone 2 — Functional verification

- Verify Home categories, My Watchlist, and bottom navigation.
- Verify add/edit/remove title flows and poster selection.
- Verify library search, combined filters, sorting, and 2–5-column layouts.
- Verify title status, ratings, dates, episode progress, Episode Notes, and Overall Thoughts.
- Verify Stats and the searchable My Notes diary.
- Verify Discover preview and explicit provider error states.
- Verify backup/export and restore/import.

## Milestone 3 — Reliability

- Add browser-level regression checks for the core flows.
- Guard storage quota and malformed backup edge cases.
- Test refresh/force-close persistence.
- Test service-worker update and offline fallback behaviour.
- Check keyboard, dynamic text sizes, safe areas, and accessibility.

## Definition of done

- The real app is HTML/CSS/JavaScript, not a native rewrite.
- The original prototype's design and interaction patterns are preserved.
- Personal data remains in browser-local storage.
- Core screens reopen offline after the PWA app shell has been cached.
- No known critical visual or data-loss issue remains.
