---
description: Ship the current frontend change to staging through a PR, wait for the Vercel deploys, then report whether staging deployed
argument-hint: "[check]"
---

Ship the current frontend change to staging and report the result to Coach Ed without being asked again.

Staging deploys automatically when a PR merges to `main`: Vercel builds `negosyoonline-site-staging`, `negosyoonline-dash-staging` and `negosyoonline-storefronts` from `main`. Production is never part of this command.

## Hard limits (never do these here)

- No `v*` tag, no push to the `production` branch, no Vercel project linking or settings changes, no secrets, no repo setting changes (including enabling auto-merge in the repo).
- Never print or commit secrets. Do not bypass branch protection.
- Do not poll GitHub CI (no timers, loops, `gh ... --watch`, repeated status reads). The only waiting allowed is the Vercel wait script below, run once in the background.

## If the argument is `check`

Skip to "Verify and report" using the most recent merged frontend PR (`gh pr list --state merged --limit 1`).

## Otherwise: ship it

1. Inspect `git status` and the diff. If there is nothing to ship, say so and stop. Confirm the change is what Coach Ed asked for and contains no secrets.
2. If on `main`, create a feature branch. Commit with a clear message ending with the required Co-Authored-By line. Push the branch.
3. If app code changed, run `pnpm install --frozen-lockfile`, then lint and build for each affected app (`pnpm --dir apps/<app> lint` and `build`). Stop and report if they fail.
4. Record BEFORE_SHA: `git ls-remote origin refs/heads/main | cut -f1`.
5. Open a ready (not draft) PR into `main` with a short summary and test plan, ending with the required Generated-with line.
6. Bind the PR with `mcp__ccd_pr__get_status` (use `bind_pr` if it is not reported), then enable auto-merge with `mcp__ccd_pr__set_auto_merge` (squash). Coach Ed has standing permission for this once the repo allows auto-merge. If the repo does not allow it, do not change the setting: give Coach Ed the PR link, say auto-merge is off at the repo level, and stop.
7. Start the wait in the background, as a script file and never an inline `bash -c`:
   `bash scripts/wait_vercel_deploy.sh <BEFORE_SHA>` with `run_in_background: true`.
   It returns only when `main` has moved and all three Vercel statuses are in, so it also covers CI and the merge. Tell Coach Ed the PR link and that you are waiting on the deploy, then end the turn. You are notified when the script exits. Do not announce a result before that.

## When the wait script exits (or on `check`)

- Exit 0 `SUCCESS`: go to "Verify and report".
- Exit 2 `FAILED`: report which Vercel project failed. Look up the deployment with the Vercel tools (read-only, list deployments for that project and commit) and give the inspector URL. Do not redeploy.
- Exit 3 (about 20 minutes): read the PR state once and report honestly that it is still in progress: CI stuck or GitHub Actions down (see githubstatus.com), merge pending, or Vercel still building or skipped the build. Tell Coach Ed to run `/push-staging check` later. Never claim a verdict you do not have.

## Verify and report

1. Read the merged PR's merge commit with `gh pr view <n> --json state,mergeCommit`. If it is not merged yet, say so and stop.
2. Read `gh api repos/NegosyoOnline/negosyoonline-frontend/commits/<merge commit>/status`: the `Vercel – negosyoonline-site-staging`, `Vercel – negosyoonline-dash-staging` and `Vercel – negosyoonline-storefronts` statuses must all be `success`. A missing one means Vercel did not build that project for this commit: say so, never assume.
3. Optionally confirm one deployment per project with the Vercel list-deployments tool filtered by sha: state READY.
4. Confirm the hosts respond: `curl -s -o /dev/null -w "%{http_code}" https://www-staging.negosyonline.com/` and `https://dash-staging.negosyonline.com/` must return 200.
5. Report plainly: PR link, merge commit, each Vercel project status, the host results. If anything disagrees or fails, say it failed and what was observed. Never claim success without all three Vercel statuses `success` for the merge commit and both hosts returning 200.
