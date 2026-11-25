# z8uq9mjj05 BULK-SMS-FIRSTNAME FE (apps/dash)

Branch `feat/z8uq9mjj05-bulk-firstname`, from main 87b44e5. No PR (Supervisor routes it). Backend (HQ) fills `{first_name}` per person at send; this branch is the form only.

- Bulk SMS and Schedule SMS forms: a small "+ First name" button beside the 0 / 160 counter inserts `{first_name}` at the caret (over a selection), keeps focus, refuses if it would pass 160.
- Counter counts the text as typed. `problem()` in inbox-bulk.js now sees `{first_name}` as a name for the plain-character/link check (braces are otherwise not plain); other braces still show the plain-text error; the length check uses the raw text.
- Two grey help lines (textContent only) show while the text has the placeholder; example uses "Maria" and the tidy rule (squeeze spaces, no space before , . ! ? ; :, trim). Helpers (hasFirstName, insertAt, tidy, fillExample, firstNameKit) are in `NOInboxBulk.util`; Schedule reuses them.
- A 422 on text shows in the existing message field error (st.err / prevErr).
- Cache-buster 20261125f1 on inbox.css, inbox-bulk.js, inbox-schedule.js.
- Two existing "exactly two buttons" tests now ignore the small `.ib-fn` button.
- Fix 1: a { or } outside an exact {first_name} now shows "Only {first_name} can go inside { }." (before the plain-character message; 160 length still by typed length) in Bulk and Schedule; cache-buster 20261125f2.
- Fix 2 (Coach Ed 2026-11-25): First name is required when saving a contact, add and every edit (also for a contact that had no name); contacts.js cache-buster 20261125f3.
- Fix 3 (Coach Ed 2026-11-25): CSV upload lead says first name is required and sample row is "Ana,,09191234567"; Bulk and Schedule SMS show "Press + First name to greet each person by name, like: Hi {first_name}!" in place of the limits line, the first help line is removed, the Example line stays; contacts.js, inbox-bulk.js, inbox-schedule.js cache-buster 20261125f4.
- Fix 4 (Coach Ed 2026-11-25, fn-r2 feedback): Output label and quote, no empty-text error while composing a {first_name}-only text (no preview asked), Send to has no default ("Choose who gets it"; no count request and buttons off until a pick; audience always sent), count under Send to, hint as a label, + First name on the Message label row, tighter card bottom, test-text success as a toast (not inline), shared toast moved to the upper right (phone: top, full width minus gutters). Toast code: apps/dash/public/assets/js/app.js toast() and dash.css `.toast` rules. Cache-buster 20261125f5 on dash.css, inbox.css, inbox.js, inbox-bulk.js, inbox-schedule.js.
