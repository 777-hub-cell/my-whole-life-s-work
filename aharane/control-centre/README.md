# Aharane Local Studio

The complete Aharane Control Centre as an installable Android-first PWA, built with editable HTML, CSS and JavaScript.

On the existing HTTPS host, open `/aharane/studio/`. Nginx forwards this isolated prefix to Aharane and strips it before the request reaches the service. The browser uses same-origin `/aharane/api/*` and `/aharane/ws`; no Vercel function, ngrok tunnel, relay, or second web server is required. Aharane remains bound to `127.0.0.1:8790`; never expose port 8790 directly. See [../infra/DIRECT-HTTPS.md](../infra/DIRECT-HTTPS.md).

On Android Chrome, open the HTTPS URL and install it or use Add to Home screen. The service worker caches the app shell; local workspace and source editing work offline after first load. Remote bot controls require internet and sign-in.

Choose **Edit this app** in Local Studio to edit its own `index.html`, `styles.css`, `app.js` and manifest. Drafts stay in an IndexedDB store on this phone; Apply reloads the app using those local source overrides. Export a source backup first. These edits affect this phone only. Use `/aharane/studio/recover.html` to clear broken overrides without deleting project files.
