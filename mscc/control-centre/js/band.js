NIGHT.band = (function () {
  const { h } = NIGHT.util;
  const WINDOW_MS = 24 * 3600 * 1000;
  let hostEl = null;
  let cachedEvents = [];
  let lastClick = () => {};

  function segmentCount() { return window.innerWidth < 640 ? 48 : 96; }

  function bucketEvents(events, n) {
    const now = Date.now();
    const bucketSize = WINDOW_MS / n;
    const start = now - WINDOW_MS;
    const buckets = Array.from({ length: n }, (_, i) => ({ start: start + i * bucketSize, end: start + (i + 1) * bucketSize, count: 0, worst: null }));
    const rank = { info: 1, success: 1, warning: 2, error: 3 };
    events.forEach((ev) => {
      if (ev.ts < start) return;
      const idx = Math.min(n - 1, Math.floor((ev.ts - start) / bucketSize));
      if (idx < 0) return;
      buckets[idx].count++;
      const r = rank[ev.severity] || 0;
      if (!buckets[idx].worst || rank[buckets[idx].worst] < r) buckets[idx].worst = ev.severity;
    });
    return buckets;
  }

  function render() {
    if (!hostEl) return;
    const n = segmentCount();
    const buckets = bucketEvents(cachedEvents, n);
    const max = Math.max(1, ...buckets.map((b) => b.count));
    hostEl.innerHTML = '';

    const labels = window.innerWidth >= 640
      ? [h('span', { class: 'band-label' }, '−24h'), h('span', { class: 'band-label' }, 'now')]
      : [];

    const track = h('div', { class: 'band-track', role: 'img', 'aria-label': 'Activity density over the last 24 hours' },
      buckets.map((b) => {
        const density = b.count === 0 ? 0 : 0.14 + (b.count / max) * 0.86;
        const color = b.worst === 'error' ? 'var(--red)' : b.worst === 'warning' ? 'var(--amber)' : 'var(--accent)';
        const timeRange = new Date(b.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + '–' + new Date(b.end).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        const label = b.count === 0 ? 'Quiet · ' + timeRange : b.count + ' event' + (b.count === 1 ? '' : 's') + ' · ' + timeRange;
        return h('button', { class: 'band-seg', type: 'button', tabindex: '-1', 'aria-label': label, title: label, style: { background: color, opacity: density.toString() }, onclick: () => lastClick() });
      })
    );

    if (labels.length) hostEl.append(labels[0]);
    hostEl.append(track);
    if (labels.length) hostEl.append(labels[1]);
  }

  async function refresh() {
    if (!hostEl) return;
    try {
      const res = await NIGHT.api.listActivity({ limit: 500 });
      cachedEvents = res.items;
      render();
    } catch (e) { cachedEvents = []; render(); }
  }

  function mount(el) {
    hostEl = el;
    hostEl.className = 'band';
    lastClick = () => { location.hash = '#/activity'; };
    refresh();
    if (NIGHT._bandTimer) clearInterval(NIGHT._bandTimer);
    NIGHT._bandTimer = setInterval(() => { if (!document.hidden) refresh(); }, NIGHT_CONFIG.bandRefreshMs || 30000);
    if (!NIGHT._bandVis) { NIGHT._bandVis = () => { if (!document.hidden) refresh(); }; document.addEventListener('visibilitychange', NIGHT._bandVis); }
    if (!NIGHT._bandResize) {
      let t;
      NIGHT._bandResize = () => { clearTimeout(t); t = setTimeout(render, 120); };
      window.addEventListener('resize', NIGHT._bandResize);
    }
  }

  return { mount, refresh };
})();
