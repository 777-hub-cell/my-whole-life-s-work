const NIGHT_DEFAULT_CONFIG = {
  appName: 'NIGHT Control Centre',
  // Safe default for a downloaded copy. Set adapter='live' only after the secured API is deployed.
  adapter: 'mock',
  apiBase: '/api',
  apiTimeoutMs: 15000,
  requireCsrf: true,
  mock: { minLatency: 160, maxLatency: 480, failureRate: 0 },
  pollIntervalMs: 4000,
  bandRefreshMs: 30000,
  capabilities: {}
};
window.NIGHT_CONFIG = Object.assign(NIGHT_DEFAULT_CONFIG, window.MSCC_CONTROL_CENTRE_BOOTSTRAP || {});
