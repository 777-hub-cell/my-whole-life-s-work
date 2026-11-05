/* Environment variables page. Live backends must return metadata only for secrets. */
(function () {
  const { h } = NIGHT.util;
  const { icon } = NIGHT.icons;
  const ui = NIGHT.ui;
  const api = NIGHT.api;
  const U = NIGHT.util;

  const SECRET_RE = /(KEY|TOKEN|SECRET|PASS|PWD|AUTH|COOKIE|SESSION|PRIVATE|CREDENTIAL|PHONE|NUMBER|EMAIL|JID)/i;
  const isSecret = (entry) => entry.isSecret === true || SECRET_RE.test(String(entry.key || ''));
  const normalize = (entry) => {
    const secret = isSecret(entry);
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
      ? { ...metadata, isSecret: true, configured: entry.configured === true || (entry.value != null && entry.value !== ''), value: null }
      : { ...metadata, isSecret: false, configured: true, value: String(entry.value == null ? '' : entry.value) };
  };

  if (api.isMock) {
    const KEY = 'night.mock.env';
    const seed = [
      { key: 'BOT_NAME', value: 'NIGHT' }, { key: 'PREFIX', value: '!' }, { key: 'TZ', value: 'Africa/Lagos' },
      { key: 'OWNER_NUMBER', value: '2348000000000' }, { key: 'GROQ_API_KEY', value: 'demo-placeholder-not-a-real-key' }
    ];
    const load = () => U.store.get(KEY, null) || (localStorage.getItem('night.mock.seed') !== 'false' ? seed : []);
    api.listEnv = async () => { await U.delay(180); return load().map((v) => normalize({ ...v, isSecret: SECRET_RE.test(v.key) })); };
    api.setEnv = async (key, value) => {
      await U.delay(180);
      const list = load().slice(); const i = list.findIndex((v) => v.key === key);
      if (i >= 0) list[i] = { key, value }; else list.push({ key, value });
      U.store.set(KEY, list);
      return normalize({ key, value, isSecret: SECRET_RE.test(key) });
    };
  }

  async function copy(text, okMsg) {
    try { await navigator.clipboard.writeText(text); ui.toast(okMsg, 'ok'); }
    catch (e) {
      try {
        const t = h('textarea', { style: { position: 'fixed', opacity: '0' }, 'aria-hidden': 'true' });
        t.value = text; document.body.append(t); t.select();
        const copied = document.execCommand('copy'); t.remove();
        if (!copied) throw new Error('Copy command rejected');
        ui.toast(okMsg, 'ok');
      } catch (er) { ui.toast('Could not copy to the clipboard.', 'err'); }
    }
  }

  async function envPage(root, ctx, options = {}) {
    let vars;
    try { vars = (await api.listEnv()).map(normalize); }
    catch (e) { root.append(ui.errorState(e, () => ctx.reload())); return; }
    root.replaceChildren();
    const listEl = h('div', { class: 'list' });

    function row(v) {
      const secret = isSecret(v);
      const valueText = secret ? (v.configured ? 'Configured · value hidden' : 'Not configured') : (v.value === '' ? '(empty)' : v.value);
      const copyButton = secret ? null : h('button', { class: 'btn icon ghost', type: 'button', 'aria-label': 'Copy ' + v.key, title: 'Copy value', onclick: () => copy(v.value, v.key + ' copied') }, icon('copy', 18));
      const canEdit = api.isMock || (api.capabilities?.envWrite === true && v.editable === true);
      return h('div', { class: 'row plain env-row', tabindex: canEdit ? '0' : null, role: canEdit ? 'button' : null, 'aria-label': canEdit ? 'Edit ' + v.key : v.key,
        onclick: canEdit ? () => openEdit(v) : null,
        onkeydown: canEdit ? (e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openEdit(v); } } : null },
        h('div', { class: 'env-main' },
          h('div', { class: 'name mono truncate' }, v.key),
          h('div', { class: 'meta mono env-val' + (secret ? ' masked' : '') }, valueText)),
        h('div', { class: 'env-acts' }, copyButton));
    }
    function draw() {
      listEl.replaceChildren();
      const query = String(search.value || '').trim().toLowerCase();
      const visible = vars.filter((v) => !query || v.key.toLowerCase().includes(query));
      if (!visible.length) { listEl.append(ui.emptyState('env', query ? 'No matching variables' : 'No variables returned', query ? 'Try a different variable name.' : 'The backend did not return any application environment variables.')); return; }
      visible.forEach((v) => listEl.append(row(v)));
    }

    function openEdit(existing) {
      const wasSecret = existing ? isSecret(existing) : false;
      const keyIn = ui.textInput({ placeholder: 'e.g. GROQ_API_KEY', value: existing ? existing.key : '', disabled: !!existing, autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false' });
      const valIn = h('textarea', { class: 'input', rows: '3', autocomplete: 'new-password', spellcheck: 'false', maxlength: String(existing && existing.maxLength || 4096), placeholder: wasSecret ? 'Enter a replacement value. Leave blank to keep the current secret.' : 'Value' });
      if (existing && !wasSecret) valIn.value = existing.value;
      const err = h('div', { class: 'tiny', style: { color: 'var(--red)', display: 'none' }, role: 'alert' });
      const save = h('button', { class: 'btn primary', onclick: submit }, existing ? 'Save' : 'Add variable');
      const m = ui.modal({ title: existing ? existing.key : 'New variable', subtitle: 'Changes are applied after a bot restart.',
        body: [ui.field('Name', keyIn, existing ? null : 'Letters, numbers and underscores.'), ui.field('Value', valIn, wasSecret ? 'Existing secret values are never retrieved or shown. Submitting a replacement overwrites the server-side value.' : null), err],
        footer: [h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), save] });
      async function submit() {
        const key = keyIn.value.trim().toUpperCase();
        if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) { err.textContent = 'Use letters, numbers and underscores, and do not start with a number.'; err.style.display = 'block'; keyIn.focus(); return; }
        if (!existing && vars.some((v) => v.key === key)) { err.textContent = key + ' already exists — edit it instead.'; err.style.display = 'block'; return; }
        if (wasSecret && valIn.value === '') { m.close(); ui.toast('Existing secret unchanged.', 'info'); return; }
        save.disabled = true;
        try {
          const result = await api.setEnv(key, valIn.value);
          const next = normalize(result || { key, value: wasSecret ? null : valIn.value, isSecret: SECRET_RE.test(key), configured: true });
          const i = vars.findIndex((v) => v.key === key);
          if (i >= 0) vars[i] = next; else vars.push(next);
          ui.success(existing ? key + ' updated' : key + ' added', 'Restart the bot to apply it.');
          m.close(); draw();
        } catch (e) { ui.failure(e); save.disabled = false; }
      }
    }

    const exportNonSecrets = () => {
      const plain = vars.filter((v) => !isSecret(v));
      const hidden = vars.filter(isSecret).map((v) => v.key);
      const lines = plain.map((v) => v.key + '=' + (/\s|[#"']/.test(v.value) ? JSON.stringify(v.value) : v.value));
      if (hidden.length) lines.push('', '# Secret values are intentionally not exported:', ...hidden.map((key) => '# ' + key + '=<set securely on the server>'));
      copy(lines.join('\n'), 'Non-secret variables copied. Secret values were excluded.');
    };

    const search = h('input', { class: 'input', type: 'search', placeholder: 'Filter environment variables…', 'aria-label': 'Filter environment variables', oninput: () => draw() });
    root.append(
      options.embedded ? null : h('div', { class: 'page-head' }, h('div', { class: 'page-title' }, 'Environment'),
        h('div', { class: 'page-desc' }, 'View application environment variables. Secret values are always masked and never returned to the browser.')),
      api.isMock && !options.embedded ? ui.mockBanner('Demo variables are stored in this browser only. No real server secrets are available in mock mode.') : null,
      h('div', { class: 'toolbar' },
        h('div', { class: 'search', style: { flex: '1 1 220px' } }, icon('search', 16), search),
        api.isMock ? h('button', { class: 'btn primary', onclick: () => openEdit(null) }, icon('plus', 16), 'Add variable') : null,
        h('button', { class: 'btn', onclick: exportNonSecrets }, icon('file', 16), 'Copy non-secret variables')),
      !api.isMock && api.capabilities?.envWrite !== true ? h('p', { class: 'hint' }, 'Live environment metadata is read-only. Secret values remain masked; use the protected deployment configuration to change them.') : null,
      !api.isMock && api.capabilities?.envWrite === true ? h('p', { class: 'hint' }, 'Only explicitly approved settings can be edited. TMDB credentials are stored as write-only secrets and take effect after a bot restart.') : null,
      listEl);
    draw();
  }

  NIGHT.pages.envPage = envPage;
})();
