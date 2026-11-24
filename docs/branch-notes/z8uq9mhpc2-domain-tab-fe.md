# Branch notes: z8uq9mhpc2 DOMAINS F3 FE (dash Settings "Domain" tab)

Branch `feat/z8uq9mcyu0-domain-tab-fe`, cut from origin/main 8a2d35d. Parent design task z8uq9mcyu0. Authority: Manager decision 23 Nov 2026 (quoted in the task).
No TWCinc code, no new package, no backend edit, no new style, no real network call. `domain.js` and `apps/hq` are untouched (another builder changes domain.js on feat/z8uq9mcyu0-fd-fe).

## Files (apps/dash only)

* `public/index.html`: hidden "Domain" link after Notices in the Settings tab row (`data-route="settings-domain"`, `data-domain-nav`, `href="/settings/domain/"`); `dashboard.js` version token bumped.
* `public/assets/js/dashboard.js`: `probeDomainNav()` called with the other probes; ROUTES comment for `/settings/domain/` updated.
* `tests/domain-nav.test.mjs` (new, 5 tests); `tests/nav.test.mjs` (Settings tab list now has the Domain tab as the fifth hidden tab; the "linked from nowhere" test now allows only that hidden tab).

## Behaviour

The probe lives in dashboard.js, not domain.js (domain.js loads for its page only). It reads `GET /sites/` then `GET /sites/{id}/domain/` with the shared `NODash.call` (the same owner path domain.js reads). Only status 200 shows the tab. 404 (DOMAINS_ENABLED off), 403, 500, a network failure, 401 (signed out), no sites: it stays hidden. It does nothing if the page has no `[data-domain-nav]` element, so existing stand-in pages are unaffected.
The tab sits after Notices (the order on screen). Phone: the Settings tab row is the same row as on desktop (existing style, no change).

## Local preview

Same pattern as z8uq9mhgvj: local backend plus `SITE_API_BASE=http://<local api>/v1 pnpm --dir apps/dash dev` (port 3001), signed in as a Santé owner (see apps/dash/README.md "Local preview" and the negosyotest hosts runbook).
* Tab hidden: start the backend without `DOMAINS_ENABLED` (GET /domain/ answers 404). Open Settings: no Domain tab.
* Tab shown: restart the backend with `DOMAINS_ENABLED=1 DOMAINS_PROVIDER=fake DJANGO_DEBUG=true`. Reload Settings: the Domain tab appears after Notices and opens /settings/domain/.
Check at desktop width and at 375 px.

## Checks

`pnpm install --frozen-lockfile`, `pnpm lint` (root, all apps), `pnpm --dir apps/dash test` (761 pass, 0 fail), `pnpm --dir apps/dash build`, Node 22.23.1, pnpm 11.25.0.
