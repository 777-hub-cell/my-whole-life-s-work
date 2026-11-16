const $ = selector => document.querySelector(selector)
const $$ = selector => [...document.querySelectorAll(selector)]
const CHUNK_BYTES = 1024 * 1024
const MAX_ZIP_BYTES = 50 * 1024 * 1024
let selectedFile = null
let validatedUpdateId = ''
let pollingTimer = null

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
  const titles = { overview: 'Overview', pairing: 'WhatsApp pairing', deploy: 'Deploy update', files: 'Files Manager' }
  $$('.view-section').forEach(section => { section.hidden = section.id !== 'view-' + name })
  $$('.nav-item[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === name))
  $('#page-name').textContent = titles[name] || 'Overview'
  if (name === 'overview') refreshStatus().catch(error => showMessage('#overview-message', error.message, 'error'))
  if (name === 'deploy') refreshUpdateStatus().catch(error => showMessage('#deploy-message', error.message, 'error'))
  if (name === 'files') refreshPackages().catch(error => showMessage('#files-upload-message', error.message, 'error'))
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

// A valid session cookie is HttpOnly; status is the session check.
api('status').then(async () => {
  $('#login-screen').hidden = true
  $('#application').hidden = false
  await refreshStatus()
  await refreshUpdateStatus()
}).catch(() => {})
