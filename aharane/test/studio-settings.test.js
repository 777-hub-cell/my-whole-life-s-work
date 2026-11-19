import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { envView, isChatVisible, loadStudioSettings, normalizeChatAppearance, normalizeChatVisibility, normalizeStudioSettings, saveStudioSettings } from '../src/studio-settings.js'

test('studio settings persist isolated fixed command prefixes and redact no server credentials', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aharane-settings-'))
  const file = join(dir, 'settings.json')
  try {
    const defaults = await loadStudioSettings(file)
    assert.equal(defaults.private.prefix, '.')
    assert.equal(defaults.public.prefix, '!')
    const next = await saveStudioSettings(file, {
      private: { ...defaults.private, botName: 'Private Aharane', autoRead: true },
      public: { ...defaults.public, botName: 'Public Aharane', commandCooldown: 4 },
    })
    assert.equal(next.private.autoRead, true)
    assert.equal(next.private.showTyping, false)
    assert.equal(next.public.commandCooldown, 4)
    const direct = '2348012345678@s.whatsapp.net'
    const group = '120363000000000000-1234567890@g.us'
    next.private.chatVisibility = normalizeChatVisibility({
      individuals: { mode: 'selected', overrides: [{ jid: direct, visible: true }] },
      groups: { mode: 'all', overrides: [{ jid: group, visible: false }] },
    })
    const withVisibility = await saveStudioSettings(file, next)
    assert.equal(isChatVisible(withVisibility.private, direct), true)
    assert.equal(isChatVisible(withVisibility.private, '2348099999999@s.whatsapp.net'), false)
    assert.equal(isChatVisible(withVisibility.private, group), false)
    const persisted = await loadStudioSettings(file)
    assert.equal(isChatVisible(persisted.private, direct), true)
    assert.equal(isChatVisible(persisted.private, '2348099999999@s.whatsapp.net'), false)
    assert.equal(isChatVisible(persisted.private, group), false)

    assert.equal((await loadStudioSettings(file)).private.botName, 'Private Aharane')
    const rows = envView(next)
    assert.ok(rows.some(row => row.key === 'PRIVATE_COMMAND_PREFIX' && row.value === '.'))
    assert.ok(rows.some(row => row.key === 'PUBLIC_COMMAND_PREFIX' && row.value === '!'))
    assert.ok(!rows.some(row => /PASSWORD|TOKEN|SECRET|KEY/.test(row.key)))
    await assert.rejects(saveStudioSettings(file, { public: { commandCooldown: 100 } }), /between 0 and 60/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('chat visibility settings persist separate individual and group allow/block rules', async () => {
  const direct = '2348012345678@s.whatsapp.net'
  const group = '120363000000000000-1234567890@g.us'
  const lid = '123456789012345@lid'
  const normalized = normalizeChatVisibility({
    individuals: { mode: 'selected', overrides: [{ jid: direct, visible: true }, { jid: lid, visible: true }] },
    groups: { mode: 'all', overrides: [{ jid: group, visible: false }] },
  })
  const profile = { chatVisibility: normalized }
  assert.equal(isChatVisible(profile, direct), true)
  assert.equal(isChatVisible(profile, lid), true)
  assert.equal(isChatVisible(profile, '2348099999999@s.whatsapp.net'), false)
  assert.equal(isChatVisible(profile, group), false)
  const defaults = normalizeChatVisibility({})
  assert.equal(isChatVisible({ chatVisibility: defaults }, direct), true)
  assert.equal(isChatVisible({ chatVisibility: defaults }, group), true)
  assert.throws(() => normalizeChatVisibility({ groups: { overrides: [{ jid: direct, visible: false }] } }), /invalid chat identifier/)
  assert.throws(() => normalizeChatVisibility({ individuals: { overrides: [{ jid: 'opaque@lid', visible: true }] } }), /invalid chat identifier/)
})

test('pinned and muted chat preferences are validated and persist independently per account', async () => {
  const direct = '2348012345678@s.whatsapp.net'
  const group = '120363000000000000-1234567890@g.us'
  const settings = normalizeStudioSettings({
    private: { chatPreferences: { pinned: [direct, direct], muted: [group] } },
    public: { chatPreferences: { pinned: [group] } },
  })
  assert.deepEqual(settings.private.chatPreferences, { pinned: [direct], muted: [group], archived: [] })
  assert.deepEqual(settings.public.chatPreferences, { pinned: [group], muted: [], archived: [] })
  assert.throws(() => normalizeStudioSettings({ private: { chatPreferences: { pinned: ['not-a-jid'] } } }), /invalid chat identifier/)
})


test('shared chat appearance is validated, normalized and persisted independently of WhatsApp accounts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aharane-appearance-'))
  const file = join(dir, 'settings.json')
  try {
    const defaults = normalizeStudioSettings({})
    assert.equal(defaults.chatAppearance.theme, 'system')
    assert.equal(defaults.chatAppearance.wallpaper, 'default')
    const appearance = normalizeChatAppearance({
      theme: 'dark', wallpaper: 'grid', incomingBubble: '#fefefe',
      outgoingBubble: '#aabbcc', textScale: 145, bubbleRadius: 3,
      messageSpacing: 'compact', chatDensity: 'compact',
      showTimestamps: false, showAvatars: false, reduceMotion: true,
    })
    assert.equal(appearance.theme, 'dark')
    assert.equal(appearance.wallpaper, 'grid')
    assert.equal(appearance.textScale, 130)
    assert.equal(appearance.bubbleRadius, 8)
    assert.equal(appearance.showTimestamps, false)
    assert.equal(appearance.showAvatars, false)
    assert.equal(appearance.reduceMotion, true)
    assert.equal(normalizeChatAppearance({ theme: 'neon', incomingBubble: 'not-a-colour' }).theme, 'system')
    assert.equal(normalizeChatAppearance({ theme: 'neon', incomingBubble: 'not-a-colour' }).incomingBubble, '#ffffff')

    const saved = await saveStudioSettings(file, { ...defaults, chatAppearance: appearance })
    assert.equal(saved.chatAppearance.theme, 'dark')
    assert.equal(saved.private.prefix, '.')
    assert.equal(saved.public.prefix, '!')
    const loaded = await loadStudioSettings(file)
    assert.deepEqual(loaded.chatAppearance, appearance)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
