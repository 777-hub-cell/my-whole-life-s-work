import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { envView, isChatVisible, loadStudioSettings, normalizeChatVisibility, saveStudioSettings } from '../src/studio-settings.js'

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
