---
description: Hand over a coordinator session: write its state file and a resume prompt that restores the coordinator role for a ClickUp task
argument-hint: "<CLICKUP_TASK_ID>"
---

Hand over this coordinator session. Write its state file, then print a resume prompt that makes the next session the coordinator for the same ClickUp task.

ClickUp task ID: `$ARGUMENTS`

Use that value wherever this command says `<CLICKUP_TASK_ID>`. If it is empty, do not guess one from the conversation: say `/handover-coordinator <CLICKUP_TASK_ID>` needs the task ID, and stop.

The role instructions themselves are in `.claude/briefs/coordinator.md`. Do not read or copy that file now: the resume prompt points the next session at it.

## Cost rule

This command is run when the context is already large, where every tool call re-bills the whole conversation. One `Write` is the entire budget. Do not run Bash, `git`, `mkdir`, or re-read files to fill it in: everything it needs is already in this conversation.

## Where it goes

`<session folder>/docs/session-state/<name>-<sid8>.md`

- `<session folder>` is this session's working directory. In a worktree that is `<repo>/.claude/worktrees/<worktree_name>`, for example `/Users/edgeronilla/Dev/negosyoonline/negosyoonline-backend/.claude/worktrees/<worktree_name>/docs/session-state/`. In the main checkout it is the repository root.
- `<name>` is the basename of the session folder.
- `<sid8>` is the first 8 characters of this session's id, which appears in the scratchpad directory path. With no scratchpad path, use `<name>-<HHMM>.md` from the current time.
- Write the path absolute, never with `~`. `Write` creates the folder when it is missing.
- Use the session folder even when the work happened in the other repository; the "Work is in" line records where the changes are.

The file lives inside the worktree on purpose: pruning the worktree removes its state files with it. `docs/session-state/` is git-ignored, so the file is never committed. Do not force-add it.

Nothing injects this file into the next session. The resume prompt printed at the end is how the next session finds it, so write the file to be read by a session with no other memory of this work.

## What it is not

Not documentation. `docs/session-state/` holds only these state files. Do not put architecture, specs, plans, or runbooks in it:

- Specs and designs belong in `docs/superpowers/specs/`.
- Implementation plans belong in `docs/superpowers/plans/`.
- Runbooks belong in `docs/runbooks/`.

Never write secrets, tokens, or environment values into it.

## Contents

Write exactly these sections, whole file under 6 KB:

    # Session state: <name>

    Role: coordinator
    ClickUp task: <CLICKUP_TASK_ID>

    ## Resume here
    - Session folder: <absolute path of this session's working directory>
    - Work is in: <absolute path of each checkout or worktree actually edited, with its repo and branch>
    - Open PRs: <full PR URLs with their state, or "none">
    - Local servers: <command and folder for each one this session started, running or stopped, or "none">
    - Coordinator brief: <absolute session folder>/.claude/briefs/coordinator.md
    - First move: <the one thing the next session does first>

    ## Task
    One paragraph: what this session is doing and why.

    ## Coordination record
    - Objective and approved scope, each with its source (task, comment, document).
    - Rulings from Coach Ed, newest last, each with where it was given.
    - Sub-sessions: name, session id, deliverable, status, what it is waiting on.
    - Resolved questions, and decisions still owed by Coach Ed.
    - Approvals given, with their exact action, scope and environment.

    ## Done
    Bullets. What landed and where: merged PR URLs, commits, files with line refs.

    ## Next
    Bullets, in order. The first is what the next session starts on.

    ## Key files
    Absolute paths with line refs. Only what the next session needs.

    ## Open decisions
    Anything waiting on Coach Ed, or on another session. Say who owes what.

    ## Verification still owed
    Tests not run, staging checks not done, things never opened in a browser.

Rules for the content:

- The coordination record carries only what this conversation or its sources actually established. Do not write a ruling, approval or sub-session status from memory of what was probably said.
- The state file does not replace ClickUp. The next session re-reads the task and every subtask before acting.
- Name the repo for every path, branch, and PR. Backend and frontend are separate repositories, and a session started in one often works in the other.
- State local, staging and production separately. Visual checks are done locally first (the `negosyotest.com` and `santetest.com` domains, with the port), then on staging: say which were done where. A merged PR or a green CI run is not a deployment: say what was verified on the staging host and what was not.
- List anything temporary that must be removed later, with the file and the condition for removing it.
- Record each approval Coach Ed gave with its exact action, scope and environment. Per the coordinator brief, an approval still stands after a restart only for that same action, scope and environment; anything wider, and any migration, deploy, variable change or production action it does not name, needs a new approval.

## Finish

Print exactly two things and nothing else:

1. The file path, and that it is safe to `/clear`.
2. A ready-to-copy resume prompt in a plain fenced block (not tagged `bash`; it is a prompt, not a command):

       Resume in <absolute session folder> as the coordinator for ClickUp task <CLICKUP_TASK_ID>.
       Read <absolute state-file path>, then read and follow
       <absolute session folder>/.claude/briefs/coordinator.md with Main ClickUp task: <CLICKUP_TASK_ID>.
       Do not re-explore anything already covered by "## Done".

Say plainly: `/clear`, then paste this. The paste is required: nothing else tells the next session where the state file is.
