# Shared ngrok router

This router is a separate host-level service, not part of the Aharane bot process.

It listens on 127.0.0.1:8786 and preserves existing routing:

- All ordinary requests are forwarded to NIGHT's existing listener at 127.0.0.1:8787.
- /aharane/api/* is forwarded to Aharane at 127.0.0.1:8790.
- WebSocket upgrades at /aharane/ws are forwarded to Aharane's /ws endpoint on port 8790.
- Other /aharane/* paths are rejected.

The ngrok endpoint must target 127.0.0.1:8786 rather than 8787 once this router version is installed. Root traffic still reaches NIGHT through the router. Never point the public tunnel directly at Aharane's port 8790.

The existing systemd service is expected to execute:

    ExecStart=/usr/bin/node /usr/local/libexec/aharane-ngrok-router.mjs

After copying this file into that path, restart aharane-ngrok-router.service. Then update the ngrok endpoint address to 127.0.0.1:8786 and verify the public root still returns NIGHT's Control Centre while /aharane/api/status can reach the Aharane API through the authenticated Vercel proxy.

The router itself does not authenticate Aharane requests. Aharane continues to enforce its admin bearer token at the API and WebSocket endpoints.
