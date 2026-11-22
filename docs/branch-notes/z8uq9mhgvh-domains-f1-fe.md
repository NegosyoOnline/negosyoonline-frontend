# Branch notes: z8uq9mhgvh DOMAINS F1 FE

Branch `feat/z8uq9mhgvh-domains-f1-fe`, cut from `origin/main` 4e455b0. Design: ClickUp z8uq9mcyu0 (plan r4.1 row "F1", r4.2, r4.3 item 8; design R4). No edge file, no Worker, no secret and no new package. No TWCinc code was used. Edits are in `apps/storefronts` and `apps/hq` only. Backend contract read from `feat/z8uq9mhgqt-domains-b2-be` (`apps/domains/storefront_api.py`, `apps/domains/staff.py`, `apps/domains/probe.py`).

## apps/storefronts: the probe route

* `src/app/.well-known/negosyoonline-probe/route.ts` (new): `GET /.well-known/negosyoonline-probe?n=<nonce>`. The worker's HTTPS probe asks it at `https://www.<domain>/`. It answers `{"site": <public id>, "n": <nonce>}` with `Cache-Control: no-store`, no cookie and no other field. Any other method, no nonce, a nonce that is not 16 to 64 characters of `A-Z a-z 0-9 _ -` (the backend's is `token_urlsafe(16)`, 22 characters), a host Django does not know, the API down, slow or answering anything but 200, or a missing secret: the neutral 404 (the nonce is never echoed into a 404). The host is the request's `Host`, cleaned like every other page (`requestHost`).
* `src/lib/django.ts`: `fetchDomainProbe(host, env, fetchImpl, log)` calls `GET /storefront/v1/domain-probe/?host=` with the server credential, never cached, `redirect: "error"`, 5 s limit, the same fail-closed pattern as `fetchSite`. A 404 is quiet (the backend answers it while `DOMAINS_ENABLED` is off). Only the `site` string is taken from the answer; nothing else is passed on. The log line names a reason, never the host, URL or secret.
* `README.md`: one row in the paths table.
* `tests/domain-probe.test.ts` (mocked fetch, no network): the call and headers, every fail-closed case, the log carries no secret or host, the route answers `{site, n}` uncached with nothing else, a 404 body never leaks the API's words or the nonce, bad nonces never reach Django, the API down gives the 404, other methods give the 404.
* Not changed: `host.ts`, `cookies.ts`, `site.ts`, `proxy.ts`, `next.config.ts`. Note for the Supervisor: `proxy.ts` runs for `www.` hosts and asks Django whether the apex is a custom host. It passes the probe through unless the apex is itself a served custom host (then it answers a 308, which the worker counts as a failed probe). For the launch flow (the claim's hostname is `www.<domain>`) this does not arise; flagged in case the apex is ever served too.

## apps/hq: the Domains page

* `public/domains.html`, `public/assets/js/domains.js`, `next.config.ts` (rewrite `/domains/` and redirect `/domains.html`), `public/assets/js/menu.js` (a plain menu entry "Domains" between Lifecycle and Settings, like Finance and Lifecycle; the gated Inbox and Contacts entries still go in front of Settings), `public/assets/css/hq.css` (`dm-*` classes), `README.md` (a pages-table row).
* The page asks `me/`, then `domains/list/`. A table of claims: site and claim id, domain (and the registered name if it differs), state, registration, last change, and the last "confirmed registered" request with its result. Under the heading: the purchases in the last 24 hours against the cap and whether buying is on (counts only; no price or amount is shown anywhere). A card lists `eligible_sites`.
* Actions, each behind a confirm dialog that opens on Cancel: Retry (claim `failed`), Disconnect (not `removal_pending` or `ended`), Cancel request (registration `intent`), Confirmed registered (registration `conflict`, none already pending). The buttons are drawn only where the action can apply; the backend still decides. A 4xx refusal shows the API's own `error.message` in the dialog, which stays open; no answer or a server fault shows a plain line. A 404 closes the dialog and the list shows what is true.
* "Confirmed registered" follows the new B2 shape: 202 `{"claim", "status": "requested" | "pending"}`. The page says "Requested ... Refresh to see the result", reads the list again (the row shows "Requested, waiting"), and Refresh shows the worker's result from `confirm` (`pending`, `done`, `refused` with its reason code in words). There is no timer, as on Lifecycle.
* A 404 from the list: "Domains is not available." Anything else that fails: "Domains could not be reached" with Try again.
* The state filter is the house dropdown: `NOFin.combo` from `finance-common.js` (rounded box, chevron, light-blue focus border, panel below, placeholder, type-to-filter) over a hidden native select. `combo` gained an optional fifth argument `onPick(value)`, called after a row is chosen; no existing caller passes it, so no other page changes.
* Reasons are codes (`not_in_our_account`, `status_in_progress`, `read_failed_*`, `operator_disconnect`): known confirm codes get a sentence, others are spaced out as plain words, a reason that is already a sentence is shown as written. All backend text is set as text, never markup. A state with no words is a fallback line, never the raw code.
* Phone: under 900 px each claim is a stacked card with the column name beside each value, full-width action buttons. Checked light and dark, at 375 and 1360 px wide.
* Cache-busting: the changed scripts and the stylesheet got new `?v=` values (`menu.js`, `finance-common.js` on every page that loads them; `hq.css` and `domains.js` on the new page only, since only `dm-*` rules were added).
* Tests: `tests/domains.test.mjs` (new, 20 tests); `menu`, `phone-nav`, `contacts-menu`, `inbox-menu` updated for the extra entry; `rules` and `focus` gained a Domains case each.

## Preview locally against the B2 backend

Backend (its own `.venv`, local test services as in the repo notes), from the B2 worktree, with the usual HQ and staff variables for the HQ page (see `apps/hq/README.md`, "Local preview") plus:

    DOMAINS_ENABLED=1 DOMAINS_PROVIDER=fake DJANGO_DEBUG=true STOREFRONT_ENABLED=1 STOREFRONT_SERVER_SECRET=<32+ chars, local only>

HQ: `HQ_STAFF_API_BASE=http://ggwp.negosyotest.com:8000/staff/v1 pnpm build && pnpm start --port 3003` in `apps/hq`; sign in at http://hq.negosyotest.com:3003/sign-in/ and open `/domains/` (also the "Domains" menu entry). With `DOMAINS_ENABLED` unset the page shows "Domains is not available." Make a claim to see rows (the fake provider; see the backend runbook `docs/runbooks/custom-domains.md`).

Storefronts probe: in `apps/storefronts`, `STOREFRONT_API_BASE=http://127.0.0.1:8000 STOREFRONT_SERVER_SECRET=<the same value> pnpm dev` (port 3002), then for a host Django is connecting (a claim in a state the backend's `hosts.site_for_probe` serves):

    curl -i -H "Host: www.<claim host>" "http://127.0.0.1:3002/.well-known/negosyoonline-probe?n=abcdefghijklmnopqrstuv"

Expected `200 {"site":"<site public id>","n":"abcdefghijklmnopqrstuv"}` with `Cache-Control: no-store`; an unknown host, no `n`, or `DOMAINS_ENABLED` off: the neutral 404.

## Checks run

* `apps/storefronts`: `pnpm test` (679 pass, includes 7 new), `pnpm lint` (0 errors, the 13 existing warnings), `npx tsc --noEmit` clean, `pnpm build` compiles and lists the route.
* `apps/hq`: `pnpm test` (619 pass), `pnpm lint` clean. `npx tsc --noEmit` reports only `src/app/layout.tsx` `LayoutProps` (a Next generated type; present before this branch).
* Browser check on a local HQ build pointed at a throwaway stub of the staff routes (not the real backend): list, filter, each dialog, the 202 then waiting row, a 409 refusal shown in the dialog, the 404 state; light and dark, 375 and 1360 px. Not yet run against the real B2 backend.

## Fix round 1 (coordinator's visual check)

* Store names: the page reads the store's name from a claim's `store_name` (also `site_name`, `display_name`) and from each eligible site as `{site, name}` (also `id`; a plain id string still works). The name is the main line, the site id and claim id small under it; the id stands in when there is no name. "Sites that can choose a domain" is a list of names with the id small. The field names are a guess until the B2 fix lands: confirm and adjust `storeName()` in `domains.js`.
* Desktop: dates are short ("Nov 22, 4:51 PM", no year), padding and column widths are tighter, the actions column is 132 px with stacked, wrapping buttons. No horizontal scroll at 1360 or 1200; every label shows in full.
* Phone: ids break inside the card (`overflow-wrap`), checked with a 75-character id; no horizontal overflow at 375.
* Focus border: the filter box uses `var(--link)` like `.input` (measured rgb(23, 61, 184) in the light theme, the shared HQ link blue; the dark theme's is #9DB4FF). The page adds no navy focus rule.
