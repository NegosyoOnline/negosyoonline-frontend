# HQ-F3: Statements page in HQ Finance (plan only)

ClickUp z8uq9mewgk (parent z8uq9mek5t, HQ-F). Step 1 of 2: this plan, approved before any build. It adds no scope, no library, no backend change and no switch. Sources read: `apps/statements/staff.py`, `apps/statements/adjust.py` and `apps/operators/staff_views.py` on backend origin/main (71061a8), the B5 plan sections 7.3, 7.4 and 9.2, and `apps/hq` on frontend origin/main (04a80ac): the Reconcile, Usage and Invoices pages, `finance-common.js`, `hq.js`, `next.config.ts` and the tests.

## 1. Routes (all `POST /staff/v1/<key>`, JSON, through `H.call`; the PDF through `H.file`)

PR 8 (`feat/z8uq9mdwt0-b5-pr8-delivery`, head 80b8a67) is an ancestor of backend origin/main (release round 10, #158). So every route below is on main and none waits on a branch. Each answers 404 `not_found` while `BILLING_STATEMENTS_ENABLED` is off.

| Key | Body | Answer |
|---|---|---|
| `finance/statements/list/` | all optional: `limit` (int), `cursor` (text), `site` (site public id), `document_type` (`statement` or `adjustment`), `delivery_failed` (`true`) | `{items: [S], next_cursor}`. With `delivery_failed: true` the other filters and paging are ignored: up to 200 rows, `next_cursor` null |
| `finance/statements/detail/` | `{statement: "stm_..."}` | S plus `lines [{position, kind, description, quantity, unit_centavos, amount_centavos}]`, `adjustments [{statement, number, total_centavos, reason}]`, `remaining_centavos` (null for an adjustment), `reasons [codes]`, `deliveries [{attempt, status, error_code, at}]` |
| `finance/statements/adjust/` | `{statement, reason, lines: [{description, amount_centavos}]}`; reason is one of `reasons`; 1 to 10 lines; description at most 300 characters; each amount a negative whole number of centavos | 201, S of the new adjustment |
| `finance/statements/resend/` | `{statement}` | 200 `{attempt, status, error_code, at}` of the new attempt (status `sent` or `failed`; a 200 can carry `failed`) |
| `finance/statements/pdf/` | `{statement}` | the PDF bytes (`application/pdf`, no-store); each read is audited |

S = `{statement, number, document_type, kind, site {id, name}, total_centavos, currency, is_test, issued_at, period_start, period_end, payment_reference, original, original_number, adjustment_reason, delivery}`. `delivery` is the latest attempt `{attempt, status, error_code, at}`, or null (an adjustment, or no attempt yet). Statuses are `pending`, `sent`, `failed`.

Errors the page words: 400 `invalid_request` (field messages), 404 (closed card, or a missing statement), 409 `test_document` ("A test statement is never emailed."), 409 `not_adjustable`, 409 `exceeds_remaining`, 503 `store_unavailable` (PDF and adjust), 401 to `F.left`.

**Personal data.** The staff routes return none of the bill-to name, email, TIN or address, and `deliveries` holds no `to_email`. The page shows only the site's display name (to say whose statement it is), the number, dates, amounts, our payment reference (`btp_...`, not personal) and the delivery status and attempt time. The `error_code` is never shown raw. The PDF does hold the bill-to snapshot (name, TIN if supplied, address); it appears only after a staff click on View PDF, is held in tab memory, shown from an object address and released when the statement closes, as the invoice scan is. The page stores and logs nothing.

## 2. Screens (one address, `/finance/statements/`, in the Finance sub-navigation)

Same shell as `finance-reconcile.html`: boot line, `v-main`, `v-closed`, `v-down`, retry, `me/` first, `F.left` on 401.

1. **List.** Filter tabs: All, Statements, Adjustments, Delivery failed. "Delivery failed" sends `delivery_failed: true`; Statements and Adjustments send `document_type`; All sends none. A table (stacked rows on a phone): number, issued (Manila date), site, kind in words (Monthly, Annual, Launch promo, Storage usage, Final usage, Adjustment), period, total, delivery chip (Sent ok, Pending warn, Failed err, "Not sent yet" neutral, none for an adjustment), a Test chip when `is_test`, and a View button. "Load more" while `next_cursor`. Empty: "No statements yet." (Delivery failed: "No failed deliveries."). Count line as in Reconcile.
2. **Statement.** Held in memory (no id in the address), so a reload returns to the list. Card 1: number, site, kind, period, issued, total, payment reference, Test chip; for an adjustment, its original and reason in words. Card 2: the lines table with a total. Card 3 (statement only): adjustments (number, reason in words, amount) and "Left to adjust PHP x". Card 4 (statement only): delivery attempts, newest first (attempt, status chip, time). Buttons: View PDF (held blob, opened in a new tab as the invoice scan is; the CSP stays unchanged), Resend (statement only, hidden for a test statement), Adjust (statement only, hidden when `remaining_centavos` is 0), Back.
3. **Resend.** A confirm dialog ("Send this statement to the billing email again?"; the address is not shown because the route does not return it). The result line comes from the answer: sent, or "The email could not be sent. The attempt is recorded."; the attempts list reloads from `detail/`. If the route still answers 409 `test_document`, the page shows "A test statement is never emailed."
4. **Adjust dialog.** Reason (the house `F.combo`: Billing error, Duplicate payment, Service not delivered, Goodwill reduction, Other; options come from `detail.reasons`, a code with no words is left out). Then 1 to 10 lines, each a description (at most 300) and an amount typed in pesos as a positive figure (`F.centavos`, read as text) that the page sends negated. Add and remove line. It shows the running total and "Left: PHP x"; a total above `remaining_centavos` blocks Submit with a plain message (the backend still decides). 201 closes the dialog, reloads the detail and shows the new adjustment. 409 `exceeds_remaining`: "That is more than is left of the statement." 409 `not_adjustable` and 400 field messages in words. While busy, Escape closes nothing, as in the Usage dialogs.
5. **States.** Closed (404 on the first list call): "Statements are not switched on." Down: "Statements could not be reached. Try again." with retry. A failed filter or action keeps the page and says so. A code with no words is left out, never shown raw.

## 3. Files

Add: `apps/hq/public/finance-statements.html`, `apps/hq/public/assets/js/finance-statements.js`, `apps/hq/tests/finance-statements.test.mjs`.

Change:
- the sub-navigation of the six existing Finance pages (add `<a href="/finance/statements/">Statements</a>` before Accounts, so the existing Accounts-last test still holds);
- `apps/hq/next.config.ts` (rewrite `/finance/statements/` to the page; redirect `/finance-statements.html`);
- `apps/hq/README.md` (one table row);
- `apps/hq/tests/finance-accounts.test.mjs` and `tests/focus.test.mjs` (add the new page to their page lists);
- `apps/hq/public/assets/css/hq.css` only if a class is missing (expected: none).

Shared helpers come from `finance-common.js` (`NOFin`), which is not changed.

## 4. Tests (`node --test`, the `page.mjs` harness Reconcile and Usage use)

- Boot: `GET me/`, then `list/` with `{}`; 404 shows the closed card; other failures show down and retry; 401 leaves.
- List: each filter sends the right body; delivery chip per status and for null; Test chip; Load more passes the cursor; empty texts; unknown kind or reason left out.
- Detail: lines, adjustments, remaining and attempts rendered with `textContent` only (an injected string stays text); an adjustment hides Resend and Adjust; a test statement hides Resend; nothing outside the route's answer is rendered (no email, TIN, address, raw `error_code`).
- Resend: confirm sends `{statement}`; sent and failed results; 409 `test_document` wording; busy blocks a second click.
- Adjust: body is exactly `{statement, reason, lines:[{description, amount_centavos:-n}]}`; amounts from text; over-remaining blocked; 1 to 10 lines; 400, 409 and 503 wording; Escape and focus.
- PDF: `H.file` called with `{statement}`; only `application/pdf` is opened; object address released on close; 503 wording.
- Static: the page makes only the five calls above, carries the sub-navigation, is routed in `next.config.ts`, no heading focus.
- Checks: the apps/hq test, lint and build scripts (`pnpm test`, `pnpm lint`, `pnpm build` in `apps/hq`), output reported.

## 5. Release order

No wait on PR 8: everything the page calls is on backend main since round 10 (#158). It also tolerates an older backend: a missing `delivery` or `deliveries` shows "Not sent yet" and no attempts. It ships in the next frontend release round and stays dark until `BILLING_STATEMENTS_ENABLED` is on (the route answers 404, the page shows the closed card). That switch is not part of this task.

## 6. Open questions (with my recommendation)

1. **Site filter.** The list route filters by a site public id, but no staff route lists sites to pick from. Recommend: no site filter now (All, Statements, Adjustments, Delivery failed only); add one when a staff site picker exists.
2. **Tab while the switch is off.** Recommend: the Statements tab is always shown, like Invoices, and the closed card is the dark state. No extra route or flag is read.
3. **Resend result.** The route answers 200 even when the attempt failed. Recommend: confirm dialog first, then a plain line saying whether the attempt sent or failed.
4. **Plan path.** Frontend has `docs/plans/`, not `docs/superpowers/plans/`; this file is where the task asked. Recommend: leave it.
