/* Editor helpers: JSON validation, word-wrap preference, find-in-file (with match highlighting). */
NIGHT.editorTools = (function () {
  const { h } = NIGHT.util;
  const { icon } = NIGHT.icons;

  /* ---------- JSON validation ---------- */
  // Returns null when the text is valid (or empty), otherwise { line } (line may be null if the engine doesn't say).
  function jsonProblem(text) {
    if (!text.trim()) return null;
    try { JSON.parse(text); return null; }
    catch (e) {
      let line = null;
      const pos = /position (\d+)/.exec(e.message), ln = /line (\d+)/.exec(e.message);
      if (pos) line = text.slice(0, +pos[1]).split('\n').length;
      else if (ln) line = +ln[1];
      return { line };
    }
  }

  /* ---------- Word-wrap preference (defaults on for phones) ---------- */
  const WRAP_KEY = 'night.editor.wrap';
  const wrap = {
    get() { try { const v = localStorage.getItem(WRAP_KEY); if (v !== null) return v === '1'; } catch (e) {} return window.innerWidth < 640; },
    set(on) { try { localStorage.setItem(WRAP_KEY, on ? '1' : '0'); } catch (e) {} }
  };

  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  /* ---------- Syntax highlighting (single pass, so strings/comments never fight each other) ---------- */
  const MAX_SYNTAX = 200000; // characters; bigger files stay plain so typing stays instant
  const JSON_RE = /("(?:\\.|[^"\\\n])*"?)(\s*:)?|\b(?:true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  const JS_RE = /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|('(?:\\.|[^'\\\n])*'?|"(?:\\.|[^"\\\n])*"?|`(?:\\.|[^`\\])*`?)|\b(\d+(?:\.\d+)?)\b|\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|default|new|require|module|exports|async|await|class|extends|super|this|try|catch|finally|throw|typeof|instanceof|in|of|import|from|export|delete|void|yield|static)\b|\b(true|false|null|undefined|NaN)\b/g;
  const MD_RE = /^(#{1,6}\s.*)$|(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\[[^\]\n]+\]\([^)\n]*\))|^(\s*(?:[-*+]|\d+\.)\s)/gm;
  const CFG_RE = /^(\s*[#;][^\n]*)$|^(\s*(?:export\s+)?[A-Za-z_][\w.\-]*)(?=\s*[=:])|("(?:\\.|[^"\\\n])*"|'[^'\n]*')|\b(true|false|null)\b|(-?\b\d+(?:\.\d+)?\b)/gm;
  const LOG_RE = /^.*$/gm;

  function run(re, text, pick) {
    const out = [];
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      if (m[0] === '') { re.lastIndex++; continue; }
      const t = pick(m);
      if (t) out.push([m.index, m.index + (t[1] === undefined ? m[0].length : t[1]), t[0]]);
    }
    return out;
  }
  const grp = (m, names) => { for (let i = 0; i < names.length; i++) if (m[i + 1] !== undefined && names[i]) return [names[i]]; return null; };

  const TOKENIZERS = {
    json: (t) => run(JSON_RE, t, (m) => m[1] !== undefined ? [m[2] ? 'tok-key' : 'tok-str', m[1].length] : [/^-?\d/.test(m[0]) ? 'tok-num' : m[0] === 'null' ? 'tok-null' : 'tok-bool']),
    javascript: (t) => run(JS_RE, t, (m) => grp(m, ['tok-comment', 'tok-str', 'tok-num', 'tok-kw', 'tok-bool'])),
    markdown: (t) => run(MD_RE, t, (m) => grp(m, ['tok-kw', 'tok-str', 'tok-num', 'tok-key', 'tok-key'])),
    config: (t) => run(CFG_RE, t, (m) => grp(m, ['tok-comment', 'tok-key', 'tok-str', 'tok-bool', 'tok-num'])),
    log: (t) => run(LOG_RE, t, (m) => {
      const l = m[0];
      const c = /\b(ERROR|FATAL|CRITICAL)\b/.test(l) ? 'log-err' : /\b(WARN|WARNING)\b/.test(l) ? 'log-warn' : /\b(INFO|SUCCESS|OK|DEBUG|TRACE)\b/.test(l) ? 'log-info' : null;
      return c ? [c] : null;
    })
  };
  const EXT = { js: 'javascript', mjs: 'javascript', cjs: 'javascript', json: 'json', md: 'markdown', log: 'log' };

  // File name wins over whatever the backend reports, so new file types highlight without backend changes.
  function detectLanguage(file) {
    const name = String(file.name || '').toLowerCase();
    const ext = name.split('.').pop();
    if (EXT[ext]) return EXT[ext];
    if (/(^|\.)(env|ini|ya?ml|toml|conf|properties)$/.test(name)) return 'config';
    return TOKENIZERS[file.language] ? file.language : 'text';
  }

  // Merge syntax tokens and find matches into one HTML string.
  function compose(text, toks, matches, len, cur) {
    let mi = 0, html = '';
    function emit(a, b, cls) {
      while (a < b) {
        while (mi < matches.length && matches[mi] + len <= a) mi++;
        const m = mi < matches.length ? matches[mi] : Infinity, inMark = m <= a;
        const end = inMark ? Math.min(b, m + len) : Math.min(b, m);
        let s = esc(text.slice(a, end));
        if (cls) s = '<span class="' + cls + '">' + s + '</span>';
        if (inMark) s = '<mark' + (mi === cur ? ' class="cur"' : '') + '>' + s + '</mark>';
        html += s; a = end;
      }
    }
    let pos = 0;
    for (const [a, b, c] of toks) { if (a > pos) emit(pos, a, ''); emit(a, b, c); pos = b; }
    if (pos < text.length) emit(pos, text.length, '');
    return html;
  }

  /* ---------- Find in file ---------- */
  const MAX_MATCHES = 5000;

  // `layer` sits behind the (transparent) textarea and mirrors its text, so matches can be highlighted everywhere.
  // `state` ({ open, query }) lives outside so it survives tab switches.
  function createFind(textarea, layer, state, language) {
    let matches = [], cur = -1, raf = 0;
    const btn = (name, label, fn) => h('button', { class: 'btn icon ghost', type: 'button', title: label, 'aria-label': label, onclick: fn }, icon(name, 18));

    const input = h('input', { class: 'input', type: 'search', value: state.query, placeholder: 'Find in file', 'aria-label': 'Find in file', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'search' });
    const count = h('span', { class: 'editor-find-count mono tiny mute', 'aria-live': 'polite' });
    const prev = btn('chevronUp', 'Previous match', () => step(-1));
    const next = btn('chevronDown', 'Next match', () => step(1));
    const bar = h('div', { class: 'editor-find', role: 'search', hidden: !state.open }, input, count, prev, next, btn('x', 'Close find', () => close()));

    function sync() { layer.scrollTop = textarea.scrollTop; layer.scrollLeft = textarea.scrollLeft; }
    textarea.addEventListener('scroll', sync);

    function compute() {
      const q = state.query.toLowerCase(), hay = textarea.value.toLowerCase();
      matches = [];
      if (!q) return;
      for (let i = hay.indexOf(q); i > -1 && matches.length < MAX_MATCHES; i = hay.indexOf(q, i + q.length)) matches.push(i);
    }

    function paint(pickNearCaret) {
      const text = textarea.value;
      const syntax = TOKENIZERS[language] && text.length <= MAX_SYNTAX;
      textarea.classList.toggle('syntax', !!syntax);
      layer.classList.toggle('syn', !!syntax);
      if (!state.open && !syntax) { layer.textContent = ''; return; }
      const toks = syntax ? TOKENIZERS[language](text) : [];
      if (!state.open) { layer.innerHTML = compose(text, toks, [], 0, -1) + '\n\u200b'; sync(); return; }
      compute();
      if (!matches.length) cur = -1;
      else if (pickNearCaret || cur < 0 || cur >= matches.length) {
        const caret = textarea.selectionStart || 0;
        const i = matches.findIndex((m) => m >= caret);
        cur = i < 0 ? 0 : i;
      }
      layer.innerHTML = compose(text, toks, matches, state.query.length, cur) + '\n\u200b';
      count.textContent = !state.query ? '' : matches.length ? (cur + 1) + '/' + matches.length + (matches.length >= MAX_MATCHES ? '+' : '') : 'No results';
      prev.disabled = next.disabled = !matches.length;
      sync();
    }

    // scroll the current match into view (about a third of the way down, so context is visible)
    function reveal() {
      const mark = layer.querySelector('mark.cur');
      if (!mark) return;
      textarea.scrollTop = Math.max(0, mark.offsetTop - textarea.clientHeight / 3);
      const sl = textarea.scrollLeft, cw = textarea.clientWidth;
      if (mark.offsetLeft < sl + 20 || mark.offsetLeft > sl + cw - 60) textarea.scrollLeft = Math.max(0, mark.offsetLeft - cw / 3);
      sync();
    }

    function step(d) {
      if (!matches.length) return;
      cur = (cur + d + matches.length) % matches.length;
      paint(); reveal();
    }

    function open(prefill) {
      state.open = true; bar.hidden = false;
      if (prefill) { state.query = prefill; input.value = prefill; }
      paint(true); reveal();
      input.focus(); input.select();
    }

    function close() {
      const at = cur >= 0 ? matches[cur] : null, len = state.query.length;
      state.open = false; bar.hidden = true;
      paint();
      textarea.focus({ preventScroll: true });
      if (at !== null) textarea.setSelectionRange(at, at + len); // leave the match selected for editing
    }

    // call after the text changes (typing, tab switch, wrap toggle)
    function refresh() {
      cancelAnimationFrame(raf);
      if (textarea.value.length < 60000) paint(); // small files re-colour instantly so typing never shows a stale layer
      else raf = requestAnimationFrame(() => paint());
    }

    input.addEventListener('input', () => { state.query = input.value; paint(true); reveal(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    });

    paint(state.open);
    return { bar, open, close, refresh };
  }

  return { jsonProblem, wrap, createFind, detectLanguage };
})();
