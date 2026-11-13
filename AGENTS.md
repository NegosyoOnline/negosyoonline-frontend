# NegosyoOnline Frontend

## Scope

This repository contains the Vercel-deployed frontend applications for NegosyoOnline:

- `apps/site`: public NegosyoOnline marketing site.
- `apps/dash`: authenticated subscriber dashboard.
- `apps/storefronts`: future customer-facing subscriber storefronts and custom domains.
- `apps/hq`: HQ staff area. Its rules are in `apps/hq/README.md`: no call through Vercel, nothing from another host, no secret in a variable.

This repository is independent from TWCinc. TWCinc code may be read, ported, or copied and adapted to reproduce its process flow exactly, never pasted in unchanged, and TWCinc must never become a runtime dependency. Adapted code is site-scoped, uses NegosyoOnline setting names, and adds dependencies only as needed, pinned in the lockfile; never copy secrets, `.env` files, real customer data, or deployment configuration; record the TWCinc source path in the branch notes or PR (Coach Ed, 2026-11-14).

## Safety

- Keep configuration in environment variables. Never commit credentials, API keys, Blob tokens, or provider keys.
- Vercel projects deploy separately from their respective app directories.
- Do not expose tenant data, billing data, or private-media URLs in browser code.
- The Django backend remains authoritative for identity, tenancy, money, orders, authorization, and webhook processing.

## Workflow

- Every build starts in ClickUp. Coach Ed starts it with `/clickup-coordinator <TASK_ID>`, and the coordinator creates the builder sub-sessions. A session not started that way is either a brainstorming session or a session Coach Ed opened to get data from production. It may read, discuss, plan and report that data, but it does not build a task, and reading production data never extends to changing production state. If asked to build there, say the task needs a detailed ClickUp task and a coordinator session first.
- Use pnpm from the repository root.
- Run the target app's lint and build before deployment review.
- Do not link a Vercel project, add secrets, or deploy without explicit approval.
