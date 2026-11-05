NIGHT.ui = (function () {
  const { h } = NIGHT.util;
  const { icon } = NIGHT.icons;

  const MAX_TOASTS = 3;
  function toast(message, type, sub) {
    const t = type || 'info';
    const ic = { ok: 'check', err: 'alert', warn: 'alert', info: 'info' }[t] || 'info';
    const root = document.getElementById('toasts');
    const key = t + '|' + message + '|' + (sub || '');
    const dupe = Array.from(root.children).find((c) => c.dataset.key === key);
    if (dupe) { if (dupe._restart) dupe._restart(); return; }

    const duration = t === 'err' ? 8000 : t === 'warn' ? 6000 : 4200;
    const el = h('div', { class: 'toast ' + t, role: t === 'err' ? 'alert' : 'status', 'aria-live': t === 'err' ? 'assertive' : 'polite', 'data-key': key, title: 'Tap to dismiss', style: { cursor: 'pointer' } },
      h('span', { class: 'ic' }, icon(ic, 15)),
      h('div', { class: 'tmsg' }, h('div', {}, message), sub ? h('div', { class: 'tsub' }, sub) : null)
    );
    let timer = null, gone = false;
    function dismiss() {
      if (gone) return; gone = true; clearTimeout(timer);
      el.style.transition = 'opacity .2s, transform .2s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(-6px)';
      setTimeout(() => el.remove(), 220);
    }
    function start() { clearTimeout(timer); timer = setTimeout(dismiss, duration); }
    el._restart = start;
    el.addEventListener('click', dismiss);
    el.addEventListener('mouseenter', () => clearTimeout(timer));
    el.addEventListener('mouseleave', start);
    root.append(el);
    while (root.children.length > MAX_TOASTS) root.firstElementChild.remove();
    start();
  }
  function success(message, sub) {
    if (NIGHT.api.isMock) toast(message, 'ok', sub || 'Simulated locally — no server request was made.');
    else toast(message, 'ok', sub);
  }
  function failure(err) {
    const sub = err && err.code ? 'Code: ' + err.code + (err.status ? ' · HTTP ' + err.status : '') : null;
    toast((err && err.message) || 'Something went wrong.', 'err', sub);
  }

  const modalStack = [];
  function lockScroll(on) {
    const n = document.body.dataset.locks ? +document.body.dataset.locks : 0;
    const next = Math.max(0, n + (on ? 1 : -1));
    document.body.dataset.locks = String(next);
    document.body.style.overflow = next ? 'hidden' : '';
  }

  function modal({ title, subtitle, body, footer, wide, onClose }) {
    const root = document.getElementById('modal-root');
    const previousActive = document.activeElement;
    const overlay = h('div', { class: 'overlay' });
    const bodyEl = h('div', { class: 'modal-body' });
    if (body) bodyEl.append(...[].concat(body).flat(Infinity).filter((n) => n !== null && n !== undefined && n !== false));

    const closeBtn = h('button', { class: 'btn icon ghost sm', 'aria-label': 'Close dialog', onclick: () => close() }, icon('x', 15));
    const box = h('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'modal-head' },
        h('div', { style: { flex: '1', minWidth: '0' } }, h('h3', {}, title), subtitle ? h('p', {}, subtitle) : null),
        closeBtn
      ),
      bodyEl,
      footer ? h('div', { class: 'modal-foot' }, footer) : null
    );

    overlay.append(box);
    // close on a real click that both starts and ends on the backdrop (so text-selection drags don't dismiss)
    let downOnBackdrop = false;
    overlay.addEventListener('pointerdown', (e) => { downOnBackdrop = e.target === overlay; });
    overlay.addEventListener('click', (e) => { if (downOnBackdrop && e.target === overlay) close(); downOnBackdrop = false; });
    root.append(overlay);
    lockScroll(true);
    const token = {};
    modalStack.push(token);
    requestAnimationFrame(() => overlay.classList.add('open'));

    function focusables() {
      return Array.from(box.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter((el) => !el.disabled && el.offsetParent !== null);
    }
    setTimeout(() => { const f = focusables(); (f[0] || closeBtn).focus(); }, 30);

    function onKey(e) {
      if (modalStack[modalStack.length - 1] !== token) return; // only the top-most dialog reacts
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.target && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && e.target.type !== 'radio') {
        const primary = box.querySelector('.modal-foot .btn.primary:not(:disabled), .modal-foot .btn.danger:not(:disabled)');
        if (primary) { e.preventDefault(); primary.click(); return; }
      }
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey);

    let closed = false;
    let onCloseFn = onClose;
    function setHead(t, sub) {
      const hd = box.querySelector('.modal-head > div');
      hd.replaceChildren(h('h3', {}, t), ...(sub ? [h('p', {}, sub)] : []));
      box.setAttribute('aria-label', t);
    }
    function setFooter(nodes) {
      const old = box.querySelector('.modal-foot'); if (old) old.remove();
      if (nodes) box.append(h('div', { class: 'modal-foot' }, nodes));
    }
    function setOnClose(fn) { onCloseFn = fn; }
    function close() {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey);
      const i = modalStack.indexOf(token); if (i > -1) modalStack.splice(i, 1);
      lockScroll(false);
      overlay.classList.remove('open');
      setTimeout(() => overlay.remove(), 220);
      if (previousActive && previousActive.focus) previousActive.focus();
      if (onCloseFn) onCloseFn();
    }
    return { close, bodyEl, box, setHead, setFooter, setOnClose };
  }

  function confirmAction({ title, message, confirmLabel, danger }) {
    return new Promise((resolve) => {
      let settled = false;
      const done = (v) => { if (!settled) { settled = true; resolve(v); } };
      const cancelBtn = h('button', { class: 'btn', onclick: () => { done(false); m.close(); } }, 'Cancel');
      const m = modal({
        title,
        body: h('p', { style: { fontSize: '13px', color: 'var(--text-dim)', lineHeight: '1.55' } }, message),
        footer: [
          cancelBtn,
          h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => { done(true); m.close(); } }, confirmLabel || 'Confirm')
        ],
        onClose: () => done(false)
      });
      // destructive actions default to Cancel so a stray Enter/tap can't delete anything
      if (danger) setTimeout(() => cancelBtn.focus(), 60);
    });
  }

  function status(kind, label) {
    return h('span', { class: 'status', 'data-status': kind },
      h('span', { class: 'status-dot' }),
      label !== undefined ? label : ({ online: 'Online', offline: 'Offline', pairing: 'Pairing', connecting: 'Connecting', attention: 'Attention' }[kind] || kind)
    );
  }

  // onChange may be async. Return/resolve `false` (or throw) to roll the switch back.
  function switchEl(on, onChange, disabled, label) {
    const el = h('button', {
      class: 'switch', type: 'button', role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-label': label || null, disabled: disabled || false,
      onclick: async () => {
        if (el.disabled || el.dataset.busy) return;
        const prev = el.getAttribute('aria-checked') === 'true';
        const next = !prev;
        el.setAttribute('aria-checked', next ? 'true' : 'false');
        el.dataset.busy = '1'; el.setAttribute('aria-busy', 'true');
        let ok = true;
        try { const r = onChange(next); ok = (r && typeof r.then === 'function' ? await r : r) !== false; }
        catch (e) { ok = false; }
        delete el.dataset.busy; el.removeAttribute('aria-busy');
        if (!ok && el.isConnected) el.setAttribute('aria-checked', prev ? 'true' : 'false');
      }
    });
    return el;
  }

  let fieldSeq = 0;
  function field(label, input, hint) {
    const id = 'f' + (++fieldSeq);
    const ctl = input && input.matches && input.matches('input,select,textarea') ? input : (input && input.querySelector ? input.querySelector('input,select,textarea') : null);
    const hintId = hint ? id + '-hint' : null;
    if (ctl) {
      if (!ctl.id) ctl.id = id;
      if (hintId) ctl.setAttribute('aria-describedby', hintId);
    }
    return h('div', { class: 'field' }, h('label', { for: ctl ? ctl.id : null }, label), input, hint ? h('div', { class: 'hint', id: hintId }, hint) : null);
  }
  function textInput(props) { return h('input', Object.assign({ class: 'input', type: 'text', autocomplete: 'off', enterkeyhint: 'done' }, props)); }

  function skeletonRows(n) {
    const rows = [];
    for (let i = 0; i < n; i++) rows.push(h('div', { class: 'skel-row' },
      h('div', { class: 'skel', style: { width: '32px', height: '32px', borderRadius: '8px' } }),
      h('div', { style: { flex: '1', display: 'flex', flexDirection: 'column', gap: '6px' } },
        h('div', { class: 'skel', style: { width: (30 + Math.random() * 25) + '%', height: '10px' } }),
        h('div', { class: 'skel', style: { width: (20 + Math.random() * 20) + '%', height: '8px' } })
      ),
      h('div', { class: 'skel', style: { width: '54px', height: '16px', borderRadius: '5px' } })
    ));
    return h('div', { class: 'panel' }, rows);
  }

  function errorState(err, onRetry) {
    return h('div', { class: 'panel', role: 'alert' }, h('div', { class: 'empty' },
      h('span', { style: { color: 'var(--red)' } }, icon('alert', 22)),
      h('h4', {}, 'Could not load this data'),
      h('p', {}, (err && err.message) || 'An unexpected error occurred.'),
      err && err.code ? h('span', { class: 'mono tiny mute' }, err.code) : null,
      onRetry ? h('button', { class: 'btn', style: { marginTop: '8px' }, onclick: onRetry }, icon('refresh', 14), 'Retry') : null
    ));
  }

  function emptyState(iconName, title, text) {
    return h('div', { class: 'empty' }, icon(iconName, 22), h('h4', {}, title), h('p', {}, text));
  }

  function mockBanner(text) {
    return h('div', { class: 'banner', role: 'note' },
      h('span', { class: 'ic' }, icon('info', 15)),
      h('div', {}, h('strong', {}, 'Mock data. '),
        text || 'Every value on this screen is generated in the browser by the mock API adapter. No request has been sent to the Azure server.')
    );
  }

  function meter(pct, variant) {
    return h('div', { class: 'meter' + (variant ? ' ' + variant : '') }, h('i', { style: { width: Math.min(100, Math.max(0, pct)) + '%' } }));
  }

  return { toast, success, failure, modal, confirmAction, status, switchEl, field, textInput, skeletonRows, errorState, emptyState, mockBanner, meter };
})();
