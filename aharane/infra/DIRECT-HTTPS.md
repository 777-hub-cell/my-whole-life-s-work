# Direct HTTPS setup for Aharane Local Studio

Aharane serves the PWA at `/studio/`; API and WebSocket share its origin. No Vercel, ngrok or relay is used.

Requirements: a DNS name you control with an A record pointing to the Azure public IP; inbound TCP 80 and 443; and Caddy on Azure. Keep Aharane bound to `127.0.0.1:8790`; never expose 8790 publicly.

Add a new site block to the existing Caddyfile; preserve the existing NIGHT/MSCC blocks:

```caddyfile
aharane.example.com {
    encode zstd gzip
    header {
        X-Content-Type-Options nosniff
        Referrer-Policy no-referrer
        X-Frame-Options DENY
        Strict-Transport-Security "max-age=31536000"
    }
    reverse_proxy 127.0.0.1:8790
}
```

Replace the example hostname with the DNS name pointing at Azure. Caddy obtains HTTPS when public DNS and ports 80/443 are correct. Validate the complete Caddyfile before reloading and preserve NIGHT/MSCC routes. Then open `https://aharane.example.com/studio/` in Android Chrome and install the PWA. Verify `/healthz`, `/studio/`, and `/studio/manifest.webmanifest`; unauthenticated `/api/status` must return 401.