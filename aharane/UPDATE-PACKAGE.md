# Aharane ZIP update package

The Files Manager includes a private ZIP package library. Uploading a ZIP there validates and stores it without changing the running bot. Choosing **Update Aharane** from that ZIP's three-dot menu, or dropping the ZIP directly into Deploy update, starts the same dedicated validation and deployment flow.

## Required marker file

Every deployable ZIP must contain this file at the archive root:

`aharane-update.json`

Its contents must identify the package as an Aharane update:

```json
{
  "package_type": "aharane-bot-update",
  "target": "aharane",
  "format_version": 1,
  "bot_version": "1.2.3"
}
```

The `bot_version` must match the version in the root `package.json`.

## Required ZIP layout

The files must be at the ZIP root. Do not put the entire project inside an extra enclosing folder.

```text
aharane-update.zip
├── aharane-update.json
├── package.json
├── package-lock.json       # recommended
├── src/
│   ├── index.js
│   └── ...
├── public/
├── scripts/
└── test/
```

The root `package.json` must:
- have `name: "aharane-whatsapp-bot"` and `private: true`;
- use `version` matching `bot_version`;
- require Node.js 24 or newer;
- include the official `@whiskeysockets/baileys` package in runtime dependencies;
- not depend on the unverified `@itsliaaa/baileys` fork.

## Protected content

Do not include `.env` files (except the example `.env.example`), API keys, certificates, SSH keys, auth sessions, user data, backups, logs, `node_modules`, `.git`, `whatsapp-auth`, or other persistent-data directories. Symlinks and special filesystem entries are rejected. Absolute paths, path traversal, duplicate entries, encrypted files and unsupported compression methods are rejected.

The current limits are 50 MB compressed, 160 MB expanded, 1,500 archive entries and 32 MB per file.

## What deployment does

1. The server verifies the SHA-256 checksum and inspects the archive.
2. The Control Centre shows the manifest and a file-change preview.
3. After explicit approval, the ZIP is extracted into a new release under `/opt/aharane/releases`.
4. Dependencies are installed and the entry point is syntax-checked.
5. The `/opt/aharane/current` symlink is switched atomically and Aharane restarts.
6. A local health check runs during systemd startup. If it fails, the previous release is restored.

The update only replaces application code. It does not write to `/etc/aharane.env`, `/var/lib/aharane/whatsapp-auth`, `/var/lib/aharane/data`, or other persistent data. It does not change NIGHT/MSCC.

**Important:** dependency installation uses npm's `--ignore-scripts` option, so package lifecycle scripts are disabled. Only deploy code and dependencies you trust. Any new environment variables required by the new code must be configured separately before the update.

A valid ZIP can be created by an AI coding assistant, a local build process or another development environment. The marker file and layout are the contract; the ZIP does not need to come from GitHub.


## Manual Files Manager editing

The source-file editor is a separate workflow from ZIP deployment. It can browse approved source folders and text files. Saving individual files creates a clean backup of the active release and marks a pending manual draft; it does not restart the running bot.

Choose **Apply changes & restart** to run source syntax and project checks before restarting Aharane. The systemd startup check confirms that the service becomes healthy and restores the clean backup release if the restart fails. **Discard edits** switches back to the clean backup. ZIP deployment is blocked while a manual draft is pending, so the two update methods cannot overwrite one another.
