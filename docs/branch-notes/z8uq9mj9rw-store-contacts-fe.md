# z8uq9mj9rw STORE-CONTACTS FE, slice A (apps/dash)

Branch `feat/z8uq9mj9rw-store-contacts-fe`, from origin/main 0165c7c. No PR (Supervisor routes it). Slice B (New SMS and Bulk SMS pickers) is not in this branch.

Source: Coach Ed, 2026-11-24: "put a Contact Menu in our subscriber dashboard so that it can save contacts and group to be used in SMS and Bulk SMS".

## Origin of the code
Adapted from `apps/hq/public/assets/js/contacts.js` and `contacts.html` (this repository), for one site and the dash look. No TWCinc code and no TWCinc package. The house dropdown is `combo()` from `apps/dash/public/assets/js/products.js`, re-scoped to `#view-contacts`.

## Backend
HQ's BE branch (z8uq9mj9q4) had no contacts_owner.py yet when this was built, so the page follows the agreed shape and is tested with a mocked API. Confirm field names against the real BE once it exists.

## Files
- New: `public/assets/js/contacts.js`, `public/assets/css/contacts.css`, `tests/contacts.test.mjs`.
- Edited (kept small for the #13 merge): `public/index.html` (css link, sidebar link, view root, More tile, script tag), `public/assets/js/dashboard.js` (`"contacts"` added to the VIEWS literal, one ROUTES line, enter/leave hook, probe call), `tests/nav.test.mjs` (sidebar list and Contacts links).

## Merge notes for #13 (feat/z8uq9m92fv-inbox-meta-look)
SMS Marketing is not on main, so the Contacts link sits right after Inbox. When #13 merges, move it right after SMS Marketing: in index.html the sidebar link and the More tile, and the `["Overview", ... "Inbox", "Contacts", ...]` list in tests/nav.test.mjs (add "SMS Marketing" before "Contacts").

## Decisions
1. One route, `/contacts/`, with three tabs in the page (Contacts, Groups, Upload CSV) and dialogs for add/edit/rename/delete, instead of HQ's four addresses. Keeps dashboard.js to one route.
2. Gating: links hidden until `status/` answers 200 with `contacts: true`. A 404, `contacts: false`, any error, or no site leaves them hidden. Opening `/contacts/` while off shows "Contacts are not available".
3. Search starts after 2 characters (debounced 350 ms, Enter searches now); one character sends nothing and says so.
4. Paging: Previous and Next. The API gives only a forward cursor, so Previous uses a stack of the cursors already visited.
5. Full mobile only from `{id}/` when the owner clicks Edit; Add starts empty.
6. Contact groups are a checkbox list in the dialog (the multi-select), the filter and upload group use the house dropdown.
7. CSV: file or pasted text, sent as `text` (HQ's own API uses `csv`; the brief says `text`), 1 MB limit checked in the page. The check shows new, already and the refused lines (line and reason, first 50). Save sends `expected_new`; the code `changed` asks for a new check. The Save count shown is the API's `added` (falls back to the checked new count). No download of refused lines (HQ has one; the plan has no export).
8. Delete (contact and group) always asks first. A group delete says its contacts stay.
9. Error mapping: `fields.{first_name,last_name,mobile,groups,name}` land on the field, `already_exists` on the mobile or the group name, anything else shows `message`.
10. Nothing stored in the browser; all API text through D.el/textContent.

## Checks (apps/dash, Node 22.23.1, pnpm 11.25.0)
`pnpm test` 806 pass (14 new in contacts.test.mjs), `pnpm lint` clean, `pnpm build` ok. Not run: a real-browser visual check (Supervisor's local test, desktop and phone, light and dark).
