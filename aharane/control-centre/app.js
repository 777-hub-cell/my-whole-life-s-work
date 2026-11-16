const $ = selector => document.querySelector(selector)
const $$ = selector => [...document.querySelectorAll(selector)]
const CHUNK_BYTES = 1024 * 1024
const MAX_ZIP_BYTES = 50 * 1024 * 1024
let selectedFile = null
let validatedUpdateId = ''
let pollingTimer = null
let sourceFolder = ''
let sourceFile = null
let sourceOriginal = ''
let sourceHash = ''
let sourceDirty = false

let localOnly = false
let studioDbPromise = null
let studioFiles = []
let studioCurrentPath = ''
let studioOriginalText = ''
let studioInstallPrompt = null
let studioObjectUrls = []
const STUDIO_MAX_FILE_BYTES = 2 * 1024 * 1024
const STUDIO_MAX_PROJECT_BYTES = 20 * 1024 * 1024
const STUDIO_MAX_FILES = 250

function showMessage(target, message, kind = '') {
  const element = typeof target === 'string' ? $(target) : target
  if (!element) return
  element.textContent = message || ''
  element.className = 'message' + (kind ? ' ' + kind : '')
}

async function api(path, options = {}) {
  const response = await fetch('/api/aharane/' + path.replace(/^\//, ''), {
    credentials: 'same-origin',
    cache: 'no-store',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || data.message || `Request failed (${response.status}).`)
  }
  return data
}

function formatBytes(bytes) {
  if (!Number.isFinite(Number(bytes))) return '—'
  const value = Number(bytes)
  if (value < 1024) return value + ' B'
  if (value < 1024 * 1024) return (value / 1024).toFixed(1) + ' KB'
  return (value / 1024 / 1024).toFixed(2) + ' MB'
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

function setView(name) {
  const titles = { overview: 'Overview', pairing: 'WhatsApp pairing', deploy: 'Deploy update', files: 'Files Manager', studio: 'Local Studio' }
  if (localOnly && name !== 'studio') name = 'studio'
  $('.view-section').forEach(section => { section.hidden = section.id !== 'view-' + name })
  $('.nav-item[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === name))
  $('#page-name').textContent = titles[name] || 'Overview'
  if (name === 'studio') loadStudioFiles().catch(error => showMessage('#studio-message', error.message, 'error'))
  if (!localOnly && name === 'overview') refreshStatus().catch(error => showMessage('#overview-message', error.message, 'error'))
  if (!localOnly && name === 'deploy') refreshUpdateStatus().catch(error => showMessage('#deploy-message', error.message, 'error'))
  if (!localOnly && name === 'files') {
    refreshPackages().catch(error => showMessage('#files-upload-message', error.message, 'error'))
    refreshDraftStatus().catch(error => showMessage('#source-message', error.message, 'error'))
    loadSourceFolder('').catch(error => showMessage('#source-message', error.message, 'error'))
  }
}

async function refreshStatus() {
  const status = await api('status')
  const pill = $('#service-pill')
  const online = status.state === 'connected'
  pill.classList.toggle('ok', online)
  pill.classList.toggle('bad', ['degraded', 'needs-pairing', 'disconnected'].includes(status.state))
  $('#service-pill-label').textContent = online ? 'Connected' : 'Aharane ' + String(status.state || 'unknown')
  $('#whatsapp-state').textContent = status.connected ? 'Connected' : status.state || 'Unknown'
  $('#whatsapp-dot').classList.toggle('connected', status.connected)
  $('#whatsapp-dot').classList.toggle('offline', !status.connected && ['degraded', 'needs-pairing', 'disconnected'].includes(status.state))
  $('#connection-detail').textContent = status.connected
    ? 'Aharane is connected to WhatsApp.'
    : status.registered ? 'The saved WhatsApp session is not currently connected.' : 'This Aharane instance has not completed WhatsApp pairing.'
  $('#allowed-senders').textContent = String(status.allowlistedSenderCount ?? '—')
  return status
}

async function refreshUpdateStatus() {
  const status = await api('update/status')
  $('#bot-version').textContent = status.currentVersion || '—'
  const update = status.update || { status: 'idle' }
  $('#last-update-status').textContent = update.status || 'No update recorded'
  $('#last-update-version').textContent = update.version || '—'
  $('#last-update-date').textContent = formatDate(update.finishedAt || update.startedAt)
  $('#deployment-state').textContent = update.status || 'idle'
  $('#deployment-version').textContent = update.version || '—'
  $('#deployment-finished').textContent = formatDate(update.finishedAt)
  return update
}

async function refreshPackages() {
  const result = await api('files/packages')
  const list = $('#package-list')
  list.replaceChildren()
  if (!result.packages?.length) {
    const empty = document.createElement('p')
    empty.className = 'muted'
    empty.textContent = 'No ZIP packages stored yet.'
    list.append(empty)
    return
  }
  for (const item of result.packages) {
    const row = document.createElement('div')
    row.className = 'package-row'
    const icon = document.createElement('span')
    icon.className = 'package-file-icon'
    icon.textContent = 'ZIP'
    const info = document.createElement('div')
    info.className = 'package-info'
    const name = document.createElement('strong')
    name.textContent = item.filename
    const details = document.createElement('small')
    details.textContent = `Version ${item.version} · ${formatBytes(item.size)} · ${item.fileCount} files`
    info.append(name, details)
    const version = document.createElement('span')
    version.className = 'package-version'
    version.textContent = item.version
    const actions = document.createElement('div')
    actions.className = 'package-actions'
    const menuButton = document.createElement('button')
    menuButton.className = 'package-menu-button'
    menuButton.type = 'button'
    menuButton.textContent = '⋯'
    menuButton.setAttribute('aria-label', 'More actions for ' + item.filename)
    const menu = document.createElement('div')
    menu.className = 'package-menu'
    menu.hidden = true
    const updateButton = document.createElement('button')
    updateButton.type = 'button'
    updateButton.textContent = 'Update Aharane'
    updateButton.addEventListener('click', () => {
      menu.hidden = true
      void useStoredPackage(item.updateId)
    })
    const removeButton = document.createElement('button')
    removeButton.type = 'button'
    removeButton.textContent = 'Remove ZIP'
    removeButton.addEventListener('click', () => {
      menu.hidden = true
      void removeStoredPackage(item.updateId, item.filename)
    })
    menu.append(updateButton, removeButton)
    menuButton.addEventListener('click', () => { menu.hidden = !menu.hidden })
    actions.append(menuButton, menu)
    row.append(icon, info, version, actions)
    list.append(row)
  }
}

function setSourceMessage(message, kind = '') {
  showMessage('#source-message', message, kind)
}

async function refreshDraftStatus() {
  const status = await api('files/draft-status')
  $('#source-draft-status').textContent = status.pending
    ? `${status.changedCount} saved file change${status.changedCount === 1 ? '' : 's'} waiting to be applied`
    : 'No saved file changes'
  $('#source-apply').disabled = !status.pending
  $('#source-discard').hidden = !status.pending
  return status
}

function updateSourceBreadcrumb() {
  const parts = sourceFolder ? sourceFolder.split('/') : []
  const root = document.createElement('button')
  root.type = 'button'
  root.className = 'crumb-button'
  root.textContent = 'Aharane'
  root.addEventListener('click', () => { void loadSourceFolder('') })
  const breadcrumb = $('#source-breadcrumb')
  breadcrumb.replaceChildren(root)
  for (let index = 0; index < parts.length; index += 1) {
    const separator = document.createElement('span')
    separator.textContent = '/'
    separator.className = 'crumb-separator'
    breadcrumb.append(separator)
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'crumb-button'
    button.textContent = parts[index]
    const path = parts.slice(0, index + 1).join('/')
    button.addEventListener('click', () => { void loadSourceFolder(path) })
    breadcrumb.append(button)
  }
  $('#source-up').disabled = !sourceFolder
  $('#source-new-file').disabled = !sourceFolder
  $('#source-new-folder').disabled = !sourceFolder
}

async function loadSourceFolder(folder) {
  if (sourceDirty && !window.confirm('Discard unsaved editor typing and close this file?')) return
  sourceFolder = String(folder || '')
  sourceFile = null
  sourceOriginal = ''
  sourceHash = ''
  sourceDirty = false
  $('#source-editor-panel').hidden = true
  updateSourceBreadcrumb()
  $('#source-file-list').replaceChildren()
  const loading = document.createElement('p')
  loading.className = 'muted'
  loading.textContent = 'Loading source files…'
  $('#source-file-list').append(loading)
  const query = sourceFolder ? '?item=' + encodeURIComponent(sourceFolder) : ''
  const result = await api('files/tree' + query)
  const list = $('#source-file-list')
  list.replaceChildren()
  if (!result.children?.length) {
    const empty = document.createElement('p')
    empty.className = 'muted'
    empty.textContent = 'This folder is empty.'
    list.append(empty)
  }
  for (const item of result.children || []) {
    const row = document.createElement('div')
    row.className = 'source-file-row'
    const name = document.createElement('button')
    name.className = 'source-file-open'
    name.type = 'button'
    const icon = document.createElement('span')
    icon.className = 'source-file-icon'
    icon.textContent = item.type === 'folder' ? '▰' : '▤'
    const text = document.createElement('span')
    text.className = 'source-file-label'
    const title = document.createElement('strong')
    title.textContent = item.name
    const meta = document.createElement('small')
    meta.textContent = item.type === 'folder' ? 'Folder' : formatBytes(item.size)
    text.append(title, meta)
    name.append(icon, text)
    name.addEventListener('click', () => {
      if (item.type === 'folder') void loadSourceFolder(item.path)
      else void openSourceFile(item.path)
    })
    row.append(name)
    if (item.type === 'file' && !['README.md', 'UPDATE-PACKAGE.md', 'LICENSE', 'AGENTS.md'].includes(item.name)) {
      const deleteButton = document.createElement('button')
      deleteButton.className = 'source-file-delete'
      deleteButton.type = 'button'
      deleteButton.textContent = 'Delete'
      deleteButton.addEventListener('click', () => { void deleteSourceFile(item.path) })
      row.append(deleteButton)
    }
    list.append(row)
  }
  await refreshDraftStatus()
}

async function openSourceFile(path) {
  if (sourceDirty && !window.confirm('Discard unsaved editor typing and open another file?')) return
  try {
    const result = await api('files/preview?item=' + encodeURIComponent(path))
    sourceFile = result.path
    sourceOriginal = result.content
    sourceHash = result.sha256
    sourceDirty = false
    $('#source-editor-name').textContent = result.path
    $('#source-editor').value = result.content
    $('#source-save').disabled = true
    $('#source-editor-meta').textContent = `${result.language.toUpperCase() || 'TEXT'} · ${formatBytes(result.size)} · 512 KB limit`
    $('#source-editor-panel').hidden = false
    $('#source-editor').focus()
    setSourceMessage('Opened ' + result.path + '.', 'success')
  } catch (error) {
    setSourceMessage(error.message, 'error')
  }
}

async function saveSourceFile() {
  if (!sourceFile) return
  const content = $('#source-editor').value
  $('#source-save').disabled = true
  try {
    const result = await api('files/content', {
      method: 'PUT',
      body: JSON.stringify({ path: sourceFile, content, expectedSha256: sourceHash }),
    })
    sourceOriginal = content
    sourceHash = result.sha256
    sourceDirty = false
    $('#source-save').disabled = true
    await refreshDraftStatus()
    const savedPath = sourceFile
    setSourceMessage('Saved ' + savedPath + '. It is not running until you apply the changes.', 'success')
    await loadSourceFolder(sourceFolder)
    await openSourceFile(savedPath)
  } catch (error) {
    setSourceMessage(error.message, 'error')
  } finally {
    $('#source-save').disabled = false
  }
}

async function createSourceItem(type) {
  const name = window.prompt(type === 'folder' ? 'New folder name' : 'New source filename')
  if (!name || !name.trim()) return
  try {
    const result = await api('files', {
      method: 'POST',
      body: JSON.stringify({ parentPath: sourceFolder, name: name.trim(), type, content: type === 'file' ? '' : undefined }),
    })
    await loadSourceFolder(sourceFolder)
    if (type === 'file') await openSourceFile(result.path)
    setSourceMessage((type === 'folder' ? 'Created folder ' : 'Created file ') + result.path + '.', 'success')
  } catch (error) {
    setSourceMessage(error.message, 'error')
  }
}

async function deleteSourceFile(path) {
  if (!window.confirm('Delete ' + path + '? A backup will be kept until the edits are applied or discarded.')) return
  try {
    await api('files/delete', { method: 'POST', body: JSON.stringify({ paths: [path] }) })
    if (sourceFile === path) {
      sourceFile = null
      sourceDirty = false
      $('#source-editor-panel').hidden = true
    }
    await loadSourceFolder(sourceFolder)
    setSourceMessage('Deleted ' + path + '. Apply changes to make the deletion active.', 'success')
  } catch (error) {
    setSourceMessage(error.message, 'error')
  }
}

async function applySourceChanges(discard = false) {
  const action = discard ? 'Discard the saved file edits? The running bot will remain unchanged.' : 'Apply the saved source edits and restart Aharane?'
  if (!window.confirm(action)) return
  const button = discard ? $('#source-discard') : $('#source-apply')
  button.disabled = true
  try {
    await api(discard ? 'files/discard' : 'files/apply', {
      method: 'POST',
      body: JSON.stringify({ confirm: true }),
    })
    if (discard) {
      sourceFile = null
      sourceDirty = false
      $('#source-editor-panel').hidden = true
      await refreshDraftStatus()
      await loadSourceFolder(sourceFolder)
      setSourceMessage('Saved edits discarded. The live Aharane release was never changed.', 'success')
    } else {
      setSourceMessage('Checks passed. Restarting Aharane with your saved edits…', 'success')
      pollManualEditStatus()
    }
  } catch (error) {
    button.disabled = false
    setSourceMessage(error.message, 'error')
  }
}

function pollManualEditStatus() {
  if (pollingTimer) clearInterval(pollingTimer)
  let attempts = 0
  pollingTimer = setInterval(async () => {
    attempts += 1
    try {
      const update = await refreshUpdateStatus()
      const draft = await refreshDraftStatus()
      if (['succeeded', 'rolled_back', 'failed', 'rollback_failed'].includes(update.status)) {
        clearInterval(pollingTimer)
        pollingTimer = null
        const success = update.status === 'succeeded'
        setSourceMessage(update.message || (success ? 'Aharane restarted successfully.' : 'The restart did not pass its health check.'), success ? 'success' : 'error')
        if (!draft.pending) {
          sourceFile = null
          sourceDirty = false
          await loadSourceFolder(sourceFolder)
        }
      }
    } catch (error) {
      setSourceMessage(error.message, 'error')
    }
    if (attempts > 90) {
      clearInterval(pollingTimer)
      pollingTimer = null
      setSourceMessage('Status polling stopped. Refresh the Files Manager to check the deployment result.', 'error')
    }
  }, 2000)
}

async function useStoredPackage(updateId) {
  setView('deploy')
  $('#preview-panel').hidden = true
  showMessage('#validation-message', 'Rechecking the stored ZIP package…')
  try {
    const preview = await api('update/validate', {
      method: 'POST',
      body: JSON.stringify({ updateId }),
    })
    showPreview(preview)
    showMessage('#validation-message', 'Loaded from Files Manager. Review the changes before deploying.', 'success')
  } catch (error) {
    showMessage('#validation-message', error.message, 'error')
  }
}

async function removeStoredPackage(updateId, filename) {
  if (!window.confirm(`Remove ${filename} from the Aharane package library?`)) return
  try {
    await api('files/packages/remove', {
      method: 'POST',
      body: JSON.stringify({ updateId }),
    })
    await refreshPackages()
    showMessage('#files-upload-message', 'ZIP package removed from Files Manager.', 'success')
  } catch (error) {
    showMessage('#files-upload-message', error.message, 'error')
  }
}

function clearPackage() {
  selectedFile = null
  validatedUpdateId = ''
  $('#zip-input').value = ''
  $('#selected-file').hidden = true
  $('#preview-panel').hidden = true
  $('#upload-progress').hidden = true
  $('#validate-zip').disabled = true
}

function setPackage(file) {
  clearPackage()
  if (!file) return
  if (!file.name.toLowerCase().endsWith('.zip') || file.type && !['application/zip', 'application/x-zip-compressed', 'application/octet-stream'].includes(file.type)) {
    showMessage('#validation-message', 'Choose a ZIP archive.', 'error')
    return
  }
  if (file.size > MAX_ZIP_BYTES) {
    showMessage('#validation-message', 'This ZIP is larger than the 50 MB limit.', 'error')
    return
  }
  if (file.size < 22) {
    showMessage('#validation-message', 'The selected file is too small to be a valid ZIP archive.', 'error')
    return
  }
  selectedFile = file
  $('#selected-file').hidden = false
  $('#selected-name').textContent = file.name
  $('#selected-size').textContent = formatBytes(file.size)
  $('#validate-zip').disabled = false
  showMessage('#validation-message', 'Ready to upload and validate.')
}

function bytesToBase64(bytes) {
  let binary = ''
  const blockSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += blockSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + blockSize))
  }
  return btoa(binary)
}

async function sha256(file) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('')
}

function setProgress(percent, label) {
  $('#upload-progress').hidden = false
  $('#progress-bar').style.width = percent + '%'
  $('#progress-value').textContent = percent + '%'
  $('#progress-label').textContent = label
}

function renderChanges(changes) {
  const target = $('#change-list')
  target.replaceChildren()
  const groups = [
    ['New files', changes?.added || []],
    ['Replaced files', changes?.replaced || []],
    ['Removed files', changes?.removed || []],
  ]
  for (const [title, items] of groups) {
    if (!items.length) continue
    const group = document.createElement('div')
    group.className = 'change-group'
    const heading = document.createElement('strong')
    heading.textContent = title
    group.append(heading)
    for (const item of items) {
      const line = document.createElement('p')
      line.textContent = typeof item === 'string' ? item : item.path
      group.append(line)
    }
    target.append(group)
  }
  if (!target.childElementCount) target.textContent = 'No file changes were detected.'
}

function showPreview(data) {
  validatedUpdateId = data.updateId
  $('#preview-panel').hidden = false
  $('#preview-target').textContent = data.manifest.target
  $('#preview-version').textContent = data.manifest.bot_version
  $('#preview-current-version').textContent = data.currentVersion || 'unknown'
  $('#preview-file-count').textContent = String(data.fileCount)
  $('#added-count').textContent = String(data.changes?.counts?.added || 0)
  $('#replaced-count').textContent = String(data.changes?.counts?.replaced || 0)
  $('#removed-count').textContent = String(data.changes?.counts?.removed || 0)
  renderChanges(data.changes)
  $('#deploy-button').disabled = false
  showMessage('#validation-message', 'Package identity and contents passed validation.', 'success')
}

async function uploadAndValidateZip(file, saveToFiles = false) {
  if (!file) return
  if (!saveToFiles) {
    $('#validate-zip').disabled = true
    $('#deploy-button').disabled = true
    $('#preview-panel').hidden = true
    showMessage('#validation-message', 'Calculating checksum…')
  } else {
    showMessage('#files-upload-message', 'Calculating checksum…')
  }
  try {
    const updateId = crypto.randomUUID()
    const totalChunks = Math.ceil(file.size / CHUNK_BYTES)
    const checksum = await sha256(file)
    await api('update/upload/start', {
      method: 'POST',
      body: JSON.stringify({
        updateId,
        filename: file.name,
        size: file.size,
        totalChunks,
        sha256: checksum,
      }),
    })
    for (let index = 0; index < totalChunks; index += 1) {
      const start = index * CHUNK_BYTES
      const buffer = new Uint8Array(await file.slice(start, start + CHUNK_BYTES).arrayBuffer())
      await api('update/upload/chunk', {
        method: 'POST',
        body: JSON.stringify({ updateId, index, data: bytesToBase64(buffer) }),
      })
      if (!saveToFiles) {
        setProgress(Math.round(((index + 1) / totalChunks) * 92), `Uploading chunk ${index + 1} of ${totalChunks}`)
      }
    }
    if (!saveToFiles) setProgress(96, 'Checking ZIP contents')
    else showMessage('#files-upload-message', 'Checking the Aharane manifest and package…')
    const preview = await api('update/validate', {
      method: 'POST',
      body: JSON.stringify({ updateId }),
    })
    if (saveToFiles) {
      await refreshPackages()
      showMessage('#files-upload-message', `Saved ${file.name} to the Files Manager. Use its three-dot menu to update Aharane.`, 'success')
    } else {
      setProgress(100, 'Validation complete')
      showPreview(preview)
    }
  } catch (error) {
    if (saveToFiles) showMessage('#files-upload-message', error.message, 'error')
    else {
      showMessage('#validation-message', error.message, 'error')
      $('#deploy-button').disabled = true
    }
  } finally {
    if (!saveToFiles) $('#validate-zip').disabled = !selectedFile
  }
}

async function validateSelectedZip() {
  return uploadAndValidateZip(selectedFile, false)
}

async function deploySelectedZip() {
  if (!validatedUpdateId) return
  const version = $('#preview-version').textContent
  const approved = window.confirm(`Deploy Aharane version ${version}? The bot will restart. Its WhatsApp session and persistent data are preserved.`)
  if (!approved) return
  $('#deploy-button').disabled = true
  showMessage('#deploy-message', 'Preparing a new release. Aharane will restart after installation.', 'success')
  try {
    await api('update/deploy', {
      method: 'POST',
      body: JSON.stringify({ updateId: validatedUpdateId, confirm: true }),
    })
    startDeploymentPolling()
  } catch (error) {
    $('#deploy-button').disabled = false
    showMessage('#deploy-message', error.message, 'error')
  }
}

function startDeploymentPolling() {
  if (pollingTimer) clearInterval(pollingTimer)
  let attempts = 0
  pollingTimer = setInterval(async () => {
    attempts += 1
    try {
      const update = await refreshUpdateStatus()
      if (['succeeded', 'failed', 'rolled_back', 'rollback_failed'].includes(update.status)) {
        clearInterval(pollingTimer)
        pollingTimer = null
        const success = update.status === 'succeeded'
        showMessage('#deploy-message', update.message || (success ? 'Aharane is running the new release.' : 'The update did not complete successfully.'), success ? 'success' : 'error')
        $('#service-pill').classList.toggle('ok', success)
        return
      }
      showMessage('#deploy-message', update.status === 'preparing'
        ? 'Installing dependencies and preparing the new release…'
        : update.status === 'awaiting-healthcheck'
          ? 'Restarting Aharane and checking the new release…'
          : 'Deployment status: ' + update.status)
    } catch (error) {
      showMessage('#deploy-message', error.message, 'error')
    }
    if (attempts > 90) {
      clearInterval(pollingTimer)
      pollingTimer = null
      showMessage('#deploy-message', 'Status polling stopped. Refresh the page to check the final result.', 'error')
    }
  }, 2000)
}

async function connect() {
  localOnly = false
  document.body.classList.remove('local-only')
  $('#login-button').disabled = true
  showMessage('#login-message', 'Connecting…')
  try {
    await api('login', { method: 'POST', body: JSON.stringify({ token: $('#admin-token').value }) })
    $('#admin-token').value = ''
    $('#login-screen').hidden = true
    $('#application').hidden = false
    await refreshStatus()
    await refreshUpdateStatus()
    setView('overview')
    showMessage('#overview-message', 'Connected to Aharane.', 'success')
  } catch (error) {
    showMessage('#login-message', error.message, 'error')
  } finally {
    $('#login-button').disabled = false
  }
}

async function logout() {
  localOnly = false
  document.body.classList.remove('local-only')
  try { await api('logout', { method: 'POST', body: '{}' }) } catch {}
  if (pollingTimer) clearInterval(pollingTimer)
  $('#application').hidden = true
  $('#login-screen').hidden = false
  $('#admin-token').value = ''
  clearPackage()
}

$('#login-form').addEventListener('submit', event => {
  event.preventDefault()
  void connect()
})
$('#logout-button').addEventListener('click', () => { void logout() })
$('#refresh-button').addEventListener('click', () => {
  Promise.all([refreshStatus(), refreshUpdateStatus()])
    .then(() => showMessage('#overview-message', 'Status refreshed.', 'success'))
    .catch(error => showMessage('#overview-message', error.message, 'error'))
})
$$('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)))
$('#pair-button').addEventListener('click', async () => {
  $('#pair-button').disabled = true
  $('#pair-code').textContent = ''
  try {
    const result = await api('pair-code', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: $('#phone-number').value }),
    })
    $('#pair-code').textContent = result.pairingCode
    showMessage('#pair-message', 'On the Aharane phone, open WhatsApp → Linked devices → Link with phone number and enter this code.', 'success')
  } catch (error) {
    showMessage('#pair-message', error.message, 'error')
  } finally {
    $('#pair-button').disabled = false
  }
})
$('#choose-zip').addEventListener('click', event => {
  event.stopPropagation()
  $('#zip-input').click()
})
$('#drop-zone').addEventListener('click', event => {
  if (event.target.closest('button')) return
  $('#zip-input').click()
})
$('#drop-zone').addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    $('#zip-input').click()
  }
})
$('#drop-zone').addEventListener('dragover', event => {
  event.preventDefault()
  $('#drop-zone').classList.add('dragover')
})
$('#drop-zone').addEventListener('dragleave', () => $('#drop-zone').classList.remove('dragover'))
$('#drop-zone').addEventListener('drop', event => {
  event.preventDefault()
  $('#drop-zone').classList.remove('dragover')
  setPackage(event.dataTransfer.files[0])
})
$('#zip-input').addEventListener('change', event => setPackage(event.target.files[0]))
$('#remove-zip').addEventListener('click', clearPackage)
$('#validate-zip').addEventListener('click', () => { void validateSelectedZip() })
$('#deploy-button').addEventListener('click', () => { void deploySelectedZip() })
$('#files-choose-zip').addEventListener('click', event => {
  event.stopPropagation()
  $('#files-zip-input').click()
})
$('#files-dropzone').addEventListener('click', event => {
  if (event.target.closest('button')) return
  $('#files-zip-input').click()
})
$('#files-dropzone').addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    $('#files-zip-input').click()
  }
})
$('#files-dropzone').addEventListener('dragover', event => {
  event.preventDefault()
  $('#files-dropzone').classList.add('dragover')
})
$('#files-dropzone').addEventListener('dragleave', () => $('#files-dropzone').classList.remove('dragover'))
$('#files-dropzone').addEventListener('drop', event => {
  event.preventDefault()
  $('#files-dropzone').classList.remove('dragover')
  const file = event.dataTransfer.files[0]
  if (!file) return
  if (!file.name.toLowerCase().endsWith('.zip') || file.size > MAX_ZIP_BYTES) {
    showMessage('#files-upload-message', 'Choose an Aharane ZIP no larger than 50 MB.', 'error')
    return
  }
  void uploadAndValidateZip(file, true)
})
$('#files-zip-input').addEventListener('change', event => {
  const file = event.target.files[0]
  event.target.value = ''
  if (!file) return
  if (!file.name.toLowerCase().endsWith('.zip') || file.size > MAX_ZIP_BYTES) {
    showMessage('#files-upload-message', 'Choose an Aharane ZIP no larger than 50 MB.', 'error')
    return
  }
  void uploadAndValidateZip(file, true)
})
$('#refresh-packages').addEventListener('click', () => {
  refreshPackages().catch(error => showMessage('#files-upload-message', error.message, 'error'))
})
$('#source-up').addEventListener('click', () => {
  const parts = sourceFolder.split('/').filter(Boolean)
  void loadSourceFolder(parts.slice(0, -1).join('/'))
})
$('#source-refresh').addEventListener('click', () => {
  loadSourceFolder(sourceFolder).catch(error => setSourceMessage(error.message, 'error'))
})
$('#source-new-file').addEventListener('click', () => { void createSourceItem('file') })
$('#source-new-folder').addEventListener('click', () => { void createSourceItem('folder') })
$('#source-save').addEventListener('click', () => { void saveSourceFile() })
$('#source-close-editor').addEventListener('click', () => {
  if (sourceDirty && !window.confirm('Discard unsaved editor typing and close this file?')) return
  sourceDirty = false
  sourceFile = null
  $('#source-editor-panel').hidden = true
})
$('#source-discard').addEventListener('click', () => { void applySourceChanges(true) })
$('#source-apply').addEventListener('click', () => { void applySourceChanges(false) })
$('#source-editor').addEventListener('input', () => {
  sourceDirty = $('#source-editor').value !== sourceOriginal
  $('#source-save').disabled = !sourceDirty
})


function openStudioDatabase() {
  if (studioDbPromise) return studioDbPromise
  studioDbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('This browser does not support local project storage.'))
    const request = indexedDB.open('aharane-local-studio', 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'path' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Could not open local project storage.'))
  })
  return studioDbPromise
}

async function studioGetAll() {
  const db = await openStudioDatabase()
  return new Promise((resolve, reject) => {
    const request = db.transaction('files', 'readonly').objectStore('files').getAll()
    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(request.error)
  })
}

async function studioPut(item) {
  const db = await openStudioDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('files', 'readwrite')
    transaction.objectStore('files').put(item)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error || new Error('Could not save this file locally.'))
    transaction.onabort = () => reject(transaction.error || new Error('Local save was cancelled.'))
  })
}

function normalizeStudioPath(path) {
  const parts = String(path || '').replace(/\\/g, '/').split('/').filter(part => part && part !== '.')
  if (!parts.length || parts.some(part => part === '..')) return ''
  return parts.join('/')
}

function blockedStudioPath(path) {
  const parts = path.toLowerCase().split('/')
  const name = parts[parts.length - 1]
  if (parts.some(part => ['node_modules', '.git', 'whatsapp-auth', 'auth', 'backups', 'backup', 'logs'].includes(part))) return true
  if (name === '.env' || (name.startsWith('.env.') && name !== '.env.example')) return true
  if (/\.(log|bak|backup|pem|key|p12|pfx)$/i.test(name)) return true
  return false
}

function studioCanEdit(path, type = '') {
  return /\.(js|mjs|cjs|ts|tsx|jsx|json|html?|css|md|txt|ya?ml|xml|svg|sh|py|java|go|sql|toml|ini|conf|example|gitignore)$/i.test(path) ||
    String(type).startsWith('text/')
}

function localStudioMode() {
  localOnly = true
  document.body.classList.add('local-only')
  $('#login-screen').hidden = true
  $('#application').hidden = false
  setView('studio')
  showMessage('#studio-message', 'Local workspace opened. Files and edits are stored on this device.', 'success')
}

function downloadStudioBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}

function renderStudioFiles() {
  const root = $('#studio-file-list')
  root.replaceChildren()
  $('#studio-file-count').textContent = studioFiles.length + (studioFiles.length === 1 ? ' file' : ' files')
  if (!studioFiles.length) {
    const empty = document.createElement('p')
    empty.className = 'muted'
    empty.textContent = 'No local files yet. Import a folder or create a file.'
    root.appendChild(empty)
    return
  }
  for (const item of studioFiles) {
    const row = document.createElement('div')
    row.className = 'studio-file-row' + (item.path === studioCurrentPath ? ' active' : '')
    const open = document.createElement('button')
    open.type = 'button'
    open.className = 'studio-file-open'
    open.textContent = item.path
    open.title = item.path
    open.addEventListener('click', () => openStudioFile(item.path))
    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'studio-file-remove'
    remove.textContent = '×'
    remove.setAttribute('aria-label', 'Remove ' + item.path)
    remove.addEventListener('click', () => removeStudioFile(item.path))
    row.append(open, remove)
    root.appendChild(row)
  }
}

async function loadStudioFiles() {
  studioFiles = (await studioGetAll()).sort((a, b) => a.path.localeCompare(b.path))
  renderStudioFiles()
  await updateStudioPreviewOptions()
  if (studioCurrentPath && studioFiles.some(item => item.path === studioCurrentPath)) {
    const current = studioFiles.find(item => item.path === studioCurrentPath)
    if (studioCanEdit(current.path, current.type)) await openStudioFile(studioCurrentPath, true)
  } else if (!studioFiles.length) {
    studioCurrentPath = ''
    $('#studio-current-file').textContent = 'Choose a project file'
    $('#studio-editor').value = ''
    $('#studio-editor').disabled = true
    $('#studio-save-file').disabled = true
    $('#studio-export-file').disabled = true
  }
}

async function importStudioFiles(fileList) {
  const files = Array.from(fileList || [])
  if (!files.length) return
  let added = 0
  let skipped = 0
  let total = studioFiles.reduce((sum, item) => sum + Number(item.size || 0), 0)
  if (studioFiles.length + files.length > STUDIO_MAX_FILES) {
    showMessage('#studio-message', 'This workspace supports up to 250 files. Import a smaller selection.', 'error')
    return
  }
  for (const file of files) {
    const path = normalizeStudioPath(file.webkitRelativePath || file.name)
    if (!path || blockedStudioPath(path) || file.size > STUDIO_MAX_FILE_BYTES) {
      skipped++
      continue
    }
    const existing = studioFiles.find(item => item.path === path)
    const newTotal = total - Number(existing?.size || 0) + file.size
    if (newTotal > STUDIO_MAX_PROJECT_BYTES) {
      skipped++
      continue
    }
    const type = file.type || 'application/octet-stream'
    const item = { path, type, size: file.size, blob: file, updatedAt: Date.now() }
    if (studioCanEdit(path, type)) item.content = await file.text()
    try {
      await studioPut(item)
      total = newTotal
      added++
    } catch (error) {
      showMessage('#studio-message', 'Local storage could not save the import. Export a backup or free device storage.', 'error')
      break
    }
  }
  await loadStudioFiles()
  showMessage('#studio-message', added + ' file(s) imported.' + (skipped ? ' ' + skipped + ' skipped (protected, too large or over the workspace limit).' : ''), skipped ? '' : 'success')
}

async function openStudioFile(path, skipDirtyCheck = false) {
  if (!skipDirtyCheck && studioCurrentPath && $('#studio-editor').value !== studioOriginalText) {
    if (!window.confirm('Discard unsaved typing and open another file?')) return
  }
  const item = studioFiles.find(file => file.path === path)
  if (!item) return
  studioCurrentPath = path
  renderStudioFiles()
  $('#studio-current-file').textContent = path
  $('#studio-export-file').disabled = false
  const editable = studioCanEdit(path, item.type)
  $('#studio-editor').disabled = !editable
  $('#studio-save-file').disabled = true
  if (editable) {
    const text = typeof item.content === 'string' ? item.content : item.blob ? await item.blob.text() : ''
    $('#studio-editor').value = text
    studioOriginalText = text
    $('#studio-editor-hint').textContent = 'Plain text · ' + formatBytes(item.size || new Blob([text]).size)
  } else {
    $('#studio-editor').value = 'This file is stored locally as a project asset and is not editable as text.'
    studioOriginalText = $('#studio-editor').value
    $('#studio-editor-hint').textContent = 'Binary asset · use it in the website preview.'
  }
  $('#studio-save-state').textContent = 'Saved on this device'
}

async function saveStudioFile() {
  const item = studioFiles.find(file => file.path === studioCurrentPath)
  if (!item || !studioCanEdit(item.path, item.type)) return
  const content = $('#studio-editor').value
  const blob = new Blob([content], { type: item.type || 'text/plain;charset=utf-8' })
  await studioPut({ ...item, content, blob, size: blob.size, updatedAt: Date.now() })
  studioOriginalText = content
  $('#studio-save-file').disabled = true
  $('#studio-save-state').textContent = 'Saved'
  await loadStudioFiles()
  showMessage('#studio-message', 'Saved ' + studioCurrentPath + ' on this device.', 'success')
}

async function createStudioFile() {
  const raw = window.prompt('New file path', 'index.html')
  if (!raw) return
  const path = normalizeStudioPath(raw)
  if (!path || blockedStudioPath(path)) {
    showMessage('#studio-message', 'That file path is not allowed in the local workspace.', 'error')
    return
  }
  if (studioFiles.some(item => item.path === path)) {
    showMessage('#studio-message', 'A file with that path already exists.', 'error')
    return
  }
  const blob = new Blob([''], { type: 'text/plain;charset=utf-8' })
  await studioPut({ path, type: 'text/plain', size: 0, content: '', blob, updatedAt: Date.now() })
  await loadStudioFiles()
  await openStudioFile(path, true)
  showMessage('#studio-message', 'Created ' + path + '.', 'success')
}

async function removeStudioFile(path) {
  if (!window.confirm('Remove ' + path + ' from this device workspace?')) return
  const db = await openStudioDatabase()
  await new Promise((resolve, reject) => {
    const transaction = db.transaction('files', 'readwrite')
    transaction.objectStore('files').delete(path)
    transaction.oncomplete = resolve
    transaction.onerror = () => reject(transaction.error)
  })
  if (studioCurrentPath === path) studioCurrentPath = ''
  await loadStudioFiles()
}

async function exportStudioFile() {
  const item = studioFiles.find(file => file.path === studioCurrentPath)
  if (!item) return
  const blob = item.blob || new Blob([item.content || ''], { type: item.type || 'application/octet-stream' })
  downloadStudioBlob(blob, item.path.split('/').pop() || 'project-file.txt')
}

async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const size = 0x8000
  for (let i = 0; i < bytes.length; i += size) binary += String.fromCharCode(...bytes.subarray(i, i + size))
  return btoa(binary)
}

async function exportStudioBackup() {
  const files = await studioGetAll()
  if (!files.length) {
    showMessage('#studio-message', 'There are no project files to back up yet.', 'error')
    return
  }
  const backup = []
  for (const item of files) {
    const blob = item.blob || new Blob([item.content || ''], { type: item.type || 'application/octet-stream' })
    backup.push({ path: item.path, type: item.type, content: await blobToBase64(blob) })
  }
  const payload = {
    format: 'aharane-local-studio-backup',
    version: 1,
    projectName: $('#studio-project-title').value || 'My project',
    exportedAt: new Date().toISOString(),
    files: backup,
  }
  downloadStudioBlob(new Blob([JSON.stringify(payload)], { type: 'application/json' }), 'aharane-local-studio-backup.json')
  showMessage('#studio-message', 'Local project backup exported.', 'success')
}

function studioSetTab(tab) {
  const preview = tab === 'preview'
  $('#studio-code-pane').hidden = preview
  $('#studio-preview-pane').hidden = !preview
  $('#studio-code-tab').classList.toggle('active', !preview)
  $('#studio-preview-tab').classList.toggle('active', preview)
  $('#studio-code-tab').setAttribute('aria-selected', String(!preview))
  $('#studio-preview-tab').setAttribute('aria-selected', String(preview))
  if (preview) void renderStudioPreview()
}

async function updateStudioPreviewOptions() {
  const select = $('#studio-preview-file')
  const previous = select.value
  const htmlFiles = studioFiles.filter(item => /\.html?$/i.test(item.path))
  select.replaceChildren()
  if (!htmlFiles.length) {
    const option = document.createElement('option')
    option.value = ''
    option.textContent = 'Import an HTML file first'
    select.appendChild(option)
    return
  }
  for (const item of htmlFiles) {
    const option = document.createElement('option')
    option.value = item.path
    option.textContent = item.path
    select.appendChild(option)
  }
  select.value = htmlFiles.some(item => item.path === previous) ? previous : htmlFiles[0].path
}

function resolveStudioAsset(basePath, reference) {
  const raw = String(reference || '').trim().split(/[?#]/)[0]
  if (!raw || /^(data:|https?:|blob:|\/\/|#|mailto:|tel:|javascript:)/i.test(raw)) return ''
  const base = raw.startsWith('/') ? '' : basePath.split('/').slice(0, -1).join('/')
  return normalizeStudioPath((base ? base + '/' : '') + raw.replace(/^\/+/, ''))
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('Could not read preview asset.'))
    reader.readAsDataURL(blob)
  })
}

async function renderStudioPreview() {
  const pagePath = $('#studio-preview-file').value
  const page = studioFiles.find(item => item.path === pagePath)
  const frame = $('#studio-preview-frame')
  for (const url of studioObjectUrls) URL.revokeObjectURL(url)
  studioObjectUrls = []
  if (!page) {
    frame.removeAttribute('src')
    return
  }
  try {
    const htmlText = typeof page.content === 'string' ? page.content : await page.blob.text()
    const parser = new DOMParser()
    const documentPreview = parser.parseFromString(htmlText, 'text/html')
    const lookup = new Map(studioFiles.map(item => [item.path, item]))
    for (const link of [...documentPreview.querySelectorAll('link[rel~="stylesheet"][href]')]) {
      const targetPath = resolveStudioAsset(pagePath, link.getAttribute('href'))
      const asset = lookup.get(targetPath)
      if (asset) {
        const cssText = typeof asset.content === 'string' ? asset.content : await asset.blob.text()
        const cssUrl = URL.createObjectURL(new Blob([cssText], { type: 'text/css' }))
        studioObjectUrls.push(cssUrl)
        link.setAttribute('href', cssUrl)
      }
    }
    for (const style of [...documentPreview.querySelectorAll('style')]) {
      const cssUrl = URL.createObjectURL(new Blob([style.textContent || ''], { type: 'text/css' }))
      studioObjectUrls.push(cssUrl)
      const link = documentPreview.createElement('link')
      link.rel = 'stylesheet'
      link.href = cssUrl
      style.replaceWith(link)
    }
    for (const script of [...documentPreview.querySelectorAll('script')]) {
      if (script.src) {
        const targetPath = resolveStudioAsset(pagePath, script.getAttribute('src'))
        const asset = lookup.get(targetPath)
        if (asset) {
          const scriptText = typeof asset.content === 'string' ? asset.content : await asset.blob.text()
          const scriptUrl = URL.createObjectURL(new Blob([scriptText], { type: 'text/javascript' }))
          studioObjectUrls.push(scriptUrl)
          script.src = scriptUrl
        }
      } else if (script.textContent.trim()) {
        const scriptUrl = URL.createObjectURL(new Blob([script.textContent], { type: 'text/javascript' }))
        studioObjectUrls.push(scriptUrl)
        script.textContent = ''
        script.src = scriptUrl
      }
    }
    for (const element of [...documentPreview.querySelectorAll('[src]')]) {
      if (element.tagName === 'SCRIPT') continue
      const targetPath = resolveStudioAsset(pagePath, element.getAttribute('src'))
      const asset = lookup.get(targetPath)
      if (asset?.blob) element.setAttribute('src', await blobToDataUrl(asset.blob))
    }
    const previewBlob = new Blob(['<!doctype html>\n' + documentPreview.documentElement.outerHTML], { type: 'text/html' })
    const previewUrl = URL.createObjectURL(previewBlob)
    studioObjectUrls.push(previewUrl)
    frame.src = previewUrl
    showMessage('#studio-message', 'Preview refreshed from local project files.', 'success')
  } catch (error) {
    showMessage('#studio-message', 'Preview error: ' + error.message, 'error')
  }
}

$('#open-local-studio').addEventListener('click', () => localStudioMode())
$('#studio-connect-button').addEventListener('click', () => {
  localOnly = false
  document.body.classList.remove('local-only')
  $('#application').hidden = true
  $('#login-screen').hidden = false
  showMessage('#login-message', 'Sign in to manage the remote Aharane bot.')
})
$('#studio-import-files').addEventListener('click', () => $('#studio-files-input').click())
$('#studio-import-folder').addEventListener('click', () => $('#studio-folder-input').click())
$('#studio-files-input').addEventListener('change', event => {
  void importStudioFiles(event.target.files).catch(error => showMessage('#studio-message', error.message, 'error'))
  event.target.value = ''
})
$('#studio-folder-input').addEventListener('change', event => {
  void importStudioFiles(event.target.files).catch(error => showMessage('#studio-message', error.message, 'error'))
  event.target.value = ''
})
$('#studio-new-file').addEventListener('click', () => { void createStudioFile().catch(error => showMessage('#studio-message', error.message, 'error')) })
$('#studio-save-file').addEventListener('click', () => { void saveStudioFile().catch(error => showMessage('#studio-message', error.message, 'error')) })
$('#studio-export-file').addEventListener('click', () => { void exportStudioFile() })
$('#studio-export-backup').addEventListener('click', () => { void exportStudioBackup().catch(error => showMessage('#studio-message', error.message, 'error')) })
$('#studio-code-tab').addEventListener('click', () => studioSetTab('code'))
$('#studio-preview-tab').addEventListener('click', () => studioSetTab('preview'))
$('#studio-refresh-preview').addEventListener('click', () => { void renderStudioPreview() })
$('#studio-preview-file').addEventListener('change', () => { void renderStudioPreview() })
$('#studio-editor').addEventListener('input', () => {
  const dirty = $('#studio-editor').value !== studioOriginalText
  $('#studio-save-file').disabled = !dirty || !studioCurrentPath
  $('#studio-save-state').textContent = dirty ? 'Unsaved local changes' : 'Saved on this device'
})
$('#studio-project-title').addEventListener('change', () => {
  const title = $('#studio-project-title').value.trim()
  if (title) document.title = title + ' · Aharane Local Studio'
})

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault()
  studioInstallPrompt = event
  $('#install-app-button').hidden = false
})
$('#install-app-button').addEventListener('click', async () => {
  if (!studioInstallPrompt) return
  studioInstallPrompt.prompt()
  await studioInstallPrompt.userChoice.catch(() => null)
  studioInstallPrompt = null
  $('#install-app-button').hidden = true
})
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

// A valid session cookie is HttpOnly; status is the session check.
api('status').then(async () => {
  $('#login-screen').hidden = true
  $('#application').hidden = false
  await refreshStatus()
  await refreshUpdateStatus()
}).catch(() => {})
