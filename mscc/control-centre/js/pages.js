NIGHT.pages = (function () {
  const { h, timeAgo, num, bytes, duration, clock, store } = NIGHT.util;
  const { icon } = NIGHT.icons;
  const ui = NIGHT.ui;
  const api = NIGHT.api;

  async function overview(root, ctx) {
    root.append(ui.skeletonRows(3));
    let data, acts, accounts;
    try {
      [data, acts, accounts] = await Promise.all([api.getOverview(), api.listActivity({ limit: 6 }), api.listAccounts()]);
    } catch (e) { root.innerHTML = ''; root.append(ui.errorState(e, () => ctx.reload())); return; }
    root.innerHTML = '';

    if (accounts.length === 0) {
      root.append(
        h('div', { class: 'first-run' },
          h('h2', {}, 'Nothing is linked yet.'),
          h('p', { class: 'lede' }, 'An account is one WhatsApp identity: a phone number and its session. The bot sends and receives on that number\u2019s behalf. Pairing links the number to this console.'),
          h('div', { class: 'first-run-actions' },
            h('button', { class: 'btn primary', onclick: () => { location.hash = '#/accounts'; } }, icon('plus', 16), 'Create your first account'),
            h('button', { class: 'btn', onclick: () => { location.hash = '#/modules'; } }, icon('commands', 16), 'Review commands')
          ),
          h('div', { class: 'first-run-next' },
            firstRunRow('layers', 'Behaviour profiles define how accounts act', 'A profile switches modules on or off. Several accounts can share one, and each can override it.'),
            firstRunRow('settings', 'Confirm reconnect behaviour', 'Auto-reconnect and notification preferences live in Settings. Defaults are safe for a first run.'),
            firstRunRow('diagnostics', 'Run a health check', 'Diagnostics probes the bot process and dependencies — useful before pairing anything.')
          )
        )
      );
      return;
    }

    const f = data.fleet;
    root.append(
      h('div', { class: 'page-head' },
        h('div', { class: 'page-title' }, 'Overview'),
        h('div', { class: 'page-desc' }, 'Fleet health, message volume and recent activity.')
      ),
      api.isMock ? ui.mockBanner('Seeded sample data. Nothing has been read from or written to the running bot.') : null,
      h('div', { class: 'stats', style: { marginBottom: '14px' } },
        h('div', { class: 'stat' }, h('div', { class: 'stat-label' }, 'Bot process'), h('div', { class: 'stat-value' }, 'Running'), h('div', { class: 'stat-sub' }, 'v' + data.bot.version + ' · up ' + duration(data.bot.uptimeSeconds))),
        h('div', { class: 'stat' }, h('div', { class: 'stat-label' }, 'Accounts online'), h('div', { class: 'stat-value' }, f.online, h('small', {}, '/ ' + f.total)), h('div', { class: 'stat-sub' }, f.offline + ' offline · ' + f.pairing + ' pairing')),
        h('div', { class: 'stat' }, h('div', { class: 'stat-label' }, 'Messages 24h'), h('div', { class: 'stat-value' }, data.messages24h == null ? '—' : num(data.messages24h)), h('div', { class: 'stat-sub' }, data.messages24h == null ? 'Not tracked by the current MSCC activity API' : 'across all active sessions')),
        h('div', { class: 'stat' }, h('div', { class: 'stat-label' }, 'Commands enabled'), h('div', { class: 'stat-value' }, data.modulesEnabled, h('small', {}, '/ ' + data.modulesTotal)), h('div', { class: 'stat-sub' }, f.attention + ' account(s) need attention'))
      ),
      h('div', { class: 'grid grid-main' },
        h('div', { class: 'stack' },
          h('div', { class: 'panel' },
            h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, 'Recent activity'),
              h('button', { class: 'btn ghost sm', onclick: () => ctx.navigate('activity') }, 'View all', icon('chevron', 13))),
            h('div', {}, acts.items.map(eventRow))
          )
        ),
        h('div', { class: 'stack' },
          h('div', { class: 'panel' },
            h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, 'Fleet status')),
            h('div', { class: 'panel-body stack', style: { gap: '12px' } },
              fleetRow('Online', f.online, f.total, 'var(--green)'),
              fleetRow('Pairing', f.pairing, f.total, 'var(--amber)'),
              fleetRow('Needs attention', f.attention, f.total, 'var(--red)'),
              fleetRow('Offline', f.offline, f.total, 'var(--text-mute)')
            )
          ),
          h('div', { class: 'panel' },
            h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, 'Quick actions')),
            h('div', { class: 'panel-body stack' },
              h('button', { class: 'btn', onclick: () => ctx.navigate('accounts') }, icon('accounts', 16), 'Manage accounts'),
              h('button', { class: 'btn', onclick: () => ctx.navigate('diagnostics') }, icon('diagnostics', 16), 'Run diagnostics'),
              h('button', { class: 'btn', onclick: () => ctx.navigate('activity') }, icon('activity', 16), 'Open activity log')
            )
          )
        )
      )
    );
  }

  function firstRunRow(ic, title, desc) {
    return h('div', { class: 'row plain' },
      h('span', { class: 'icn' }, icon(ic, 18)),
      h('div', { class: 'body' }, h('div', { class: 'title' }, title), h('div', { class: 'desc' }, desc))
    );
  }
  function fleetRow(label, value, total, color) {
    const pct = total ? (value / total) * 100 : 0;
    return h('div', { class: 'stack', style: { gap: '5px' } },
      h('div', { class: 'hstack', style: { justifyContent: 'space-between' } }, h('span', { class: 'small dim' }, label), h('span', { class: 'small', style: { fontVariantNumeric: 'tabular-nums' } }, value)),
      h('div', { class: 'meter' }, h('i', { style: { width: pct + '%', background: color } }))
    );
  }
  function eventRow(ev) {
    return h('div', { class: 'event' },
      h('span', { class: 'event-dot ' + ev.severity }),
      h('div', { class: 'event-body' },
        h('div', { class: 'event-title' }, ev.title),
        h('div', { class: 'event-desc' }, ev.detail),
        h('div', { class: 'event-meta' },
          h('span', { class: 'tiny mute' }, timeAgo(ev.ts)),
          h('span', { class: 'tiny mute sep' }, '·'),
          h('span', { class: 'mono tiny mute' }, ev.source),
          ev.accountId ? h('span', { class: 'mono tiny mute', style: { marginLeft: '6px' } }, ev.accountId) : null
        )
      )
    );
  }

  async function modulesPage(root, ctx) {
    let list;
    try { list = await api.listModules(); }
    catch (e) { root.append(ui.errorState(e, () => ctx.reload())); return; }
    root.innerHTML = '';

    const categories = Array.from(new Set(list.map((m) => m.category)));
    const container = h('div', { class: 'stack' });

    function render() {
      container.innerHTML = '';
      categories.forEach((cat) => {
        const items = list.filter((m) => m.category === cat);
        if (!items.length) return;
        const en = items.filter((m) => m.enabled).length;
        container.append(h('div', { class: 'panel' },
          h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, cat), h('span', { class: 'mono tiny mute' }, en + ' / ' + items.length + ' available')),
          h('div', {}, items.map((m) =>
            h('div', { class: 'row plain' },
              h('div', { class: 'col-id' },
                h('div', { class: 'avatar', style: { width: '30px', height: '30px', fontSize: '12px' } }, '!'),
                h('div', { style: { minWidth: '0' } }, h('div', { class: 'name mono' }, m.name), h('div', { class: 'meta truncate' }, m.description))
              ),
              h('div', { class: 'col-status', style: { flex: '0 0 auto' } },
                ui.switchEl(m.enabled, async (next) => {
                  try {
                    await api.toggleModule(m.id, next);
                    m.enabled = next;
                    ui.success('Module ' + (next ? 'available' : 'disabled globally'), NIGHT.api.isMock ? 'Simulated — not applied to a running bot.' : undefined);
                    render(); ctx.refreshBand();
                  } catch (e) { ui.failure(e); render(); return false; }
                }, false, m.name)
              )
            )
          ))
        ));
      });
    }

    root.append(
      h('div', { class: 'page-head' },
        h('div', { class: 'page-title' }, 'Commands & modules'),
        h('div', { class: 'page-desc' }, 'Global availability. A module switched off here cannot be enabled by any behaviour profile or account.')
      ),
      api.isMock ? ui.mockBanner('Toggling a module here does not modify the running Node.js bot. The mock adapter records the change in memory only.') : null,
      h('div', { class: 'toolbar' },
        h('div', { class: 'hstack', style: { gap: '10px' } },
          h('span', { class: 'mono tiny mute' }, 'prefix ' + (data.commandPrefix || '!')),
          h('span', { class: 'mono tiny mute' }, list.filter((m) => m.enabled).length + ' available')
        ),
        h('div', { class: 'spacer' })
      ),
      container
    );
    render();
  }

  async function activityPage(root, ctx) {
    let accounts;
    try { accounts = await api.listAccounts(); }
    catch (e) { root.append(ui.errorState(e, () => ctx.reload())); return; }
    root.innerHTML = '';

    const params = { limit: 10, cursor: 0, severity: 'all', accountId: 'all', query: '' };
    const listEl = h('div', { class: 'panel' });
    const moreBtn = h('button', { class: 'btn', onclick: loadMore }, 'Load more');
    let loading = false;

    function renderRows(items, append) {
      if (!append) listEl.innerHTML = '';
      items.forEach((ev) => listEl.append(eventRow(ev)));
    }
    async function load(append) {
      if (loading) return;
      loading = true; moreBtn.disabled = true; moreBtn.innerHTML = '';
      moreBtn.append(h('span', { class: 'spinner' }), 'Loading…');
      try {
        const res = await api.listActivity(params);
        renderRows(res.items, append);
        params.cursor = res.nextCursor === null ? params.cursor : res.nextCursor;
        moreBtn.style.display = res.nextCursor === null ? 'none' : '';
        if (!append && !res.items.length) {
          listEl.innerHTML = '';
          listEl.append(ui.emptyState('activity', 'No events match', 'Try widening the filters or clearing the search.'));
        }
      } catch (e) {
        if (!append) { listEl.innerHTML = ''; listEl.append(ui.errorState(e, () => load(false))); }
        else ui.failure(e);
      } finally {
        loading = false; moreBtn.disabled = false; moreBtn.innerHTML = ''; moreBtn.append('Load more');
      }
    }
    function loadMore() { params.cursor = params.cursor || 0; load(true); }

    const sevSel = h('select', { class: 'select', style: { minWidth: '128px', flex: '1 1 auto' }, onchange: (e) => { params.severity = e.target.value; params.cursor = 0; load(false); } },
      h('option', { value: 'all' }, 'All severities'), h('option', { value: 'success' }, 'Success'), h('option', { value: 'info' }, 'Info'), h('option', { value: 'warning' }, 'Warning'), h('option', { value: 'error' }, 'Error'));
    const accSel = h('select', { class: 'select', style: { minWidth: '140px', flex: '1 1 auto' }, onchange: (e) => { params.accountId = e.target.value; params.cursor = 0; load(false); } },
      h('option', { value: 'all' }, 'All accounts'), accounts.map((a) => h('option', { value: a.id }, a.name)));
    const search = h('input', { class: 'input', placeholder: 'Search events…',
      oninput: (e) => { clearTimeout(search._t); search._t = setTimeout(() => { params.query = e.target.value; params.cursor = 0; load(false); }, 260); } });

    root.append(
      h('div', { class: 'page-head' }, h('div', { class: 'page-title' }, 'Activity'), h('div', { class: 'page-desc' }, 'Chronological operator and system events. Newest first.')),
      api.isMock ? ui.mockBanner('These events are seeded sample data generated by the mock adapter. They do not reflect the state of the live bot.') : null,
      h('div', { class: 'toolbar' },
        h('div', { class: 'search', style: { maxWidth: '100%', flex: '1 1 100%' } }, icon('search', 16), search),
        sevSel, accSel, h('div', { class: 'spacer' }),
        h('button', { class: 'btn', onclick: () => { params.cursor = 0; load(false); } }, icon('refresh', 14), 'Refresh')
      ),
      listEl,
      h('div', { class: 'hstack', style: { justifyContent: 'center', marginTop: '16px' } }, moreBtn)
    );
    load(false);
  }

  async function diagnosticsPage(root, ctx) {
    const resultsEl = h('div', {});
    let running = false;
    const runBtn = h('button', { class: 'btn primary', onclick: run }, icon('diagnostics', 16), 'Run diagnostics');

    const CHECK_LABELS = [
      ['process', 'MSCC process'], ['accounts', 'Account registry'], ['control', 'Private control account']
    ];
    const STATUS_MAP = { idle: ['offline', 'Pending'], running: ['connecting', 'Running'], pass: ['online', 'Pass'], warn: ['pairing', 'Warning'], fail: ['attention', 'Fail'] };

    function checkRow(label, status, ms, detail) {
      const [kind, text] = STATUS_MAP[status] || STATUS_MAP.idle;
      return h('div', { class: 'row plain' },
        h('div', { class: 'col-id' },
          h('div', { class: 'avatar', style: { width: '28px', height: '28px', fontSize: '11px' } },
            status === 'running' ? h('span', { class: 'spinner', style: { width: '11px', height: '11px' } }) : icon(status === 'pass' ? 'check' : status === 'warn' || status === 'fail' ? 'alert' : 'clock', 14)),
          h('div', { style: { minWidth: '0' } }, h('div', { class: 'name' }, label), h('div', { class: 'meta truncate' }, detail || '—'))
        ),
        h('div', { class: 'col-status', style: { flex: '0 0 auto' } }, ui.status(kind, text)),
        h('div', { class: 'col-time' }, ms ? ms + ' ms' : '')
      );
    }

    function renderIdle() {
      resultsEl.innerHTML = '';
      resultsEl.append(h('div', { class: 'panel' },
        h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, 'Checks')),
        h('div', {}, CHECK_LABELS.map(([id, label]) => checkRow(label, 'idle', null, 'Not yet run.')))
      ));
    }

    async function run() {
      if (running) return;
      running = true; runBtn.disabled = true;
      runBtn.innerHTML = ''; runBtn.append(h('span', { class: 'spinner' }), 'Running…');
      resultsEl.innerHTML = '';
      const card = h('div', { class: 'panel' }, h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, 'Checks'), h('span', { class: 'mono tiny mute' }, api.isMock ? 'simulated' : 'live snapshot')));
      const rows = CHECK_LABELS.map(([id, label]) => ({ id, label }));
      rows.forEach((r) => { r.el = checkRow(r.label, 'idle', null, 'Queued.'); card.append(r.el); });
      resultsEl.append(card);
      try {
        if (api.isMock) {
          for (const r of rows) {
            r.el.replaceWith((r.el = checkRow(r.label, 'running', null, 'Executing…')));
            card.append(r.el);
            await NIGHT.util.delay(260 + Math.random() * 220);
          }
        } else {
          rows.forEach(r => { r.el.replaceWith((r.el = checkRow(r.label, 'running', null, 'Reading live MSCC state…'))); card.append(r.el); });
        }
        const result = await api.runDiagnostics();
        card.innerHTML = '';
        card.append(h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, 'Checks'), h('span', { class: 'mono tiny mute' }, 'run at ' + clock(result.runAt))));
        result.checks.forEach((c) => card.append(checkRow(c.label, c.status, c.ms, c.detail)));
        const warns = result.checks.filter((c) => c.status === 'warn').length;
        const fails = result.checks.filter((c) => c.status === 'fail').length;
        ui.success('Diagnostics complete', fails ? fails + ' failure(s) reported.' : warns ? warns + ' warning(s) reported.' : 'All checks passed.');
        ctx.refreshBand();
      } catch (e) {
        resultsEl.innerHTML = ''; resultsEl.append(ui.errorState(e, run));
        ui.failure(e);
      } finally {
        running = false; runBtn.disabled = false;
        runBtn.innerHTML = ''; runBtn.append(icon('diagnostics', 16), 'Run diagnostics');
      }
    }

    root.append(
      h('div', { class: 'page-head' }, h('div', { class: 'page-title' }, 'Diagnostics'), h('div', { class: 'page-desc' }, api.isMock ? 'Simulated checks against sample data.' : 'Read-only checks against MSCC process state and account registry.')),
      api.isMock ? ui.mockBanner('These checks are simulated in the browser. No probe is sent to the server.') : null,
      h('div', { class: 'toolbar' }, runBtn, h('div', { class: 'spacer' })),
      resultsEl
    );
    renderIdle();
  }

  async function storagePage(root, ctx) {
    let data;
    try { data = await api.getStorage(); }
    catch (e) { root.append(ui.errorState(e, () => ctx.reload())); return; }
    root.innerHTML = '';
    const pct = data.total ? (data.used / data.total) * 100 : 0;

    root.append(
      h('div', { class: 'page-head' }, h('div', { class: 'page-title' }, 'Storage'), h('div', { class: 'page-desc' }, 'Session archives, exports and media held in object storage.')),
      api.isMock ? ui.mockBanner('Storage contents are sample records. No files are listed from, or downloaded to, real cloud storage.') : null,
      h('div', { class: 'panel', style: { marginBottom: '14px' } },
        h('div', { class: 'panel-body stack' },
          h('div', { class: 'hstack', style: { justifyContent: 'space-between' } },
            h('div', { style: { flex: '1', minWidth: '0' } },
              h('div', { class: 'small dim' }, data.provider + ' · ' + data.container),
              h('div', { style: { fontSize: '22px', fontWeight: '600', letterSpacing: '-.03em', marginTop: '4px' } }, bytes(data.used), h('small', { class: 'mute', style: { fontSize: '13px', fontWeight: '500' } }, ' of ' + bytes(data.total)))
            )
          ),
          ui.meter(pct, pct > 85 ? 'crit' : pct > 70 ? 'warn' : '')
        )
      ),
      h('div', { class: 'list' },
        h('div', { class: 'list-head' }, h('div', { class: 'col-id' }, 'Object'), h('div', { class: 'col-profile' }, 'Type'), h('div', { class: 'col-status' }, 'Size'), h('div', { class: 'col-time' }, 'Modified')),
        data.files.length
          ? data.files.map((f) => h('div', { class: 'row plain' },
              h('div', { class: 'col-id' },
                h('div', { class: 'avatar', style: { width: '30px', height: '30px' } }, icon('file', 15)),
                h('div', { style: { minWidth: '0' } }, h('div', { class: 'name mono truncate' }, f.name))),
              h('div', { class: 'col-profile' }, h('span', { class: 'mono tiny mute' }, f.type)),
              h('div', { class: 'col-status' }, h('span', { class: 'small dim' }, bytes(f.size))),
              h('div', { class: 'col-time' }, timeAgo(f.modified))
            ))
          : ui.emptyState('storage', 'No objects stored', 'Session archives and exports will appear here once the bot writes to storage.')
      )
    );
  }

  async function settingsPage(root, ctx) {
    let s;
    try { s = await api.getSettings(); }
    catch (e) { root.append(ui.errorState(e, () => ctx.reload())); return; }
    root.innerHTML = '';

    if (!api.isMock && api.capabilities?.settingsEditor) {
      const entries = Object.entries(s).filter(([, value]) => typeof value === 'boolean');
      const draftLive = Object.assign({}, s);
      let dirtyLive = false;
      const saveLive = h('button', { class: 'btn primary', disabled: true, onclick: saveLiveSettings }, icon('check', 16), 'Save command settings');
      const list = h('div', { class: 'list' });
      entries.forEach(([key, value]) => {
        const label = key.replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        list.append(h('div', { class: 'row plain' },
          h('div', { style: { flex: '1', minWidth: '0' } },
            h('div', { class: 'name' }, label),
            h('div', { class: 'meta' }, 'Existing boolean command setting from the MSCC registry. This change affects global command availability.')),
          ui.switchEl(Boolean(value), next => { draftLive[key] = next; dirtyLive = true; saveLive.disabled = false; ctx.setDirty(true); }, false, label)));
      });
      async function saveLiveSettings() {
        saveLive.disabled = true; saveLive.textContent = 'Saving…';
        try {
          await api.saveSettings(draftLive);
          dirtyLive = false; ctx.setDirty(false);
          ui.success('MSCC command settings saved', 'The existing MSCC settings writer accepted the changes.');
          saveLive.innerHTML = ''; saveLive.append(icon('check', 16), 'Save command settings');
        } catch (error) {
          ui.failure(error); saveLive.disabled = false;
          saveLive.innerHTML = ''; saveLive.append(icon('check', 16), 'Save command settings');
        }
      }
      root.append(
        h('div', { class: 'page-head' }, h('div', { class: 'page-title' }, 'Settings'), h('div', { class: 'page-desc' }, 'Actual boolean command-availability settings exposed by the current MSCC runtime.')),
        h('div', { class: 'panel' }, h('div', { class: 'panel-body small dim' }, 'This page deliberately does not show invented preferences such as read receipts, presence, auto-responder, time zone or retention. Only settings already registered in MSCC can be changed here.')),
        list,
        h('div', { class: 'hstack', style: { marginTop: '16px', justifyContent: 'flex-end' } }, saveLive)
      );
      ctx.onCleanup(() => { if (dirtyLive) ui.toast('Unsaved MSCC settings discarded.', 'warn'); });
      return;
    }

    const draft = Object.assign({}, s);
    let dirty = false;
    const saveBtn = h('button', { class: 'btn primary', disabled: true, onclick: save }, icon('check', 16), 'Save changes');

    function mark() { dirty = true; saveBtn.disabled = false; ctx.setDirty(true); }

    function toggleRow(label, hint, key) {
      return h('div', { class: 'row plain' },
        h('div', { style: { flex: '1', minWidth: '0' } }, h('div', { class: 'name' }, label), h('div', { class: 'meta', style: { whiteSpace: 'normal', marginTop: '3px' } }, hint)),
        ui.switchEl(!!draft[key], (next) => { draft[key] = next; mark(); }, false, label)
      );
    }
    function textRow(label, hint, key, ph) {
      const input = ui.textInput({ value: draft[key] || '', placeholder: ph || '' });
      input.addEventListener('input', () => { draft[key] = input.value; mark(); });
      return h('div', { class: 'panel-body', style: { paddingTop: '12px', paddingBottom: '12px' } }, ui.field(label, input, hint));
    }

    async function save() {
      saveBtn.disabled = true;
      saveBtn.innerHTML = ''; saveBtn.append(h('span', { class: 'spinner' }), 'Saving…');
      try {
        const merged = await api.saveSettings(draft);
        Object.assign(s, merged);
        ui.success('Settings saved', NIGHT.api.isMock ? 'Stored in this browser only — the bot configuration is unchanged.' : undefined);
        dirty = false; ctx.setDirty(false);
        saveBtn.innerHTML = ''; saveBtn.append(icon('check', 16), 'Save changes'); saveBtn.disabled = true;
      } catch (e) {
        ui.failure(e);
        saveBtn.innerHTML = ''; saveBtn.append(icon('check', 16), 'Save changes'); saveBtn.disabled = false;
      }
    }

    root.append(
      h('div', { class: 'page-head' }, h('div', { class: 'page-title' }, 'Settings'), h('div', { class: 'page-desc' }, 'Operator preferences and bot behaviour configuration.')),
      api.isMock ? ui.mockBanner('Every control below writes to the mock adapter (localStorage). The running bot is not reconfigured.') : null,
      h('div', { class: 'stack' },
        h('div', { class: 'panel' },
          h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, 'General')),
          textRow('Bot display name', 'Shown in the console and in operator notifications.', 'botName', 'NIGHT'),
          textRow('Command prefix', 'Character(s) that trigger bot commands.', 'prefix', '!'),
          h('div', { class: 'panel-body', style: { paddingTop: '0' } },
            ui.field('Timezone', (() => {
              return h('select', { class: 'select', onchange: (e) => { draft.timezone = e.target.value; mark(); } },
                ['UTC', 'Europe/London', 'Europe/Berlin', 'Africa/Lagos', 'Asia/Kolkata', 'America/New_York']
                  .map((tz) => h('option', { value: tz, selected: tz === draft.timezone ? true : null }, tz)));
            })(), 'Used for scheduled messages and activity timestamps.')
          )
        ),
        h('div', { class: 'panel' },
          h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, 'Connection behaviour')),
          toggleRow('Auto-reconnect', 'Restore dropped sessions with exponential backoff.', 'autoReconnect'),
          toggleRow('Read receipts', 'Mark incoming messages as read automatically.', 'readReceipts'),
          toggleRow('Presence updates', 'Broadcast online / typing presence to contacts.', 'presenceUpdates'),
          toggleRow('Auto-responder', 'Keyword-triggered replies outside business hours.', 'autoResponder')
        ),
        h('div', { class: 'panel' },
          h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, 'Notifications')),
          toggleRow('Error alerts', 'Notify when an account enters the attention state.', 'notifyErrors'),
          toggleRow('Daily digest', 'Send a summary of fleet activity once per day.', 'notifyDailyDigest'),
          toggleRow('Storage warnings', 'Warn when cloud storage exceeds 80% of its quota.', 'notifyStorage')
        ),
        h('div', { class: 'panel' },
          h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, 'Data & retention')),
          h('div', { class: 'panel-body' },
            ui.field('Activity retention',
              h('select', { class: 'select', onchange: (e) => { draft.retentionDays = e.target.value; mark(); } },
                [['7', '7 days'], ['30', '30 days'], ['90', '90 days'], ['365', '1 year']].map(([v, l]) => h('option', { value: v, selected: v === draft.retentionDays ? true : null }, l))),
              'Older activity events are pruned automatically.')
          )
        ),
        h('div', { class: 'panel' },
          h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, 'API integration')),
          h('div', { class: 'panel-body stack' },
            h('dl', { class: 'kv' },
              h('dt', {}, 'Adapter'), h('dd', {}, api.isMock ? ui.status('pairing', 'Mock') : ui.status('online', 'Live')),
              h('dt', {}, 'Base path'), h('dd', { class: 'mono' }, NIGHT_CONFIG.apiBase),
              h('dt', {}, 'Origin'), h('dd', { class: 'mono' }, window.location.origin),
              h('dt', {}, 'Contract'), h('dd', {}, 'API_CONTRACT.md (v1)')
            ),
            h('p', { class: 'hint', style: { fontSize: '12px', color: 'var(--text-mute)', lineHeight: '1.55' } },
              'Live mode requires a backend implementing every endpoint in the contract. All requests use same-origin relative paths — the browser never contacts the Azure host directly.')
          )
        ),
        h('div', { class: 'panel' },
          h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, 'Mock data controls')),
          h('div', { class: 'panel-body stack', style: { gap: '12px' } },
            h('p', { class: 'small dim', style: { lineHeight: '1.55' } }, 'The mock adapter seeds a sample fleet so all screens have content. Reset or clear it here. These controls affect only this browser.'),
            h('div', { class: 'stack', style: { gap: '8px' } },
              h('button', { class: 'btn', onclick: () => { store.remove('night.settings'); ui.toast('Local settings cleared.', 'ok'); } }, icon('refresh', 16), 'Clear saved settings'),
              h('button', { class: 'btn', onclick: async () => {
                const ok = await ui.confirmAction({ title: 'Simulate a fresh install?', message: 'This clears seeded accounts, profiles and activity, then reloads so you can inspect the first-run experience.', confirmLabel: 'Simulate fresh install' });
                if (!ok) return;
                store.remove('night.settings');
                localStorage.setItem('night.mock.seed', 'false');
                location.href = location.pathname + '?fresh=1';
              } }, icon('trash', 16), 'Simulate fresh install'),
              h('button', { class: 'btn', onclick: async () => {
                const ok = await ui.confirmAction({ title: 'Restore sample data?', message: 'Removes any local changes and reloads with the seeded sample fleet.', confirmLabel: 'Restore sample data' });
                if (!ok) return;
                store.remove('night.settings');
                localStorage.removeItem('night.mock.seed');
                location.href = location.pathname;
              } }, icon('refresh', 16), 'Restore sample data')
            )
          )
        )
      ),
      h('div', { class: 'hstack', style: { marginTop: '16px', justifyContent: 'flex-end' } }, saveBtn)
    );

    ctx.onCleanup(() => { if (dirty) ui.toast('Unsaved settings discarded.', 'warn'); });
  }

  return { overview, modulesPage, activityPage, diagnosticsPage, storagePage, settingsPage };
})();
