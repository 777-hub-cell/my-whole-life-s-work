import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { envView, loadStudioSettings, saveStudioSettings } from '../src/studio-settings.js'

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
