# NIGHT custom commands

NIGHT loads administrator-owned public command modules from a persistent directory outside the versioned release:

`/var/lib/mscc/custom-commands/<capability>/<command>.js`

The default category is `general`. Create another capability folder when you want a command to belong to a specialist profile, such as `music` or `anime`. Enable that capability on the relevant bot profile in Control Centre's Profiles page.

## Example command

Create `/var/lib/mscc/custom-commands/general/hello.js`:

```js
export default {
  name: 'hello',
  aliases: ['hi'],
  description: 'A simple custom greeting.',
  async run(ctx) {
    const who = ctx.args.join(' ').trim() || 'there'
    await ctx.reply('Hello, ' + who + '!')
  },
}
```

The module must export a default object with a `name` and a `run(ctx)` function. It may also include `aliases`, `description`, `usage`, and `help`. The normal command context is supplied, including `ctx.args`, `ctx.rawArgs`, `ctx.message`, `ctx.account`, and `ctx.reply()`.

## Creating and activating commands

1. Sign in to NIGHT Control Centre and open File Explorer.
2. Open `custom-commands/general` (created on first startup).
3. Create a `.js` file, edit it in the existing code editor, and save. JavaScript syntax is checked before the save is accepted.
4. Tap **Reload commands** while inside the custom-commands folder. You can also run `.reloadcommands` from Account A's verified WhatsApp message-yourself chat.
5. Assign the command's capability to the relevant public bot profile in Profiles. The `general` category is the usual starting point.

Built-in commands cannot be replaced by custom commands or aliases. A failed reload leaves the previously active registry intact. Custom files remain under `/var/lib/mscc/custom-commands` during normal release deployments; back them up separately with server backups.

## Security and scope

Custom modules execute as JavaScript inside the NIGHT process, with the same operating-system permissions and runtime access as the bot. Treat them as trusted code: only the administrator should edit them, review code before saving, and never put API keys, passwords, session files, or other secrets in command source.

The custom-command editor does not unlock the rest of the production File Explorer. Built-in commands, private Account A control commands, WhatsApp sessions, environment secrets, and application source files remain protected. Account A continues to accept only its verified private self-chat control commands; custom commands are public commands handled by linked specialist accounts under normal profile/capability routing.
