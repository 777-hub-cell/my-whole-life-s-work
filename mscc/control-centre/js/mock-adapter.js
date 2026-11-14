NIGHT.MockAdapter = (function () {
  const U = NIGHT.util;
  const now = Date.now();
  const mins = (m) => now - m * 60000;

  const params = new URLSearchParams(location.search);
  if (params.get('fresh') === '1') localStorage.setItem('night.mock.seed', 'false');
  const shouldSeed = localStorage.getItem('night.mock.seed') !== 'false';

  let profiles = shouldSeed ? [
    { id: 'prf_support', name: 'Support Desk', description: 'First-line customer responses, order lookups, escalation routing.', color: '#7cc4fa', modules: 8, createdAt: mins(60 * 24 * 71) },
    { id: 'prf_community', name: 'Community', description: 'Group moderation, welcome flows, anti-link, member tooling.', color: '#4ade80', modules: 11, createdAt: mins(60 * 24 * 55) },
    { id: 'prf_broadcast', name: 'Broadcast', description: 'Outbound campaigns with rate limiting and delivery receipts.', color: '#b79cff', modules: 5, createdAt: mins(60 * 24 * 33) },
    { id: 'prf_silent', name: 'Silent Watch', description: 'Read-only monitoring profile. No outbound messages permitted.', color: '#f5b942', modules: 3, createdAt: mins(60 * 24 * 12) }
  ] : [];

  let accounts = shouldSeed ? [
    { id: 'acc_01', name: 'Atlas', phone: '+44 7•• ••• 4218', profileId: 'prf_support', status: 'online', lastSeen: mins(0.4), createdAt: mins(60 * 24 * 64), session: 'sess_a91f', messages24h: 1284, pairStarted: true },
    { id: 'acc_02', name: 'Beacon', phone: '+1 415 ••• 9920', profileId: 'prf_community', status: 'online', lastSeen: mins(1.2), createdAt: mins(60 * 24 * 58), session: 'sess_b22c', messages24h: 2410, pairStarted: true },
    { id: 'acc_03', name: 'Cinder', phone: '+61 4•• ••• 771', profileId: 'prf_broadcast', status: 'pairing', lastSeen: mins(3), createdAt: mins(60 * 24 * 2), session: 'sess_c33d', messages24h: 0, pairStarted: false },
    { id: 'acc_04', name: 'Delta', phone: '+49 15• ••• 338', profileId: 'prf_support', status: 'online', lastSeen: mins(0.9), createdAt: mins(60 * 24 * 41), session: 'sess_d44e', messages24h: 876, pairStarted: true },
    { id: 'acc_05', name: 'Ember', phone: '+234 80• ••• 114', profileId: 'prf_community', status: 'offline', lastSeen: mins(184), createdAt: mins(60 * 24 * 29), session: 'sess_e55f', messages24h: 0, pairStarted: true },
    { id: 'acc_06', name: 'Falcon', phone: '+91 98• ••• 552', profileId: 'prf_broadcast', status: 'attention', lastSeen: mins(42), createdAt: mins(60 * 24 * 22), session: 'sess_f66a', messages24h: 118, pairStarted: true },
    { id: 'acc_07', name: 'Garnet', phone: '+27 8•• ••• 903', profileId: 'prf_support', status: 'online', lastSeen: mins(0.2), createdAt: mins(60 * 24 * 18), session: 'sess_g77b', messages24h: 1652, pairStarted: true },
    { id: 'acc_08', name: 'Harbor', phone: '+1 646 ••• 2271', profileId: 'prf_community', status: 'offline', lastSeen: mins(521), createdAt: mins(60 * 24 * 9), session: 'sess_h88c', messages24h: 0, pairStarted: true }
  ] : [];

  const modules = [
    { id: 'mdl_ping', name: 'ping', category: 'Core', description: 'Latency probe for the bot process.', enabled: true },
    { id: 'mdl_help', name: 'help', category: 'Core', description: 'Dynamic command index generated from loaded modules.', enabled: true },
    { id: 'mdl_uptime', name: 'uptime', category: 'Core', description: 'Reports process uptime and memory footprint.', enabled: true },
    { id: 'mdl_sticker', name: 'sticker', category: 'Media', description: 'Converts images and short video to WebP stickers.', enabled: true },
    { id: 'mdl_downloader', name: 'downloader', category: 'Media', description: 'Fetches media from supported link providers.', enabled: true },
    { id: 'mdl_antilink', name: 'antilink', category: 'Moderation', description: 'Removes group invite links from member messages.', enabled: true },
    { id: 'mdl_welcome', name: 'welcome', category: 'Groups', description: 'Greets new group participants with a templated message.', enabled: true },
    { id: 'mdl_goodbye', name: 'goodbye', category: 'Groups', description: 'Posts a farewell when a participant leaves.', enabled: false },
    { id: 'mdl_autoreply', name: 'autoreply', category: 'Messaging', description: 'Keyword-triggered automatic replies outside business hours.', enabled: true },
    { id: 'mdl_scheduler', name: 'scheduler', category: 'Messaging', description: 'Queues messages for future delivery per account.', enabled: false },
    { id: 'mdl_broadcast', name: 'broadcast', category: 'Messaging', description: 'Rate-limited outbound campaign engine.', enabled: true },
    { id: 'mdl_moderation', name: 'moderation', category: 'Moderation', description: 'Warn, mute and remove actions for group admins.', enabled: true }
  ];

  const seedActivity = [
    ['success', 'Account paired', 'Session established for Beacon after QR scan.', 'acc_02', 'gateway'],
    ['info', 'Message batch dispatched', '247 outbound messages processed across 3 accounts.', null, 'broadcast'],
    ['warning', 'Reconnect attempt 2/3', 'Falcon dropped its socket; backoff retry in progress.', 'acc_06', 'gateway'],
    ['success', 'Profile assigned', 'Delta now runs the Support Desk profile.', 'acc_04', 'profiles'],
    ['error', 'Session revoked', 'Ember was disconnected remotely by the device owner.', 'acc_05', 'gateway'],
    ['info', 'Module toggled', 'scheduler disabled by operator.', null, 'modules'],
    ['success', 'Diagnostics completed', '6 checks run, 1 warning reported.', null, 'diagnostics'],
    ['info', 'Command executed', '!sticker returned a 42 KB asset in 610 ms.', 'acc_01', 'commands'],
    ['warning', 'Rate limit approaching', 'Broadcast queue at 82% of the hourly allowance.', 'acc_06', 'broadcast'],
    ['success', 'Backup uploaded', 'Session archive written to cloud storage (18.4 MB).', null, 'storage'],
    ['info', 'Operator login', 'Console session opened from a new browser.', null, 'console'],
    ['success', 'Account renamed', 'Formerly "Unit-07", now "Garnet".', 'acc_07', 'accounts'],
    ['info', 'Queue drained', 'Scheduled messages for Atlas delivered successfully.', 'acc_01', 'scheduler'],
    ['warning', 'High memory usage', 'Node heap reached 78% of the configured limit.', null, 'system'],
    ['error', 'Media download failed', 'Provider returned HTTP 403 for the requested asset.', 'acc_04', 'commands'],
    ['info', 'Profile created', 'Silent Watch profile added by operator.', null, 'profiles'],
    ['success', 'Account repaired', 'Local session store rebuilt, handshake succeeded.', 'acc_02', 'accounts'],
    ['info', 'Presence update', 'Beacon marked available to contacts.', 'acc_02', 'gateway'],
    ['warning', 'Disk usage at 81%', 'Session archives are consuming 12.6 GB.', null, 'system'],
    ['success', 'Account created', 'Cinder added to the fleet and awaiting pairing.', 'acc_03', 'accounts']
  ];

  let activity = shouldSeed ? seedActivity.map((row, i) => ({
    id: 'evt_' + String(1000 + i),
    ts: mins(i * 7 + U.rand(1, 5)),
    severity: row[0], title: row[1], detail: row[2],
    accountId: row[3], source: row[4]
  })) : [];

  const storageFiles = shouldSeed ? [
    { id: 'f1', name: 'session-atlas-2024-06.zip', size: 19327352, type: 'archive', modified: mins(64) },
    { id: 'f2', name: 'session-beacon-2024-06.zip', size: 21810380, type: 'archive', modified: mins(96) },
    { id: 'f3', name: 'broadcast-audience-june.csv', size: 1048576, type: 'dataset', modified: mins(320) },
    { id: 'f4', name: 'sticker-pack-01.webp', size: 421888, type: 'media', modified: mins(640) },
    { id: 'f5', name: 'diagnostics-export.json', size: 184320, type: 'report', modified: mins(1200) },
    { id: 'f6', name: 'night-cc-backup.tar.gz', size: 734003200, type: 'archive', modified: mins(2600) },
    { id: 'f7', name: 'message-archive-2024-Q1.jsonl', size: 268435456, type: 'dataset', modified: mins(4300) },
    { id: 'f8', name: 'profile-assets.zip', size: 9437184, type: 'archive', modified: mins(6100) }
  ] : [];

  const defaultSettings = {
    botName: 'NIGHT', prefix: '!', timezone: 'UTC',
    autoReconnect: true, readReceipts: true, presenceUpdates: true, autoResponder: false,
    retentionDays: '30', notifyErrors: true, notifyDailyDigest: false, notifyStorage: true
  };

  /* ---------- Mock file system ---------- */
  function logBlock(prefix, count) {
    const levels = ['INFO', 'WARN', 'ERROR', 'DEBUG'];
    const sources = ['bot', 'gateway', 'scheduler', 'db', 'broadcast', 'queue'];
    const lines = [];
    const start = Date.now() - count * 5000;
    for (let i = 0; i < count; i++) {
      const r = Math.random();
      const level = r < 0.05 ? 'ERROR' : r < 0.18 ? 'WARN' : r < 0.9 ? 'INFO' : 'DEBUG';
      const src = sources[Math.floor(Math.random() * sources.length)];
      const msg = ({
        INFO: ['Message batch processed (n=' + (U.rand(5, 90)) + ')', 'Session established for account', 'Heartbeat sent to gateway', 'Command !ping handled in ' + U.rand(14, 80) + 'ms', 'Scheduled job executed', 'Connection pool stats: ' + U.rand(1, 8) + '/10 active', 'Inbound message received', 'Outbound message sent', 'Reconnect attempt succeeded', 'Configuration reloaded'],
        WARN: ['Rate limit at ' + U.rand(70, 95) + '% of hourly quota', 'Slow database query (' + U.rand(400, 1800) + 'ms)', 'Reconnect attempt ' + U.rand(1, 3) + '/3', 'Memory usage above 75%', 'Event loop lag ' + U.rand(20, 90) + 'ms', 'Message delivery delayed'],
        ERROR: ['Session revoked remotely', 'Failed to send message (HTTP 403)', 'Database connection timeout', 'Uncaught exception in handler', 'Media download failed'],
        DEBUG: ['Cache hit for key profile:prf_support', 'Parsed incoming message payload', 'Enqueued outbound message', 'Releasing DB connection']
      })[level][Math.floor(Math.random() * 4)];
      const ts = new Date(start + i * 5000).toISOString().replace('T', ' ').slice(0, 19);
      lines.push('[' + ts + '] [' + prefix + '] [' + level + '] [' + src + '] ' + msg);
    }
    return lines.join('\n');
  }

  let mockFsTree = {
    name: 'mscc', path: '/home/mscc', type: 'folder', children: [
      {
        name: 'app', path: '/home/mscc/app', type: 'folder', children: [
          {
            name: 'src', path: '/home/mscc/app/src', type: 'folder', children: [
              {
                name: 'index.js', path: '/home/mscc/app/src/index.js', type: 'file', size: 4520, modified: mins(60), content:
                  '// NIGHT Bot — entry point\n' +
                  'const express = require("express");\n' +
                  'const { Client } = require("@whiskeysockets/baileys");\n' +
                  'const config = require("./config");\n\n' +
                  'async function main() {\n' +
                  '  const app = express();\n' +
                  '  app.use(express.json());\n\n' +
                  '  app.get("/api/health", (req, res) => {\n' +
                  '    res.json({ ok: true, uptime: process.uptime() });\n' +
                  '  });\n\n' +
                  '  app.listen(config.port, () => {\n' +
                  '    console.log(`NIGHT bot listening on port ${config.port}`);\n' +
                  '  });\n}\n\n' +
                  'main().catch((err) => {\n' +
                  '  console.error("Fatal startup error:", err);\n' +
                  '  process.exit(1);\n});'
              },
              {
                name: 'config.js', path: '/home/mscc/app/src/config.js', type: 'file', size: 1240, modified: mins(120), content:
                  'module.exports = {\n' +
                  '  port: process.env.PORT || 3000,\n' +
                  '  prefix: "!",\n' +
                  '  timezone: "UTC",\n' +
                  '  logLevel: "info",\n' +
                  '  reconnect: { attempts: 3, backoff: "exponential" }\n};'
              },
              {
                name: 'routes', path: '/home/mscc/app/src/routes', type: 'folder', children: [
                  { name: 'accounts.js', path: '/home/mscc/app/src/routes/accounts.js', type: 'file', size: 3200, modified: mins(30), content:
                    'const router = require("express").Router();\nconst store = require("../lib/store");\n\n' +
                    'router.get("/", async (req, res) => {\n  const accounts = await store.listAccounts();\n  res.json({ ok: true, data: accounts });\n});\n\n' +
                    'router.post("/", async (req, res) => {\n  const { name, phone, profileId } = req.body;\n  const acc = await store.createAccount({ name, phone, profileId });\n  res.json({ ok: true, data: acc });\n});\n\nmodule.exports = router;' },
                  { name: 'messages.js', path: '/home/mscc/app/src/routes/messages.js', type: 'file', size: 2800, modified: mins(240), content:
                    'const router = require("express").Router();\n\nrouter.post("/send", async (req, res) => {\n  const { accountId, to, text } = req.body;\n  await req.app.locals.gateway.send(accountId, to, text);\n  res.json({ ok: true });\n});\n\nmodule.exports = router;' }
                ]
              },
              {
                name: 'lib', path: '/home/mscc/app/src/lib', type: 'folder', children: [
                  { name: 'pairing.js', path: '/home/mscc/app/src/lib/pairing.js', type: 'file', size: 5600, modified: mins(1440), content:
                    '// Pairing flow helpers\nconst QRCode = require("qrcode");\n\nasync function generatePairToken(accountId) {\n  return { token: `NIGHT-${accountId}-${Date.now()}` };\n}\n\nmodule.exports = { generatePairToken };' },
                  { name: 'queue.js', path: '/home/mscc/app/src/lib/queue.js', type: 'file', size: 2200, modified: mins(2880), content:
                    '// Simple FIFO queue with rate limiting\nclass Queue {\n  constructor(opts) {\n    this.items = [];\n    this.concurrency = opts.concurrency || 4;\n    this.running = 0;\n  }\n  push(task) { this.items.push(task); this._drain(); }\n  _drain() {\n    while (this.running < this.concurrency && this.items.length) {\n      const t = this.items.shift(); this.running++;\n      Promise.resolve().then(t).finally(() => { this.running--; this._drain(); });\n    }\n  }\n}\nmodule.exports = Queue;' }
                ]
              }
            ]
          },
          {
            name: 'logs', path: '/home/mscc/app/logs', type: 'folder', children: [
              { name: 'app.log', path: '/home/mscc/app/logs/app.log', type: 'file', size: 128400, modified: mins(1), content: logBlock('app', 60) },
              { name: 'error.log', path: '/home/mscc/app/logs/error.log', type: 'file', size: 2480, modified: mins(30), content: '[2024-06-13 08:14:22] [ERROR] [gateway] Session revoked remotely for account acc_05\n[2024-06-13 09:42:03] [ERROR] [media] Provider returned HTTP 403 for the requested asset\n[2024-06-13 11:07:44] [ERROR] [db] Connection pool exhausted — waiting for a free slot\n[2024-06-13 14:31:19] [ERROR] [handler] Uncaught exception in message handler: TypeError: Cannot read properties of undefined' },
              { name: 'scheduler.log', path: '/home/mscc/app/logs/scheduler.log', type: 'file', size: 88120, modified: mins(12), content: logBlock('sched', 40) }
            ]
          },
          {
            name: 'package.json', path: '/home/mscc/app/package.json', type: 'file', size: 890, modified: mins(1440 * 7), content:
              '{\n  "name": "night-bot",\n  "version": "4.2.1",\n  "description": "MSCC WhatsApp bot",\n  "main": "src/index.js",\n  "scripts": {\n    "start": "node src/index.js",\n    "dev": "nodemon src/index.js"\n  },\n  "dependencies": {\n    "express": "^4.19.2",\n    "@whiskeysockets/baileys": "^6.7.5",\n    "pg": "^8.11.5",\n    "qrcode": "^1.5.3"\n  }\n}'
          },
          {
            name: 'README.md', path: '/home/mscc/app/README.md', type: 'file', size: 3280, modified: mins(1440 * 7), content:
              '# NIGHT Bot\n\nWhatsApp bot for MSCC operations. Runs as a Node.js service on Azure.\n\n## Endpoints\n\n- `POST /api/accounts` — Create an account\n- `GET /api/accounts` — List accounts\n- `POST /api/accounts/:id/pair` — Start pairing\n- `POST /api/accounts/:id/reconnect` — Reconnect session\n\n## Configuration\n\nEnvironment variables: `PORT`, `PREFIX`, `TZ`, `OWNER_NUMBER`, `GROQ_API_KEY`.\n\nSee the docs for the full deployment guide.'
          },
          {
            name: 'config.json', path: '/home/mscc/app/config.json', type: 'file', size: 540, modified: mins(4320), content:
              '{\n  "prefix": "!",\n  "timezone": "UTC",\n  "autoReconnect": true,\n  "logLevel": "info",\n  "maxAccounts": 25,\n  "rateLimitPerMin": 60,\n  "sessionTimeout": 3600\n}'
          }
        ]
      }
    ]
  };

  const PROTECTED_FS_PATHS = ['/home/mscc/.env', '/home/mscc/keys', '/var/lib/mscc/accounts', '/etc', '/root'];

  function findFsNode(path, node) {
    node = node || mockFsTree;
    if (node.path === path) return node;
    if (!node.children) return null;
    for (const c of node.children) {
      const r = findFsNode(path, c);
      if (r) return r;
    }
    return null;
  }

  function findParentNode(path, node) {
    node = node || mockFsTree;
    if (!node.children) return null;
    for (const c of node.children) {
      if (c.path === path) return node;
      const r = findParentNode(path, c);
      if (r) return r;
    }
    return null;
  }

  /* ---------- Mock log stream ---------- */
  let mockLogs = [];
  let lastLogFetch = 0;

  function logEntry(ts) {
    const r = Math.random();
    const level = r < 0.05 ? 'ERROR' : r < 0.18 ? 'WARN' : r < 0.9 ? 'INFO' : 'DEBUG';
    const sources = ['gateway', 'bot', 'scheduler', 'db', 'broadcast', 'queue'];
    const source = sources[Math.floor(Math.random() * sources.length)];
    const msgs = {
      INFO: ['Message batch processed (n=' + U.rand(5, 90) + ')', 'Session established', 'Heartbeat sent', 'Command !ping handled in ' + U.rand(14, 80) + 'ms', 'Scheduled job executed', 'Connection pool: ' + U.rand(1, 8) + '/10 active', 'Inbound message received', 'Outbound message sent', 'Reconnect succeeded'],
      WARN: ['Rate limit at ' + U.rand(70, 95) + '% of hourly quota', 'Slow query (' + U.rand(400, 1800) + 'ms)', 'Reconnect attempt ' + U.rand(1, 3) + '/3', 'Memory above 75%', 'Event loop lag ' + U.rand(20, 90) + 'ms'],
      ERROR: ['Session revoked remotely', 'Failed to send message (HTTP 403)', 'DB connection timeout', 'Uncaught exception in handler', 'Media download failed'],
      DEBUG: ['Cache hit for key profile:prf_support', 'Parsed inbound payload', 'Enqueued outbound message', 'Released DB connection']
    };
    const msg = msgs[level][Math.floor(Math.random() * msgs[level].length)];
    return { id: 'log_' + Math.random().toString(36).slice(2, 10), ts, level, source, message: msg };
  }

  const latency = () => U.delay(U.rand(NIGHT_CONFIG.mock.minLatency, NIGHT_CONFIG.mock.maxLatency));
  function maybeFail(op) {
    if (Math.random() < (NIGHT_CONFIG.mock.failureRate || 0)) {
      throw new NIGHT.ApiError('MOCK_FAILURE', 'Simulated failure while ' + op + '.', 503);
    }
  }
  function findAccount(id) {
    const a = accounts.find((x) => x.id === id);
    if (!a) throw new NIGHT.ApiError('NOT_FOUND', 'Account ' + id + ' does not exist.', 404);
    return a;
  }
  function logEvent(severity, title, detail, accountId, source) {
    activity.unshift({ id: 'evt_' + Date.now() + '_' + U.rand(100, 999), ts: Date.now(), severity, title, detail, accountId: accountId || null, source: source || 'console' });
  }
  const clone = (x) => JSON.parse(JSON.stringify(x));

  return {
    isMock: true,
    async getOverview() {
      await latency(); maybeFail('loading the overview');
      const online = accounts.filter((a) => a.status === 'online').length;
      return clone({
        bot: { status: 'running', version: '4.2.1', uptimeSeconds: 962400 },
        fleet: { total: accounts.length, online, offline: accounts.filter((a) => a.status === 'offline').length, pairing: accounts.filter((a) => a.status === 'pairing').length, attention: accounts.filter((a) => a.status === 'attention').length },
        messages24h: accounts.reduce((s, a) => s + a.messages24h, 0),
        modulesEnabled: modules.filter((m) => m.enabled).length,
        modulesTotal: modules.length
      });
    },
    async listAccounts() { await latency(); return clone(accounts); },
    async getAccountSlots() {
      await latency();
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const claimed = new Map(accounts.map((a, i) => [a.slot || letters[i] || '', a]));
      return [...letters].map(slot => ({
        slot, occupied: claimed.has(slot), id: claimed.get(slot)?.id || null,
        name: claimed.get(slot)?.name || ''
      }));
    },
    async createAccount({ name, phone, profileId, slot }) {
      await latency(); maybeFail('creating the account');
      if (!name || !name.trim()) throw new NIGHT.ApiError('VALIDATION', 'Account name is required.', 422);
      const acc = { id: 'acc_' + Date.now().toString(36), slot: slot || '', name: name.trim(), phone: phone || 'Not linked', profileId: profileId || null, status: 'pairing', lastSeen: Date.now(), createdAt: Date.now(), session: 'sess_' + Math.random().toString(16).slice(2, 6), messages24h: 0, pairStarted: false };
      accounts.push(acc);
      logEvent('success', 'Account created', acc.name + ' was added and is awaiting pairing.', acc.id, 'accounts');
      return clone(acc);
    },
    async pairAccount(id, method) {
      await latency(); maybeFail('starting pairing');
      const acc = findAccount(id);
      if (acc.status === 'online') throw new NIGHT.ApiError('CONFLICT', 'Account is already online.', 409);
      acc.status = 'pairing';
      acc.pairStarted = true;
      if (method === 'code') {
        return { method: 'code', code: 'NIGHT-' + Math.random().toString(36).slice(2, 6).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(), expiresAt: Date.now() + 120000 };
      }
      return { method: 'qr', expiresAt: Date.now() + 45000 };
    },
    async reconnectAccount(id) {
      await latency(); maybeFail('reconnecting');
      const acc = findAccount(id);
      acc.status = 'online'; acc.lastSeen = Date.now();
      logEvent('success', 'Account reconnected', acc.name + ' re-established its session.', id, 'gateway');
      return clone(acc);
    },
    async completePairing(id) {
      await latency(); maybeFail('completing pairing');
      const acc = findAccount(id);
      acc.status = 'online'; acc.lastSeen = Date.now();
      logEvent('success', 'Account paired', 'Session established for ' + acc.name + ' after pairing.', id, 'gateway');
      return clone(acc);
    },
    async disconnectAccount(id) {
      await latency(); maybeFail('disconnecting');
      const acc = findAccount(id);
      acc.status = 'offline'; acc.lastSeen = Date.now();
      logEvent('info', 'Account disconnected', acc.name + ' was disconnected by the operator.', id, 'gateway');
      return clone(acc);
    },
    async renameAccount(id, name) {
      await latency(); maybeFail('renaming');
      if (!name || !name.trim()) throw new NIGHT.ApiError('VALIDATION', 'New name cannot be empty.', 422);
      const acc = findAccount(id);
      const old = acc.name;
      acc.name = name.trim();
      logEvent('info', 'Account renamed', 'Formerly "' + old + '", now "' + acc.name + '".', id, 'accounts');
      return clone(acc);
    },
    async assignProfile(id, profileId) {
      await latency(); maybeFail('assigning the profile');
      const acc = findAccount(id);
      const prf = profiles.find((p) => p.id === profileId);
      if (!prf && profileId) throw new NIGHT.ApiError('NOT_FOUND', 'Profile does not exist.', 404);
      acc.profileId = profileId;
      logEvent('success', 'Profile assigned', acc.name + (prf ? ' now runs the ' + prf.name + ' profile.' : ' profile cleared.'), id, 'profiles');
      return clone(acc);
    },
    async repairAccount(id) {
      await U.delay(900); maybeFail('repairing');
      const acc = findAccount(id);
      acc.status = 'online'; acc.lastSeen = Date.now();
      logEvent('success', 'Account repaired', acc.name + ' session store rebuilt and handshake succeeded.', id, 'accounts');
      return clone(acc);
    },
    async removeAccount(id) {
      await latency(); maybeFail('removing the account');
      const acc = findAccount(id);
      accounts = accounts.filter((a) => a.id !== id);
      logEvent('warning', 'Account removed', acc.name + ' was permanently removed from the fleet.', null, 'accounts');
      return { removed: id };
    },
    async listProfiles() { await latency(); return clone(profiles); },
    async createProfile({ name, description, color }) {
      await latency(); maybeFail('creating the profile');
      if (!name || !name.trim()) throw new NIGHT.ApiError('VALIDATION', 'Profile name is required.', 422);
      const p = { id: 'prf_' + Date.now().toString(36), name: name.trim(), description: description || '', color: color || '#7cc4fa', modules: 0, createdAt: Date.now() };
      profiles.push(p);
      logEvent('info', 'Profile created', p.name + ' profile added by operator.', null, 'profiles');
      return clone(p);
    },
    async updateProfile(id, patch) {
      await latency();
      const p = profiles.find((x) => x.id === id);
      if (!p) throw new NIGHT.ApiError('NOT_FOUND', 'Profile does not exist.', 404);
      Object.assign(p, patch);
      return clone(p);
    },
    async removeProfile(id) {
      await latency(); maybeFail('removing the profile');
      const inUse = accounts.filter((a) => a.profileId === id).length;
      if (inUse > 0) throw new NIGHT.ApiError('CONFLICT', 'Profile is assigned to ' + inUse + ' account(s).', 409);
      profiles = profiles.filter((x) => x.id !== id);
      return { removed: id };
    },
    async listModules() { await latency(); return clone(modules); },
    async toggleModule(id, enabled) {
      await latency(); maybeFail('toggling the module');
      const m = modules.find((x) => x.id === id);
      if (!m) throw new NIGHT.ApiError('NOT_FOUND', 'Module does not exist.', 404);
      m.enabled = enabled;
      logEvent('info', 'Module toggled', m.name + ' ' + (enabled ? 'enabled' : 'disabled') + ' by operator.', null, 'modules');
      return clone(m);
    },
    async listActivity({ limit = 10, cursor = 0, severity = 'all', accountId = 'all', query = '' } = {}) {
      await latency();
      let rows = activity.slice();
      if (severity !== 'all') rows = rows.filter((r) => r.severity === severity);
      if (accountId !== 'all') rows = rows.filter((r) => r.accountId === accountId);
      if (query) { const q = query.toLowerCase(); rows = rows.filter((r) => (r.title + ' ' + r.detail).toLowerCase().includes(q)); }
      return { items: clone(rows.slice(cursor, cursor + limit)), total: rows.length, nextCursor: cursor + limit < rows.length ? cursor + limit : null };
    },
    async runDiagnostics() {
      await U.delay(400);
      return {
        runAt: Date.now(),
        checks: [
          { id: 'gateway', label: 'Gateway reachability', ms: U.rand(24, 60), status: 'pass', detail: 'Socket handshake completed.' },
          { id: 'session', label: 'WhatsApp session health', ms: U.rand(60, 180), status: 'pass', detail: '7 of 8 sessions authenticated.' },
          { id: 'database', label: 'Database round-trip', ms: U.rand(8, 22), status: 'pass', detail: 'Read/write probe returned in budget.' },
          { id: 'eventloop', label: 'Event loop lag', ms: U.rand(2, 9), status: 'pass', detail: 'P99 lag within 12 ms budget.' },
          { id: 'disk', label: 'Disk headroom', ms: U.rand(5, 15), status: 'warn', detail: '81% used — consider rotating session archives.' },
          { id: 'storage', label: 'Cloud storage credentials', ms: U.rand(80, 240), status: 'pass', detail: 'Write probe to staging prefix succeeded.' }
        ]
      };
    },
    async getSystemMetrics() {
      await latency();
      const jitter = (v, d) => Math.min(99, Math.max(1, +(v + (Math.random() * d * 2 - d)).toFixed(1)));
      return { cpu: jitter(34, 9), memory: jitter(62, 5), disk: 81, networkIn: U.rand(120, 460), networkOut: U.rand(80, 380), uptimeSeconds: 962400 + Math.floor((Date.now() - now) / 1000), host: 'night-node-01', region: 'azure-uksouth', runtime: 'node 20.11.1', loadAvg: [0.42, 0.51, 0.48] };
    },
    async getStorage() {
      await latency();
      const used = storageFiles.reduce((s, f) => s + f.size, 0);
      return { used, total: 1073741824, provider: 'Azure Blob Storage', container: 'night-sessions', files: clone(storageFiles) };
    },
    async getSettings() { await latency(); return Object.assign({}, defaultSettings, U.store.get('night.settings', {})); },
    async saveSettings(patch) {
      await latency(); maybeFail('saving settings');
      const merged = Object.assign({}, defaultSettings, U.store.get('night.settings', {}), patch);
      U.store.set('night.settings', merged);
      return merged;
    },
    async getHealth() { await latency(); return { ok: true, adapter: 'mock', serverTime: Date.now() }; },

    /* ---------- File manager ---------- */
    async getFsTree() { await latency(); return clone(mockFsTree); },
    async getFsPreview(path) {
      await latency(); maybeFail('reading the file');
      if (PROTECTED_FS_PATHS.some(p => path === p || path.startsWith(p + '/'))) {
        throw new NIGHT.ApiError('FORBIDDEN', 'This path is not on the server allowlist and cannot be read.', 403);
      }
      const node = findFsNode(path);
      if (!node) throw new NIGHT.ApiError('NOT_FOUND', 'File not found.', 404);
      if (node.type === 'folder') throw new NIGHT.ApiError('VALIDATION', 'Cannot preview a folder.', 422);
      let language = 'text';
      if (path.endsWith('.json')) language = 'json';
      else if (path.endsWith('.js') || path.endsWith('.mjs')) language = 'javascript';
      else if (path.endsWith('.md')) language = 'markdown';
      else if (path.endsWith('.log')) language = 'log';
      else if (path.endsWith('.csv')) language = 'csv';
      return { path, content: node.content || '', language, size: node.size, name: node.name, modified: node.modified };
    },
    async createFile(parentPath, name) {
      await latency();
      const parent = findFsNode(parentPath);
      if (!parent || parent.type !== 'folder') throw new NIGHT.ApiError('VALIDATION', 'Invalid parent folder.', 422);
      const newPath = parentPath === '/' ? '/' + name : parentPath + '/' + name;
      if (findFsNode(newPath)) throw new NIGHT.ApiError('CONFLICT', 'A file or folder with that name already exists.', 409);
      const newNode = { name, path: newPath, type: 'file', size: 0, modified: Date.now(), content: '' };
      parent.children.push(newNode);
      logEvent('success', 'File created', name + ' was created in ' + parentPath, null, 'files');
      return clone(newNode);
    },
    async createFolder(parentPath, name) {
      await latency();
      const parent = findFsNode(parentPath);
      if (!parent || parent.type !== 'folder') throw new NIGHT.ApiError('VALIDATION', 'Invalid parent folder.', 422);
      const newPath = parentPath === '/' ? '/' + name : parentPath + '/' + name;
      if (findFsNode(newPath)) throw new NIGHT.ApiError('CONFLICT', 'A file or folder with that name already exists.', 409);
      const newNode = { name, path: newPath, type: 'folder', children: [], modified: Date.now() };
      parent.children.push(newNode);
      logEvent('success', 'Folder created', name + ' was created in ' + parentPath, null, 'files');
      return clone(newNode);
    },
    async saveFileContent(path, content) {
      await latency();
      const node = findFsNode(path);
      if (!node) throw new NIGHT.ApiError('NOT_FOUND', 'File not found.', 404);
      node.content = content;
      node.size = content.length;
      node.modified = Date.now();
      logEvent('success', 'File saved', path + ' was updated.', null, 'files');
      return clone(node);
    },
    async deleteItems(paths) {
      await latency();
      paths.forEach(p => {
        const parent = findParentNode(p);
        if (parent && parent.children) {
          parent.children = parent.children.filter(c => c.path !== p);
        }
      });
      logEvent('warning', 'Items deleted', paths.length + ' items were deleted.', null, 'files');
      return { success: true };
    },
    async uploadFiles(files, targetDir) {
      await latency();
      const parent = findFsNode(targetDir);
      if (!parent || parent.type !== 'folder') throw new NIGHT.ApiError('VALIDATION', 'Invalid upload destination.', 422);
      const uploaded = [];
      for (const file of Array.from(files || [])) {
        if (!file || !file.name || /[\\/]/.test(file.name) || file.name === '.' || file.name === '..') {
          throw new NIGHT.ApiError('VALIDATION', 'An uploaded filename is invalid.', 422);
        }
        if (file.size > 10 * 1024 * 1024) throw new NIGHT.ApiError('FILE_TOO_LARGE', 'Mock uploads are limited to 10 MB per file.', 413);
        const path = targetDir === '/' ? '/' + file.name : targetDir + '/' + file.name;
        if (findFsNode(path)) throw new NIGHT.ApiError('CONFLICT', file.name + ' already exists.', 409);
        let content = '[Binary file uploaded in mock mode]';
        if (typeof file.text === 'function' && (!file.type || file.type.startsWith('text/') || /\.(txt|json|js|mjs|cjs|md|log|ya?ml|toml|ini|conf|html|css|xml)$/i.test(file.name))) {
          content = await file.text();
        }
        const node = { name: file.name, path, type: 'file', size: file.size || content.length, modified: Date.now(), content };
        parent.children.push(node); uploaded.push({ name: node.name, path: node.path, size: node.size });
      }
      logEvent('success', 'Files uploaded (mock)', uploaded.length + ' files simulated in the browser.', null, 'files');
      return { uploaded };
    },
    async renameItem(path, newName) {
      await latency();
      const node = findFsNode(path);
      if (!node) throw new NIGHT.ApiError('NOT_FOUND', 'Item not found.', 404);
      const parent = findParentNode(path);
      const newPath = parent.path === '/' ? '/' + newName : parent.path + '/' + newName;
      if (findFsNode(newPath)) throw new NIGHT.ApiError('CONFLICT', 'A file or folder with that name already exists.', 409);
      
      function updatePaths(n, oldBase, newBase) {
        n.path = n.path.replace(oldBase, newBase);
        if (n.children) n.children.forEach(c => updatePaths(c, oldBase, newBase));
      }
      updatePaths(node, node.path, newPath);
      node.name = newName;
      node.modified = Date.now();
      logEvent('info', 'Item renamed', 'Renamed to ' + newName, null, 'files');
      return clone(node);
    },
    async unarchiveFile(path, targetDir) {
      await U.delay(1500);
      const parent = findFsNode(targetDir);
      if (!parent) throw new NIGHT.ApiError('NOT_FOUND', 'Target directory not found.', 404);
      const folderName = path.split('/').pop().replace(/\.(zip|tar\.gz|rar)$/, '');
      const newPath = targetDir === '/' ? '/' + folderName : targetDir + '/' + folderName;
      const unzipped = { name: folderName, path: newPath, type: 'folder', modified: Date.now(), children: [
        { name: 'extracted_file_1.txt', path: newPath + '/extracted_file_1.txt', type: 'file', size: 1024, modified: Date.now(), content: 'Simulated unarchived file.' },
        { name: 'extracted_file_2.json', path: newPath + '/extracted_file_2.json', type: 'file', size: 2048, modified: Date.now(), content: '{"simulated": true}' }
      ]};
      parent.children.push(unzipped);
      logEvent('success', 'Archive unzipped', path + ' was extracted to ' + targetDir, null, 'files');
      return clone(unzipped);
    },
    async archiveItems(paths, targetDir) {
      await latency();
      const archiveName = 'archive_' + Date.now().toString().slice(-6) + '.zip';
      const newPath = targetDir === '/' ? '/' + archiveName : targetDir + '/' + archiveName;
      const parent = findFsNode(targetDir);
      if (parent) {
        parent.children.push({ name: archiveName, path: newPath, type: 'file', size: paths.length * 1024, modified: Date.now(), content: 'Simulated archive content' });
      }
      logEvent('success', 'Archive created', paths.length + ' items archived to ' + archiveName, null, 'files');
      return { success: true, archivePath: newPath };
    },

    /* ---------- Server explorer ---------- */
    async getServerStatus() {
      await latency();
      return {
        metrics: { cpu: 34 + U.rand(-4, 6), memory: 62 + U.rand(-3, 4), disk: 81, uptime: 962400 + Math.floor((Date.now() - now) / 1000), networkIn: U.rand(120, 460), networkOut: U.rand(80, 380) },
        services: [
          { name: 'NIGHT Bot', status: 'healthy', detail: 'v4.2.1 · node 20.11.1' },
          { name: 'WhatsApp Gateway', status: 'healthy', detail: '7/8 sessions authenticated' },
          { name: 'Database', status: 'healthy', detail: 'PostgreSQL 15 · pool 3/10' },
          { name: 'Redis Cache', status: 'healthy', detail: '7.2.4 · 142 keys' },
          { name: 'Azure Blob Storage', status: 'healthy', detail: 'night-sessions · 81% used' },
          { name: 'Scheduler', status: 'degraded', detail: '1 job delayed' }
        ],
        accountDiagnostics: accounts.map(a => ({
          id: a.id, name: a.name, status: a.status,
          latencyMs: a.status === 'online' ? U.rand(22, 120) : null,
          lastPing: a.status === 'online' ? a.lastSeen : null
        })),
        runtime: { node: '20.11.1', os: 'Ubuntu 22.04', arch: 'x64', host: 'night-node-01', region: 'azure-uksouth' }
      };
    },
    async getServerLogs({ limit = 100, severity = 'all' } = {}) {
      await latency();
      if (!mockLogs.length) {
        for (let i = 0; i < 60; i++) mockLogs.push(logEntry(Date.now() - (60 - i) * 4000));
      } else {
        const nowTs = Date.now();
        const elapsed = nowTs - (lastLogFetch || nowTs - 3000);
        const toAdd = Math.min(3, Math.max(0, Math.floor(elapsed / 2000)));
        for (let i = 0; i < toAdd; i++) mockLogs.push(logEntry(nowTs - i * 500));
        if (mockLogs.length > 500) mockLogs.splice(0, mockLogs.length - 500);
      }
      lastLogFetch = Date.now();
      let rows = mockLogs.slice();
      if (severity !== 'all') {
        const want = severity === 'warning' ? 'WARN' : severity === 'error' ? 'ERROR' : severity === 'info' ? 'INFO' : 'DEBUG';
        rows = rows.filter(r => r.level === want);
      }
      rows.sort((a, b) => b.ts - a.ts);
      return { items: rows.slice(0, limit).map(r => ({ ...r })) };
    },
    async getServerConfig() {
      await latency();
      return {
        application: {
          name: 'NIGHT Control Centre', version: '4.2.1', environment: 'production',
          region: 'azure-uksouth', nodeEnv: 'production', logLevel: 'info', timezone: 'UTC'
        },
        bot: {
          prefix: '!', autoReconnect: true, maxAccounts: 25,
          rateLimitPerMin: 60, sessionTimeoutSeconds: 3600, reconnectBackoff: 'exponential'
        },
        integrations: [
          { name: 'WhatsApp', provider: 'Baileys 6.7.5', status: 'configured', endpoint: 'internal://wa' },
          { name: 'Database', provider: 'PostgreSQL 15', status: 'configured', endpoint: 'pg://night-primary' },
          { name: 'Cache', provider: 'Redis 7.2', status: 'configured', endpoint: 'redis://night-cache' },
          { name: 'Object Storage', provider: 'Azure Blob', status: 'configured', endpoint: 'night-sessions' },
          { name: 'Groq API', provider: 'Groq', status: 'configured', endpoint: 'api.groq.com' },
          { name: 'OpenAI', provider: 'OpenAI', status: 'not configured', endpoint: null }
        ],
        deployment: {
          container: 'night-bot:4.2.1', replicas: 2, host: 'night-node-01',
          region: 'azure-uksouth', startedAt: mins(60 * 24 * 11), uptimeSeconds: 962400
        }
      };
    }
  };
})();
