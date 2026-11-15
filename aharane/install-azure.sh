#!/usr/bin/env bash
set -euo pipefail

# Invoked as root by the separately gated Aharane deployment workflow.
SOURCE_SHA="${1:-}"
ARCHIVE="${2:-}"
[[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "A full lowercase source SHA is required." >&2; exit 2; }
[[ -f "$ARCHIVE" ]] || { echo "Aharane source archive is missing." >&2; exit 2; }
[[ "$(id -u)" -eq 0 ]] || { echo "Run this installer as root." >&2; exit 2; }
command -v systemctl >/dev/null
command -v node >/dev/null
command -v npm >/dev/null
command -v curl >/dev/null
command -v openssl >/dev/null
node -e 'if (Number(process.versions.node.split(".")[0]) < 24) process.exit(1)' || {
  echo "Aharane requires Node.js 24 or newer." >&2
  exit 2
}

SERVICE_USER="aharane"
BASE="/opt/aharane"
STATE="/var/lib/aharane"
ENV_FILE="/etc/aharane.env"
SERVICE_FILE="/etc/systemd/system/aharane.service"
RELEASE="$BASE/releases/$SOURCE_SHA-$(date -u +%Y%m%dT%H%M%SZ)-$$"
STAGING="$(mktemp -d /tmp/aharane-install.XXXXXXXX)"
PREVIOUS_RELEASE="$(readlink -f "$BASE/current" 2>/dev/null || true)"
SERVICE_BACKUP="$(mktemp /tmp/aharane-service-backup.XXXXXXXX)"
SERVICE_EXISTED=0
SWITCHED=0
SUCCESS=0
ROLLBACK_OK=0

rollback() {
  local failed=0
  set +e
  if [[ -n "$PREVIOUS_RELEASE" && -d "$PREVIOUS_RELEASE" ]]; then
    local rollback_link="$BASE/.current-rollback-$$"
    ln -s "$PREVIOUS_RELEASE" "$rollback_link" && mv -Tf "$rollback_link" "$BASE/current" || failed=1
  else
    rm -f "$BASE/current" || failed=1
  fi
  if [[ "$SERVICE_EXISTED" -eq 1 ]]; then
    cp -p "$SERVICE_BACKUP" "$SERVICE_FILE" || failed=1
  else
    rm -f "$SERVICE_FILE" || failed=1
  fi
  systemctl daemon-reload || failed=1
  if [[ -n "$PREVIOUS_RELEASE" && -d "$PREVIOUS_RELEASE" ]]; then
    systemctl restart aharane.service || failed=1
  else
    systemctl disable --now aharane.service >/dev/null 2>&1 || true
  fi
  set -e
  [[ "$failed" -eq 0 ]] && ROLLBACK_OK=1
}

cleanup() {
  rm -rf "$STAGING"
  rm -f "$SERVICE_BACKUP"
  if [[ "$SUCCESS" -ne 1 && ( "$SWITCHED" -eq 0 || "$ROLLBACK_OK" -eq 1 ) ]]; then
    rm -rf "$RELEASE"
  fi
}

finish() {
  local status=$?
  trap - EXIT
  if [[ "$status" -ne 0 && "$SWITCHED" -eq 1 ]]; then
    echo "Aharane install failed; rolling back only Aharane resources." >&2
    rollback
    if [[ "$ROLLBACK_OK" -ne 1 ]]; then
      echo "Aharane rollback was incomplete; preserving the failed release for recovery." >&2
    fi
  fi
  cleanup
  exit "$status"
}
trap finish EXIT

if [[ -e "$SERVICE_FILE" ]] && ! grep -Fq 'Description=Aharane independent WhatsApp bot' "$SERVICE_FILE"; then
  echo "An unrelated aharane.service already exists; refusing to overwrite it." >&2
  exit 2
fi
if [[ -f "$SERVICE_FILE" ]]; then
  cp -p "$SERVICE_FILE" "$SERVICE_BACKUP"
  SERVICE_EXISTED=1
fi

tar -xzf "$ARCHIVE" --strip-components=1 -C "$STAGING"
[[ -f "$STAGING/package.json" && -f "$STAGING/src/index.js" && -f "$STAGING/.env.example" ]] || {
  echo "Archive does not contain the expected Aharane application." >&2
  exit 2
}

if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$STATE" --create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi
install -d -o "$SERVICE_USER" -g "$SERVICE_USER" -m 0750 "$BASE" "$BASE/releases" "$STATE" "$STATE/whatsapp-auth"
install -d -o "$SERVICE_USER" -g "$SERVICE_USER" -m 0750 "$STATE/data"
install -d -o "$SERVICE_USER" -g "$SERVICE_USER" -m 0750 "$RELEASE"
cp -a "$STAGING/." "$RELEASE/"
chown -R "$SERVICE_USER:$SERVICE_USER" "$RELEASE"
chown -R "$SERVICE_USER:$SERVICE_USER" "$STATE"
chmod 0700 "$STATE" "$STATE/whatsapp-auth" "$STATE/data"

if [[ ! -f "$ENV_FILE" ]]; then
  install -o root -g "$SERVICE_USER" -m 0640 "$RELEASE/.env.example" "$ENV_FILE"
fi
if grep -q '^AHARANE_ADMIN_TOKEN=GENERATE_ON_INSTALL$' "$ENV_FILE" || ! grep -q '^AHARANE_ADMIN_TOKEN=.' "$ENV_FILE"; then
  token="$(openssl rand -hex 32)"
  if grep -q '^AHARANE_ADMIN_TOKEN=' "$ENV_FILE"; then
    sed -i "s/^AHARANE_ADMIN_TOKEN=.*/AHARANE_ADMIN_TOKEN=$token/" "$ENV_FILE"
  else
    printf '\nAHARANE_ADMIN_TOKEN=%s\n' "$token" >> "$ENV_FILE"
  fi
fi
if grep -q '^AHARANE_DATA_DIR=' "$ENV_FILE"; then
  sed -i "s|^AHARANE_DATA_DIR=.*|AHARANE_DATA_DIR=$STATE|" "$ENV_FILE"
else
  printf '\nAHARANE_DATA_DIR=%s\n' "$STATE" >> "$ENV_FILE"
fi
if ! grep -q '^AHARANE_HOST=' "$ENV_FILE"; then
  printf 'AHARANE_HOST=127.0.0.1\n' >> "$ENV_FILE"
fi
if grep -q '^AHARANE_PORT=' "$ENV_FILE"; then
  sed -i 's/^AHARANE_PORT=.*/AHARANE_PORT=8790/' "$ENV_FILE"
else
  printf 'AHARANE_PORT=8790\n' >> "$ENV_FILE"
fi
# Keep Aharane's state root, listener and port private and fixed.
sed -i 's/^AHARANE_HOST=.*/AHARANE_HOST=127.0.0.1/' "$ENV_FILE"
admin_token="$(sed -n 's/^AHARANE_ADMIN_TOKEN=//p' "$ENV_FILE" | tail -1 | tr -d '\r')"
[[ ${#admin_token} -ge 32 ]] || { echo "AHARANE_ADMIN_TOKEN must contain at least 32 characters." >&2; exit 2; }
chown root:"$SERVICE_USER" "$ENV_FILE"
chmod 0640 "$ENV_FILE"

runuser -u "$SERVICE_USER" -- npm --prefix "$RELEASE" install --omit=dev --no-audit --no-fund
printf '%s\n' "$SOURCE_SHA" > "$RELEASE/.deployed-source-ref"
chown root:"$SERVICE_USER" "$RELEASE/.deployed-source-ref"
chmod 0440 "$RELEASE/.deployed-source-ref"

SWITCHED=1
cat > "$SERVICE_FILE" <<'UNIT'
[Unit]
Description=Aharane independent WhatsApp bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=aharane
Group=aharane
WorkingDirectory=/opt/aharane/current
EnvironmentFile=/etc/aharane.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /opt/aharane/current/src/index.js
Restart=on-failure
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=20
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/aharane
RestrictSUIDSGID=true
LockPersonality=true

[Install]
WantedBy=multi-user.target
UNIT
chmod 0644 "$SERVICE_FILE"

next="$BASE/.current-next-$$"
ln -s "$RELEASE" "$next"
mv -Tf "$next" "$BASE/current"
SWITCHED=1
systemctl daemon-reload
systemctl enable aharane.service >/dev/null
systemctl restart aharane.service

healthy=0
for _ in $(seq 1 25); do
  if systemctl is-active --quiet aharane.service && curl -fsS --max-time 2 http://127.0.0.1:8790/healthz | grep -q '"service":"aharane"'; then
    healthy=1
    break
  fi
  sleep 1
done

if [[ "$healthy" -ne 1 ]]; then
  echo "Aharane failed its local health check." >&2
  exit 1
fi

SUCCESS=1
echo "Aharane deployment verified: $SOURCE_SHA"
echo "Aharane service is active on 127.0.0.1:8790."
echo "The existing NIGHT service and its files were not modified."
