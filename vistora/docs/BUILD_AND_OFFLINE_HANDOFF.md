# VISTORA — HTML and offline handoff

## Application

- Main app: `vistora/index.html`
- Original prototype reference: `vistora/reference/Vistora.prototype.html`
- Manifest: `vistora/manifest.webmanifest`
- Service worker: `vistora/sw.js`
- Icon: `vistora/vistora-icon.svg`

No Android Studio or Gradle build is required.

## Run locally

Open `vistora/index.html` in a modern browser. Core HTML/JavaScript behaviour runs locally. The service worker is intentionally not registered for `file://` URLs because browsers only allow service workers on secure origins.

For PWA installation and service-worker caching, serve the `vistora/` directory from HTTPS or localhost. For example, from the repository root:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/vistora/`.

On Android Chrome, open the hosted HTTPS app and use the browser menu's **Install app** or **Add to Home screen** action when offered.

## Offline behaviour

The service worker caches the HTML app shell, manifest, and icon. Navigation requests use network-first with a cached HTML fallback. Remote metadata search and remote fonts still require connectivity; they are optional. The local library remains available using browser local storage.

## Data and moving devices

The app uses the browser's local storage on the current origin/profile. There is no cross-device sync. Use VISTORA's built-in backup/export and restore/import controls before clearing browser data, changing browsers, or moving devices.

The current HTML prototype stores optional provider credentials in local storage. Only enter credentials in a browser/profile you control. Do not commit real API keys into the repository.

## Validate the source

```bash
node vistora/scripts/validate-html.mjs
```

The GitHub workflow validates the HTML/JS entrypoint and uploads a copy of the static web app as a workflow artifact. There is no APK build target.
