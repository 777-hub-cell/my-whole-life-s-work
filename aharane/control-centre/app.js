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
let sourceFolderFiles = []

let localOnly = false
let remoteSession = false
let studioSocket = null
let studioSocketRetryTimer = null
let studioSocketRetryDelay = 1000
let studioDbPromise = null
let studioFiles = []
let studioCurrentPath = ''
let studioOriginalText = ''
let studioInstallPrompt = null
let studioObjectUrls = []
const STUDIO_MAX_FILE_BYTES = 2 * 1024 * 1024
const STUDIO_MAX_PROJECT_BYTES = 20 * 1024 * 1024
const STUDIO_MAX_FILES = 250
const APP_SOURCE_FILES = ['index.html', 'styles.css', 'app.js', 'manifest.webmanifest']
let studioAppSourcePath = 'index.html'
let studioAppSourceOriginal = ''

function showMessage(target, message, kind = '') {
  const element = typeof target === 'string' ? $$(target) : target
  if (!element) return
  element.textContent = message || ''
  element.className = 'message' + (kind ? ' ' + kind : '')
}

async function api(path, options = {}) {
  const response = await fetch('/aharane/api/' + path.replace(/^\//, ''), {
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

// Register the entry-point controls before the rest of the UI initializes.
// A later screen-specific error must not disable sign-in or the on-device workspace.
$$('#login-form')?.addEventListener('submit', event => {
  event.preventDefault()
  void connect('login')
})
$$('#setup-form')?.addEventListener('submit', event => {
  event.preventDefault()
  void connect('setup')
})
$$('#open-local-studio')?.addEventListener('click', () => localStudioMode('studio'))

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
  const titles = { overview: 'Home', pairing: 'Pairing', deploy: 'Update bot', files: 'Files', studio: 'Local workspace', env: 'ENV', chats: 'Chats', configuration: 'Configuration', more: 'More', appearance: 'Appearance', 'app-preferences': 'App preferences', storage: 'Storage', activity: 'Activity and logs', help: 'Help and feedback', about: 'About Aharane Studio' }
  if (['pairing', 'deploy', 'files'].includes(name) && (!remoteSession || localOnly)) {
    void verifyRemoteAccess(name)
    return
  }
  $$('.view-section').forEach(section => { section.hidden = section.id !== 'view-' + name })
  $$('.nav-item[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === name))
  $$('.bottom-nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === name))
  $$('#page-name').textContent = titles[name] || 'Overview'
  if (name === 'studio') loadStudioFiles().catch(error => showMessage('#studio-message', error.message, 'error'))
  if (!localOnly && name === 'overview') { refreshStatus().catch(error => showMessage('#overview-message', error.message, 'error')); refreshUpdateStatus().catch(() => {}); }
  if (!localOnly && name === 'deploy') refreshUpdateStatus().catch(error => showMessage('#deploy-message', error.message, 'error'))
  if (name === 'storage') void refreshStorageUsage()
  if (name === 'activity') renderActivityLog()
  if (!localOnly && name === 'files') {
    refreshPackages().catch(error => showMessage('#files-upload-message', error.message, 'error'))
    refreshDraftStatus().catch(error => showMessage('#source-message', error.message, 'error'))
    loadSourceFolder('').catch(error => showMessage('#source-message', error.message, 'error'))
  }
}

let remoteAccessCheck = null

async function verifyRemoteAccess(viewName) {
  if (remoteAccessCheck) return remoteAccessCheck
  remoteAccessCheck = (async () => {
    try {
      await api('status')
      remoteSession = true
      localOnly = false
      document.body.classList.remove('local-only')
      setView(viewName)
    } catch {
      remoteSession = false
      await openAuthScreen()
    }
  })()
  try {
    await remoteAccessCheck
  } finally {
    remoteAccessCheck = null
  }
}

function setLiveLinkState(label, state = '') {
  const pill = $$('#live-link-pill')
  if (!pill) return
  pill.classList.toggle('ok', state === 'connected')
  pill.classList.toggle('bad', state === 'error')
  $$('#live-link-label').textContent = label
}

function addLiveActivity(label, kind = '') {
  const list = $$('#live-activity-list')
  if (!list) return
  const empty = list.querySelector('.muted')
  if (empty) list.replaceChildren()
  const row = document.createElement('div')
  row.className = 'live-activity-row'
  const dot = document.createElement('i')
  dot.className = 'live-activity-dot' + (kind ? ' ' + kind : '')
  const message = document.createElement('span')
  message.textContent = label
  const time = document.createElement('time')
  time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  row.append(dot, message, time)
  list.prepend(row)
  while (list.children.length > 12) list.lastElementChild.remove()
}

function applyLiveRuntime(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return
  const online = snapshot.state === 'connected'
  $$('#service-pill')?.classList.toggle('ok', online)
  $$('#service-pill')?.classList.toggle('bad', ['degraded', 'needs-pairing', 'disconnected'].includes(snapshot.state))
  if ($$('#service-pill-label')) $$('#service-pill-label').textContent = online ? 'Connected' : 'Aharane ' + String(snapshot.state || 'unknown')
  if ($$('#whatsapp-state')) $$('#whatsapp-state').textContent = snapshot.connected ? 'Connected' : snapshot.state || 'Unknown'
  if ($$('#whatsapp-dot')) {
    $$('#whatsapp-dot').classList.toggle('connected', Boolean(snapshot.connected))
    $$('#whatsapp-dot').classList.toggle('offline', !snapshot.connected && ['degraded', 'needs-pairing', 'disconnected'].includes(snapshot.state))
  }
  if ($$('#allowed-senders')) $$('#allowed-senders').textContent = String(snapshot.allowlistedSenderCount ?? '—')
  if ($$('#account-status-text')) $$('#account-status-text').textContent = snapshot.connected ? 'Connected' : (snapshot.state || 'Not connected')
  if ($$('#home-account-dot')) $$('#home-account-dot').classList.toggle('connected', Boolean(snapshot.connected))
  if ($$('#account-status-dot')) $$('#account-status-dot').classList.toggle('connected', Boolean(snapshot.connected))
  if ($$('#connection-detail')) {
    $$('#connection-detail').textContent = snapshot.connected
      ? ''
      : snapshot.registered ? 'The saved WhatsApp session is not currently connected.' : 'This Aharane instance has not completed WhatsApp pairing.'
  }
}

function handleStudioEvent(event) {
  if (!event || typeof event.type !== 'string') return
  if (['studio.connected', 'studio.snapshot', 'whatsapp.status'].includes(event.type)) {
    applyLiveRuntime(event.data)
    if (event.type === 'whatsapp.status') {
      const state = event.data?.state || 'unknown'
      addLiveActivity('WhatsApp connection: ' + state, state === 'connected' ? 'good' : 'neutral')
    }
    return
  }
  if (event.type === 'whatsapp.command.received') {
    addLiveActivity('Received command ' + String(event.data?.command || 'unknown').slice(0, 40), 'neutral')
    return
  }
  if (event.type === 'whatsapp.command.replied') {
    addLiveActivity('Replied to ' + String(event.data?.command || 'command').slice(0, 40), 'good')
    return
  }
  if (event.type === 'studio.error') addLiveActivity('Live connection error: ' + String(event.data?.error || 'unknown'), 'bad')
}

function stopStudioSocket() {
  if (studioSocketRetryTimer) clearTimeout(studioSocketRetryTimer)
  studioSocketRetryTimer = null
  const active = studioSocket
  studioSocket = null
  if (active) {
    active.onclose = null
    try { active.close(1000, 'Signed out') } catch {}
  }
  setLiveLinkState('Live link off')
}

function connectStudioSocket() {
  if (!remoteSession || localOnly) return
  if (studioSocket && [WebSocket.CONNECTING, WebSocket.OPEN].includes(studioSocket.readyState)) return
  if (studioSocketRetryTimer) clearTimeout(studioSocketRetryTimer)
  studioSocketRetryTimer = null
  setLiveLinkState('Connecting…')
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const socket = new WebSocket(protocol + '//' + location.host + '/aharane/ws')
  studioSocket = socket
  socket.addEventListener('open', () => {
    studioSocketRetryDelay = 1000
    setLiveLinkState('Live', 'connected')
    addLiveActivity('Live connection established', 'good')
    try { socket.send(JSON.stringify({ type: 'status.get' })) } catch {}
  })
  socket.addEventListener('message', event => {
    try { handleStudioEvent(JSON.parse(String(event.data))) } catch {}
  })
  socket.addEventListener('error', () => {
    setLiveLinkState('Connection issue', 'error')
    try { socket.close() } catch {}
  })
  socket.addEventListener('close', () => {
    if (studioSocket === socket) studioSocket = null
    if (!remoteSession || localOnly) return
    setLiveLinkState('Reconnecting…', 'error')
    studioSocketRetryTimer = setTimeout(() => {
      studioSocketRetryTimer = null
      connectStudioSocket()
    }, studioSocketRetryDelay)
    studioSocketRetryDelay = Math.min(30_000, studioSocketRetryDelay * 2)
  })
}

async function refreshStatus() {
  const status = await api('status')
  const pill = $$('#service-pill')
  const online = status.state === 'connected'
  pill.classList.toggle('ok', online)
  pill.classList.toggle('bad', ['degraded', 'needs-pairing', 'disconnected'].includes(status.state))
  $$('#service-pill-label').textContent = online ? 'Connected' : 'Aharane ' + String(status.state || 'unknown')
  $$('#whatsapp-state').textContent = status.connected ? 'Connected' : status.state || 'Unknown'
  $$('#whatsapp-dot').classList.toggle('connected', status.connected)
  $$('#whatsapp-dot').classList.toggle('offline', !status.connected && ['degraded', 'needs-pairing', 'disconnected'].includes(status.state))
  $$('#connection-detail').textContent = status.connected
    ? ''
    : status.registered ? 'The saved WhatsApp session is not currently connected.' : 'This Aharane instance has not completed WhatsApp pairing.'
  $$('#allowed-senders').textContent = String(status.allowlistedSenderCount ?? '—')
  if ($$('#account-status-text')) $$('#account-status-text').textContent = status.connected ? 'Connected' : (status.state || 'Not connected')
  if ($$('#home-account-dot')) $$('#home-account-dot').classList.toggle('connected', Boolean(status.connected))
  if ($$('#account-status-dot')) $$('#account-status-dot').classList.toggle('connected', Boolean(status.connected))
  return status
}

async function refreshUpdateStatus() {
  const status = await api('update/status')
  $$('#bot-version').textContent = status.currentVersion || '—'
  const update = status.update || { status: 'idle' }
  $$('#last-update-status').textContent = update.status || 'No update recorded'
  $$('#last-update-version').textContent = update.version || '—'
  $$('#last-update-date').textContent = formatDate(update.finishedAt || update.startedAt)
  $$('#deployment-state').textContent = update.status || 'idle'
  $$('#deployment-version').textContent = update.version || '—'
  $$('#deployment-finished').textContent = formatDate(update.finishedAt)
  return update
}

async function refreshPackages() {
  const result = await api('files/packages')
  const list = $$('#package-list')
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



let activeChat = null
let activeChatMessages = []
let imageViewerItems = []
let imageViewerIndex = -1
let imageViewerTouchStart = null

function safeChatMediaUrl(value) {
  try {
    const url = new URL(String(value || ''), location.origin)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
}

function chatTimeLabel(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function renderChatList(chats) {
  const target = $$('#chat-list')
  if (!target) return
  target.replaceChildren()
  if (!Array.isArray(chats) || !chats.length) {
    const empty = document.createElement('div')
    empty.className = 'chat-empty-state'
    const title = document.createElement('strong')
    title.textContent = 'No conversations to show'
    const note = document.createElement('p')
    note.textContent = 'Chats will appear here when the WhatsApp messaging service is connected.'
    empty.append(title, note)
    target.append(empty)
    return
  }
  for (const chat of chats) {
    const row = document.createElement('button')
    row.type = 'button'
    row.className = 'chat-row'
    row.addEventListener('click', () => openChatThread(chat))
    const avatar = document.createElement('span')
    avatar.className = 'chat-row-avatar'
    const imageUrl = safeChatMediaUrl(chat.avatarUrl)
    if (imageUrl) {
      const image = document.createElement('img')
      image.src = imageUrl
      image.alt = ''
      avatar.append(image)
    } else avatar.textContent = String(chat.name || '?').trim().charAt(0).toUpperCase() || '?'
    const copy = document.createElement('span')
    copy.className = 'chat-row-copy'
    const top = document.createElement('span')
    top.className = 'chat-row-top'
    const name = document.createElement('strong')
    name.textContent = String(chat.name || chat.phone || 'Unknown contact')
    const time = document.createElement('time')
    time.textContent = chatTimeLabel(chat.timestamp || chat.updatedAt)
    top.append(name, time)
    const bottom = document.createElement('span')
    bottom.className = 'chat-row-bottom'
    const preview = document.createElement('small')
    preview.textContent = String(chat.lastMessage || '')
    bottom.append(preview)
    if (Number(chat.unreadCount) > 0) {
      const unread = document.createElement('span')
      unread.className = 'chat-unread-count'
      unread.textContent = String(chat.unreadCount)
      bottom.append(unread)
    }
    copy.append(top, bottom)
    row.append(avatar, copy)
    target.append(row)
  }
}

function renderChatMessages(messages) {
  const target = $$('#chat-thread-messages')
  if (!target) return
  target.replaceChildren()
  if (!Array.isArray(messages) || !messages.length) {
    const empty = document.createElement('div')
    empty.className = 'chat-thread-empty'
    empty.textContent = 'Messages from this conversation will appear here.'
    target.append(empty)
    return
  }
  for (const message of messages) {
    const row = document.createElement('div')
    row.className = 'chat-message-row ' + (message.fromMe === true || message.direction === 'outgoing' ? 'outgoing' : 'incoming')
    const bubble = document.createElement('div')
    const type = String(message.type || 'text').toLowerCase()
    bubble.className = 'chat-bubble chat-bubble-' + type
    const url = safeChatMediaUrl(message.url)
    const caption = String(message.caption || message.text || '')
    if (type === 'text') {
      bubble.textContent = caption
    } else if (['image', 'gif', 'sticker'].includes(type) && url) {
      const media = document.createElement('button')
      media.type = 'button'
      media.className = 'chat-media-open'
      const image = document.createElement('img')
      image.src = url
      image.alt = caption || (type === 'sticker' ? 'Sticker' : 'Shared image')
      media.append(image)
      media.addEventListener('click', () => openChatImageViewer(message))
      bubble.append(media)
      if (caption) {
        const text = document.createElement('div')
        text.textContent = caption
        bubble.append(text)
      }
    } else if (type === 'video' && url) {
      const media = document.createElement('button')
      media.type = 'button'
      media.className = 'chat-media-open'
      const preview = document.createElement('span')
      preview.className = 'chat-video-preview'
      preview.textContent = 'Play video'
      media.append(preview)
      media.addEventListener('click', () => openChatVideoViewer(message))
      bubble.append(media)
      if (caption) {
        const text = document.createElement('div')
        text.textContent = caption
        bubble.append(text)
      }
    } else if (type === 'audio' && url) {
      const audio = document.createElement('audio')
      audio.className = 'chat-audio'
      audio.controls = true
      audio.preload = 'none'
      audio.src = url
      bubble.append(audio)
    } else if (type === 'document' && url) {
      const link = document.createElement('a')
      link.className = 'chat-document-link'
      link.href = url
      link.download = String(message.fileName || 'WhatsApp document')
      const mark = document.createElement('span')
      mark.className = 'chat-document-mark'
      mark.textContent = 'FILE'
      const name = document.createElement('span')
      name.textContent = String(message.fileName || 'Download document')
      link.append(mark, name)
      bubble.append(link)
    } else {
      bubble.textContent = caption || 'Attachment'
    }
    if (message.timestamp) {
      const time = document.createElement('time')
      time.className = 'chat-message-time'
      time.textContent = chatTimeLabel(message.timestamp)
      bubble.append(time)
    }
    row.append(bubble)
    target.append(row)
  }
  target.scrollTop = target.scrollHeight
}

function openChatThread(chat) {
  if (!chat || typeof chat !== 'object') return
  activeChat = chat
  activeChatMessages = Array.isArray(chat.messages) ? chat.messages : []
  const name = String(chat.name || chat.phone || 'WhatsApp chat')
  $$('#chat-thread-name').textContent = name
  $$('#chat-thread-presence').textContent = chat.statusText || 'WhatsApp conversation'
  const avatar = $$('#chat-thread-avatar')
  avatar.replaceChildren()
  const imageUrl = safeChatMediaUrl(chat.avatarUrl)
  if (imageUrl) {
    const image = document.createElement('img')
    image.src = imageUrl
    image.alt = ''
    avatar.append(image)
  } else avatar.textContent = name.trim().charAt(0).toUpperCase() || '?'
  $$('#chat-thread-message').textContent = ''
  $$('#chat-message-input').value = ''
  renderChatMessages(activeChatMessages)
  $$('#chat-thread-screen').hidden = false
  document.body.classList.add('chat-thread-open')
}

function closeChatThread() {
  $$('#chat-thread-screen').hidden = true
  document.body.classList.remove('chat-thread-open')
  activeChat = null
  activeChatMessages = []
  setView('chats')
}

function showChatImageAt(index) {
  if (!imageViewerItems.length) return
  imageViewerIndex = (index + imageViewerItems.length) % imageViewerItems.length
  const message = imageViewerItems[imageViewerIndex]
  const url = safeChatMediaUrl(message.url)
  if (!url) return
  $$('#chat-image').src = url
  $$('#chat-image-title').textContent = String(message.fileName || (message.type === 'sticker' ? 'Sticker' : 'Photo'))
}

function openChatImageViewer(message) {
  imageViewerItems = activeChatMessages.filter(item => ['image', 'gif', 'sticker'].includes(String(item.type || '').toLowerCase()) && safeChatMediaUrl(item.url))
  imageViewerIndex = imageViewerItems.indexOf(message)
  if (imageViewerIndex < 0) return
  showChatImageAt(imageViewerIndex)
  $$('#chat-image-viewer').hidden = false
  document.body.classList.add('chat-media-open')
}

function closeChatImageViewer() {
  $$('#chat-image-viewer').hidden = true
  $$('#chat-image').removeAttribute('src')
  imageViewerItems = []
  imageViewerIndex = -1
  document.body.classList.remove('chat-media-open')
}

function openChatVideoViewer(message) {
  const url = safeChatMediaUrl(message.url)
  if (!url) return
  const player = $$('#chat-video-player')
  $$('#chat-video-title').textContent = String(message.fileName || 'Video')
  player.src = url
  $$('#chat-video-viewer').hidden = false
  document.body.classList.add('chat-media-open')
  void player.play().catch(() => {})
}

function closeChatVideoViewer() {
  const player = $$('#chat-video-player')
  player.pause()
  player.removeAttribute('src')
  player.load()
  $$('#chat-video-viewer').hidden = true
  document.body.classList.remove('chat-media-open')
}

function downloadChatMedia(url, filename) {
  const safeUrl = safeChatMediaUrl(url)
  if (!safeUrl) return
  const link = document.createElement('a')
  link.href = safeUrl
  link.download = filename || 'whatsapp-media'
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
}

function setSourceMessage(message, kind = '') {
  showMessage('#source-message', message, kind)
}

async function refreshDraftStatus() {
  const status = await api('files/draft-status')
  $$('#source-draft-status').textContent = status.pending
    ? `${status.changedCount} saved file change${status.changedCount === 1 ? '' : 's'} waiting to be applied`
    : 'No saved file changes'
  $$('#source-apply').disabled = !status.pending
  $$('#source-discard').hidden = !status.pending
  return status
}

function updateSourceBreadcrumb() {
  const parts = sourceFolder ? sourceFolder.split('/') : []
  const root = document.createElement('button')
  root.type = 'button'
  root.className = 'crumb-button root-crumb'
  const homeIcon = document.createElement('span')
  homeIcon.className = 'breadcrumb-home-icon'
  homeIcon.setAttribute('aria-hidden', 'true')
  homeIcon.innerHTML = '<svg viewBox="0 0 24 24"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10Z"></path></svg>'
  const homeLabel = document.createElement('span')
  homeLabel.textContent = 'Home'
  root.append(homeIcon, homeLabel)
  root.addEventListener('click', () => { void loadSourceFolder('') })
  const breadcrumb = $$('#source-breadcrumb')
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
  $$('#source-up').disabled = !sourceFolder
  $$('#source-new-file').disabled = false
  $$('#source-new-folder').disabled = false
}

async function loadSourceFolder(folder) {
  if (sourceDirty && !window.confirm('Discard unsaved editor typing and close this file?')) return
  sourceFolder = String(folder || '')
  sourceFile = null
  sourceOriginal = ''
  sourceHash = ''
  sourceDirty = false
  $$('#source-editor-panel').hidden = true
  updateSourceBreadcrumb()
  $$('#source-file-list').replaceChildren()
  const loading = document.createElement('p')
  loading.className = 'muted'
  loading.textContent = 'Loading source files…'
  $$('#source-file-list').append(loading)
  const query = sourceFolder ? '?item=' + encodeURIComponent(sourceFolder) : ''
  const result = await api('files/tree' + query)
  const list = $$('#source-file-list')
  list.replaceChildren()
  if (!result.children?.length) {
    const empty = document.createElement('p')
    empty.className = 'muted'
    empty.textContent = 'This folder is empty.'
    list.append(empty)
  }
  const orderedChildren = [...(result.children || [])].sort((a, b) => (a.type === b.type ? 0 : a.type === 'folder' ? -1 : 1) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  sourceFolderFiles = orderedChildren.filter(item => item.type === 'file')
  for (const item of orderedChildren) {
    const row = document.createElement('div')
    row.className = 'source-file-row'
    row.dataset.name = item.name.toLowerCase()
    row.dataset.type = item.type

    const select = document.createElement('input')
    select.type = 'checkbox'
    select.className = 'source-file-select'
    select.setAttribute('aria-label', 'Select ' + item.name)
    select.addEventListener('change', () => row.classList.toggle('selected', select.checked))

    const name = document.createElement('button')
    name.className = 'source-file-open'
    name.type = 'button'
    const icon = document.createElement('span')
    icon.className = 'source-file-icon'
    icon.setAttribute('aria-hidden', 'true')
    icon.innerHTML = item.type === 'folder'
      ? '<svg viewBox="0 0 24 24"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-11Z"></path><path d="M3.5 9h17"></path></svg>'
      : '<svg viewBox="0 0 24 24"><path d="m8 7-4 5 4 5M16 7l4 5-4 5M14 5l-4 14"></path></svg>'
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
    row.append(select, name)

    const actionWrap = document.createElement('div')
    actionWrap.className = 'source-item-actions'
    const menuButton = document.createElement('button')
    menuButton.className = 'source-menu-button'
    menuButton.type = 'button'
    menuButton.setAttribute('aria-label', 'Actions for ' + item.name)
    menuButton.setAttribute('aria-expanded', 'false')
    menuButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle></svg>'

    const menu = document.createElement('div')
    menu.className = 'source-item-menu'
    menu.hidden = true
    const menuIcons = {
      preview: '<svg viewBox="0 0 24 24"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"></path><circle cx="12" cy="12" r="2.5"></circle></svg>',
      download: '<svg viewBox="0 0 24 24"><path d="M12 3v12m-5-5 5 5 5-5M4 19h16"></path></svg>',
      rename: '<svg viewBox="0 0 24 24"><path d="m14 5 5 5M4 20l4.2-.8L19 8.4a2.1 2.1 0 0 0-3-3L5.2 16.2 4 20Z"></path></svg>',
      duplicate: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg>',
      move: '<svg viewBox="0 0 24 24"><path d="M3 7h6l2 2h10v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"></path><path d="M7 14h10m-4-4 4 4-4 4"></path></svg>',
      archive: '<svg viewBox="0 0 24 24"><path d="M4 7h16v13H4zM3 4h18v3H3zM9 11h6"></path></svg>',
      delete: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"></path></svg>'
    }
    const addMenuAction = (label, iconName, handler, disabled = false, danger = false) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = danger ? 'source-menu-danger' : ''
      button.disabled = disabled
      if (disabled) button.title = 'This action is not available on the server yet.'
      const iconNode = document.createElement('span')
      iconNode.className = 'source-menu-icon'
      iconNode.setAttribute('aria-hidden', 'true')
      iconNode.innerHTML = menuIcons[iconName] || ''
      const labelNode = document.createElement('span')
      labelNode.textContent = label
      button.append(iconNode, labelNode)
      button.addEventListener('click', () => {
        menu.hidden = true
        menuButton.setAttribute('aria-expanded', 'false')
        row.classList.remove('menu-open')
        if (handler) void handler()
      })
      menu.append(button)
    }

    if (item.type === 'file') {
      addMenuAction('Preview', 'preview', () => openSourceFile(item.path))
      addMenuAction('Download', 'download', async () => {
        try {
          const result = await api('files/preview?item=' + encodeURIComponent(item.path))
          const blob = new Blob([result.content], { type: 'text/plain;charset=utf-8' })
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = item.name
          document.body.append(link)
          link.click()
          link.remove()
          URL.revokeObjectURL(url)
        } catch (error) { setSourceMessage(error.message, 'error') }
      })
      addMenuAction('Rename', 'rename', null, true)
      addMenuAction('Duplicate', 'duplicate', null, true)
      addMenuAction('Move', 'move', null, true)
      addMenuAction('Delete', 'delete', () => deleteSourceFile(item.path), ['README.md', 'UPDATE-PACKAGE.md', 'LICENSE', 'AGENTS.md'].includes(item.name), true)
    } else {
      addMenuAction('Rename', 'rename', null, true)
      addMenuAction('Duplicate', 'duplicate', null, true)
      addMenuAction('Move', 'move', null, true)
      addMenuAction('Download as ZIP', 'archive', null, true)
      addMenuAction('Delete', 'delete', null, true, true)
    }

    menuButton.addEventListener('click', event => {
      event.stopPropagation()
      const opening = menu.hidden
      $$('.source-item-menu').forEach(other => {
        other.hidden = true
        other.closest('.source-file-row')?.classList.remove('menu-open')
      })
      $$('.source-menu-button').forEach(other => other.setAttribute('aria-expanded', 'false'))
      menu.hidden = !opening
      menuButton.setAttribute('aria-expanded', String(opening))
      row.classList.toggle('menu-open', opening)
    })
    actionWrap.append(menuButton, menu)
    row.append(actionWrap)
    list.append(row)
  }
  await refreshDraftStatus()
}

function updateSourceEditorLines() {
  const editor = $$('#source-editor')
  const gutter = $$('#source-editor-lines')
  if (!editor || !gutter) return
  const lineCount = Math.max(1, editor.value.split('\n').length)
  gutter.textContent = Array.from({ length: lineCount }, (_, index) => String(index + 1)).join('\n')
  gutter.scrollTop = editor.scrollTop
}

async function openSourceFile(path) {
  if (sourceDirty && !window.confirm('Discard unsaved editor typing and open another file?')) {
    const switcher = $$('#source-editor-file-switcher')
    if (switcher && sourceFile) switcher.value = sourceFile
    return
  }
  try {
    const result = await api('files/preview?item=' + encodeURIComponent(path))
    sourceFile = result.path
    sourceOriginal = result.content
    sourceHash = result.sha256
    sourceDirty = false
    $$('#source-editor-name').textContent = result.path
    $$('#source-editor').value = result.content
    const switcher = $$('#source-editor-file-switcher')
    if (switcher) {
      switcher.replaceChildren()
      for (const item of sourceFolderFiles) {
        const option = document.createElement('option')
        option.value = item.path
        option.textContent = item.name
        switcher.append(option)
      }
      switcher.value = result.path
    }
    updateSourceEditorLines()
    $$('#source-save').disabled = true
    $$('#source-editor-meta').textContent = `${result.language.toUpperCase() || 'TEXT'} · ${formatBytes(result.size)} · 512 KB limit`
    $$('#source-editor-panel').hidden = false
    $$('#source-editor').focus()
    setSourceMessage('Opened ' + result.path + '.', 'success')
  } catch (error) {
    setSourceMessage(error.message, 'error')
  }
}

async function saveSourceFile() {
  if (!sourceFile) return
  const content = $$('#source-editor').value
  $$('#source-save').disabled = true
  try {
    const result = await api('files/content', {
      method: 'PUT',
      body: JSON.stringify({ path: sourceFile, content, expectedSha256: sourceHash }),
    })
    sourceOriginal = content
    sourceHash = result.sha256
    sourceDirty = false
    $$('#source-save').disabled = true
    await refreshDraftStatus()
    const savedPath = sourceFile
    setSourceMessage('Saved ' + savedPath + '. It is not running until you apply the changes.', 'success')
    await loadSourceFolder(sourceFolder)
    await openSourceFile(savedPath)
  } catch (error) {
    setSourceMessage(error.message, 'error')
  } finally {
    $$('#source-save').disabled = !sourceDirty
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
      $$('#source-editor-panel').hidden = true
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
  const button = discard ? $$('#source-discard') : $$('#source-apply')
  button.disabled = true
  try {
    await api(discard ? 'files/discard' : 'files/apply', {
      method: 'POST',
      body: JSON.stringify({ confirm: true }),
    })
    if (discard) {
      sourceFile = null
      sourceDirty = false
      $$('#source-editor-panel').hidden = true
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
  $$('#preview-panel').hidden = true
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
  $$('#zip-input').value = ''
  $$('#selected-file').hidden = true
  $$('#preview-panel').hidden = true
  $$('#upload-progress').hidden = true
  $$('#validate-zip').disabled = true
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
  $$('#selected-file').hidden = false
  $$('#selected-name').textContent = file.name
  $$('#selected-size').textContent = formatBytes(file.size)
  $$('#validate-zip').disabled = false
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
  $$('#upload-progress').hidden = false
  $$('#progress-bar').style.width = percent + '%'
  $$('#progress-value').textContent = percent + '%'
  $$('#progress-label').textContent = label
}

function renderChanges(changes) {
  const target = $$('#change-list')
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
  $$('#preview-panel').hidden = false
  $$('#preview-target').textContent = data.manifest.target
  $$('#preview-version').textContent = data.manifest.bot_version
  $$('#preview-current-version').textContent = data.currentVersion || 'unknown'
  $$('#preview-file-count').textContent = String(data.fileCount)
  $$('#added-count').textContent = String(data.changes?.counts?.added || 0)
  $$('#replaced-count').textContent = String(data.changes?.counts?.replaced || 0)
  $$('#removed-count').textContent = String(data.changes?.counts?.removed || 0)
  renderChanges(data.changes)
  $$('#deploy-button').disabled = false
  showMessage('#validation-message', 'Package identity and contents passed validation.', 'success')
}

async function uploadAndValidateZip(file, saveToFiles = false) {
  if (!file) return
  if (!saveToFiles) {
    $$('#validate-zip').disabled = true
    $$('#deploy-button').disabled = true
    $$('#preview-panel').hidden = true
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
      $$('#deploy-button').disabled = true
    }
  } finally {
    if (!saveToFiles) $$('#validate-zip').disabled = !selectedFile
  }
}

async function validateSelectedZip() {
  return uploadAndValidateZip(selectedFile, false)
}

async function deploySelectedZip() {
  if (!validatedUpdateId) return
  const version = $$('#preview-version').textContent
  const approved = window.confirm(`Deploy Aharane version ${version}? The bot will restart. Its WhatsApp session and persistent data are preserved.`)
  if (!approved) return
  $$('#deploy-button').disabled = true
  showMessage('#deploy-message', 'Preparing a new release. Aharane will restart after installation.', 'success')
  try {
    await api('update/deploy', {
      method: 'POST',
      body: JSON.stringify({ updateId: validatedUpdateId, confirm: true }),
    })
    startDeploymentPolling()
  } catch (error) {
    $$('#deploy-button').disabled = false
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
        $$('#service-pill').classList.toggle('ok', success)
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

async function connect(mode = 'login') {
  localOnly = false
  document.body.classList.remove('local-only')
  const button = mode === 'setup' ? $$('#setup-button') : $$('#login-button')
  button.disabled = true
  showMessage('#login-message', mode === 'setup' ? 'Creating your password…' : 'Signing in…')
  try {
    let result
    if (mode === 'setup') {
      const password = $$('#setup-password').value
      if (password !== $$('#setup-password-confirm').value) throw new Error('The two passwords do not match.')
      result = await api('auth/setup', {
        method: 'POST',
        body: JSON.stringify({ setupCode: $$('#setup-code').value.trim(), password }),
      })
      $$('#setup-code').value = ''
      $$('#setup-password').value = ''
      $$('#setup-password-confirm').value = ''
    } else {
      const password = $$('#studio-password').value
      result = await api('auth/login', { method: 'POST', body: JSON.stringify({ password }) })
      $$('#studio-password').value = ''
    }
    remoteSession = true
    $$('#login-screen').hidden = true
    $$('#application').hidden = false
    await refreshStatus()
    await refreshUpdateStatus()
    setView('overview')
    connectStudioSocket()
    showMessage('#overview-message', 'Connected to Aharane. This device will stay signed in for 30 days.', 'success')
  } catch (error) {
    showMessage('#login-message', error.message, 'error')
  } finally {
    button.disabled = false
  }
}

async function openAuthScreen() {
  $$('#application').hidden = true
  $$('#login-screen').hidden = false
  showMessage('#login-message', 'Checking sign-in setup…')
  try {
    const auth = await api('auth/status')
    $$('#setup-panel').hidden = !auth.setupRequired
    $$('#login-form').hidden = auth.setupRequired
    $$('#auth-hint').textContent = auth.setupRequired
      ? 'Enter the one-time setup code from the Azure terminal, then choose a password of at least 12 characters.'
      : 'Your password is protected on the server. This browser will stay signed in for 30 days.'
    showMessage('#login-message', '')
  } catch (error) {
    showMessage('#login-message', error.message, 'error')
  }
}

async function logout() {
  remoteSession = false
  stopStudioSocket()
  localOnly = false
  document.body.classList.remove('local-only')
  try { await api('auth/logout', { method: 'POST', body: '{}' }) } catch {}
  if (pollingTimer) clearInterval(pollingTimer)
  $$('#studio-password').value = ''
  clearPackage()
  localStudioMode('overview')
}


$$('#logout-button').addEventListener('click', () => { void logout() })
$$('#refresh-button').addEventListener('click', () => {
  Promise.all([refreshStatus(), refreshUpdateStatus()])
    .then(() => showMessage('#overview-message', 'Status refreshed.', 'success'))
    .catch(error => showMessage('#overview-message', error.message, 'error'))
})
document.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target.closest('[data-view]') : null
  if (!target) return
  if (target instanceof HTMLAnchorElement) event.preventDefault()
  setView(target.dataset.view)
})
$$('#pair-button').addEventListener('click', async () => {
  $$('#pair-button').disabled = true
  $$('#pair-code').textContent = ''
  try {
    const result = await api('pair-code', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: $$('#phone-number').value }),
    })
    $$('#pair-code').textContent = result.pairingCode
    showMessage('#pair-message', 'On the Aharane phone, open WhatsApp → Linked devices → Link with phone number and enter this code.', 'success')
  } catch (error) {
    showMessage('#pair-message', error.message, 'error')
  } finally {
    $$('#pair-button').disabled = false
  }
})
$$('#choose-zip').addEventListener('click', event => {
  event.stopPropagation()
  $$('#zip-input').click()
})
$$('#drop-zone').addEventListener('click', event => {
  if (event.target.closest('button')) return
  $$('#zip-input').click()
})
$$('#drop-zone').addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    $$('#zip-input').click()
  }
})
$$('#drop-zone').addEventListener('dragover', event => {
  event.preventDefault()
  $$('#drop-zone').classList.add('dragover')
})
$$('#drop-zone').addEventListener('dragleave', () => $$('#drop-zone').classList.remove('dragover'))
$$('#drop-zone').addEventListener('drop', event => {
  event.preventDefault()
  $$('#drop-zone').classList.remove('dragover')
  setPackage(event.dataTransfer.files[0])
})
$$('#zip-input').addEventListener('change', event => setPackage(event.target.files[0]))
$$('#remove-zip').addEventListener('click', clearPackage)
$$('#validate-zip').addEventListener('click', () => { void validateSelectedZip() })
$$('#deploy-button').addEventListener('click', () => { void deploySelectedZip() })
$$('#files-choose-zip').addEventListener('click', event => {
  event.stopPropagation()
  $$('#files-zip-input').click()
})
$$('#files-dropzone').addEventListener('click', event => {
  if (event.target.closest('button')) return
  $$('#files-zip-input').click()
})
$$('#files-dropzone').addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    $$('#files-zip-input').click()
  }
})
$$('#files-dropzone').addEventListener('dragover', event => {
  event.preventDefault()
  $$('#files-dropzone').classList.add('dragover')
})
$$('#files-dropzone').addEventListener('dragleave', () => $$('#files-dropzone').classList.remove('dragover'))
$$('#files-dropzone').addEventListener('drop', event => {
  event.preventDefault()
  $$('#files-dropzone').classList.remove('dragover')
  const file = event.dataTransfer.files[0]
  if (!file) return
  if (!file.name.toLowerCase().endsWith('.zip') || file.size > MAX_ZIP_BYTES) {
    showMessage('#files-upload-message', 'Choose an Aharane ZIP no larger than 50 MB.', 'error')
    return
  }
  void uploadAndValidateZip(file, true)
})
$$('#files-zip-input').addEventListener('change', event => {
  const file = event.target.files[0]
  event.target.value = ''
  if (!file) return
  if (!file.name.toLowerCase().endsWith('.zip') || file.size > MAX_ZIP_BYTES) {
    showMessage('#files-upload-message', 'Choose an Aharane ZIP no larger than 50 MB.', 'error')
    return
  }
  void uploadAndValidateZip(file, true)
})
$$('#refresh-packages').addEventListener('click', () => {
  refreshPackages().catch(error => showMessage('#files-upload-message', error.message, 'error'))
})
$('#source-up')?.addEventListener('click', () => {
  const parts = sourceFolder.split('/').filter(Boolean)
  void loadSourceFolder(parts.slice(0, -1).join('/'))
})
$('#source-refresh')?.addEventListener('click', () => {
  loadSourceFolder(sourceFolder).catch(error => setSourceMessage(error.message, 'error'))
})
$$('#source-new-file').addEventListener('click', () => { void createSourceItem('file') })
$$('#source-new-folder').addEventListener('click', () => { void createSourceItem('folder') })
$$('#source-save').addEventListener('click', () => { void saveSourceFile() })
$$('#source-close-editor').addEventListener('click', () => {
  if (sourceDirty && !window.confirm('Discard unsaved editor typing and close this file?')) return
  sourceDirty = false
  sourceFile = null
  $$('#source-editor-panel').hidden = true
})
$$('#source-discard').addEventListener('click', () => { void applySourceChanges(true) })
$$('#source-apply').addEventListener('click', () => { void applySourceChanges(false) })
$$('#file-search')?.addEventListener('input', () => {
  const query = $$('#file-search').value.trim().toLowerCase()
  $$('.source-file-row').forEach(row => { row.hidden = query && !row.dataset.name.includes(query) })
})
$$('#source-save-bottom')?.addEventListener('click', () => { void saveSourceFile() })
$$('#source-editor-file-switcher')?.addEventListener('change', event => {
  const path = event.target.value
  if (path) void openSourceFile(path)
})
$$('#source-editor')?.addEventListener('scroll', () => {
  const gutter = $$('#source-editor-lines')
  if (gutter) gutter.scrollTop = $$('#source-editor').scrollTop
})
$$('#open-password-settings')?.addEventListener('click', () => $$('#change-password-button').click())
let sourceAutosaveTimer = null
$$('#source-editor').addEventListener('input', () => {
  updateSourceEditorLines()
  sourceDirty = $$('#source-editor').value !== sourceOriginal
  $$('#source-save').disabled = !sourceDirty
  if (sourceAutosaveTimer) clearTimeout(sourceAutosaveTimer)
  if (sourceDirty) sourceAutosaveTimer = setTimeout(() => {
    sourceAutosaveTimer = null
    void saveSourceFile()
  }, 900)
})



// Close anchored menus when the user taps outside them.
document.addEventListener('click', event => {
  if (!event.target.closest('.source-item-actions')) {
    $$('.source-item-menu').forEach(menu => { menu.hidden = true })
    $$('.source-menu-button').forEach(button => button.setAttribute('aria-expanded', 'false'))
  }
  if (!event.target.closest('.package-actions')) {
    $$('.package-menu').forEach(menu => { menu.hidden = true })
  }
})


// Conversation and media-viewer interactions.
$$('#chat-thread-back')?.addEventListener('click', closeChatThread)
$$('#chat-composer')?.addEventListener('submit', event => {
  event.preventDefault()
  if (!activeChat) return
  const message = $$('#chat-message-input').value.trim()
  if (!message) return
  showMessage('#chat-thread-message', 'Sending messages is not available on this server yet.', 'error')
})
$$('#chat-attach-button')?.addEventListener('click', () => {
  showMessage('#chat-thread-message', 'Attachments are not available until the WhatsApp messaging service is connected.', 'error')
})
$$('#chat-image')?.addEventListener('click', () => {
  $$('#chat-image-viewer').classList.toggle('controls-hidden')
})
$$('#chat-image-close')?.addEventListener('click', closeChatImageViewer)
$$('#chat-image-details')?.addEventListener('click', () => {
  const image = $$('#chat-image')
  if (image.naturalWidth && image.naturalHeight) window.alert(`${$$('#chat-image-title').textContent}\n${image.naturalWidth} × ${image.naturalHeight}`)
})
$$('#chat-image-more')?.addEventListener('click', () => $$('#chat-image-details').click())
$$('#chat-image-download')?.addEventListener('click', () => {
  const message = imageViewerItems[imageViewerIndex]
  if (message) downloadChatMedia(message.url, message.fileName)
})
$$('#chat-image-share')?.addEventListener('click', () => {
  const message = imageViewerItems[imageViewerIndex]
  const url = safeChatMediaUrl(message?.url)
  if (url && navigator.share) void navigator.share({ title: $$('#chat-image-title').textContent, url }).catch(() => {})
  else if (url) showMessage('#chat-thread-message', 'Sharing is not supported by this browser.', 'error')
})
$$('#chat-image-forward')?.addEventListener('click', () => {
  closeChatImageViewer()
  showMessage('#chat-thread-message', 'Forwarding will be available when message actions are connected.', 'error')
})
$$('#chat-video-close')?.addEventListener('click', closeChatVideoViewer)
$$('#chat-video-more')?.addEventListener('click', () => {
  const video = $$('#chat-video-player')
  const duration = Number.isFinite(video.duration) ? Math.round(video.duration) + ' seconds' : 'Duration unavailable'
  window.alert(`${$$('#chat-video-title').textContent}\n${video.videoWidth} × ${video.videoHeight}\n${duration}`)
})
$$('#chat-image-viewer .image-viewer-stage')?.addEventListener('touchstart', event => {
  imageViewerTouchStart = event.changedTouches[0]?.clientX ?? null
}, { passive: true })
$$('#chat-image-viewer .image-viewer-stage')?.addEventListener('touchend', event => {
  if (imageViewerTouchStart === null) return
  const delta = (event.changedTouches[0]?.clientX ?? imageViewerTouchStart) - imageViewerTouchStart
  imageViewerTouchStart = null
  if (Math.abs(delta) > 55 && imageViewerItems.length > 1) showChatImageAt(imageViewerIndex + (delta < 0 ? 1 : -1))
}, { passive: true })
$$('#chat-video-player')?.addEventListener('dblclick', event => {
  const video = $$('#chat-video-player')
  const rect = video.getBoundingClientRect()
  const offset = event.clientX - rect.left
  video.currentTime = Math.max(0, Math.min(video.duration || Infinity, video.currentTime + (offset < rect.width / 2 ? -10 : 10)))
})

function openStudioDatabase() {
  if (studioDbPromise) return studioDbPromise
  studioDbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('This browser does not support local project storage.'))
    const request = indexedDB.open('aharane-local-studio', 2)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'path' })
      if (!db.objectStoreNames.contains('appOverrides')) db.createObjectStore('appOverrides', { keyPath: 'path' })
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

function localStudioMode(initialView = 'overview') {
  const savedTitle = localStorage.getItem('aharane-local-studio-title')
  if (savedTitle) $$('#studio-project-title').value = savedTitle
  $$('#studio-connect-button').textContent = remoteSession ? 'Back to bot controls' : 'Connect to Aharane'
  localOnly = !remoteSession
  document.body.classList.toggle('local-only', localOnly)
  $$('#login-screen').hidden = true
  $$('#application').hidden = false
  if (localOnly) {
    $$('#whatsapp-state').textContent = 'Not connected'
    $$('#connection-detail').textContent = 'Connect to Aharane to retrieve live bot status and controls.'
    $$('#bot-version').textContent = '—'
    $$('#allowed-senders').textContent = '—'
  }
  setView(initialView)
  showMessage(initialView === 'studio' ? '#studio-message' : '#overview-message',
    localOnly ? 'Aharane Local Studio is open on this device. Connect to unlock remote bot management.' : 'Aharane Local Studio is ready.', 'success')
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
  const root = $$('#studio-file-list')
  root.replaceChildren()
  $$('#studio-file-count').textContent = studioFiles.length + (studioFiles.length === 1 ? ' file' : ' files')
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
    $$('#studio-current-file').textContent = 'Choose a project file'
    $$('#studio-editor').value = ''
    $$('#studio-editor').disabled = true
    $$('#studio-save-file').disabled = true
    $$('#studio-export-file').disabled = true
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
  if (!skipDirtyCheck && studioCurrentPath && $$('#studio-editor').value !== studioOriginalText) {
    if (!window.confirm('Discard unsaved typing and open another file?')) return
  }
  const item = studioFiles.find(file => file.path === path)
  if (!item) return
  studioCurrentPath = path
  renderStudioFiles()
  $$('#studio-current-file').textContent = path
  $$('#studio-export-file').disabled = false
  const editable = studioCanEdit(path, item.type)
  $$('#studio-editor').disabled = !editable
  $$('#studio-save-file').disabled = true
  if (editable) {
    const text = typeof item.content === 'string' ? item.content : item.blob ? await item.blob.text() : ''
    $$('#studio-editor').value = text
    studioOriginalText = text
    $$('#studio-editor-hint').textContent = 'Plain text · ' + formatBytes(item.size || new Blob([text]).size)
  } else {
    $$('#studio-editor').value = 'This file is stored locally as a project asset and is not editable as text.'
    studioOriginalText = $$('#studio-editor').value
    $$('#studio-editor-hint').textContent = 'Binary asset · use it in the website preview.'
  }
  $$('#studio-save-state').textContent = 'Saved on this device'
}

async function saveStudioFile() {
  const item = studioFiles.find(file => file.path === studioCurrentPath)
  if (!item || !studioCanEdit(item.path, item.type)) return
  const content = $$('#studio-editor').value
  const blob = new Blob([content], { type: item.type || 'text/plain;charset=utf-8' })
  await studioPut({ ...item, content, blob, size: blob.size, updatedAt: Date.now() })
  studioOriginalText = content
  $$('#studio-save-file').disabled = true
  $$('#studio-save-state').textContent = 'Saved'
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
    projectName: $$('#studio-project-title').value || 'My project',
    exportedAt: new Date().toISOString(),
    files: backup,
  }
  downloadStudioBlob(new Blob([JSON.stringify(payload)], { type: 'application/json' }), 'aharane-local-studio-backup.json')
  showMessage('#studio-message', 'Local project backup exported.', 'success')
}

function studioSetTab(tab) {
  const preview = tab === 'preview'
  $$('#studio-code-pane').hidden = preview
  $$('#studio-preview-pane').hidden = !preview
  $$('#studio-code-tab').classList.toggle('active', !preview)
  $$('#studio-preview-tab').classList.toggle('active', preview)
  $$('#studio-code-tab').setAttribute('aria-selected', String(!preview))
  $$('#studio-preview-tab').setAttribute('aria-selected', String(preview))
  if (preview) void renderStudioPreview()
}

async function updateStudioPreviewOptions() {
  const select = $$('#studio-preview-file')
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


async function rewriteStudioCss(css, cssPath, lookup) {
  const matches = [...css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi)]
  for (const match of matches) {
    const targetPath = resolveStudioAsset(cssPath, match[2])
    const asset = lookup.get(targetPath)
    if (asset?.blob) {
      const dataUrl = await blobToDataUrl(asset.blob)
      css = css.replace(match[0], 'url("' + dataUrl + '")')
    }
  }
  return css
}

async function renderStudioPreview() {
  const pagePath = $$('#studio-preview-file').value
  const page = studioFiles.find(item => item.path === pagePath)
  const frame = $$('#studio-preview-frame')
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
        const cssText = await rewriteStudioCss(typeof asset.content === 'string' ? asset.content : await asset.blob.text(), targetPath, lookup)
        const cssUrl = URL.createObjectURL(new Blob([cssText], { type: 'text/css' }))
        studioObjectUrls.push(cssUrl)
        link.setAttribute('href', cssUrl)
      }
    }
    for (const style of [...documentPreview.querySelectorAll('style')]) {
      const styleText = await rewriteStudioCss(style.textContent || '', pagePath, lookup)
      const cssUrl = URL.createObjectURL(new Blob([styleText], { type: 'text/css' }))
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


$$('#studio-connect-button').addEventListener('click', () => {
  if (remoteSession) {
    localOnly = false
    document.body.classList.remove('local-only')
    setView('overview')
    return
  }
  localOnly = false
  document.body.classList.remove('local-only')
  $$('#application').hidden = true
  $$('#login-screen').hidden = false
  void openAuthScreen()
})
$$('#studio-import-files').addEventListener('click', () => $$('#studio-files-input').click())
$$('#studio-import-folder').addEventListener('click', () => $$('#studio-folder-input').click())
$$('#studio-files-input').addEventListener('change', event => {
  void importStudioFiles(event.target.files).catch(error => showMessage('#studio-message', error.message, 'error'))
  event.target.value = ''
})
$$('#studio-folder-input').addEventListener('change', event => {
  void importStudioFiles(event.target.files).catch(error => showMessage('#studio-message', error.message, 'error'))
  event.target.value = ''
})
$$('#studio-new-file').addEventListener('click', () => { void createStudioFile().catch(error => showMessage('#studio-message', error.message, 'error')) })
$$('#studio-save-file').addEventListener('click', () => { void saveStudioFile().catch(error => showMessage('#studio-message', error.message, 'error')) })
$$('#studio-export-file').addEventListener('click', () => { void exportStudioFile() })
$$('#studio-export-backup').addEventListener('click', () => { void exportStudioBackup().catch(error => showMessage('#studio-message', error.message, 'error')) })
$$('#studio-code-tab').addEventListener('click', () => studioSetTab('code'))
$$('#studio-preview-tab').addEventListener('click', () => studioSetTab('preview'))
$$('#studio-refresh-preview').addEventListener('click', () => { void renderStudioPreview() })
$$('#studio-preview-file').addEventListener('change', () => { void renderStudioPreview() })
$$('#studio-editor').addEventListener('input', () => {
  const dirty = $$('#studio-editor').value !== studioOriginalText
  $$('#studio-save-file').disabled = !dirty || !studioCurrentPath
  $$('#studio-save-state').textContent = dirty ? 'Unsaved local changes' : 'Saved on this device'
})
$$('#studio-project-title').addEventListener('change', () => {
  const title = $$('#studio-project-title').value.trim()
  if (title) {
    localStorage.setItem('aharane-local-studio-title', title)
    document.title = title + ' · Aharane Local Studio'
  }
})

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault()
  studioInstallPrompt = event
  $$('#install-app-button').hidden = false
})
$$('#install-app-button').addEventListener('click', async () => {
  if (!studioInstallPrompt) return
  studioInstallPrompt.prompt()
  await studioInstallPrompt.userChoice.catch(() => null)
  studioInstallPrompt = null
  $$('#install-app-button').hidden = true
})
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/aharane/studio/sw.js', { scope: '/aharane/studio/' }).catch(() => {})
  })
}


$$('#change-password-button').addEventListener('click', () => {
  $$('#current-password').value = ''
  $$('#new-password').value = ''
  $$('#new-password-confirm').value = ''
  showMessage('#password-message', '')
  $$('#password-modal').hidden = false
  $$('#current-password').focus()
})
$$('#password-modal-close').addEventListener('click', () => { $$('#password-modal').hidden = true })
$$('#password-modal-logout').addEventListener('click', () => { $$('#password-modal').hidden = true; void logout() })
$$('#change-password-form').addEventListener('submit', async event => {
  event.preventDefault()
  const currentPassword = $$('#current-password').value
  const newPassword = $$('#new-password').value
  if (newPassword !== $$('#new-password-confirm').value) {
    showMessage('#password-message', 'The two new passwords do not match.', 'error')
    return
  }
  const button = $$('#change-password-submit')
  button.disabled = true
  try {
    await api('auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    })
    $$('#password-modal').hidden = true
    showMessage('#overview-message', 'Your password was changed. Other signed-in sessions have been revoked.', 'success')
  } catch (error) {
    showMessage('#password-message', error.message, 'error')
  } finally {
    button.disabled = false
  }
})

// A valid session cookie is HttpOnly; status is the session check.
api('status').then(async () => {
  remoteSession = true
  localOnly = false
  document.body.classList.remove('local-only')
  $$('#login-screen').hidden = true
  $$('#application').hidden = false
  await refreshStatus()
  await refreshUpdateStatus()
  connectStudioSocket()
}).catch(() => {
  remoteSession = false
  void openAuthScreen()
})

async function appSourceGet(path){const db=await openStudioDatabase();return new Promise((ok,no)=>{const r=db.transaction('appOverrides','readonly').objectStore('appOverrides').get(path);r.onsuccess=()=>ok(r.result||null);r.onerror=()=>no(r.error)})}
async function appSourceGetAll(){const db=await openStudioDatabase();return new Promise((ok,no)=>{const r=db.transaction('appOverrides','readonly').objectStore('appOverrides').getAll();r.onsuccess=()=>ok(r.result||[]);r.onerror=()=>no(r.error)})}
async function appSourcePut(path,content){if(!APP_SOURCE_FILES.includes(path))throw Error('Unsupported app source file.');if(typeof content!=='string'||content.length>1024*1024)throw Error('App source must be text and no larger than 1 MB.');const db=await openStudioDatabase();return new Promise((ok,no)=>{const tx=db.transaction('appOverrides','readwrite');tx.objectStore('appOverrides').put({path,content,updatedAt:Date.now()});tx.oncomplete=ok;tx.onerror=()=>no(tx.error)})}
async function loadAppSourceFile(path){if(!APP_SOURCE_FILES.includes(path))throw Error('Unsupported app source file.');const saved=await appSourceGet(path);let content=saved?.content;if(typeof content!=='string'){const r=await fetch('/aharane/studio/'+path,{cache:'no-store'});if(!r.ok)throw Error('Could not load '+path+'.');content=await r.text()}studioAppSourcePath=path;studioAppSourceOriginal=content;$$('#studio-app-source-file').value=path;$$('#studio-app-source-editor').value=content;$$('#studio-app-source-save').disabled=true;$$('#studio-app-source-apply').disabled=(await appSourceGetAll()).length===0;$$('#studio-app-source-status').textContent=saved?'Saved local override.':'Editing original '+path+'.'}
async function openAppSourceEditor(){$$('#studio-app-source-panel').hidden=false;try{await loadAppSourceFile($$('#studio-app-source-file').value||'index.html')}catch(e){$$('#studio-app-source-status').textContent=e.message}}
async function saveAppSourceDraft(){const content=$$('#studio-app-source-editor').value;await appSourcePut(studioAppSourcePath,content);studioAppSourceOriginal=content;$$('#studio-app-source-save').disabled=true;$$('#studio-app-source-apply').disabled=false;$$('#studio-app-source-status').textContent=studioAppSourcePath+' saved on this phone.'}
async function applyAppSourceChanges(){if($$('#studio-app-source-editor').value!==studioAppSourceOriginal)await saveAppSourceDraft();if(!(await appSourceGetAll()).length)return;if(!confirm('Apply saved source changes to this phone and reload Aharane Local Studio?'))return;location.reload()}
async function exportAppSourceBackup(){const files=[];for(const path of APP_SOURCE_FILES){const saved=await appSourceGet(path);let content=typeof saved?.content==='string'?saved.content:null;if(content===null){const r=await fetch('/aharane/studio/'+path,{cache:'no-store'});if(!r.ok)throw Error('Could not export '+path+'.');content=await r.text()}files.push({path,content})}const data={format:'aharane-local-studio-source-backup',version:1,createdAt:new Date().toISOString(),files};downloadStudioBlob(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),'aharane-local-studio-source-backup.json')}
async function restoreAppSource(){if(!confirm('Restore the original app source on this phone? Project files will remain untouched.'))return;const db=await openStudioDatabase();await new Promise((ok,no)=>{const tx=db.transaction('appOverrides','readwrite');tx.objectStore('appOverrides').clear();tx.oncomplete=ok;tx.onerror=()=>no(tx.error)});location.reload()}
$$('#studio-edit-app-source').addEventListener('click',()=>{void openAppSourceEditor()})
$$('#studio-app-source-file').addEventListener('change',e=>{void loadAppSourceFile(e.target.value).catch(err=>$$('#studio-app-source-status').textContent=err.message)})
$$('#studio-app-source-reload').addEventListener('click',()=>{void loadAppSourceFile(studioAppSourcePath).catch(err=>$$('#studio-app-source-status').textContent=err.message)})
$$('#studio-app-source-editor').addEventListener('input',()=>{const dirty=$$('#studio-app-source-editor').value!==studioAppSourceOriginal;$$('#studio-app-source-save').disabled=!dirty;$$('#studio-app-source-status').textContent=dirty?'Unsaved source changes.':'No unsaved changes.'})
$$('#studio-app-source-save').addEventListener('click',()=>{void saveAppSourceDraft().catch(err=>$$('#studio-app-source-status').textContent=err.message)})
$$('#studio-app-source-apply').addEventListener('click',()=>{void applyAppSourceChanges().catch(err=>$$('#studio-app-source-status').textContent=err.message)})
$$('#studio-app-source-restore').addEventListener('click',()=>{void restoreAppSource().catch(err=>$$('#studio-app-source-status').textContent=err.message)})
$$('#studio-app-source-export').addEventListener('click',()=>{void exportAppSourceBackup().catch(err=>$$('#studio-app-source-status').textContent=err.message)})
$$('#studio-app-source-close').addEventListener('click',()=>{if($$('#studio-app-source-editor').value!==studioAppSourceOriginal&&!confirm('Close and discard unsaved typing?'))return;$$('#studio-app-source-panel').hidden=true})


const THEME_KEY = 'aharane-studio-theme'
const ACCENT_KEY = 'aharane-studio-accent'
const PREFS_KEY = 'aharane-studio-preferences'
function applyThemePreference() {
  const saved = localStorage.getItem(THEME_KEY) || 'light'
  const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
  const theme = saved === 'system' ? (systemDark ? 'dark' : 'light') : saved
  document.body.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  $$('[data-theme-choice]').forEach(button => button.classList.toggle('active', button.dataset.themeChoice === saved))
}
function applyAccentColour(value) {
  const safe = /^#[0-9a-f]{6}$/i.test(value) ? value : '#526c91'
  document.documentElement.style.setProperty('--accent', safe)
  $$('#accent-picker').value = safe
  $$('#accent-current-value').textContent = safe.toUpperCase()
  $$('#accent-current-swatch').style.background = safe
  const names = {'#526c91':'Slate blue','#3f7e79':'Teal','#76619a':'Violet','#b36b50':'Terracotta','#6b7484':'Graphite','#3f7394':'Ocean blue'}
  $$('#accent-current-name').textContent = names[safe.toLowerCase()] || 'Custom colour'
  $$('[data-accent]').forEach(button => button.classList.toggle('active', button.dataset.accent.toLowerCase() === safe.toLowerCase()))
  localStorage.setItem(ACCENT_KEY, safe)
}
function renderActivityLog() {
  const source = $$('#live-activity-list')
  const target = $$('#activity-log-list')
  if (!source || !target) return
  target.replaceChildren(...[...source.children].map(node => node.cloneNode(true)))
  if (!target.children.length) target.textContent = 'Activity will appear here when the Studio is connected to the live event stream.'
}
async function refreshStorageUsage() {
  const used = $$('#storage-used'), quota = $$('#storage-quota')
  if (!used || !quota) return
  try {
    const estimate = await navigator.storage?.estimate?.()
    if (!estimate) { used.textContent = 'Unavailable'; quota.textContent = 'Unavailable'; return }
    used.textContent = formatBytes(estimate.usage || 0)
    quota.textContent = formatBytes(estimate.quota || 0)
  } catch { used.textContent = 'Unavailable'; quota.textContent = 'Unavailable' }
}
function applyLocalPreferences() {
  let prefs = {}
  try { prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') } catch {}
  const compact = prefs.compactFiles !== false
  const reduceMotion = prefs.reduceMotion === true
  document.body.classList.toggle('compact-files', compact)
  document.body.classList.toggle('reduce-motion', reduceMotion)
  if ($$('#compact-files-toggle')) $$('#compact-files-toggle').checked = compact
  if ($$('#reduce-motion-toggle')) $$('#reduce-motion-toggle').checked = reduceMotion
}
function saveLocalPreferences() {
  localStorage.setItem(PREFS_KEY, JSON.stringify({
    compactFiles: $$('#compact-files-toggle')?.checked !== false,
    reduceMotion: $$('#reduce-motion-toggle')?.checked === true
  }))
  applyLocalPreferences()
}
$$('[data-theme-choice]').forEach(button => button.addEventListener('click', () => {
  localStorage.setItem(THEME_KEY, button.dataset.themeChoice)
  applyThemePreference()
}))
$$('[data-accent]').forEach(button => button.addEventListener('click', () => applyAccentColour(button.dataset.accent)))
$$('#accent-picker')?.addEventListener('input', event => applyAccentColour(event.target.value))
$$('#compact-files-toggle')?.addEventListener('change', saveLocalPreferences)
$$('#reduce-motion-toggle')?.addEventListener('change', saveLocalPreferences)
$$('#refresh-storage')?.addEventListener('click', () => { void refreshStorageUsage() })
applyThemePreference()
applyAccentColour(localStorage.getItem(ACCENT_KEY) || '#526c91')
applyLocalPreferences()

document.addEventListener('click', event => {
  if (event.target instanceof Element && event.target.closest('.source-item-actions, .package-actions')) return
  $$('.source-item-menu, .package-menu').forEach(menu => { menu.hidden = true })
  $$('.source-menu-button').forEach(button => button.setAttribute('aria-expanded', 'false'))
  $$('.source-file-row.menu-open').forEach(row => row.classList.remove('menu-open'))
})
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
  if (localStorage.getItem(THEME_KEY) === 'system') applyThemePreference()
})
