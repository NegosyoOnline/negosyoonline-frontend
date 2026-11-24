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

## Fix round 1 (Supervisor's local visual test)

* F1 (phone): `#view-inbox .ib-tools-host.is-hide-phone { display: none; }` added inside the max-width 899px block of `inbox.css` (the host sits outside `.ib-split`, so the old `.ib-split .is-hide-phone` rule did not reach it). Phone shows one panel at a time again: list view = header, tabs, buttons, list; thread view = only the thread. Desktop unaffected (rule is phone-only). New test checks the rule is inside the phone block only.
* F2 (laptop): toolbar tightened so tabs and buttons share one row at 1280px+ with the side nav: tab padding 14 to 10 px, tab font 15 to 14 px, tab gap 4 to 2 px, button padding 14 to 12 px, button gap 9 to 8 px, row gap 12 to 10 px. The row still wraps when it truly does not fit; phone rules unchanged. Not measured in a browser by me (no server started); the Supervisor's visual test should confirm.
* Cache key: `inbox.css?v=20261124ml2` (`inbox.js` unchanged, stays `ml1`; the existing version test updated).
* Checks: `pnpm run test` 815/815, `pnpm lint` clean, `pnpm build` passes (Node 22.23.1, pnpm 11.25.0).

## Fix round 2 (Coach Ed, Tue 2026-11-24, relayed by the Manager)

Coach Ed's words: "convert this filters to button just like image 2, add button for open/close then redisgn the to be like in the image 3. so the icons are: 1. search 2. answered/unanswered 3. read/unread 4. open/closed then once the search is click, all the other button will hide and the search input will consume the 100% width".

* The head of the list column (`#ib-lhead`) is now ONE row of four square icon buttons in the dash top-bar style (`.notif-btn` / `.qs-btn`: 44 px, `--card-line` border, 8 px corners, `--card` background, `--text-2` icon; new class `.ib-fbtn`): 1 Search (`#ib-b-search`), 2 Answered/Unanswered (`#ib-b-answered`), 3 Read/Unread (`#ib-b-read`), 4 Open/Closed (`#ib-b-status`). The six text chips are gone (`CHIPS`, `chipOn`, `chipNext`, `chipRow`, `.ib-chip*` CSS removed).
* Buttons 2-4 cycle all -> first -> second -> all (`CYCLES`; pure `cycleNext`, `cycleLook`, `filterNext` in `NOInbox.util`, replacing `chips`/`chipOn`/`chipNext`). Answered: "" / answered / unanswered; Read: "" / 1 (Unread) / 0 (Read); Open/Closed: "" / open / closed. Same query values as the chips, through `applyQuery`; they combine as before; a failed read puts the previous state back (`syncFilters`). Each state has its own icon (Answered: comment / check / exclamation circle; Read: stack / closed envelope / open envelope; Open/Closed: folder / open padlock / closed padlock). aria-label and title name the state ("Showing all messages", "Unread only", "Read only", "Answered only", "Unanswered only", "Showing open and closed", "Open only", "Closed only"); the house tooltip (`attachTip`, brought back from 4e15a53) shows the same words. Active state: `--link` border and tint, `aria-pressed="true"`.
* Search: pressing it hides the four buttons and shows the search box at 100% width, focused, with a close (X) button at its end (`#ib-sclose`, "Close search"). X or Esc closes it, empties any text through the same `searchNow` (so the list returns to normal as emptying the box did) and puts the focus back on the Search button. The debounce (300 ms), 2-character minimum and Enter are unchanged; the input element is built once, so the cursor stays while rows change. The open/closed state is kept in `S.sOpen` so a head rebuild keeps it. If a text is active while the box is closed (only after such a rebuild), the Search button shows the active state and its label reads "Search: <text>" (set as an attribute, never markup).
* Cache keys: `inbox.js` and `inbox.css` both `?v=20261124ml3`.
* Tests: `pnpm run test` 820/820, `pnpm lint` clean, `pnpm build` passes (Node 22.23.1, pnpm 11.25.0). Old chip tests moved to the cycle buttons (helpers `pickChip`/`pickOff` click the right number of times); new tests cover cycling, icons, labels, combining, failed-read revert, search expand/collapse/Esc/X, hostile text, the CSS.
* Choices for Coach Ed to judge: (1) the Search button itself is hidden while the box is open (the box has its own magnifier); (2) the house tooltip is on buttons 2-4 only, Search has title and aria-label; (3) the "all" state of Open/Closed shows a folder icon, and Closing the box empties the search text.
* Not run: a visual check in a browser (no server started).

## Fix round 3 (Coach Ed, Tue 2026-11-24, relayed by the Manager)

Coach Ed's words: "the filter, right align it then put animation when the search button is clicked".

* The four filter buttons are right-aligned in `#ib-lhead` (`.ib-fbar` and `.ib-frow` are `justify-content: flex-end`); order unchanged.
* Search animates with CSS transitions on a state class (`.is-search` on `.ib-fbar`): the box grows from width 0 to 100% (220 ms, ease, with a fade) while the button row shrinks (`max-width`), fades and slides right; X or Esc reverses it. `prefers-reduced-motion: reduce` turns the transitions off in CSS, and `show()` in `inbox.js` then switches `hidden` at once (matchMedia read).
* Keyboard and screen readers: the leaving part gets `inert` at once and `hidden` 260 ms later (one timer, cleared on a quick toggle); the part coming back is un-hidden and un-inerted before the class changes. Focus goes to the input on open and to the Search button on close, as before. The input is still built once; debounce and search unchanged. The initial state is set without motion.
* Row has 2 px padding and -2 px margin so its overflow clip does not cut the light-blue focus ring; the padding goes to 0 while collapsed.
* Cache keys: `inbox.js` and `inbox.css` both `?v=20261124ml4`.
* Tests: 822/822, lint clean, build passes. Two new tests (CSS rules; reduced motion, focus, inert) and the search tests now advance 260 ms.
* Not run: a visual check in a browser (no server started).

## Fix round 3 addition (Coach Ed, Tue 2026-11-24, relayed by the Supervisor)

Coach Ed's words: "update this actions: 1. New SMS 2. Bulk SMS 3. remove this refresh button and transfer it beside these filters (image 2)".

* "New text" is now "New SMS" and "Text many members" is now "Bulk SMS" (label, aria-label, and the titles/aria-label of the two screens they open, `inbox-sms.js` and `inbox-bulk.js`). Icons, styles and dialog bodies unchanged.
* The toolbar Refresh button is gone. Refresh is the 5th square icon button (`.ib-fbtn`, `#ib-refresh-btn`, refresh icon, title and aria-label "Refresh", house tooltip) after Search, Answered, Read, Open/Closed in `#ib-frow`, so it hides with the others when Search opens (same inert/hidden/animation) and returns on X or Esc. Same handler (`refreshAll`). `.ib-frow` max-width 260 to 300 px to fit five buttons.
* Decision: while there is nothing to filter (empty list) there is no filter row, but the empty text says "Press Refresh", so the list head then shows Refresh alone, right-aligned (`liteBar`). The toolbar row above the card is only built when it has something in it (tabs, New SMS, Bulk SMS); with no SMS and an empty list it is not rendered.
* Cache keys: `inbox.js` and `inbox.css` both `?v=20261124ml5`.
* Tests: 822/822 (existing tests updated, hide-on-search assertions added), lint clean, build passes (Node 22.23.1). Not run: a visual check in a browser.
