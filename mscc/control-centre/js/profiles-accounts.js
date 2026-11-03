/* Behaviour profiles, account pairing flow and per-account overrides */
(function () {
  const { h, timeAgo, num, dateTime, delay } = NIGHT.util;
  const { icon } = NIGHT.icons;
  const ui = NIGHT.ui;
  const api = NIGHT.api;
  const clone = (x) => JSON.parse(JSON.stringify(x));

  /* ---------- API extensions ---------- */
  if (api.isMock) {
    const cfg = {}, over = {}, started = {};
    const d = () => delay(180);
    const orig = api.pairAccount;
    api.getProfileConfig = async (id) => {
      await d();
      if (!cfg[id]) {
        const [ps, ms] = await Promise.all([api.listProfiles(), api.listModules()]);
        const p = ps.find((x) => x.id === id);
        cfg[id] = { modules: {} };
        ms.slice(0, p ? p.modules : 0).forEach((m) => { cfg[id].modules[m.id] = true; });
      }
      return clone(cfg[id]);
    };
    api.setProfileModule = async (id, mid, on) => { await d(); (cfg[id] = cfg[id] || { modules: {} }).modules[mid] = on; };
    api.getAccountOverrides = async (id) => { await d(); return clone(over[id] || { modules: {} }); };
    api.setAccountOverride = async (id, mid, val) => {
      await d();
      const o = (over[id] = over[id] || { modules: {} });
      if (val === null) delete o.modules[mid]; else o.modules[mid] = val;
    };
    api.pairAccount = async (id, method, phone) => {
      const r = await orig.call(api, id, method);
      started[id] = Date.now();
      if (method === 'qr') r.qr = '2@' + Math.random().toString(36).slice(2) + ',' + Math.random().toString(36).slice(2) + ',NIGHT-DEMO';
      return r;
    };
    api.getPairStatus = async (id) => {
      await delay(150);
      if (started[id] && Date.now() - started[id] > 10000) { await api.completePairing(id); delete started[id]; return { status: 'online' }; }
      return { status: 'pairing' };
    };
  } else {
    // Live API methods are defined once in live-adapter.js and share its CSRF, timeout,
    // same-origin, response-validation, and error-handling policy.
  }

  /* ---------- QR rendering (lazy-loaded generator) ---------- */
  let qrLib;
  function loadQr() {
    if (window.qrcode) return Promise.resolve();
    return qrLib || (qrLib = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
      s.onload = res; s.onerror = () => { qrLib = null; rej(); };
      document.head.append(s);
    }));
  }
  function renderQr(box, text) {
    if (typeof text === 'string' && /^data:image\//i.test(text)) {
      const image = h('img', { src: text, alt: 'WhatsApp device-linking QR code', style: { width: '100%', height: '100%', objectFit: 'contain' } });
      box.replaceChildren(image);
      return;
    }
    loadQr().then(() => {
      const q = window.qrcode(0, 'M'); q.addData(text); q.make();
      box.innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
      box.firstChild.style.cssText = 'width:100%;height:100%';
    }).catch(() => { box.textContent = 'Could not load the QR renderer. Use a pairing code instead.'; });
  }

  /* ---------- Accounts ---------- */
  function nextAction(a) {
    if (a.status === 'pairing') return a.pairStarted ? ['Continue linking', 'link', 'link'] : ['Link device', 'link', 'link'];
    if (a.status === 'online') return ['Manage', 'more', 'manage'];
    if (a.status === 'offline') return ['Reconnect', 'power', 'reconnect'];
    return ['Diagnose', 'wrench', 'diagnose'];
  }

  async function accountsPage(root, ctx) {
    let list, profiles;
    try { [list, profiles] = await Promise.all([api.listAccounts(), api.listProfiles()]); }
    catch (e) { root.append(ui.errorState(e, () => ctx.reload())); return; }
    root.innerHTML = '';
    const pName = (id) => (profiles.find((p) => p.id === id) || {}).name || 'No profile';
    let filter = 'all', query = '';
    const listEl = h('div', { class: 'list' });
    const side = () => { ctx.refreshNav(); ctx.refreshBand(); };
    async function reload() { list = await api.listAccounts(); draw(); side(); }

    async function run(a) {
      const kind = nextAction(a)[2];
      if (kind === 'link') openLink(a.id);
      else if (kind === 'manage') openAccount(a.id);
      else if (kind === 'diagnose') ctx.navigate('diagnostics');
      else try { await api.reconnectAccount(a.id); ui.success('Account reconnected'); await reload(); } catch (e) { ui.failure(e); }
    }

    function draw() {
      const q = query.toLowerCase();
      const rows = list.filter((a) => (filter === 'all' || a.status === filter) && (!q || (a.name + a.phone + pName(a.profileId)).toLowerCase().includes(q)));
      listEl.innerHTML = '';
      listEl.append(h('div', { class: 'list-head' },
        h('div', { class: 'col-id' }, 'WhatsApp account'), h('div', { class: 'col-profile' }, 'Behaviour profile'),
        h('div', { class: 'col-status' }, 'Status'), h('div', { class: 'col-time' }, 'Last seen'), h('div', { class: 'col-act', style: { width: '120px' } }, 'Next step')));
      if (!rows.length) { listEl.append(ui.emptyState('accounts', 'No accounts match', 'Adjust the filters or clear the search.')); return; }
      rows.forEach((a) => {
        const [label, ic] = nextAction(a);
        listEl.append(h('div', { class: 'row', tabindex: '0', role: 'button', onclick: () => openAccount(a.id),
          onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAccount(a.id); } } },
          h('div', { class: 'col-id' }, h('div', { class: 'avatar' }, a.name[0].toUpperCase()),
            h('div', { style: { minWidth: '0' } }, h('div', { class: 'name truncate' }, a.name), h('div', { class: 'meta truncate' }, a.phone))),
          h('div', { class: 'col-profile' }, h('span', { class: 'mono tiny mute' }, pName(a.profileId))),
          h('div', { class: 'col-status' }, ui.status(a.status)),
          h('div', { class: 'col-time' }, timeAgo(a.lastSeen)),
          h('div', { class: 'col-act', style: { width: '120px', textAlign: 'right' } },
            h('button', { class: 'btn sm' + (a.status === 'online' ? '' : ' primary'), onclick: (e) => { e.stopPropagation(); run(a); } }, icon(ic, 14), label))));
      });
    }

    const chips = h('div', { class: 'hstack', style: { gap: '6px' } });
    [['all', 'All'], ['online', 'Online'], ['offline', 'Offline'], ['pairing', 'Pairing'], ['attention', 'Attention']].forEach(([v, l]) =>
      chips.append(h('button', { class: 'btn sm' + (v === 'all' ? ' primary' : ''), 'aria-pressed': v === 'all' ? 'true' : 'false', onclick: (e) => {
        filter = v; chips.querySelectorAll('.btn').forEach((b) => { b.classList.remove('primary'); b.setAttribute('aria-pressed', 'false'); }); e.currentTarget.classList.add('primary'); e.currentTarget.setAttribute('aria-pressed', 'true'); draw();
      } }, l)));

    root.append(
      h('div', { class: 'page-head' }, h('div', { class: 'page-title' }, 'Accounts'),
        h('div', { class: 'page-desc' }, 'Each account is a WhatsApp identity: a phone number, a session and a connection. Its behaviour comes from a profile.')),
      api.isMock ? ui.mockBanner('Account actions are simulated by the mock adapter. No session is opened.') : null,
      h('div', { class: 'toolbar' },
        h('div', { class: 'search' }, icon('search', 16), h('input', { class: 'input', type: 'search', 'aria-label': 'Search accounts', placeholder: 'Search accounts…', oninput: (e) => { query = e.target.value; draw(); } })),
        chips, h('div', { class: 'spacer' }),
        h('button', { class: 'btn primary', onclick: openCreate }, icon('plus', 16), 'New account')),
      listEl);
    draw();
    if (!list.length) listEl.replaceChildren(ui.emptyState('accounts', 'No accounts yet', 'Create one, then pair it with WhatsApp.'));

    function openAccount(id) {
      const body = h('div', { class: 'stack', style: { gap: '16px' } });
      const a0 = list.find((x) => x.id === id); if (!a0) return;
      const m = ui.modal({ title: a0.name, subtitle: a0.phone + ' · ' + a0.session, body, wide: true });
      const btn = (ic, label, fn) => h('button', { class: 'btn', onclick: fn }, icon(ic, 16), label);
      function paint() {
        const a = list.find((x) => x.id === id); if (!a) { m.close(); return; }
        const online = a.status === 'online';
        body.innerHTML = '';
        body.append(
          h('div', { class: 'hstack', style: { justifyContent: 'space-between' } }, h('div', { class: 'hstack' },
            h('div', { class: 'avatar lg' }, a.name[0].toUpperCase()), h('div', {}, h('div', { class: 'name' }, a.name), h('div', { class: 'meta' }, 'WhatsApp identity'))), ui.status(a.status)),
          h('dl', { class: 'kv' },
            h('dt', {}, 'Phone'), h('dd', {}, a.phone), h('dt', {}, 'Session'), h('dd', { class: 'mono' }, a.session),
            h('dt', {}, 'Behaviour'), h('dd', {}, pName(a.profileId)), h('dt', {}, 'Created'), h('dd', {}, a.createdAt ? dateTime(a.createdAt) : 'Not recorded'),
            h('dt', {}, 'Last seen'), h('dd', {}, a.lastSeen ? timeAgo(a.lastSeen) : 'Not recorded'), h('dt', {}, 'Messages 24h'), h('dd', {}, a.messages24h == null ? '—' : num(a.messages24h))),
          h('div', { class: 'divider' }), h('div', { class: 'section-label' }, 'Session'),
          h('div', { class: 'action-grid' },
            btn('qr', 'Pair / repair device', () => { m.close(); openLink(id); }),
            btn('power', online ? 'Disconnect' : 'Reconnect', async () => {
              try { await (online ? api.disconnectAccount(id) : api.reconnectAccount(id)); ui.success(online ? 'Account disconnected' : 'Account reconnected'); await reload(); paint(); } catch (e) { ui.failure(e); }
            }),
            btn('edit', 'Rename', () => { m.close(); openRename(id); })),
          h('div', { class: 'section-label', style: { marginTop: '6px' } }, 'Behaviour'),
          h('div', { class: 'action-grid' }, btn('layers', 'Profile & overrides', () => { m.close(); openBehaviour(id); })),
          h('div', { class: 'section-label', style: { marginTop: '6px' } }, 'Danger zone'),
          h('div', { class: 'action-grid' }, h('button', { class: 'btn danger', onclick: async () => {
            if (!await ui.confirmAction({ title: 'Remove ' + a.name + '?', message: 'This permanently removes the account and its stored session.', confirmLabel: 'Remove account', danger: true })) return;
            try { await api.removeAccount(id); ui.success('Account removed'); m.close(); await reload(); } catch (e) { ui.failure(e); }
          } }, icon('trash', 16), 'Remove account')));
      }
      paint();
    }

    function openCreate() {
      const nameIn = ui.textInput({ placeholder: 'e.g. Atlas' });
      const phoneIn = ui.textInput({ placeholder: '+44 7000 000000', inputmode: 'tel' });
      const sel = h('select', { class: 'select' }, h('option', { value: '' }, 'No profile'), profiles.filter((p) => p.id !== 'control').map((p) => h('option', { value: p.id }, p.name)));
      const go = h('button', { class: 'btn primary', onclick: submit }, 'Create & link');
      const m = ui.modal({ title: 'New account', subtitle: 'Add a WhatsApp identity. You\u2019ll link it right here next.',
        body: [ui.field('Account name', nameIn), ui.field('Phone number', phoneIn, 'Needed for pairing-code linking.'), ui.field('Behaviour profile', sel, 'How this account behaves. You can change it later.')],
        footer: [h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), go] });
      async function submit() {
        go.disabled = true;
        try {
          const acc = await api.createAccount({ name: nameIn.value, phone: phoneIn.value, profileId: sel.value || null });
          await reload(); openLink(acc.id, m);
        } catch (e) { ui.failure(e); go.disabled = false; }
      }
    }

    function openRename(id) {
      const a = list.find((x) => x.id === id); const input = ui.textInput({ value: a.name });
      const go = h('button', { class: 'btn primary', onclick: async () => {
        try { await api.renameAccount(id, input.value); ui.success('Account renamed'); await reload(); m.close(); } catch (e) { ui.failure(e); }
      } }, 'Save name');
      const m = ui.modal({ title: 'Rename account', subtitle: a.phone, body: [ui.field('Account name', input)], footer: [h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), go] });
    }

    async function openBehaviour(id) {
      const a = list.find((x) => x.id === id);
      const body = h('div', { class: 'stack' });
      const m = ui.modal({ title: 'Behaviour · ' + a.name, subtitle: 'Assign one of the profiles already stored by MSCC.', body, wide: true });
      const choices = profiles.filter((p) => id === 'A' ? p.id === 'control' : p.id !== 'control');
      const sel = h('select', { class: 'select', onchange: async (e) => {
        try { await api.assignProfile(id, e.target.value); a.profileId = e.target.value; ui.success('Profile assigned'); await reload(); paint(); }
        catch (er) { ui.failure(er); }
      } }, choices.map((p) => h('option', { value: p.id, selected: p.id === a.profileId ? true : null }, p.name)));
      function paint() {
        body.replaceChildren(
          ui.field('Behaviour profile', sel, id === 'A' ? 'Account A is permanently restricted to the private Control profile.' : 'Linked accounts cannot use Account A’s private Control profile.'),
          h('div', { class: 'panel' }, h('div', { class: 'panel-body stack' },
            h('div', { class: 'name' }, 'How MSCC applies behaviour'),
            h('p', { class: 'small dim' }, 'MSCC resolves behaviour through the account’s assigned profile and its stored capability priorities. The current production model does not expose per-account module overrides, so this console does not invent or simulate them.'),
            h('div', { class: 'tiny mute' }, 'Current profile: ' + (profiles.find((p) => p.id === a.profileId)?.description || 'Unassigned'))
          ))
        );
      }
      paint();
    }

    function openLink(id, host) {
      const a = list.find((x) => x.id === id); if (!a) return;
      let mode = 'qr', payload = null, busy = false, tick, poll;
      let repairFlow = Boolean(a.registered || a.invalid);
      let repairAuthorized = false;
      const err = h('div', { class: 'tiny', style: { color: 'var(--red)', display: 'none' } });
      const body = h('div', {});
      const stop = () => { clearInterval(tick); clearInterval(poll); };
      let m;
      if (host) {
        m = host;
        host.setHead('Link ' + a.name, 'Account created. Connect this WhatsApp identity now, or continue later.');
        host.setFooter([h('button', { class: 'btn', onclick: () => host.close() }, 'Link later')]);
        host.setOnClose(stop);
        body.classList.add('step-in');
        host.bodyEl.replaceChildren(body);
      } else {
        m = ui.modal({ title: 'Link WhatsApp · ' + a.name, subtitle: 'Choose QR or pairing code. MSCC checks whether this is a new link or an existing session that needs repair.', body, onClose: stop });
      }
      const tabs = () => h('div', { class: 'pair-tabs' },
        h('button', { class: 'btn sm' + (mode === 'qr' ? ' primary' : ''), onclick: () => { if (mode !== 'qr') { mode = 'qr'; start(); } } }, icon('qr', 15), 'QR code'),
        h('button', { class: 'btn sm' + (mode === 'code' ? ' primary' : ''), onclick: () => { if (mode !== 'code') { mode = 'code'; payload = null; stop(); draw(); } } }, icon('link', 15), 'Pairing code'));

      function draw() {
        stop(); body.innerHTML = ''; body.append(tabs());
        let qrBox = null; const countEl = h('div', { class: 'tiny mute', style: { textAlign: 'center', marginTop: '12px' } });
        if (mode === 'qr') {
          qrBox = h('div', { class: 'qr-frame', style: { background: '#fff', borderStyle: 'solid', padding: '10px' } });
          body.append(qrBox, h('p', { class: 'qr-explanation' }, 'Scan using WhatsApp on your phone: Linked devices → Link a device.'));
          renderQr(qrBox, payload.qr);
        } else {
          body.append(h('p', { class: 'qr-explanation' }, 'The pairing code is generated for the number already stored securely in this account. On WhatsApp, open Linked devices → Link with phone number.'), err);
          if (payload && payload.code) body.append(h('div', { class: 'code-box', style: { marginTop: '12px' } }, payload.code));
        }
        body.append(countEl, h('div', { class: 'hstack', style: { justifyContent: 'center', marginTop: '12px' } },
          h('button', { class: 'btn sm' + (payload ? '' : ' primary'), onclick: start }, icon('refresh', 14), payload ? 'Regenerate' : 'Start linking')));
        if (!payload) return;
        tick = setInterval(() => {
          const left = Math.max(0, Math.floor((payload.expiresAt - Date.now()) / 1000));
          countEl.textContent = left ? 'Expires in ' + left + 's · waiting for WhatsApp…' : 'Expired — regenerate to continue';
          countEl.style.color = left ? '' : 'var(--amber)';
          if (qrBox) qrBox.style.opacity = left ? '1' : '.2';
          if (!left) stop();
        }, 500);
        poll = setInterval(async () => {
          if (document.hidden) return;
          try {
            if ((await api.getPairStatus(id)).status === 'online') {
              stop(); ui.success(a.name + ' is online', 'WhatsApp linked successfully.'); m.close(); await reload();
            }
          } catch (e) { /* keep polling */ }
        }, 2000);
      }

      async function confirmRepair() {
        return ui.confirmAction({
          title: 'Repair saved session for ' + a.name + '?',
          message: 'This account already has saved WhatsApp authentication. MSCC will preserve the current auth in a backup before requesting a fresh QR code or pairing code. The backup will not be deleted.',
          confirmLabel: 'Back up and repair', danger: true,
        });
      }

      async function start() {
        if (busy) return;
        err.style.display = 'none';
        busy = true; stop(); body.innerHTML = '';
        body.append(tabs(), h('div', { class: 'empty', style: { padding: '36px 0' } }, h('span', { class: 'spinner', style: { color: 'var(--accent)' } }), h('p', {}, 'Preparing WhatsApp link…')));
        try {
          if (repairFlow && !repairAuthorized) {
            if (!await confirmRepair()) { busy = false; draw(); return; }
            repairAuthorized = true;
          }
          try {
            payload = repairFlow ? await api.repairAccount(id, mode) : await api.pairAccount(id, mode);
          } catch (pairError) {
            // Account metadata can be stale while the backend already has saved auth.
            // Convert that response into the same confirmed repair flow instead of
            // showing the user a dead-end error message.
            if (!repairFlow && pairError?.code === 'REPAIR_REQUIRED') {
              repairFlow = true;
              if (!await confirmRepair()) { busy = false; draw(); return; }
              repairAuthorized = true;
              payload = await api.repairAccount(id, mode);
            } else {
              throw pairError;
            }
          }
          if (payload?.connected) {
            stop();
            ui.success(a.name + ' is online', 'WhatsApp is already connected.');
            m.close();
            await reload();
            return;
          }
        } catch (e) {
          busy = false; body.innerHTML = ''; body.append(tabs(), ui.errorState(e, start)); return;
        }
        busy = false; draw();
      }
      start();
    }
  }

  /* ---------- Behaviour profiles ---------- */
  async function profilesPage(root, ctx) {
    let list, accs;
    try { [list, accs] = await Promise.all([api.listProfiles(), api.listAccounts()]); }
    catch (e) { root.append(ui.errorState(e, () => ctx.reload())); return; }
    root.innerHTML = '';
    const grid = h('div', { class: 'grid grid-2' });
    if (!list.length) grid.append(h('div', { class: 'panel' }, ui.emptyState('layers', 'No behaviour profiles', 'MSCC has not returned any stored profiles.')));
    list.forEach((profile) => {
      const assigned = accs.filter((account) => account.profileId === profile.id);
      const capabilities = Array.isArray(profile.capabilities) ? profile.capabilities : [];
      const capText = capabilities.length ? capabilities.map((item) => item.capability + ' (' + item.priority + ')').join(' · ') : 'No explicit specialty capabilities';
      grid.append(h('div', { class: 'panel' },
        h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, profile.name), h('span', { class: 'mono tiny mute' }, assigned.length + ' assigned')),
        h('div', { class: 'panel-body stack' },
          h('p', { class: 'small dim' }, profile.description || 'Stored MSCC behaviour profile.'),
          h('div', { class: 'tiny mute' }, capText),
          h('div', { class: 'tiny mute' }, assigned.length ? 'Used by ' + assigned.map((account) => account.name).join(', ') : 'Not currently assigned.'),
          h('div', { class: 'tiny mute' }, profile.universal ? 'Universal profile · base priority ' + profile.basePriority : 'Specialty profile')
        ),
        h('div', { class: 'panel-foot' }, h('span', { class: 'tiny mute' }, 'Managed by MSCC profile storage'))
      ));
    });
    root.append(
      h('div', { class: 'page-head' }, h('div', { class: 'page-title' }, 'Behaviour profiles'),
        h('div', { class: 'page-desc' }, 'Live profiles from MSCC shared storage. Account assignment is available from each account’s Behaviour panel.')),
      h('div', { class: 'panel', style: { marginBottom: '14px' } }, h('div', { class: 'panel-body' },
        h('p', { class: 'small dim' }, 'Account A remains locked to Control. Other accounts cannot be assigned the private Control profile. This build displays existing capability priorities but does not create, delete, or rewrite profile definitions.'))),
      grid
    );
  }

  NIGHT.pages.accounts = accountsPage;
  NIGHT.pages.profilesPage = profilesPage;
})();
