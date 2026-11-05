import { createServer } from 'node:http';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = await fs.realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
// This unauthenticated preview is deliberately loopback-only. Use a real authenticated
// reverse proxy/application server for any network-accessible deployment.
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT || 4173);
const TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'], ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'], ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'], ['.ico', 'image/x-icon'], ['.txt', 'text/plain; charset=utf-8']
]);
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "script-src 'self' https://cdnjs.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:"
].join('; ');

function headers(res) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Cache-Control', 'no-store');
}

const server = createServer(async (req, res) => {
  headers(res);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Method not allowed');
  }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname); }
  catch { res.writeHead(400); return res.end('Bad request'); }
  if (pathname.includes('\0') || pathname.startsWith('//')) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Bad request');
  }
  if (pathname.startsWith('/api/')) {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ ok: false, error: { code: 'STATIC_PREVIEW_ONLY', message: 'This preview server has no live API. Run the application in mock mode.' } }));
  }
  if (pathname === '/') pathname = '/index.html';
  const publicAsset = pathname === '/index.html' || (pathname.startsWith('/css/') && pathname.endsWith('.css')) || (pathname.startsWith('/js/') && /\.(?:js|mjs)$/.test(pathname));
  if (!publicAsset) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Not found'); }
  const candidate = path.resolve(ROOT, '.' + pathname);
  if (candidate !== ROOT && !candidate.startsWith(ROOT + path.sep)) {
    res.writeHead(403); return res.end('Forbidden');
  }
  try {
    const actual = await fs.realpath(candidate);
    if (actual !== ROOT && !actual.startsWith(ROOT + path.sep)) {
      res.writeHead(403); return res.end('Forbidden');
    }
    const stat = await fs.stat(actual);
    if (!stat.isFile()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, {
      'Content-Type': TYPES.get(path.extname(actual).toLowerCase()) || 'application/octet-stream',
      'Content-Length': stat.size
    });
    if (req.method === 'HEAD') return res.end();
    createReadStream(actual).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`NIGHT Control Centre static preview at http://${HOST}:${PORT}\n`);
});
