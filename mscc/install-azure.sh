#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

VERSION="2.3.1"
SOURCE_REF="${MSCC_SOURCE_REF:-mscc-azure}"
SOURCE_REPOSITORY="${MSCC_SOURCE_REPOSITORY:-777-hub-cell/my-whole-life-s-work}"
[[ "$SOURCE_REPOSITORY" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || { echo "Invalid MSCC source repository." >&2; exit 2; }
export MSCC_SOURCE_REPOSITORY="$SOURCE_REPOSITORY"
BASE="/opt/mscc"
RELEASE="$BASE/releases/$VERSION-$(date -u +%Y%m%dT%H%M%SZ)-$$"
STATE="/var/lib/mscc"
BACKUPS="/var/backups/mscc"
ENV_FILE="/etc/mscc.env"
ENV_EXAMPLE="/etc/mscc.env.example"
SERVICE="/etc/systemd/system/mscc.service"
ARCHIVE="/tmp/mscc-azure.tar.gz"
UNPACK="/tmp/mscc-azure-src"

PREVIOUS_RELEASE="$(readlink -f "$BASE/current" 2>/dev/null || true)"
ACTIVATED=0
CONFIG_ROLLBACK_DIR=""
ENV_PREEXISTED=0
SERVICE_PREEXISTED=0

# Snapshot private configuration immediately before activating a new release.
# The unique directory is mode 0700. Never print its contents or upload it.
snapshot_configs() {
  CONFIG_ROLLBACK_DIR="$(mktemp -d "$BACKUPS/.config-rollback-XXXXXXXX")"
  chmod 700 "$CONFIG_ROLLBACK_DIR"
  if sudo test -f "$ENV_FILE"; then
    sudo cp -p "$ENV_FILE" "$CONFIG_ROLLBACK_DIR/mscc.env"
    ENV_PREEXISTED=1
  fi
  if sudo test -f "$SERVICE"; then
    sudo cp -p "$SERVICE" "$CONFIG_ROLLBACK_DIR/mscc.service"
    SERVICE_PREEXISTED=1
  fi
}

restore_configs() {
  [ -n "$CONFIG_ROLLBACK_DIR" ] || return 0
  if [ "$ENV_PREEXISTED" -eq 1 ]; then
    sudo cp -p "$CONFIG_ROLLBACK_DIR/mscc.env" "$ENV_FILE"
  else
    sudo rm -f "$ENV_FILE"
  fi
  if [ "$SERVICE_PREEXISTED" -eq 1 ]; then
    sudo cp -p "$CONFIG_ROLLBACK_DIR/mscc.service" "$SERVICE"
  else
    sudo rm -f "$SERVICE"
  fi
  sudo systemctl daemon-reload
}

cleanup_config_snapshot() {
  [ -n "$CONFIG_ROLLBACK_DIR" ] || return 0
  rm -f "$CONFIG_ROLLBACK_DIR/mscc.env" "$CONFIG_ROLLBACK_DIR/mscc.service"
  rmdir "$CONFIG_ROLLBACK_DIR"
  CONFIG_ROLLBACK_DIR=""
}

switch_release() {
  local target="$1"
  local candidate="$BASE/.current-next-$$"
  ln -s "$target" "$candidate"
  mv -Tf "$candidate" "$BASE/current"
}

rollback_on_error() {
  local status=$?
  if [ "$status" -ne 0 ] && [ "$ACTIVATED" -eq 1 ]; then
    echo "Deployment failed after activation; attempting MSCC rollback." >&2
    if [ -n "$PREVIOUS_RELEASE" ] && [ -d "$PREVIOUS_RELEASE" ]; then
      switch_release "$PREVIOUS_RELEASE" || true
      restore_configs || true
      sudo systemctl restart mscc.service || true
      echo "Restored previous release: $PREVIOUS_RELEASE" >&2
    else
      sudo systemctl stop mscc.service || true
      restore_configs || true
      echo "No previous release available; stopped the failed first deployment." >&2
    fi
  fi
  cleanup_config_snapshot || true
}
trap rollback_on_error EXIT

echo "=== MSCC Azure install v$VERSION ==="
echo "Source ref: $SOURCE_REF"

command -v flock >/dev/null || { echo 'MSCC requires flock to prevent simultaneous WhatsApp session ownership.' >&2; exit 1; }
sudo mkdir -p "$BASE/releases" "$STATE/auth" "$STATE/auth-b" "$STATE/data" "$BACKUPS"
sudo chown -R "$USER:$USER" "$BASE" "$STATE" "$BACKUPS"
chmod 700 "$STATE" "$STATE/auth" "$STATE/auth-b" "$STATE/data"

echo ">>> Downloading complete MSCC source from GitHub..."
rm -rf "$UNPACK" "$ARCHIVE"
curl -fsSL "https://github.com/$SOURCE_REPOSITORY/archive/$SOURCE_REF.tar.gz" -o "$ARCHIVE"
mkdir -p "$UNPACK"
tar -xzf "$ARCHIVE" -C "$UNPACK" --strip-components=1
# Never remove the currently running release; each deployment gets a new directory.
test ! -e "$RELEASE"
mkdir -p "$RELEASE"
cp -a "$UNPACK/mscc/." "$RELEASE/"
# Record precisely which source is active so CI can detect stale deployments.
# This marker contains a public commit ref only, never credentials or state.
printf '%s\n' "$SOURCE_REF" > "$RELEASE/.deployed-source-ref"
rm -rf "$UNPACK" "$ARCHIVE" "$RELEASE/dist"

echo ">>> Preparing Node dependencies for inactive release..."
cd "$RELEASE"
bash "$RELEASE/tools/install-node-deps.sh" "$RELEASE" "$PREVIOUS_RELEASE"

NEED_APT=0
if ! command -v ffmpeg >/dev/null 2>&1; then NEED_APT=1; fi
if ! command -v pdftotext >/dev/null 2>&1; then NEED_APT=1; fi
if ! command -v pdftoppm >/dev/null 2>&1; then NEED_APT=1; fi
if ! command -v gs >/dev/null 2>&1; then NEED_APT=1; fi
if ! command -v fpcalc >/dev/null 2>&1; then NEED_APT=1; fi
# Unicode and emoji fonts are required for headless social-card rendering.
for font_package in fonts-noto-core fonts-noto-color-emoji fonts-freefont-ttf fontconfig; do
  if ! dpkg-query -W -f='${Status}' "$font_package" 2>/dev/null | grep -q 'install ok installed'; then
    NEED_APT=1
  fi
done
if [ "$NEED_APT" -eq 1 ]; then
  echo ">>> Installing media/document/fingerprint and Unicode font dependencies..."
  sudo apt-get update -y
  sudo apt-get install -y --no-install-recommends ffmpeg poppler-utils libchromaprint-tools ghostscript fontconfig fonts-noto-core fonts-noto-color-emoji fonts-freefont-ttf
  sudo fc-cache -f >/dev/null 2>&1 || true
fi
# Refuse to ship missing piece glyphs; Nexia's renderer depends on FreeSerif.
test -f /usr/share/fonts/truetype/freefont/FreeSerif.ttf || { echo 'Chess font FreeSerif.ttf is missing.' >&2; exit 1; }

# Keep YouTube's optional maintained extractor in a private MSCC-only venv.
# Do not replace system Python, other services, or install into site-packages.
# An unavailable Python index must never abort a healthy MSCC deployment.
YOUTUBE_VENV="$BASE/tools/yt-dlp"
# TikTok changes its extractor frequently: retaining a once-installed yt-dlp
# indefinitely makes a working Nexia-style download fail on a newer share URL.
# Refresh the isolated MSCC binary on each real Azure release by default.
# Set MSCC_SOCIAL_UPDATE_YTDLP=0 to opt out of that refresh for a pinned VM.
# The existing MSCC_YOUTUBE_UPDATE_YTDLP=1 flag still forces an update.
if [ ! -x "$YOUTUBE_VENV/bin/yt-dlp" ] || [ "${MSCC_YOUTUBE_UPDATE_YTDLP:-0}" = "1" ] || [ "${MSCC_SOCIAL_UPDATE_YTDLP:-1}" = "1" ]; then
  echo ">>> Installing/updating isolated MSCC yt-dlp for NIGHT public media..."
  if ! command -v python3 >/dev/null 2>&1 || ! python3 -m venv --help >/dev/null 2>&1; then
    echo "Optional YouTube extractor skipped: Python venv unavailable." >&2
  else
    # Some lean Ubuntu images have Python but lack ensurepip/python3-venv.
    if ! python3 -m venv "$YOUTUBE_VENV" >/dev/null 2>&1; then
      echo ">>> Installing missing Python venv support..."
      if sudo apt-get update -qq && sudo apt-get install -y --no-install-recommends python3-venv; then
        python3 -m venv "$YOUTUBE_VENV" || true
      fi
    fi
    if [ -x "$YOUTUBE_VENV/bin/python" ]; then
      if ! "$YOUTUBE_VENV/bin/python" -m pip install --disable-pip-version-check --quiet --upgrade "yt-dlp[default]"; then
        echo "Optional YouTube extractor install failed; MSCC will continue normally." >&2
      fi
    fi
  fi
fi
# Safe version telemetry only: never echo user media links, account cookies,
# yt-dlp verbose output, or network headers into deployment logs.
if [ -x "$YOUTUBE_VENV/bin/yt-dlp" ]; then
  echo ">>> MSCC yt-dlp version: $("$YOUTUBE_VENV/bin/yt-dlp" --version 2>/dev/null | head -n 1)"
else
  echo ">>> MSCC yt-dlp missing (social TikTok yt-dlp extraction unavailable)" >&2
fi

# Optional photo-post extractor for NIGHT's .dl command. This shares the
# existing isolated MSCC Python venv and never changes host/site-packages.
# Failure must not prevent video downloads or a healthy bot deployment.
if [ -x "$YOUTUBE_VENV/bin/python" ] && { [ ! -x "$YOUTUBE_VENV/bin/gallery-dl" ] || [ "${MSCC_SOCIAL_UPDATE_GALLERY_DL:-0}" = "1" ]; }; then
  echo ">>> Installing optional NIGHT social photo extractor..."
  if ! "$YOUTUBE_VENV/bin/python" -m pip install --disable-pip-version-check --quiet --upgrade gallery-dl; then
    echo "Optional NIGHT photo extractor install failed; social video downloads remain available." >&2
  fi
fi

npm run check

SOURCE_STACK_DIR="${MSCC_SOURCE_STACK_DIR:-/opt/mscc-source-stack}"
SOURCE_STACK_MARKER="$SOURCE_STACK_DIR/.animepahe-stack-version"
SOURCE_STACK_VERSION="3"
CURRENT_SOURCE_STACK_VERSION="$(cat "$SOURCE_STACK_MARKER" 2>/dev/null || true)"

# Some existing Azure installations run Tor as a host systemd service on
# 127.0.0.1:9050 and FlareSolverr under pre-existing Docker container names.
# Starting a second Tor container on that port fails before MSCC can update.
# Opt-in reuse validates both existing endpoints and DOES NOT stop/replace them.
# It deliberately does not write the source stack version marker: external
# services must not be falsely registered as our Docker-managed source stack.
verify_existing_source_stack() {
  local tor_port="${MSCC_TOR_PORT:-9050}"
  local flare_port="${MSCC_FLARE_PORT:-8191}"
  for port in "$tor_port" "$flare_port"; do
    if ! [[ "$port" =~ ^[0-9]+$ ]] || (( port < 1 || port > 65535 )); then
      echo "Existing source stack port is invalid." >&2
      return 2
    fi
  done

  echo ">>> Verifying existing Tor SOCKS proxy on 127.0.0.1:$tor_port..."
  local tor_probe
  tor_probe="$(curl -fsS --retry 2 --retry-delay 2 --retry-all-errors --connect-timeout 5 --max-time 25 \
    --proxy "socks5h://127.0.0.1:$tor_port" \
    https://check.torproject.org/api/ip)" || {
    echo "Existing Tor proxy did not respond. Leaving MSCC and source services untouched." >&2
    return 1
  }
  if ! printf '%s' "$tor_probe" | node -e '
    let input = "";
    process.stdin.on("data", data => input += data);
    process.stdin.on("end", () => {
      try { if (JSON.parse(input).IsTor !== true) process.exitCode = 1; }
      catch { process.exitCode = 1; }
    });
  '; then
    echo "Existing proxy was not confirmed as a Tor exit; refusing unsafe source routing." >&2
    return 3
  fi

  echo ">>> Verifying existing FlareSolverr on 127.0.0.1:$flare_port..."
  if ! curl -fsS --connect-timeout 5 --max-time 12 \
    "http://127.0.0.1:$flare_port/health" >/dev/null; then
    echo "Existing FlareSolverr health endpoint is unavailable; leaving services untouched." >&2
    return 1
  fi
  echo ">>> Reusing verified existing Tor + FlareSolverr; no Docker containers replaced."
}

if [ "${MSCC_REUSE_EXISTING_SOURCE_STACK:-0}" = "1" ]; then
  if verify_existing_source_stack; then
    : # Existing optional sources verified; do not modify their services.
  else
    source_stack_status=$?
    if [ "$source_stack_status" -ne 1 ]; then
      echo "Unsafe or invalid source stack configuration; aborting without changing services." >&2
      exit "$source_stack_status"
    fi
    # A transient Tor-network outage must not prevent unrelated NIGHT features
    # from shipping. We never restart or replace the existing source services;
    # Tor-dependent providers remain degraded until the separate stack recovers.
    echo "WARNING: Optional Tor/FlareSolverr source stack unavailable; continuing NIGHT core upgrade." >&2
    echo "WARNING: Anime sources requiring Tor are NOT verified and may fail. No source-stack services were changed." >&2
  fi
elif [ "$CURRENT_SOURCE_STACK_VERSION" != "$SOURCE_STACK_VERSION" ]; then
  echo ">>> Installing/upgrading AnimePahe Tor + FlareSolverr source stack..."
  bash "$RELEASE/tools/install-flaresolverr-tor.sh"
else
  echo ">>> AnimePahe source stack v$SOURCE_STACK_VERSION already installed."
fi

# The Cortex Agent is an unprivileged service account. Its installer grants
# write permissions to the original resolved project directory, not to later
# sibling directories created by an atomic MSCC upgrade. Before switching
# /opt/mscc/current, explicitly grant the new release its own narrow ACLs.
# Do not grant access to auth state or the protected private config tree.
grant_cortex_release_access() {
  if ! id -u cortex-agent >/dev/null 2>&1; then
    return 0  # The Cortex Agent has not been installed on this VM yet.
  fi
  if ! command -v setfacl >/dev/null 2>&1; then
    echo "Cortex Agent is installed, but setfacl is unavailable; refusing incomplete upgrade." >&2
    return 1
  fi
  echo ">>> Granting Cortex Agent access to the new MSCC release..."
  find "$RELEASE" \
    \( -name node_modules -o -name .git -o -name .ssh -o -name .gradle -o -name .cortex -o -name auth -o -name '.env*' \) -prune -o \
    \( -type f -o -type d \) -exec sudo setfacl -m 'u:cortex-agent:rwX' {} +
  find "$RELEASE" \
    \( -name node_modules -o -name .git -o -name .ssh -o -name .gradle -o -name .cortex -o -name auth -o -name '.env*' \) -prune -o \
    -type d -exec sudo setfacl -m 'd:u:cortex-agent:rwX' {} +
}

grant_cortex_release_access

echo ">>> Snapshotting config for rollback (secrets remain local/private)..."
snapshot_configs

echo ">>> Activating release..."
switch_release "$RELEASE"
ACTIVATED=1

echo ">>> Installing environment template..."
sudo cp "$RELEASE/.env.example" "$ENV_EXAMPLE"
sudo chmod 600 "$ENV_EXAMPLE"

if [ ! -f "$ENV_FILE" ]; then
  sudo cp "$ENV_EXAMPLE" "$ENV_FILE"
  sudo chmod 600 "$ENV_FILE"
  echo "Created $ENV_FILE from template."
else
  echo "Existing $ENV_FILE preserved."
fi

upsert_env() {
  local key="$1" value="$2"
  if sudo grep -q "^$key=" "$ENV_FILE"; then
    sudo sed -i "s|^$key=.*|$key=$value|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" | sudo tee -a "$ENV_FILE" >/dev/null
  fi
}

echo ">>> Hardening private control configuration..."
WEB_PASSWORD_VALUE="$(sudo sed -n 's/^WEB_PASSWORD=//p' "$ENV_FILE" | tail -1 | tr -d '\r' || true)"
if [ -z "$WEB_PASSWORD_VALUE" ] || [ "$WEB_PASSWORD_VALUE" = "change-this-password" ]; then
  upsert_env WEB_PASSWORD "$(openssl rand -hex 24)"
fi
WEB_SESSION_VALUE="$(sudo sed -n 's/^WEB_SESSION_SECRET=//p' "$ENV_FILE" | tail -1 | tr -d '\r' || true)"
if [ -z "$WEB_SESSION_VALUE" ]; then
  upsert_env WEB_SESSION_SECRET "$(openssl rand -hex 32)"
fi
upsert_env MSCC_WEB_HOST "127.0.0.1"
sudo chmod 600 "$ENV_FILE"
# A chmod(600) resets the POSIX ACL mask on root-owned /etc/mscc.env,
# revoking the existing Cortex Agent's explicit named-user read grant.
# Reinstate only that one service identity. Other users remain denied.
if id -u cortex-agent >/dev/null 2>&1; then
  command -v setfacl >/dev/null || {
    echo "setfacl unavailable; Cortex Agent cannot read protected cloud configuration" >&2
    exit 1
  }
  sudo setfacl -m 'u:cortex-agent:r--' "$ENV_FILE"
fi

echo ">>> Installing systemd service..."
sudo tee "$SERVICE" >/dev/null <<EOF
[Unit]
Description=MSCC Private WhatsApp Companion
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
Group=$USER
WorkingDirectory=$BASE/current
EnvironmentFile=$ENV_FILE
# Managed Cortex additions are an optional, private overlay. NIGHT reads this
# file on start after the original system-managed /etc/mscc.env; the Agent no
# longer needs privileged filesystem writes inside its hardened sandbox.
EnvironmentFile=-/var/lib/cortex/mscc-overrides.env
# Atomic cross-process singleton lock for this MSCC runtime. A second
# service/manual instance must never mutate the same WhatsApp Signal keys.
# flock holds the lock for the Node process lifetime; systemd tears down
# the process cgroup on restart, releasing the lock without stale PID files.
ExecStart=$(command -v flock) -n -E 75 $STATE/data/.mscc-runtime.lock /usr/bin/node --max-old-space-size=192 $BASE/current/index.js
Restart=on-failure
RestartSec=4
KillSignal=SIGINT
TimeoutStopSec=20
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable mscc.service >/dev/null

echo ">>> Starting MSCC..."
sudo systemctl restart mscc.service

READY=0
for _ in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:8787/health >/tmp/mscc-health.json 2>/dev/null; then
    READY=1
    break
  fi
  sleep 1
done

if [ "$READY" -ne 1 ]; then
  echo "MSCC did not become healthy." >&2
  sudo systemctl --no-pager --full status mscc.service || true
  sudo journalctl -u mscc.service -n 80 --no-pager || true
  exit 1
fi

sudo systemctl --no-pager --full status mscc.service || true
echo
cat /tmp/mscc-health.json
echo
echo "Local Cortex pairing bridge:"
# Never print /state: it may include temporary pairing codes or session data.
# The smoke probe reports only aggregate health counts.
# Assert the deployed Cortex/MSCC account-management contract before
# disarming the automatic release rollback.
echo ">>> Validating live Cortex/MSCC session API..."
# Canonicalize the release path so even smoke scripts with a strict
# import.meta.url / argv[1] entrypoint guard actually run via current symlink.
# Any account-contract failure must abort and roll back the activation.
node "$(readlink -f "$BASE/current/tools/azure-smoke.mjs")"

echo
echo ">>> Installing restricted GitHub SSH command wrapper..."
bash -n "$RELEASE/tools/mscc-github-deploy-wrapper.sh"
bash "$RELEASE/tools/mscc-github-deploy-wrapper-selftest.sh"
sudo install -o root -g root -m 0755 \
  "$RELEASE/tools/mscc-github-deploy-wrapper.sh" \
  /usr/local/sbin/mscc-github-deploy

# The deployment SSH key is intentionally restricted to pinned MSCC releases.
# Bootstrap the Cloud-capable Cortex Agent through this already approved
# installer rather than bypassing or weakening the SSH forced-command policy.
# The helper is pinned, checks hashes, verifies live private APIs, and rolls
# back only Cortex on failure without restarting the MSCC process.
echo
echo ">>> Bootstrapping Cortex Cloud Agent (one-time)..."
bash "$RELEASE/tools/azure-cortex-cloud-bootstrap.sh"

echo ">>> Connecting NIGHT Play through the existing HTTPS ingress..."
bash "$RELEASE/tools/install-night-play-ingress.sh"

ACTIVATED=0
echo "=== MSCC INSTALL COMPLETE ==="
echo "Release: $RELEASE"
echo "Current: $BASE/current"
echo "Private commands: $BASE/current/private-commands"
echo "Public commands: $BASE/current/commands"
echo "State A: $STATE/auth"
echo "State B: $STATE/auth-b"
echo "Data: $STATE/data"
echo "Shared SQLite: $STATE/data/mscc-shared.sqlite"
echo "Environment: $ENV_FILE"
echo "Coturn remains: $(systemctl is-active coturn 2>/dev/null || true)"
