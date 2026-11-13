#!/usr/bin/env bash
# Print one "<app>=true|false" line per app, for GitHub Actions job outputs.
# Usage: ci-changed-apps.sh <base-sha> <head-ref>
# An app is selected when a file under apps/<app>/ changed, or when any file
# changed that can affect every build (lockfile, root config, workflows,
# scripts, packages, any unknown path). Only docs/**, .claude/** and root-level
# Markdown files are ignored. When unsure, an app runs.
set -euo pipefail

apps=(site dash storefronts hq)
base="${1:?base sha required}"
head="${2:-HEAD}"

# Space-delimited list of apps with changes (portable: no associative arrays).
selected=" "
all=false

while IFS= read -r f; do
  case "$f" in
    docs/* | .claude/* | *.md) # *.md outside apps/ cannot change a build
      case "$f" in apps/*) ;; *) continue ;; esac
      ;;
  esac
  case "$f" in
    apps/*/*)
      app="${f#apps/}"; app="${app%%/*}"
      case " ${apps[*]} " in
        *" $app "*) selected="$selected$app " ;;
        *) all=true ;; # unknown app directory: run everything
      esac
      ;;
    *) all=true ;;
  esac
done < <(git diff --name-only "$base" "$head")

for a in "${apps[@]}"; do
  case "$all$selected" in
    true*) echo "$a=true" ;;
    *" $a "*) echo "$a=true" ;;
    *) echo "$a=false" ;;
  esac
done
