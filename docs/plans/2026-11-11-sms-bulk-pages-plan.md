# SMS Bulk SMS page (`apps/hq`) Implementation Plan (plan 9 of 11, plan only)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans, task by task. Steps use checkbox (`- [ ]`) syntax.

**ClickUp:** z8uq9me128 (SMS inbox, reply and compose, HQ). Written 2026-11-11 by the builder session of that task, for the coordinator's read, the Santé/onboarding coordinator's overlap check and the NPC coordinator's privacy read.

**Goal:** the Bulk SMS page of the HQ staff app: the list of bulk sends with Stop, the three-step form (write the text and choose who gets it, check, confirm), and the progress of the batch that is sending. It calls the seven POST routes of backend plan 8 (PR 101). Everything is switched off until the backend's `SMS_BULK_ENABLED` is set and a staff user is granted bulk access; with either off the "Bulk SMS" button does not appear anywhere.

**This PR changes one file: this plan.** No code is built by it.

## 1. Sources

| Source | What it gives |
|---|---|
| Design `docs/superpowers/specs/2026-11-11-sms-inbox-hq-design.md` (backend repo), sections 18, 19.5, 13 | The screens, the steps, the rules |
| Mockup `docs/superpowers/specs/mockups/2026-11-11-sms-inbox/bulk.html` (and `mockup.css`) | The look Coach Ed approved ("approved the look", 2026-11-11, dark theme, 1280 and 390). The page draws one batch at three moments, and says so |
| Backend plan 8, PR 101 (head `7e821a9`, approved by the coordinator), tasks 4 to 7 and section 6 | The routes, bodies and answers, section 4 below. **The backend is not built yet: the shapes are the plan's, to be checked against the built code at build time** |
| Frontend plans 5 and 7 (`docs/plans/2026-11-11-sms-inbox-pages-plan.md`, `...-contacts-pages-plan.md`, merged) | The page pattern, the client change, the gate, the pop-up rule, the rulings repeated here |
| Frontend `main` at `b5719ad` (`apps/hq`) | `hq.css`, `menu.js`, `hq.js`, `next.config.ts`. The mockup's classes (`.batch`, `.bar`, `.strip`, `.facts`, `.six`, `.step`, `.cols`, `.sendto`, `.opt`, `.checks`, `.upload`, `.file`, `.optout`, `.counter`, `.results`, `.banner`, `.stop`) are checked against `hq.css` at build; plan 7 found its own set present |
| The coordinator's briefs of 2026-11-11 | The rulings of section 2, including the NPC/billing coordinator's note: destructive primaries use the same solid red `stop` primary, and pop-up markup and CSS come from merged `main` only |

## 2. Rulings this plan follows (not reopened)

1. **The shell is the one on frontend `main`**, as plans 5 and 7. The page copies the chrome of `finance.html` and loads `hq.js`, `menu.js`, `shell.js`, then its own script.
2. **There is no new menu item.** "Bulk SMS" is a button on the SMS list (design 18.2), shown only when `bulk/status/` answers 200. The Bulk SMS page carries the `.set-tabs` platform menu with SMS current, as the mockup, and a Back link to the SMS list.
3. **Focus** (Coach Ed): light-blue input border and ring; light-blue keyboard ring on buttons, tabs and links; no heading or card title ever focused; no gold. `tests/focus.test.mjs` covers every file in `public/`.
4. **Routes:** the POST-only `/staff/v1/bulk/*` routes. **No number, text, group name or id is in an address.** The page keeps nothing in the browser but the theme.
5. **Pop-ups:** no Cancel button, one full-width primary button, an X at the top right, closed only by the X or Escape. The destructive primary (Stop sending) is the solid red `stop` primary of the merged shell. Markup and CSS are copied from merged `main`; this plan writes no pop-up rule.
6. Everything switched off; no real number stored; no Railway variable, DNS record, host name or `HQ_STAFF_ORIGIN` change; no CSP change; no Django admin.
7. From the design: the launch announcement only (R11); the opt-out line is added by the server and cannot be removed (18.2); a contact's name is never in a text and never leaves the server (19.5).

## 3. Scope

**Built:** one address, `/inbox/sms/bulk/`, served by `bulk.html` and `assets/js/bulk.js`; the "Bulk SMS" button and the "Sending" chip on plan 5's SMS list; the tests.

**Not built, each its own plan or ruling:** a way to add or remove a do-not-text number (design 16); any change to Contacts or the Inbox pages beyond the button and the chip; a second phone or SIM; a live refresh while the tab is open (5.6).

## 4. What the backend answers (plan 8, not yet built)

All `POST`, JSON body, staff origin and the HQ cookie. **Every route answers `404 not_found` for a staff user without bulk access, with either switch off, and with the migration missing:** the page cannot tell them apart and shows nothing about Bulk SMS. Every answer carries `Cache-Control: no-store`.

| Route | Body | Answers |
|---|---|---|
| `bulk/status/` | none | `{bulk: true, running: bool, used_today, left_today, reserved_for_codes, opt_out_line, text_max}` (`text_max` 138, `opt_out_line` " Reply STOP to opt out") |
| `bulk/list/` | `cursor?`, `limit?` | `{results: [batch], next}`, newest first; a batch is `{batch, state, when, who, source, size, sent, failed, not_sent, waiting, left_out, text_length}`. No number, no text |
| `bulk/check/` | `text`, `source` (`groups`, `file`, `pasted`) and `groups` (ids) or `csv` (the file's text) or `numbers` (the pasted text) | `{lines_read, duplicates, refused_count, refused: [{line, reason}] (first 200), opted_out, eligible, used_today, left_today, size, left_out, seconds_min, seconds_max, text_length, blocked}`. `blocked` is `""`, `"running"`, `"incoming_off"` or `"no_room"`. Stores nothing, audits nothing |
| `bulk/left-out/` | as `check` | 200, `text/csv`, one full number a line; 409 `nothing_left_out`. Audited by the backend with a count |
| `bulk/confirm/` | as `check`, plus `count` (the typed number) and `request_id` | 201 (200 for a repeat) and the batch |
| `bulk/open/` | `batch`, `cursor?`, `limit?` | The batch and `results: [{number (masked), state, reason}]` (100 a page) while the rows exist, else `[]`, and `next` |
| `bulk/stop/` | `batch` | The batch |

**Errors** (`{error: {code, message, fields}}`): `invalid_request`, `invalid_text` (`fields.text`), `file_too_large` (413), `invalid_file`, `changed` (409), `batch_running` (409), `incoming_off` (409), `not_running` (409), `nothing_left_out` (409), `not_found`, `invalid_cursor`, `unauthenticated` and `second_step_required` (401).

**Where the design and the mockup differ from this API** (routine, from plan 8): every route is a POST and an id is in the body; there is no held check, so the confirm sends the source again with the typed count; the refused lines are line and reason only (the page builds the download); the left-out file is only offered at the check, not for a batch already confirmed; per-number results exist only while the batch runs; the backend sends no time-left figure, so the page computes it.

## 5. The behaviour

### 5.1 The button and the chip (plan 5's list page)

`inbox.js` (plan 5) calls `bulk/status/` once after its own boot. On 200 it draws the "Bulk SMS" button (a link to `/inbox/sms/bulk/`) beside "New SMS", and, when `inbox/status/` says `bulk_running`, the small chip "Sending" on the button (design 18.2.1), so the status chips and buttons stay on one line. On any other answer, offline or no `NOHq`, nothing is drawn and no error is thrown. The two calls carry no value. This is the only change to plan 5's files (section 6).

### 5.2 The page (`/inbox/sms/bulk/`)

Top to bottom, as the mockup: the platform menu, the heading "Bulk SMS" with the chip "Launch announcement only", the card "Bulk sends", the form (step 1) with the aside "How bulk sending works", the check (step 2), and the progress (step 3) when a batch is running.

- **Boot.** `me/` for who is signed in, then `bulk/status/` and `bulk/list/`. A 401 goes to `/verify/` or `/sign-in/` as Finance does. A 404 shows the closed card "Bulk SMS is not available." with no reason. Offline or any other answer shows "Bulk SMS could not be reached. Try again." and a button.
- **The aside** is the mockup's list, with the figures from `bulk/status/`: "300 texts a day are kept for sign-in codes. Bulk SMS stops at 1,700." (`reserved_for_codes`, 2,000 less it).

### 5.3 The list of bulk sends

One row per batch as the mockup's `.batch`: the time (the page formats `when` as "Today", "Yesterday" or the date, with `textContent`), the source in words ("Groups", "CSV file", "Pasted numbers"; **no group name**: the backend does not send one), the state chip, the counts line, the progress bar for a running batch, and "View". No number and no text is in any row.

| State | Chip | Counts line | Buttons |
|---|---|---|---|
| `waiting` | "Waiting" | "{size} texts. Waiting for the phone." | View, Stop sending |
| `sending` | "Still sending" | "{sent} of {size} sent, {not_sent + failed} not sent, {waiting} waiting. About {h} left. Started by {who}." | View, Stop sending |
| `stopped` | "Stopped" | "Stopped at {sent + not_sent + failed} of {size} by {who}: {sent} sent, {not_sent + failed} not sent, {waiting} never sent." | View |
| `finished` | "Finished" | "{n} of {size} handled: {sent} sent, {not_sent + failed} not sent. Started by {who}." | View |

"About {h} left" is `waiting` × 18 to 25 seconds, written as one figure rounded up to the hour, or "Under an hour"; the page computes it from `waiting`. The list is the backend's first page; "Load more" passes `cursor`. Empty: "No bulk sends yet."

### 5.4 Step 1: write the text and choose who gets it

- **Message.** The mockup's textarea. The counter counts the typed text plus 22 and reads "{n} / 160" (`text_max` and `opt_out_line` from `bulk/status/`); over 160 it shows the problem and the button stays disabled. The fixed line "Added at the end of every text: Reply STOP to opt out" is drawn from `opt_out_line`; the user cannot change it. The backend alone decides what is valid (links, characters); the page shows `invalid_text`'s `message` under the field.
- **Send to.** One choice of three radio options, as the mockup; they are never combined.
  - **Groups from Contacts**: checkboxes from `contacts/groups/list/` (plan 7's route, called once; names written with `textContent`; each group's count as "{count} contacts"). If that call answers 404 (contacts are off) the option is disabled with "Contacts are not turned on." The chosen ids are held in memory.
  - **A CSV file of mobile numbers**: the file input (`accept=".csv,text/csv"`) with the mockup's hint. The page reads it with `file.text()` into a variable. **A file over 1,048,576 bytes is refused in the page before any call** ("The file is over 1 MB."). The text is held in memory only: never in storage, the address or the DOM.
  - **Pasted numbers**: the textarea. The text is held in the field and in memory for the calls; it is cleared once the batch is confirmed or the page is left.
- **Check the list** posts `bulk/check/` with `{text, source, ...}`. Nothing is sent at this step, and the page says so.
- **Blocked.** `blocked: "incoming_off"` shows "Bulk texts need incoming texts to be on, so that replies of STOP are kept." and no confirm; `"running"` shows "A batch is already sending." with a link to the list; `"no_room"` shows "No texts are left for bulk today."

### 5.5 Step 2: check and confirm

Shown only after the check answers.

- **The facts** (`.facts.six`), from the answer: "Numbers read" (`lines_read`), "After duplicates" (`lines_read − refused_count − duplicates`), "After opt-outs" (`eligible`), "Texts left for bulk today" (`left_today`), "This batch" (`size`), "For a later batch" (`left_out`). "Refused lines" (`refused_count`) is a seventh line, only above 0.
- **The refused lines** as the mockup's `.results`: "Line {n}" and a chip with the reason from a fixed table keyed on the backend's reason (an unknown reason shows "Refused"); only the first 200, then "Showing the first 200 of {refused_count} refused lines." "Download the refused lines" builds a small CSV of line numbers and reasons in the page from a `blob:` address revoked at once; it holds no number and no content from the file. If the browser or the CSP stops it, the button is left out and that is reported.
- **When the list does not fit** (`left_out` above 0) the mockup's banner: "These numbers do not fit in today's texts. This batch is cut to the first {size} numbers, all the texts left for bulk today", with only the figures the answer holds (`used_today`, `left_today`, `reserved_for_codes`), never a figure the page invents; and "Download the {left_out} not in this batch" (a call to `bulk/left-out/`, full numbers, offered **before** the confirm: once the batch is confirmed the page cannot get them again). The file is built into a `blob:` address and revoked at once; if the download is stopped, the button is left out and that is reported.
- **Time.** "About {a} to {b} hours to send, at one text every 18 to 25 seconds" from `seconds_min` and `seconds_max`.
- **Confirm.** The field "Type {size} to confirm" and the button "Send this batch of {size}", disabled until the typed number equals `size`. It posts `bulk/confirm/` with the **same source again** (the file text from memory, the pasted text, or the group ids), the same text, `count` and a `request_id` (a random 16-to-64 character id made with `crypto.getRandomValues`, held in memory and **reused if the same press is repeated** so a double press cannot send twice). On 201: the form and the check are dropped, the page shows step 3 and "Batch started." On 409 `changed`: "The list changed since it was checked. Check it again." and step 2 closes. On 409 `batch_running` or `incoming_off`: the matching sentence of 5.4. `invalid_request`, `invalid_text`, `file_too_large`, `invalid_file`: the backend's `message` in the error box.

### 5.6 Step 3: progress, and Stop

- **Progress.** For the running batch (or the one "View" opened): the bar, the strip of chips ("{sent} sent", "{waiting} waiting", "{not_sent + failed} not sent", "About {h} left") and the masked results from `bulk/open/` (100 a page, "Load more" with `cursor`), each "number, state chip". Reason chips use a fixed table keyed on the backend's reason (`phone_failed`, `no_report`, `expired`, `staff_limit` as "today's limit reached", `day_ended`, `stopped`, `record_gone`); an unknown reason shows "Not sent". When the rows are gone (a finished or stopped batch) the page shows the counts and "The numbers are no longer kept."
- **Refresh.** There is no timer in the page. The list and the progress refresh when the user presses "Refresh" and when the tab becomes visible again (`visibilitychange`). The backend settles a batch on every list or open call, so a press shows the true state even with the phone away. Design 18.2.1 leaves "whether the page asks again by itself" to the plan: this plan chooses no, as plans 5 and 7, and reports it (F7).
- **Stop sending** is on the row and on the progress, for a waiting or sending batch only. It opens a pop-up (ruling 2.5): "Stop this batch? Texts already sent stay sent. {waiting} texts that have not been sent will not be sent." with one full-width solid red primary "Stop sending" and an X at the top right; closing by the X or Escape posts nothing. The primary posts `bulk/stop/` with the id from memory; the answer replaces the row; `not_running` shows "That batch is no longer sending." and refreshes.
- **Blocked SIM.** The page adds nothing to detect it; when many results show "Not sent" with `phone_failed` or `no_report`, the counts line says so as it is. The backend runbook (plan 8, task 9) tells staff what to do.

### 5.7 What the page never does

It never shows a full number except in the one file it is asked to build (the left-out file, by a press). The refused-lines file holds none. It never writes the text, a number or a file's contents to storage, an address, the title or the console. Names and reasons are written with `textContent` only.

## 6. Files

**New (under `apps/hq/`):**

| File | What |
|---|---|
| `public/bulk.html` | The chrome of `finance.html` and one `<main>` holding the list, the form, the check, the progress and the closed and down cards, each hidden until the script shows it |
| `public/assets/js/bulk.js` | The one script |
| `tests/bulk.test.mjs`, `tests/bulk-run.test.mjs`, `tests/bulk-button.test.mjs` | Section 8 |

**Shared files the build touches, by name, for the reviewers:**

| File | Change |
|---|---|
| `public/assets/js/inbox.js` (plan 5) | The button and the chip (5.1), about 20 lines |
| `public/inbox.html` (plan 5) | An empty slot for the button beside "New SMS", if plan 5's markup has none |
| `next.config.ts` | One rewrite for `/inbox/sms/bulk/` to `bulk.html`, and a redirect from `/bulk.html` |
| `README.md` | The "Pages" table gains the Bulk SMS row |
| `public/assets/css/hq.css` | Only if a class the page needs is missing; the build reports any addition line by line |
| `tests/inbox.test.mjs` | The button cases |

`menu.js`, `config.js`, `hq-env.mjs` (the CSP), `shell.js`, `theme.js`, `auth.js`, `console.js`, `finance.js`, `hq.js` and every backend file are **not touched**.

## 7. Tasks

Each task is test first, then code, then the checks (`pnpm --filter hq lint`, `test`, `build`), then a commit. Branch from the latest `origin/main` once plan 5's build, plan 7's build and backend plan 8's build are merged; update from `main` before the PR.

### Task 1: the address and the button

- [ ] **Tests** (`rules.test.mjs`, `bulk-button.test.mjs`): `next.config.ts` rewrites `/inbox/sms/bulk/` and redirects `/bulk.html`; no script builds an address from a number, text or id; with `bulk/status/` answering 200 the list page shows "Bulk SMS" beside "New SMS", and the chip "Sending" only when `inbox/status/` says `bulk_running`; with 404, 401, 503, offline or no `NOHq` there is no button and no error; the call is one `POST bulk/status/` with nothing in the address.
- [ ] **Code:** `next.config.ts`, `inbox.js` and `inbox.html`. **Checks;** commit.

### Task 2: the page, the list and Stop

- [ ] **Tests** (`bulk.test.mjs`, through `tests/page.mjs`): the boot and its 401, 404 and offline states; the four states render their chip, counts line and buttons from the table in 5.3; no row holds a number or a text; "About {h} left" comes from `waiting`; Load more passes `cursor`; Stop asks once, closing with the X or Escape posts nothing and there is no Cancel button, the primary is the red `stop` primary; the primary posts `bulk/stop/` with the id from memory; `not_running` refreshes; Stop is absent on stopped and finished rows; no timer or interval in the script.
- [ ] **Code:** `bulk.html`, the list and stop parts of `bulk.js`. **Checks;** commit.

### Task 3: step 1 and the check

- [ ] **Tests:** the counter counts +22 and disables over 160; the fixed opt-out line is drawn and not editable; the three sources are exclusive; the groups option is disabled when `contacts/groups/list/` answers 404; a file over 1,048,576 bytes sends nothing; "Check the list" posts the right body for each source; the file text and the pasted text appear in no storage, address, title or `console` call and in no element after the check; `blocked` states show their sentences and no confirm; `invalid_text` shows under the field.
- [ ] **Code:** step 1 of `bulk.js`. **Checks;** commit.

### Task 4: step 2, confirm and the downloads

- [ ] **Tests:** the facts come from the answer (After duplicates is `lines_read − refused_count − duplicates`); the refused lines show line and reason only and the "first 200 of N" line; the cut banner is written from `used_today`, `left_today` and `reserved_for_codes` only; "Download the {left_out} not in this batch" calls `bulk/left-out/` and hands the file through a revoked `blob:` address, and is shown only before the confirm; the confirm button is disabled until the typed number equals `size`; it posts the same source again with `count` and one `request_id`, and a repeated press reuses the id; 201 drops the form, the check and the file text; 409 `changed` closes step 2; `batch_running` and `incoming_off` show their sentences; no full number appears in any element.
- [ ] **Code:** step 2 of `bulk.js`. **Checks;** commit.

### Task 5: step 3, the progress

- [ ] **Tests** (`bulk-run.test.mjs`): the bar, the strip and the masked results from `bulk/open/`; Load more passes `cursor`; a reason chip for each reason in the table and "Not sent" for an unknown one; with no rows, the counts and "The numbers are no longer kept."; Refresh and `visibilitychange` call `list` and `open` and nothing else; no timer.
- [ ] **Code:** step 3 of `bulk.js`. **Checks;** commit.

### Task 6: the whole check, the local walk, the captures

- [ ] Run `pnpm --filter hq lint`, `test`, `build`, and whatever CI runs for the other apps, and report the actual output.
- [ ] **Local walk, as plans 2, 5 and 7** (http, headless Chromium, `hq.app.localhost:3003` against a local backend on `ggwp.app.localhost:8011`, a scratch database, one made-up staff identity, made-up numbers, local names only, the backend's fake phone): switches off, no button; granted with `--send --bulk`: a pasted list with bad lines and repeats, the check, STOP from one number then check again, confirm, watch the fake phone print one text at a time, a code asked for meanwhile, Stop, a list longer than the room with the left-out file, Back, reload; a read-only and a send-only user see no button; with the backend's `inbox.0003` not applied: no button.
- [ ] **Captures** for Coach Ed (local, made-up data only): the list with the states, step 1, step 2 (including the cut banner and refused lines), step 3, the Stop pop-up, the closed card; dark and light, 1280 and 390 wide. **Not shown to him before and so needing his eye:** the light theme, the closed and down cards, the pop-up, and what is left out of the mockup (no group names in the list, "Refresh" in place of a live update, no numbers once the batch ends).
- [ ] README row. Commit; update from `main`; list the open PRs and their files; open the PR; the coordinator merges after the Santé/onboarding and NPC reviews.

## 8. Tests, in short

Node's test runner, no browser library, driven through `tests/page.mjs` and `tests/dom.mjs`, as the other pages. They prove the page follows the backend's answers and keeps the rules: no value or id in an address, nothing stored, no timer, no raw backend value shown outside the named messages, every name written as text, the same `request_id` reused on a repeated press. They do not prove the look or a real browser: that is the walk and the captures.

## 9. What goes to Coach Ed, and what does not

Nothing in this plan returns to Coach Ed before code ("build until plan 9"). His look comments come at the visual test of the built pages.

### 9.1 Routine details decided here, his to overrule

| # | Decision | Why | Source |
|---|---|---|---|
| F1 | No new menu item; "Bulk SMS" is a button on the SMS list, drawn only when `bulk/status/` answers 200 | Design 18.2 | Design 18.2 |
| F2 | One address, `/inbox/sms/bulk/`; a batch opens inside it, its id held in memory | No id in an address | Plans 5 and 7 |
| F3 | The source (file text, pasted text, group ids) is held in memory from the check to the confirm and sent twice | The backend holds no check | Backend plan 8 C6 |
| F4 | The left-out file is offered at the check, before the confirm, and nowhere after | The batch's rows are deleted when it ends | Backend plan 8 C12 |
| F5 | The refused-lines download is built in the page from line and reason, first 200 only | The backend returns no values and has no route for it | Backend plan 8 task 4 |
| F6 | The list does not name the groups of a batch | The backend does not send group names | Backend plan 8 task 5 |
| F7 | No timer: "Refresh" and the tab becoming visible refresh the list and the progress | Design 18.2.1 leaves it to the plan; plans 5 and 7 use no timer | Design 18.2.1 |
| F8 | "About {h} left" is computed in the page from `waiting` × 18 to 25 seconds | The backend sends no figure | Design 18.3 |
| F9 | A `request_id` is made with `crypto.getRandomValues`, kept in memory and reused on a repeated press | So a double press cannot send two batches | Backend plan 8 C6 |
| F10 | The mockup's phone bottom bar (Inbox, Contacts, Console) is not built by this plan | The app has none on `main` | Plans 5 and 7 |

### 9.2 What approving this plan approves, and what it does not

It approves building tasks 1 to 6 on a build branch, with the shared-file changes of section 6, after plans 5 and 7 and backend plan 8 are built and merged. It does **not** approve: any variable, host name, DNS record or `HQ_STAFF_ORIGIN` change; turning `SMS_BULK_ENABLED` on anywhere; an access grant with `--bulk`; sending any text to any real number; the NPC and privacy wording; a CSP change; anything on production.

## 10. Verification, and what stays unverified

**Verified by reading** (frontend `main` `b5719ad`, backend plan 8 at `7e821a9`): plans 5 and 7 and their patterns; the seven routes, their bodies and errors in the backend plan; the mockup's `bulk.html`, which draws one batch at three moments.

**Not verified (to check at build):**

1. The backend answers: plan 8 is not built. The shapes in section 4 are the plan's. The build reads the built code and reports every difference before writing the page.
2. Which of the mockup's classes (`.batch`, `.bar`, `.six`, `.sendto`, `.opt`, `.optout`) exist in `hq.css` on `main` at build time; each missing one is reported line by line.
3. How the SMS list's button row fits at 390 wide with a third button and the chip; and how the side menu is reached at 390 wide on `main` (the design measured the platform menu at 619 pixels of content in a 358-pixel row, swiped sideways; plan 5 carries the open item to look at it on `main` at build).
4. Whether `a[download]` from a `blob:` address works under the app's CSP in Chrome and Safari (F5, and the left-out file). If not, the button is dropped.
5. Whether a body near 2.4 MB passes through the real hosts; neither backend plan read the proxy's limit.
6. That the pace of one text every 18 to 25 seconds really shows as steady progress through the poll; backend plan 8 does not verify it either.
7. Nothing has run: no code of this plan, no page in a browser, nothing on staging or production.

## 11. Rollback

Each task is one commit; reverting the PR removes the Bulk SMS page and the button and leaves the app as plans 5 and 7 ship it. The backend is unaffected: with either switch off its routes already answer 404.

## 12. Shared files and other sessions

- **Open frontend PRs when written** (`gh pr list`, 2026-11-11): 41 only (the Finance page, billing coordinator, head `73758b2`); it touches `menu.js`, `next.config.ts`, `README.md`, `hq.css` and tests. This plan's build is after plans 5 and 7's builds, which are after PR 41. The list is read again before the build PR.
- **Plan 5's build** adds the list page and `inbox.js`; this plan adds a button to them and keeps plan 5's lines.
- **Backend:** plan 8's build must be merged and deployed dark, and `inbox.0003` applied wherever the walk is run against a shared backend (it is not: the walk is local).

## 13. Self-review

- The rulings with a visible effect (no id in an address; the shell from `main`; no new menu item; the pop-up rule and the red primary; focus) are 2.1 to 2.5 and 5.6.
- Where the design, the mockup and the planned API differ, the API is followed and each difference is named (section 4, 9.1).
- The page shows no full number except in the file it is asked to build, no text or name outside its own memory, and stores nothing; the source is dropped after the confirm or on leaving.
- The backend's `message` is shown only for the named codes; any other answer gets a fixed sentence.
- Every change sits behind a button press or the tab becoming visible; there is no timer.
