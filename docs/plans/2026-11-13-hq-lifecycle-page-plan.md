# HQ "Lifecycle" page (site deletion executor, frontend PR 3) Plan (plan only)

Date: 2026-11-13. ClickUp task: z8uq9mb22v (https://app.clickup.com/t/z8uq9mb22v), P10.3 "Build human-approved data lifecycle". Parent z8uq9mb226. Supervisor: BILLING (main task z8uq9m8h46).
Status: **plan only. Not approved. No application code is in this branch.** The only other file is the static mockup `docs/plans/mockups/hq-lifecycle.html` (fixture data, no script that calls anything).
Branch: `plan/z8uq9mb22v-hq-lifecycle`, cut from `origin/main` `667adde`. The build branch is cut from the latest `origin/main` when this plan is approved.

## 1. Sources

| Short name | Source |
|---|---|
| Backend plan | Backend repo, `git show origin/main:docs/superpowers/plans/2026-11-13-site-deletion-executor-z8uq9mb22v.md` (approved): sections 4 (who is eligible), 5 (holds), 6 (how a human approves it), 12 (D2, D7, D12, D14), 13 item 3 (this page) |
| Routes | Backend branch `origin/feat/z8uq9mb22v-deletion-executor-pr2` at `691988b`: `apps/lifecycle/staff.py`, `workflow.py`, `dry_run.py`, `eligibility.py`. **Read as code, not from the plan text.** The branch is not on `main` yet, so the shapes below can still move; the build re-reads them |
| HQ app | This repo at `667adde`: `apps/hq/public/*.html`, `assets/js/{hq,menu,shell,finance-common,finance-usage,finance-accounts}.js`, `assets/css/hq.css`, `next.config.ts`, `tests/` (`page.mjs`, `dom.mjs`, `rules.test.mjs`, `focus.test.mjs`, `menu.test.mjs`, `finance-usage.test.mjs`), `README.md`; `docs/plans/2026-11-11-hq-staff-app-plan.md` |
| Rulings | Focus and active input border light blue, never gold, headings never focusable (`focus.test.mjs`); no Django admin screens, staff work in HQ; one staff account (rulings log on z8uq9med6x) |

## 2. Scope

**In (PR 3, one frontend PR, `apps/hq` only):** one new HQ page at `/lifecycle/` that lets the one approver (a) read the dry run, (b) propose a batch of 1 to 25 due sites, (c) read the frozen batch and approve it with the typed confirmation, (d) cancel a batch, (e) place and release holds, (f) read batch status and per-item outcome.

**Out:** any backend change (the routes exist in backend PR 2); a "run now" button (there is no run route: an approved batch runs by the Celery task every 5 minutes or `manage.py erasure_run`); sending or resending any email (the dry run only shows `notice_sent`); site names, owner names, emails, numbers or addresses (the routes return none, so none can be shown; sites are identified by public id only, see decision L1); editing or deleting a hold's reason; export of the list; a second approver or staff management (one account); Pack buyer data controls; the 5-year billing sweep; any public wording; production behaviour (the page is the same code everywhere, the backend switch `SITE_ERASURE_ENABLED` decides, and is off until Coach Ed names an environment).

## 3. Address and navigation

- **Address:** `/lifecycle/`, one document `public/lifecycle.html`, rewritten in `next.config.ts` like `/finance/usage/`, with `/lifecycle.html` redirecting to `/lifecycle/`. One address, several views held in memory (the Usage pattern): the open batch is a variable, never in the address, so a reload returns to the overview and no id is in an address or history.
- **Navigation: its own side-menu entry "Lifecycle", between Finance and Settings, always drawn.** Recommended over a Finance sub-tab because: (1) it is not money and it is the only page that erases data; a distinct entry and a distinct page title make a mis-click less likely; (2) the Finance sub-navigation row is hand-copied into six pages (`finance*.html`), so a new tab means editing six files and their tests, against "small, scoped" changes; (3) `menu.js` takes one added line in `MENU` and the sheet copy follows (its own header says "A later page adds ONE line to MENU and nothing else"). Not gated like the Inbox (no extra call on every page; the dry run is the heaviest read and must not run on every page load). The entry is drawn for the one staff account; when the switch is off, the page shows the "not switched on" card.
- Icon (24 by 24 line path): a box with a line through it, `M4 7h16v13H4zM9 11h6M2 3h20v4H2z`. Label "Lifecycle". Current for `/lifecycle/` (exact match, no `within`).

## 4. Routes called

All through `NOHq.call("POST", path, body)` (`hq.js`, the cookie signs it; every lifecycle route is a POST with a small JSON body, at most 4096 bytes, and answers `Cache-Control: no-store`). No other call, no `fetch` in the page (`rules.test.mjs` forbids it). Errors arrive as `{error:{code,message,fields}}` and `hq.js` returns `{ok,status,code,message,fields,data}`.

| Route (under `/staff/v1/`) | Request | Success body (fields the page reads) |
|---|---|---|
| `lifecycle/erasure/list/` | none | `as_of`, `lifecycle_checked`, `retention_enabled`, `eligible[]`, `near[]`, `refused[]`. `eligible[]` item: `site`, `template`, `account`, `state`, `service_ended_at`, `deletion_due_at`, `days_overdue`, `counts{}` (rows per table), `private_files`, `account_action` ("dispose" or "keep"), `account_reason` ("catalog_owner", "other_live_site", "retention_switched_off" or ""), `notice` ("sent", "not_sent", "no_notice_for_state"), `notice_sent` (bool), `usage_to_write_off` (bool). `near[]`: `site`, `deletion_due_at`, `days_until`. `refused[]`: `site`, `deletion_due_at`, `reason_code` ("already_erased", "held", "payment_under_review", "unpaid_usage"), optional `hold_reason` |
| `lifecycle/erasure/batches/` | none | `batches[]` (newest first, at most 50) and `holds[]` (open holds: `site`, `reason_code`, `reference`, `placed_at`). A batch: `id`, `status` ("proposed", "approved", "running", "done", "needs_attention", "cancelled"), `proposed_at`, `expires_at`, `approved_at`, `approval_reason`, `digest`, `items[]`: `site`, `status` ("pending", "excluded", "skipped", "erased", "failed"), `reason_code`, `attempts`, `deletion_due_at`, `planned{counts{}, private_files, account_action, account_reason}`, `counts{}`, `erased_at`, `account_disposed` |
| `lifecycle/erasure/propose/` | `{sites:[site public id, 1 to 25]}` | one batch (same shape, status "proposed"). 409 `not_proposable` with `fields.sites` = list of `"<site>: <code>"` (codes: `already_in_batch`, `not_due`, the refusal codes above, `retention_switched_off`); 400 `invalid_request` |
| `lifecycle/erasure/approve/` | `{batch, confirmation, exclude:[site ids], reason}` | the batch, status "approved". 409 `confirmation_mismatch`, 409 `wrong_status`, 409 `proposal_expired`, 400 `invalid_request` with `fields.reason` or `fields.exclude`, 404 `not_found` |
| `lifecycle/erasure/cancel/` | `{batch, reason}` | the batch, status "cancelled". 409 `wrong_status` (a running batch cannot be cancelled), 400 `invalid_request` (`reason`), 404 |
| `lifecycle/erasure/hold/` | `{site, reason_code, reference}` | `overview()` (same body as `batches/`). `reason_code` one of `legal`, `fraud`, `dispute`, `regulator`, `other`; `reference` at most 100 characters, optional, no "@". 409 `already_held`, 400 `invalid_request` (`site` "No such site.", `reason_code`, `reference`) |
| `lifecycle/erasure/hold/release/` | `{site}` | `overview()`. 409 `not_held`, 400 `invalid_request` (`site`) |

Facts the page relies on and does not decide: the backend refuses everything the page could try wrongly (range 1 to 25, unknown site, already in a batch, wrong confirmation, expired proposal, text with "@"); the page's checks only save a round trip and never replace the backend's.

**Switch off.** While `SITE_ERASURE_ENABLED` is off every route above answers **404 `not_found`** before anything is read (`staff.py`, `_route`). The page treats a 404 from `list/` or `batches/` on load as "not switched on" (the Usage pattern: `res.status === 404` shows `v-closed`: "Lifecycle is not switched on."), not as an error. A 404 `not_found` from `approve/` or `cancel/` after the page was open means either the batch is gone or the switch went off: the page reads `batches/` again; a 404 there shows the off card, else it says "That batch no longer exists" and returns to the overview. `status 0` (no answer) and any other failure show "could not be reached" with Try again (`v-down`, as Usage).

## 5. Page design

Follows the Finance pages exactly: same shell (`.app`, `.side`, `.topbar`, `.col`, `.view`), `dash-card` cards, `.list` rows (`.batch`, `.batch-main`, `.batch-title`, `.item-sub`, `.chip`), `.no-btn` buttons, `.fin-row`/`.fin-cta`, `.fin-facts`, `.form-card`/`.field`/`.input`/`.textarea`, the `.modal` dialog with `NOFin.dialogs` (focus kept inside, Escape and X and Cancel only, focus back to the opener), `.banner fin-msg` for status, `.field-err` for errors. No new colour; the red `stop` ghost button for destructive actions as Usage's Dismiss. Focus ring and active field border are the existing light blue (`--link`); the page adds no focus rule. Desktop (side menu) and 390 px phone (top bar and sheet; rows stack; the table rows become stacked cards using the same `batch` flex wrap; the dialog is full width with `fin-block` buttons). Shared helpers come from `finance-common.js` (`NOFin`): this page loads it, adds nothing to it unless a helper is needed twice.

A mockup with fixture data is `docs/plans/mockups/hq-lifecycle.html` (overview, the batch review and approve step, the hold dialog, and the off, empty and error states). It links `hq.css` so the look is the real one.

### 5.1 Overview view (`v-main`)

Top: `h1.sr-only` "Lifecycle, site erasure". A status line (`role=status`): "As of 14 Nov 2026, 9:02 AM" and, when `retention_enabled` is false, a warning chip "Account disposal is switched off": an erasure that would dispose of an account cannot be proposed. A **Refresh** button re-reads both lists. When the dry run shows no eligible site and the batch list is empty, an explanatory empty state.

If no batch of this environment has ever been `done`, `needs_attention`, `running` or `approved`, a note card: "Nothing has been erased in this environment yet. The first batch is one site." (Backend plan D2.) See choice C3 for how the page helps.

**Section A: Due for erasure** (`eligible[]`), heading "Due for erasure" with a count.
Each row (a `li.batch`) has a checkbox with a visible label (the site id), then: site id, template chip ("Sante"), `days_overdue` ("12 days overdue", "due today"), "Ended 24 Nov 2026" and "Due 24 Dec 2026"; line 2: planned totals "1,284 rows, 3 files" (sum of `counts`, `private_files`); chips: **account will be disposed of** (info) or **account kept** with its reason in words; **service-end notice sent** (ok) / **no service-end email was sent** (warn) / "Paused, no notice sent for this state" (neutral) from `notice`; "open usage will be written off first" (neutral) when `usage_to_write_off`. A **Details** disclosure per row (button with `aria-expanded`/`aria-controls`) lists counts per table in words (the label map is in section 8; a table this page has no words for is summed into "Other records" and never shown raw). A **Hold** ghost button opens the hold dialog for the row's site.
Below the list: a sticky action row on the phone, plain row on desktop: "n of 25 selected" (`aria-live=polite`) and **Propose batch**. Propose is disabled with a stated reason when none is selected, or more than 25, or (C3) more than 1 on a first batch, or any selected row would dispose an account while retention is off (the row is itself shown with the chip and its checkbox disabled, with the reason in text). Propose calls `propose/`; on success it opens the new batch in the review view (5.2) with a message "Batch ebt_x9 proposed. Nothing has been deleted."; on 409 `not_proposable` the page lists each `"<site>: <code>"` in words under the button (`role=alert`), clears no selection, and re-reads the dry run (the data changed) keeping selections that are still on the list.
Empty: "No site is due for erasure." Select all is deliberately absent.

**Section B: Not yet due and stopped** (two lists in one card, collapsed behind a disclosure that is open when `refused` is not empty).
- Stopped (`refused[]`): site id, due date, reason in words: "Held" with the hold reason ("Legal", "Fraud"...), "Payment proof under review", "Open usage charges, an operator must decide", "Already erased". A held row has a **Release hold** button (with the dialog of 5.5); the other rows have **Hold** (except "Already erased", none).
- Coming up (`near[]`): "Due in 6 days" and the date, plus **Hold**.
Empty: "Nothing is stopped or coming up within 14 days."

**Section C: Batches** (`batches[]`, newest first, at most 50): per row the id, a status chip (Proposed (info), Approved (info), Running (info), Done (ok), Needs attention (warn), Cancelled (neutral)), "n sites", a one-line outcome ("7 erased, 1 skipped, 0 failed"), proposed time, and for a proposal "Expires in 6 days" (`NOFin.waited`-style; from `expires_at`; an expired proposal says "Expired" and has no Approve button). **Open** (ghost) opens the review view. Empty: "No batches yet."

**Section D: Holds** (`holds[]`): site id, reason in words, reference (plain text, as given), "Placed 13 Nov 2026"; **Release** per row. A form "Place a hold" (Site id text input, Reason select, Reference optional) opens the same dialog without a prefilled site (for a site not on any list). Empty: "No holds."

### 5.2 Batch view (`v-batch`), one batch, from Open or just after Propose

Header: back link "Back to Lifecycle", the batch id, status chip, `proposed_at`, and the digest shown as the first 12 characters with the label "List fingerprint" (so Coach Ed can compare it across the two screens; a copy of the whole digest is not offered). 
**If status is `proposed` and not expired: the approve step (5.3).** Otherwise a read-only status card: per item row (site id, status chip: Waiting, Excluded, Skipped, Erased, Failed; for skipped or failed the reason in words and `attempts` of 5; for erased the counts total, the time, and "account disposed of" when `account_disposed`), plus the approval line: "Approved 14 Nov 2026, 9:20 AM. Reason: <approval_reason>" (plain text). For `approved`: "Waiting for the next run. A run starts within about 5 minutes." For `running`: "Running. Refresh to see progress." For `needs_attention`: "Some sites failed 5 times and need attention. Cancel the batch or ask engineering." with **Cancel batch**. A **Refresh** button re-reads `batches/` and repaints (no timer, no polling; choice C4).

### 5.3 The approve step (what the approver reads first)

Order on the page, top to bottom, and the order of tab/reading focus:
1. **The warning card** (`dash-card` with the err style `q-notice`): "Approving erases the personal data of these sites. This cannot be undone." Then a count block (`fin-facts`): **Sites** n; **Rows to blank or delete** total; **Private files to delete** total; **Accounts to be disposed of** n (with "an account is closed with its last site"); **Sites with no service-end email** n (warn if > 0); **Fingerprint** 12 characters; **Proposal expires** date.
2. **The frozen list**, every item as a row with a checkbox "Keep in this batch" (default on), site id, due date, rows and files, account action, notice status, and the same Details disclosure of per-table counts. Unchecking a row marks it Excluded in the totals and in the typed text below; nothing can be added. 
3. **The reason**: label "Reason for approving (required, at most 300 characters)", `textarea`, character count, hint "A note for the record. No email address, name or number." The page rejects "@" before sending; the backend does too.
4. **The typed confirmation**: a sentence "Type the line below exactly to approve." then the expected line in a bordered, read-only text block (`erase batch ebt_x9 7 sites`, visually distinct, selectable, with the number following the checked rows live), then the text input `Confirmation` (`autocomplete=off`, `autocapitalize=off`, `spellcheck=false`, not prefilled, **no copy button**, paste is not blocked: the safeguard is reading, and Bulk's confirm field is the model). The **Approve and erase batch** button (red, `no-btn` `stop` style, `aria-haspopup=false`) is disabled until the trimmed input equals the expected line exactly, as Bulk's Send is; the server compares again and is the control. A hint under the field says why the button is off.
5. **Cancel batch** (ghost): opens a small dialog with the required reason (as Admit/Dismiss in Usage) and calls `cancel/`.

On success: the batch repaints as Approved, a message "Approved. The run starts within about 5 minutes."; focus goes to the status heading's region via the `role=status` message (not to a heading; headings are never given focus). 

### 5.4 Errors in the approve step

- `confirmation_mismatch`: under the confirmation field: "That does not match the batch and the number of sites. Check the line above." Field keeps what was typed; focus goes to the confirmation input.
- `invalid_request` with `fields.reason`: the backend's message under the reason; focus to the reason. `fields.exclude`: "Every site was excluded. Cancel the batch instead." focus to the first checkbox.
- `proposal_expired`: the batch repaints as Cancelled with "This proposal expired. Make the list again." and **Back to Lifecycle** (and the overview is re-read).
- `wrong_status`: re-read; show the batch as it now is with "This batch was already decided." 
- 404 and `status 0`: see section 4. The Approve button is disabled and a "busy" state set while the call is on its way (no double submit; dialogs and Escape locked while busy as Usage does).

### 5.5 Hold dialog (set) and release

**Place hold** dialog (opened from a row's Hold button, the Holds section's form, or the near/refused lists): fields **Site** (text, prefilled and read-only when opened from a row, editable otherwise), **Reason** (select: Legal, Fraud, Dispute, Regulator, Other; required), **Reference** (text, at most 100 characters, optional, hint "A case or ticket number. No name, email or address."). Buttons **Place hold** and Cancel. Calls `hold/`; the answer is the overview, so the page repaints holds and, because a held site leaves the due list, re-reads `list/`. Errors: `already_held` ("This site already has a hold."), `invalid_request` per field (`site`: "No such site."), shown under the field with `role=alert`, focus to the field. Help text in the dialog: "A held site is never erased, keeps its dates, and can be proposed again after the hold is released. A hold placed after approval stops that site's erasure."
**Release hold** dialog: states the site and the hold's reason and reference, button **Release hold**, no reason field (the route takes none). Errors: `not_held` ("This site has no hold.") then re-read.

## 6. States

| State | When | What shows |
|---|---|---|
| Loading | first load, refresh | `boot` / `-loading` text "Loading…"; `aria-busy` on the list |
| Off | 404 on the first `list/` or `batches/` | card "Lifecycle is not switched on." (`v-closed`); no tables, no buttons |
| Down | `status 0` or other non-2xx on load | card "Lifecycle could not be reached. Try again." with Try again |
| Signed out | 401 `unauthenticated`, `second_step_required` | `NOFin.left(res)` sends to sign-in / verify, as every Finance page |
| Empty | no eligible, no batches, no holds | each section its own empty sentence (section 5.1) |
| Partial failure | `list/` ok, `batches/` fails (or reverse) | the working section paints; the failed section shows "Could not load. Try Refresh." (`role=alert`) |
| Action failure | any write | the message under the control that was used, `role=alert`, focus moves there; the data re-read where the data may have changed |
| Retention off | `retention_enabled` false | warning chip; rows whose `account_action` is "keep" because of `retention_switched_off` cannot be selected |

## 7. Accessibility

- Every input has a visible `<label for>`; row checkboxes are labelled by the site id (and its due date through `aria-describedby`); the confirmation field is described by the expected-line block and its hint (`aria-describedby`); error paragraphs are `role="alert"`, referenced by `aria-describedby` and `aria-invalid="true"` on the field.
- Chips carry words, never colour alone. A warning is text ("No service-end email was sent"), not only the warn colour.
- Disclosures are buttons with `aria-expanded` and `aria-controls`. The selected count is `aria-live="polite"`. Lists are `<ol class="list">` with `aria-labelledby` the section heading.
- After an error, focus goes to the first field that errs (or the control that was pressed when there is no field); after success, to the status message region (not a heading); after closing a dialog, back to its opener (`NOFin.dialogs`); after Propose, to the batch view's status message. Headings never get `tabindex` and never receive focus (`focus.test.mjs`).
- Dialogs: `role="dialog"`, `aria-modal`, labelled and described, Tab kept inside, Escape and X and Cancel close, the backdrop does nothing, locked while a call is on its way.
- Focus ring and a field in focus: the existing light blue rules, unchanged. Target size 40 px or more for row buttons on the phone. Text contrast follows the existing tokens.
- 390 px: no horizontal scroll; rows wrap; the sticky Propose bar sits above the safe-area inset; the dialog scrolls inside itself.

## 8. Words, and what is never shown

A word map in `lifecycle.js` for: item and batch statuses, refusal and skip codes (`already_erased`, `held`, `payment_under_review`, `unpaid_usage`, `no_longer_due`, `date_changed`, `pack_purge_refused`, `store_unavailable`, `error`), `account_reason` codes, hold reasons, `notice` values, and a label map for the per-table count keys (taken from the backend's retention modules at build time; an unknown key is summed into "Other records"). A **code the map has no words for is shown as "a reason this page has no words for"**, not as the raw code and not hidden, because for a refusal the approver must see that something stopped the item (a variation on Usage's "left out", chosen because here silence could mislead). No value that identifies a person exists in any answer (ids, dates, counts, codes only), the page stores nothing (no `localStorage`, no cookie; `rules.test.mjs` forbids both), writes nothing to the console, and holds the open batch and selections in memory only. A hold's `reference` and a batch's `approval_reason` are staff-written plain text and are inserted with `textContent` only.

## 9. Tests (`apps/hq/tests`, the existing pattern)

New `lifecycle.test.mjs` (and `lifecycle-page.mjs` if the helper is shared, as `bulk-page.mjs`), driven by `page.mjs` (`open([...], {ids, pathname:"/lifecycle/", answers})`) and `dom.mjs`, with fixture answers only. Cases:
1. Load: asks `GET me/`, then calls `list/` and `batches/` (exact route strings, POST, no body), paints the three lists, counts, notice chips and totals.
2. Off: 404 on `list/` shows only the "not switched on" card; no row, no button, no other call. Down: `status 0` shows Try again, which re-reads.
3. Select 0, 1, 25, 26 rows: Propose disabled or enabled with the stated reason; first-batch-of-one rule (C3); a retention-off row cannot be selected.
4. Propose sends exactly `{sites:[...]}` in list order; success opens the batch view with the frozen list; 409 `not_proposable` lists each `site: code` in words and keeps selections that are still due; a 400 shows the backend's message.
5. Approve step: totals; unticking a row changes the totals and the expected line (`erase batch ebt_x9 6 sites`); the button stays disabled until the input equals the line exactly (a trailing space is trimmed, other differences are not); the call body is exactly `{batch, confirmation, exclude, reason}`; a reason with "@" or over 300 characters or empty is refused locally and sends no call; every-site-excluded sends no call.
6. Approve errors: `confirmation_mismatch`, `proposal_expired`, `wrong_status`, 404 (re-read decides off versus gone), `status 0` keep the field text, show the message, move focus as in 5.4, and never leave the button stuck in busy.
7. Cancel: reason required; success repaints Cancelled; `wrong_status` for a running batch.
8. Holds: place sends `{site, reason_code, reference}`; reason is required; `already_held` and `invalid_request` field errors; release sends `{site}`; `not_held`; the dialog opens with focus inside, returns focus to its opener, and Escape closes it unless busy.
9. Statuses: each batch status paints its words and (for `approved`, `running`, `needs_attention`) its hint; Refresh re-reads `batches/` only; there is no timer and no call other than the seven routes.
10. Unknown codes or count keys show the fallback words, never the raw string; text from the backend (reference, reason) is set as text, not HTML (a `<b>` in a fixture stays literal).
11. Accessibility checks the harness can see: labels exist for every input, error elements are `role=alert`, no heading is focused.

Edited tests: `menu.test.mjs` (the Lifecycle entry exists, second in the list, current only for `/lifecycle/`, and its twin in the sheet), `phone-nav.test.mjs` (sheet entries stay in step with the side menu), `rules.test.mjs` (add `lifecycle.html` and `lifecycle.js` to the Finance-style list of checked pages, script order, no inline script or style), `focus.test.mjs` (add `lifecycle.html` to the heading-focus check). `pnpm --filter hq test` and the repo's lint and build are run locally before the PR; the "visual test" is the Supervisor's, in Chrome, at desktop width and 390 px, against a local backend with fixture rows (the switch on locally), and states the environment.

## 10. Files touched

New: `apps/hq/public/lifecycle.html`, `apps/hq/public/assets/js/lifecycle.js`, `apps/hq/tests/lifecycle.test.mjs` (+ `lifecycle-page.mjs` if needed).
Edited: `apps/hq/public/assets/js/menu.js` (one `MENU` line), `apps/hq/next.config.ts` (one rewrite, one redirect), `apps/hq/public/assets/css/hq.css` (only a few rules if needed: the read-only expected-line block, the sticky action row on the phone; everything else reuses existing classes), `apps/hq/README.md` (one row in the page table), the four test files above.
Cache-bust: `menu.js?v=` is shared by all pages; bumping it edits one line in each of the 14 HTML pages. Choice C5: bump it (the menu would otherwise not show the entry to a browser holding the old `menu.js`). If the Supervisor prefers a smaller diff the entry appears after the cache expires.
No backend file, no `finance-common.js` change unless a helper is needed twice (then a small addition), no `hq.js` change.

## 11. Pull requests and order

**One frontend PR**, opened only on the Supervisor's "go" under the one-PR rule, after local checks and the Supervisor's local visual test, and only after backend PR 2 (`691988b`'s branch) is merged and the routes are confirmed on `main`, because the page's tests use the shapes in section 4. The page is inert (a not-switched-on card) while the backend switch is off, so it can be merged before the switch is turned on. It can ride a release round with other HQ changes (checked below: none overlap now). Rollback: revert the PR; nothing else depends on it.

## 12. Choices made here (reversible, mine to note)

- C1: a single address with in-memory views, as Usage. 
- C2: no auto-refresh timer; a Refresh button and a refresh after every action (the run is every 5 minutes; a timer adds calls to a read route that runs the whole dry run).
- C3: first batch per environment is one site (backend plan D2): when no batch has ever been approved, running, done or needing attention, the page allows 1 selected site and says why; after that it allows up to 25. This is an aid to the approver, not a control (the backend does not enforce it; see decision L2).
- C4: unknown codes show "a reason this page has no words for" rather than being hidden (section 8).
- C5: bump the menu script version on all pages.
- C6: no copy button for the confirmation line; no prefill.
- C7: the near-due list uses the backend's 14-day window; the page does not recompute any date or the 30 and 90 days (`plan.py` owns them).
- C8: per-table counts are labelled in words from a map; the map is completed at build from the backend's retention constants.

## 13. Decisions that need an owner (each with one recommendation)

| # | Decision | Recommendation | Risk |
|---|---|---|---|
| L1 | The approver sees site public ids only (no business name, no owner, no email): the routes return none and the privacy rule forbids showing personal values. Coach Ed approves erasures of sites he cannot recognise by name | Accept ids only. The Santé site is the only site type in the MVP, the dry run's dates and counts are what he checks, and a name lookup would need a new backend route returning a business name (a personal-data decision) | He cannot tell which Subscriber a row is without another tool; a wrong site cannot be spotted by name |
| L2 | Enforce "first batch is one site" and "weekly review" only in the UI (C3), or ask the backend to refuse a second site while no batch is `done` | UI aid only, as built here; the backend plan states D2 as a practice and the one approver is the control | A batch of 25 could be proposed by a direct API call; nobody else holds staff access |
| L3 | Side-menu entry "Lifecycle", always drawn, rather than a Finance sub-tab (section 3) | Own entry, always drawn | A second erasing page later has a place; the menu has one more line for a page used about weekly |
| L4 | Show "no service-end email was sent" (D12) as a warning chip on the row and in the approve totals, never blocking | As written (D12 already decided: show, do not block) | An approver who ignores the warning erases a site whose owner never saw the export window |
| L5 | Backend PR 2 must be merged (or its route shapes frozen) before the frontend build starts | Yes; build starts from the merged routes | If PR 2's shapes change after this plan, section 4 and the tests change with them |

None of these changes a customer promise, money, or access; L1 and L2 touch privacy and the control model, so they go to the Supervisor with these recommendations rather than being decided silently.

## 14. Overlap check (2026-11-13, `origin/main` `667adde`)

`gh pr list --state open` for the frontend repo returned no open PR. Remote branches that differ from `main` in `apps/hq` (about 30) were listed. None has an open PR. Most are earlier feature, fix and release branches of Finance, Inbox, Contacts, Bulk, Settings and form-error work whose names match pages already on `main` (merged by squash through the release rounds); this was **not verified branch by branch**, so treat them as stale unless the Supervisor says a session still owns one. The one branch whose change is plainly not on `main` is `claude/z8uq9mek63-hq-deploy` (`252492d`: `apps/hq/README.md`, `src/lib/hq-env.mjs`, `tests/env.test.mjs`, `scripts/wait_vercel_deploy.sh`): it overlaps this build only at `apps/hq/README.md` (a different place, no conflict expected). 