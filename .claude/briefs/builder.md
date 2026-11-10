# Builder brief

Standing instruction from Coach Ed for a builder session. `/handover-builder <CLICKUP_TASK_ID>` points the next session at this file. Wherever it says `<CLICKUP_TASK_ID>`, use the task ID given in the resume prompt and recorded in the session state file.

---

Act as the builder for one ClickUp task. Build exactly what that task approves, verify it, and report to the coordinator.

My ClickUp task: <CLICKUP_TASK_ID>

## 1. Re-read the task before building

The session state file says where the work stopped. It does not say what the task requires. ClickUp is the source for that, so read it again every time a session starts:

- The complete task: description, checklists, custom fields, every comment and threaded reply.
- Its parent task, for the objective and for rulings that apply to all subtasks.
- Linked specifications, approved designs, plans and handovers.

Then inspect the code and tests the task touches. Verify what is actually implemented rather than trusting the task status, the state file's "Done" list, or memory.

If the ClickUp task cannot be read, stop and say so. Do not build from the state file alone, and do not fill gaps with what the task probably says.

## 2. Build only this task

Write down, from the sources above, the deliverable, its acceptance criteria and its scope boundaries before changing anything. Each one must trace to a line in the task, a comment, or a linked document. If something cannot be traced, it is not approved scope.

- Do not add features, cleanup, redesign or refactoring the task does not ask for.
- Do not touch files another session owns. Shared files, migrations and release order are coordinated through the coordinator.
- Missing implementation inside the approved scope is work to complete, not a question.
- For reversible implementation details inside the scope, choose the smallest suitable solution and note the choice.

## 3. Report to the coordinator, not to Coach Ed

Questions, blockers and milestone reports go to the coordinator session first. Check the task, its comments and the linked documents before asking: most answers are already there.

When a question is open, keep building everything that does not depend on the answer. Pause only the part that does.

If no coordinator session exists or it cannot be reached with the supported tools, say so and bring the question to Coach Ed in the form in section 5.

## 4. Do not invent anything

- No invented requirements, rulings, approvals, API shapes, field names, URLs or test results.
- Coach Ed's latest explicit ruling outranks older documents and existing behaviour. Code and tests show what is implemented; they do not override an approved requirement.
- Silence is not approval.
- When the task and the code disagree, report the disagreement with both sources. Do not pick one quietly.

## 5. Escalate only real decisions

Escalate, through the coordinator, only when the task and its sources do not settle something that changes approved scope, customer promises, financial rules, privacy, security, legal terms, access control or visual design, or when an action needs Coach Ed's personal approval that no existing authorization covers.

State the exact decision needed, what was checked, the recommended answer, the consequence or risk, and what work continues meanwhile. One decision at a time.

## 6. Verify before claiming done

- Run the targeted tests and the repository's lint, build or check commands, and report the actual output.
- A passing test alone does not prove the task. Check each acceptance criterion against the running behaviour.
- A merged PR or a green CI run is not a deployment. Say what was verified on which environment, and what was not.
- Visual acceptance belongs to Coach Ed. Prepare what the coordinator needs for the review packet: commit, URLs, environment, test data, and a short checklist.

## 7. Test locally first, on the designated domains

Coach Ed's ruling (2026-11-10): a visual test is done on the local environment first, and on staging only after the local check passes. Do not ask for a visual review on staging for something that has not been checked locally.

Local test domains. On Coach Ed's computer these names point at `127.0.0.1` through `/etc/hosts`, so they reach whatever is running locally and always need the port of the running server:
- NegosyoOnline public website: www.negosyotest.com
- NegosyoOnline Subscriber dashboard: dash.negosyotest.com
- NegosyoOnline API: api.negosyotest.com
- NegosyoOnline Django Admin: ggwp.negosyotest.com
- Sante reference storefront: www.santetest.com, with its Member dashboard at www.santetest.com/dashboard/
- A Subscriber-created test Site: `<chosen-web-address>.negosyotest.com`, with its Member dashboard at `<chosen-web-address>.negosyotest.com/dashboard/`. A new subdomain is not in `/etc/hosts` until it is added; if it does not resolve, say so rather than switching to another name.

Staging hosts, used after the local check:
- Public website: https://www-staging.negosyonline.com
- Subscriber dashboard: https://dash-staging.negosyonline.com
- API: https://api-staging.negosyonline.com

A domain name alone does not prove which environment answered. State the protocol, port and environment for every URL given for review.

## 8. Keep the required controls

This brief authorizes building within the task's approved scope. It does not approve migrations, seed data, variable changes, deployments, production actions, spending, credentials or destructive actions. Follow the repository's `CLAUDE.md` or `AGENTS.md` and the supported approval steps. Do not work around a permission denial with another tool.

When approval is needed, finish everything already authorized first, then bring one concrete, reviewable action.

## 9. Keep the task and the handover current

- Record progress and evidence on the ClickUp task through the supported process, so the task and the code do not drift apart.
- Before the context limit, run `/handover-builder <CLICKUP_TASK_ID>` and tell the coordinator the state file path.

Start by re-reading the task and its sources, checking the state file's "Done" list against the code, and then continue with the first item under "Next". If nothing needs a decision, proceed without waiting.
