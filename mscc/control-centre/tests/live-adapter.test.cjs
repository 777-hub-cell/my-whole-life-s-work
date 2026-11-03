const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'live-adapter.js'), 'utf8');

function makeAdapter(options = {}) {
  const calls = [];
  const meta = { content: options.csrfToken || '' };
  const events = [];
  const timerDelays = [];
  const ctx = {
    NIGHT: {
      ApiError: class ApiError extends Error {
        constructor(code, message, status, details) { super(message); this.name = 'ApiError'; this.code = code; this.status = status; this.details = details || null; }
      },
      MockAdapter: {}
    },
    NIGHT_CONFIG: {
      adapter: 'live', apiBase: options.apiBase || '/api', apiTimeoutMs: 1000,
      requireCsrf: options.requireCsrf !== false
    },
    window: {
      location: { origin: 'https://night.example' },
      dispatchEvent: (event) => events.push(event.type)
    },
    document: {
      querySelector: (selector) => selector === 'meta[name="csrf-token"]' ? meta : null,
      body: { setAttribute() {} }
    },
    URL, URLSearchParams, AbortController, Event, FormData: class FakeFormData {
      constructor() { this.entries = []; }
      append(...args) { this.entries.push(args); }
    },
    setTimeout: (fn, ms) => { timerDelays.push(ms); return setTimeout(fn, ms); }, clearTimeout,
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      if (options.fetch) return options.fetch(url, init);
      return { ok: true, status: 200, json: async () => ({ ok: true, data: options.data === undefined ? { accepted: true } : options.data }) };
    }
  };
  vm.runInNewContext(source, ctx, { filename: 'live-adapter.js' });
  return { api: ctx.NIGHT.LiveAdapter, calls, meta, events, timerDelays, ctx };
}

test('safe GET uses the configured same-origin API base and no CSRF token', async () => {
  const { api, calls } = makeAdapter({ apiBase: '/control/api' });
  const result = await api.listAccounts();
  assert.deepEqual(result, { accepted: true });
  assert.equal(calls[0].url, 'https://night.example/control/api/accounts');
  assert.equal(calls[0].init.credentials, 'same-origin');
  assert.equal(calls[0].init.cache, 'no-store');
  assert.equal(calls[0].init.headers['X-CSRF-Token'], undefined);
});

test('state-changing requests fail closed if the server did not provide a CSRF token', async () => {
  const { api, calls } = makeAdapter();
  await assert.rejects(api.toggleModule('mdl_ping', false), (error) => error.code === 'CSRF_TOKEN_MISSING' && error.status === 403);
  assert.equal(calls.length, 0);
});

test('state-changing requests include the server-issued CSRF token', async () => {
  const { api, calls } = makeAdapter({ csrfToken: 'test-csrf-token' });
  await api.toggleModule('mdl_ping', false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.headers['X-CSRF-Token'], 'test-csrf-token');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
  assert.equal(calls[0].init.body, JSON.stringify({ enabled: false }));
});

test('pairing and re-pairing use longer request timeouts', async () => {
  const { api, calls, timerDelays } = makeAdapter({ csrfToken: 'csrf' });
  await api.pairAccount('B', 'code', '+2348000000000');
  await api.repairAccount('B', 'qr');
  assert.equal(calls.length, 2);
  assert.deepEqual(timerDelays, [35000, 35000]);
  assert.equal(calls[0].init.body, JSON.stringify({ method: 'code', phone: '+2348000000000' }));
  assert.equal(calls[1].init.body, JSON.stringify({ confirm: true, method: 'qr' }));
});

test('account numbers and email environment values are redacted', async () => {
  const { api } = makeAdapter({ data: [
    { key: 'ACCOUNT_A_NUMBER', value: '2348000000001', configured: true },
    { key: 'MSCC_MEGA_EMAIL', value: 'private@example.com', configured: true },
    { key: 'MESSAGE_TTL_HOURS', value: '48' }
  ] });
  const rows = await api.listEnv();
  assert.equal(rows[0].value, null);
  assert.equal(rows[0].isSecret, true);
  assert.equal(rows[1].value, null);
  assert.equal(rows[1].isSecret, true);
  assert.equal(rows[2].value, '48');
});

test('explicit storage refresh is a CSRF-protected POST', async () => {
  const { api, calls } = makeAdapter({ csrfToken: 'storage-csrf' });
  await api.refreshStorage();
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/storage\/refresh$/);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['X-CSRF-Token'], 'storage-csrf');
  assert.equal(calls[0].init.body, '{}');
});

test('API URL validation rejects protocol-relative, traversal and off-origin paths', async () => {
  const { api, calls } = makeAdapter();
  for (const value of ['//evil.example/x', '/../../admin', '/%2e%2e/admin', 'https://evil.example/api']) {
    await assert.rejects(api.request('GET', value), (error) => error.code === 'INVALID_API_PATH');
  }
  assert.equal(calls.length, 0);
});

test('404 endpoints are reported as not implemented, even when the response is HTML', async () => {
  const { api } = makeAdapter({ fetch: async () => ({ ok: false, status: 404, json: async () => { throw new Error('not JSON'); } }) });
  await assert.rejects(api.getOverview(), (error) => error.code === 'NOT_IMPLEMENTED' && error.status === 404);
});

test('401 from protected endpoints signals the app to return to the sign-in gate', async () => {
  const { api, events } = makeAdapter({ fetch: async () => ({ ok: false, status: 401, json: async () => ({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } }) }) });
  await assert.rejects(api.listAccounts());
  assert.deepEqual(events, ['night:unauthorized']);
});

test('environment listing strips secret values and filters malformed entries', async () => {
  const { api } = makeAdapter({ data: [
    { key: 'GROQ_API_KEY', value: 'should-never-reach-the-ui', configured: true },
    { key: 'BOT_NAME', value: 'NIGHT' },
    null
  ] });
  const rows = await api.listEnv();
  assert.equal(rows.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(rows[0])), { key: 'GROQ_API_KEY', isSecret: true, configured: true, value: null });
  assert.equal(rows[1].value, 'NIGHT');
});

test('secret update response is reduced to metadata', async () => {
  const { api } = makeAdapter({ csrfToken: 'csrf', data: { key: 'GROQ_API_KEY', value: 'echoed-secret', configured: true } });
  const row = await api.setEnv('GROQ_API_KEY', 'new-secret');
  assert.deepEqual(JSON.parse(JSON.stringify(row)), { key: 'GROQ_API_KEY', isSecret: true, configured: true, value: null });
});

test('multipart upload keeps the browser-generated content type boundary', async () => {
  const { api, calls } = makeAdapter({ csrfToken: 'csrf' });
  await api.uploadFiles([{ name: 'test.txt', size: 5 }], '/home/mscc');
  assert.equal(calls[0].init.headers['Content-Type'], undefined);
  assert.equal(calls[0].init.headers['X-CSRF-Token'], 'csrf');
  assert.ok(calls[0].init.body instanceof Object);
});

test('session fetch stores the server-issued token for subsequent writes', async () => {
  const { api, calls, meta } = makeAdapter({ data: { authenticated: true, csrfToken: 'new-token' } });
  const result = await api.getSession();
  assert.equal(result.authenticated, true);
  assert.equal(meta.content, 'new-token');
  assert.equal(calls[0].init.method, 'GET');
});


test('login/logout rotate the CSRF token and do not persist credentials in the client', async () => {
  const results = [
    { authenticated: true, csrfToken: 'after-login' },
    { authenticated: false, csrfToken: 'after-logout' }
  ];
  const { api, calls, meta } = makeAdapter({ csrfToken: 'before-login', fetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: results.shift() }) }) });
  const login = await api.login('temporary-password');
  assert.equal(login.authenticated, true);
  assert.equal(meta.content, 'after-login');
  assert.equal(calls[0].url, 'https://night.example/api/auth/login');
  assert.equal(calls[0].init.headers['X-CSRF-Token'], 'before-login');
  assert.equal(calls[0].init.body, JSON.stringify({ password: 'temporary-password' }));
  const logout = await api.logout();
  assert.equal(logout.authenticated, false);
  assert.equal(meta.content, 'after-logout');
  assert.equal(calls[1].init.headers['X-CSRF-Token'], 'after-login');
});
