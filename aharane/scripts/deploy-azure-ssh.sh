#!/usr/bin/env bash
set -euo pipefail

SHA="${GITHUB_SHA:-}"
SOURCE_REPOSITORY="${GITHUB_REPOSITORY:-777-hub-cell/my-whole-life-s-work}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "A full lowercase GitHub commit SHA is required." >&2; exit 2; }
[[ "$SOURCE_REPOSITORY" == "777-hub-cell/my-whole-life-s-work" ]] || {
  echo "Unexpected source repository; refusing deployment." >&2
  exit 2
}

for key in MSCC_SSH_HOST MSCC_SSH_USER MSCC_SSH_KEY MSCC_SSH_KNOWN_HOSTS; do
  [[ -n "${!key:-}" ]] || { echo "Missing protected Azure SSH setting: $key" >&2; exit 2; }
done
HOST="$MSCC_SSH_HOST"
USER_NAME="$MSCC_SSH_USER"
PORT="${MSCC_SSH_PORT:-22}"
[[ "$HOST" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ ]] || { echo "Invalid Azure host." >&2; exit 2; }
[[ "$USER_NAME" =~ ^[a-z_][a-z0-9_-]*$ ]] || { echo "Invalid SSH username." >&2; exit 2; }
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
ssh-keygen -lf "$tmp/known_hosts" >/dev/null 2>&1 || {
  echo "Pinned Azure host key is invalid." >&2
  exit 2
}

archive="$tmp/aharane-$SHA.tar.gz"
tar -czf "$archive" --exclude='aharane/node_modules' -C "$GITHUB_WORKSPACE" aharane
remote_archive="/tmp/aharane-$SHA.tar.gz"

ssh_opts=(
  -F /dev/null
  -o BatchMode=yes
  -o StrictHostKeyChecking=yes
  -o "UserKnownHostsFile=$tmp/known_hosts"
  -o IdentitiesOnly=yes
  -o IdentityAgent=none
  -o ConnectTimeout=20
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=3
  -i "$tmp/deploy_key"
  -p "$PORT"
)
scp -F /dev/null -o BatchMode=yes -o StrictHostKeyChecking=yes \
  -o "UserKnownHostsFile=$tmp/known_hosts" -o IdentitiesOnly=yes -o IdentityAgent=none \
  -i "$tmp/deploy_key" -P "$PORT" "$archive" "$USER_NAME@$HOST:$remote_archive"

echo "Installing Aharane commit $SHA as its own systemd service..."
ssh "${ssh_opts[@]}" "$USER_NAME@$HOST" \
  "sudo -n bash -s -- '$SHA' '$remote_archive' && rm -f '$remote_archive'" \
  < "$GITHUB_WORKSPACE/aharane/install-azure.sh"

echo "Aharane deployment completed and passed its local health check."
