# MSCC / Cortex — Azure release operations

This is an **operator-run procedure**. Repository CI verifies code; it does not demonstrate that a real Azure VM, WhatsApp session, or Cortex Agent has been deployed. Never put WhatsApp auth files, account state, `/etc/mscc.env`, pairing codes, or SSH keys in GitHub issues, logs, or CI artifacts.

## GitHub Actions automatic deployment to Azure

The `.github/workflows/mscc-azure.yml` workflow now has two stages: `validate` and
`deploy`. A pull request runs validation **only**. A push or merge to the
`mscc-azure` branch runs validation first, and then requests access to the
`mscc-production` GitHub Actions **environment** to deploy the exact tested
commit over SSH. Deployment fails visibly if any of the credentials are
missing, the host key does not match, or the live smoke check fails. Green
validation checks alone are not evidence of a deployment; check the
**Deploy tested MSCC commit to Azure** job too.

### One-time setup by the Azure/GitHub administrator

1. In the repository's **Settings → Environments**, create environment
   `mscc-production`. Limit it to the protected `mscc-azure` branch.
   Prefer required reviewers so a source-code push cannot immediately
   trigger privileged production access. Protect the branch against
   unauthorized direct pushes.
2. Create a dedicated SSH key pair for the existing non-root account that
   already owns `mscc.service` on the Azure VM. Add its **public** key to
   that account's `~/.ssh/authorized_keys` with restrictive permissions.
   Never paste the private key into source code, issues, chats, or logs.
3. Add these **environment secrets** (not repository variables):

   | Name | Value |
   | --- | --- |
   | `MSCC_SSH_HOST` | Azure VM's stable DNS name or public IPv4 |
   | `MSCC_SSH_USER` | Existing MSCC service account name (non-root) |
   | `MSCC_SSH_KEY` | Entire matching OpenSSH **private** key, including its original line breaks |
   | `MSCC_SSH_KNOWN_HOSTS` | One or more verified OpenSSH known-hosts lines for that Azure host |

   For a nondefault SSH port, set environment **variable**
   `MSCC_SSH_PORT` (otherwise port 22 is used). A known-hosts line for
   a nondefault port must use the `[hostname]:port` form. Collect the
   SSH host key on the VM or compare its fingerprint through an already
   trusted channel. Running `ssh-keyscan` from an untrusted network
   **without verifying** its fingerprint does not establish trust.
4. Ensure the deployment account has noninteractive `sudo` for the existing
   `install-azure.sh` deployment operations. The SSH job tests
   `sudo -n true` and stops if this is missing. Do not switch to a
   different service owner; the installer manages persistent state ownership.
   Restrict SSH to trusted sources where possible, and avoid opening
   private Cortex/MSCC application ports to the Internet.
5. Merge the reviewed change to `mscc-azure` (or use the workflow's manual
   **Run workflow** button on that branch), approve the production environment
   if prompted, and watch **both** jobs. The log should finish with
   `MSCC Azure deployment verified at <SHA>`.
   Confirm the deployed ref with:
   `cat /opt/mscc/current/.deployed-source-ref`.
   It must match the workflow's commit SHA.

The deploy helper refuses unpinned refs, validates all required secrets,
strictly checks the pinned host key, and runs the existing atomic release
installer, which performs health and account-contract smoke checks and
attempts to roll back on activation failure. The helper also checks the
deployed commit marker and active service. CI does **not** provision SSH
keys, bypass the GitHub environment, or sign into Azure on its own.

### What deployment does not upload

Repository source assets (including the existing miniature `.webp.b64`
personality fallbacks) are delivered with code. The nine original high-
resolution Josia/Nami/MiMi images are **not present in GitHub**, so deploying
the source will not manufacture or transfer them. Install the separate ZIP
once using `mscc/docs/personality-hd-art.md`, or use a future dedicated
Cortex artwork upload. Files in `/var/lib/mscc/personality-art` persist
across subsequent code deployments.

---

## Requirements

- SSH access to the intended Azure Linux VM with `sudo`.
- Back up or snapshot the VM before changes. Ensure sufficient free disk space for two application versions and the snapshot.
- Node 24, `npm`, `curl`, `tar`, and `systemd` installed. Verify the target service and directory layout before running any installer.
- A *reviewed* full Git commit SHA of the tested `mscc-azure` branch. Pin **both** installer and application checkout to the same SHA. Do not deploy a moving branch head.
- Cortex Agent is configured to reach the private MSCC loopback service on its expected local bridge port. Loopback endpoints are not meant to be exposed to the Internet.

## Pre-deployment (on the Azure VM)

```bash
set -euo pipefail
umask 077
sudo systemctl status mscc --no-pager || true
df -h /opt /var
PREVIOUS_RELEASE="$(readlink -f /opt/mscc/current 2>/dev/null || true)"
printf 'Previous release directory: %s\n' "${PREVIOUS_RELEASE:-none}"
# Optional before first deployment, if state is absent:
sudo test -d /var/lib/mscc && echo 'MSCC state directory exists'
sudo test -f /etc/mscc.env && echo 'Private MSCC environment exists'
```

For a running production service, make a VM/disk snapshot or consistent backup of `/var/lib/mscc` and `/etc/mscc.env` **without printing or uploading either**. Auth directories and the shared database must survive upgrades. Treat backups as highly sensitive.

## Pin and deploy the tested commit

Replace the placeholder with the 40-character commit SHA of the reviewed `mscc-azure` commit, then execute the commands *on the VM*:

```bash
set -euo pipefail
export MSCC_SOURCE_REF='<TESTED_MSCC_COMMIT_SHA>'
export MSCC_SOURCE_REPOSITORY='777-hub-cell/my-whole-life-s-work'
[[ "$MSCC_SOURCE_REF" =~ ^[[:xdigit:]]{40}$ ]] || { echo 'Invalid deployment commit SHA'; exit 1; }
curl -fsSL "https://raw.githubusercontent.com/Tomex777/Build/${MSCC_SOURCE_REF}/mscc/install-azure.sh" -o /tmp/mscc-install-azure.sh
bash -n /tmp/mscc-install-azure.sh
bash /tmp/mscc-install-azure.sh
```

The installer stages the chosen source in a new, separate release directory. It does not remove the currently running application directory. Once dependencies and checks pass, it switches `/opt/mscc/current` atomically, restarts `mscc.service`, checks its health, and runs a **read-only** Cortex/MSCC account contract smoke test. On failure after the switch, it attempts to restore the previous version.

**Do not reconfigure or remove existing WhatsApp sessions to repair a failed deployment.** Review the service logs first and avoid placing those logs in public tickets without scrubbing credentials and account identifiers.

## Validate after deployment

```bash
sudo systemctl is-active --quiet mscc
curl -fsS http://127.0.0.1:8787/health
node /opt/mscc/current/tools/azure-smoke.mjs
readlink -f /opt/mscc/current
```

The smoke test checks stable session IDs, Account A ownership and fixed CC destination, explicit bot profiles, activity response, and the private API. It reports counts, not sensitive identifiers. It does **not** demonstrate that WhatsApp has authenticated, messages have been delivered, or the Android app reaches Cortex over the public network.

In the Cortex Android application, use the existing configured Cortex server address and access token. Verify account list, account rename, bot-profile changes, reconnection, pairing-code and explicitly chosen QR flows. Perform a consented send/receive check using non-sensitive test accounts before declaring production ready.

## Manual rollback if necessary

Only after diagnosing a failed deployment and identifying a known-good `PREVIOUS_RELEASE` from the pre-deployment record:

```bash
set -euo pipefail
PREVIOUS_RELEASE='<PREVIOUS_RELEASE_PATH>'
test -d "$PREVIOUS_RELEASE"
sudo systemctl stop mscc
candidate="/opt/mscc/.current-manual-rollback-$$"
sudo ln -s "$PREVIOUS_RELEASE" "$candidate"
sudo mv -Tf "$candidate" /opt/mscc/current
sudo systemctl start mscc
sudo systemctl is-active --quiet mscc
```

If state formats changed between versions, consult the backup/restore plan before downgrading. Never overwrite WhatsApp auth or shared-storage data without an explicit recovery decision.

## Android release gate

The production-signed Cortex APK is built by `Cortex Android Release Readiness` on the trusted `cortex-production-finalization` branch. Confirm successful `apksigner verify` output and a matching SHA-256 digest before distributing it. The debug APK and any CI QA/debug-signed `INSTALLABLE` variant are **not** substitutes for the production-signed APK.

The dedicated `Cortex Android` full-emulator suite must also pass on both API 26 and API 36. A successful compilation alone is insufficient.

## Cortex Agent and Android connection (one-time installation)

MSCC is the WhatsApp backend. The Android app reaches its account dashboard **through Cortex Agent**, a separate service. A healthy `mscc.service` alone does not mean that the mobile dashboard is reachable.

On the **same Azure VM** after MSCC is healthy:

1. Review the trusted `cortex-production-finalization` commit you intend to run, plus the current `cortex-agent/README.md`, `cortex-agent/install.sh` and `cortex-agent/install-azure-ip-https.sh` scripts. They manage systemd, ACLs, nginx, TLS and firewall-facing HTTPS.
2. Pin a full 40-character `CORTEX_SOURCE_REF` commit, download the entire archive to a temporary restricted directory and run `sudo bash cortex-agent/install.sh` from the extracted source. Do not execute a branch head that can change between review and installation.
3. If the VM has a **static public IPv4** and no conflicting nginx site configuration, use the reviewed `install-azure-ip-https.sh` to set up the Android HTTPS endpoint. The helper changes nginx's default site, so review it carefully if the VM hosts other websites.
4. In the Azure network security group, permit TCP **443** for the app and TCP **80** for ACME certificate issuance/renewal. Restrict SSH access. Never expose the private Cortex Agent **47831** or MSCC **8787/8788** ports publicly.
5. Save the generated Cortex Agent bearer token securely on first installation. **Never paste it into GitHub, CI logs, or support chats.** Configure Cortex Android with the trusted HTTPS URL and that token.
6. Confirm `systemctl is-active cortex-agent`, `systemctl is-active mscc`, HTTPS certificate validity, and the authenticated Cortex host/status and MSCC pairing screens from the Android device.

Example pinned-source preparation (on the VM; replace the placeholder with an already reviewed commit SHA):

```bash
set -euo pipefail
export CORTEX_SOURCE_REF='<TESTED_CORTEX_COMMIT_SHA>'
[[ "$CORTEX_SOURCE_REF" =~ ^[[:xdigit:]]{40}$ ]] || exit 1
work="$(mktemp -d)"
chmod 700 "$work"
curl -fsSL "https://github.com/Tomex777/Build/archive/$CORTEX_SOURCE_REF.tar.gz" -o "$work/cortex.tar.gz"
mkdir "$work/source"
tar -xzf "$work/cortex.tar.gz" -C "$work/source" --strip-components=1
bash -n "$work/source/cortex-agent/install.sh" "$work/source/cortex-agent/install-azure-ip-https.sh"
sudo bash "$work/source/cortex-agent/install.sh"
# Review the HTTPS helper and confirm the VM's static Azure public IPv4 first:
# sudo bash "$work/source/cortex-agent/install-azure-ip-https.sh" <AZURE_STATIC_PUBLIC_IPV4>
```

Keep the temporary checkout until you have completed and inspected the HTTPS setup, then remove it. The Cortex Agent installation is separate from the MSCC application installer. Once installed, the MSCC atomic upgrade script refreshes Cortex Agent ACL permissions on each **new** release directory so that file editing remains available across upgrades.

A successful local simulated Cortex↔MSCC contract test proves HTTP compatibility but cannot replace an actual on-device connectivity, pairing and real-message test.
