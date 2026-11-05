# NIGHT / MSCC — mandatory agent release policy

> Applies to the WhatsApp **NIGHT** bot in `mscc/**` and its GitHub Actions / Azure deployment. It does **not** apply to unrelated apps, websites, or NIGHT Play games unless explicitly integrated into MSCC.
>
> **Read this file in every chat, coding-agent run, or work session before performing NIGHT work.** Never rely on another conversation knowing about this policy.

## The rule: build together, deploy together

**Default = one NIGHT Release Batch per group of approved changes, one protected Azure approval per batch.**

- Implement each new feature or fix on a branch and open an ordinary PR targeting **`mscc-azure`**. Push code and let PR checks run, but **do not merge individual feature PRs to trigger deployments**.
- Collect ready changes (including requests from *other* chats) into **one integration/release PR**. Resolve any overlapping edits; retain all relevant changes, not merely the latest PR's version of a file.
- Run the **combined** MSCC command and regression suite and GitHub workflows on that exact integration head. Verify all required checks succeeded, not merely queued/skipped.
- Merge that **one** combined release PR into `mscc-azure` after the user has authorized shipping the batch and the checks pass. Its `mscc/release-batch.json` must be updated in the same release commit.
- The `MSCC Azure` workflow validates the merged commit, then requests approval for the **`mscc-production` environment**. The user approves **once for that batch**, not once per command/feature/PR.
- Check the production workflow, deployment health/smoke tests, active Azure commit, and live WhatsApp behavior after approval. **A green PR check, a successful GitHub merge, or a waiting approval is not a successful server deployment.**

**A single approval is needed for each new release batch, not one lifetime approval for all future batches.** An expired/cancelled/failed deployment or a separately requested emergency release may require another approval. Never tell the user that merely approving one run approves all future production changes.

## Actual GitHub wiring (verify current source; do not guess)

- Repository: `777-hub-cell/my-whole-life-s-work`.
- Production source branch: `mscc-azure`. Do not deploy MSCC from `main`, feature branches, or an unrelated repository.
- `.github/workflows/night-release-batch.yml` **prepares** a combined PR via manual `workflow_dispatch` with `pull_requests` (comma-separated PR numbers). It **does not deploy on its own**.
- `.github/workflows/mscc-azure.yml` validates PRs and branch updates. The deployment job may run on `mscc-azure` **only** when the release manifest changed on a push, or when a `workflow_dispatch` was explicitly requested. It uses GitHub's protected `mscc-production` environment.
- `mscc/release-batch.json` identifies the release. Change it **only when actually staging a complete, ready-to-ship combined release**. Its change requests a new protected production approval once the batch is merged and validated. Do not change it for routine docs or individual fixes.
- The automatic deploy gate also requires `baseBranch` to equal `mscc-azure`, `baseCommit` to equal the exact first parent of the push, a non-empty list of valid PR numbers, and a valid preparation timestamp. Stale manifests from migrated/older snapshots must not request production approval; stage a fresh batch against the current production parent.
- The batch cleanup workflow cancels only superseded **waiting/pending/queued** MSCC production runs. **Never interrupt a running Azure SSH installation**, and never tell a user to approve an outdated run.
- The workflow currently uses `cancel-in-progress: false` for Azure safety. Do not disable that without a tested safe-restart/rollback design.

Example preparation after gathering approved, open MSCC PRs:

```bash
gh workflow run night-release-batch.yml --repo 777-hub-cell/my-whole-life-s-work --ref mscc-azure -f pull_requests="236,237"
```

That creates a **release PR** (after successful preparation) which must be reviewed, tested, and merged once. The PR numbers above are only an illustration, **not** a list to deploy again. If the workflow cannot open a PR because of GitHub permissions, prepare an equivalent integration branch/PR with the repository tools; do **not** bypass validation or push straight to production.

## Agent checklist and limits

1. Inspect the latest `mscc-azure` SHA, `mscc/release-batch.json`, relevant open PRs, and both workflow files before planning a batch. Avoid accidentally shipping old or unrelated work.
2. Confirm each included PR was tested and is appropriate for NIGHT production. Avoid adding unapproved or incomplete PRs just because they are open; explicitly honor the user's scope.
3. Resolve conflicts using the actual latest production code. If production moved during preparation, re-integrate and rerun tests. Changes from `mscc/**` or shared modules must not be silently overwritten.
4. Keep secrets, account/session directories, production credentials, and user data out of commits, logs, and PR comments.
5. When a batch is ready, report the **single exact Azure run URL/SHA** to the user for GitHub environment approval. Do not assume that an agent can or should approve production on the user's behalf.
6. Inspect validation, deployment, rollback, and health results before saying **deployed**. If a run fails, diagnose and prepare a corrected batch or a user-authorized retry; never silently request multiple independent production approvals.
7. A user saying "push" for a small fix means **commit/push and prepare review** by default; do not translate it into a standalone production deploy. If the user explicitly asks to ship the collected batch, finish the integration and present the one approval.
8. When a new chat asks why a command is unchanged, distinguish **code in a PR**, **merged into `mscc-azure`**, **waiting for production approval**, and **successfully deployed/tested live**. Report the real state.
9. Other ChatGPT chats do not automatically receive messages about this policy. **The repository documents are the shared source of truth**; an agent working in another chat must fetch them.

## Historical reference only (do not redeploy)

NIGHT Release Batch #1: integrated via PR **#241**, source commit `64dea39b9752a45a7d40f30d19fdf396802739be`, production workflow run `38709930453` (completed successfully). Included the earlier social card fixes and the grouped command/replay/Cortex compatibility updates. This is context, **not** a standing instruction to restart that run.

If this file conflicts with the actual workflow implementation or security requirements, **verify and repair the mismatch in a reviewed PR** before making deployment promises.
