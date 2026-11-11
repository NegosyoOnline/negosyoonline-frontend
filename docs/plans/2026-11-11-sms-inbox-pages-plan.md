# SMS Inbox pages (`apps/hq`) Implementation Plan (plan 5 of 11, plan only)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans, task by task. Steps use checkbox (`- [ ]`) syntax.

**ClickUp:** z8uq9me128 (SMS inbox, reply and compose, HQ). Written 2026-11-11 by the builder session of that task, for the coordinator's read, the Santé/onboarding coordinator's overlap check and the NPC coordinator's privacy read.

**Goal:** the Inbox pages of the HQ staff app: the SMS list, a conversation with its reply form, "New SMS", and the one "not yet available" page for the other five platforms. They call the six POST routes of backend PR 98. Everything is switched off until the backend's `SMS_INBOX_ENABLED` is set and a staff user is granted access; with it off the Inbox does not appear anywhere.

**This PR changes one file: this plan.** No code is built by it.

## 1. Sources

| Source | What it gives |
|---|---|
| Design `docs/superpowers/specs/2026-11-11-sms-inbox-hq-design.md` (backend repo), sections 3.1, 9, 13 | The pages, masking, the menu, the platform menu, the top-right buttons, the decisions the mockup shows |
| Mockup `docs/superpowers/specs/mockups/2026-11-11-sms-inbox/` (`index`, `conversation`, `compose`, `platform`, `mockup.css`) | The look Coach Ed approved ("approved the look", 2026-11-11, dark theme, 1280 and 390) |
| Backend PR 98, `apps/inbox/staff.py`, `reading.py`, `sending.py` (head `ec40bf3`) | The routes and their answers, section 4 below. **Where the design's section 10 and the code differ, the code wins** |
| Backend plan 4 `docs/superpowers/plans/2026-11-11-sms-inbox-reply-compose-plan.md`, section 6 | What the pages need to know |
| Frontend `main` at `e0d6ba3` and PR 41 at `1975008` (`apps/hq`) | The shell, `hq.js`, `menu.js`, `shell.js`, the CSS, the tests, the page pattern of `finance.html` and `finance.js` |
| Plan 2 `docs/plans/2026-11-11-hq-staff-app-plan.md` | The app's rules (README "Rules") that every page keeps |
| The coordinator's brief for this plan (2026-11-11) | The rulings of section 2 |

## 2. Rulings this plan follows (not reopened)

1. **The shell is the one on frontend `main` after PR 41, not the mockup's, for these parts:** the wordmark "NegosyoOnline HQ", no "HQ / Staff only" block, the foot of the side menu is the Subscriber-dashboard-style user chip with its pop-up card. The inbox pages copy `finance.html`'s chrome (side panel, top bar, `desk-switch`, modals) and load `hq.js`, `menu.js`, `shell.js`, then their own script.
2. **The platform menu is `.set-tabs`** (already in `hq.css`).
3. **Search and bell are wired** (`search-btn`, `search-btn-2`, `bell-btn`, `bell-btn-2`, which PR 41 ships `aria-disabled`), section 5.2.
4. **Focus (Coach Ed, PR 41 head `1975008`):** focused inputs get the light-blue border and a 1-pixel ring; buttons, tabs and links get a light-blue keyboard ring; **no heading or card title is ever focused or ringed**; no gold focus (`--focus` and `--c-focus` are gone). `tests/focus.test.mjs` already holds this over every `.html` and `.js` file in `public/`, so the new files are covered the moment they exist. New controls use the existing classes; no new focus rule is written.
5. **Routes:** the POST-only `/staff/v1/inbox/*` routes of PR 98. **No number, text or id is in an address.** Every answer carries `Cache-Control: no-store` (the backend sets it; a test here checks the page never caches by itself).
6. Everything switched off; no real text or contact stored; no Railway variable, DNS record, host name or `HQ_STAFF_ORIGIN` change.
7. From the earlier rulings: no Django admin and nothing that links to it; the pages are static files that load their data by script (design R23); the app keeps nothing in the browser but the theme (README "Rules"); no inline script or style; the CSP is not widened (this plan needs no new CSP word).

## 3. Scope

**Built:** four pages from one HTML file and one script (section 6): `/inbox/sms/` (list, and a conversation opened inside it), `/inbox/sms/new/` (New SMS), `/inbox/<platform>/` for `messenger`, `instagram`, `tiktok`, `email`, `webchat`; the "Inbox" menu item with its unread count; the wired search and bell buttons; the small client change of section 5.1.

**Not built, each its own plan:** Bulk SMS and its button (plans 8, 9), Contacts and groups (plans 6, 7), any automatic refresh, a notifications panel, a quick-links search, an "opted out" display (the API has no such field yet), delivery receipts, the phone bottom bar if the app has none (section 10, item 3).

## 4. What the backend answers (read in PR 98, not assumed)

All six are `POST` with a JSON body that always carries `"platform": "sms"`. Staff origin and the HQ cookie as every staff call. **A staff user without inbox access, the switch being off, and any platform but `sms` all answer `404 not_found`**: the page cannot tell them apart, and shows nothing about the Inbox.

| Route | Body | Answers |
|---|---|---|
| `inbox/status/` | `{platform}` | `{platform, read, send, phone_online, used_today, cap, reserved_for_codes, unread}`. `send` says whether reply and compose are allowed. `unread` is the number of conversations with unread texts |
| `inbox/conversations/list/` | `{platform, state: "all"\|"unread", cursor?, limit?}` | `{results: [{id, platform, contact, can_reply, unread, last_message_at, last_direction, last_status}], next}`, newest conversation first. `contact` is already masked. **No text.** `next` is the id to pass as `cursor`, or null |
| `inbox/conversations/find/` | `{platform, number}` | The same `results` for the one conversation with that full number, or `[]`; `next` null. Every lookup is audited by the backend |
| `inbox/conversations/open/` | `{platform, conversation, cursor?, limit?}` | `{id, platform, contact, can_reply, messages: [{id, direction: "in"\|"out", body, clipped, kind: "reply"\|"compose"\|null, status, reason, author, at}], next}`. The newest 50 texts, oldest first within the page; `next` is the id of the text just before the page, passed as `cursor` for earlier ones. **Marks the conversation read and writes an audit entry per call** |
| `inbox/conversations/reply/` | `{platform, conversation, text, request_id}` | `201 {conversation, message}`; `200` with the earlier message when the `request_id` was already used |
| `inbox/compose/` | `{platform, to, text, request_id}` | The same shape as reply |

`request_id` is 16 to 64 letters, digits, `-` or `_`. A refused attempt frees its `request_id` for another try; a queued one keeps it for 24 hours.

**Errors** (`{error: {code, message, fields}}`): `invalid_text` (`fields.text`), `invalid_mobile` (`fields.to`), `invalid_request` (`fields.request_id` or `fields.state`), `invalid_cursor`, `cannot_reply` (400), `forbidden` (403: read-only access), `rate_limited` and `limit_reached` (429), `sms_paused` and `sms_unavailable` (503), `request_in_progress` (409), `unauthenticated` and `second_step_required` (401), `not_found` (404). The words for the first nine are in the answer's `message`, which is written for staff.

**Where this differs from the design's section 10** (routine, from the code; the design's list was for a GET-and-path API that was not built): every route is a POST; the conversation id is in the body, not the address; the list has no `can_bulk`, `opted_out` or `bulk_running`; there is no `me/` entry for the inbox, so the page learns access from `inbox/status/`; there is no "All" count, only `unread`; `contact` replaces `contact_masked`; `at` replaces `occurred_at`.

## 5. The behaviour, page by page

### 5.1 The client (`hq.js`): one additive change

`NOHq.call` returns `{ok, status, code, data}` and drops the error's `message` and `fields`. The Inbox needs both (the words to show for a refused text are the backend's own). The result gains `message` (string, "" when none) and `fields` (object, `{}` when none). No existing caller reads them, so nothing else changes. The page shows `message` only for the codes listed in section 4 and a fixed sentence for any other, so a raw backend value is never shown.

### 5.2 The menu, the search and the bell, on every signed-in page

- `menu.js` gains an entry `{href: "/inbox/sms/", label: "Inbox", gate: "inbox"}` after Finance. A gated entry is **not drawn** until `inbox/status/` answers 200 for `sms`. `menu.js` makes that one call per page load (after `hq.js`, so `NOHq` exists), and on 200: draws the entry with the unread number in the existing `.count` pill (hidden at 0), marks the entry current for every path that starts `/inbox/`, and wires the buttons below. On any other answer, offline, or no `NOHq`, nothing is drawn and the buttons stay as PR 41 ships them. The call writes no audit entry on the backend and holds no text.
- **Search** (`search-btn`, `search-btn-2`): on 200 the button loses `aria-disabled`, gets the title and label "Find a conversation by full number", and on click goes to `/inbox/sms/#find`. The list page puts the cursor in the Find field when it opens with that fragment. It opens no panel and searches nothing itself (design 13: "no new search is built").
- **Bell** (`bell-btn`, `bell-btn-2`): on 200 it loses `aria-disabled`, gets the title and label "Inbox, N unread" (or "Inbox, no unread texts"), and on click goes to `/inbox/sms/`. A dot shows while `unread` is above 0 (the dot rule is in `hq.css` already; the plan confirms it at build). No panel, no stored notification, no alert when a text arrives (design 13, 16).
- Both stay real `<button>` elements, so keyboard use is unchanged. Their `id`s and the markup of the four existing pages do not change.

### 5.3 The addresses (no id in any)

`next.config.ts` gains the rewrites `/inbox/sms/`, `/inbox/sms/new/` and the five platform paths to the two files of section 6, and a redirect from `/inbox/` to `/inbox/sms/` and from each `*.html` file back to its path, as `finance` has. **The design's `/inbox/sms/c/<id>/` is not built:** the coordinator's ruling is that no id is in an address. A conversation opens inside the list page and its id is held in memory; a reload returns to the list. The browser's Back button returns from a conversation to the list: the page pushes one history state with the *same* address and no data, and a `popstate` closes the conversation. (Finance holds the open payment in memory the same way; whether it also handles Back is read at build and copied if it does.)

### 5.4 The SMS list (`/inbox/sms/`)

Top to bottom, as the mockup's `index.html`: the `.set-tabs` platform menu (SMS current; the five others link to `/inbox/<platform>/`); the status line; the toolbar; the list.

- **Boot.** `me/` for who is signed in (`NOHqShell.signedIn(email)`), then `inbox/status/`. The 401s go to `/verify/` or `/sign-in/` through `placeFor`, as `finance.js` does. A 404 shows the "closed" card: "The Inbox is not available." with no reason given (the page cannot tell the causes apart, and should not). Offline or anything else shows "The Inbox could not be reached. Try again." with a button.
- **Status line.** A chip "Gateway phone online" (green dot) or "Gateway phone offline"; a chip "{used_today} of {cap} texts used today". When `phone_online` is false the chip says so; nothing else changes. Both come from `inbox/status/`.
- **Buttons.** "New SMS" (a link to `/inbox/sms/new/`) only when `send` is true. **No "Bulk SMS" button** (plan 8 adds it).
- **Toolbar.** The `.seg` control "All" and "Unread {n}" (n from `status.unread`; **no count on "All"**, the API has none). The Find form: one field, "Find a full mobile number", and "Find". Find posts `{number}` as typed and replaces the list with the answer, with a line "Showing the conversation with that number" and a "Show all" button; an empty answer says "No conversation with that number." The typed number is cleared from the field after the call and is never written anywhere else. "Refresh" calls the list (and status) again; there is no automatic refresh.
- **List.** One row per conversation: an arrow icon for in or out; the masked `contact`; the time of the last text; an "Unread {n}" pill when `unread` > 0 (the row is bold, as the mockup's `.item.unread`); for an outgoing last text, "Waiting" (`queued`, `dispatched`), "Sent", or "Not sent" (`failed`, `expired`, or null). **No text, no preview.** "Load more" while `next` is set. Empty: "No conversations yet." (All) or "No unread conversations." (Unread). The foot line "The list never shows the text of a message. Opening a conversation is recorded." stays.
- A row is a `button` (not a link: there is no address). Opening it calls `open`.

### 5.5 A conversation (inside the list page)

- The list is hidden and the conversation shown: the Back link "SMS" (closes it and returns focus to the row), the masked `contact` as the page's `h1`, and, when `can_reply`, the chip "Philippine mobile". (The mockup's second chip "HQ line" is left out: no field supplies it.)
- **Texts** in a `.thread` card, oldest first, with the day separators and the in or out bubbles of the mockup. The time is shown in Manila (`Asia/Manila`), like `NOHq.when`. An outgoing text's meta line: "Waiting to send" (`queued`, `dispatched`), "Sent", or "Not sent" (`failed`, `expired`) plus the reason in words, then the author (`author`, the staff username) and the time. A `failed` or `expired` bubble has the dashed `.failed` look. A `reason` this page has no words for is **not shown** (a fixed table, built from the reasons the gateway's `report` accepts, read at build; `expired` has its own line: "the phone did not take it in time"). `clipped: true` adds "(cut short)" after the text.
- **Earlier texts.** When `next` is set, a button "Earlier texts" above the thread calls `open` with `cursor: next` and puts the page before the first text, keeping the scroll position. Each such call is audited by the backend like the first; the page makes one only on that button.
- **Opening is audited.** The note "The number is masked. Opening this conversation was recorded under your name." stays under the thread.
- **Reply form** (only when `can_reply` and `status.send`): a textarea (maxlength 400, as the mockup), the hint "One SMS of at most 160 plain characters. No web links. No marketing.", the counter "n / 160" (the `.over` style above 160), and "Send". Send is disabled when the text is empty or over 160; **the backend alone decides what a valid text is** and its message is shown. Without `can_reply` the form is replaced by "This sender is not a mobile number, so it cannot be replied to."; without `send` by "You can read the Inbox but not send texts." (no form, no request).
- **Sending.** A `request_id` of 32 random hex characters is made when the form is first submitted (`crypto.getRandomValues`) and **kept until the call is answered 200 or 201**, then replaced. A refused call frees it on the backend, so the same id may be sent again after an edit. If the call gets no answer (status 0) the form keeps the text and the id and says "We could not tell whether it was sent. Look at the conversation before you send again." On 201 or 200 the new message is added to the thread (it arrives `queued`, so "Waiting to send"), the field is cleared and the counter reset. The page does **not** poll for the status to change to Sent: a "Refresh" button in the conversation head calls `open` again (audited, once per press).
- **Errors on the form** (text kept, nothing cleared): `invalid_text` under the field with the backend's words; `rate_limited`, `limit_reached`, `sms_paused`, `sms_unavailable`, `forbidden`, `cannot_reply`, `request_in_progress` in the form's error box with the backend's `message`; `not_found` (the conversation went away, or access was removed) closes the conversation and shows the list with "That conversation is no longer available."; 401 follows `placeFor`; anything else "That did not go through. Check the conversation before trying again."

### 5.6 New SMS (`/inbox/sms/new/`)

The mockup's `compose.html`: the platform menu, the Back link "SMS", the heading "New SMS", the form (Mobile number, Message with the counter) and the aside: the "Before you send" list (no marketing; one number at a time on this form; no web links; the text is kept for 365 days and who sent it is recorded) and the status chips from `inbox/status/`, and the line "300 texts a day are kept for sign-in codes. Staff texts stop once 1,700 are used that day." with the numbers computed from `reserved_for_codes` and `cap`.

- Only for a staff user with `send`; otherwise the same "read but not send" card as 5.5 and no form.
- The number is sent as typed in `to` (the backend normalises and refuses). `invalid_mobile` shows under the number field; `invalid_text` under the message; the error box heading "Nothing was sent" with "Fix the field marked below, then send again." as in the mockup.
- Same `request_id` rule as 5.5. On 201 the page shows the new conversation **in the same page, in memory** (the `conversation` id of the answer opens it through `open`, so the texts shown are the backend's; this one `open` is audited like any), replaces the history entry with `/inbox/sms/`, and a reload shows the list. After a 200 (an id already used) it does the same.
- The number field is cleared after a send. It is never stored.

### 5.7 Other platforms (`/inbox/<platform>/`)

The mockup's `platform.html`: the platform menu with the current one marked, the card "{Name} is not yet available", the sentence "Only SMS works in the Inbox today. Nothing is received or sent on this platform.", and a button "Go to SMS". The five names are fixed text chosen from the path; an unknown name is the not-found page. The page calls `me/` and `inbox/status/` only (to show the page only to a staff user who can open the Inbox, and the "closed" card otherwise), shows no conversation and promises no date.

## 6. Files

**New (all under `apps/hq/`):**

| File | What |
|---|---|
| `public/inbox.html` | The chrome of `finance.html` and one `<main>` holding the list, the conversation, the compose form and the closed and down cards, each hidden until the script shows it |
| `public/inbox-platform.html` | The "not yet available" page |
| `public/assets/js/inbox.js` | The list, the conversation and compose (one script: the views share the status, the thread and the form) |
| `public/assets/js/inbox-platform.js` | The tiny script of the platform page |
| `tests/inbox.test.mjs`, `tests/inbox-menu.test.mjs`, `tests/inbox-platform.test.mjs` | Section 8 |

`inbox.html` is served at `/inbox/sms/` and `/inbox/sms/new/`; the script reads `location.pathname` once to choose the first view.

**Shared files the build touches, by name, for the reviewers** (all of them are also touched by open PR 41, so this plan is built **after PR 41 merges**):

| File | Change |
|---|---|
| `public/assets/js/menu.js` | The gated Inbox entry and the one status call (5.2). Finance's line is not touched |
| `public/assets/js/hq.js` | `message` and `fields` on the result (5.1) |
| `next.config.ts` | The rewrites and redirects (5.3) |
| `public/assets/css/hq.css` | Only if a class the pages need is missing; the plan expects none (the mockup's rules are already in it) and the build reports any addition line by line |
| `README.md` | The "Pages" table gains the Inbox rows |
| `tests/menu.test.mjs`, `tests/topbuttons.test.mjs`, `tests/client.test.mjs` | The assertions that the Inbox entry is absent, that search and bell have no handler, and that a failure carries no `message`, change as 5.1 and 5.2 say, and stay true for any answer but 200 |

`config.js`, `hq-env.mjs` (the CSP), `shell.js`, `theme.js`, `auth.js`, `console.js`, `finance.js` and every backend file are **not touched**.

## 7. Tasks

Each task is test first, then code, then the checks (`pnpm --filter hq lint`, `test`, `build`, as `apps/hq/package.json` names them), then a commit. Branch from the latest `origin/main` once PR 41 and backend PR 98 are merged; update from `main` before the PR. Full code is written in the build, from the behaviour above; this plan fixes the behaviour, the tests and the order.

### Task 1: the addresses

- [ ] **Tests** (`rules.test.mjs`, a new case in `inbox.test.mjs`): `next.config.ts` rewrites the seven paths of 5.3 to the right file and redirects `/inbox/` and the `.html` files; no `public/*.html` or script builds an address from a number, name, text or id (a scan for `location.href =`, `assign`, `replace` and `pushState` calls with a computed argument); `pushState` is only ever called with the page's own `location.pathname`.
- [ ] **Code:** `next.config.ts`. **Checks;** commit.

### Task 2: the client and the menu

- [ ] **Tests** (`client.test.mjs`, `inbox-menu.test.mjs`): a failure carries `message` and `fields`, a success does not break; with `inbox/status/` answering 200 the menu has the Inbox entry with the count, `/inbox/` paths mark it current, search and bell lose `aria-disabled`, are labelled as 5.2 says, and go to `/inbox/sms/#find` and `/inbox/sms/`; the bell dot shows only when `unread` > 0; with 404, 401, 503, offline, or no `NOHq` there is no Inbox entry, both buttons stay `aria-disabled` with no handler, and no error is thrown; the call is one `POST inbox/status/` with `{platform: "sms"}` and nothing in the address.
- [ ] **Code:** `hq.js`, `menu.js`. **Checks;** commit.

### Task 3: the platform page

- [ ] **Tests** (`inbox-platform.test.mjs`): each of the five names shows its card and the fixed sentence; an unknown name is not shown; with `inbox/status/` 404 the closed card shows; the page makes no call but `me/` and `inbox/status/`; the Go to SMS link is `/inbox/sms/`.
- [ ] **Code:** `inbox-platform.html`, `inbox-platform.js`. **Checks;** commit.

### Task 4: the list

- [ ] **Tests** (`inbox.test.mjs`, using `tests/page.mjs` with answers per route): the boot sequence and the 401, 404 and offline states; the status chips (online and offline; the used count); "New SMS" only when `send`; "All" and "Unread n" (the unread filter posts `state: "unread"`); rows show the masked contact, the time, the unread pill and the status word for an outgoing last text, and **no text field of any answer ever reaches the list**; Load more passes `cursor` once per press; Find posts the typed number in the body only, clears the field, shows "No conversation with that number." for `[]`, "Show all" returns; Refresh calls list and status; no timer or interval exists in `inbox.js`; `#find` focuses the field; no call has anything in its address.
- [ ] **Code:** `inbox.html`, the list part of `inbox.js`. **Checks;** commit.

### Task 5: the conversation and the reply

- [ ] **Tests:** opening posts `{conversation}` from memory and shows the texts oldest first with day separators and the status words; a reason without words is not shown; `clipped` adds the note; "Earlier texts" posts `cursor` once per press and prepends; Back and the `popstate` close it; a reload (a fresh page) shows the list; the reply form shows only with `can_reply` and `send`, with the two alternate sentences otherwise; the counter and the disabled Send at 0 and above 160; the `request_id` has 32 hex characters, is kept after status 0 and after a refusal, and is replaced after 200 or 201; on 201 the message is added as "Waiting to send" and the field cleared; every error code of section 4 shows the right words in the right place, text kept; `not_found` closes the conversation with the list message; Refresh calls `open` once per press.
- [ ] **Code:** the conversation part of `inbox.js`. **Checks;** commit.

### Task 6: New SMS

- [ ] **Tests:** the form only with `send`; fields and errors as 5.6; the same `request_id` rule; on 201 the conversation of the answer is opened through `open` and the history entry is replaced with `/inbox/sms/`; the number field is cleared after a send and the number appears in no address, storage, title or `console` call.
- [ ] **Code:** the compose part of `inbox.js`. **Checks;** commit.

### Task 7: the whole check, the local walk, the captures

- [ ] Run `pnpm --filter hq lint`, `test`, `build`, and from the repository root whatever CI runs for the other apps, and report the actual output.
- [ ] **Local walk, as plan 2 did it** (http, headless Chromium, `hq.app.localhost:3003` against a local backend on `ggwp.app.localhost:8011`, a scratch database, one made-up staff identity, made-up numbers and texts, `sms_fake_phone`; local names only): switched off, no Inbox entry on the console or Finance page, search and bell inert; switched on and granted read only: the list, a conversation, no form; granted with `--send`: compose, reply, the status moving from Waiting to Sent after Refresh, every error of 5.5 reached at least once (a link, an empty text, a number that is not a mobile, the 60 an hour limit is read in the tests, not walked), Back, reload, Earlier texts (more than 50 made-up texts), the five platform pages.
- [ ] **Captures** for Coach Ed (local, made-up data only): the list (empty, with rows, with Unread, a Find result), a conversation (with a Not sent text and a Waiting text), the read-only conversation, New SMS (empty and with the error box), a platform page; dark and light, 1280 and 390 wide. **Not shown to him before and so needing his eye:** the light theme of all of them, the "closed" and "down" cards, the read-only states, "Earlier texts", and the two wired top buttons.
- [ ] README rows. Commit; update from `main`; list the open PRs and their files; open the PR; the coordinator merges after the Santé/onboarding and NPC reviews.

## 8. Tests, in short

Node's test runner, no browser library, driven through `tests/page.mjs` and `tests/dom.mjs`, as the other pages are. The tests prove the page follows the backend's answers and keeps the rules (no id or value in an address, nothing stored, no timer, no raw backend value shown). They do not prove the look or a real browser: that is the walk and the captures.

## 9. What goes to Coach Ed, and what does not

Nothing in this plan returns to Coach Ed before code ("build until plan 9"). His look comments come at the visual test of the built pages (his words, 2026-11-11: "ill comment for improvements in visual test").

### 9.1 Routine details decided here, his to overrule

| # | Decision | Why | Source |
|---|---|---|---|
| D1 | A conversation opens inside the list page, held in memory; no `/inbox/sms/c/<id>/` | The coordinator's ruling that no id is in an address; Finance holds its open payment in memory too | Brief 2026-11-11; design 3.1 differs |
| D2 | The Inbox menu item is drawn only after `inbox/status/` answers 200, from `menu.js` on every page | The backend gives no "may use the Inbox" answer elsewhere; 404 for off and not allowed look the same, so the page shows nothing | PR 98 `staff.py` |
| D3 | Search goes to the Find field (`/inbox/sms/#find`); bell goes to the list and shows a dot | Design 13 | Design 13 |
| D4 | "All" has no count; "Unread" uses `status.unread` | The API gives no total | PR 98 |
| D5 | The `request_id` is kept until a 200 or 201 | A refused attempt frees the id on the backend; a queued one is remembered for 24 hours | PR 98 `_once` |
| D6 | The mockup's chip "HQ line" is left out | No field supplies it | Mockup against the API |
| D7 | The send button is disabled at 0 and above 160 characters; the backend decides what is valid | The mockup's counter; the rules are the backend's | Design 6.5, 13 |
| D8 | No automatic refresh; a "Refresh" button on the list and on a conversation, each press one call (a conversation's is audited) | Design 13: "There is no automatic refresh" | Design 13 |
| D9 | After composing, the new conversation is opened in memory through `open` (one audited call) | The id cannot travel in an address | Brief 2026-11-11 |

### 9.2 What approving this plan approves, and what it does not

It approves building tasks 1 to 7 on a build branch, with the shared-file changes of section 6, after PR 41 and backend PR 98 are merged. It does **not** approve: any variable, host name, DNS record or `HQ_STAFF_ORIGIN` change; turning `SMS_INBOX_ENABLED` on anywhere; an access grant; the phone's incoming switch; a CSP change; Bulk SMS or Contacts; anything on production.

## 10. Verification, and what stays unverified

**Verified by reading** (frontend `main` `e0d6ba3`, PR 41 `1975008`, backend PR 98 `ec40bf3`): the six routes and their answers (section 4); that `hq.css` already holds the platform menu, the thread, bubble, counter, filter, find and error-box rules; that `focus.test.mjs` scans every file in `public/`; that `finance.js` holds the open item in memory and handles 401 and 404 as 5.4 describes; that the backend frees a refused `request_id`.

**Not verified (to check at build):**

1. The reasons the gateway's `report` can give for a `failed` text, for the reason-words table (5.5). Until read, no reason is shown.
2. That the bell dot rule in `hq.css` fits a button with `aria-disabled` removed (5.2).
3. How the side menu is reached at 390 wide on `main`: `finance.html` has no bottom bar, and the design speaks of one. The walk looks; if the phone menu cannot show a third entry, that is reported to the coordinator, not redesigned here.
4. Nothing has run: no code of this plan, no page in a browser, nothing on staging or production. PostgreSQL and real phones are the backend's.

## 11. Rollback

Each task is one commit; reverting the PR removes the Inbox pages and the gated menu entry, and leaves the app as PR 41 ships it. The backend is unaffected: with the switch off its routes already answer 404.

## 12. Shared files and other sessions

- **Open frontend PRs when written** (`gh pr list`, 2026-11-11): 41 (the Finance page, billing coordinator): `README.md`, `next.config.ts`, `hq.css`, `finance.js`, `hq.js`, `menu.js`, `shell.js`, four html files, `hq-env.mjs`, and tests. **It shares every shared file of section 6, so this plan is built after it merges**, and updates from `main` keeping both sides' lines (`menu.js` keeps Finance's entry; `next.config.ts` keeps its `/finance/` rule).
- **Backend:** PR 98 (plan 4 build) must be merged and deployed dark before the walk can use a merged backend; the build may use the PR 98 branch locally.
- **Plans 6 to 9** add Contacts and Bulk SMS entries and buttons to the same `menu.js` and list page; the first ready merges first and the other updates from `main`.

## 13. Self-review

- The two coordinator rulings with a visible effect (shell from PR 41; no id in an address) are 2.1 and 5.3. The focus rule is 2.4 and is already enforced by a test.
- Where the design and the code differ, the code is followed and each difference is named (section 4, D1).
- The page shows no number, text or id outside the page's own memory: not in an address (5.3), not in storage (README rule, test), not in the list (no text field is read there), and the one place a full number is typed (Find, compose) clears it after the call.
- The backend's `message` is shown only for nine named codes; any other answer gets a fixed sentence.
- Every action that changes anything sits behind a button press; there is no timer.
