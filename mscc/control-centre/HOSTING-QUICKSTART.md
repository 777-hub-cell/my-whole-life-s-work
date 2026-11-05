# NIGHT Control Centre — quick upload guide

1. Upload this ZIP to a **Node.js** deployment on Bot-Hosting.net.
2. Extract it so `server.mjs` and `package.json` are at the project root.
3. Set startup command to `node server.mjs`.
4. Activate the free HTTPS subdomain in **Domains**.
5. Start the app and open the subdomain.

The first start uses realistic demo data. This is intentional: your Azure bot is not contacted until a protected API tunnel is configured. To connect the real bot later, follow `hosting/README.md` and set the protected tunnel environment variables in the hosting panel. Never put API secrets in the ZIP.
