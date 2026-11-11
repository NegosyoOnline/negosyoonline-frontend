---
description: Hand over a builder session: write its state file and a resume prompt that makes the next session re-read its ClickUp task before building
argument-hint: "<CLICKUP_TASK_ID>"
---

Hand over this builder session. Write its state file, then print a resume prompt that makes the next session re-read its ClickUp task before it builds anything.

ClickUp task ID: `$ARGUMENTS`

Use that value wherever this command says `<CLICKUP_TASK_ID>`. If it is empty, do not guess one from the conversation: say `/handover-builder <CLICKUP_TASK_ID>` needs the task ID, and stop.

The role instructions themselves are in `.claude/briefs/builder.md`. Do not read or copy that file now: the resume prompt points the next session at it.

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

Write exactly these sections, whole file under 5 KB:

    # Session state: <name>

    Role: builder
    ClickUp task: <CLICKUP_TASK_ID>

    ## Resume here
    - Session folder: <absolute path of this session's working directory>
    - Work is in: <absolute path of each checkout or worktree actually edited, with its repo and branch>
    - Open PRs: <full PR URLs with their state, or "none">
    - Local servers: <command and folder for each one this session started, running or stopped, or "none">
    - Builder brief: <absolute session folder>/.claude/briefs/builder.md
    - Coordinator session: <its name and session id, or "none">
    - First move: <the one thing the next session does first>

    ## Task
    One paragraph: what this session is doing and why.

    ## Task as read from ClickUp
    - Deliverable, acceptance criteria and scope boundaries, each with its source (task, comment, document).
    - Rulings that apply, with where each was given.
    - Anything in the task that this session could not read or confirm.

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

- "Task as read from ClickUp" carries only what this session actually read. Mark anything unconfirmed as unconfirmed; never fill a gap with a guess.
- The state file does not replace ClickUp. The next session re-reads the task itself before building.
- Name the repo for every path, branch, and PR. Backend and frontend are separate repositories, and a session started in one often works in the other.
- State local, staging and production separately. Visual checks are done locally first (the `negosyotest.com` and `santetest.com` domains, with the port), then on staging: say which were done where. A merged PR or a green CI run is not a deployment: say what was verified on the staging host and what was not.
- List anything temporary that must be removed later, with the file and the condition for removing it.
- Record approvals Coach Ed gave in this session only as history. They do not carry over: the next session must ask again before a migration, deploy, variable change, or production action.

## Finish

Print exactly two things and nothing else:

1. The file path, and that it is safe to `/clear`.
2. A ready-to-copy resume prompt in a plain fenced block (not tagged `bash`; it is a prompt, not a command):

       Resume in <absolute session folder> as the builder for ClickUp task <CLICKUP_TASK_ID>.
       Read <absolute state-file path>, then read and follow
       <absolute session folder>/.claude/briefs/builder.md with My ClickUp task: <CLICKUP_TASK_ID>.
       Re-read the ClickUp task before building. Do not re-explore anything already covered by "## Done".

Say plainly: `/clear`, then paste this. The paste is required: nothing else tells the next session where the state file is.

One exception to "nothing else" and to the one-`Write` budget: when a coordinator session started this builder, also send it one message with SendMessage, as the builder brief's section 9 says: first line "Handover written, ready to be cleared", then the state file path and the resume prompt. Then stop. The coordinator clears this session and sends the prompt back, so Coach Ed does not have to.
