# NIGHT Social Chromium browser lab

This folder contains a repeatable Chromium inspection of the public X reference and the deployed NIGHT Social site.

## What it does

- Opens `https://x.com/home` and `https://night-social.vercel.app/`.
- Captures mobile (390 × 844) and desktop (1440 × 960) screenshots.
- Records document HTTP status, page title, final URL, console/page errors, and failed requests.
- Saves screenshots and a JSON inspection report as a GitHub Actions artifact.

## Run it

The GitHub Actions workflow is **NIGHT Social — Chromium Reference Lab**. It runs on a push to the browser-lab files in the existing Night Social feature branch, and can be run again manually from Actions.

## Privacy and access

The browser is intentionally unauthenticated. It does not import a personal X session, passwords, cookies, or local browser storage. X may show a sign-in wall or restrict GitHub-hosted automation; that outcome is recorded rather than bypassed. Use screenshots only for interface reference, not redistribution of X content.

## Important

This workflow inspects the live websites; it does not deploy or modify the Vercel site. NIGHT Social remains on its existing production deployment.
