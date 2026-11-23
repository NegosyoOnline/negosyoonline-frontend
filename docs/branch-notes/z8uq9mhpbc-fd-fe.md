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

## Fix round FD-CAP (Coach Ed, 24 Nov, ClickUp comment 1100430000629975 on z8uq9mhpbb)
Not limited to .com any more; the backend limits by price (cap 13 USD) and offers several endings in `extensions`.
* `apps/dash` domain.js: lead is now "Free for your first year: one address for your store." (scope update, Manager 24 Nov)
* New plain line under the search box, built from the API's `extensions` (only items matching `^\.[a-z]{2,63}$`, set as text): "You can choose an address ending in .com, .net, .org or .xyz." (one item: "ending in .com."). Hidden when the list is empty or missing. Id `dm-ext`, added to the input's aria-describedby only when shown; `dm-hint` and `dm-err` unchanged.
* cleanName unchanged: no ending typed gets `extensions[0]` (fallback .com); a typed ending is sent as typed. No client-side refusal; the API's refusal ("This name is not included. Please choose another.") shows as sent.
* Scope update (Coach Ed: at year 2, bill the exact domain price): on the result before Buy (quoted view and its confirm step) a line shows when `domain.renewal_usd_cents` is a positive integer: "Free for the first year. From year 2: US$42.20 a year, Cloudflare’s renewal price with no markup, billed in pesos at the BSP rate when the renewal bill is made." Null, missing, 0, negative or non-integer: no line. Set as text. No first-year price anywhere; no other view shows an amount. The HOLD line is unchanged.
* Billing unchanged. `domain.js` cache key is now `?v=20261124fd2`.
* HQ: no ".com only" wording found; not touched. Outside this round's files: `apps/dash/public/assets/js/dashboard.js` line ~1302 (onboarding checklist row "Your own domain: Use a .com address for your site") still says .com; now changed at the Supervisor's request: the row reads "Use your own website address for your site"; dashboard.js cache key is ?v=20261124fd3.
* Checks (Node 22.23.1, pnpm 11.25.0, frozen lockfile): dash tests pass (count in the report), lint clean, build ok.
