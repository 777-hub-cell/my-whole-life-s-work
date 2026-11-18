# Private commands

Place private-owner commands in this directory. This registry is loaded separately
from `commands/` and is only dispatched from the private WhatsApp session's
verified self-chat (`fromMe`, exact phone-number self-chat, and configured
Private Owner identity).

Private commands never fall through to the public registry. Public `ownerOnly`
commands belong in `commands/` and check only the Public Owner identity.

The initial foundation intentionally contains no private commands. They will be
added after account/session management and authorization tests are complete.
