/* File explorer + server explorer + configuration viewer.
   These pages talk to /api/files/*, /api/server/* and /api/config.
   The backend must enforce an allowlist of paths and never return secrets. */
(function () {
  const U = NIGHT.util;
  const { h, timeAgo, bytes, duration, clock, dateTime, delay } = U;
  const { icon } = NIGHT.icons;
  const ui = NIGHT.ui;
  const api = NIGHT.api;

  /* ---------- Helpers ---------- */
  const ARCHIVE_RE = /\.(zip|tar\.gz|tgz)$/i;
  const isArchive = (nameOrPath) => ARCHIVE_RE.test(String(nameOrPath || ''));

  function downloadContent(name, content) {
    try {
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      ui.success('Downloaded ' + name);
    } catch (e) { ui.toast('Could not download the file.', 'err'); }
  }

  /* ============================================================ *
   *  FILE EXPLORER
   * ============================================================ */
  async function filesPage(root, ctx) {
    let tree;
    try { tree = await api.getFsTree(); }
    catch (e) { root.append(ui.errorState(e, () => ctx.reload())); return; }
    root.innerHTML = '';
    const readOnly = !api.isMock && api.capabilities?.filesWrite === false;
    const pathParts = path => String(path || '').split('/').filter(Boolean);
    const isCustomCommandPath = path => pathParts(path)[0] === 'custom-commands';
    const canEditPath = path => api.isMock || api.capabilities?.filesWrite !== false || isCustomCommandPath(path);
    const canCreateCustomFileHere = path => api.isMock || api.capabilities?.filesWrite !== false || (pathParts(path).length === 2 && pathParts(path)[0] === 'custom-commands');
    const canCreateCustomFolderHere = path => api.isMock || api.capabilities?.filesWrite !== false || path === '/custom-commands';

    let currentPath = tree.path;
    let selected = new Set();
    
    // Editor state
    let openFiles = [];
    let activeFilePath = null;
    let editorOverlay = null, editorCtl = null;
    const findState = { open: false, query: '' };
    let wrapOn = NIGHT.editorTools.wrap.get();

    const listEl = h('div', { class: 'fm-list' });
    const crumbEl = h('div', { class: 'fm-breadcrumb' });
    const bulkBar = h('div', { class: 'fm-bulk-bar' });
    const fileInput = h('input', { type: 'file', multiple: true, hidden: true, disabled: readOnly, 'aria-label': 'Choose files to upload' });
    const newFileButton = h('button', { class: 'btn ghost', disabled: !canCreateCustomFileHere(currentPath), style: { minWidth: '40px', height: '40px', padding: 0 }, title: 'Create a JavaScript command in a capability folder.', 'aria-label': 'New File', onclick: () => promptNew('file') }, icon('filePlus', 20));
    const newFolderButton = h('button', { class: 'btn ghost', disabled: !canCreateCustomFolderHere(currentPath), style: { minWidth: '40px', height: '40px', padding: 0 }, title: 'Create a command capability folder.', 'aria-label': 'New Folder', onclick: () => promptNew('folder') }, icon('folderPlus', 20));
    const reloadCommandsButton = h('button', { class: 'btn sm', disabled: !isCustomCommandPath(currentPath), title: 'Validate and reload custom commands.', onclick: reloadCustomCommands }, 'Reload commands');
    const dropzone = h('div', { class: 'fm-dropzone', role: 'group', 'aria-label': 'Upload files' },
      icon('upload', 32),
      h('p', {}, 'Drop files here to upload'));
    const fmMain = h('div', { class: 'fm-main' },
      dropzone,
      fileInput,
      h('div', { class: 'fm-toolbar' },
        crumbEl,
        h('div', { class: 'spacer' }),
        h('button', { class: 'btn sm', type: 'button', disabled: readOnly, title: readOnly ? 'Uploads are disabled for immutable production releases.' : 'Upload files', onclick: () => fileInput.click() }, icon('upload', 15), 'Upload'),
        h('div', { class: 'hstack', style: { gap: '4px' } },
          newFileButton,
          newFolderButton,
          reloadCommandsButton
        )
      ),
      bulkBar,
      listEl
    );

    root.append(
      h('div', { class: 'page-head' },
        h('div', { class: 'page-title' }, 'File explorer'),
        h('div', { class: 'page-desc' }, 'Built-in release files stay protected. Your own JavaScript commands are editable inside custom-commands and persist across releases.')
      ),
      api.isMock ? ui.mockBanner('The mock adapter serves a fixed set of sample files. All operations are simulated in the browser.') : null,
      h('div', { class: 'file-manager' }, fmMain)
    );

    // Uploads first persist the archive/file in the current folder. Extraction is a separate,
    // explicit operation so an untrusted archive is never silently expanded on drop.
    async function uploadFiles(files) {
      const chosen = Array.from(files || []);
      if (!chosen.length) return;
      const tooLarge = chosen.find((file) => file.size > 10 * 1024 * 1024);
      if (tooLarge) { ui.toast(tooLarge.name + ' exceeds the 10 MB per-file limit.', 'err'); return; }
      if (readOnly) { ui.toast('Uploads are disabled for immutable production releases.', 'info'); return; }
      try {
        ui.toast('Uploading ' + chosen.length + (chosen.length === 1 ? ' file…' : ' files…'), 'info');
        const result = await api.uploadFiles(chosen, currentPath);
        const count = result && Array.isArray(result.uploaded) ? result.uploaded.length : chosen.length;
        ui.success(count + (count === 1 ? ' file uploaded' : ' files uploaded'), 'Archives are uploaded without automatic extraction.');
        await reload();
      } catch (err) { ui.failure(err); }
      finally { fileInput.value = ''; }
    }
    fileInput.addEventListener('change', () => uploadFiles(fileInput.files));
    fmMain.addEventListener('dragover', (e) => { if (readOnly) return; e.preventDefault(); fmMain.classList.add('dragover'); });
    fmMain.addEventListener('dragleave', (e) => { if (!fmMain.contains(e.relatedTarget)) fmMain.classList.remove('dragover'); });
    fmMain.addEventListener('drop', (e) => {
      e.preventDefault(); fmMain.classList.remove('dragover');
      if (!readOnly && e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
    });

    function findNode(path, node) {
      node = node || tree;
      if (node.path === path) return node;
      if (!node.children) return null;
      for (const c of node.children) {
        const r = findNode(path, c);
        if (r) return r;
      }
      return null;
    }

    async function archive(paths) {
      if (readOnly) return ui.toast('Archive actions are disabled for immutable production releases.', 'info');
      ui.toast('Archiving…', 'info');
      try { await api.archiveItems(paths, currentPath); ui.success(paths.length > 1 ? 'Items archived' : 'File archived'); reload(); } catch (err) { ui.failure(err); }
    }
    async function unarchive(paths) {
      if (readOnly) return ui.toast('Extraction is disabled for immutable production releases.', 'info');
      ui.toast('Extracting…', 'info');
      try {
        for (const p of paths) await api.unarchiveFile(p, currentPath);
        ui.success('Archive extracted', 'Files were unzipped into the current folder.');
        reload();
      } catch (err) { ui.failure(err); }
    }

    async function reload() {
      try {
        tree = await api.getFsTree();
        selected.clear();
        renderList();
      } catch (e) { ui.failure(e); }
    }

    async function reloadCustomCommands() {
      if (!isCustomCommandPath(currentPath)) return;
      if (typeof api.reloadCustomCommands !== 'function') return ui.toast('Custom command reload is available in the live bot panel.', 'info');
      try {
        const result = await api.reloadCustomCommands();
        const count = Array.isArray(result?.custom) ? result.custom.length : 0;
        ui.success('Custom commands reloaded', count + (count === 1 ? ' custom command is active.' : ' custom commands are active.'));
      } catch (error) { ui.failure(error); }
    }

    function updateCommandToolbar() {
      newFileButton.disabled = !canCreateCustomFileHere(currentPath);
      newFolderButton.disabled = !canCreateCustomFolderHere(currentPath);
      reloadCommandsButton.disabled = !isCustomCommandPath(currentPath);
    }

    function promptNew(type) {
      if (type === 'file' ? !canCreateCustomFileHere(currentPath) : !canCreateCustomFolderHere(currentPath)) return;
      const nameIn = ui.textInput({ placeholder: type === 'file' ? 'e.g. hello.js' : 'e.g. general' });
      const go = h('button', { class: 'btn primary', onclick: submit }, 'Create');
      const m = ui.modal({
        title: 'New ' + (type === 'file' ? 'File' : 'Folder'),
        body: [ui.field('Name', nameIn)],
        footer: [h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), go]
      });
      async function submit() {
        const name = nameIn.value.trim();
        if (!name) return;
        go.disabled = true;
        try {
          if (type === 'file') await api.createFile(currentPath, name);
          else await api.createFolder(currentPath, name);
          ui.success('Created successfully');
          m.close(); reload();
        } catch (e) { ui.failure(e); go.disabled = false; }
      }
    }

    function renderBreadcrumb() {
      crumbEl.innerHTML = '';
      const parts = currentPath.split('/').filter(Boolean);
      parts.forEach((p, i) => {
        if (i > 0) crumbEl.append(h('span', { class: 'fm-crumb-sep' }, '/'));
        const sub = '/' + parts.slice(0, i + 1).join('/');
        const isLast = i === parts.length - 1;
        crumbEl.append(h('button', { class: 'fm-crumb', onclick: () => { currentPath = sub; selected.clear(); renderList(); } }, p));
        if (!isLast) crumbEl.append(h('span', { style: { width: '2px' } }));
      });
    }

    function updateBulkBar() {
      if (selected.size === 0) {
        bulkBar.classList.remove('active');
        bulkBar.innerHTML = '';
        return;
      }
      bulkBar.classList.add('active');
      bulkBar.innerHTML = '';
      bulkBar.append(
        h('span', { class: 'small', style: { fontWeight: '500' } }, selected.size + ' selected'),
        h('div', { class: 'spacer' }),
        (() => {
          const paths = Array.from(selected), extract = paths.every(isArchive);
          return h('button', { class: 'btn sm', disabled: readOnly, title: readOnly ? 'Unavailable in read-only release mode.' : '', onclick: () => (extract ? unarchive(paths) : archive(paths)) },
            icon(extract ? 'unarchive' : 'archive', 14), extract ? 'Unarchive' : 'Archive');
        })(),
        h('button', { class: 'btn sm', disabled: readOnly, title: readOnly ? 'Unavailable in read-only release mode.' : '', onclick: () => {
          ui.toast('Move operation triggered', 'info');
        } }, icon('move', 14), 'Move'),
        h('button', { class: 'btn sm', disabled: readOnly, title: readOnly ? 'Unavailable in read-only release mode.' : '', onclick: () => {
          ui.toast('Copy operation triggered', 'info');
        } }, icon('copy', 14), 'Copy'),
        h('button', { class: 'btn sm danger', disabled: !Array.from(selected).every(canEditPath), title: 'Delete selected custom command items.', onclick: async () => {
          const paths = Array.from(selected);
          if (!await ui.confirmAction({ title: 'Delete ' + paths.length + ' items?', message: 'This action cannot be undone.', confirmLabel: 'Delete', danger: true })) return;
          try { await api.deleteItems(paths); ui.success('Items deleted'); reload(); } catch (e) { ui.failure(e); }
        } }, icon('trash', 14), 'Delete')
      );
    }

    function renderList() {
      const node = findNode(currentPath);
      if (!node) return;
      updateCommandToolbar();
      renderBreadcrumb();
      listEl.innerHTML = '';

      let items = (node.children || []).slice();
      items.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1));

      if (!items.length) {
        listEl.append(ui.emptyState('folder', 'Empty folder', 'There are no files or subfolders here.'));
        updateBulkBar();
        return;
      }

      // Header row for desktop
      listEl.append(h('div', { class: 'fm-row', style: { background: 'var(--bg-elev)', fontSize: '10px', fontWeight: '700', letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--text-mute)', cursor: 'default', paddingTop: '8px', paddingBottom: '8px', minHeight: '0' } },
        h('div', { class: 'fm-checkbox-wrap' },
          h('input', { type: 'checkbox', class: 'fm-checkbox', checked: selected.size === items.length && items.length > 0, onchange: (e) => {
            if (e.target.checked) items.forEach(it => selected.add(it.path));
            else selected.clear();
            renderList();
          } })
        ),
        h('div', {}, 'Name'),
        h('div', { class: 'fm-size' }, 'Size'),
        h('div', { class: 'fm-modified' }, 'Modified'),
        h('div', { style: { width: '32px' } })
      ));

      items.forEach((it) => {
        const isFolder = it.type === 'folder';
        const isSel = selected.has(it.path);
        listEl.append(h('div', {
          class: 'fm-row' + (isSel ? ' selected' : ''),
          tabindex: '0',
          role: 'button',
          onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(it); } },
          onclick: () => go(it)
        },
          h('div', { class: 'fm-checkbox-wrap', onclick: (e) => { e.stopPropagation(); if (isSel) selected.delete(it.path); else selected.add(it.path); renderList(); } },
            h('input', { type: 'checkbox', class: 'fm-checkbox', checked: isSel, tabindex: '-1' })
          ),
          h('div', { class: 'fm-name' },
            h('div', { class: 'fm-file-icon' + (isFolder ? ' folder' : '') }, icon(isFolder ? 'folder' : 'file', 15)),
            h('div', { style: { minWidth: '0', flex: '1' } },
              h('div', { class: 'truncate' }, it.name),
              h('div', { class: 'fm-meta' }, isFolder ? ((it.children || []).length + ' item' + ((it.children || []).length === 1 ? '' : 's')) : 'file')
            )
          ),
          h('div', { class: 'fm-size' }, isFolder ? '—' : bytes(it.size || 0)),
          h('div', { class: 'fm-modified' }, it.modified ? timeAgo(it.modified) : ''),
          h('div', { class: 'fm-actions' },
            h('button', {
              class: 'btn icon ghost',
              title: 'Options',
              'aria-label': 'Options for ' + it.name,
              onclick: (e) => { e.preventDefault(); e.stopPropagation(); openOptions(it); }
            }, icon('more', 20))
          )
        ));
      });
      updateBulkBar();
    }

    function go(node) {
      if (node.type === 'folder') {
        currentPath = node.path;
        selected.clear();
        renderList();
      } else {
        openEditor(node);
      }
    }

    function openOptions(file) {
      const isFolder = file.type === 'folder';
      const fileReadOnly = !canEditPath(file.path);
      const extract = !isFolder && isArchive(file.name);
      const opt = (ic, label, fn, cls, disabled = false) => h('button', { class: 'btn' + (cls ? ' ' + cls : ''), disabled, title: disabled ? 'Unavailable in read-only release mode.' : '', style: { justifyContent: 'flex-start', marginTop: cls === 'danger' ? '10px' : null }, onclick: () => { if (disabled) return; m.close(); fn(); } }, icon(ic, 16), label);
      const m = ui.modal({
        title: file.name,
        subtitle: bytes(file.size || 0) + ' · ' + (file.modified ? timeAgo(file.modified) : '') + (fileReadOnly ? ' · Read only' : ''),
        body: [
          opt('download', 'Download', async () => { const preview = await api.getFsPreview(file.path); downloadContent(file.name, preview.content); }),
          opt('edit', 'Rename', () => promptRename(file), null, fileReadOnly),
          opt('move', 'Move', () => ui.toast('Move dialog would open', 'info'), null, readOnly),
          opt('copy', 'Copy', () => ui.toast('Copy dialog would open', 'info'), null, readOnly),
          !isFolder && (extract ? opt('unarchive', 'Unarchive', () => unarchive([file.path]), null, readOnly) : opt('archive', 'Archive', () => archive([file.path]), null, readOnly)),
          opt('trash', 'Delete', async () => {
            if (!await ui.confirmAction({ title: 'Delete ' + file.name + '?', message: 'This action cannot be undone.', confirmLabel: 'Delete', danger: true })) return;
            try { await api.deleteItems([file.path]); ui.success('Deleted'); reload(); } catch (err) { ui.failure(err); }
          }, 'danger', fileReadOnly)
        ]
      });
    }

    function promptRename(file) {
      if (!canEditPath(file.path)) return;
      const nameIn = ui.textInput({ value: file.name });
      const go = h('button', { class: 'btn primary', onclick: submit }, 'Rename');
      const m = ui.modal({
        title: 'Rename',
        body: [ui.field('New Name', nameIn)],
        footer: [h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), go]
      });
      async function submit() {
        const newName = nameIn.value.trim();
        if (!newName || newName === file.name) return m.close();
        go.disabled = true;
        try {
          await api.renameItem(file.path, newName);
          ui.success('Renamed successfully');
          m.close(); reload();
        } catch (e) { ui.failure(e); go.disabled = false; }
      }
    }

    /* ---------- Full-Screen Editor Logic ---------- */
    async function openEditor(file) {
      if (file.type === 'folder') return;

      const existing = openFiles.find(f => f.path === file.path);
      if (existing) {
        activeFilePath = file.path;
        renderEditor();
        return;
      }

      try {
        ui.toast('Opening file...', 'info');
        const preview = await api.getFsPreview(file.path);
        const newFile = { ...preview, isDirty: false };
        openFiles.push(newFile);
        activeFilePath = file.path;
        renderEditor();
      } catch (e) { ui.failure(e); }
    }

    async function confirmDiscard(files) {
      const dirty = files.filter(x => x.isDirty);
      if (!dirty.length) return true;
      return ui.confirmAction({
        title: 'Discard unsaved changes?',
        message: (dirty.length === 1 ? dirty[0].name + ' has' : dirty.length + ' files have') + ' changes that haven\u2019t finished saving. Close anyway?',
        confirmLabel: 'Discard', danger: true
      });
    }
    function closeFile(path) {
      openFiles = openFiles.filter(x => x.path !== path);
      if (activeFilePath === path) activeFilePath = openFiles.length ? openFiles[openFiles.length - 1].path : null;
      NIGHT.dirty.set('editor', openFiles.some(x => x.isDirty));
      renderEditor();
      if (!openFiles.length) reload();
    }
    async function closeEditor() {
      if (!await confirmDiscard(openFiles)) return;
      openFiles = []; activeFilePath = null;
      NIGHT.dirty.set('editor', false);
      renderEditor(); reload();
    }

    function renderEditor() {
      if (!openFiles.length) {
        if (editorOverlay) { editorOverlay.remove(); editorOverlay = null; }
        return;
      }

      if (!editorOverlay) {
        editorOverlay = h('div', { class: 'editor-overlay' });
        editorOverlay.addEventListener('keydown', (ev) => {
          if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'f' && editorCtl) { ev.preventDefault(); editorCtl.openFind(); }
        });
        document.body.append(editorOverlay);
      }

      const activeFile = openFiles.find(f => f.path === activeFilePath) || openFiles[0];
      activeFilePath = activeFile.path;
      const editorReadOnly = !canEditPath(activeFile.path);

      const tabsEl = h('div', { class: 'editor-header' });
      openFiles.forEach(f => {
        const isActive = f.path === activeFilePath;
        tabsEl.append(h('button', {
          class: 'editor-tab' + (isActive ? ' active' : ''), type: 'button',
          'aria-current': isActive ? 'true' : null,
          onclick: () => { if (!isActive) { activeFilePath = f.path; renderEditor(); } }
        },
          h('span', {}, f.name + (f.isDirty ? ' •' : '')),
          h('span', {
            class: 'editor-tab-close', role: 'button', tabindex: '0', title: 'Close ' + f.name, 'aria-label': 'Close ' + f.name,
            onclick: async (ev) => { ev.stopPropagation(); if (await confirmDiscard([f])) closeFile(f.path); },
            onkeydown: async (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.stopPropagation(); if (await confirmDiscard([f])) closeFile(f.path); } }
          }, icon('x', 12))
        ));
      });
      tabsEl.append(h('div', { class: 'spacer' }));
      const wrapBtn = h('button', { class: 'btn icon ghost', type: 'button', title: 'Word wrap', 'aria-label': 'Word wrap', 'aria-pressed': String(wrapOn), style: { alignSelf: 'center', flex: 'none', color: wrapOn ? 'var(--accent)' : null }, onclick: toggleWrap }, icon('wrap', 20));
      tabsEl.append(
        h('button', { class: 'btn icon ghost', type: 'button', title: 'Find in file', 'aria-label': 'Find in file', style: { alignSelf: 'center', flex: 'none' }, onclick: () => editorCtl.openFind() }, icon('search', 20)),
        wrapBtn,
        h('button', { class: 'btn icon ghost', type: 'button', title: 'Close editor', 'aria-label': 'Close editor', style: { alignSelf: 'center', margin: '0 6px 0 0', flex: 'none' }, onclick: closeEditor }, icon('xSquare', 20))
      );

      // save state lives in the footer, bottom-right
      const f = activeFile;
      const isJson = NIGHT.editorTools.detectLanguage(f) === 'json';
      let jsonIssue = isJson ? NIGHT.editorTools.jsonProblem(f.content) : null;
      const saveStatus = h('button', { class: 'editor-status', type: 'button', role: 'status', 'aria-live': 'polite', disabled: editorReadOnly, onclick: () => saveNow({ manual: true }) });
      const STATUS = { saved: ['Saved', 'var(--green)'], dirty: ['Unsaved… tap to save', 'var(--amber)'], saving: ['Saving…', 'var(--blue)'], error: ['Error saving · tap to retry', 'var(--red)'], invalid: ['', 'var(--red)'] };
      function setStatus(kind) {
        saveStatus.textContent = kind === 'invalid' ? 'Invalid JSON' + (jsonIssue && jsonIssue.line ? ' · line ' + jsonIssue.line : '') + ' · not saved' : STATUS[kind][0];
        saveStatus.style.color = STATUS[kind][1];
        saveStatus.disabled = kind === 'saved' || kind === 'saving';
      }
      setStatus(editorReadOnly ? 'saved' : (f.isDirty ? (jsonIssue ? 'invalid' : 'dirty') : 'saved'));
      if (editorReadOnly) saveStatus.textContent = 'Read only';

      const editorBody = h('div', { class: 'editor-body' + (wrapOn ? ' wrap' : '') });
      const gutter = h('div', { class: 'editor-gutter' });
      const hlLayer = h('div', { class: 'editor-hl', 'aria-hidden': 'true' });
      const textarea = h('textarea', { class: 'editor-textarea', spellcheck: 'false', readOnly: editorReadOnly, wrap: wrapOn ? 'soft' : 'off', 'aria-label': (editorReadOnly ? 'Viewing ' : 'Editing ') + f.name });
      editorBody.append(gutter, h('div', { class: 'editor-pane' }, hlLayer, textarea));
      const language = NIGHT.editorTools.detectLanguage(f);
      const find = NIGHT.editorTools.createFind(textarea, hlLayer, findState, language);

      function toggleWrap() {
        wrapOn = !wrapOn;
        NIGHT.editorTools.wrap.set(wrapOn);
        editorBody.classList.toggle('wrap', wrapOn);
        textarea.setAttribute('wrap', wrapOn ? 'soft' : 'off');
        wrapBtn.setAttribute('aria-pressed', String(wrapOn));
        wrapBtn.style.color = wrapOn ? 'var(--accent)' : '';
        find.refresh();
      }
      editorCtl = {
        openFind() {
          const sel = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
          find.open(sel && sel.length <= 80 && !sel.includes('\n') ? sel : '');
        }
      };

      textarea.value = activeFile.content;
      
      function updateLineNumbers() {
        const lines = textarea.value.split('\n').length;
        if (gutter.childElementCount === lines) return;
        let html = '';
        for(let i=1; i<=lines; i++) html += i + '<br>';
        gutter.innerHTML = html;
      }
      updateLineNumbers();
      find.refresh();

      textarea.addEventListener('scroll', () => { gutter.scrollTop = textarea.scrollTop; });

      let saveTimer;
      // opts.manual = the person asked to save (Ctrl+S / tapping the status); autosave never writes invalid JSON
      async function saveNow(opts) {
        if (!f.isDirty) return;
        clearTimeout(saveTimer);
        if (jsonIssue) {
          if (!(opts && opts.manual)) { setStatus('invalid'); return; }
          const ok = await ui.confirmAction({ title: 'Save invalid JSON?', message: (jsonIssue.line ? 'There is a syntax error near line ' + jsonIssue.line + '. ' : 'This file is not valid JSON. ') + 'Saving it could stop the bot from reading this file.', confirmLabel: 'Save anyway', danger: true });
          if (!ok) return;
        }
        const snapshot = f.content;
        setStatus('saving');
        try {
          await api.saveFileContent(f.path, snapshot);
          if (f.content === snapshot) { // nothing typed while the request was in flight
            f.isDirty = false;
            NIGHT.dirty.set('editor', openFiles.some(x => x.isDirty));
            const tab = tabsEl.querySelectorAll('.editor-tab')[openFiles.indexOf(f)];
            if (tab && tab.firstChild) tab.firstChild.textContent = f.name;
            setStatus('saved');
          }
        } catch (err) { setStatus('error'); ui.failure(err); }
      }
      if (!editorReadOnly) textarea.addEventListener('keydown', (ev) => {
        if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') { ev.preventDefault(); saveNow({ manual: true }); return; }
        if (ev.key === 'Tab' && !ev.shiftKey && !ev.ctrlKey && !ev.metaKey) { // keep Tab inside the editor
          ev.preventDefault(); document.execCommand('insertText', false, '  ');
        }
      });
      if (!editorReadOnly) textarea.addEventListener('blur', () => saveNow());
      if (!editorReadOnly) textarea.addEventListener('input', () => {
        if (f.content === textarea.value) return;
        f.content = textarea.value;
        f.isDirty = true;
        NIGHT.dirty.set('editor', true);
        updateLineNumbers();
        const tab = tabsEl.querySelectorAll('.editor-tab')[openFiles.indexOf(f)];
        if (tab && tab.firstChild && !tab.firstChild.textContent.endsWith('•')) tab.firstChild.textContent = f.name + ' •';
        find.refresh();
        jsonIssue = isJson ? NIGHT.editorTools.jsonProblem(f.content) : null;
        clearTimeout(saveTimer);
        if (jsonIssue) { setStatus('invalid'); return; }
        setStatus('dirty');
        saveTimer = setTimeout(saveNow, 1000);
      });

      editorOverlay.innerHTML = '';
      editorOverlay.append(
        tabsEl,
        find.bar,
        editorBody,
        h('div', { class: 'editor-footer' },
          h('div', { class: 'hstack', style: { minWidth: '0', flex: '1', flexWrap: 'nowrap' } },
            h('span', { class: 'mono tiny mute', style: { flex: 'none' } }, language),
            h('span', { class: 'tiny mute', style: { flex: 'none' } }, '·'),
            h('span', { class: 'mono tiny mute truncate', style: { minWidth: '0' } }, activeFile.path)
          ),
          saveStatus
        )
      );
    }

    renderList();
  }

  /* ============================================================ *
   *  SERVER EXPLORER
   * ============================================================ */
  async function serverPage(root, ctx) {
    let status;
    try { status = await api.getServerStatus(); }
    catch (e) { root.append(ui.errorState(e, () => ctx.reload())); return; }
    root.innerHTML = '';

    const logBox = h('div', { class: 'terminal-body', 'aria-live': 'polite', 'aria-label': 'Live server logs' });
    let logFilter = 'all';
    let logTimer, statusTimer;
    let stopped = false;

    const statsRow = h('div', { class: 'stats', style: { marginBottom: '14px' } });
    const servicesList = h('div', { class: 'panel' });
    const acctList = h('div', { class: 'panel' });
    const runtimeBlock = h('div', { class: 'panel' });

    function pill(s) {
      const cls = s === 'healthy' ? 'healthy' : s === 'degraded' ? 'degraded' : 'down';
      return h('span', { class: 'pill ' + cls }, icon(s === 'healthy' ? 'check' : 'alert', 12), s);
    }

    function renderStatus() {
      if (!status) return;
      const m = status.metrics;
      const safe = (value, fallback = '—') => value === null || value === undefined || !Number.isFinite(Number(value)) ? fallback : value;
      const load = safe(m.cpu, null);
      const rss = safe(m.rssBytes, null);
      const heap = safe(m.heapUsedBytes, null);
      const uptime = safe(m.uptime, status.process?.uptimeSeconds ?? null);
      statsRow.replaceChildren(
        h('div', { class: 'stat' }, h('div', { class: 'stat-label' }, 'System load'), h('div', { class: 'stat-value' }, load === null ? '—' : Number(load).toFixed(2)), h('div', { class: 'stat-sub' }, '1-minute host load average')),
        h('div', { class: 'stat' }, h('div', { class: 'stat-label' }, 'Process RAM'), h('div', { class: 'stat-value' }, rss === null ? '—' : bytes(rss)), h('div', { class: 'stat-sub' }, heap === null ? 'RSS usage' : 'Heap ' + bytes(heap))),
        h('div', { class: 'stat' }, h('div', { class: 'stat-label' }, 'Disk'), h('div', { class: 'stat-value' }, 'Not exposed'), h('div', { class: 'stat-sub' }, 'Disk metrics are not available from this API')),
        h('div', { class: 'stat' }, h('div', { class: 'stat-label' }, 'Uptime'), h('div', { class: 'stat-value', style: { fontSize: '18px' } }, uptime === null ? '—' : duration(uptime)), h('div', { class: 'stat-sub' }, 'since process start'))
      );
      servicesList.replaceChildren(
        h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, 'Services')),
        ...status.services.map((s) => h('div', { class: 'svc-row' },
          h('div', { class: 'svc-name' }, h('div', { style: { minWidth: '0' } },
            h('div', { class: 'name', style: { fontSize: '13px' } }, s.name),
            h('div', { class: 'svc-meta' }, s.detail))),
          pill(s.status)
        ))
      );
      acctList.replaceChildren(
        h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, 'Account connection diagnostics')),
        ...status.accountDiagnostics.map((a) => h('div', { class: 'svc-row' },
          h('div', { class: 'svc-name' }, h('div', { style: { minWidth: '0' } },
            h('div', { class: 'name', style: { fontSize: '13px' } }, a.name),
            h('div', { class: 'svc-meta' }, a.latencyMs != null ? 'ping ' + a.latencyMs + ' ms · ' + timeAgo(a.lastPing) : 'no live session'))),
          ui.status(a.status)
        ))
      );
      runtimeBlock.replaceChildren(
        h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, 'Runtime')),
        h('div', { class: 'panel-body' },
          h('dl', { class: 'kv' },
            h('dt', {}, 'Host'), h('dd', { class: 'mono' }, status.runtime.host ?? 'Not available'),
            h('dt', {}, 'Region'), h('dd', { class: 'mono' }, status.runtime.region ?? 'Not available'),
            h('dt', {}, 'OS'), h('dd', { class: 'mono' }, status.runtime.os ?? 'Not available'),
            h('dt', {}, 'Node'), h('dd', { class: 'mono' }, status.runtime.node ?? 'Not available'),
            h('dt', {}, 'Arch'), h('dd', { class: 'mono' }, status.runtime.arch ?? 'Not available')
          )
        )
      );
    }

    function levelClass(level) { return level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : level === 'DEBUG' ? 'debug' : 'info'; }

    function renderLogs(items) {
      logBox.innerHTML = '';
      if (!items.length) { logBox.append(h('div', { class: 'log-entry' }, h('span', { class: 'ts' }, '—'), h('span', { class: 'lvl' }, ''), 'No log entries match this filter.')); return; }
      items.slice().sort((a, b) => a.ts - b.ts).forEach((entry) => {
        logBox.append(h('div', { class: 'log-entry ' + levelClass(entry.level) },
          h('span', { class: 'ts' }, clock(entry.ts)),
          h('span', { class: 'lvl' }, entry.level),
          h('span', { class: 'src' }, entry.source),
          h('span', {}, entry.message)
        ));
      });
      logBox.scrollTop = logBox.scrollHeight;
    }

    async function refreshLogs() {
      if (document.hidden) return;
      if (stopped) return;
      try {
        const res = await api.getServerLogs({ limit: 120, severity: logFilter === 'all' ? 'all' : logFilter });
        renderLogs(res.items);
      } catch (e) { /* keep silent; error banner below */ }
    }

    async function refreshStatus() {
      if (document.hidden) return;
      if (stopped) return;
      try { status = await api.getServerStatus(); renderStatus(); } catch (e) { /* silent */ }
    }

    const filterButtons = [
      ['all', 'All'], ['info', 'Info'], ['warning', 'Warnings'], ['error', 'Errors']
    ].map(([v, l]) => h('button', { class: 'filter-btn' + (v === 'all' ? ' active' : ''), 'data-level': v, onclick: (e) => {
      logFilter = v;
      document.querySelectorAll('.filter-btn').forEach((b) => b.classList.toggle('active', b.dataset.level === v));
      refreshLogs();
    } }, l));

    const terminalHead = h('div', { class: 'terminal-head' },
      h('span', { class: 'terminal-dot', style: { background: '#f87171' } }),
      h('span', { class: 'terminal-dot', style: { background: '#f5b942' } }),
      h('span', { class: 'terminal-dot', style: { background: '#4ade80' } }),
      h('span', { style: { marginLeft: '8px' } }, 'MSCC activity ledger · read-only'),
      h('span', { class: 'spacer', style: { flex: '1' } }),
      h('span', { class: 'tiny' }, 'refreshing every 3s')
    );

    root.append(
      h('div', { class: 'page-head' },
        h('div', { class: 'page-title' }, 'Server explorer'),
        h('div', { class: 'page-desc' }, 'Live logs, service health, account connectivity and runtime details for the bot host.')
      ),
      api.isMock ? ui.mockBanner('Metrics, services and logs are simulated by the mock adapter. No shell command is ever executed from the browser.') : null,
      statsRow,
      h('div', { class: 'grid grid-main' },
        h('div', { class: 'stack' }, servicesList, runtimeBlock),
        h('div', { class: 'stack' }, acctList)
      ),
      h('div', { class: 'panel', style: { marginTop: '14px' } },
        h('div', { class: 'panel-head' },
          h('div', { class: 'panel-title' }, 'Live application logs'),
          h('div', { class: 'hstack', style: { gap: '6px' } }, filterButtons)
        ),
        h('div', { class: 'terminal' },
          terminalHead,
          logBox
        )
      )
    );

    renderStatus();
    refreshLogs();
    logTimer = setInterval(refreshLogs, 3000);
    statusTimer = setInterval(refreshStatus, NIGHT_CONFIG.pollIntervalMs);
    ctx.onCleanup(() => {
      stopped = true;
      clearInterval(logTimer);
      clearInterval(statusTimer);
    });
  }

  /* ============================================================ *
   *  CONFIGURATION VIEWER
   * ============================================================ */
  async function configPage(root, ctx) {
    root.innerHTML = '';
    let active = 'bot';
    const content = h('div', { class: 'stack' });
    const tabs = h('div', { class: 'toolbar', role: 'tablist', 'aria-label': 'Configuration sections' });
    const botTab = h('button', { class: 'btn primary', role: 'tab', 'aria-selected': 'true', onclick: () => show('bot') }, 'Bot configuration');
    const envTab = h('button', { class: 'btn', role: 'tab', 'aria-selected': 'false', onclick: () => show('env') }, 'Environment variables');
    tabs.append(botTab, envTab);

    function kv(label, value, mono = true) {
      const display = value === null || value === undefined || value === '' ? 'Not available' : typeof value === 'boolean' ? (value ? 'On' : 'Off') : String(value);
      return h('div', { class: 'row plain', style: { gap: '16px', alignItems: 'flex-start', flexWrap: 'nowrap' } },
        h('div', { class: 'small mute', style: { flex: '0 0 160px' } }, label),
        h('div', { class: mono === false ? '' : 'mono', style: { flex: '1', minWidth: '0', overflowWrap: 'anywhere', fontSize: '12px' } }, display)
      );
    }

    async function show(which) {
      active = which;
      botTab.classList.toggle('primary', active === 'bot');
      envTab.classList.toggle('primary', active === 'env');
      botTab.setAttribute('aria-selected', String(active === 'bot'));
      envTab.setAttribute('aria-selected', String(active === 'env'));
      content.replaceChildren(h('div', { class: 'panel-body' }, h('span', { class: 'spinner' }), ' Loading…'));
      if (which === 'env') {
        await NIGHT.pages.envPage(content, ctx, { embedded: true });
        return;
      }
      let cfg;
      try { cfg = await api.getServerConfig(); }
      catch (e) { content.replaceChildren(ui.errorState(e, () => show('bot'))); return; }
      const application = cfg.application || {};
      const bot = cfg.bot || {};
      const deployment = cfg.deployment || {};
      const integrations = Array.isArray(cfg.integrations) ? cfg.integrations : [];
      content.replaceChildren(
        h('div', { class: 'panel' },
          h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, 'Bot')),
          h('div', {}, Object.entries(bot).map(([k, v]) => kv(k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()), v)))
        ),
        h('div', { class: 'panel' },
          h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, 'Application')),
          h('div', {}, Object.entries(application).map(([k, v]) => kv(k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()), v)))
        ),
        h('div', { class: 'panel' },
          h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, 'Integrations')),
          integrations.length ? h('div', { class: 'list' },
            h('div', { class: 'list-head' }, h('div', { class: 'col-id' }, 'Provider'), h('div', { class: 'col-profile' }, 'Status'), h('div', { class: 'col-status' }, 'Endpoint')),
            ...integrations.map(i => h('div', { class: 'row plain' },
              h('div', { class: 'col-id' }, h('div', { class: 'avatar', style: { width: '28px', height: '28px', fontSize: '11px' } }, String(i.name || '?').charAt(0)), h('div', { style: { minWidth: '0' } }, h('div', { class: 'name' }, i.name || 'Integration'), h('div', { class: 'meta' }, i.provider || ''))),
              h('div', { class: 'col-profile' }, ui.status(i.status === 'configured' ? 'online' : 'offline', i.status === 'configured' ? 'Configured' : 'Not configured')),
              h('div', { class: 'col-status' }, h('span', { class: 'mono tiny mute' }, i.endpoint || '—'))
            ))
          ) : h('div', { class: 'panel-body small dim' }, 'No integration metadata was returned.')
        ),
        h('div', { class: 'panel' },
          h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, 'Deployment')),
          h('div', {}, Object.entries(deployment).map(([k, v]) => kv(k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()), v)))
        )
      );
    }

    root.append(
      h('div', { class: 'page-head' }, h('div', { class: 'page-title' }, 'Configuration'), h('div', { class: 'page-desc' }, 'Switch between bot configuration and the complete environment-variable inventory. Sensitive values remain masked.')),
      api.isMock ? ui.mockBanner('These values come from the mock adapter. The backend must strip every secret before responding.') : null,
      tabs,
      content
    );
    show(active);
  }

  NIGHT.pages.filesPage = filesPage;
  NIGHT.pages.serverPage = serverPage;
  NIGHT.pages.configPage = configPage;
})();
