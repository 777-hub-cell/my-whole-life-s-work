NIGHT.LiveAdapter = (function () {
  const configuredBase = String(NIGHT_CONFIG.apiBase || '/api').trim();
  const baseUrl = new URL(configuredBase, window.location.origin);
  if (baseUrl.origin !== window.location.origin || !baseUrl.pathname.startsWith('/') || baseUrl.pathname.startsWith('//') || baseUrl.search || baseUrl.hash) {
    throw new Error('NIGHT_CONFIG.apiBase must be a same-origin path without a query or hash.');
  }
  const base = baseUrl.pathname.replace(/\/$/, '') || '/';
  const timeoutMs = Math.max(1000, Number(NIGHT_CONFIG.apiTimeoutMs) || 15000);
  const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
  const SECRET_KEY_RE = /(KEY|TOKEN|SECRET|PASS|PWD|AUTH|COOKIE|SESSION|PRIVATE|CREDENTIAL|PHONE|NUMBER|EMAIL|JID)/i;
  const knownSecretKeys = new Set();

  function csrfMeta() { return document.querySelector('meta[name="csrf-token"]'); }
  function csrfToken() {
    const meta = csrfMeta();
    return meta ? String(meta.content || '').trim() : '';
  }
  function updateCsrfToken(token) {
    const meta = csrfMeta();
    if (meta) meta.content = typeof token === 'string' ? token : '';
  }

  function makeUrl(path) {
    if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
      throw new NIGHT.ApiError('INVALID_API_PATH', 'The API path must be an absolute same-origin path.', 0);
    }
    const url = new URL((base === '/' ? '' : base) + path, window.location.origin);
    const inApiRoot = base === '/' || url.pathname === base || url.pathname.startsWith(base + '/');
    if (url.origin !== window.location.origin || !inApiRoot) {
      throw new NIGHT.ApiError('INVALID_API_PATH', 'The API request must remain on this origin.', 0);
    }
    return url;
  }

  async function send(method, path, body, isMultipart, timeoutOverride) {
    method = String(method || 'GET').toUpperCase();
    const url = makeUrl(path);
    const headers = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
    if (body !== undefined && !isMultipart) headers['Content-Type'] = 'application/json';
    if (!SAFE_METHODS.has(method)) {
      const token = csrfToken();
      if (NIGHT_CONFIG.requireCsrf !== false && !token) {
        throw new NIGHT.ApiError('CSRF_TOKEN_MISSING', 'The server did not provide a CSRF token. Live changes are blocked until the backend injects a csrf-token meta tag.', 403);
      }
      if (token) headers['X-CSRF-Token'] = token;
    }

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const requestTimeout = Math.max(timeoutMs, Number(timeoutOverride) || timeoutMs);
    const timer = controller ? setTimeout(() => controller.abort(), requestTimeout) : null;
    let response;
    try {
      response = await fetch(url.href, {
        method,
        headers,
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        body: body === undefined ? undefined : (isMultipart ? body : JSON.stringify(body)),
        signal: controller ? controller.signal : undefined
      });
    } catch (error) {
      if (error && error.name === 'AbortError') {
        throw new NIGHT.ApiError('TIMEOUT', 'The API request timed out. Check the server and try again.', 0);
      }
      throw new NIGHT.ApiError('NETWORK', 'Could not reach the same-origin API at ' + base + '.', 0);
    } finally {
      if (timer !== null) clearTimeout(timer);
    }

    if (response.status === 204) {
      if (!response.ok) throw new NIGHT.ApiError('HTTP_' + response.status, 'Request failed.', response.status);
      return null;
    }

    if (response.status === 404) {
      throw new NIGHT.ApiError('NOT_IMPLEMENTED', 'The backend does not implement ' + method + ' ' + path + '.', 404);
    }

    let payload;
    try { payload = await response.json(); }
    catch (error) {
      throw new NIGHT.ApiError('INVALID_RESPONSE', 'The server returned an invalid API response.', response.status);
    }
    if (!response.ok || !payload || payload.ok !== true) {
      if (response.status === 401 && !/\/(auth\/session|auth\/login)$/.test(path)) {
        try { window.dispatchEvent(new Event('night:unauthorized')); } catch (e) {}
      }
      const error = payload && payload.error || {};
      // Do not surface arbitrary response bodies or stack traces in the UI.
      throw new NIGHT.ApiError(error.code || 'HTTP_' + response.status, error.message || 'The request was rejected by the server.', response.status);
    }
    return payload.data;
  }

  function request(method, path, body) { return send(method, path, body, false); }
  function id(value) { return encodeURIComponent(String(value)); }

  return {
    isMock: false,
    capabilities: Object.assign({}, NIGHT_CONFIG.capabilities || {}),
    request,
    getSession: async () => {
      const session = await request('GET', '/auth/session');
      updateCsrfToken(session && session.csrfToken);
      return session;
    },
    login: async (password) => {
      const session = await request('POST', '/auth/login', { password });
      updateCsrfToken(session && session.csrfToken);
      return session;
    },
    logout: async () => {
      const session = await request('POST', '/auth/logout', {});
      updateCsrfToken(session && session.csrfToken);
      return session;
    },
    getOverview: () => request('GET', '/overview'),
    listAccounts: () => request('GET', '/accounts'),
    createAccount: (data) => request('POST', '/accounts', data),
    pairAccount: (accountId, method, phone) => send('POST', '/accounts/' + id(accountId) + '/pair', { method, phone: phone || null }, false, 35000),
    getPairStatus: (accountId) => request('GET', '/accounts/' + id(accountId) + '/pair-status'),
    reconnectAccount: (accountId) => request('POST', '/accounts/' + id(accountId) + '/reconnect'),
    disconnectAccount: (accountId) => request('POST', '/accounts/' + id(accountId) + '/disconnect'),
    renameAccount: (accountId, name) => request('PATCH', '/accounts/' + id(accountId), { name }),
    assignProfile: (accountId, profileId) => request('PATCH', '/accounts/' + id(accountId), { profileId }),
    repairAccount: (accountId, method = 'code') => send('POST', '/accounts/' + id(accountId) + '/repair', { confirm: true, method: method === 'qr' ? 'qr' : 'code' }, false, 35000),
    removeAccount: (accountId) => request('DELETE', '/accounts/' + id(accountId) + '?confirm=true'),
    listProfiles: () => request('GET', '/profiles'),
    createProfile: (data) => request('POST', '/profiles', data),
    updateProfile: (profileId, patch) => request('PATCH', '/profiles/' + id(profileId), patch),
    removeProfile: (profileId) => request('DELETE', '/profiles/' + id(profileId)),
    getProfileConfig: (profileId) => request('GET', '/profiles/' + id(profileId) + '/config'),
    setProfileModule: (profileId, moduleId, enabled) => request('PATCH', '/profiles/' + id(profileId) + '/config', { moduleId, enabled }),
    getAccountOverrides: (accountId) => request('GET', '/accounts/' + id(accountId) + '/overrides'),
    setAccountOverride: (accountId, moduleId, value) => request('PATCH', '/accounts/' + id(accountId) + '/overrides', { moduleId, value }),
    listModules: () => request('GET', '/modules'),
    toggleModule: (moduleId, enabled) => request('PATCH', '/modules/' + id(moduleId), { enabled }),
    listActivity: (params) => {
      const query = new URLSearchParams();
      Object.entries(params || {}).forEach(([key, value]) => { if (value !== undefined && value !== null && value !== '') query.set(key, value); });
      return request('GET', '/activity' + (query.toString() ? '?' + query.toString() : ''));
    },
    runDiagnostics: () => request('POST', '/diagnostics/run'),
    getSystemMetrics: () => request('GET', '/system/metrics'),
    getStorage: () => request('GET', '/storage'),
    refreshStorage: () => request('POST', '/storage/refresh', {}),
    getSettings: () => request('GET', '/settings'),
    saveSettings: (patch) => request('PUT', '/settings', patch),
    getHealth: () => request('GET', '/health'),
    getFsTree: () => request('GET', '/files/tree'),
    getFsPreview: (path) => request('GET', '/files/preview?path=' + encodeURIComponent(path)),
    reloadCustomCommands: () => request('POST', '/custom-commands/reload', {}),
    createFile: (parentPath, name) => request('POST', '/files', { parentPath, name, type: 'file' }),
    createFolder: (parentPath, name) => request('POST', '/files', { parentPath, name, type: 'folder' }),
    saveFileContent: (path, content) => request('PUT', '/files/content', { path, content }),
    deleteItems: (paths) => request('POST', '/files/delete', { paths }),
    renameItem: (path, newName) => request('POST', '/files/rename', { path, newName }),
    archiveItems: (paths, targetDir) => request('POST', '/files/archive', { paths, targetDir }),
    unarchiveFile: (path, targetDir) => request('POST', '/files/unarchive', { path, targetDir }),
    uploadFiles: async (files, targetDir) => {
      const form = new FormData();
      form.append('targetDir', targetDir);
      Array.from(files || []).forEach((file) => form.append('files', file, file.name));
      return send('POST', '/files/upload', form, true);
    },
    getServerStatus: () => request('GET', '/server/status'),
    getServerLogs: (params) => {
      const query = new URLSearchParams();
      Object.entries(params || {}).forEach(([key, value]) => { if (value !== undefined && value !== null && value !== '') query.set(key, value); });
      return request('GET', '/server/logs' + (query.toString() ? '?' + query.toString() : ''));
    },
    getServerConfig: () => request('GET', '/server/config'),
    listEnv: async () => {
      const entries = await request('GET', '/env');
      if (!Array.isArray(entries)) throw new NIGHT.ApiError('INVALID_RESPONSE', 'The environment endpoint must return an array.', 502);
      // Defensive client-side redaction; the server must never transmit secret values.
      return entries.filter((entry) => entry && typeof entry === 'object').map((entry) => {
        const key = String(entry.key || '');
        const secret = entry.isSecret === true || SECRET_KEY_RE.test(key);
        if (secret) knownSecretKeys.add(key);
        const metadata = {
          key: String(entry.key || ''),
          label: String(entry.label || entry.key || ''),
          description: String(entry.description || ''),
          editable: entry.editable === true,
          applyMode: String(entry.applyMode || 'read-only'),
          requiresRestart: entry.requiresRestart === true,
          maxLength: Number.isInteger(entry.maxLength) ? entry.maxLength : 4096,
        };
        return secret
          ? { ...metadata, isSecret: true, configured: entry.configured === true, value: null }
          : { ...metadata, isSecret: false, configured: true, value: String(entry.value == null ? '' : entry.value) };
      });
    },
    setEnv: async (key, value) => {
      const result = await request('PUT', '/env/' + id(key), { value });
      const secret = knownSecretKeys.has(String(key)) || SECRET_KEY_RE.test(String(key));
      if (secret) return {
        key: String(key),
        label: String(result && result.label || key),
        description: String(result && result.description || ''),
        editable: Boolean(result && result.editable === true),
        applyMode: String(result && result.applyMode || 'read-only'),
        requiresRestart: Boolean(result && result.requiresRestart === true),
        maxLength: Number.isInteger(result && result.maxLength) ? result.maxLength : 4096,
        isSecret: true,
        configured: !result || result.configured !== false,
        value: null,
      };
      return result;
    }
  };
})();

NIGHT.api = (function () {
  const mode = String(NIGHT_CONFIG.adapter || 'mock').toLowerCase();
  if (mode !== 'mock' && mode !== 'live') throw new Error('NIGHT_CONFIG.adapter must be "mock" or "live".');
  const adapter = mode === 'live' ? NIGHT.LiveAdapter : NIGHT.MockAdapter;
  adapter.mode = mode;
  document.body.setAttribute('data-adapter', mode);
  return adapter;
})();
