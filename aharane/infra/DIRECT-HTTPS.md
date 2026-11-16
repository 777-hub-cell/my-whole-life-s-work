# Direct HTTPS setup for Aharane Local Studio

Aharane Local Studio is mounted at `/aharane/studio/` on the existing HTTPS site. Nginx forwards only the `/aharane/` prefix to Aharane at `127.0.0.1:8790`, stripping that prefix before proxying. The app therefore reaches Aharane's internal `/studio/`, `/api/*` and `/ws` routes without occupying Cortex or NIGHT's root paths.

Do not install a second web server. Preserve the existing HTTPS server block, certificate, Cortex route on `/`, and NIGHT route `/api/night-play/rpc`. Add the following locations inside the existing TLS server block (the current host uses `/etc/nginx/sites-enabled/cortex-agent`):

```nginx
# Aharane live WebSocket; exact match keeps the upgrade route isolated.
location = /aharane/ws {
    proxy_pass http://127.0.0.1:8790/ws;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}

# The trailing slash strips only the external /aharane/ prefix.
location ^~ /aharane/ {
    proxy_pass http://127.0.0.1:8790/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_buffering off;
    proxy_request_buffering off;
    proxy_read_timeout 600s;
    proxy_send_timeout 600s;
}
```

Before changing Nginx, back up the site file. Then validate with `sudo nginx -t`; reload only if validation succeeds. Do not edit the existing `location /` or `/api/night-play/rpc` blocks, and do not expose port 8790 publicly.

Open `https://YOUR-EXISTING-HTTPS-HOST/aharane/studio/` in Android Chrome. Install the PWA or choose Add to Home screen. Its API and WebSocket use `/aharane/api/*` and `/aharane/ws` on the same origin. Confirm the TLS certificate is trusted by the phone before installing.

Verify:
- `/aharane/studio/` returns the PWA.
- `/aharane/studio/manifest.webmanifest` returns its manifest with the matching `/aharane/studio/` scope.
- Unauthenticated `/aharane/api/status` returns 401.
- `/api/night-play/rpc` and the existing root application continue to use their original locations.
