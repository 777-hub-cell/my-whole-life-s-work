# Aharane Local Studio

The complete Aharane Control Centre as an installable Android-first PWA, built with editable HTML, CSS and JavaScript.

Aharane serves the PWA at `/studio/`; same-origin API and WebSocket paths are `/api/*` and `/ws`. No Vercel function, ngrok tunnel or relay is required. The Aharane process remains bound to `127.0.0.1:8790`; use a normal HTTPS reverse proxy such as Caddy in front of it and never expose port 8790. See [../infra/DIRECT-HTTPS.md](../infra/DIRECT-HTTPS.md).

On Android Chrome, open the HTTPS `/studio/` URL and install it or use Add to Home screen. The service worker caches the app shell; local workspace and source editing work offline after first load. Remote bot controls require internet and sign-in.

Choose **Edit this app** in Local Studio to edit its own `index.html`, `styles.css`, `app.js` and manifest. Drafts stay in an IndexedDB store on this phone; Apply reloads the app using those local source overrides. Export a source backup first. These edits affect this phone only. Use `/studio/recover.html` to clear broken overrides without deleting project files.

The PWA retains bot status, WhatsApp pairing, Files Manager, ZIP package library and validated bot ZIP deployment. The service worker itself is not user-editable because it provides offline caching and recovery.