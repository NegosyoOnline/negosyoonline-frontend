# Branch notes: z8uq9mhpbc FREE-DOMAIN FD-FE

Branch `feat/z8uq9mcyu0-fd-fe`, cut from `origin/main` 8a2d35d. Task z8uq9mhpbc under z8uq9mcyu0. Plan: backend `docs/session-state/packets/morning-2026-11-21/free-domain-y1-plan.md` sections 4 (FD4) and 6 (FD6). Contract read from `origin/feat/z8uq9mcyu0-fd-be` (commit 1ab9183, `docs/branch-notes/z8uq9mhpbb.md`). No TWCinc code, no new package, no backend edit. All new wording is a PLACEHOLDER until Coach Ed's local OK.

## apps/dash (Domain screen, `domain.js` only, plus tests)

* "Included with your plan: one .com for your store." is now "Free for your first year: one .com for your store."; the head chip "Included" is now "Free first year".
* A registered domain (claim state registered, zone, connecting, activating, live, attention) shows "Free until Mmm D, YYYY" from `free_until` (top-level in the owner answer, `YYYY-MM-DD`; a `domain.free_until` is read first if ever present). Written like billing dates (Manila time, "Nov 22, 2027"). Missing, null or unreadable: nothing shows.
* One plain line (search, quoted and live cards): "Your address stays connected while you stay subscribed. From year 2 its renewal is paid. NegosyoOnline registers and holds it for your store."
* No price, no renewal amount. The old "no year" test now allows only that one line and checks there is no amount, digit or "999" elsewhere.
* Only `index.html` line touched: the `domain.js` cache-busting token (`?v=20261123fd1`). No Settings nav, no probe, no ROUTES change (the menu link belongs to z8uq9mhpc2).

## apps/hq (Domains page)

* New button "Import a domain bought by hand" opens a dialog: Site ID and Domain. It posts `{site, name}` to `domains/import-bridge/`; 202 `requested` or `pending` shows "Requested. The registrar is read in the background. Refresh to see the result under Imports." (or "already waiting").
* Refusals: 409 `import_refused` `fields.reason` codes are shown in words (name_refused, site_off, no_subscription, exempt, has_registration, has_claim, name_held); 400 `fields.name` messages are shown as written; 404 with a code: "That site was not found."; a server fault or no answer: a plain line. The dialog stays open.
* The list's new `imports` rows (latest per site) show in an "Imports of hand-bought domains" card: name, state chip (Requested, waiting / Imported / Refused), store, the worker's refusal reason in words, time.
* No authenticator code: no other Domains action asks for one (the staff session already passed both sign-in steps), so none was added.

## Contract match (FD-BE 1ab9183)
Route `domains/import-bridge/`, body `{site, name}`, `imports` list, `free_until` top-level: all as written. No mismatch.

## Checks (Node 22.23.1, pnpm 11.25.0, frozen lockfile)
dash: 758 tests pass; hq: 646 tests pass; lint clean; build compiles; tsc --noEmit exit 0 (after a build).
