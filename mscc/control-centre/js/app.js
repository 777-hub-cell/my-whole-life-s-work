(function () {
  const { h } = NIGHT.util;
  const { icon } = NIGHT.icons;
  const ui = NIGHT.ui;
  const pages = NIGHT.pages;

  const ROUTES = [
    { group: 'Operate', items: [
      { id: 'overview', label: 'Overview', icon: 'overview', render: pages.overview },
      { id: 'accounts', label: 'Accounts', icon: 'accounts', render: pages.accounts, badge: true },
      { id: 'activity', label: 'Activity', icon: 'activity', render: pages.activityPage }
    ]},
    { group: 'Files & config', items: [
      { id: 'files', label: 'File explorer', icon: 'folder', render: pages.filesPage },
      { id: 'config', label: 'Configuration', icon: 'config', render: pages.configPage },
      { id: 'env', label: 'Environment', icon: 'env', render: pages.envPage }
    ]},
    { group: 'Configure', items: [
      { id: 'profiles', label: 'Behaviour profiles', icon: 'profiles', render: pages.profilesPage },
      { id: 'modules', label: 'Commands & modules', icon: 'commands', render: pages.modulesPage },
      { id: 'settings', label: 'Settings', icon: 'settings', render: pages.settingsPage }
    ]},
    { group: 'System', items: [
      { id: 'server', label: 'Server explorer', icon: 'terminal', render: pages.serverPage },
      { id: 'diagnostics', label: 'Diagnostics', icon: 'diagnostics', render: pages.diagnosticsPage },
      { id: 'storage', label: 'Storage', icon: 'storage', render: pages.storagePage }
    ]}
  ];
  const flat = ROUTES.reduce((a, g) => a.concat(g.items), []);

  const TABS = [
    { id: 'overview', label: 'Overview', icon: 'overview', route: 'overview' },
    { id: 'accounts', label: 'Accounts', icon: 'accounts', route: 'accounts' },
    { id: 'files', label: 'Files', icon: 'folder', route: 'files' },
    { id: 'env', label: 'Env', icon: 'env', route: 'env' },
    { id: 'more', label: 'More', icon: 'more', route: null }
  ];
  const MORE_ROUTES = ['activity', 'profiles', 'modules', 'diagnostics', 'server', 'storage', 'settings', 'config'];

  let current = 'overview';
  let cleanups = [];
  let sidebarEl, pageEl, navBtns = {}, bandEl, tabbarEl, moreSheetEl;

  function onCleanup(fn) { cleanups.push(fn); }
  function runCleanups() { cleanups.forEach((fn) => { try { fn(); } catch (e) {} }); cleanups = []; }
  function navigate(id) {
    if (id === current) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    location.hash = '#/' + id;
  }

  function makeCtx() {
    return { navigate, setDirty: (on) => NIGHT.dirty.set('page', on), reload: () => renderPage(current, makeCtx()), refreshNav, refreshBand: () => NIGHT.band.refresh(), onCleanup };
  }

  function activeTabFor(routeId) {
    if (routeId === 'overview' || routeId === 'accounts' || routeId === 'files' || routeId === 'env') return routeId;
    return 'more';
  }

  function updateTabState() {
    if (!tabbarEl) return;
    const active = activeTabFor(current);
    tabbarEl.querySelectorAll('.tab').forEach((btn) => {
      if (btn.dataset.tab === active) btn.setAttribute('aria-current', 'page'); else btn.removeAttribute('aria-current');
    });
    Object.entries(navBtns).forEach(([k, b]) => {
      if (k === current) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    if (moreSheetEl) {
      moreSheetEl.querySelectorAll('.sheet-item').forEach((it) => {
        if (it.dataset.route === current) it.setAttribute('aria-current', 'page'); else it.removeAttribute('aria-current');
      });
    }
  }

  let renderSeq = 0;
  let liveEl = null;
  async function renderPage(id, ctx, opts) {
    const seq = ++renderSeq;
    runCleanups();
    NIGHT.dirty.clear();
    const route = flat.find((r) => r.id === id) || flat[0];
    current = route.id;
    // keep the URL honest if someone typed or followed a bad hash
    if (route.id !== id || (location.hash || '') !== '#/' + route.id) history.replaceState(null, '', '#/' + route.id);
    document.title = route.label + ' \u00b7 NIGHT Control Centre';
    updateTabState();
    closeMoreSheet(true);
    pageEl.innerHTML = '';
    pageEl.setAttribute('aria-busy', 'true');
    window.scrollTo({ top: 0 });
    NIGHT.band.refresh();
    try { await route.render(pageEl, ctx); }
    catch (e) { if (seq !== renderSeq) return; console.error(e); pageEl.innerHTML = ''; pageEl.append(ui.errorState(e, () => renderPage(route.id, makeCtx()))); }
    if (seq !== renderSeq) return; // a newer navigation took over while this page was loading
    pageEl.removeAttribute('aria-busy');
    if (opts && opts.focus) {
      const title = pageEl.querySelector('.page-title');
      const target = title || pageEl;
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
      target.style.outline = 'none';
    }
    if (liveEl) liveEl.textContent = route.label;
  }

  async function refreshNav() {
    if (!navBtns.accounts) return;
    const badge = navBtns.accounts.querySelector('.nav-count');
    if (!badge) return;
    try { const list = await NIGHT.api.listAccounts(); badge.textContent = list.length; } catch (e) {}
  }

  let sheetReturnFocus = null;
  function openMoreSheet() {
    if (!moreSheetEl) return;
    sheetReturnFocus = document.activeElement;
    moreSheetEl.classList.add('open');
    moreSheetEl.removeAttribute('aria-hidden');
    const moreTab = tabbarEl && tabbarEl.querySelector('[data-tab="more"]');
    if (moreTab) moreTab.setAttribute('aria-expanded', 'true');
    const cur = moreSheetEl.querySelector('.sheet-item[aria-current="page"]') || moreSheetEl.querySelector('.sheet-item');
    if (cur) setTimeout(() => cur.focus(), 80);
  }
  function closeMoreSheet(skipFocus) {
    if (!moreSheetEl || !moreSheetEl.classList.contains('open')) return;
    moreSheetEl.classList.remove('open');
    moreSheetEl.setAttribute('aria-hidden', 'true');
    const moreTab = tabbarEl && tabbarEl.querySelector('[data-tab="more"]');
    if (moreTab) moreTab.setAttribute('aria-expanded', 'false');
    if (!skipFocus && sheetReturnFocus && sheetReturnFocus.focus) sheetReturnFocus.focus();
    sheetReturnFocus = null;
  }

  // Ask before leaving a page that has unsaved work. Returns true when it's fine to go.
  async function okToLeave() {
    if (!NIGHT.dirty.any()) return true;
    return ui.confirmAction({ title: 'Leave without saving?', message: 'You have changes that haven\u2019t been saved. If you leave now they will be lost.', confirmLabel: 'Leave page', danger: true });
  }

  function build() {
    const app = document.getElementById('app');
    app.className = 'app';
    app.innerHTML = '';

    const nav = h('nav', { class: 'nav', 'aria-label': 'Primary' });
    ROUTES.forEach((group) => {
      const g = h('div', { class: 'nav-group' }, h('div', { class: 'nav-label' }, group.group));
      group.items.forEach((item) => {
        const btn = h('button', { class: 'nav-item', type: 'button', onclick: () => navigate(item.id) },
          icon(item.icon, 15), h('span', { class: 'truncate' }, item.label), item.badge ? h('span', { class: 'nav-count' }, '—') : null);
        navBtns[item.id] = btn;
        g.append(btn);
      });
      nav.append(g);
    });

    sidebarEl = h('aside', { class: 'sidebar', 'aria-label': 'Sidebar' },
      h('div', { class: 'brand' }, h('div', { class: 'brand-mark' }, 'N'),
        h('div', { class: 'brand-text' }, h('span', { class: 'brand-name' }, 'NIGHT'), h('span', { class: 'brand-sub' }, 'Control Centre'))),
      nav,
      h('div', { class: 'sidebar-foot' },
        h('div', { class: 'adapter-note' }, NIGHT.api.isMock ? 'Mock adapter' : 'Live adapter', h('span', {}, NIGHT.api.isMock ? 'No server contact' : 'Authenticated same-origin API')),
        NIGHT.api.isMock ? null : h('button', { class: 'btn sm', type: 'button', style: { marginTop: '10px', width: '100%' }, onclick: signOut }, icon('power', 14), 'Sign out')
      )
    );

    bandEl = h('div', { id: 'band' });
    pageEl = h('main', { class: 'content', id: 'page' });
    app.append(sidebarEl, h('div', { class: 'main-wrap' }, bandEl, pageEl));
    NIGHT.band.mount(bandEl);

    tabbarEl = document.getElementById('tabbar');
    tabbarEl.innerHTML = '';
    TABS.forEach((t) => {
      tabbarEl.append(h('button', { class: 'tab', type: 'button', 'data-tab': t.id, 'aria-haspopup': t.id === 'more' ? 'dialog' : null, 'aria-expanded': t.id === 'more' ? 'false' : null, onclick: () => { if (t.id === 'more') { openMoreSheet(); return; } if (t.route) navigate(t.route); } },
        icon(t.icon, 22), h('span', {}, t.label)));
    });

    moreSheetEl = document.getElementById('more-sheet');
    moreSheetEl.innerHTML = '';
    moreSheetEl.setAttribute('aria-hidden', 'true');
    moreSheetEl.append(h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'More sections' },
      h('div', { class: 'sheet-grip' }), h('div', { class: 'sheet-head' }, 'More'),
      ...MORE_ROUTES.map((rid) => {
        const r = flat.find((x) => x.id === rid);
        if (!r) return null;
        return h('button', { class: 'sheet-item', 'data-route': rid, onclick: () => { closeMoreSheet(); navigate(rid); } }, icon(r.icon, 20), h('span', {}, r.label));
      })
    ));
    let sheetDown = false;
    moreSheetEl.addEventListener('pointerdown', (e) => { sheetDown = e.target === moreSheetEl; });
    moreSheetEl.addEventListener('click', (e) => { if (sheetDown && e.target === moreSheetEl) closeMoreSheet(); sheetDown = false; });
    moreSheetEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeMoreSheet(); return; }
      if (e.key !== 'Tab') return;
      const items = Array.from(moreSheetEl.querySelectorAll('.sheet-item'));
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    // swipe down on the sheet to dismiss
    const sheetBox = moreSheetEl.querySelector('.sheet');
    let sy = null;
    sheetBox.addEventListener('touchstart', (e) => { sy = e.touches[0].clientY; }, { passive: true });
    sheetBox.addEventListener('touchend', (e) => { if (sy !== null && e.changedTouches[0].clientY - sy > 70) closeMoreSheet(); sy = null; }, { passive: true });

    let reverting = false;
    window.addEventListener('hashchange', async () => {
      if (reverting) { reverting = false; return; }
      const id = (location.hash || '').replace(/^#\/?/, '') || 'overview';
      if (id === current) return;
      if (!await okToLeave()) { reverting = true; history.pushState(null, '', '#/' + current); return; }
      renderPage(id, makeCtx(), { focus: true });
    });

    // screen-reader announcement for page changes + skip link
    liveEl = h('div', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true', style: { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' } });
    document.body.append(liveEl);
    const skip = h('a', { href: '#page', class: 'skip-link', style: { position: 'fixed', left: '8px', top: '-48px', zIndex: '120', background: 'var(--accent)', color: 'var(--accent-ink)', padding: '10px 14px', borderRadius: 'var(--r-sm)', fontWeight: '600', transition: 'top .15s' },
      onfocus: (e) => { e.target.style.top = '8px'; }, onblur: (e) => { e.target.style.top = '-48px'; },
      onclick: (e) => { e.preventDefault(); pageEl.setAttribute('tabindex', '-1'); pageEl.focus(); } }, 'Skip to content');
    document.body.prepend(skip);

    // "/" jumps to the page's search box (when you're not typing somewhere already)
    document.addEventListener('keydown', (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target, tag = t && t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
      if (document.querySelector('.overlay.open')) return;
      const s = pageEl.querySelector('.search input');
      if (s) { e.preventDefault(); s.focus(); s.select(); }
    });

    // connection awareness
    window.addEventListener('offline', () => ui.toast('You\u2019re offline', 'warn', 'Changes can\u2019t reach the server until the connection returns.'));
    window.addEventListener('online', () => { ui.toast('Back online', 'ok'); NIGHT.band.refresh(); });
    updateTabState();
  }

  function updateCsrfToken(token) {
    const meta = document.querySelector('meta[name="csrf-token"]');
    if (meta) meta.content = typeof token === 'string' ? token : '';
  }

  function renderLogin(message) {
    const app = document.getElementById('app');
    app.replaceChildren();
    const tabbar = document.getElementById('tabbar');
    const sheet = document.getElementById('more-sheet');
    if (tabbar) tabbar.hidden = true;
    if (sheet) { sheet.classList.remove('open'); sheet.setAttribute('aria-hidden', 'true'); }
    const password = h('input', { class: 'input auth-password', type: 'password', name: 'password', autocomplete: 'current-password', required: true, placeholder: 'Administrator password' });
    const error = h('p', { class: 'auth-error', role: 'alert', hidden: !message }, message || '');
    const submit = h('button', { class: 'btn primary auth-submit', type: 'submit' }, 'Sign in');
    const form = h('form', { class: 'auth-form', onsubmit: async (event) => {
      event.preventDefault(); error.hidden = true; submit.disabled = true; submit.textContent = 'Signing in…';
      try {
        const session = await NIGHT.api.login(password.value);
        if (!session || session.authenticated !== true) throw new NIGHT.ApiError('AUTH_RESPONSE', 'The server did not confirm an authenticated session.', 502);
        updateCsrfToken(session.csrfToken);
        if (tabbar) tabbar.hidden = false;
        startDashboard();
      } catch (e) {
        error.textContent = e && e.message ? e.message : 'Sign-in failed.'; error.hidden = false; password.focus();
      } finally { submit.disabled = false; submit.textContent = 'Sign in'; }
    }
    }, password, error, submit);
    const retry = h('button', { class: 'btn ghost auth-retry', type: 'button', onclick: boot }, 'Retry connection');
    app.append(h('main', { class: 'auth-page' },
      h('div', { class: 'auth-content' },
        h('div', { class: 'auth-mark' }, 'N'),
        h('p', { class: 'auth-kicker' }, 'NIGHT / CONTROL CENTRE'),
        h('h1', { class: 'auth-title' }, 'Administrator sign in'),
        h('p', { class: 'auth-copy' }, 'This console is restricted to authorized operators. Your session stays in an HttpOnly server cookie.'),
        form,
        message && /Could not|backend does not implement|network|unavailable|timed out/i.test(message) ? retry : null,
        h('p', { class: 'auth-foot' }, 'Live mode · Same-origin API · No password is stored in this browser')
      )
    ));
    password.focus();
  }

  async function signOut() {
    try { await NIGHT.api.logout(); updateCsrfToken(''); renderLogin('You have signed out.'); }
    catch (e) { ui.failure(e); }
  }

  async function startDashboard() {
    build();
    const initial = (location.hash || '').replace(/^#\/?/, '') || 'overview';
    await renderPage(flat.some((r) => r.id === initial) ? initial : 'overview', makeCtx());
    refreshNav();
    if (NIGHT.api.isMock) {
      setTimeout(() => { ui.toast('Running in mock mode', 'info', 'All data is generated in the browser. No connection to the live bot exists.'); }, 900);
    }
  }

  async function boot() {
    if (NIGHT.api.isMock) { await startDashboard(); return; }
    try {
      const session = await NIGHT.api.getSession();
      updateCsrfToken(session && session.csrfToken);
      if (!session || session.authenticated !== true) { renderLogin(); return; }
      await startDashboard();
    } catch (e) {
      renderLogin('Could not verify the administrator session: ' + (e && e.message ? e.message : 'API unavailable'));
    }
  }

  window.addEventListener('night:unauthorized', () => {
    updateCsrfToken('');
    renderLogin('Your administrator session expired. Sign in again.');
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
