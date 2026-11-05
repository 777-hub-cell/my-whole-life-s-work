#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
script=mscc/tools/deploy-azure-ssh.sh
installer=mscc/install-azure.sh
if ! grep -Fq 'SOURCE_REPOSITORY="${MSCC_SOURCE_REPOSITORY:-777-hub-cell/my-whole-life-s-work}"' "$installer" ||
   ! grep -Fq 'https://github.com/$SOURCE_REPOSITORY/archive/$SOURCE_REF.tar.gz' "$installer"; then
  echo "Azure installer must download the pinned source archive from the configured migrated repository." >&2
  exit 1
fi
if grep -Fq 'Tomex777/Build' "$installer" "$script" mscc/tools/azure-cortex-cloud-bootstrap.sh; then
  echo "Deployment scripts must not fetch NIGHT from the unavailable old repository." >&2
  exit 1
fi
for protected in '**/.env' '**/.env.*' '!**/.env.example' '**/auth/' '**/sessions/' '**/*.pem' '**/*.key'; do
  if ! grep -Fxq "$protected" .gitignore; then
    echo "Repository .gitignore is missing protection: $protected" >&2
    exit 1
  fi
done
if ! grep -Fq '"$USER_NAME@$HOST" "MSCC_SOURCE_REF=$SHA MSCC_SOURCE_REPOSITORY=$SOURCE_REPOSITORY MSCC_REUSE_EXISTING_SOURCE_STACK=1 bash -se"' "$script"; then
  echo "Deployment must pass a validated source repository and preserve the existing Azure Tor + FlareSolverr stack." >&2
  exit 1
fi
out="$(mktemp)"
trap 'rm -f "$out"' EXIT
sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

expect_fail() {
  local match="$1"; shift
  if env -i PATH="$PATH" HOME="${HOME:-/tmp}" "$@" bash "$script" >"$out" 2>&1; then
    echo "Unexpected deployment success in a negative test" >&2
    exit 1
  fi
  if ! grep -Fq "$match" "$out"; then
    echo "Missing expected deployment guard: $match" >&2
    cat "$out" >&2
    exit 1
  fi
}
expect_fail "GitHub commit SHA is required" GITHUB_SHA=mscc-azure
expect_fail "Missing required mscc-production secret: MSCC_SSH_HOST" GITHUB_SHA="$sha"
expect_fail "Invalid deployment hostname" GITHUB_SHA="$sha" MSCC_SSH_HOST='host;touch /tmp/untrusted' MSCC_SSH_USER=azureuser MSCC_SSH_KEY=dummy MSCC_SSH_KNOWN_HOSTS=dummy
expect_fail "Invalid deployment username" GITHUB_SHA="$sha" MSCC_SSH_HOST=example.com MSCC_SSH_USER='root;echo' MSCC_SSH_KEY=dummy MSCC_SSH_KNOWN_HOSTS=dummy
expect_fail "Invalid SSH port" GITHUB_SHA="$sha" MSCC_SSH_HOST=example.com MSCC_SSH_USER=azureuser MSCC_SSH_PORT=99999 MSCC_SSH_KEY=dummy MSCC_SSH_KNOWN_HOSTS=dummy
expect_fail "does not contain a valid SSH public host key" GITHUB_SHA="$sha" MSCC_SSH_HOST=example.com MSCC_SSH_USER=azureuser MSCC_SSH_KEY=dummy MSCC_SSH_KNOWN_HOSTS=dummy
expect_fail "Invalid MSCC source repository" GITHUB_SHA="$sha" GITHUB_REPOSITORY="bad repo/name" MSCC_SSH_HOST=example.com MSCC_SSH_USER=azureuser MSCC_SSH_KEY=dummy MSCC_SSH_KNOWN_HOSTS=dummy
echo "PASS Azure deploy guardrails (pinned SHA, repository, secrets, host/user/port, pinned SSH host key)"
