const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createServer } = require('node:net');
const path = require('node:path');

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForServer(url, child) {
  for (let i = 0; i < 40; i++) {
    if (child.exitCode !== null) throw new Error('Preview server exited before becoming ready.');
    try { return await fetch(url); } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  throw new Error('Preview server did not become ready.');
}

test('static preview serves UI with baseline security headers and no live API', async (t) => {
  const port = await freePort();
  const child = spawn(process.execPath, ['tools/serve.mjs'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, HOST: '0.0.0.0', PORT: String(port) },
    stdio: ['ignore', 'ignore', 'pipe']
  });
  t.after(() => { if (child.exitCode === null) child.kill('SIGTERM'); });

  const base = `http://127.0.0.1:${port}`;
  const html = await waitForServer(base + '/', child);
  assert.equal(html.status, 200);
  assert.match(html.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);
  assert.equal(html.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(html.headers.get('x-frame-options'), 'DENY');
  assert.match(await html.text(), /NIGHT Control Centre/);

  const api = await fetch(base + '/api/accounts');
  assert.equal(api.status, 404);
  const body = await api.json();
  assert.equal(body.error.code, 'STATIC_PREVIEW_ONLY');

  const docs = await fetch(base + '/docs/SECURITY-AND-DEPLOYMENT.md');
  assert.equal(docs.status, 404);
  const packageFile = await fetch(base + '/package.json');
  assert.equal(packageFile.status, 404);

  const post = await fetch(base + '/index.html', { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET, HEAD');
});
