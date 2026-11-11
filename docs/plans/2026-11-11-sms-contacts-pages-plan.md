# SMS Contacts pages (`apps/hq`) Implementation Plan (plan 7 of 11, plan only)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans, task by task. Steps use checkbox (`- [ ]`) syntax.

**ClickUp:** z8uq9me128 (SMS inbox, reply and compose, HQ). Written 2026-11-11 by the builder session of that task, for the coordinator's read, the Santé/onboarding coordinator's overlap check and the NPC coordinator's privacy read.

**Goal:** the Contacts pages of the HQ staff app: the contacts list with find and a group filter, add and edit a contact, the groups list, and the two-step CSV upload. They call the twelve POST routes of backend plan 6 (PR 99). Everything is switched off until the backend's `SMS_INBOX_ENABLED` and `SMS_CONTACTS_ENABLED` are set and a staff user is granted access; with either off the Contacts item does not appear anywhere.

**This PR changes one file: this plan.** No code is built by it.

## 1. Sources

| Source | What it gives |
|---|---|
| Design `docs/superpowers/specs/2026-11-11-sms-inbox-hq-design.md` (backend repo), sections 19, 9, 13 | The screens, the CSV rules, masking, who may use it |
| Mockup `docs/superpowers/specs/mockups/2026-11-11-sms-inbox/` (`contacts`, `contact`, `groups`, `import`, `mockup.css`) | The look Coach Ed approved ("approved the look", 2026-11-11, dark theme, 1280 and 390) |
| Backend plan 6, PR 99 (head `27332875`, approved by the coordinator), section 5 task 4 and section 6 | The routes, bodies, answers and errors, section 4 below. **The backend is not built yet: the shapes are the plan's, to be checked against the built code at build time** |
| Frontend plan 5 `docs/plans/2026-11-11-sms-inbox-pages-plan.md` (merged, `93f213b`) | The page pattern, the client change, the menu gate, the rulings this plan repeats |
| Frontend `main` at `93f213b` (`apps/hq`) | `hq.css` (every class the mockups use is already there: `.seg`, `.batch`, `.strip`, `.chip-neutral`, `.form-card`, `.pair`, `.checks`, `.upload`, `.file`, `.facts`, `.step`, `.results`, `.cols`, `.banner`, `.list-foot`), `menu.js`, `hq.js`, `next.config.ts` |
| The coordinator's briefs of 2026-11-11 | The rulings of section 2 |

## 2. Rulings this plan follows (not reopened)

1. **The shell is the one on frontend `main`** (wordmark "NegosyoOnline HQ", the user chip foot), as plan 5. The pages copy the chrome of `finance.html` and load `hq.js`, `menu.js`, `shell.js`, then their own script.
2. **Contacts is its own item in the side menu, under Inbox** (design 19.2, R21). The Contacts pages carry **no platform menu** (`.set-tabs`); "Contacts" is the current menu item on all of them, and the add, edit and upload views link back to Contacts. The Contacts and Groups switch is the mockup's `.seg`.
3. **Focus** (Coach Ed): light-blue input border and ring; light-blue keyboard ring on buttons, tabs and links; no heading or card title ever focused; no gold. `tests/focus.test.mjs` already covers every file in `public/`.
4. **Routes:** the POST-only `/staff/v1/contacts/*` routes. **No number, name, group name, text or id is in an address.** The page keeps nothing in the browser but the theme.
5. Everything switched off; no real contact stored; no Railway variable, DNS record, host name or `HQ_STAFF_ORIGIN` change; no CSP change; no Django admin.
6. From the design: hand-entered only, no link to Subscriber accounts (R22); a name is never put into a text; the full number is shown only on a contact's own form (design 19.2).

## 3. Scope

**Built:** four addresses served by one HTML file and one script: `/contacts/` (the list, and an existing contact opened inside it), `/contacts/new/` (add a contact), `/contacts/groups/` (the groups), `/contacts/upload/` (the two-step upload); the "Contacts" menu item; the tests.

**Not built, each its own plan or ruling:** Bulk SMS and its group picker (plans 8, 9); anything about opting out (the mockups' "Opted out of bulk SMS" chip and the "replied STOP" lines wait for plan 8, whose API has the field); a total count of contacts (the API has none); merging, exporting, custom fields (design 19.11); a contact's name beside a conversation; any change to the Inbox pages.

## 4. What the backend answers (plan 6, not yet built)

All `POST`, JSON body, staff origin and the HQ cookie. **A staff user with no inbox access, either switch off, and the migration missing all answer `404 not_found`:** the page cannot tell them apart and shows nothing about Contacts. Every answer carries `Cache-Control: no-store`.

| Route | Body | Answers |
|---|---|---|
| `contacts/status/` | none | `{read: true, change: bool}` |
| `contacts/list/` | `group?` (id), `query?`, `cursor?`, `limit?` | `{results: [{id, first_name, last_name, mobile, groups: [{id, name}]}], next}`, oldest first, 20 a page (100 at most). `mobile` is masked. A `query` that is a Philippine mobile finds that contact (audited by the backend); any other query of 2 to 80 characters is a name search |
| `contacts/open/` | `contact` | The same row with the **full** `mobile`. Audited. 404 if none |
| `contacts/add/` | `first_name`, `last_name?`, `mobile`, `groups?` (ids) | 201 and the contact |
| `contacts/edit/` | `contact`, then as add | 200 and the contact |
| `contacts/delete/` | `contact` | 204 |
| `contacts/groups/list/` | none | `{results: [{id, name, count}]}`, by name, not paged |
| `contacts/groups/add/` | `name` | 201 and the group |
| `contacts/groups/rename/` | `group`, `name` | 200 and the group |
| `contacts/groups/remove/` | `group` | 204 |
| `contacts/upload/check/` | `group`, `csv` (the file's text) | `{lines, new, existing, repeated, refused: [{line, reason}] (the first 200), refused_count}`. Saves nothing and is not audited |
| `contacts/upload/` | `group`, `csv`, `expected_new` | 201 and `{lines, added, existing, refused, repeated}` |

**Errors** (`{error: {code, message, fields}}`): `invalid_request` (`fields.first_name`, `mobile`, `name`, `group`, `csv`), `already_exists` (409; `fields.contact` or `fields.group` holds the id of the one that has the number or name), `changed` (409), `forbidden` (403: read-only access on a change), `not_found` (404), `invalid_cursor`, `invalid_file`, `file_too_large` (413), `group_limit`, `unauthenticated` and `second_step_required` (401).

**Where the design and the mockup differ from this API** (routine, from plan 6): every route is a POST and an id is in the body; there is no total of contacts; there is no `opted_out`; the check holds nothing, so the save sends the file again with `expected_new`; the refused lines are returned as line and reason, at most 200, with no download route.

## 5. The behaviour, page by page

### 5.1 Sharing with plan 5

Plan 5 changes `hq.js` so a failure carries `message` and `fields`, and `menu.js` so an entry can be gated on a status call. This plan **uses both and builds on them**: it is built after plan 5's build has merged. If it has not, the build stops and the coordinator is asked; this plan does not redo that work.

### 5.2 The menu

`menu.js` gains an entry `{href: "/contacts/", label: "Contacts", gate: "contacts"}` after Inbox. A gated entry is **not drawn** until `contacts/status/` answers 200. The call is made once per page load, after `hq.js`; on any other answer, offline or no `NOHq`, nothing is drawn and no error is thrown. The entry is current for every path that starts `/contacts/`. No count is shown on it. The call writes no audit entry and carries no value. Search and bell are plan 5's and are not touched.

### 5.3 The addresses (no value in any)

`next.config.ts` gains rewrites for `/contacts/`, `/contacts/new/`, `/contacts/groups/` and `/contacts/upload/` to `contacts.html`, and a redirect from `/contacts/` index forms and from `/contacts.html` back to `/contacts/`, as Finance has. **An existing contact has no address of its own:** Edit opens inside the list page with the id held in memory; Back closes it (one history state with the same address and no data, a `popstate` closes it); a reload returns to the list. Add and upload have their own addresses because they carry no id.

### 5.4 The list (`/contacts/`)

Top to bottom, as the mockup's `contacts.html`: the heading "Contacts"; the `.seg` "Contacts | Groups" (**no count on either**: the API has no total, and the Groups count would cost a call this page does not otherwise make); the buttons "Upload a CSV file" and "Add contact" (links to `/contacts/upload/` and `/contacts/new/`), shown only when `change` is true; the find toolbar; the list.

- **Boot.** `me/` for who is signed in, then `contacts/status/` and `contacts/groups/list/` (for the filter). A 401 goes to `/verify/` or `/sign-in/` as Finance does. A 404 shows the closed card "Contacts are not available." with no reason. Offline or any other answer shows "Contacts could not be reached. Try again." and a button.
- **Find.** One field "Find by name or full mobile number" and "Find", as the mockup. Find posts `{query}` and replaces the list with the answer, with the line "Showing contacts that match your search" and a "Show all" button; an empty answer says "No contacts match." **The query is cleared from the field after the call and is never written anywhere else, not even into the line** (it may be a full number). A query under 2 characters is not sent: "Type at least 2 letters or a full number."
- **Group filter.** The mockup's select, "All groups" and one option per group. Choosing posts `{group}` (combined with an active search if there is one). The options come from `groups/list`; group names are put in with `textContent`.
- **Rows.** One row per contact as the mockup: the name ("First Last"), the masked number, one `.chip-neutral` per group, or "No group" in `.small`. A button "Edit" (or "View" when `change` is false) opens it. A name and a group name are written with `textContent` only. **No full number is in any list.** "Load more" passes `cursor` while `next` is set; the foot reads "Showing {n} contacts. Numbers are masked." where n is the number loaded (no total). Empty: "No contacts yet." (with the Add button when `change`) or "No contacts match."
- **The mockup's "Opted out of bulk SMS" chip is not drawn.** Plan 8 adds it with the API field.

### 5.5 Edit a contact (inside the list page) and Add (`/contacts/new/`)

The mockup's `contact.html`. Heading "Edit contact" or "Add contact"; Back link "Contacts".

- **Edit** posts `open` with the id from memory and fills the form with the first name, last name, **full number** and the group checkboxes from `groups/list` (checked from the contact's groups). Opening is audited by the backend; the note "Opening this contact was recorded under your name." is shown under the form. The number is in the form field only: not in the address, the title, storage, or any other element.
- **Fields.** First name (required), last name, mobile number (`inputmode="tel"`, the hint "A Philippine mobile number. One contact per number."), Groups as checkboxes (the mockup's `fieldset.checks`). **The backend alone decides what is valid;** the form checks only that the first name and number are not empty, and shows the backend's `message` and `fields`.
- **Save.** Posts `add` (201) or `edit` (200). On success: Add returns to the list with "Contact added."; Edit closes the form and updates the row in memory from the answer (which carries the masked number) with "Contact saved.". The number field is cleared and the form removed from the page at once.
- **`already_exists`** (409) shows under the number field "That number is already a contact." with a button "Open that contact", which posts `open` with `fields.contact` (an audited call) and opens it in the same place. It is not a link: no address holds an id.
- **Delete contact** (Edit only, `change` only): a modal "Delete this contact? Its name, number and group memberships are removed now. This cannot be undone." with "Delete" and "Cancel", as Finance's modals; posts `delete`; 204 returns to the list with "Contact deleted." Cancel keeps everything.
- **Read-only** (`change` false): the same form with every field disabled, no Save, no Delete, and the line "You can read contacts but not change them."
- **The aside** ("About contacts"): "A contact is a first name, a last name, a mobile number and its groups." "Kept until staff delete it." "Adding, changing and deleting are recorded with your name, never the contact's name." The mockup's bullet about STOP is left out until plan 8.
- **Errors:** `invalid_request` under the field named in `fields` with the backend's `message` for that field's wording; `forbidden` and `group_limit` in the form's error box with `message`; `not_found` (deleted by someone else) closes the form with "That contact is no longer available."; 401 follows `placeFor`; anything else "That did not go through. Check the list before trying again."

### 5.6 Groups (`/contacts/groups/`)

The mockup's `groups.html`: the heading, the `.seg` with Groups current, the "Add a group" form (one field, `maxlength` 60, "Add group"; shown when `change`), the list: one row per group with its name and "{count} contacts" (singular for 1), and, when `change`, "Rename" and "Remove" buttons. The foot: "Removing a group keeps its contacts. A contact can be in more than one group."

- **Add** posts `groups/add`, puts the new group in the list in memory from the answer. `already_exists` (409): "A group with that name already exists." (the check ignores capitals, the backend decides).
- **Rename** turns the row into an inline field with "Save" and "Cancel" (a modal if the inline form does not fit at 390 wide; decided at build and reported). Posts `groups/rename`.
- **Remove** opens a modal "Remove this group? Its {n} contacts stay in Contacts." with "Remove" and "Cancel"; posts `groups/remove`; 204 removes the row. The group's id is held in memory; the name appears only inside the page.
- Group names are written with `textContent` only. Nothing is stored. `group_limit` and `forbidden` show `message` in the list's error line.

### 5.7 Upload (`/contacts/upload/`)

The mockup's `import.html`, two steps on one page.

- **Step 1: Choose the file and the group.** A file input (`accept=".csv,text/csv"`), the hint from the mockup ("Three columns in this order: first name, last name, mobile number. A header row is fine. Other columns are ignored and not kept. The file is read once and is not stored.") plus "Save the file as CSV UTF-8", and a select of groups (from `groups/list`; if there are none, "Add a group first" with a link to `/contacts/groups/`). The page reads the file with `file.text()` into a variable. **A file over 1,048,576 bytes is refused in the page before any call** ("The file is over 1 MB."). The text is held in memory only, never in storage, the address or the DOM (the file input holds the file; no element shows its contents). "Check the file" posts `upload/check` with `{group, csv}`.
- **Step 2: Check and save.** Shown only after the check answers. The `.facts` list: "Lines read" (`lines`), "New contacts" (`new`), "Already in contacts" (`existing`), "Refused lines" (`refused_count`), and "Repeated in the file" (`repeated`) only when above 0. The sentence: "**{new} new contacts** will be added to **{group}**. The {existing} numbers already in contacts are not added again; they are put in {group} and keep their names." (group name from the select's text, written with `textContent`). The refused lines as the mockup's `.results`: "Line {n}" and the chip with the reason in words from a fixed table keyed on the backend's reason (three kinds: fewer than three columns, missing or too-long name, not a Philippine mobile); an unknown reason shows "Refused". Only the first 200 are listed; when `refused_count` is more, "Showing the first 200 of {refused_count} refused lines." The button "Download the refused lines" builds a small CSV of line number and reason from what the answer holds, no name and no number, and offers it with `a[download]` from a `blob:` address that is revoked at once; it is **not a call and not a page address**. If the browser or the CSP stops it, the button is left out and that is reported (the on-page list stays). **The mockup's "replied STOP" sentence is left out until plan 8.**
- **Save.** The button reads "Add {new} contacts", or "Put {existing} contacts in {group}" when `new` is 0 and `existing` above 0, and is disabled when both are 0 ("Nothing to add."). It posts `upload` with the same `group`, the same `csv` text from memory and `expected_new` from the check. On 201: "{added} contacts added to {group}. {existing} were already contacts." with the counts, a link "Back to Contacts", and the file text, the selected file and the check are dropped from memory. On 409 `changed`: "The file or the list of contacts is not as it was when it was checked. Check it again." and step 2 is closed so the user checks again. `file_too_large` (413), `invalid_file`, `forbidden`, `not_found` (group gone): the backend's `message` in the error box.
- **Leaving.** Choosing another file, another group, pressing Back or reloading drops the text and the check. Nothing is saved at step 1, and the page says so (the mockup's "Nothing is saved at this step.").
- **Read-only** (`change` false): no form; "You can read contacts but not change them." and the link back.

## 6. Files

**New (under `apps/hq/`):**

| File | What |
|---|---|
| `public/contacts.html` | The chrome of `finance.html` and one `<main>` holding the list, the form, the groups, the upload and the closed and down cards, each hidden until the script shows it |
| `public/assets/js/contacts.js` | The one script; it reads `location.pathname` once to choose the first view |
| `tests/contacts.test.mjs`, `tests/contacts-groups.test.mjs`, `tests/contacts-upload.test.mjs`, `tests/contacts-menu.test.mjs` | Section 8 |

**Shared files the build touches, by name, for the reviewers:**

| File | Change |
|---|---|
| `public/assets/js/menu.js` | The gated Contacts entry after Inbox, with its status call (5.2). Plan 5's Inbox entry and Finance's line are not touched |
| `next.config.ts` | The rewrites and redirects (5.3) |
| `README.md` | The "Pages" table gains the Contacts rows |
| `tests/menu.test.mjs` | The assertion on the list of menu entries gains Contacts, absent unless the status call answers 200 |
| `public/assets/css/hq.css` | Only if a class the pages need is missing; the plan expects none and the build reports any addition line by line |

`config.js`, `hq-env.mjs` (the CSP), `shell.js`, `theme.js`, `auth.js`, `console.js`, `finance.js`, `hq.js` (plan 5 changed it) and every backend file are **not touched**.

## 7. Tasks

Each task is test first, then code, then the checks (`pnpm --filter hq lint`, `test`, `build`, as `apps/hq/package.json` names them), then a commit. Branch from the latest `origin/main` once plan 5's build and backend plan 6's build are merged; update from `main` before the PR. Full code is written in the build from the behaviour above; this plan fixes the behaviour, the tests and the order.

### Task 1: the addresses and the menu

- [ ] **Tests** (`rules.test.mjs`, `contacts-menu.test.mjs`): `next.config.ts` rewrites the four paths of 5.3 and redirects `/contacts.html`; no script builds an address from a number, name or id (a scan as plan 5's); `pushState` is only called with the page's own `location.pathname`; with `contacts/status/` answering 200 the menu has Contacts after Inbox and `/contacts/` paths mark it current; with 404, 401, 503, offline or no `NOHq` there is no entry and no error; the call is one `POST contacts/status/` with nothing in the address.
- [ ] **Code:** `next.config.ts`, `menu.js`. **Checks;** commit.

### Task 2: the list and find

- [ ] **Tests** (`contacts.test.mjs`, through `tests/page.mjs` with answers per route): the boot and its 401, 404 and offline states; "Add contact" and "Upload a CSV file" only with `change`; the filter options come from `groups/list` and posting one sends `{group}`; rows show the name, the masked number and chips, and the page never asks for or shows a full number in a list; names and group names holding `<b>` or quotes appear as text (no markup); Load more passes `cursor` once per press; Find posts `{query}`, clears the field, shows "No contacts match." for `[]`, "Show all" returns; the typed query appears in no element, address, storage or `console` call; a query of one character sends nothing; no timer or interval in the script.
- [ ] **Code:** `contacts.html`, the list part of `contacts.js`. **Checks;** commit.

### Task 3: add, edit, delete

- [ ] **Tests:** Edit posts `open` with the id from memory and fills the form; the full number is in the field only; saving clears the field and removes the form; Add at `/contacts/new/` posts `add` and returns to the list; `invalid_request` shows under the right field; `already_exists` shows "Open that contact", which posts `open` with `fields.contact` and opens that contact; Delete asks once and Cancel posts nothing; `not_found` closes the form with the list message; read-only shows disabled fields and no Save or Delete; Back and `popstate` close the form; a reload shows the list; the number appears in no address, storage, title or `console` call.
- [ ] **Code:** the form part of `contacts.js`. **Checks;** commit.

### Task 4: groups

- [ ] **Tests** (`contacts-groups.test.mjs`): the list shows names and counts (singular for 1); Add, Rename and Remove post the right bodies with the id from memory; `already_exists` shows the sentence; Remove asks once and Cancel posts nothing; read-only shows no Add, Rename or Remove; a name holding markup appears as text; `group_limit` shows its message.
- [ ] **Code:** the groups part of `contacts.js`. **Checks;** commit.

### Task 5: the upload

- [ ] **Tests** (`contacts-upload.test.mjs`): a file over 1,048,576 bytes sends nothing; "Check the file" posts `{group, csv}` with the file's text; step 2 shows the five facts (the fifth only above 0), the sentence with the chosen group, the refused lines with line and reason only and the "first 200 of N" line; no name or number from the file is shown anywhere (the test's file holds made-up ones, and the DOM is searched for them); Save posts `expected_new` from the check and the same text; the label changes for `new` 0; Save is disabled when both are 0; 201 shows the counts and drops the text, the check and the file; 409 `changed` closes step 2 and shows the sentence; choosing another file or group drops the check; the file text appears in no storage, address or `console` call; the refused-lines download holds only line numbers and reasons; read-only shows no form.
- [ ] **Code:** the upload part of `contacts.js`. **Checks;** commit.

### Task 6: the whole check, the local walk, the captures

- [ ] Run `pnpm --filter hq lint`, `test`, `build`, and whatever CI runs for the other apps, and report the actual output.
- [ ] **Local walk, as plan 2 and plan 5 did it** (http, headless Chromium, `hq.app.localhost:3003` against a local backend on `ggwp.app.localhost:8011`, a scratch database, one made-up staff identity, made-up names and numbers, local names only): both switches off, no Contacts entry on any page; `SMS_CONTACTS_ENABLED` unset with the inbox on, still no entry; both on, read-only: the list, an opened contact, no buttons; granted with `--send`: add (and the same number written another way, refused with the link), edit, delete, groups (add, rename, remove), a made-up CSV of about 750 lines with bad lines mixed in (check, save, a second save refused), a file over 1 MB, Back, reload. With the backend's `inbox.0002` not applied: no Contacts entry.
- [ ] **Captures** for Coach Ed (local, made-up data only): the list (empty, with rows, a Find result), an opened contact and the add form (with the error under a field and "Open that contact"), read-only, the delete modal, groups (with the rename and remove modals), the upload at step 1, at step 2 with refused lines, and after the save; dark and light, 1280 and 390 wide. **Not shown to him before and so needing his eye:** the light theme of all of them, the closed and down cards, the read-only states, the modals, and what is left out of the mockup (no counts on the Contacts and Groups switch, no opted-out chip, "Load more" in place of "Next").
- [ ] README rows. Commit; update from `main`; list the open PRs and their files; open the PR; the coordinator merges after the Santé/onboarding and NPC reviews.

## 8. Tests, in short

Node's test runner, no browser library, driven through `tests/page.mjs` and `tests/dom.mjs`, as the other pages. They prove the page follows the backend's answers and keeps the rules: no value or id in an address, nothing stored, no timer, no raw backend value shown outside the named messages, every name written as text. They do not prove the look or a real browser: that is the walk and the captures.

## 9. What goes to Coach Ed, and what does not

Nothing in this plan returns to Coach Ed before code ("build until plan 9"). His look comments come at the visual test of the built pages.

### 9.1 Routine details decided here, his to overrule

| # | Decision | Why | Source |
|---|---|---|---|
| E1 | An existing contact opens inside the list page, held in memory; Add and Upload have their own addresses, none with a value | The ruling that no id is in an address; Edit needs an id, Add and Upload do not | Plan 5 D1; design 19.2 ("exact paths are for the plan") |
| E2 | The Contacts and Groups switch shows no counts | The API has no total of contacts; a groups count would cost a call | Plan 6 C14 |
| E3 | "Load more" replaces the mockup's "Next"; the foot says how many are loaded, not "of 2,412" | The backend pages by cursor and gives no total | Plan 6 C14 |
| E4 | The opted-out chip, the opted-out count and the "replied STOP" bullets are not drawn | The do-not-text list is plan 8; no field exists yet | Plan 6 C13 |
| E5 | The query typed in Find is cleared after the call and not echoed | It may be a full number | Plan 5 5.4 |
| E6 | "Download the refused lines" builds its file in the page from line and reason, for the first 200 only, and is left out if the CSP or browser stops it | The backend has no download route and returns no values | Plan 6 C9 |
| E7 | The file's text is held in memory between the check and the save and sent twice | The backend holds nothing between the steps | Plan 6 C8 |
| E8 | "Open that contact" after a duplicate number is a button that posts `open` (one audited call) | No id may be in an address | Plan 6 C6 |
| E9 | A read-only user sees every form disabled, with no Save, Delete or buttons that change | Design 19.6 | Plan 6 C3 |
| E10 | The mockup's phone bottom bar (Inbox, Contacts, Console) is not built by this plan | The app has none on `main`; see 10, item 2 | Plan 5 section 10 item 3 |

### 9.2 What approving this plan approves, and what it does not

It approves building tasks 1 to 6 on a build branch, with the shared-file changes of section 6, after plan 5's build and backend plan 6's build are merged. It does **not** approve: any variable, host name, DNS record or `HQ_STAFF_ORIGIN` change; turning `SMS_INBOX_ENABLED` or `SMS_CONTACTS_ENABLED` on anywhere; an access grant; storing any contact in a shared environment (gated on the NPC and privacy wording, design 14 points 16 and 17); a CSP change; Bulk SMS; anything on production.

## 10. Verification, and what stays unverified

**Verified by reading** (frontend `main` `93f213b`, backend plan 6 at `27332875`): every class the four mockups use is already in `hq.css`; plan 5's gate and client change; the twelve routes, their bodies and errors in the plan; the mockup's four pages.

**Not verified (to check at build):**

1. The backend answers: plan 6 is not built. The shapes in section 4 are the plan's. The build reads the built code and reports every difference before writing the page.
2. How the side menu is reached at 390 wide on `main`: the mockup shows a bottom bar of Inbox, Contacts and Console; plan 5 found none on `main`. If the phone menu cannot show a fourth entry, that is reported to the coordinator, not redesigned here.
3. Whether `a[download]` from a `blob:` address works under the app's CSP in Chrome and Safari (E6). If not, the button is dropped.
4. Whether a body near 2.4 MB (a 1 MB file, JSON-escaped) passes through the real hosts; the backend's plan did not read the proxy's limit.
5. That `file.text()` decodes a file saved in a legacy Windows encoding as damaged names; the hint asks for CSV UTF-8, and the page does not try to detect an encoding.
6. Nothing has run: no code of this plan, no page in a browser, nothing on staging or production.

## 11. Rollback

Each task is one commit; reverting the PR removes the Contacts pages and the gated menu entry, and leaves the app as plan 5 ships it. The backend is unaffected: with either switch off its routes already answer 404.

## 12. Shared files and other sessions

- **Open frontend PRs when written** (`gh pr list`, 2026-11-11): 41 only (the Finance page, billing coordinator); it touches `menu.js`, `next.config.ts`, `README.md`, `hq.css` and tests; this plan's build is after plan 5's build, which is after PR 41. The list is read again before the build PR.
- **Plan 5's build** adds the Inbox entry to `menu.js` and the client change to `hq.js`; this plan keeps both sides' lines.
- **Plans 8 and 9** add the Bulk SMS entry, the opted-out chip and a group picker; the first ready merges first and the other updates from `main`.
- **Backend:** plan 6's build must be merged and deployed dark, and `inbox.0002` applied wherever the walk is run against a shared backend (it is not: the walk is local).

## 13. Self-review

- The rulings with a visible effect (no id in an address; the shell from `main`; Contacts its own menu item with no platform menu; focus) are 2.1 to 2.4 and 5.3.
- Where the design, the mockup and the planned API differ, the API is followed and each difference is named (section 4, 9.1).
- The page shows no full number outside the one form field, no name outside the page's memory, and stores nothing; the one place a full number is typed outside that form (Find) clears it after the call; the file's text is dropped after the save or on leaving.
- The backend's `message` is shown only for the named codes; any other answer gets a fixed sentence.
- Every change sits behind a button press; there is no timer.
