# Branch notes: z8uq9mhgvj DOMAINS F2 FE (dash Settings > Domain)

Branch `feat/z8uq9mhgvj-domains-f2-fe`, cut from origin/main 4e455b0. Design task z8uq9mcyu0 (plan r4.1 row "F2 dash", design R4.7).
No TWCinc code, no new package, no backend edit, no real network call. All wording is a PLACEHOLDER until Coach Ed approves it.

## Files (apps/dash only)

* `public/assets/js/domain.js` (new): the screen, `window.NODomain` (`show`, `hide`, `util`). Plain ES5 like the other scripts.
* `public/assets/css/domain.css` (new): card styles scoped to `#view-settings-domain`; colours from the dash tokens (light and dark), focus border is `var(--link)` (light blue), never gold.
* `public/index.html`: the old "Domain is not available yet" placeholder section is now the screen's holder (`#dm-root`, `#dm-live`; h1 "Your website address"); `domain.css` and `domain.js` added; version tokens bumped for `dashboard.js`, `business.js` and the two new files.
* `public/assets/js/dashboard.js`: the `/settings/domain/` entry in `ROUTES` and the enter/leave hook for `NODomain` (the view name `settings-domain` already existed).
* `public/assets/js/business.js`: one comment only (no "Go to Domain" button, reason updated).
* `tests/domain.test.mjs` (new, 19 tests), `tests/nav.test.mjs` (the Domain route moves out of the hidden list; new test that it is routed and linked from nowhere).

## Route hiding (the choice)

Plan F2: the screen ships, the menu entry stays hidden until Coach Ed's staging OK. The existing mechanism for a hidden page was "not in ROUTES" (the 2026-11-13 launch hide). Here the route IS in ROUTES, so `/settings/domain/` opens by URL, but nothing links to it: no sidebar item, no More-sheet tile, no Settings tab, no quick link, no button in Business Settings, and no nav probe. `tests/nav.test.mjs` pins this (route present, no `href`, no quick link, no script mentions the address). To open the menu entry later: add a link (and, if wanted, a probe like `data-meta-nav`) to `index.html`; nothing else changes. Until `DOMAINS_ENABLED` is on, the owner GET answers 404 and the page says "Your website address is not available yet".

## Screen states (from `GET /sites/{id}/domain/`)

| Answer | Screen |
|---|---|
| 404 | "not available yet", no buttons, no polling |
| `eligible: false` | locked: "unlocks after your first subscription payment is approved" (the API's own sentence for another reason, e.g. on hold) |
| eligible, no claim or `ended` | "Included with your plan: one .com for your store." + search + "Check name"; an `ended` claim's `reason` is shown as the result (name taken, not available) |
| `checking` | "Checking the name", polls every 3 s |
| `quoted` and `can_buy` | "This address is available" + "Buy this address" -> confirm step ("Yes, buy it" / "Cancel"); POST buy only after Yes |
| `quoted`, not `can_buy` | expired: search again |
| `confirmed`, `awaiting_gate`, `registering`, `registered`, `zone`, `connecting`, `activating` | four steps (Requested, Registering, Connecting, Activating) with the API label; polls every 8 s |
| `live` | the `www.` address (a link only for a plain host name) |
| `attention` | plain message, "We keep checking it." |
| `failed` | reason + "Retry" only when `can_retry` |
| `conflict` | "Waiting for the NegosyoOnline team", no button |
| `removal_pending` | "Disconnecting" |

Errors show the API's message (a `fields.name` message first); never raw JSON. After a 409 that means the screen is stale (`not_eligible`, `request_in_progress`, `check_first`, `quote_expired`, ...) the status is read again. No price, renewal or year anywhere (a test scans every state). No dropdown (no extension choice: the plan's first extension is added when the owner types none), so the house-dropdown rule does not apply.

## Backend facts the screen relies on (apps/domains, B2)

The Check runs in the worker: POST check/ answers state `checking`, and the page polls until `quoted` or `ended` with a `reason`. If the worker is not running locally, a Check stays at "Checking the name".

## Preview locally against the B2 backend

1. Backend worktree `.claude/worktrees/z8uq9mhgqt-domains-b2-be`: `DOMAINS_ENABLED=1 DOMAINS_PROVIDER=fake DJANGO_DEBUG=true` (and `DOMAINS_PURCHASE_ENABLED=1`, `DOMAINS_ALLOWED_TLDS=com`, `DOMAINS_MAX_COST_USD=12`, `DOMAINS_DAILY_PURCHASE_CAP=3`, `DOMAINS_DAILY_SPEND_CAP_USD=40`, `BILLING_ENABLED` on, `DOMAINS_PSL_FILE` pointing at a local list, else every name is refused). Run the API, and a worker plus beat (the sweep advances the states). The test site must be Santé with a paid cycle (confirm a first payment) or the screen stays locked.
2. Frontend: `SITE_API_BASE=http://<local api>/v1 pnpm --dir apps/dash dev` (port 3001); the API must list the dash origin in `API_ALLOWED_ORIGINS`, and sign in through the local public site as usual (see apps/dash/README.md, "Local preview" and the negosyotest hosts runbook).
3. Open `/settings/domain/` (not in any menu). Try: Check `something.com`, Buy, confirm, watch the steps; a trial site shows the locked text; with `DOMAINS_ENABLED` off the page says not available.

I verified the layout in light, dark and phone width against a throwaway mock API (not committed), not against the real B2 backend.

## Tests and checks

`pnpm --dir apps/dash test` (node --test): 676 pass. `pnpm --dir apps/dash lint`: clean. `tsc --noEmit` (after a build generated the Next types): clean. `pnpm build`: OK.

## Open questions

* The h1 reads "Your website address" (sidebar label, if any, is for the menu step). Wording needs Coach Ed's approval.
* The line "Included with your plan: one .com for your store." is fixed text; the API's `extensions` list can in principle name other endings.
