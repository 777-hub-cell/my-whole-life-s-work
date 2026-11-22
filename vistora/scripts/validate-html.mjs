import { readFile } from 'node:fs/promises';
import { Script } from 'node:vm';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const html = await read('../index.html');
const manifest = JSON.parse(await read('../manifest.webmanifest'));
const worker = await read('../sw.js');

const checks = [
  ['HTML5 document', /^<!doctype html>/i.test(html.trimStart())],
  ['phone viewport', /name=["']viewport["']/i.test(html)],
  ['app screen root', /id=["']screen["']/.test(html)],
  ['bottom navigation root', /id=["']nav["']/.test(html)],
  ['PWA manifest linked', /rel=["']manifest["']/.test(html)],
  ['service worker registration', /serviceWorker.register/.test(html)],
  ['manifest standalone display', manifest.display === 'standalone'],
  ['manifest has start URL and icon', Boolean(manifest.start_url && manifest.icons?.length)],
  ['service worker caches the app shell', /APP_SHELL/.test(worker) && /caches.open/.test(worker)]
];

const inlineScripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter((match) => !/\bsrc\s*=/.test(match[1]))
  .map((match) => match[2].trim())
  .filter(Boolean);

for (let i = 0; i < inlineScripts.length; i += 1) {
  new Script(inlineScripts[i], { filename: `vistora-inline-${i + 1}.js` });
}
new Script(worker, { filename: 'vistora/sw.js' });

for (const [label, passed] of checks) {
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}`);
}
if (checks.some(([, passed]) => !passed)) process.exit(1);
console.log(`PASS  parsed ${inlineScripts.length} inline JavaScript block(s)`);
