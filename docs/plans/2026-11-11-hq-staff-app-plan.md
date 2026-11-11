# HQ Staff App (`apps/hq`) Implementation Plan (plan 2 of 11, plan only)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give HQ staff a fourth frontend app, `apps/hq`, whose pages (sign-in, code, second step with the recovery form, the "Sign-in paused" notice, console, sign-out, error page, light theme) call the backend's staff routes straight from the browser with the HQ cookie, in two stages with the staging cookie proof between them.

**Architecture:** Built the way `apps/dash` is: static HTML, CSS and script in `public/`, served by Next.js, with `next.config.ts` giving the routing, the security headers and the CSP. The browser calls `/staff/v1/` on the HQ host with `credentials: "include"`; no Vercel function, route handler, middleware or rewrite sees a code, an address or an answer. The page holds no token and no secret, and follows the backend's answers: it decides nothing about access.

**Tech Stack:** Next.js 16.4.5 (as `apps/dash`), plain browser JavaScript, `node --test` with no extra dependency, pnpm 11.25.0, Node 22.23.1. No new package.

---

Date: 2026-11-11. ClickUp task: z8uq9me128 (https://app.clickup.com/t/z8uq9me128), parent z8uq9md33v.
Plan branch: `claude/z8uq9me128-hq-staff-app-plan`, cut from `origin/main` at `0a943b0`. The build branch will be cut from the latest `origin/main` when this plan is approved.
Status: **plan only. Not approved. Nothing in it is built.** The code in it was written from reading both repositories and has not been run.
Where this file is: this repository has no place for plans (`AGENTS.md` and `README.md` name none, and no `docs/` folder exists on `main`). It is put in `docs/plans/`, as the coordinator said to do in that case.

## 1. Sources

| Short name | Source |
|---|---|
| Task | ClickUp z8uq9me128: description and the latest 25 comments, read 2026-11-11 |
| Build order | The coordinator's comment on z8uq9me128, "Build order for the approved design": this is item 2 |
| Design | Backend repository, `docs/superpowers/specs/2026-11-11-sms-inbox-hq-design.md` on `main`: sections 3.1, 13, 17, 20, 21, 22 |
| Mockup | Backend repository, `docs/superpowers/specs/mockups/2026-11-11-sms-inbox/`: `sign-in.html`, `code.html`, `verify.html`, `console.html`, `mockup.css` |
| Plan 1 | Backend repository, `docs/superpowers/plans/2026-11-11-hq-staff-sign-in-routes-plan.md` on `main`, section 7 (the staging proof) |
| Routes | Backend repository at `main` `8bd7ec3`: `apps/operators/staff_views.py`, `checks.py`, `middleware.py`, `hq_views.py`, `two_step.py`, `templates/hq/*.html`, `docs/runbooks/admin-two-step.md`. **Read as merged code, not from plan 1's text** |
| This repository | `origin/main` `0a943b0`: `AGENTS.md`, `README.md`, `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.github/workflows/ci.yml`, `scripts/wait_vercel_deploy.sh`, and `apps/dash` (config, `public/`, `tests/`) |

### 1.1 Rulings and approvals, in Coach Ed's words

- **R26**, how HQ staff sign in on Vercel: "Okay, just do all the recommended for the these 4 rows, how it works, Django admin, the security, and the build." The recommended column: the forms are Vercel pages; the backend checks the codes as today and sets today's HQ cookie; no token held by the page; no migration. **The cost he accepted with it:** a compromised Vercel deploy of the staff app can capture both codes as they are typed and sign in as that person, for up to 12 hours each time.
- **R27**: "just drop this django admin... dont show this.. you are confused because of this". No page of the staff app links to, frames or names the Django Admin, and no menu has an "Admin lists" or "Lists" item.
- **R28**: "Switch it off". Done by plan 11, last. Nothing in this plan touches it.
- **The look**: "approved the look". Given on dark-theme screenshots at 1280 and 390 pixels of the sign-in page, the code page, the second step and the console. **Not shown to him and so not covered:** the light theme, the recovery form, the "Sign-in paused" notice, the error page.
- **The design**: "approved the design".
- **Plan 1**: "Approve plan 1". It covers building the routes and their reaching staging with `HQ_STAFF_ORIGIN` unset. It does not cover setting that variable, the DNS record, the Vercel page, the names, or production.
- **This plan**: "Write plan 2" (relayed by the coordinator on 2026-11-11; this session did not see it on the Task). It asks for a plan. It approves no code, no Vercel project, no DNS record and no variable.
- **R3 stands**: two-step sign-in, explicit permission, every read and send audited. All of it is the backend's; none of it depends on a page behaving.

## 2. Scope

### 2.1 What is built

| # | Deliverable | Traced to |
|---|---|---|
| 1 | A new app `apps/hq` beside `apps/dash`, `apps/site` and `apps/storefronts`, built the way `apps/dash` is | Design 3.1; build order item 2 |
| 2 | Sign-in, code and second-step pages, the recovery form and the "Sign-in paused" notice, with the Django pages' words | Design 22.3; `templates/hq/` |
| 3 | The console and sign-out | Design 22.3; mockup `console.html` |
| 4 | The error page ("Page not found") and the "not available" state | Design 22.3 |
| 5 | The dark theme and the light theme, the choice remembered in this browser | Design 13, 21.1 |
| 6 | A content security policy that allows script, styles and the font from the app itself only, and calls to the one staff address only | Design 21.1 |
| 7 | A description of the app's Vercel project and every step that needs Coach Ed's own approval (section 8). **None is carried out by building this plan** | Design 21.2 |

### 2.2 What is not built here

| Left out | Where it belongs |
|---|---|
| Inbox pages, and the "Inbox" item of the menu, the search button and the bell | Plan 5 |
| Contacts pages, and the "Contacts" item of the menu | Plan 7 |
| The Bulk SMS page | Plan 9 |
| The host names, turning the Django links, retiring the Django HQ pages | Plan 10 |
| A replacement for each thing only the Django Admin does, and switching the Admin off | Plan 11 |
| Any change to the backend, its routes, its cookie or its checks | Plan 1 (built). This plan edits no backend file |

Not touched: `apps/dash`, `apps/site`, `apps/storefronts`, `.github/workflows/promote-production.yml`.

## 3. What the repositories show, and where they differ from the design

Read, not run. Each row matters to this plan. Rows 1 to 4 are where this repository contradicts the design.

| # | Finding | What the plan does with it |
|---|---|---|
| 1 | **The font.** Design 21.1 and 13 ask that the staff app serve its font from its own host and load nothing from a third host. `apps/dash` and the mockup load Manrope from `fonts.googleapis.com` and `fonts.gstatic.com`, and the dashboard's CSP allows both | `apps/hq` serves one Manrope file from `public/assets/fonts/`. Its CSP has no third host. Getting that file means downloading it once, which the builder asks the coordinator about first (task 2, step 3) |
| 2 | **Inline styles.** Design 21.1 asks for styles "from itself only". The dashboard's CSP has `style-src 'self' 'unsafe-inline'`, and its pages carry `style="…"` attributes | `apps/hq` has `style-src 'self'`, no `style` attribute and no `<style>` block. A test holds it (task 3) |
| 3 | **The theme on a first visit.** Design 13 says the pages use "the dashboard's dark theme with its light theme when the device prefers light", and the mockup's stylesheet follows the device. The dashboard itself does not: by Coach Ed's ruling of 2026-11-10 (z8uq9mach5, in `apps/dash/public/assets/js/theme.js`) it opens in dark on every device unless this browser has a saved choice | `apps/hq` does what the dashboard does: dark unless a choice is saved. The mockup's "follow the device" rule is left out of the stylesheet. Routine choice, listed in 11.1; the design's sentence is the one that is out of date |
| 4 | **The mockup's console has parts that do not exist yet.** Its side menu has Inbox (with an unread count) and Contacts, its top-right has a search button and a bell that both lead to the Inbox, and its phone layout has a three-item bottom bar. None of those pages exists until plans 5 and 7. On a phone the mockup shows no way to sign out: its "Sign out" is in the side menu, which a phone does not show | The console is built with the side menu holding "Admin console" only, the theme button only, no bottom bar, and a "Sign out" button in the console's first card on a phone. Plans 5 and 7 add their items. **This is a visible difference from the screenshots he approved, so the console goes back to him with the four unseen states (section 9)** |
| 5 | **The address typed on `/sign-in/` must be shown on `/code/` from the page's memory only** (design 22.3). Separate HTML files would lose it on the way | `/sign-in/`, `/code/` and `/verify/` are one document, `auth.html`, that changes view in the browser with the History API, as the dashboard routes its sections. After a reload the page says "Code sent to your email." |
| 6 | **The routes as merged** (`staff_views.py` at `8bd7ec3`): `POST sign-in/` 204, 400 `invalid_email`; `POST sign-in/code/` 204, 400 `invalid_code`; `POST sign-in/verify/` 204, 400 `invalid_code`, 403 `sign_in_paused`, 401 `unauthenticated`; `POST sign-out/` 204; `GET me/` 200 `{"email", "expires_at"}`, 401 `unauthenticated` or `second_step_required`; `GET console/` 200 `{"email", "verified_at", "expires_at", "events": [{"action", "surface", "step", "at"}]}`, the same two 401s. A signed-in person calling a sign-in route gets 409 `already_signed_in`. Any call from another origin gets 403 `origin_not_allowed`. The preflight allows the one header `content-type` | The pages send `Content-Type: application/json` and no other header. Section 5 lists what the page does with each answer |
| 7 | **With the routes off** (`HQ_STAFF_ORIGIN` unset, which is staging today) the HQ host answers the plain HTML "Page not found" with no cross-origin header. A browser reports that to the page as a failed call, with no status | The page shows "This page is not available right now.", the HQ host's own words for an error. The same for an unreachable server, a refused origin and a 5xx |
| 8 | **Each app is installed on its own.** CI runs `pnpm install --frozen-lockfile` inside `apps/<app>`, and every app has its own `pnpm-lock.yaml` and `pnpm-workspace.yaml`. The root `pnpm-lock.yaml` also lists each app as an importer, last changed by the foundation commit | `apps/hq` gets its own lockfile, and the root lockfile gains one importer (task 1, with a stop if anything else in it changes) |
| 9 | **The branch protection of `main` requires three checks by name**: "site lint and build", "dash lint and build", "storefronts lint and build" (read with `gh api`, 2026-11-11) | Adding `hq` to the CI matrix makes a fourth check, "hq lint and build". It runs on every PR but is not required until someone with admin rights adds it. That is a repository setting, listed in 8.2 |
| 10 | **`scripts/wait_vercel_deploy.sh` waits for exactly three Vercel projects by name** | Not edited by the build. It gains the staff project only after that project exists (8.2); adding it earlier would make the script wait for a status that never comes |
| 11 | **Local names.** `/etc/hosts` on Coach Ed's computer already has `hq.negosyotest.com` and `ggwp.negosyotest.com` (read 2026-11-11). `hq` is a reserved name in the backend (`apps/sites/subdomains.py`), which the start-up check needs of a staff origin under the site parent | The local check uses `http://hq.negosyotest.com:3003` for the staff app and `http://ggwp.negosyotest.com:8000` for the HQ host, as plan 1's local check did. Plan 1 wrote port 3002 in its example; that is `apps/storefronts`' port, so this plan uses 3003 |
| 12 | **The cookie between the two addresses is still untested.** Plan 1's section 7 has not been run and nothing is approved for it | Section 6: the build stops after the sign-in pages until that proof is shown true |

Nothing else in the design's reading of this repository was found wrong.

## 4. The gate, and the two stages

From plan 1, section 7.5: "No page of plan 2 beyond the sign-in pages is built ... until rows 1 to 9 of 7.1 are shown true", and row 10 (phones) "is run on plan 2's sign-in page as its first staging check".

| Stage | What is built | When |
|---|---|---|
| **A. The sign-in pages** | Tasks 1 to 6: the app, its configuration and CSP, the theme, the client, the sign-in, code and second-step views with the recovery form and the "Sign-in paused" notice, the error page, and one line "Signed in as …" with a "Sign out" button | After this plan is approved |
| **The gate** | Section 6: the Vercel project, its name, the DNS record and `HQ_STAFF_ORIGIN` on staging (each Coach Ed's approval), then plan 1's rows 1 to 9 in computer browsers, then row 10 on an iPhone and an Android phone using stage A's page | After stage A is merged |
| **B. The console** | Tasks 7 and 8: the console page with its shell, and sign-out from it. The "Signed in as …" line of stage A is removed | **Only after every row of the proof is shown true** |

Why stage A has the "Signed in as …" line: a person who passes the second step must land somewhere, and row 10 needs to see, on a phone with no console to type into, that the cookie was stored and sent (the line appears only when `me/` answers 200) and that sign-out works. It is one sentence and one button on the sign-in card. It exists only between the two stages.

**If the proof fails** (any of rows 1 to 8 false in any browser of row 9 or 10): stop. Stage B is not built. The builder reports the row, the browser and its version, and the headers as the browser showed them. What happens next is plan 1's section 7.6: the coordinator asks Coach Ed to delete `HQ_STAFF_ORIGIN`, the Django pages remain the way in, and what to do instead is his decision, of the kind R26 was. This plan chooses nothing for that case. Whether the Vercel project then stays, is paused or is deleted is also his.

## 5. What each page does with each answer

The page never decides who may see what. It asks, and follows the answer.

| Where | Asks | Answer | The page |
|---|---|---|---|
| Any sign-in address, on load | `GET me/` | 200 | Stage A: shows "Signed in as …". Stage B: goes to `/` |
| | | 401 `second_step_required` | Shows the second step, at `/verify/` |
| | | 401 `unauthenticated` | Shows the code form if the address is `/code/`, else the email form at `/sign-in/` |
| | | Anything else, or no answer | "This page is not available right now." |
| Email form | `POST sign-in/` `{"email"}` | 204 | Remembers the address in memory, shows the code form at `/code/` with "If this address is allowed, a code was sent. It expires in 10 minutes." |
| | | 400 | "Enter an email address." |
| Code form | `POST sign-in/code/` `{"code"}` | 204 | Shows the second step at `/verify/` |
| | | 400 | "That code did not work. Check it, or get a new code." |
| Second step, either form | `POST sign-in/verify/` `{"code"}` | 204 | Asks `me/` again and follows it |
| | | 400 | "That code did not work. Try again." |
| | | 403 `sign_in_paused` | The "Sign-in paused" notice |
| | | 401 | Shows the email form |
| Any of the three forms | | 409 `already_signed_in` | Asks `me/` again and follows it |
| | | Anything else, or no answer | "This page is not available right now." |
| Console, on load | `GET console/` | 200 | Shows the address, the two times and the events |
| | | 401 `second_step_required` | Goes to `/verify/` |
| | | 401 `unauthenticated` | Goes to `/sign-in/` |
| | | Anything else, or no answer | "This page is not available right now." |
| "Sign out" | `POST sign-out/` | 204 | Goes to `/sign-in/` |
| | | Anything else, or no answer | "We could not sign you out. Try again." The page does not pretend the session ended |
| Any other address | nothing | | "Page not found" |

Rules that cover every page:

- **Straight to the backend.** Every call is `fetch` from the browser to the staff address with `credentials: "include"`. `apps/hq` has no API route, no middleware and no rewrite to another host. Its one route handler, `/assets/js/config.js`, is the dashboard's pattern: it is made at build time and holds one address.
- **Nothing kept.** The typed address lives in a variable until the tab closes or reloads. Nothing is written to local storage, session storage, a cookie or the page address, except the theme choice (`no_hq_theme`), as on the dashboard. The page writes nothing to the browser console.
- **Nothing in the address.** The paths are `/`, `/sign-in/`, `/code/`, `/verify/`. No query string is read or written.
- **No Django Admin (R27).** No link, no menu item, no words "Admin lists". A test holds it.
- **The words** are the Django pages' own, from `templates/hq/`, except the console's layout, which is the approved mockup's.

## 6. The gate in detail: staging, each step Coach Ed's own approval

**Nothing in this section is approved by approving this plan.** Each row is asked of him one at a time, through the coordinator, who carries out what he approves. The builder changes nothing on Vercel, Railway or DNS.

### 6.1 The name is a setting, and it is not decided

The staff app reads one address, `HQ_STAFF_API_BASE` (task 2). The app's own host name is set only on Vercel and in DNS; no file in the repository holds it. So either arrangement of plan 1's section 7.2 works with the same build:

| | Arrangement A (plan 1 recommends it for the proof; **not ruled**) | Arrangement B |
|---|---|---|
| Staff app on Vercel | `hq-app-staging.negosyonline.com`, until plan 10 | `hq-staging.negosyonline.com` |
| HQ host on Railway | `hq-staging.negosyonline.com`, as today | `hq-api-staging.negosyonline.com` |
| `HQ_STAFF_API_BASE` on the Vercel project | not set: the built-in default is today's staging HQ host | `https://hq-api-staging.negosyonline.com/staff/v1` |

**Which one is his decision. This plan does not make it.** The default in the code (`https://hq-staging.negosyonline.com/staff/v1`) is the staging HQ host as relayed in design 22.5; this session has not seen the variable. If the name is ruled otherwise, it is one Vercel variable, or one line of `hq-env.mjs`.

### 6.2 The steps, in order

| # | Where | What | Approval |
|---|---|---|---|
| 1 | GitHub | Stage A's build PR merged to `main`, reviewed by the Santé/onboarding coordinator and the NPC coordinator | Coach Ed: this plan. The coordinator merges on green CI after the overlap check |
| 2 | Vercel | The project of section 8.1 is made and linked to this repository | Coach Ed |
| 3 | Coach Ed | Which arrangement of names (6.1) | Coach Ed |
| 4 | DNS and Vercel | The staff app's name pointed at the project and added to it | Coach Ed |
| 5 | Vercel | Section 8.1's rows are read on the real project and reported, each as seen | The coordinator reads; nothing changes |
| 6 | Railway, staging | `HQ_STAFF_ORIGIN` set to the staff app's address (plan 1, 7.3 row 4) | Coach Ed |
| 7 | Staging | Plan 1's section 7.4, steps 1 to 8: rows 1 to 9 of the proof, in Chrome, Safari and Firefox on a computer. Step 4's console commands are run on the staff app's sign-in page, which is the page plan 1 asked for at that name | Covered by rows 2 to 6 |
| 8 | Staging | Row 10: on an iPhone in Safari and on an Android phone in Chrome, open the staff app, sign in with both steps, see "Signed in as …", press "Sign out", see the email form. Then on each phone open the address again: the email form, not "Signed in as …" | Covered by rows 2 to 6 |
| 9 | Report | Per browser and per row: what was seen, and which rows were not run | |

Steps 7 and 8 are done by a person who holds an enrolled staging admin identity, with the coordinator. No code or secret is pasted into chat, a ticket or a commit. Stage B starts only when the coordinator says every row was shown true.

## 7. Files

### 7.1 New, all under `apps/hq/`

| File | Responsibility |
|---|---|
| `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.gitignore`, `eslint.config.mjs`, `tsconfig.json`, `AGENTS.md` | The same as `apps/dash`'s, with the name `hq` and port 3003 |
| `README.md` | What the app is, its pages, its one variable, the rules of design 21 |
| `next.config.ts` | Routing, security headers, the CSP |
| `src/lib/hq-env.mjs` | Reads the one address; builds the CSP and the configuration script. Plain JavaScript so the tests can load it |
| `src/app/layout.tsx` | Wraps the framework's own pages only, as in `apps/dash` |
| `src/app/assets/js/config.js/route.ts` | Serves `/assets/js/config.js`, made at build time |
| `public/auth.html` | `/sign-in/`, `/code/`, `/verify/`: the three forms, the paused notice, the "not available" state |
| `public/index.html` | `/`: the console (stage B) |
| `public/not-found.html` | Every other address: "Page not found" |
| `public/assets/css/hq.css` | The approved mockup's stylesheet, with the edits of task 4 |
| `public/assets/fonts/manrope-latin.woff2`, `OFL.txt` | The font and its licence |
| `public/assets/img/` | The three icon files `apps/dash` uses for its tab icon |
| `public/assets/js/theme.js` | Dark unless a choice is saved |
| `public/assets/js/hq.js` | The client: one `call`, where an answer sends a person, the date and name helpers, the theme button |
| `public/assets/js/auth.js` | The sign-in views |
| `public/assets/js/console.js` | The console (stage B) |
| `tests/dom.mjs`, `tests/page.mjs` | A stand-in document and a page loader for `node --test` |
| `tests/env.test.mjs`, `rules.test.mjs`, `theme.test.mjs`, `client.test.mjs`, `auth.test.mjs`, `console.test.mjs` | Section 7.3 |

### 7.2 Shared files the build touches, by name, for the reviewers

| File | Change | Stage |
|---|---|---|
| `package.json` (root) | One added line: `"dev:hq": "pnpm --dir apps/hq dev",` | A |
| `pnpm-lock.yaml` (root) | One added importer, `apps/hq`. Nothing else may change (task 1, step 5) | A |
| `.github/workflows/ci.yml` | `app: [site, dash, storefronts]` becomes `app: [site, dash, storefronts, hq]`. Nothing else | A |
| `README.md` (root) | One added row in the apps table | A |
| `AGENTS.md` (root) | One added line in the scope list | A |
| `pnpm-workspace.yaml` (root) | **Not edited.** It already says `apps/*` | |
| `scripts/wait_vercel_deploy.sh` | **Not edited by the build.** One name added later, only after the Vercel project exists (8.2) | |
| `.github/workflows/promote-production.yml` | Not edited | |

No file of `apps/dash`, `apps/site` or `apps/storefronts` is edited. `tests/dom.mjs` is a copy of `apps/dash/tests/dom.mjs`, not a shared file: the apps share no code today, and this plan does not start that.

**This plan-only PR touches one file, this document, and none of the files above.**

### 7.3 Tests written first

| Test file | Proves |
|---|---|
| `env.test.mjs` | The default address is the staging HQ host; a set value is used with its trailing slash removed; a value that is not an address stops the build; the CSP names the staff address and no third host, and has no `unsafe-inline` |
| `rules.test.mjs` | No file in `public/` names another host; none has an inline script, a `style` attribute or a `<style>` block; storage is touched only by `theme.js`; `fetch` is called only in `hq.js`; nothing reads `document.cookie` or writes to the console; nothing links to or names the Django Admin |
| `theme.test.mjs` | Dark with no saved choice on either device setting; a saved choice wins; blocked storage still works |
| `client.test.mjs` | Every call carries the cookie and no `Authorization`; a body is JSON; 204 is success with no body read; an error's code is read; no answer is status 0; where each `me/` answer sends a person; the date in Manila time; the name and initials |
| `auth.test.mjs` | Every row of section 5 for the sign-in views, the recovery form, the paused notice, the address shown from memory and not after a reload, sign-out |
| `console.test.mjs` | The console's rows of section 5, the event labels, an unknown event left out, both "Sign out" buttons |

---

# Stage A: the sign-in pages

Work in a worktree of this repository on a build branch cut from the latest `origin/main`. Every command is run from the repository root unless it says otherwise.

## Task 1: The app, installed the way `apps/dash` is

**Files:**
- Create: `apps/hq/package.json`, `apps/hq/pnpm-workspace.yaml`, `apps/hq/.gitignore`, `apps/hq/eslint.config.mjs`, `apps/hq/tsconfig.json`, `apps/hq/AGENTS.md`, `apps/hq/src/app/layout.tsx`, `apps/hq/pnpm-lock.yaml`
- Modify: `package.json`, `pnpm-lock.yaml`, `.github/workflows/ci.yml`

- [ ] **Step 1: Copy the files that are the same in every app**

```bash
mkdir -p apps/hq/src/app apps/hq/public apps/hq/tests
cp apps/dash/pnpm-workspace.yaml apps/dash/.gitignore apps/dash/eslint.config.mjs apps/dash/tsconfig.json apps/dash/AGENTS.md apps/hq/
cp apps/dash/src/app/layout.tsx apps/hq/src/app/layout.tsx
```

In `apps/hq/src/app/layout.tsx` change the comment's first words "The public site is" to "The staff app is", and the title `"NegosyoOnline"` to `"NegosyoOnline HQ"`. Nothing else.

- [ ] **Step 2: Write `apps/hq/package.json`**

The same as `apps/dash/package.json` except the name and the port:

```json
{
  "name": "hq",
  "version": "0.1.0",
  "private": true,
  "engines": {
    "node": ">=22.0.0 <25"
  },
  "scripts": {
    "dev": "next dev --webpack --port 3003",
    "build": "next build --webpack",
    "start": "next start",
    "lint": "eslint",
    "test": "node --test \"tests/*.test.mjs\""
  },
  "dependencies": {
    "next": "16.4.5",
    "react": "19.3.0",
    "react-dom": "19.3.0"
  },
  "devDependencies": {
    "@tailwindcss/turbopack": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.4.5",
    "tailwindcss": "^4",
    "typescript": "^5"
  },
  "packageManager": "pnpm@11.25.0"
}
```

- [ ] **Step 3: Make the app's lockfile the same as the dashboard's**

The dependencies are identical, so the lockfile is too. Copying it keeps the exact versions that are already built and deployed:

```bash
cp apps/dash/pnpm-lock.yaml apps/hq/pnpm-lock.yaml
cd apps/hq && pnpm install --frozen-lockfile
```
Expected: the install finishes with no "lockfile is not up to date" error. If it fails, stop and report the message; do not run a plain `pnpm install` to get past it.

- [ ] **Step 4: Add the root script and the CI entry**

In the root `package.json`, after the `"dev:storefronts"` line:

```json
    "dev:hq": "pnpm --dir apps/hq dev",
```

In `.github/workflows/ci.yml`, the one line:

```yaml
        app: [site, dash, storefronts, hq]
```

- [ ] **Step 5: Add the app to the root lockfile, and check nothing else moved**

```bash
pnpm install --lockfile-only
git diff --stat pnpm-lock.yaml
git diff pnpm-lock.yaml | grep -E '^[+-]' | grep -v -E '^(\+\+\+|---)' | grep -c '^-'
```
Expected: the last command prints `0` (no line removed), and the diff is one added `apps/hq:` importer whose versions equal the `apps/dash:` importer's. **If any other importer or any package version changed, restore the file with `git checkout pnpm-lock.yaml`, stop, and tell the coordinator:** the root lockfile is shared with every app.

- [ ] **Step 6: Commit**

```bash
git add apps/hq package.json pnpm-lock.yaml .github/workflows/ci.yml
git commit -m "feat(hq): the staff app's folder, installed as the dashboard is [z8uq9me128]"
```

## Task 2: The one address, the CSP and the routing

**Files:**
- Create: `apps/hq/src/lib/hq-env.mjs`, `apps/hq/src/app/assets/js/config.js/route.ts`, `apps/hq/next.config.ts`, `apps/hq/public/not-found.html`, `apps/hq/public/assets/fonts/manrope-latin.woff2`, `apps/hq/public/assets/fonts/OFL.txt`
- Test: `apps/hq/tests/env.test.mjs`

- [ ] **Step 1: Write the failing test**

`apps/hq/tests/env.test.mjs`:

```js
/* The staff app reads one address and holds no secret (design 21.2). Its CSP allows script, styles and the
   font from itself only, and calls to that one address only (design 21.1). */
import test from "node:test";
import assert from "node:assert/strict";
import { readEnv, buildCsp, configScript } from "../src/lib/hq-env.mjs";

test("with no variable set the address is the staging hq host", () => {
  const env = readEnv({});
  assert.equal(env.staffApi, "https://hq-staging.negosyonline.com/staff/v1");
  assert.equal(env.staffApiOrigin, "https://hq-staging.negosyonline.com");
});

test("a set address is used, trimmed, without its trailing slash", () => {
  const env = readEnv({ HQ_STAFF_API_BASE: " http://ggwp.negosyotest.com:8000/staff/v1/ " });
  assert.equal(env.staffApi, "http://ggwp.negosyotest.com:8000/staff/v1");
  assert.equal(env.staffApiOrigin, "http://ggwp.negosyotest.com:8000");
});

test("a value that is not an address stops the build", () => {
  assert.throws(() => readEnv({ HQ_STAFF_API_BASE: "hq-staging" }));
});

test("the CSP names the staff address and nothing from a third host", () => {
  const csp = buildCsp("https://hq-staging.negosyonline.com");
  assert.deepEqual(csp.split("; "), [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self'",
    "img-src 'self'",
    "connect-src https://hq-staging.negosyonline.com",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ]);
  assert.equal(csp.includes("unsafe-inline"), false);
  assert.equal(csp.includes("fonts.g"), false);
});

test("the configuration script holds the one address and nothing else", () => {
  const script = configScript({ HQ_STAFF_API_BASE: "http://ggwp.negosyotest.com:8000/staff/v1" });
  const window = {};
  new Function("window", script)(window);
  assert.deepEqual(window.NO_HQ_CONFIG, { staffApi: "http://ggwp.negosyotest.com:8000/staff/v1" });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd apps/hq && pnpm test`
Expected: FAIL, "Cannot find module" for `../src/lib/hq-env.mjs`.

- [ ] **Step 3: Write `apps/hq/src/lib/hq-env.mjs`**

```js
/* The staff app's one address. No secrets: anything a page can read is public (design 21.2).
   The default is the staging hq host, so a deploy with no variable set never talks to production.
   Production must set HQ_STAFF_API_BASE in its Vercel project. Read at build time. */

const STAGING_STAFF_API = "https://hq-staging.negosyonline.com/staff/v1";

export function readEnv(env) {
  const staffApi = String(env.HQ_STAFF_API_BASE || STAGING_STAFF_API).trim().replace(/\/+$/, "");
  return { staffApi, staffApiOrigin: new URL(staffApi).origin };
}

/* Script, styles and the font from this app only; calls to the one staff address only; no frame. */
export function buildCsp(staffApiOrigin) {
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self'",
    "img-src 'self'",
    `connect-src ${staffApiOrigin}`,
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

export function configScript(env) {
  const config = { staffApi: readEnv(env).staffApi };
  return `/* Deployment configuration. Generated from environment variables; contains no secrets. */
window.NO_HQ_CONFIG = ${JSON.stringify(config, null, 2)};
`;
}
```

- [ ] **Step 4: Run the test and see it pass**

Run: `cd apps/hq && pnpm test`
Expected: 5 tests pass.

- [ ] **Step 5: Write the route that serves the configuration**

`apps/hq/src/app/assets/js/config.js/route.ts`:

```ts
import { configScript } from "@/lib/hq-env.mjs";

/* Serves /assets/js/config.js, the one address the static pages load first. Made at build time from
   HQ_STAFF_API_BASE (see src/lib/hq-env.mjs). It contains no secrets, and no request data reaches it. */

const body = configScript(process.env);

export function GET() {
  return new Response(body, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600, must-revalidate",
    },
  });
}
```

- [ ] **Step 6: Write `apps/hq/next.config.ts`**

```ts
import type { NextConfig } from "next";
import { buildCsp, readEnv } from "./src/lib/hq-env.mjs";

/* The staff app is static HTML in /public, as the dashboard is. This file gives it the routing, the
   security headers and the CSP. It has no rewrite to another host: the browser calls the hq host
   itself, so nothing a staff member types or reads passes through Vercel (design 21.1). */

const { staffApiOrigin } = readEnv(process.env);

/* One document for the three sign-in addresses; it changes view in the browser. */
const authPaths = ["sign-in", "code", "verify"];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  trailingSlash: true,
  async rewrites() {
    return {
      beforeFiles: [
        /* Stage A: the first page is the sign-in document. Stage B points it at the console. */
        { source: "/", destination: "/auth.html" },
        ...authPaths.map((page) => ({ source: `/${page}/`, destination: "/auth.html" })),
      ],
      afterFiles: [],
      /* Real files and /assets/js/config.js are served first; every other address is "Page not found". */
      fallback: [{ source: "/:path*", destination: "/not-found.html" }],
    };
  },
  async redirects() {
    return [{ source: "/auth.html", destination: "/sign-in/", permanent: false }];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Robots-Tag", value: "noindex" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Cache-Control", value: "no-store" },
          { key: "Content-Security-Policy", value: buildCsp(staffApiOrigin) },
        ],
      },
      {
        source: "/assets/(.*)",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
```

The header list is the dashboard's, with `X-Robots-Tag` added and the staff CSP. The `Strict-Transport-Security` line is the dashboard's own, unchanged.

- [ ] **Step 7: The font, which needs the coordinator's word first**

The font is the one file the dashboard's pages load today from Google: Manrope, latin, weights 200 to 800 in one file, under the SIL Open Font License. **Before downloading, send the coordinator the file's address, its size and where it goes, and wait for a yes.** To find the address:

```bash
curl -s -A 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap' | grep -A8 '/\* latin \*/'
```
Expected: one `@font-face` block for latin with a `src: url(https://fonts.gstatic.com/s/manrope/…​.woff2)` and `font-weight: 400` or a range. Report that address. After the yes, download that one file into a new empty folder under the scratch folder, check it is a font, and copy it in:

```bash
file /path/to/scratch/font/manrope.woff2
shasum -a 256 /path/to/scratch/font/manrope.woff2
mkdir -p apps/hq/public/assets/fonts
cp /path/to/scratch/font/manrope.woff2 apps/hq/public/assets/fonts/manrope-latin.woff2
```
Expected: `Web Open Font Format (Version 2)`. Put the licence text beside it as `apps/hq/public/assets/fonts/OFL.txt` (the "SIL Open Font License 1.1" with Manrope's copyright line, from the same source). Write the address, the size and the SHA-256 in the build PR's description. **If Google's answer gives one file per weight instead of one file with a range, stop and report it:** task 4's `@font-face` rule assumes one file.

If the coordinator says no: the pages use the system font the stylesheet already falls back to, which changes the look he approved, so that goes to Coach Ed as a decision before stage A is shown to him.

- [ ] **Step 8: Write the error page**

`apps/hq/public/not-found.html`:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Page not found | NegosyoOnline HQ</title>
<meta name="robots" content="noindex">
<meta name="referrer" content="no-referrer">
<link rel="icon" type="image/svg+xml" href="/assets/img/negosyoonline-favicon.svg?v=20261111a">
<script src="/assets/js/theme.js?v=20261111a"></script>
<link rel="stylesheet" href="/assets/css/hq.css?v=20261111a">
</head>
<body class="dash-app">
<a class="skip" href="#main">Skip to content</a>
<div class="auth">
  <header class="auth-top dash-chrome">
    <a class="wordmark" href="/" aria-label="NegosyoOnline HQ"><svg viewBox="0 0 224 200" aria-hidden="true" focusable="false"><path fill="#FFFFFF" d="M0 0H64L160 103V0H224V200H160L64 97V200H0Z"/><path fill="#C59A3B" d="M64 0L160 103V200L64 97Z"/></svg><span>NegosyoOnline</span></a>
    <div class="top-actions"><span class="chip chip-info">Staff only</span><button type="button" class="icon-btn" id="theme-toggle" aria-label="Switch between dark and light theme"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg></button></div>
  </header>
  <main class="auth-main" id="main">
    <section class="dash-card form-card auth-card" aria-labelledby="nf-h">
      <h1 id="nf-h">Page not found</h1>
      <p class="auth-link"><a href="/">Go to the admin console</a></p>
    </section>
  </main>
</div>
<script src="/assets/js/config.js"></script>
<script src="/assets/js/hq.js?v=20261111a"></script>
</body>
</html>
```

The page says the same words for every unknown address and calls nothing. It answers with status 200, as the dashboard's fallback does: Next.js serves a file from `public/` and cannot give it a 404 status. Listed in 11.1.

- [ ] **Step 9: Commit**

```bash
git add apps/hq
git commit -m "feat(hq): one address, a CSP with no third host, the routing and the error page [z8uq9me128]"
```

## Task 3: The rules test

**Files:**
- Test: `apps/hq/tests/rules.test.mjs`

- [ ] **Step 1: Write the test**

```js
/* Rules of design section 21 and of R27 that a later edit could break without anyone seeing.
   They are checked on the files as they are served, in public/. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

function files(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files(full, out);
    else if (/\.(html|js|css)$/.test(entry.name)) out.push(full);
  }
  return out;
}
const all = files(PUBLIC).map((file) => ({ name: path.relative(PUBLIC, file), text: fs.readFileSync(file, "utf8") }));
const named = (re) => all.filter((f) => re.test(f.text)).map((f) => f.name);

test("there are pages to check", () => {
  assert.ok(all.some((f) => f.name === "auth.html"));
  assert.ok(all.some((f) => f.name === path.join("assets", "js", "hq.js")));
});

test("no file names another host", () => {
  assert.deepEqual(named(/https?:\/\/|["'(]\/\/[a-z]/i), []);
});

test("no inline script, style attribute or style block, which the CSP would refuse", () => {
  const pages = all.filter((f) => f.name.endsWith(".html"));
  assert.deepEqual(pages.filter((f) => /<script(?![^>]*\bsrc=)[^>]*>/i.test(f.text)).map((f) => f.name), []);
  assert.deepEqual(pages.filter((f) => /\sstyle=|<style/i.test(f.text)).map((f) => f.name), []);
  assert.deepEqual(pages.filter((f) => /\son[a-z]+=/i.test(f.text)).map((f) => f.name), []);
});

test("only theme.js touches storage, and nothing reads cookies or writes to the console", () => {
  assert.deepEqual(named(/localStorage/), [path.join("assets", "js", "theme.js")]);
  assert.deepEqual(named(/sessionStorage|indexedDB|document\.cookie|console\./), []);
});

test("only hq.js calls the backend", () => {
  assert.deepEqual(named(/\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/), [path.join("assets", "js", "hq.js")]);
});

test("nothing links to or names the Django Admin (R27)", () => {
  assert.deepEqual(named(/admin lists|django admin|\/admin\/|>\s*Lists\s*</i), []);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd apps/hq && pnpm test`
Expected: FAIL in "there are pages to check", "only theme.js touches storage" and "only hq.js calls the backend": the files they name do not exist yet. The file goes green in task 6.

- [ ] **Step 3: Commit**

```bash
git add apps/hq/tests/rules.test.mjs
git commit -m "test(hq): the rules of design 21 and R27 on the served files [z8uq9me128]"
```

## Task 4: The look and the theme

**Files:**
- Create: `apps/hq/public/assets/css/hq.css`, `apps/hq/public/assets/js/theme.js`, `apps/hq/public/assets/img/` (three files)
- Test: `apps/hq/tests/theme.test.mjs`

- [ ] **Step 1: Write the failing theme test**

Copy the dashboard's test and change its three names:

```bash
sed -e 's/no_dash_theme/no_hq_theme/g' -e 's/NODashTheme/NOHqTheme/g' -e 's/the dashboard opens in dark/the staff app opens in dark, as the dashboard does,/' apps/dash/tests/theme.test.mjs > apps/hq/tests/theme.test.mjs
```

Run: `cd apps/hq && pnpm test`
Expected: FAIL, `ENOENT` for `public/assets/js/theme.js`.

- [ ] **Step 2: Write the theme script**

The dashboard's, with its key and its name changed:

```bash
mkdir -p apps/hq/public/assets/js apps/hq/public/assets/css apps/hq/public/assets/img
sed -e 's/no_dash_theme/no_hq_theme/g' -e 's/NODashTheme/NOHqTheme/g' -e 's/^\/\* Dashboard theme\./\/* Staff app theme, the dashboard'"'"'s rule./' -e 's/before dash\.css/before hq.css/' apps/dash/public/assets/js/theme.js > apps/hq/public/assets/js/theme.js
grep -c 'no_hq_theme' apps/hq/public/assets/js/theme.js
```
Expected: `2` or more, and `grep -c Dash apps/hq/public/assets/js/theme.js` prints `0`.

Run: `cd apps/hq && pnpm test`
Expected: the 7 theme tests pass.

- [ ] **Step 3: Copy the icons**

```bash
cp apps/dash/public/assets/img/negosyoonline-favicon.svg apps/dash/public/assets/img/icon-32.png apps/dash/public/assets/img/icon-180.png apps/hq/public/assets/img/
```

- [ ] **Step 4: Take the approved stylesheet**

The look Coach Ed approved is the mockup's stylesheet in the backend repository. Copy it as it is on that repository's `main` (replace the path with the backend checkout on this computer):

```bash
git -C /path/to/negosyoonline-backend fetch origin
git -C /path/to/negosyoonline-backend show origin/main:docs/superpowers/specs/mockups/2026-11-11-sms-inbox/mockup.css > apps/hq/public/assets/css/hq.css
```

Then make exactly these five edits to `apps/hq/public/assets/css/hq.css`, and no other:

1. Replace the three-line comment at the top with:

```css
/* The staff app's stylesheet. The look is the Subscriber dashboard's, as drawn in the approved mockup
   (backend repository, docs/superpowers/specs/mockups/2026-11-11-sms-inbox/mockup.css, ClickUp z8uq9me128).
   Rules for pages that later plans build (inbox, contacts, bulk) are kept so those plans add no second copy. */

@font-face {
  font-family: "Manrope";
  font-style: normal;
  font-weight: 200 800;
  font-display: swap;
  src: url("/assets/fonts/manrope-latin.woff2") format("woff2");
}
[hidden] { display: none !important; }
```

2. Delete the whole block that begins `@media (prefers-color-scheme: light) {` and holds `html:not([data-theme]) body.dash-app { … }`, to its closing brace. `theme.js` always sets `data-theme`, so the block could never apply (finding 3).

3. Delete the two rules that begin `.mock-note` and, in the rule `.auth-card, .auth-main .mock-note { width: 100%; max-width: 440px; }`, the words `, .auth-main .mock-note`.

4. After the rule `.field-err { … }` add:

```css
.auth-card .note-warn { padding: 12px 14px; border: 1px solid var(--err-line); border-radius: 10px; background: var(--err-bg); color: var(--err-text); }
```

5. At the end of the file add:

```css
/* The console on a phone: "Sign out" sits in the first card, since the side menu is not shown. */
.phone-only { display: none; }
@media (max-width: 899.98px) { .phone-only { display: inline-flex; } }
```

- [ ] **Step 5: Check no third host is left in it**

```bash
grep -n -E 'https?://|mock' apps/hq/public/assets/css/hq.css
```
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add apps/hq
git commit -m "feat(hq): the approved look, its own font, dark unless a choice is saved [z8uq9me128]"
```

## Task 5: The client

**Files:**
- Create: `apps/hq/tests/dom.mjs`, `apps/hq/tests/page.mjs`, `apps/hq/public/assets/js/hq.js`
- Test: `apps/hq/tests/client.test.mjs`

- [ ] **Step 1: The stand-in document and the page loader**

```bash
cp apps/dash/tests/dom.mjs apps/hq/tests/dom.mjs
```

`apps/hq/tests/page.mjs`:

```js
/* Opens the staff app's scripts in a bare context with a stand-in document, so a page can be driven with
   node --test: a list of element ids, the address, and what the backend answers. No DOM library. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDocument } from "./dom.mjs";

const JS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "assets", "js");
export const BASE = "http://hq-api.test/staff/v1";

/* answers(call) gives [status, body], or "offline" for a call that never gets an answer. */
export function open(files, { ids = [], pathname = "/sign-in/", answers } = {}) {
  const doc = makeDocument();
  const node = {};
  for (const id of ids) {
    const n = doc.createElement("div");
    n.setAttribute("id", id);
    n.hidden = true;
    doc.body.appendChild(n);
    node[id] = n;
  }
  const calls = [];
  const heard = {};
  const location = { pathname, assigned: null, replaced: null,
    assign(u) { this.assigned = u; }, replace(u) { this.replaced = u; } };
  const history = { pushState(s, t, u) { location.pathname = u; }, replaceState(s, t, u) { location.pathname = u; } };
  const window = { NO_HQ_CONFIG: { staffApi: BASE }, addEventListener(type, fn) { heard[type] = fn; } };
  const fetch = (url, opts) => {
    const call = { url, method: opts.method, credentials: opts.credentials, headers: opts.headers,
      body: opts.body ? JSON.parse(opts.body) : undefined };
    calls.push(call);
    const reply = answers(call);
    if (reply === "offline") return Promise.reject(new Error("offline"));
    const [status, body] = reply;
    return Promise.resolve({ ok: status >= 200 && status < 300, status,
      json: () => (body === undefined ? Promise.reject(new Error("no body")) : Promise.resolve(body)) });
  };
  const context = vm.createContext({ window, document: doc, location, history, fetch, Intl, console, setTimeout, clearTimeout });
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(JS, f), "utf8"), context, { filename: f });
  return { doc, node, calls, location, heard, window };
}

/* Lets every answered call and what follows it finish. */
export async function settle() {
  for (let i = 0; i < 8; i++) await new Promise((done) => setImmediate(done));
}

export const refused = (code) => ({ error: { code, message: "A message the page does not show." } });
```

- [ ] **Step 2: Write the failing test**

`apps/hq/tests/client.test.mjs`:

```js
/* hq.js: the one way the staff app calls the backend. The hq cookie rides every call and the page never
   sees it; the page holds no token (R26). */
import test from "node:test";
import assert from "node:assert/strict";
import { open, BASE, refused } from "./page.mjs";

const client = (reply) => open(["hq.js"], { answers: () => reply }).window.NOHq;

test("a read carries the cookie, no Authorization header and no content type", async () => {
  const page = open(["hq.js"], { answers: () => [200, { email: "a@b.co" }] });
  const res = await page.window.NOHq.call("GET", "me/");
  assert.equal(page.calls[0].url, BASE + "/me/");
  assert.equal(page.calls[0].method, "GET");
  assert.equal(page.calls[0].credentials, "include");
  assert.equal(page.calls[0].headers, undefined);
  assert.equal(res.ok, true);
  assert.equal(res.data.email, "a@b.co");
});

test("a body is sent as JSON with the one header the backend's preflight allows", async () => {
  const page = open(["hq.js"], { answers: () => [204] });
  await page.window.NOHq.call("POST", "sign-in/", { email: "a@b.co" });
  assert.deepEqual(Object.keys(page.calls[0].headers), ["Content-Type"]);
  assert.equal(page.calls[0].headers["Content-Type"], "application/json");
  assert.deepEqual(page.calls[0].body, { email: "a@b.co" });
});

test("a 204 is success and no body is read", async () => {
  const res = await client([204]).call("POST", "sign-out/");
  assert.equal(res.ok, true);
  assert.equal(res.status, 204);
  assert.equal(res.code, "");
});

test("a refusal gives its status and code, and never its body as data", async () => {
  const res = await client([403, refused("sign_in_paused")]).call("POST", "sign-in/verify/", { code: "1" });
  assert.equal(res.ok, false);
  assert.equal(res.status, 403);
  assert.equal(res.code, "sign_in_paused");
  assert.equal(JSON.stringify(res.data), "{}");
});

test("no answer, and an answer that is not JSON, are told apart from a refusal", async () => {
  const none = await client("offline").call("GET", "me/");
  assert.equal(none.status, 0);
  assert.equal(none.ok, false);
  const html = await client([404]).call("GET", "me/");
  assert.equal(html.status, 404);
  assert.equal(html.code, "");
});

test("where the backend's answer sends a person", () => {
  const H = client([204]);
  assert.equal(H.placeFor({ ok: true, status: 200, code: "" }), "console");
  assert.equal(H.placeFor({ ok: false, status: 401, code: "second_step_required" }), "verify");
  assert.equal(H.placeFor({ ok: false, status: 401, code: "unauthenticated" }), "sign-in");
  for (const res of [{ ok: false, status: 0, code: "" }, { ok: false, status: 403, code: "origin_not_allowed" },
    { ok: false, status: 404, code: "" }, { ok: false, status: 500, code: "server_error" },
    { ok: false, status: 401, code: "" }]) {
    assert.equal(H.placeFor(res), "down");
  }
});

test("a time is shown in Manila, in the Django pages' form", () => {
  const H = client([204]);
  assert.equal(H.when("2026-11-11T09:02:00+08:00"), "11 Nov 2026, 9:02 AM");
  assert.equal(H.when("2026-11-11T13:01:00+00:00"), "11 Nov 2026, 9:01 PM");
  assert.equal(H.when(""), "");
  assert.equal(H.when("not a time"), "");
});

test("the name and initials come from the address", () => {
  const H = client([204]);
  assert.equal(JSON.stringify(H.who("sample.staff@example.com")), JSON.stringify({ name: "sample.staff", initials: "SS" }));
  assert.equal(H.who("ana@example.com").initials, "A");
  assert.equal(H.who("").initials, "");
});

test("there is no token helper", () => {
  const H = client([204]);
  assert.equal(H.getToken, undefined);
  assert.equal(H.setToken, undefined);
});
```

Run: `cd apps/hq && pnpm test`
Expected: FAIL, `ENOENT` for `public/assets/js/hq.js`.

- [ ] **Step 3: Write `apps/hq/public/assets/js/hq.js`**

```js
/* The staff app's client. No dependencies, no secrets, no token: the hq cookie signs every call and this
   page cannot read it (R26). Every call goes from the browser to the hq host itself; nothing passes
   through this app's own server (design 21.1). The page decides nothing about access: it follows the answer. */
(function () {
  var cfg = window.NO_HQ_CONFIG || {};

  /* Resolves {ok, status, code, data}. status 0 means no answer could be read: the server was not reached,
     or the staff routes are off and the hq host answered a page this origin may not read. */
  function call(method, path, body) {
    var opts = { method: method, credentials: "include" };
    if (body) { opts.headers = { "Content-Type": "application/json" }; opts.body = JSON.stringify(body); }
    return fetch(cfg.staffApi + "/" + path, opts)
      .then(function (r) {
        if (r.status === 204) return { ok: true, status: 204, code: "", data: {} };
        return r.json().catch(function () { return {}; }).then(function (data) {
          var e = data && data.error;
          return { ok: r.ok, status: r.status, code: e && typeof e.code === "string" ? e.code : "", data: r.ok ? data || {} : {} };
        });
      })
      .catch(function () { return { ok: false, status: 0, code: "", data: {} }; });
  }

  /* Which page the answer to me/ or console/ leads to: "console", "verify", "sign-in", or "down" when the
     answer is none of the three the backend gives a staff page. */
  function placeFor(res) {
    if (res.ok) return "console";
    if (res.status === 401 && res.code === "second_step_required") return "verify";
    if (res.status === 401 && res.code === "unauthenticated") return "sign-in";
    return "down";
  }

  /* "11 Nov 2026, 9:02 AM", in Manila, as the Django console wrote it. */
  function when(iso) {
    var d = new Date(iso), p = {};
    if (!iso || isNaN(d.getTime())) return "";
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", day: "numeric", month: "short", year: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
    return p.day + " " + p.month + " " + p.year + ", " + p.hour + ":" + p.minute + " " + p.dayPeriod;
  }

  /* The part of the address before the @, and the first letters of its first two words. */
  function who(email) {
    var name = String(email || "").split("@")[0], parts = name.split(/[._-]+/).filter(Boolean);
    return { name: name, initials: ((parts[0] || "").charAt(0) + (parts[1] || "").charAt(0)).toUpperCase() };
  }

  /* The theme buttons. theme.js owns the choice and its storage. */
  ["theme-toggle", "theme-toggle-2"].forEach(function (id) {
    var b = document.getElementById(id), api = window.NOHqTheme;
    if (!b) return;
    if (!api) { b.hidden = true; return; }
    b.addEventListener("click", function () { api.set(api.current() === "dark" ? "light" : "dark"); });
  });

  window.NOHq = { cfg: cfg, call: call, placeFor: placeFor, when: when, who: who };
})();
```

- [ ] **Step 4: Run the test and see it pass**

Run: `cd apps/hq && pnpm test`
Expected: the 9 client tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/hq
git commit -m "feat(hq): the client, with the cookie on every call and no token [z8uq9me128]"
```

## Task 6: The sign-in views

**Files:**
- Create: `apps/hq/public/auth.html`, `apps/hq/public/assets/js/auth.js`, `apps/hq/README.md`
- Modify: `README.md`, `AGENTS.md`
- Test: `apps/hq/tests/auth.test.mjs`

- [ ] **Step 1: Write the failing test**

`apps/hq/tests/auth.test.mjs`:

```js
/* auth.js: the sign-in, code and second-step views, the recovery form and the "Sign-in paused" notice
   (design 22.3). The page shows what the backend's answer leads to and checks no code itself. */
import test from "node:test";
import assert from "node:assert/strict";
import { open, settle, BASE, refused } from "./page.mjs";

const VIEWS = ["sign-in", "code", "verify", "paused", "signed-in", "down"];
const IDS = ["boot", ...VIEWS.map((v) => "v-" + v), "email", "email-err", "code", "code-err", "code-sent",
  "code-notice", "second", "second-err", "second-label", "second-lead", "second-switch", "who", "sign-out",
  "sign-out-err", "theme-toggle"];
const SIGNED_OUT = [401, refused("unauthenticated")];
const HALFWAY = [401, refused("second_step_required")];
const SIGNED_IN = [200, { email: "sample.staff@example.com", expires_at: "2026-11-11T21:01:00+08:00" }];

/* table: "METHOD path" to a list of answers, used in order; the last one repeats. */
async function page(pathname, table) {
  const p = open(["hq.js", "auth.js"], { ids: IDS, pathname, answers: (call) => {
    const list = table[call.method + " " + call.url.slice(BASE.length + 1)];
    assert.ok(list, "unexpected call: " + call.method + " " + call.url);
    return list.length > 1 ? list.shift() : list[0];
  } });
  await settle();
  p.shown = () => VIEWS.filter((v) => !p.node["v-" + v].hidden);
  p.submit = async (view, field, value) => {
    p.node[field].value = value;
    const event = p.node["v-" + view].fire("submit");
    assert.equal(event.prevented, true, "the browser must not send the form itself");
    await settle();
  };
  p.posts = () => p.calls.filter((c) => c.method === "POST");
  return p;
}

test("a signed-out person sees the email form, and the page asked only me/", async () => {
  const p = await page("/sign-in/", { "GET me/": [SIGNED_OUT] });
  assert.deepEqual(p.shown(), ["sign-in"]);
  assert.equal(p.node.boot.hidden, true);
  assert.deepEqual(p.calls.map((c) => c.method + " " + c.url), ["GET " + BASE + "/me/"]);
  assert.equal(p.calls[0].credentials, "include");
});

test("a person who passed the first step is taken to the second, whatever address they opened", async () => {
  const p = await page("/sign-in/", { "GET me/": [HALFWAY] });
  assert.deepEqual(p.shown(), ["verify"]);
  assert.equal(p.location.pathname, "/verify/");
});

test("a signed-out person who opens the second step is taken to the email form", async () => {
  const p = await page("/verify/", { "GET me/": [SIGNED_OUT] });
  assert.deepEqual(p.shown(), ["sign-in"]);
  assert.equal(p.location.pathname, "/sign-in/");
});

test("stage A: a signed-in person sees who they are", async () => {
  const p = await page("/", { "GET me/": [SIGNED_IN] });
  assert.deepEqual(p.shown(), ["signed-in"]);
  assert.equal(p.node.who.textContent, "Signed in as sample.staff@example.com. Two-step sign-in verified.");
});

test("no answer, a refused origin and a server error all show the same plain state", async () => {
  for (const reply of ["offline", [403, refused("origin_not_allowed")], [500, refused("server_error")], [404]]) {
    const p = await page("/sign-in/", { "GET me/": [reply] });
    assert.deepEqual(p.shown(), ["down"]);
  }
});

test("the email form sends the address, then shows the code form with the address from memory", async () => {
  const p = await page("/sign-in/", { "GET me/": [SIGNED_OUT], "POST sign-in/": [[204]] });
  await p.submit("sign-in", "email", "  Sample.Staff@example.com ");
  assert.deepEqual(p.posts()[0].body, { email: "Sample.Staff@example.com" });
  assert.deepEqual(p.shown(), ["code"]);
  assert.equal(p.location.pathname, "/code/");
  assert.equal(p.node["code-sent"].textContent, "Code sent to Sample.Staff@example.com.");
  assert.equal(p.node["code-notice"].hidden, false);
});

test("after a reload on /code/ the page does not know the address", async () => {
  const p = await page("/code/", { "GET me/": [SIGNED_OUT] });
  assert.deepEqual(p.shown(), ["code"]);
  assert.equal(p.node["code-sent"].textContent, "Code sent to your email.");
  assert.equal(p.node["code-notice"].hidden, true);
});

test("an empty address is not sent, and a refused one shows the Django page's words", async () => {
  const p = await page("/sign-in/", { "GET me/": [SIGNED_OUT], "POST sign-in/": [[400, refused("invalid_email")]] });
  await p.submit("sign-in", "email", "   ");
  assert.equal(p.posts().length, 0);
  assert.equal(p.node["email-err"].textContent, "Enter an email address.");
  await p.submit("sign-in", "email", "not-an-address");
  assert.equal(p.posts().length, 1);
  assert.deepEqual(p.shown(), ["sign-in"]);
  assert.equal(p.node["email-err"].hidden, false);
  assert.equal(p.node.email.getAttribute("aria-invalid"), "true");
});

test("a code that is not six digits is not sent; a wrong one says so without a reason", async () => {
  const p = await page("/code/", { "GET me/": [SIGNED_OUT], "POST sign-in/code/": [[400, refused("invalid_code")]] });
  await p.submit("code", "code", "12 34");
  assert.equal(p.posts().length, 0);
  await p.submit("code", "code", "123 456");
  assert.deepEqual(p.posts()[0].body, { code: "123456" });
  assert.deepEqual(p.shown(), ["code"]);
  assert.equal(p.node["code-err"].textContent, "That code did not work. Check it, or get a new code.");
});

test("a right code shows the second step", async () => {
  const p = await page("/code/", { "GET me/": [SIGNED_OUT], "POST sign-in/code/": [[204]] });
  await p.submit("code", "code", "123456");
  assert.deepEqual(p.shown(), ["verify"]);
  assert.equal(p.location.pathname, "/verify/");
  assert.equal(p.node["second-label"].textContent, "Authenticator code");
});

test("a right second step asks me/ again and follows it", async () => {
  const p = await page("/verify/", { "GET me/": [HALFWAY, SIGNED_IN], "POST sign-in/verify/": [[204]] });
  await p.submit("verify", "second", "654321");
  assert.deepEqual(p.posts()[0].body, { code: "654321" });
  assert.deepEqual(p.shown(), ["signed-in"]);
});

test("a wrong second step says so; the fifth shows the paused notice; a lost session returns to the start", async () => {
  const wrong = await page("/verify/", { "GET me/": [HALFWAY], "POST sign-in/verify/": [[400, refused("invalid_code")]] });
  await wrong.submit("verify", "second", "000000");
  assert.deepEqual(wrong.shown(), ["verify"]);
  assert.equal(wrong.node["second-err"].textContent, "That code did not work. Try again.");

  const paused = await page("/verify/", { "GET me/": [HALFWAY], "POST sign-in/verify/": [[403, refused("sign_in_paused")]] });
  await paused.submit("verify", "second", "000000");
  assert.deepEqual(paused.shown(), ["paused"]);

  const lost = await page("/verify/", { "GET me/": [HALFWAY], "POST sign-in/verify/": [[401, refused("unauthenticated")]] });
  await lost.submit("verify", "second", "000000");
  assert.deepEqual(lost.shown(), ["sign-in"]);
});

test("the recovery form sends its code to the same route", async () => {
  const p = await page("/verify/", { "GET me/": [HALFWAY, SIGNED_IN], "POST sign-in/verify/": [[204]] });
  const click = p.node["second-switch"].fire("click");
  assert.equal(click.prevented, true);
  assert.equal(p.node["second-label"].textContent, "Recovery code");
  assert.equal(p.node["second-lead"].textContent, "Enter one of your 10 recovery codes. Each code works once.");
  assert.equal(p.node["second-switch"].textContent, "Use your authenticator app instead");
  assert.equal(p.node.second.getAttribute("maxlength"), "12");
  await p.submit("verify", "second", " ABCD-EFGH ");
  assert.deepEqual(p.posts()[0].body, { code: "ABCD-EFGH" });
  assert.equal(p.posts()[0].url, BASE + "/sign-in/verify/");
});

test("someone already signed in who sends a form is taken where me/ says", async () => {
  const p = await page("/sign-in/", { "GET me/": [SIGNED_OUT, SIGNED_IN], "POST sign-in/": [[409, refused("already_signed_in")]] });
  await p.submit("sign-in", "email", "a@b.co");
  assert.deepEqual(p.shown(), ["signed-in"]);
});

test("stage A: sign-out returns to the email form, and a failed one says so", async () => {
  const ok = await page("/", { "GET me/": [SIGNED_IN], "POST sign-out/": [[204]] });
  ok.node["sign-out"].fire("click");
  await settle();
  assert.deepEqual(ok.shown(), ["sign-in"]);
  assert.equal(ok.posts()[0].body, undefined);

  const failed = await page("/", { "GET me/": [SIGNED_IN], "POST sign-out/": ["offline"] });
  failed.node["sign-out"].fire("click");
  await settle();
  assert.deepEqual(failed.shown(), ["signed-in"]);
  assert.equal(failed.node["sign-out-err"].hidden, false);
});

test("the back button asks the backend again", async () => {
  const p = await page("/sign-in/", { "GET me/": [SIGNED_OUT, HALFWAY] });
  p.heard.popstate();
  await settle();
  assert.deepEqual(p.shown(), ["verify"]);
});
```

Run: `cd apps/hq && pnpm test`
Expected: FAIL, `ENOENT` for `public/assets/js/auth.js`.

- [ ] **Step 2: Write `apps/hq/public/assets/js/auth.js`**

```js
/* The staff sign-in: /sign-in/, /code/ and /verify/ are one document that changes view here, so the
   address a person typed can be shown on the code form from memory alone. It is never put in an address,
   a cookie or storage, and is gone after a reload (design 22.3). The backend checks every code and sets
   the cookie; this page follows its answers and decides nothing about access. */
(function () {
  var H = window.NOHq, $ = function (id) { return document.getElementById(id); };
  var VIEWS = ["sign-in", "code", "verify", "paused", "signed-in", "down"];
  var PATHS = { "sign-in": "/sign-in/", "code": "/code/", "verify": "/verify/" };
  var TITLES = { "sign-in": "Sign in", "code": "Enter your code", "verify": "Two-step sign-in",
    "paused": "Sign-in paused", "signed-in": "Signed in", "down": "Not available" };
  var WRONG_EMAIL = "Enter an email address.";
  var WRONG_CODE = "That code did not work. Check it, or get a new code.";
  var WRONG_SECOND = "That code did not work. Try again.";
  var email = "", fresh = false, recovery = false, busy = false;

  /* Marks a field wrong with the words to show, or clears it. The backend gives no reason, so neither does this. */
  function fail(field, text) {
    var box = $(field + "-err");
    box.textContent = text;
    box.hidden = !text;
    if (text) { $(field).setAttribute("aria-invalid", "true"); $(field).focus(); }
    else $(field).removeAttribute("aria-invalid");
  }

  function paintSecond() {
    var f = $("second");
    $("second-lead").textContent = recovery ? "Enter one of your 10 recovery codes. Each code works once."
      : "Enter the 6-digit code from your authenticator app.";
    $("second-label").textContent = recovery ? "Recovery code" : "Authenticator code";
    $("second-switch").textContent = recovery ? "Use your authenticator app instead" : "Use a recovery code instead";
    f.value = "";
    f.setAttribute("maxlength", recovery ? "12" : "6");
    f.setAttribute("inputmode", recovery ? "text" : "numeric");
    f.setAttribute("autocomplete", recovery ? "off" : "one-time-code");
    f.setAttribute("autocapitalize", recovery ? "characters" : "none");
    f.setAttribute("class", recovery ? "input" : "input code");
    fail("second", "");
    f.focus();
  }

  function show(view, push) {
    var path = PATHS[view];
    VIEWS.forEach(function (v) { $("v-" + v).hidden = v !== view; });
    $("boot").hidden = true;
    document.title = TITLES[view] + " | NegosyoOnline HQ";
    if (path && location.pathname !== path) {
      try { history[push ? "pushState" : "replaceState"](null, "", path); } catch (e) { /* the view still shows */ }
    }
    if (view === "sign-in") { fail("email", ""); $("email").focus(); }
    if (view === "code") {
      $("code-notice").hidden = !fresh;
      fresh = false;
      $("code-sent").textContent = email ? "Code sent to " + email + "." : "Code sent to your email.";
      $("code").value = "";
      fail("code", "");
      $("code").focus();
    }
    if (view === "verify") { recovery = false; paintSecond(); }
  }

  /* Stage A only: one line that shows the cookie was stored and sent. Stage B replaces the body of this
     function with location.replace("/") and removes the view. */
  function signedIn(address) {
    $("who").textContent = "Signed in as " + address + ". Two-step sign-in verified.";
    $("sign-out-err").hidden = true;
    show("signed-in");
  }

  function start() {
    H.call("GET", "me/").then(function (res) {
      var place = H.placeFor(res);
      if (place === "console") { signedIn(res.data.email || ""); return; }
      if (place === "verify" || place === "down") { show(place); return; }
      show(location.pathname === "/code/" ? "code" : "sign-in");
    });
  }

  function send(path, body, field, wrong, then) {
    if (busy) return;
    busy = true;
    H.call("POST", path, body).then(function (res) {
      busy = false;
      if (res.status === 204) { then(); return; }
      if (res.status === 409) { start(); return; }
      if (res.status === 400) { fail(field, wrong); return; }
      if (res.status === 403 && res.code === "sign_in_paused") { show("paused"); return; }
      if (res.status === 401) { show("sign-in"); return; }
      show("down");
    });
  }

  $("v-sign-in").addEventListener("submit", function (e) {
    var typed = $("email").value.trim();
    e.preventDefault();
    if (!typed) { fail("email", WRONG_EMAIL); return; }
    send("sign-in/", { email: typed }, "email", WRONG_EMAIL, function () { email = typed; fresh = true; show("code", true); });
  });

  $("v-code").addEventListener("submit", function (e) {
    var typed = $("code").value.replace(/\s+/g, "");
    e.preventDefault();
    if (!/^\d{6}$/.test(typed)) { fail("code", WRONG_CODE); return; }
    send("sign-in/code/", { code: typed }, "code", WRONG_CODE, function () { show("verify", true); });
  });

  $("v-verify").addEventListener("submit", function (e) {
    var typed = $("second").value.trim();
    e.preventDefault();
    if (!typed) { fail("second", WRONG_SECOND); return; }
    send("sign-in/verify/", { code: typed }, "second", WRONG_SECOND, start);
  });

  $("second-switch").addEventListener("click", function (e) {
    e.preventDefault();
    recovery = !recovery;
    paintSecond();
  });

  $("sign-out").addEventListener("click", function () {
    H.call("POST", "sign-out/").then(function (res) {
      if (res.status === 204) { email = ""; show("sign-in", true); return; }
      $("sign-out-err").hidden = false;
    });
  });

  window.addEventListener("popstate", start);
  start();
})();
```

- [ ] **Step 3: Run the test and see it pass**

Run: `cd apps/hq && pnpm test`
Expected: the 16 auth tests pass. If a test fails because the test is wrong about the behaviour of section 5, say so and correct the test to section 5, not the script to the test.

- [ ] **Step 4: Write `apps/hq/public/auth.html`**

The markup is the mockup's `sign-in.html`, `code.html` and `verify.html` in one document, with the Django pages' words for the states the mockup did not draw.

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Sign in | NegosyoOnline HQ</title>
<meta name="robots" content="noindex">
<meta name="referrer" content="no-referrer">
<link rel="icon" type="image/svg+xml" href="/assets/img/negosyoonline-favicon.svg?v=20261111a">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/img/icon-32.png?v=20261111a">
<link rel="apple-touch-icon" href="/assets/img/icon-180.png?v=20261111a">
<script src="/assets/js/theme.js?v=20261111a"></script>
<link rel="stylesheet" href="/assets/css/hq.css?v=20261111a">
</head>
<body class="dash-app">
<a class="skip" href="#main">Skip to content</a>
<div class="auth">
  <header class="auth-top dash-chrome">
    <a class="wordmark" href="/sign-in/" aria-label="NegosyoOnline HQ"><svg viewBox="0 0 224 200" aria-hidden="true" focusable="false"><path fill="#FFFFFF" d="M0 0H64L160 103V0H224V200H160L64 97V200H0Z"/><path fill="#C59A3B" d="M64 0L160 103V200L64 97Z"/></svg><span>NegosyoOnline</span></a>
    <div class="top-actions"><span class="chip chip-info">Staff only</span><button type="button" class="icon-btn" id="theme-toggle" aria-label="Switch between dark and light theme"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg></button></div>
  </header>
  <main class="auth-main" id="main" aria-live="polite">
    <p class="dash-copy" id="boot">Loading...</p>
    <noscript><p class="dash-copy">This page needs JavaScript to sign you in.</p></noscript>

    <form class="dash-card form-card auth-card" id="v-sign-in" aria-labelledby="h-sign-in" novalidate hidden>
      <h1 id="h-sign-in">Admin sign-in</h1>
      <p class="dash-copy">Enter your admin email. We will send you a 6-digit code.</p>
      <div class="field"><label for="email">Email</label><input class="input" id="email" type="email" autocomplete="email" autocapitalize="none" spellcheck="false" maxlength="254" aria-describedby="email-err"><p class="field-err" id="email-err" hidden></p></div>
      <button class="no-btn no-btn-primary" type="submit">Send code</button>
    </form>

    <form class="dash-card form-card auth-card" id="v-code" aria-labelledby="h-code" novalidate hidden>
      <h1 id="h-code">Enter your code</h1>
      <div class="banner" role="status" id="code-notice" hidden><p>If this address is allowed, a code was sent. It expires in 10 minutes.</p></div>
      <p class="dash-copy" id="code-sent">Code sent to your email.</p>
      <div class="field"><label for="code">6-digit code</label><input class="input code" id="code" type="text" inputmode="numeric" maxlength="7" autocomplete="one-time-code" aria-describedby="code-err code-hint"><p class="field-err" id="code-err" hidden></p><p class="hint" id="code-hint">Check your inbox and spam folder.</p></div>
      <button class="no-btn no-btn-primary" type="submit">Continue</button>
      <p class="auth-link"><a href="/sign-in/">Use a different email or get a new code</a></p>
    </form>

    <form class="dash-card form-card auth-card" id="v-verify" aria-labelledby="h-verify" novalidate hidden>
      <h1 id="h-verify">Two-step sign-in</h1>
      <p class="dash-copy" id="second-lead">Enter the 6-digit code from your authenticator app.</p>
      <div class="field"><label for="second" id="second-label">Authenticator code</label><input class="input code" id="second" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" autocapitalize="none" spellcheck="false" aria-describedby="second-err"><p class="field-err" id="second-err" hidden></p></div>
      <button class="no-btn no-btn-primary" type="submit">Verify</button>
      <p class="auth-link"><a href="/verify/" id="second-switch">Use a recovery code instead</a></p>
    </form>

    <section class="dash-card form-card auth-card" id="v-paused" aria-labelledby="h-paused" hidden>
      <h1 id="h-paused">Sign-in paused</h1>
      <p class="note-warn" role="alert">Too many wrong codes. Sign-in is paused for 15 minutes.</p>
      <p class="dash-copy">We sent an email about this to your admin address. If this was not you, tell the admin owner.</p>
      <p class="auth-link"><a href="/sign-in/">Back to sign-in</a></p>
    </section>

    <section class="dash-card form-card auth-card" id="v-signed-in" aria-labelledby="h-signed-in" hidden>
      <h1 id="h-signed-in">Signed in</h1>
      <p class="dash-copy" id="who"></p>
      <button class="no-btn no-btn-ghost" type="button" id="sign-out">Sign out</button>
      <p class="field-err" id="sign-out-err" role="alert" hidden>We could not sign you out. Try again.</p>
    </section>

    <section class="dash-card form-card auth-card" id="v-down" aria-labelledby="h-down" hidden>
      <h1 id="h-down">This page is not available right now.</h1>
      <p class="auth-link"><a href="/sign-in/">Try again</a></p>
    </section>
  </main>
</div>
<script src="/assets/js/config.js"></script>
<script src="/assets/js/hq.js?v=20261111a"></script>
<script src="/assets/js/auth.js?v=20261111a"></script>
</body>
</html>
```

The code field's `maxlength` is 7 so that a code pasted as "123 456" fits; the script removes the space.

- [ ] **Step 5: Write `apps/hq/README.md`**

```markdown
# NegosyoOnline HQ staff app

The staff area. Static HTML, CSS and JavaScript in `public/`, built the way `apps/dash` is: Next.js only serves it, and `next.config.ts` supplies the routing, the security headers and the CSP.

Staff sign in here with an emailed code and an authenticator or recovery code. **The backend checks every code and sets the session cookie. This app checks nothing, holds no token and no secret, and cannot read the cookie.**

## Rules (design sections 20 and 21, ClickUp z8uq9me128)

- The browser calls the staff routes on the hq host directly. This app has no API route, no middleware and no rewrite to another host, and must not gain one: nothing a staff member types or reads may pass through Vercel.
- Nothing is loaded from another host. The font is in `public/assets/fonts/`. The CSP allows script, styles and the font from this app only, and calls to the one staff address only.
- No inline script, `style` attribute or `<style>` block. No analytics, error reporting or session recording.
- Nothing is kept in the browser but the theme. No number, name, address or code in a page address, a query string, storage or the console.
- No page links to or names the Django Admin.
- Environment variables hold addresses only. Never a secret, token or key.

`tests/rules.test.mjs` holds these on the served files.

## Pages

| Path | File |
| --- | --- |
| `/sign-in/`, `/code/`, `/verify/` | `public/auth.html`, `assets/js/auth.js` |
| `/` | the admin console |
| any other path | `public/not-found.html` |

Shared: `assets/js/hq.js` (the client), `assets/js/theme.js`, `assets/css/hq.css`.

## Configuration

`/assets/js/config.js` is generated at build time by `src/app/assets/js/config.js/route.ts` from one variable (`src/lib/hq-env.mjs`):

| Variable | Default (staging) |
| --- | --- |
| `HQ_STAFF_API_BASE` | `https://hq-staging.negosyonline.com/staff/v1` |

The CSP `connect-src` follows it. The backend must name this app's address in `HQ_STAFF_ORIGIN`; no preview address is ever allowed there. Changing the variable changes where staff codes are sent, so it needs Coach Ed's approval.

## Local preview

```bash
HQ_STAFF_API_BASE=http://ggwp.negosyotest.com:8000/staff/v1 pnpm build
pnpm start --port 3003
```

Open http://hq.negosyotest.com:3003/sign-in/ (local, http, port 3003). It needs the backend running locally with `HQ_HOST=ggwp.negosyotest.com` and `HQ_STAFF_ORIGIN=http://hq.negosyotest.com:3003`.

Tests: `pnpm test` (`node --test`, no extra dependency).
```

- [ ] **Step 6: The two root documents**

In the root `README.md`, add one row to the apps table after the `apps/storefronts` row:

```markdown
| `apps/hq` | HQ staff area | `pnpm dev:hq` |
```

In the root `AGENTS.md`, add one line to the scope list after the `apps/storefronts` line:

```markdown
- `apps/hq`: HQ staff area. Its rules are in `apps/hq/README.md`: no call through Vercel, nothing from another host, no secret in a variable.
```

- [ ] **Step 7: Run everything CI runs**

```bash
cd apps/hq && pnpm lint && pnpm test && pnpm build
```
Expected: lint with no error; every test passes, `rules.test.mjs` included; the build finishes. The build is the first time `next.config.ts` and the route load `hq-env.mjs`: **if Next.js cannot load the `.mjs` file from either, stop and report the message** rather than changing the file's form on your own.

- [ ] **Step 8: Commit**

```bash
git add apps/hq README.md AGENTS.md
git commit -m "feat(hq): the sign-in, code and second-step pages, the recovery form and the paused notice [z8uq9me128]"
```

## Task 6b: Check stage A locally, then report

Local first (builder brief, section 7). **This proves the pages against the real routes over http. It cannot prove the cookie between two https addresses: locally `DEBUG` is on, so the cookies are `no_hq` and `no_hq_pre` and are not `Secure`. Only section 6 can.**

- [ ] **Step 1: Run the backend** in a checkout of the backend repository at `origin/main`, with a local enrolled admin identity (`docs/runbooks/admin-two-step.md`, "Commands"). The emailed code is printed in the server's log.

```bash
HQ_HOST=ggwp.negosyotest.com HQ_STAFF_ORIGIN=http://hq.negosyotest.com:3003 uv run python manage.py runserver 8000
```
Expected: no `hq-staff-origin-refused:` line in the log. If there is one, report the line and stop.

- [ ] **Step 2: Run the staff app**

```bash
cd apps/hq && HQ_STAFF_API_BASE=http://ggwp.negosyotest.com:8000/staff/v1 pnpm build && pnpm start --port 3003
```

- [ ] **Step 3: Read the headers**

```bash
curl -s -D - -o /dev/null http://hq.negosyotest.com:3003/sign-in/ | grep -i -E '^(HTTP|content-security-policy|cache-control|x-frame-options|x-robots-tag)'
```
Expected: `200`; the CSP of task 2 with `connect-src http://ggwp.negosyotest.com:8000`; `no-store`; `DENY`; `noindex`.

- [ ] **Step 4: Walk the path in a browser** at `http://hq.negosyotest.com:3003/` (local, http, port 3003), with the developer tools open. For each row write what was seen:

| # | Do | Expected |
|---|---|---|
| 1 | Open `/` signed out | The email form at `/sign-in/`. The console panel shows no CSP refusal and no error |
| 2 | Send the address; type the code from the server's log | The code form with the address shown; then the second step |
| 3 | Reload on `/code/` before typing the code | "Code sent to your email.", no notice |
| 4 | "Use a recovery code instead" | The recovery form; the link reads "Use your authenticator app instead" |
| 5 | A right authenticator code | "Signed in as …" |
| 6 | Reload; open `/sign-in/` and `/verify/` | "Signed in as …" each time |
| 7 | "Sign out"; then reload | The email form both times |
| 8 | Sign in to the second step; type five wrong codes | "That code did not work. Try again." four times, then "Sign-in paused" |
| 9 | Open `/anything-else/` | "Page not found" |
| 10 | Stop the backend; open `/sign-in/` | "This page is not available right now." |
| 11 | The theme button on any page; reload | The light theme, kept after the reload |
| 12 | The Network panel, for the whole walk | Every call goes to `ggwp.negosyotest.com:8000`; none to port 3003 other than page files; none to any other host. The Application panel shows `no_hq_theme` in local storage and nothing else |

- [ ] **Step 5: Capture what goes to Coach Ed** (section 9), and **report** to the coordinator: each command with its real output, each row as seen, and what was not checked.

- [ ] **Step 6: Open stage A's build PR.** Before it: fetch `origin/main` and bring the branch up to date; re-run task 6 step 7; list the open PRs with their files and tell the coordinator of any that touch a file of 7.2. Title with `[z8uq9me128]`. The Santé/onboarding coordinator and the NPC coordinator review before it merges. **Stage B does not start with this merge.**

---

# Stage B: the console. Only after the gate of section 6

Do not start until the coordinator says rows 1 to 10 of the proof were shown true. Cut a new build branch from the latest `origin/main`.

## Task 7: The console

**Files:**
- Create: `apps/hq/public/index.html`, `apps/hq/public/assets/js/console.js`
- Test: `apps/hq/tests/console.test.mjs`

- [ ] **Step 1: Write the failing test**

`apps/hq/tests/console.test.mjs`:

```js
/* console.js: the admin console (design 22.3). It shows the person's own sign-in events from the backend
   and writes nothing. It has no card, link or menu item for the Django Admin (R27). */
import test from "node:test";
import assert from "node:assert/strict";
import { open, settle, BASE, refused } from "./page.mjs";

const IDS = ["boot", "v-console", "v-down", "who-h", "times", "events", "events-empty", "acct-ini", "acct-name",
  "acct-btn", "sign-out", "sign-out-2", "sign-out-err", "theme-toggle", "theme-toggle-2"];
const CONSOLE = { email: "sample.staff@example.com", verified_at: "2026-11-11T09:02:00+08:00",
  expires_at: "2026-11-11T21:01:00+08:00", events: [
    { action: "admin_sign_in_ok", surface: "hq", step: "totp", at: "2026-11-11T09:02:00+08:00" },
    { action: "admin_sign_in_failed", surface: "hq", step: "recovery", at: "2026-11-11T09:01:00+08:00" },
    { action: "admin_sign_out", surface: "hq", step: null, at: "2026-11-10T18:40:00+08:00" },
    { action: "admin_locked", surface: "hq", step: "totp", at: "2026-11-09T14:22:00+08:00" },
    { action: "something_new", surface: "hq", step: null, at: "2026-11-09T14:00:00+08:00" },
  ] };

async function page(table) {
  const p = open(["hq.js", "console.js"], { ids: IDS, pathname: "/", answers: (call) => {
    const reply = table[call.method + " " + call.url.slice(BASE.length + 1)];
    assert.ok(reply, "unexpected call: " + call.method + " " + call.url);
    return reply;
  } });
  await settle();
  return p;
}

test("the console shows who is signed in, the two times and their events", async () => {
  const p = await page({ "GET console/": [200, CONSOLE] });
  assert.equal(p.node["v-console"].hidden, false);
  assert.equal(p.node.boot.hidden, true);
  assert.equal(p.node["who-h"].textContent, "Signed in as sample.staff@example.com");
  assert.equal(p.node.times.textContent, "Verified at 11 Nov 2026, 9:02 AM. Session ends 11 Nov 2026, 9:01 PM.");
  assert.equal(p.node["acct-ini"].textContent, "SS");
  assert.equal(p.node["acct-name"].textContent, "sample.staff");
  const rows = p.node.events.children.map((li) => li.textContent);
  assert.deepEqual(rows, [
    "Signed inAdmin console · authenticator code11 Nov 2026, 9:02 AM",
    "Wrong codeAdmin console · recovery code11 Nov 2026, 9:01 AM",
    "Signed outAdmin console10 Nov 2026, 6:40 PM",
    "Sign-in pausedAdmin console · authenticator code9 Nov 2026, 2:22 PM",
  ]);
  assert.equal(p.node["events-empty"].hidden, true);
  assert.deepEqual(p.calls.map((c) => c.method + " " + c.url), ["GET " + BASE + "/console/"]);
});

test("no events shows the Django page's words", async () => {
  const p = await page({ "GET console/": [200, { ...CONSOLE, events: [] }] });
  assert.equal(p.node["events-empty"].hidden, false);
  assert.equal(p.node.events.hidden, true);
});

test("a person who is not signed in is sent where the answer says, and sees nothing", async () => {
  const out = await page({ "GET console/": [401, refused("unauthenticated")] });
  assert.equal(out.location.replaced, "/sign-in/");
  assert.equal(out.node["v-console"].hidden, true);
  const half = await page({ "GET console/": [401, refused("second_step_required")] });
  assert.equal(half.location.replaced, "/verify/");
});

test("no answer shows the plain state and goes nowhere", async () => {
  const p = await page({ "GET console/": "offline" });
  assert.equal(p.node["v-down"].hidden, false);
  assert.equal(p.location.replaced, null);
});

test("either Sign out button ends the session and returns to sign-in; a failed one says so", async () => {
  for (const id of ["sign-out", "sign-out-2"]) {
    const p = await page({ "GET console/": [200, CONSOLE], "POST sign-out/": [204] });
    p.node[id].fire("click");
    await settle();
    assert.equal(p.location.assigned, "/sign-in/");
  }
  const failed = await page({ "GET console/": [200, CONSOLE], "POST sign-out/": [500, refused("server_error")] });
  failed.node["sign-out"].fire("click");
  await settle();
  assert.equal(failed.location.assigned, null);
  assert.equal(failed.node["sign-out-err"].hidden, false);
});
```

Run: `cd apps/hq && pnpm test`
Expected: FAIL, `ENOENT` for `public/assets/js/console.js`.

- [ ] **Step 2: Write `apps/hq/public/assets/js/console.js`**

```js
/* The admin console: who is signed in, when the session ends, and that person's last sign-in events, as
   the backend gives them. It writes nothing. The labels are the Django console's own words. */
(function () {
  var H = window.NOHq, $ = function (id) { return document.getElementById(id); };
  var EVENT = { admin_sign_in_ok: "Signed in", admin_sign_in_failed: "Wrong code", admin_locked: "Sign-in paused",
    admin_sign_out: "Signed out" };
  var SURFACE = { hq: "Admin console", django_admin: "Operator admin" };
  var STEP = { email: "email code", totp: "authenticator code", recovery: "recovery code" };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    n.setAttribute("class", cls);
    if (text != null) n.textContent = text;
    return n;
  }

  /* One event, or null for an action this page has no words for: a raw value is never shown. */
  function row(e) {
    var label = Object.prototype.hasOwnProperty.call(EVENT, e.action) ? EVENT[e.action] : null;
    if (!label) return null;
    var where = [SURFACE[e.surface], STEP[e.step]].filter(Boolean).join(" · ");
    var li = el("li", "event"), main = el("span", "item-main"), time = el("time", "item-time", H.when(e.at));
    main.appendChild(el("span", "item-num", label));
    if (where) main.appendChild(el("span", "item-sub", where));
    time.setAttribute("datetime", String(e.at || ""));
    li.appendChild(main);
    li.appendChild(time);
    return li;
  }

  function paint(d) {
    var me = H.who(d.email), list = $("events");
    $("who-h").textContent = "Signed in as " + (d.email || "");
    $("times").textContent = "Verified at " + H.when(d.verified_at) + ". Session ends " + H.when(d.expires_at) + ".";
    $("acct-ini").textContent = me.initials;
    $("acct-btn").textContent = me.initials;
    $("acct-btn").setAttribute("aria-label", "Signed in as " + me.name);
    $("acct-name").textContent = me.name;
    list.textContent = "";
    (Array.isArray(d.events) ? d.events : []).forEach(function (e) {
      var li = row(e || {});
      if (li) list.appendChild(li);
    });
    list.hidden = list.children.length === 0;
    $("events-empty").hidden = list.children.length > 0;
    $("boot").hidden = true;
    $("v-console").hidden = false;
  }

  ["sign-out", "sign-out-2"].forEach(function (id) {
    $(id).addEventListener("click", function () {
      H.call("POST", "sign-out/").then(function (res) {
        if (res.status === 204) { location.assign("/sign-in/"); return; }
        $("sign-out-err").hidden = false;
      });
    });
  });

  H.call("GET", "console/").then(function (res) {
    var place = H.placeFor(res);
    if (place === "console") { paint(res.data); return; }
    if (place === "verify") { location.replace("/verify/"); return; }
    if (place === "sign-in") { location.replace("/sign-in/"); return; }
    $("boot").hidden = true;
    $("v-down").hidden = false;
  });
})();
```

- [ ] **Step 3: Run the test and see it pass**

Run: `cd apps/hq && pnpm test`
Expected: the 5 console tests pass.

- [ ] **Step 4: Write `apps/hq/public/index.html`**

The mockup's `console.html`, less what plans 5 and 7 add (finding 4): the side menu has "Admin console" only; the top-right has the theme button only; there is no bottom bar; "Sign out" is also in the first card on a phone.

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Admin console | NegosyoOnline HQ</title>
<meta name="robots" content="noindex">
<meta name="referrer" content="no-referrer">
<link rel="icon" type="image/svg+xml" href="/assets/img/negosyoonline-favicon.svg?v=20261111a">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/img/icon-32.png?v=20261111a">
<link rel="apple-touch-icon" href="/assets/img/icon-180.png?v=20261111a">
<script src="/assets/js/theme.js?v=20261111a"></script>
<link rel="stylesheet" href="/assets/css/hq.css?v=20261111b">
</head>
<body class="dash-app">
<a class="skip" href="#main">Skip to content</a>
<div class="app">
  <aside class="side dash-chrome" aria-label="HQ navigation">
    <a class="wordmark" href="/" aria-label="NegosyoOnline HQ home"><svg viewBox="0 0 224 200" aria-hidden="true" focusable="false"><path fill="#FFFFFF" d="M0 0H64L160 103V0H224V200H160L64 97V200H0Z"/><path fill="#C59A3B" d="M64 0L160 103V200L64 97Z"/></svg><span>NegosyoOnline</span></a>
    <div class="side-sep"></div>
    <div class="ws"><span class="ws-tile" aria-hidden="true">HQ</span><span class="ws-text"><span class="ws-name">NegosyoOnline HQ</span><span class="chip chip-info">Staff only</span></span></div>
    <div class="side-sep"></div>
    <nav class="side-nav" aria-label="HQ sections">
      <a href="/" aria-current="page"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 11l8-7 8 7v9H4z"/></svg>Admin console</a>
    </nav>
    <div class="side-foot">
      <div class="acct-row"><span class="acct-row-ini" aria-hidden="true" id="acct-ini"></span><span class="acct-row-text"><span class="acct-row-name" id="acct-name"></span><span class="acct-row-sub">Two-step sign-in verified</span></span></div>
      <button type="button" class="no-btn no-btn-ghost" id="sign-out"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9"/></svg>Sign out</button>
    </div>
  </aside>
  <header class="topbar dash-chrome">
    <a class="wordmark" href="/" aria-label="NegosyoOnline HQ home"><svg viewBox="0 0 224 200" aria-hidden="true" focusable="false"><path fill="#FFFFFF" d="M0 0H64L160 103V0H224V200H160L64 97V200H0Z"/><path fill="#C59A3B" d="M64 0L160 103V200L64 97Z"/></svg><span>NegosyoOnline</span></a>
    <div class="top-actions"><button type="button" class="icon-btn" id="theme-toggle" aria-label="Switch between dark and light theme"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg></button><span class="acct-btn" id="acct-btn"></span></div>
  </header>
  <div class="col">
    <div class="desk-switch"><button type="button" class="icon-btn" id="theme-toggle-2" aria-label="Switch between dark and light theme"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg></button></div>
    <main class="view" id="main" aria-live="polite">
      <div class="view-head"><div class="head-row"><h1>Admin console</h1></div></div>
      <p class="dash-copy" id="boot">Loading...</p>
      <noscript><p class="dash-copy">This page needs JavaScript.</p></noscript>
      <div class="view" id="v-console" hidden>
        <section class="dash-card" aria-labelledby="who-h">
          <div class="batch-title"><h2 id="who-h"></h2><span class="chip chip-ok"><span class="dot" aria-hidden="true"></span>Two-step sign-in verified</span></div>
          <p class="small" id="times"></p>
          <p><button type="button" class="no-btn no-btn-ghost phone-only" id="sign-out-2">Sign out</button></p>
          <p class="field-err" id="sign-out-err" role="alert" hidden>We could not sign you out. Try again.</p>
        </section>
        <section class="dash-card list-card" aria-labelledby="events-h">
          <div class="list-head"><h2 id="events-h">Recent sign-in activity</h2><span class="small">Your last 10 sign-in events.</span></div>
          <ol class="list" id="events"></ol>
          <p class="small thread-note" id="events-empty" hidden>No sign-in events yet.</p>
        </section>
      </div>
      <section class="dash-card" id="v-down" aria-labelledby="h-down" hidden>
        <h2 id="h-down">This page is not available right now.</h2>
        <p><a href="/">Try again</a></p>
      </section>
    </main>
  </div>
</div>
<script src="/assets/js/config.js"></script>
<script src="/assets/js/hq.js?v=20261111b"></script>
<script src="/assets/js/console.js?v=20261111b"></script>
</body>
</html>
```

- [ ] **Step 5: Commit**

```bash
git add apps/hq
git commit -m "feat(hq): the admin console and sign-out, with no Admin lists (R27) [z8uq9me128]"
```

## Task 8: Point the first page at the console, and remove stage A's line

**Files:**
- Modify: `apps/hq/next.config.ts`, `apps/hq/public/assets/js/auth.js`, `apps/hq/public/auth.html`, `apps/hq/public/not-found.html`, `apps/hq/README.md`
- Test: `apps/hq/tests/auth.test.mjs`

- [ ] **Step 1: Change the tests first**

In `apps/hq/tests/auth.test.mjs`:

1. In `VIEWS` remove `"signed-in"`. In `IDS` remove `"who"`, `"sign-out"` and `"sign-out-err"`.
2. Replace the test "stage A: a signed-in person sees who they are" with:

```js
test("a signed-in person is sent to the console", async () => {
  const p = await page("/sign-in/", { "GET me/": [SIGNED_IN] });
  assert.equal(p.location.replaced, "/");
  assert.deepEqual(p.shown(), []);
});
```

3. In "a right second step asks me/ again and follows it", replace the last line with `assert.equal(p.location.replaced, "/");`.
4. In "the recovery form sends its code to the same route", nothing changes.
5. In "someone already signed in who sends a form is taken where me/ says", replace the last line with `assert.equal(p.location.replaced, "/");`.
6. Delete the test "stage A: sign-out returns to the email form, and a failed one says so". Sign-out is now the console's, tested in `console.test.mjs`.

Run: `cd apps/hq && pnpm test`
Expected: FAIL in the changed tests (`location.replaced` is `null`), and an error that `v-signed-in` is missing.

- [ ] **Step 2: Change `apps/hq/public/assets/js/auth.js`**

1. In `VIEWS` remove `"signed-in"`; in `TITLES` remove the `"signed-in"` entry.
2. Replace the whole `signedIn` function and its comment with:

```js
  /* A signed-in person has nothing to do here: the console is the first page. */
  function signedIn() { location.replace("/"); }
```

3. In `start`, the line `if (place === "console") { signedIn(res.data.email || ""); return; }` becomes `if (place === "console") { signedIn(); return; }`.
4. Delete the whole `$("sign-out").addEventListener(…)` block.

- [ ] **Step 3: Change the pages and the routing**

1. In `apps/hq/public/auth.html`, delete the whole `<section … id="v-signed-in" …>` to its `</section>`, and change the two `?v=20261111a` on `hq.js` and `auth.js` to `?v=20261111b`.
2. In `apps/hq/next.config.ts`, the two lines

```ts
        /* Stage A: the first page is the sign-in document. Stage B points it at the console. */
        { source: "/", destination: "/auth.html" },
```
become

```ts
        { source: "/", destination: "/index.html" },
```
and the redirects become

```ts
    return [
      { source: "/index.html", destination: "/", permanent: false },
      { source: "/auth.html", destination: "/sign-in/", permanent: false },
    ];
```
3. In `apps/hq/README.md`, the pages table row for `/` becomes `| `/` | `public/index.html`, `assets/js/console.js` |`.

- [ ] **Step 4: Run everything CI runs**

```bash
cd apps/hq && pnpm lint && pnpm test && pnpm build
```
Expected: all pass.

- [ ] **Step 5: Check locally,** as in task 6b steps 1 to 4, with these rows in place of rows 5 to 7:

| # | Do | Expected |
|---|---|---|
| 5 | A right authenticator code | The console: the address, "Two-step sign-in verified", the two times, the events just made |
| 6 | Open `/sign-in/`, `/code/` and `/verify/` while signed in | The console each time |
| 7 | "Sign out" in the side menu at 1280 pixels, and the button in the first card at 390 pixels | The email form; `/` then shows the email form |
| 7b | Read the page at 1280 and 390 in both themes | No sideways scroll (`scrollWidth` equals `clientWidth`); nothing overlaps; no words "Admin lists", "Lists" or "Django" |

- [ ] **Step 6: Commit, capture for Coach Ed (section 9), report, and open stage B's build PR** as in task 6b steps 5 and 6.

```bash
git add apps/hq
git commit -m "feat(hq): the first page is the console; stage A's signed-in line is removed [z8uq9me128]"
```

---

## 8. The Vercel project, and what is Coach Ed's own approval

**Nothing here is done by building this plan.** `AGENTS.md`: "Do not link a Vercel project, add secrets, or deploy without explicit approval."

### 8.1 What the project would be, and what must be true of it (design 21.2)

| About | Proposed | To be read on the real project and reported |
|---|---|---|
| Name | `negosyoonline-hq-staging`, in the pattern of `negosyoonline-dash-staging` | |
| Repository and folder | This repository; root directory `apps/hq`; framework Next.js; Node 22 | As set |
| What it deploys | The protected `main` branch only | Which branch is the production branch |
| Preview deployments | Off for this project, or behind Vercel's own sign-in. A preview address is another origin; the backend's check allows only a name directly beside the HQ host, so a `vercel.app` address reaches no route and no cookie | The setting as found, and its exact name on Vercel's screen |
| Environment variables | None under arrangement A. Under B, `HQ_STAFF_API_BASE` only. **Never a secret, token or key** | The list of names (not values) |
| Domain | One: the staff app's staging name, whichever is ruled (6.1). No production name; production does not exist yet | The domains attached |
| Integrations, log drains, analytics, speed insights, monitoring | None | The list as found |
| Who can deploy, change settings or read logs | The people Coach Ed names, kept as short as the backend's list | The team members and their roles, by role and count, for him to name |
| Who can merge to `main` here | The same care: a merge here changes the script that runs where staff type their codes | The people with write access, by count |

The exact names of these settings on Vercel's screens were not looked at by this session. The coordinator reads them on the real project (6.2 row 5) and reports what is found, rather than this plan asserting them.

### 8.2 Every step that is his, one at a time

| # | Step | Where |
|---|---|---|
| 1 | This plan | ClickUp |
| 2 | Making the Vercel project and linking the repository | Vercel |
| 3 | Which arrangement of names (6.1) | His decision |
| 4 | The DNS record for the staff app's name, and attaching it to the project | DNS, Vercel |
| 5 | Naming who may deploy and who may merge (8.1) | Vercel, GitHub |
| 6 | `HQ_STAFF_ORIGIN` on staging, and every later change of it (plan 1, 9.4) | Railway |
| 7 | `HQ_STAFF_API_BASE` on the project, if arrangement B, and every later change of it | Vercel |
| 8 | A deliberate pause of one staging admin identity, to see the "Sign-in paused" notice on staging (9.2). It ends that person's live sessions and sends them an email | Staging |
| 9 | Adding "hq lint and build" to the required checks of `main` | GitHub settings |
| 10 | Adding `negosyoonline-hq-staging` to `scripts/wait_vercel_deploy.sh`, in its own small PR, after the project reports a status | This repository |
| 11 | The look of the five things of section 9 | His eye |
| 12 | What to do if the proof fails (section 4) | His decision |
| 13 | Anything on production. Besides his approval it waits for the NPC wording amendment (plan 1, 9.4) | |

## 9. What goes back to Coach Ed for his eye

He approved the dark theme at 1280 and 390 pixels for the sign-in page, the code page, the second step and the console. **These were never shown to him and are not accepted until he has seen them:**

| # | What | Stage |
|---|---|---|
| 1 | The light theme, on every page | A, and the console in B |
| 2 | The recovery form | A |
| 3 | The "Sign-in paused" notice | A |
| 4 | The error page "Page not found", and the state "This page is not available right now." | A |
| 5 | The console as built: without the Inbox and Contacts items, the search button, the bell and the bottom bar, and with "Sign out" in the first card on a phone (finding 4) | B |
| 6 | Stage A's line "Signed in as …". It exists only between the stages; he is told what it is rather than asked to accept a design | A |

### 9.1 Local first

The builder captures each row at 1280 and at 390 pixels, in the dark and in the light theme, from the local run of task 6b (`http://hq.negosyotest.com:3003`, local, http, port 3003), with the made-up local admin address on screen and no real code or address. The captures go to the coordinator, who sends them to Coach Ed with the commit, as the mockup's were. Each capture's file name says the page, the width and the theme. The builder reads every capture before sending it and measures that no page scrolls sideways.

`hq.negosyotest.com` is already in `/etc/hosts` on his computer, so he can also open the local run himself if he prefers; the coordinator tells him the address, the port and that it is the local environment.

### 9.2 Then staging

Only after the local captures are accepted, and only once the project and name exist (section 6): the same rows on the staging address, over https, captured the same way, and the address given to him to open. The "Sign-in paused" notice on staging needs five wrong codes on a real staging admin identity; that is 8.2 row 8 and is done only with his yes. If he prefers not to pause an identity on staging, the notice is accepted on the local captures alone and the report says so.

Nothing of rows 1 to 5 is called done until the coordinator relays his words.

## 10. Verification, and what stays unverified

| Where | What is verified | By |
|---|---|---|
| Tests | Every row of 7.3 | `pnpm test` in `apps/hq`, and in CI as "hq lint and build" |
| Lint and build | The app builds as the others do | `pnpm lint`, `pnpm build` |
| Local, http | The pages against the real routes; the headers; that every call goes to the HQ host | Task 6b, task 8 step 5 |
| Staging, https | The cookie between the two addresses, phones included | Section 6, gated |
| His eye | Section 9 | Local captures, then staging |

Unverified, said plainly:

- **The code in this plan has not been run.** In particular: that Next.js 16 loads `hq-env.mjs` from `next.config.ts` and from the route (task 6 step 7 finds out); that `default-src 'none'` with the directives of task 2 lets these static pages work in a real browser (task 6b row 1 finds out); that Google serves Manrope as one file with a weight range (task 2 step 7 finds out). Where a test here is wrong, the builder says so and corrects the test to section 5.
- **The browser's cookie behaviour between the two https addresses**, until section 6 is run. `node --test` is not a browser, and the local run uses `http` and cookies that are not `Secure`.
- **Staging's real values.** This session has not seen `HQ_HOST` on staging; the default address in `hq-env.mjs` is from a relayed fact.
- **The real Vercel project.** None exists. Every row of 8.1 is a requirement, not a finding.
- **Safari and Firefox, and real phones**, until section 6.
- **The cost R26 accepted** is not reduced by anything here. From the day a staff origin is set on an environment, whoever controls the page at that origin can capture both codes as typed. What this plan adds against it is small and stated: no third-party script, a CSP with one allowed address, the rules test, and the list of 8.1.
- **The audit record cannot tell a sign-in through this app from one through the Django pages** (plan 1, 9.2). Nothing here changes that.

## 11. For Coach Ed

### 11.1 Routine details decided in this plan, his to overrule

1. The plan is in `docs/plans/`, since this repository had no place for plans.
2. The three sign-in addresses are one document that changes view in the browser, so the typed address is never stored.
3. On a first visit the staff app opens in dark, as the dashboard does by his ruling of 2026-11-10, and not by the device's setting as the design's sentence says.
4. The font is served by the app itself (one downloaded file, asked of the coordinator first).
5. The CSP is stricter than the dashboard's: no inline style, no third host.
6. One variable, `HQ_STAFF_API_BASE`, defaulting to the staging HQ host. The app's own name is in no file.
7. A code that is not six digits, and an empty field, are not sent. Everything else is sent and the backend decides.
8. An answer the page does not expect, and no answer at all, show "This page is not available right now."
9. "Page not found" is answered with status 200, as the dashboard's fallback is.
10. An event the page has no words for is left out of the console's list.
11. A failed sign-out says so and stays on the page.
12. The local port is 3003.
13. The root lockfile gains one importer, and the build stops if anything else in it moves.
14. Stage A carries the one line "Signed in as …" so the phone proof can be run on it.

### 11.2 What approving this plan approves

- Building stage A (tasks 1 to 6b) on a build branch, and a build PR reviewed by the Santé/onboarding coordinator and the NPC coordinator, merged by the coordinator on green CI after the overlap check. **Merged, it is deployed nowhere:** no Vercel project exists for `apps/hq`.
- Building stage B (tasks 7 and 8) the same way, **only after the coordinator says every row of the proof was shown true.**

### 11.3 What it does not approve

Every row of 8.2 after the first. In particular: the Vercel project, the names, the DNS record, either variable, the look of the things in section 9, and anything on production.

## 12. Rollback

- **Before any Vercel project exists:** revert the build PR. Nothing is deployed, so nothing else changes.
- **After the project exists:** the fastest stop is the backend's, and it is the one design 21.2 names: delete `HQ_STAFF_ORIGIN` on that environment. Every staff call stops at once and the pages show "This page is not available right now." The Django pages are untouched and remain the way in. Then redeploy the previous commit on Vercel, or revert the PR.
- **Stage B alone:** revert stage B's PR; stage A's pages and its "Signed in as …" line return.
- **A session made through these pages** is an ordinary HQ session. It ends at sign-out, after 12 hours, or at `admin_identity reset`.
- The app stores nothing but a theme choice in the browser, so there is no data to clean up.

## 13. Shared files and other sessions

- The files of 7.2, by name: root `package.json`, root `pnpm-lock.yaml`, `.github/workflows/ci.yml`, root `README.md`, root `AGENTS.md`. Each gains lines; none is reordered.
- No open PR in this repository when this plan was written (`gh pr list`, 2026-11-11, `origin/main` at `0a943b0`).
- Reviewers before this plan goes to Coach Ed, and again on each build PR: the Santé/onboarding coordinator, who owns this repository's other work, and the NPC coordinator.
- Before each build PR is opened, and again before it merges: fetch `origin/main`, bring the branch up to date, re-run lint, tests and build, list the open PRs with their files, and tell the coordinator of any that touch a file of 7.2.

## 14. Self-review of this plan

- **Scope against the brief:** the app beside the others and what it reuses and adds to shared files (tasks 1, 7.2); sign-in, code, second step with the recovery form, the paused notice (task 6); console and sign-out (tasks 7, 8); the error page (task 2); the light theme (task 4); calls from the browser with the cookie, nothing through Vercel, no token or secret (section 5, tasks 2, 3, 5); the Vercel project and section 21's rules, each step his (section 8); tests first, local, then staging (tasks, 6b, section 6); unverified (section 10); rollback (section 12); the four unseen states back to him, local then staging, and how they are shown (section 9); the gate of plan 1's 7.5 and what happens if the proof fails (section 4); the name as a setting with the decision left open (6.1); the rulings quoted (1.1); R27 held by a test (task 3); later plans named (2.2); the shared files by name (7.2).
- **Names used across tasks:** `readEnv`, `buildCsp`, `configScript` (task 2; used by the route and `next.config.ts`). `window.NO_HQ_CONFIG.staffApi`, `window.NOHqTheme`, `window.NOHq` with `call`, `placeFor`, `when`, `who` (tasks 4, 5; used in tasks 6 and 7). Test helpers `open`, `settle`, `BASE`, `refused` (task 5; used in tasks 6 and 7). Element ids in `auth.html` and `index.html` match the `IDS` lists of their tests.
- **Not run:** see section 10.
