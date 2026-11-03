/* Tracks unsaved work so navigation / tab close can warn first. */
NIGHT.dirty = (function () {
  const flags = {};
  function set(key, on) { if (on) flags[key] = true; else delete flags[key]; }
  function any() { return Object.keys(flags).length > 0; }
  function clear() { Object.keys(flags).forEach((k) => delete flags[k]); }
  window.addEventListener('beforeunload', (e) => { if (any()) { e.preventDefault(); e.returnValue = ''; } });
  return { set, any, clear };
})();
