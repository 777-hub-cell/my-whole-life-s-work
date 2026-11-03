import { createServer as createHttpServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isIP } from 'node:net';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MAX_PROXY_BODY = 64 * 1024;
const API_PREFIX = '/api/control-centre';
const TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.txt', 'text/plain; charset=utf-8'],
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
  "font-src 'self' data:",
].join('; ');
const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade',
]);

function isPrivateHost(hostname) {
  const host = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1') return true;
  const version = isIP(host);
  if (version === 4) {
    const octets = host.split('.').map(Number);
    return octets[0] === 10 ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168) ||
      octets[0] === 127;
  }
  if (version === 6) return host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:');
  return false;
}

function parseUpstream(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  let url;
  try { url = new URL(raw); }
  catch { throw new Error('NIGHT_API_UPSTREAM must be a valid HTTPS URL.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('NIGHT_API_UPSTREAM must be an origin URL without credentials, a path, query or fragment.');
  }
  if (url.protocol === 'http:' && !isPrivateHost(url.hostname)) {
    throw new Error('Plain HTTP is allowed only for localhost or a private IP. Use HTTPS for a public tunnel.');
  }
  return url;
}

function baseHeaders(res) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Cache-Control', 'no-store');
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function runtimeConfig(upstreamConfigured) {
  if (!upstreamConfigured) {
    return `// Safe preview mode. No live bot API has been configured.\nwindow.MSCC_CONTROL_CENTRE_BOOTSTRAP = {};\n`;
  }
  return `// Live mode is enabled only when the server-side API upstream is configured.\nwindow.MSCC_CONTROL_CENTRE_BOOTSTRAP = {\n  adapter: 'live',\n  apiBase: '/api/control-centre',\n  apiTimeoutMs: 15000,\n  requireCsrf: true,\n  capabilities: {\n    filesReadOnly: true, filesWrite: false, envWrite: false,\n    profilesWrite: false, profileCapabilities: false, accountOverrides: false,\n    moduleToggle: true, settingsEditor: true\n  }\n};\n`;
}

function proxyApi(req, res, upstream, accessClientId, accessClientSecret) {
  const method = String(req.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    res.writeHead(405, { Allow: 'GET, HEAD, POST, PUT, PATCH, DELETE', 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Method not allowed');
  }
  const declaredLength = Number(req.headers['content-length'] || 0);
  if (declaredLength > MAX_PROXY_BODY) {
    return json(res, 413, { ok: false, error: { code: 'BODY_TOO_LARGE', message: 'The request is too large.' } });
  }

  const incoming = new URL(req.url || '/', 'http://website.local');
  const target = new URL(upstream);
  target.pathname = incoming.pathname;
  target.search = incoming.search;
  const headers = {};
  for (const name of ['accept', 'content-type', 'content-length', 'cookie', 'origin', 'x-requested-with', 'x-csrf-token', 'user-agent']) {
    if (req.headers[name] !== undefined) headers[name] = req.headers[name];
  }
  // Keep the browser's website origin visible to MSCC for its same-origin and
  // Secure-cookie checks. Host remains the upstream tunnel hostname.
  headers['x-forwarded-host'] = String(req.headers.host || '').split(',')[0].trim();
  headers['x-forwarded-proto'] = 'https'; // Bot-Hosting's public app URL terminates HTTPS at its edge.
  // ngrok's free endpoint shows an HTML interstitial to browser User-Agents unless this proxy-generated header is present.
  headers['ngrok-skip-browser-warning'] = '1';
  if (req.socket?.remoteAddress) headers['x-real-ip'] = req.socket.remoteAddress;
  if (accessClientId || accessClientSecret) {
    if (!accessClientId || !accessClientSecret) {
      return json(res, 503, { ok: false, error: { code: 'PROXY_AUTH_CONFIG', message: 'Both API access credentials must be configured on the website host.' } });
    }
    headers['cf-access-client-id'] = accessClientId;
    headers['cf-access-client-secret'] = accessClientSecret;
  }

  const transport = target.protocol === 'https:' ? httpsRequest : httpRequest;
  const upstreamRequest = transport(target, { method, headers, timeout: 40000 }, (upstreamResponse) => {
    const responseHeaders = {};
    for (const [name, value] of Object.entries(upstreamResponse.headers)) {
      if (HOP_BY_HOP.has(name.toLowerCase()) || value === undefined) continue;
      responseHeaders[name] = value;
    }
    responseHeaders['cache-control'] = 'no-store';
    res.writeHead(upstreamResponse.statusCode || 502, responseHeaders);
    upstreamResponse.pipe(res);
  });

  let bodyBytes = 0;
  req.on('data', (chunk) => {
    bodyBytes += chunk.length;
    if (bodyBytes > MAX_PROXY_BODY) {
      upstreamRequest.destroy(new Error('Request body too large'));
      if (!res.headersSent) json(res, 413, { ok: false, error: { code: 'BODY_TOO_LARGE', message: 'The request is too large.' } });
    }
  });
  upstreamRequest.on('timeout', () => upstreamRequest.destroy(new Error('API upstream timed out')));
  upstreamRequest.on('error', () => {
    if (!res.headersSent) json(res, 502, { ok: false, error: { code: 'API_UPSTREAM_UNAVAILABLE', message: 'The bot API is temporarily unavailable.' } });
    else res.destroy();
  });
  res.on('close', () => { if (!upstreamRequest.destroyed) upstreamRequest.destroy(); });
  req.pipe(upstreamRequest);
}

export function createControlCentreServer({
  root = ROOT,
  upstreamValue = process.env.NIGHT_API_UPSTREAM || '',
  accessClientId = process.env.NIGHT_API_ACCESS_CLIENT_ID || '',
  accessClientSecret = process.env.NIGHT_API_ACCESS_CLIENT_SECRET || '',
} = {}) {
  const contentRoot = path.resolve(root);
  const upstream = parseUpstream(upstreamValue);
  if (Boolean(accessClientId) !== Boolean(accessClientSecret)) {
    throw new Error('Set both NIGHT_API_ACCESS_CLIENT_ID and NIGHT_API_ACCESS_CLIENT_SECRET, or neither.');
  }

  return createHttpServer(async (req, res) => {
    baseHeaders(res);
    const method = String(req.method || 'GET').toUpperCase();
    if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      res.writeHead(405, { Allow: 'GET, HEAD, POST, PUT, PATCH, DELETE', 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Method not allowed');
    }

    let pathname;
    let query = '';
    try {
      const parsed = new URL(req.url || '/', 'http://website.local');
      pathname = decodeURIComponent(parsed.pathname);
      query = parsed.search;
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Bad request');
    }
    if (pathname.includes('\0') || pathname.startsWith('//') || pathname.includes('\\')) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Bad request');
    }

    if (pathname === '/healthz' && (method === 'GET' || method === 'HEAD')) {
      return json(res, 200, { ok: true, service: 'night-control-centre', mode: upstream ? 'live' : 'mock' });
    }

    if (pathname === API_PREFIX || pathname.startsWith(API_PREFIX + '/')) {
      if (!upstream) {
        return json(res, 503, { ok: false, error: { code: 'API_NOT_CONFIGURED', message: 'The website is running in preview mode. Configure the secured Azure API upstream to connect NIGHT.' } });
      }
      req.url = pathname + query;
      return proxyApi(req, res, upstream, accessClientId, accessClientSecret);
    }

    if (method !== 'GET' && method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Method not allowed');
    }
    if (pathname === '/runtime-config.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      return res.end(runtimeConfig(Boolean(upstream)));
    }
    if (pathname === '/') pathname = '/index.html';
    const publicAsset = pathname === '/index.html' ||
      (pathname === '/favicon.ico') ||
      (pathname.startsWith('/css/') && pathname.endsWith('.css')) ||
      (pathname.startsWith('/js/') && /\.(?:js|mjs)$/.test(pathname));
    if (!publicAsset) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }

    const candidate = path.resolve(contentRoot, '.' + pathname);
    if (candidate !== contentRoot && !candidate.startsWith(contentRoot + path.sep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Forbidden');
    }
    try {
      const actual = await fs.realpath(candidate);
      if (actual !== contentRoot && !actual.startsWith(contentRoot + path.sep)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Forbidden');
      }
      const stat = await fs.stat(actual);
      if (!stat.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Not found');
      }
      res.writeHead(200, {
        'Content-Type': TYPES.get(path.extname(actual).toLowerCase()) || 'application/octet-stream',
        'Content-Length': stat.size,
      });
      if (method === 'HEAD') return res.end();
      createReadStream(actual).pipe(res);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    }
  });
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const port = Number(process.env.SERVER_PORT || process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SERVER_PORT/PORT must be a valid TCP port.');
  const server = createControlCentreServer();
  server.listen(port, '0.0.0.0', () => {
    const mode = process.env.NIGHT_API_UPSTREAM ? 'live API proxy configured' : 'preview mode (mock data)';
    process.stdout.write(`NIGHT Control Centre listening on 0.0.0.0:${port} — ${mode}\n`);
  });
}
