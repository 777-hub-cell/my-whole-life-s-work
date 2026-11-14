# NIGHT owner authority and command boundaries (MDD 02)

## Production design

NIGHT has independent **private** and **public** command registries. The fixed-`.` private namespace runs only from the permanent **Account A verified self-chat** (the WhatsApp “message yourself” conversation); an ordinary owner-to-Account-A DM is **not** a supported private entry point. Account A does not respond to public commands or ordinary inbound chats. An enabled linked specialist account handles public functionality for all eligible users, **including the owner**.

Only Account A, with owner role and selected as the main control account, can admit a registered private command or registered private alias in its exact PN self-chat or a verified, nonconflicting LID self-chat. A normal `fromMe` message is ignored. Bot replies, unknown/private-looking text, group messages, public commands in the self-chat, replayed messages and other accounts' self-chats do not enter private dispatch. Inbound private receipts normalize verified PN and LID self-chat addresses to Account A's own PN JID to prevent duplicate execution under alternative chat identifiers.

## Owner identity

- `OWNER_NUMBER` (including the persisted owner contact override) identifies the **primary supreme owner** for public owner-only checks such as `.sudo`. A verified sender PN is required. A display name is not a credential.
- `CONTROL_NUMBERS` is legacy public-owner compatibility. Entries can receive public owner-command permissions, but are **not** primary supreme owners and cannot manage public sudo. Do not use this setting to create a second private administrator.
- Public `.sudo` users can use only authorized public owner-only commands; they cannot manage sudo or execute private commands. Revocation reads the current persisted list on the next command.
- A linked-session owner remains a public-namespace role, **not** a private administrator. Public owner-only dispatch continues to honor its pre-existing session-owner semantics and any command-specific safeguards.
- The Account A self-chat is the canonical private-control proof. Operator access to Account A's authenticated WhatsApp device/session must be protected; private control is not conferred by `CONTROL_NUMBERS`, sudo or an arbitrary sender number.

An opaque WhatsApp LID is never converted to a phone number by treating its digits as a PN. Conflicting/unverified LID mappings fail closed for private self-chat.

## Public execution and lockdown

Public commands remain subject to configured public prefix, `publicCommandsEnabled`, bot profile/capability, routing, group and per-command checks. The owner has **no generic capability bypass**. An owner can run `.movie`, `.anime` or `.sticker` only through an enabled eligible specialist. A public lockdown disables these public commands for everyone, including the owner; Account A `.lockdown off` remains available during lockdown.

Private administrative commands, including `.accounts`, `.restart` and `.repair`, are not executable through public accounts, even by their owner or a public sudo user. The dispatcher checks the resolved registered private alias rather than trusting a typed name. Custom commands are merged **only into public commands** and may not shadow a built-in public command or any private command/alias, including hidden names. Built-in public/private overlaps retain their existing separate-context routing (for example the historical `.pslimit` behavior); custom overlaps are rejected. Private help and hidden commands never become public help.

## Dangerous operations and recovery

Private commands are authorized before handler confirmations, including `.restart confirm` and `.removeaccount <id> confirm`. A confirmation is not authentication. The account registry reserves Account A and enforces its owner role; an incorrectly linked-role Account A is silenced, not exposed as a public responder. A disconnected Account A does not transfer private permissions to another linked account. Recovery requires the established trusted account/session recovery process, not granting another public account private control.

Owner-contact edits through the existing authenticated administrative configuration surface remain sensitive and should be audited separately from WhatsApp command grants. No phone numbers, QR codes, credentials or auth material should appear in public documentation or logs.

## Regression coverage

`node owner-private-security-selftest.js` verifies primary owner versus legacy controls/public sudo/session ownership, public capability and lockdown restrictions, private aliases and hidden-command isolation, custom collision rejection, canonical private receipt identity and Account A role fail-closed behavior. `node inbound-message-guard-selftest.js` covers narrow self-chat admission, verified/unverified LIDs, regular `fromMe` traffic and durable receipt replay. Full CI runs both tests through `npm run check`.

These are unit/source-level controls. Real WhatsApp sessions, production deployment and live behavior must be verified separately after approved release-batch deployment.
