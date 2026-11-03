import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createControlCentreServer } from '../server.mjs';

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
}
async function close(server) {
  if (!server.listening) return;
  await new Promise((resolve) => server.close(resolve));
}

 test('serves the website and health check in mock mode without exposing arbitrary files', async (t) => {
  const app = createControlCentreServer({ upstreamValue: '' });
  const base = await listen(app);
  t.after(() => close(app));

  const page = await fetch(base + '/');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /NIGHT Control Centre/);
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  assert.match(page.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);

  const health = await fetch(base + '/healthz');
  assert.deepEqual(await health.json(), { ok: true, service: 'night-control-centre', mode: 'mock' });

  const runtime = await fetch(base + '/runtime-config.js');
  assert.match(await runtime.text(), /window\.MSCC_CONTROL_CENTRE_BOOTSTRAP = \{\}/);

  const privateFile = await fetch(base + '/package.json');
  assert.equal(privateFile.status, 404);

  const api = await fetch(base + '/api/control-centre/auth/session');
  assert.equal(api.status, 503);
  assert.equal((await api.json()).error.code, 'API_NOT_CONFIGURED');
});

test('proxies only the fixed API origin and preserves same-origin browser context', async (t) => {
  let seen;
  const upstream = createServer((req, res) => {
    seen = {
      url: req.url,
      host: req.headers.host,
      forwardedHost: req.headers['x-forwarded-host'],
      forwardedProto: req.headers['x-forwarded-proto'],
      origin: req.headers.origin,
      cookie: req.headers.cookie,
      csrf: req.headers['x-csrf-token'],
      accessId: req.headers['cf-access-client-id'],
      accessSecret: req.headers['cf-access-client-secret'],
      ngrokSkipWarning: req.headers['ngrok-skip-browser-warning'],
    };
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'set-cookie': ['night_cc_session=sample; Path=/api/control-centre; HttpOnly; Secure; SameSite=Strict'],
    });
    res.end(JSON.stringify({ ok: true, path: req.url }));
  });
  const upstreamBase = await listen(upstream);
  t.after(() => close(upstream));

  const app = createControlCentreServer({
    upstreamValue: upstreamBase,
    accessClientId: 'test-client-id',
    accessClientSecret: 'test-client-secret',
  });
  const base = await listen(app);
  t.after(() => close(app));

  const response = await fetch(base + '/api/control-centre/auth/session?fresh=1', {
    headers: {
      Origin: 'https://night.apps.bot-hosting.cloud',
      Cookie: 'night_cc_session=abc',
      'X-CSRF-Token': 'token-123',
    },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('set-cookie').includes('night_cc_session=sample'), true);
  assert.deepEqual(await response.json(), { ok: true, path: '/api/control-centre/auth/session?fresh=1' });
  assert.equal(seen.forwardedHost, '127.0.0.1:' + app.address().port);
  assert.equal(seen.forwardedProto, 'https');
  assert.equal(seen.origin, 'https://night.apps.bot-hosting.cloud');
  assert.equal(seen.cookie, 'night_cc_session=abc');
  assert.equal(seen.csrf, 'token-123');
  assert.equal(seen.accessId, 'test-client-id');
  assert.equal(seen.accessSecret, 'test-client-secret');
  assert.equal(seen.ngrokSkipWarning, '1');
});

test('rejects public plaintext API upstreams and incomplete access-token pairs', () => {
  assert.throws(() => createControlCentreServer({ upstreamValue: 'http://example.com' }), /Plain HTTP is allowed only/);
  assert.throws(() => createControlCentreServer({ accessClientId: 'client-only' }), /Set both/);
});
