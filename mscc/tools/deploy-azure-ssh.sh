#!/usr/bin/env bash
set -euo pipefail

# Deploy only the commit GitHub Actions checked, never a moving branch head.
# Credentials are supplied by the protected mscc-production environment.
SHA="${GITHUB_SHA:-}"
SOURCE_REPOSITORY="${GITHUB_REPOSITORY:-777-hub-cell/my-whole-life-s-work}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "A full, lowercase GitHub commit SHA is required." >&2; exit 2; }
[[ "$SOURCE_REPOSITORY" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || { echo "Invalid MSCC source repository." >&2; exit 2; }

for key in MSCC_SSH_HOST MSCC_SSH_USER MSCC_SSH_KEY MSCC_SSH_KNOWN_HOSTS; do
  if [[ -z "${!key:-}" ]]; then
    echo "Missing required mscc-production secret: $key" >&2
    exit 2
  fi
done

HOST="$MSCC_SSH_HOST"
USER_NAME="$MSCC_SSH_USER"
PORT="${MSCC_SSH_PORT:-22}"
[[ "$HOST" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ ]] || { echo "Invalid deployment hostname (use DNS or IPv4)." >&2; exit 2; }
[[ "$USER_NAME" =~ ^[a-z_][a-z0-9_-]*$ ]] || { echo "Invalid deployment username." >&2; exit 2; }
[[ "$PORT" =~ ^[0-9]{1,5}$ ]] && ((10#$PORT >= 1 && 10#$PORT <= 65535)) || {
  echo "Invalid SSH port." >&2
  exit 2
}

umask 077
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
printf '%s\n' "$MSCC_SSH_KEY" > "$tmp/deploy_key"
printf '%s\n' "$MSCC_SSH_KNOWN_HOSTS" > "$tmp/known_hosts"
chmod 600 "$tmp/deploy_key" "$tmp/known_hosts"
# Host fingerprints are pinned by the operator. Never populate known_hosts
# with an unverified ssh-keyscan from the deployment runner.
ssh-keygen -lf "$tmp/known_hosts" >/dev/null 2>&1 || {
  echo "MSCC_SSH_KNOWN_HOSTS does not contain a valid SSH public host key." >&2
  exit 2
}

echo "Deploying tested MSCC commit $SHA to the pinned Azure host..."
ssh -T -F /dev/null \
  -o BatchMode=yes -o StrictHostKeyChecking=yes \
  -o "UserKnownHostsFile=$tmp/known_hosts" \
  -o IdentitiesOnly=yes -o IdentityAgent=none \
  -o ConnectTimeout=20 -o ServerAliveInterval=15 -o ServerAliveCountMax=3 \
  -i "$tmp/deploy_key" -p "$PORT" \
  "$USER_NAME@$HOST" "MSCC_SOURCE_REF=$SHA MSCC_SOURCE_REPOSITORY=$SOURCE_REPOSITORY MSCC_REUSE_EXISTING_SOURCE_STACK=1 bash -se" <<'REMOTE'
set -euo pipefail
umask 077

[[ "${MSCC_SOURCE_REF:-}" =~ ^[0-9a-f]{40}$ ]] || exit 2
[[ "${MSCC_SOURCE_REPOSITORY:-}" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || exit 2
[[ "$(id -u)" -ne 0 ]] || { echo "Use the existing non-root MSCC service account." >&2; exit 2; }
command -v curl >/dev/null
command -v sudo >/dev/null
sudo -n true || { echo "Deploy account needs noninteractive sudo on Azure." >&2; exit 2; }

# The installer sets User=$USER on the systemd service and chowns shared state.
# Never silently transfer an existing installation to a different SSH user.
if systemctl cat mscc.service >/dev/null 2>&1; then
  current_user="$(systemctl show mscc.service --property User --value)"
  if [[ -n "$current_user" && "$current_user" != "$USER" ]]; then
    echo "Deployment user differs from running mscc.service user; aborting." >&2
    exit 2
  fi
fi

installer="$(mktemp /tmp/mscc-pinned-installer.XXXXXXXX.sh)"
trap 'rm -f "$installer"' EXIT
curl --fail --silent --show-error --location --retry 3 \
  "https://raw.githubusercontent.com/$MSCC_SOURCE_REPOSITORY/$MSCC_SOURCE_REF/mscc/install-azure.sh" \
  -o "$installer"
bash -n "$installer"
MSCC_SOURCE_REF="$MSCC_SOURCE_REF" MSCC_SOURCE_REPOSITORY="$MSCC_SOURCE_REPOSITORY" bash "$installer"

# The installer verifies real health and Cortex account-contract smoke tests
# before disarming its rollback handler. Also verify the exact Git ref.
deployed_ref="$(cat /opt/mscc/current/.deployed-source-ref 2>/dev/null || true)"
[[ "$deployed_ref" = "$MSCC_SOURCE_REF" ]] || {
  echo "Active release is not the requested commit!" >&2
  exit 1
}
sudo systemctl is-active --quiet mscc.service
curl --fail --silent --show-error --max-time 10 \
  http://127.0.0.1:8787/health >/dev/null
echo "MSCC Azure deployment verified at $MSCC_SOURCE_REF"

# Run a single bounded read-only YouTube metadata probe *on Azure*, not the
# GitHub runner. Print only structured, redacted health evidence; a YouTube
# access challenge must not roll back an otherwise healthy WhatsApp service.
if [[ -f /opt/mscc/current/tools/azure-youtube-diagnostics.mjs ]]; then
  echo "Azure YouTube diagnostics (no accounts, credentials or media downloads):"
  /usr/bin/node /opt/mscc/current/tools/azure-youtube-diagnostics.mjs || \
    echo '{"component":"mscc-youtube-azure","result":"probe_failed"}'
fi
# Check external public-media API health without downloading any content.
# Never print actual signed media URLs or any WhatsApp credentials.
if [[ -f /opt/mscc/current/tools/azure-knight-diagnostics.mjs ]]; then
  echo "Azure KnightBot-style source health (metadata only):"
  /usr/bin/node /opt/mscc/current/tools/azure-knight-diagnostics.mjs || \
    echo '{"component":"mscc-knight-sources","status":"probe_failed"}'
fi
REMOTE
