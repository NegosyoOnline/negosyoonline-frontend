# Branch notes: z8uq9mj6ch INBOX-META-LOOK FE

Branch `feat/z8uq9m92fv-inbox-meta-look` (parent z8uq9m92fv), frontend `main` a409511 plus HQ's bulk SMS branch 98281d5 merged (head 4e15a53 before this work). Spec: ClickUp z8uq9mj6ch. Coach Ed's request (Tue 2026-11-24): make the dash Inbox look like the Meta Business Suite Inbox. LOOK AND LAYOUT ONLY: no new API call, route, data or behaviour, no backend change, no new package, no Meta logo or brand asset. No TWCinc code.

## Scope (apps/dash Inbox only)

1. Page header: a visible "Inbox" title and the line "Reply to your customers' messages in one place." (`index.html`, `.ib-head`; the old screen-reader-only h1 became the visible one, same id `h-inbox`). The 72 px desktop padding that reserved the top-bar row (F1) is gone because the header is there now. On a phone the header goes while a conversation is open (`body.ib-thread`), as the heading did before.
2. Channel tabs replace the "All channels" dropdown: All messages, Website chat, Email, FB Messenger, FB Comments, and Text (SMS) last, only while `sms_available` (`tabsFor`, same gate as before). A tab sets the same `S.filter` value the dropdown did (`all`, `webchat`, `email`, `messenger`, `fbcomment`, `sms`) through the same source logic (`sourcesFor`, `applyQuery`). `role=tablist`/`tab`, `aria-selected`, roving `tabindex`, Arrow/Home/End move focus, Enter/Space choose. No Instagram or WhatsApp.
3. Left column: the search box (unchanged behaviour, moved), then quick chips, then the list. The chips are toggle buttons (`aria-pressed`) over the EXISTING filter values only: Unread (`unread=1`), Read (`unread=0`), Unanswered / Answered (`answered=`), Open / Closed (`status=`; these are the options of the old "All status" dropdown). One chip per dimension at a time; pressing the one that is on turns the dimension off (the old "All"). They replace the "All status" dropdown and the two icon toggles in the old Conversations header. Rows: round avatar (initials or the Messenger photo as before) with a small channel badge at the bottom-right (icon only; the channel name is for screen readers and the tooltip), name, one-line preview, time at the right with a blue dot for unread (the "Unread"/"Read" words stay as the aria-label), unread name bold, selected row with a left accent bar. The answered-state icon after the name, the comment post line and chips, and the Closed chip are kept.
4. Middle: thread head with avatar, name, channel pill and Open/Closed chip, and the actions as icon buttons (Close / Reopen conversation, each with `aria-label` and `title`, no visible text). Bubbles: incoming grey left, outgoing accent right, rounder. The reply box is a rounded card at the bottom with a per-channel placeholder: "Reply in Messenger…", "Reply by email…", "Reply in website chat…", "Reply by text…", "Reply to comment…" (`placeholderFor`; the comment composer in `inbox-comments.js` uses it too).
5. New contact panel (third column, `aside`, "Contact details"), built only from the thread already loaded (the row's data for a comment): avatar, name, channel pill, Open/Closed, and Email / Mobile / Channel lines by the same rules and masking as the line under the name (`contactOf`; `subOf` now uses it). The code has no Prospect List or member link for a conversation, so the panel has none. Collapsible: an icon button in the thread head and one in the panel (`aria-expanded`, `aria-label` "Hide/Show contact details"); the choice is kept in `localStorage` key `no-ib-contact` inside try/catch (works without it). Hidden under 1100 px (see decisions) and on a phone.
6. Toolbar: New text, Text many members (its own icon now, a two-people glyph, so it is not mistaken for New text when icons only show on a phone) and Refresh, at the right of the tab row. Our colours, fonts, CSS variables, dark/light themes, the house dropdown (still used by Settings > Inbox, New text and Text many members) and the light-blue focus border are untouched. Chips, tabs, icon buttons and the reply card all use `--link` focus.
7. Phone (U6): one panel at a time as before; the tab row scrolls sideways inside itself, the buttons go icon-only, the contact panel is not shown.

## Files

* `apps/dash/public/assets/js/inbox.js`: layout (`drawBody`, `listPane`, `fillList` rows, `channelDot`), `syncTools`/`toolbar`/`tabBar`/`setChannel`/`chipRow`, contact panel (`contactPane`, `drawContact`, `cpToggle`), `threadHead`, `statusButton`, `replyBox` placeholder; removed `channelField`, `statusField`, the two read/answered toggles and the toggle tooltip (`attachTip`). New pure helpers exported in `NOInbox.util`: `tabsFor`, `chips`, `chipOn`, `chipNext`, `placeholderFor`, `contactOf`.
* `apps/dash/public/assets/js/inbox-comments.js`: one line, the comment reply placeholder.
* `apps/dash/public/assets/css/inbox.css`, `apps/dash/public/index.html` (header; cache keys `inbox.js`, `inbox.css` and `inbox-comments.js` bumped to `?v=20261124ml1`; `inbox-bulk.js`, `inbox-sms.js`, `inbox-settings.js` unchanged).
* `apps/dash/tests/inbox.test.mjs`, `apps/dash/tests/inbox-comments.test.mjs`.

## Decisions

* The channel dropdown becomes tabs; "All status" and the two icon toggles become chips (the spec said to use exactly the status/unread/answered values: Open, Closed, Unread, Read, Answered, Unanswered).
* The Text (SMS) tab goes last (the task lists it last), where the dropdown had it before FB Comments.
* The contact panel is hidden below 1100 px wide, not only on a phone: with the dash side nav, three columns do not fit a narrow laptop or tablet. Above that it is on by default. This goes beyond "hidden on phone"; say if it should show on tablets.
* The channel badge on a row is one accent colour (`--link`) for every channel: the existing channel icons tell them apart, and no new colours came in.
* No avatars beside incoming bubbles (Meta has them): the bubble markup is shared with the comment thread and the tests; left for later if wanted.
* The toolbar (tabs, New text, Text many members, Refresh) stays one block above the card, built only when the list state changes, so the search box keeps its cursor while rows change, as before.
* The read marker keeps its "Read" role=img label on every row (as before) but is visually hidden; only unread shows a dot.

## Out of scope (later, Coach Ed's call)

Assign conversation, labels, lead stage, priority/star, spam/delete, Create order, Payments, Instagram and WhatsApp, "Create messaging ad", the Meta side-panel sections (About, Data sharing, Activity, Order status), emoji/attachment buttons in the reply box.

## Tests (Node 22.23.1, pnpm 11.25.0, as CI)

`pnpm install --frozen-lockfile` at the repo root, then in `apps/dash`: `pnpm lint` clean, `pnpm run test` 814 of 814 pass (was 808 before: tests for the old dropdown, toggles and tooltips were rewritten for tabs and chips; new tests cover `tabsFor` with SMS gating, chip mapping, per-channel placeholders, the icon buttons, the contact panel content per channel, collapse and its localStorage, hostile text), `pnpm build` passes.
Not run: a visual check in a browser (the Supervisor's local visual test, desktop and phone, light and dark, plus the side-by-side with the reference).

## Not kept working / notes for the Supervisor

* Nothing existing was dropped on purpose. The Read/Unread and Answered tooltips (`NOInboxTip` for the toggles) went with the toggles; the comment rows' own tooltips are unchanged.
* The old Conversations card header ("Conversations" title) is now a screen-reader-only heading; the card has no visible title any more.
* `docs`: merge `main` again (merge, never rebase) once HQ's bulk branch lands; conflicts would be in `inbox.js`, `inbox.css` and `index.html`.
