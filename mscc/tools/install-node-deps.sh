#!/usr/bin/env bash
set -euo pipefail

# Install production dependencies into a candidate release BEFORE activation.
# A previous healthy release on this same VM is the safest source of identical
# installed native dependencies. Avoid re-fetching ~300 packages on every deploy.
RELEASE="${1:?candidate release directory required}"
PREVIOUS="${2:-}"
[[ -f "$RELEASE/package.json" ]] || { echo "Candidate MSCC package.json missing" >&2; exit 2; }

same_manifest=false
if [[ -n "$PREVIOUS" && -f "$PREVIOUS/package.json" && -d "$PREVIOUS/node_modules" ]]; then
  if node - "$PREVIOUS/package.json" "$RELEASE/package.json" <<'JS'
const fs = require('node:fs')
const [previousPath, candidatePath] = process.argv.slice(2)
const a = JSON.parse(fs.readFileSync(previousPath, 'utf8'))
const b = JSON.parse(fs.readFileSync(candidatePath, 'utf8'))
const fields = [
  'dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies',
  'overrides', 'engines', 'os', 'cpu', 'libc', 'packageManager',
]
const stable = value => {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
  return value
}
const lifecycle = ['preinstall', 'install', 'postinstall', 'prepare']
if (!fields.every(key => JSON.stringify(stable(a[key] ?? null)) === JSON.stringify(stable(b[key] ?? null))) ||
    !lifecycle.every(key => (a.scripts?.[key] || '') === (b.scripts?.[key] || '')))
  process.exit(1)
JS
  then
    same_manifest=true
  fi
fi

if [[ "$same_manifest" == true ]]; then
  echo ">>> Dependency manifests match: reusing installed packages from the previous healthy MSCC release."
  # Independent copy: never point a new live release at an old directory which
  # might be pruned later. Fail safely without switching the current release.
  timeout --signal=TERM --kill-after=10s 300s \
    cp -a "$PREVIOUS/node_modules" "$RELEASE/node_modules"
  echo ">>> Existing MSCC dependencies copied; no registry access required."
  node "$RELEASE/tools/patch-sticker-pack-probe-limit.mjs"
  exit 0
fi

echo ">>> Dependencies changed or previous install missing; using bounded npm installation."
echo ">>> npm network attempts limited; candidate remains inactive on failure."
# A cold npm install may require native modules. Let it run, but NEVER hang the
# GitHub Actions SSH deployment for 55 minutes without a useful error.
timeout --signal=TERM --kill-after=15s 600s \
  npm install --prefix "$RELEASE" --omit=dev --no-audit --no-fund \
    --progress=false --fetch-retries=1 --fetch-timeout=30000 \
    --loglevel=verbose
echo ">>> MSCC npm installation completed."
node "$RELEASE/tools/patch-sticker-pack-probe-limit.mjs"
