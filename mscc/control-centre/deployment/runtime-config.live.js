// Copy this file to the website web root as runtime-config.js when the private
// reverse-proxy route /api/control-centre/ is configured on that same website origin.
window.MSCC_CONTROL_CENTRE_BOOTSTRAP = {
  adapter: 'live',
  apiBase: '/api/control-centre',
  apiTimeoutMs: 15000,
  requireCsrf: true,
  capabilities: {
    filesReadOnly: true,
    filesWrite: false,
    envWrite: false,
    profilesWrite: false,
    profileCapabilities: false,
    accountOverrides: false,
    moduleToggle: true,
    settingsEditor: true
  }
};
