#!/usr/bin/env bash
# Usage: scripts/wait_vercel_deploy.sh <before-main-sha>
# Waits until origin/main moves past <before-main-sha>, then until the three Vercel staging
# projects report a commit status for the new head. Reads GitHub only. Changes nothing.
# Exit 0: all three Vercel statuses are success. Exit 2: any is failure/error.
# Exit 3: not finished at the cap (~20 min). Prints "<STATE> <head-sha-12> <summary>".
set -uo pipefail

before="${1:-}"
case "$before" in ""|*"<"*|*">"*) echo "EMPTY_BEFORE: pass the pre-merge main sha" >&2; exit 1;; esac

repo="NegosyoOnline/negosyoonline-frontend"
cd "$(dirname "$0")/.." || exit 1
attempts=80
delay=15

for i in $(seq 1 "$attempts"); do
  head="$(git ls-remote origin refs/heads/main 2>/dev/null | cut -f1)"
  if [ -n "$head" ] && [ "$head" != "$before" ]; then
    result="$(gh api "repos/$repo/commits/$head/status" 2>/dev/null | python3 -c '
import json, sys
want = ["negosyoonline-site-staging", "negosyoonline-dash-staging", "negosyoonline-storefronts"]
try:
    d = json.load(sys.stdin)
except Exception:
    print("WAIT unreadable"); sys.exit(0)
got = {}
for s in d.get("statuses", []):
    ctx = s.get("context", "")
    if ctx.startswith("Vercel"):
        got[ctx.split("–")[-1].strip()] = s.get("state", "")
summary = ", ".join("%s=%s" % (w, got.get(w, "missing")) for w in want)
if any(got.get(w) in ("failure", "error") for w in want):
    print("FAILED " + summary)
elif all(got.get(w) == "success" for w in want):
    print("SUCCESS " + summary)
else:
    print("WAIT " + summary)
' 2>/dev/null)"
    state="${result%% *}"
    case "$state" in
      SUCCESS) echo "SUCCESS ${head:0:12} ${result#* }"; exit 0;;
      FAILED)  echo "FAILED ${head:0:12} ${result#* }"; exit 2;;
    esac
  fi
  sleep "$delay"
done

echo "STILL_WAITING ${head:0:12} ${result:-main has not moved}"
exit 3
