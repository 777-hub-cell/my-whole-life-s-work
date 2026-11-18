export default {
  name: 'ping',
  description: 'Check whether Aharane is online.',
  async run({ reply }) {
    await reply('Aharane is online.')
  },
}
