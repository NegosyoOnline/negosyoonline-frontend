# Dashboard and Sign-In Popup on the New API (Phase 1 Frontend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** draft for the coordinator, 2026-11-10. Not approved. Nothing in it is built.

**ClickUp:** `z8uq9mach6` "Phase 1: Foundation — Account, Site, Onboarding State & Authorization" (https://app.clickup.com/t/z8uq9mach6), child of `z8uq9mach5`. The task is already Completed in ClickUp because it was completed in TWCinc. This plan makes **no ClickUp status change**.

**Goal:** The copied subscriber dashboard (`apps/dash`) and the public site's sign-in and sign-up popup (`apps/site`) work against the new NegosyoOnline API, with its cookie session, its one error shape and its opaque ids, and look exactly as they do today.

**Architecture:** Both apps are static HTML and plain JavaScript in `public/`, served by Next.js. Almost every change is confined to the two shared API helpers (`apps/dash/public/assets/js/app.js`, `apps/site/public/assets/js/api.js`): they send the session cookie, turn the API's error shape into the shape the screens already read, and adapt `/me/`. The screens then change only where an endpoint, a key or an id type changed. No page, markup, style or wording is added.

**Tech Stack:** Plain browser JavaScript (no build step for `public/`), Next.js 16 as the static server, pnpm, Node 22 (`node --test` and `node:vm` for the tests; no new dependency).

**Sources read:**

- ClickUp task `z8uq9mach6` and its one comment (the TWCinc local acceptance record). No attachment, no checklist.
- Backend, `origin/main` at `23c9e32`: `docs/superpowers/specs/2026-11-10-backend-mvp-scope-design.md`; plans for slices 2a, 2b and 3; `apps/accounts/api.py`, `apps/accounts/services.py`, `apps/accounts/sessions.py`, `apps/common/errors.py`, `apps/common/middleware.py`, `apps/common/ids.py`, `config/settings.py`, `.env.example`.
- Backend branch `origin/feat/z8uq9mach6-sites-endpoints` at `f7b7d32` (PR 30): `apps/sites/api.py`, `apps/sites/services.py`. Read because the staging OpenAPI does not list the slice 3 endpoints yet.
- `https://api-staging.negosyonline.com/v1/openapi.json`, fetched 2026-11-10: 12 operations (sign-in, `/me/`, account, sessions, Google). No `sites` or `account/setup` path yet.
- Frontend `origin/main` at `2f101af`: every file under `apps/dash/public/assets/js/` and `apps/site/public/assets/js/`, both `next.config.ts`, both config routes, both READMEs, `.github/workflows/ci.yml`.

**Not read:** the TWCinc repository (not needed: the copied code is here, and the backend plan carries the legacy rules with sources). Nothing else was unreadable.

---

## 1. Scope

In this plan:

- The dashboard's API client: cookie session, 401, sign-out, error shape, `/me/`.
- Opaque site ids in the six dashboard files that assume numbers.
- Every row of the backend plan's "What the dashboard must change".
- The public site popup: email-code sign-up and sign-in, the Google button, the Google failure redirect.
- Removing `preview.js`.
- Local test setup and the checks.

Not in this plan:

| Left out | Why |
|---|---|
| Phases 4 to 7 (Account Settings editing, Business Settings beyond what already exists, labels, the rest) | Ruled out by the coordinator. `account.js` falls back to its read-only panel on its own (section 7). |
| Billing, payments, earnings, storefront settings, mobile OTP, social connections, referrals | The backend does not serve them yet. Section 7 lists each and what its screen does meanwhile. |
| Facebook sign-in | The backend has not built it (spec section 9, slice 2 "then Facebook"). The popup shows no Facebook button, which is what it does today when a provider is not configured. |
| Any backend change | The backend repository is read-only reference. |
| Any new page, markup, style or wording | Ruled out. Where a message is needed and no existing string fits, it is a decision in section 11, not something this plan invents. |
| Deleting the two dead standalone pages (`verify-email`, `social-complete`) | They belong to the legacy email-link and token-exchange flow. Nothing links to them after this plan. Proposed as a follow-up (section 11, note N2). |

## 2. The contract this plan builds against

All paths are under `<API>/v1`. `<API>` is `cfg.apiBase` without the `/v1` (the config value already ends in `/v1`).

**Session** (`apps/accounts/sessions.py`, slice 2a plan): cookie `no_session`, `HttpOnly`, `SameSite=Lax`, host-only on the API host, path `/v1/`, 30 days, `Secure` unless the API runs with `DJANGO_DEBUG=true`. The browser cannot read it; the frontend never stores anything. A successful email-code verify revokes that account's earlier sessions, so signing in on a second device signs the first one out.

**Origin rule** (`apps/common/middleware.py`): CORS answers with `Access-Control-Allow-Credentials: true` only for origins in `API_ALLOWED_ORIGINS`. Allowed request header: `content-type` only. A write (`POST`, `PATCH`, `PUT`, `DELETE`) from an origin not in the list answers 403 `origin_not_allowed`; a write with no allowed `Origin` to a sign-in or signed-in endpoint answers 403 `origin_required`.

**Errors** (`apps/common/errors.py`): every non-2xx answer is

```json
{"error": {"code": "invalid_request", "message": "Some values are missing or invalid.", "fields": {"email": ["Enter a valid email address."]}}}
```

`fields` is present only when there are field errors, and each value is a list of messages. A 204 has no body.

**Endpoints used by this plan**

| Endpoint | Request | Success | Errors the frontend handles |
|---|---|---|---|
| `POST auth/email-code/request/` | `{"email"}` | 204, no body | 400 `invalid_request` with `fields.email`; 429 `rate_limited` ("Wait a minute before asking for another code." or "Too many codes requested. Try again later."); 403 `origin_required` |
| `POST auth/email-code/verify/` | `{"email", "code", "accept_policies": bool}` (default false) | 200 `{"account": Account, "created": bool}` and the session cookie | 400 `invalid_code` "That code is wrong or has expired."; 400 `policies_required` (no account for that email and `accept_policies` false); 403 `account_closed`; 429 `rate_limited` |
| `GET auth/google/start/?accept_policies=true` | top-level navigation, not `fetch` | 302 to Google | 404 `not_found` JSON when Google is not configured on that environment |
| `GET auth/google/callback/` | Google's redirect | 302 to `<DASHBOARD_URL>/` with the cookie | 302 to `<SITE_URL>/?signin=1&error=<code>`; codes: `google_state_invalid`, `google_cancelled`, `google_failed`, `policies_required`, `google_email_unverified`, `google_account_mismatch`, `account_closed` |
| `POST auth/logout/` | no body | 204, cookie cleared | 401 |
| `GET me/` | none | 200 `{"account": Account}` | 401 `unauthenticated` |
| `GET account/setup/` (PR 30) | none | 200 `Setup` | 401 |
| `GET sites/` (PR 30) | `limit`, `cursor` optional | 200 `{"items": [Site], "next_cursor": string or null}` | 401 |
| `POST sites/subdomain-check/` (PR 30) | `{"subdomain"}` | 200 `{"subdomain", "status", "message"}` | 429 `rate_limited` |
| `POST sites/` (PR 30) | `{"template": "sante", "subdomain", "display_name"}`, no other key | 201 `Site` | 400 `invalid_request` (`fields.display_name`), 400 `invalid_template`, 400 `subdomain_invalid`, 400 `subdomain_reserved`, 409 `subdomain_taken` (each with `fields.subdomain`), 409 `site_limit_reached`, 409 `first_site_removed`, 403 `email_not_verified`, 429 `rate_limited` |
| `GET sites/{id}/` (PR 30) | none | 200 `Site` | 404 `not_found` |
| `PATCH sites/{id}/` (PR 30) | any of `display_name`, `contact_email`, `contact_mobile`, `accent_color`, `instagram_url`, `tiktok_url`; no other key | 200 `Site` | 400 `invalid_request` with `fields`; 404 |
| `GET sites/{id}/business-profile/` (PR 30) | none | 200 `BusinessProfile` | 404 |
| `PATCH sites/{id}/business-profile/` (PR 30) | any `BusinessProfile` field except `updated_at`; no other key | 200 `BusinessProfile` | 400 `invalid_request` with `fields`; 404 |

Shapes:

- `Account`: `id` (`acc_…`), `email`, `name` (one string, may be empty), `email_verified`, `created_at`. There is no `first_name`, `last_name`, `site_name` or `trial_status`.
- `Site`: `id` (`site_` plus 20 characters of `0-9a-z`), `template`, `template_label`, `display_name`, `subdomain`, `host` (or null), `business_name` (read-only here), `contact_email`, `contact_mobile`, `accent_color`, `instagram_url`, `tiktok_url`, `created_at`. All at the top level; there is no `settings` object.
- `BusinessProfile`: `business_name`, `registered_name`, `tin`, `dti_business_number`, `bir_rsn`, `business_address`, `complaints_contact_name`, `privacy_contact_email`, `shipping_processing_time`, the five `shipping_*_estimate` fields, `shipping_estimates_confirmed`, `updated_at`.
- `Setup`: `state` (`not_started`, `in_progress`, `minimum_complete`, `blocked`), `blocked_reason` (null, `owner_email_unverified`, `first_site_removed`), `missing`, `first_site` (null or `{id, subdomain, display_name, deleted}`), `can_create_site`, `templates`, `site_host_suffix`, `started_at`, `minimum_completed_at`.

Two request bodies are strict (`extra="forbid"` in `apps/sites/api.py`): `POST sites/`, both `PATCH` bodies and the subdomain check refuse an unknown key with 400. The frontend must send exactly the listed keys.

## 3. Design decisions already settled by the sources

These are not open; each has its source.

| Topic | What the frontend does | Source |
|---|---|---|
| Session | Cookie only, `credentials: "include"` on every call, nothing stored | Spec section 4; backend plan table row 1 |
| A 401 | Leave for `<SITE_URL>/?signin=1` (no dashboard login page) | Coordinator ruling; today's `goSignIn()` (`app.js:18`) |
| Site type | Create body always carries `template: "sante"`; no type control | Coach Ed ruling; `dashboard.js:566` already does this |
| Overview without `/dashboard/` | No trial strip until the billing slice | Backend plan Decision 3, approved by Coach Ed 2026-11-10 ("until slice 4 the Overview shows no trial strip") |
| Workspace label | `first_site.display_name` from the setup answer | Backend plan table, last row |
| Step 3 | Two calls: contacts to `PATCH sites/{id}/`, business name to `PATCH sites/{id}/business-profile/` | Backend plan Decision 4, settled by the coordinator |
| Google link | Top-level navigation to `GET <API>/v1/auth/google/start/`, with `?accept_policies=true` only when the visitor agreed to the policies | Coordinator brief |

One reversible implementation choice, noted as the brief asks: the error shape is converted **once, in the two API helpers**, into the flat `{code, message, fields}` (with one string per field) that the screens already read. The alternative is to edit about forty read sites one by one; that is a much larger diff in accepted screens for the same result. Section 5 lists every read site so each can be checked.

## 4. File structure

| File | Change | Responsibility after the change |
|---|---|---|
| `apps/dash/public/assets/js/app.js` | Modify | The API client (cookie, 401, error shape), the `/me/` adapter, the site list and site id helpers, sign-out |
| `apps/dash/public/assets/js/dashboard.js` | Modify | Overview without `/dashboard/`; onboarding against `account/setup/` and the new site endpoints |
| `apps/dash/public/assets/js/business.js` | Modify | Business Settings: list shape, id, the renamed contact endpoint, top-level site keys |
| `apps/dash/public/assets/js/billing.js`, `payments.js`, `earnings.js`, `storefront-settings.js` | Modify | Only the site list shape and the id pattern (and `billing.js:689`, the one call that bypasses the shared client) |
| `apps/dash/public/assets/js/preview.js` | Delete | — |
| `apps/dash/public/index.html` | Modify | Drop the `preview.js` tag; bump the `?v=` token of every changed script |
| `apps/dash/README.md` | Modify | "Behaviour notes" and "Temporary staging preview" describe the bearer token and the preview |
| `apps/dash/tests/load.mjs`, `apps/dash/tests/*.test.mjs` | Create | Loads the browser scripts in `node:vm` and tests the pure helpers |
| `apps/dash/package.json` | Modify | A `test` script |
| `apps/site/public/assets/js/api.js` | Modify | Error shape, the Google button, the sign-in error messages; the unused session-storage token goes |
| `apps/site/public/assets/js/start.js` | Modify | The popup's two calls, the landing after verify, the `?error=` reader |
| `apps/site/src/app/assets/js/config.js/route.ts`, `apps/site/src/lib/site-env.ts` | Modify | Only if decision D3 is approved: one flag saying whether Google sign-in is offered |
| `apps/site/tests/load.mjs`, `apps/site/tests/*.test.mjs`, `apps/site/package.json`, `apps/site/README.md` | Create / modify | Tests and the "Before launch" note |

Not touched: `dash.css`, `site.css`, `signup.html`, `signup-modal.js`, every HTML body, `account.js`, `verify.js`, `social-complete.js`, `theme.js`, both `next.config.ts` (the CSP `connect-src` already follows `SITE_API_BASE`).

## 5. The dashboard, change by change

Line numbers are `origin/main` at `2f101af`.

### 5.1 Session, 401 and sign-out (`app.js`)

| Line | Today | Change to |
|---|---|---|
| `app.js:5-8` | `TOKEN_KEY`, `getToken()`, `setToken()` on `localStorage` | Removed. Nothing is stored. |
| `app.js:22-35` `call()` | `Authorization: Bearer` when `auth`; `credentials` only when the fifth argument is set | Always `credentials: "include"`. No `Authorization` header. `Content-Type` only when there is a body (the API allows only that header, and a body-less GET then needs no preflight). The `auth` and `credentials` arguments stay in the signature and are ignored, so the roughly sixty call sites do not change. |
| `app.js:30` | 401 on an authenticated call clears the token and calls `goSignIn()` | Any 401 calls `goSignIn()`. The promise still resolves with `status: 401`, which every caller already checks. |
| `app.js:39-48` `send()` | Bearer header | `credentials: "include"`, same 401 and error handling |
| `app.js:382-384` `signOut()` | `POST /auth/logout/`, clear token, go to the site | `POST /auth/logout/` (no body), then `location.replace(cfg.siteUrl \|\| "/")`. The API clears the cookie. |
| `app.js:420-442` `requireAccount()` | Leaves for sign-in when there is no token, then `GET /me/` | No token check. `GET /me/`: a 401 leaves for sign-in; the boot placeholder (`index.html:87`) shows until the answer. |
| `app.js:523-525` exports | `getToken`, `setToken` exported | Removed from `window.NODash`; `sitesOf`, `siteFromQuery`, `setWorkspace` added (below). |
| `billing.js:689-690` `fetchBlob()` | Its own `fetch` with a Bearer header and `D.setToken("")` | `fetch(D.cfg.apiBase + path, { credentials: "include" })`; on 401 only the redirect. The one call that bypasses `call()`. |

`verify.js:74` and `social-complete.js:34` call `D.setToken`. Both pages fail at their first API call (`/auth/verify-email/`, `/auth/social/exchange/` do not exist), before that line, and show their existing "expired or already used" message. They are not edited (note N2).

### 5.2 The one error shape

`call()` and `send()` pass every answer through one function:

```js
/* The API answers errors as {error: {code, message, fields: {name: [messages]}}}. The screens read
   data.code, data.message and data.fields[name] as one string, so the shape is converted here, once. */
function flatten(data) {
  var e = data && data.error;
  if (!e || typeof e !== "object") return data || {};
  var fields = {};
  Object.keys(e.fields || {}).forEach(function (k) {
    var v = e.fields[k];
    fields[k] = Array.isArray(v) ? v.join(" ") : String(v);
  });
  return { code: e.code, message: e.message, fields: fields };
}
```

Every place the dashboard reads an error, all served by that one conversion (verify each during Task 2):

| File | Lines | Reads |
|---|---|---|
| `app.js` | 60-63, 409, 430 | `data.message` |
| `dashboard.js` | 34-37, 128, 569-578, 581-586, 609, 1197 | `data.message`, `data.code`, `data.fields.subdomain`, `data.fields.display_name`, the whole `fields` map |
| `account.js` | 30-34, 492, 512-513, 548, 648, 679 | `data.message`, `data.code`, `data.fields[key]` |
| `billing.js` | 164, 334, 610, 693-695, 809 | `data.message`, `data.code`, `data.fields`. Lines 693-695 are inside `fetchBlob()`, which parses its own JSON: it calls `flatten` too (exported as `D.flatten`). |
| `payments.js` | 16, 317, 414 | `data.message`, `data.fields` |
| `earnings.js` | 21 | `data.message` |
| `business.js` | 86 | `data.fields` |
| `storefront-settings.js` | 24 | `data.fields.customer_shipping`, `data.message` |
| `verify.js`, `social-complete.js` | 49, 36 | dead pages, not edited |

The network-failure answer (`app.js:34`, `app.js:47`) already has the flat shape and is unchanged.

### 5.3 `/me/` and the account text (`app.js`)

`GET /me/` now answers `{"account": {id, email, name, email_verified, created_at}}`. The screens read `first_name`, `last_name`, `site_name`, `trial_status` from a flat object:

| Reader | Lines | Reads today |
|---|---|---|
| `initials()` | `app.js:65-68` | `first_name`, `last_name`, `email` |
| `fillAccount()` | `app.js:75-96` | name from first and last; `site_name` for the workspace label, else "My Business"; `trial_status` for the chip |
| `greeting()` | `dashboard.js:38-46`, used at 654, 771, 1288 | `first_name` |
| `renderAccountPanel()` | `dashboard.js:227-252` | first and last for "Name", `email`, `email_verified` |
| Step 1 mail row | `dashboard.js:1046` | `email` |

Change: `requireAccount()` and `refreshAccount()` (`app.js:438-440`, `517-521`) pass `res.data.account` through one adapter, so no reader changes:

```js
/* /me/ answers {account: {id, email, name, email_verified, created_at}}. The screens read first_name and
   last_name, so the one name is split here: the first word, and everything after it. */
function accountView(data) {
  var a = (data && data.account) || {};
  var parts = String(a.name || "").trim().split(/\s+/).filter(Boolean);
  return { id: a.id, email: a.email || "", email_verified: a.email_verified === true, created_at: a.created_at,
    name: parts.join(" "), first_name: parts[0] || "", last_name: parts.slice(1).join(" ") };
}
```

How the one `name` is shown as greeting and initials is decision D2; the adapter above is the recommendation.

- **Workspace label:** `fillAccount()` keeps "My Business" as the fallback and no longer reads `site_name`. A new `D.setWorkspace(name)` sets every `[data-ws-name]` node; `dashboard.js` calls it with `siteName(lastSetup)` (`dashboard.js:616-620`, already written) each time a setup answer arrives (lines 508, 877, 1216).
- **Trial chip** (`app.js:74`, `88-93`): there is no `trial_status`, so the chip stays hidden, which is what the code already does for an unknown status. It returns with the billing slice.
- **`verifyGate()`** (`app.js:388-417`): reached only when `email_verified` is false. With email-code and Google sign-in every account is verified when it is created (`services.py:87-110`, `113-150`), so the gate is unreachable. Its "Resend verification email" button calls `/auth/resend-verification/`, which does not exist. Not edited (note N1).

### 5.4 Opaque site ids and the site list

`GET /sites/` answers `{items, next_cursor}` and ids are strings. Two helpers in `app.js` replace six copies of the same pattern:

```js
/* GET /sites/ answers {items: [...], next_cursor}. One page is enough: an account has one site in the MVP
   (the API's default page is 20). */
function sitesOf(res) { var d = res && res.data; return d && Array.isArray(d.items) ? d.items : []; }

/* The site named by ?site= when it is one of the caller's own (ids from GET /sites/), else the first.
   The API checks ownership on every call; this only keeps a pasted or stale id out of the request path. */
var SITE_ID_RE = /^site_[0-9a-z]{20}$/;
function siteFromQuery(ids, search) {
  var m = /[?&]site=([^&#]*)/.exec(search == null ? location.search : search);
  return m && SITE_ID_RE.test(m[1]) && ids.indexOf(m[1]) >= 0 ? m[1] : ids[0];
}
```

| File | Lines | Today | Change to |
|---|---|---|---|
| `business.js` | 23, 97, 99-100 | `SITE_RE` digits; `res.data.sites`; `parseInt` | `D.sitesOf(res)`; `site = D.siteFromQuery(ids)`; `SITE_RE` removed |
| `earnings.js` | 9, 242, 244-246, 257 | same; filters `template === "sante"` | same two helpers; the filter stays (`template` is still on `Site`) |
| `payments.js` | 8, 70, 72-73 | same | same |
| `storefront-settings.js` | 10, 86, 112, 117-119, 132-134 | same; `parseInt(sel.value, 10)` in the chooser | same; `var id = sel.value;` |
| `billing.js` | 7, 31-32, 234 | `SITE_RE`; `pickSite()` with `parseInt`; `res.data.sites` from `/billing/sites/` | `pickSite()` compares strings with `D.SITE_ID_RE`. The list still comes from `/billing/sites/`, which the new API does not serve (section 7), so this line has no visible effect until the billing slice; it is changed so no digit pattern is left behind. `NUMBER_RE` (statement numbers) is untouched. |
| `dashboard.js` | 101 | `/[?&]site=[1-9][0-9]*/` keeps `?site=` across Settings tabs | `/[?&]site=site_[0-9a-z]{20}/` |
| `dashboard.js` | 548, 563 | `typeof fs.id === "number"` | `typeof fs.id === "string" && fs.id !== ""` |
| `dashboard.js` | 1125 | `typeof d.id === "number"` after `POST /sites/` | the same string check |
| `dashboard.js` | 891 | `obj(res.data).sites` | `D.sitesOf(res)`; `list` is null when `!res.ok` |

### 5.5 Every row of "What the dashboard must change"

| # | Backend plan row | Code that changes |
|---|---|---|
| 1 | Bearer token from `localStorage` (`app.js:22-35`) → session cookie | Section 5.1 |
| 2 | Errors at the top level with string field values → `error.code`, `error.message`, `error.fields` as lists | Section 5.2 |
| 3 | Numeric site ids, `?site=` digits → opaque ids | Section 5.4 |
| 4 | `GET /sites/` `{sites}` → `{items, next_cursor}` | Section 5.4 (`D.sitesOf`): `business.js:97`, `earnings.js:242, 257`, `payments.js:70`, `storefront-settings.js:112`, `dashboard.js:891` |
| 5 | `GET /platform/eligibility/` (`dashboard.js:857`) removed; `can_create_site`, `templates`, `site_host_suffix` are in the setup answer | `loadEligibility()` (`dashboard.js:855-863`) makes no request: it sets `OB.elig = lastSetup` and draws. `step2Slot()` (`dashboard.js:557-562`) becomes `obj(elig).can_create_site === true ? "step2" : "reread"`. `suffixOf()` (`dashboard.js:612`) is unchanged: it reads `site_host_suffix`, which the setup answer carries. Cards `b1` ("Site setup opens soon", the closed launch gate) and `b5` ("Your trial or plan isn't active") in `CARDS` (`dashboard.js:827-833`) become unreachable: there is no gate, and creation is no longer refused after the trial (backend plan, "Deliberate differences"). They are left in place, unreferenced by any route. |
| 6 | `POST /sites/subdomain-check/`: unchanged in substance | `liveStatus()` (`dashboard.js:605-611`) needs no edit: 200 with `status` and `message`; a 429's message arrives through `flatten`. |
| 7 | `POST /sites/` codes | `createOutcome()` (`dashboard.js:568-579`): `add_site_unavailable` → `site_limit_reached` (kind `already`); the `subscription_inactive` line and `business_identity_unavailable` are removed; `first_site_removed` stays (kind `reread`). `fields.subdomain` covers `subdomain_invalid`, `subdomain_reserved` (400) and `subdomain_taken` (409) with the server's message, as today. 403 `email_not_verified`, 400 `invalid_template` and 429 `rate_limited` fall to the existing alert box with the server's message. `onCreate()` line 1128 (`o.kind === "inactive"`) is removed with it. The 201 `id` is a string (5.4). |
| 8 | `PATCH /sites/{id}/settings/` (`dashboard.js:1193`) → two calls | `onSave()` (`dashboard.js:1180-1202`): first `PATCH /sites/{id}/` with `{contact_email, contact_mobile}`; only if that answers 200, `PATCH /sites/{id}/business-profile/` with `{business_name}`. The first failing answer goes through `saveOutcome()` exactly as today, so field errors land on the same fields. If the first succeeds and the second fails, the contacts are saved and the form shows the business-name error; saving again repeats both calls, which is harmless. `saveOutcome()` (`dashboard.js:580-587`) loses the `billing_only` branch. `business.js:80` makes the same path change: `"/sites/" + site + "/settings/"` → `"/sites/" + site + "/"` (it already makes two calls). |
| 9 | `GET /sites/{id}/` reads `settings.contact_email` and the like → top level | `prefill()` (`dashboard.js:588-594`): `s = obj(d.settings)` → read `d.contact_email`, `d.contact_mobile`. `business.js:104`: `r[1].data.settings \|\| {}` → `r[1].data`. |
| 10 | `blocked_reason` values | `BLOCKED_VIEW` (`dashboard.js:536`) becomes `{ first_site_removed: "b3" }`. The `business_identity_unavailable` special case (`dashboard.js:552`) is removed. `owner_email_unverified` has no card: it falls to the existing "unknown reason shows today's Overview" rule (`dashboard.js:554`), and is unreachable in practice because `app.js` stops an unverified account first (5.3). Cards `b2` and `b4` stay only where code still routes to them: `b2` is still used by `drawSlot()` and `reread()` (`dashboard.js:867, 879`); `b4` becomes unreachable and is left in place. |
| 11 | A 404 from `GET /account/setup/` meaning "gate closed" never happens | `setupView()` line 544 (`404 → "today"`) is left as is: it is harmless and fails toward the normal Overview. |
| 12 | `GET /dashboard/` and the `/me/` keys are not provided | `load()` (`dashboard.js:500-518`) stops calling `/dashboard/`. It reads the setup only and sets `lastDash = { ok: true, status: 200, data: {} }`, so `showToday()` (`dashboard.js:656-669`) renders the Overview from an empty payload instead of the "We could not load your dashboard" box. `render()` (`dashboard.js:477-492`) leaves the trial strip out when `data.trial` is missing (backend Decision 3: no trial strip until the billing slice). `renderSubscription(null)` and `renderReferral(true, null)` are called once, so My Subscription shows "Plans and payment are not available yet" and Referral shows "Your referral link becomes available once you have an active paid subscription", both existing text. The workspace label and `/me/` keys are section 5.3. |

Santé only: `createBody()` (`dashboard.js:565-567`) already sends `template: "sante"` and exactly the three keys the strict body accepts. No change, and no type control is added. The `templates` list in the setup answer is not read.

## 6. The public site popup

### 6.1 Every API call the popup makes today

| # | Where | Today | New API |
|---|---|---|---|
| P1 | `start.js:37`, `signup-modal.js:68` | `GET /referrals/{code}/` → `{valid, referrer_first_name}` | **Not available** (spec slice 7). Today a failed answer shows no banner and saves no cookie. See decision D6. |
| P2 | `start.js:47` | `GET /plan/preview/` → `policy_version` | **Not needed.** The policy version is the server's own setting (`POLICY_VERSION`); the request no longer sends one. The call and the `preview` guard (`start.js:8, 46-51, 62, 152, 199`) are removed. |
| P3 | `start.js:64-67` | `POST /auth/email-code/request/` with `{email, mode, accepted_policies, policy_version, referral_code}` | `POST /auth/email-code/request/` with `{"email": email}`. 204, no body. |
| P4 | `start.js:110-113` | `POST /auth/email-code/verify/` with `{email, code}`; answer `{created, exchange_code}`; then `location.assign(dashUrl + "/social-complete#code=…")` | `POST /auth/email-code/verify/` with `{"email", "code", "accept_policies": mode === "signup"}`, `credentials: "include"` (already passed). Answer `{account, created}` and the cookie. Then `location.assign(cfg.dashUrl + "/")`. No exchange step. |
| P5 | `api.js:69-87`, `start.js:151-161` | `GET /auth/social/providers/`, then `location.assign(apiBase + "/auth/social/{id}/start/?mode=…&policy_version=…&accepted=…&ref=…")` | No providers endpoint exists. One Google button, a top-level navigation to `cfg.apiBase + "/auth/google/start/"`, plus `?accept_policies=true` in sign-up mode only. Whether the button is drawn is decision D3. |
| P6 | `start.js:200-204` | Reads `?social_error=<code>` and shows `A.socialErrorMessage(code)` | Reads `?error=<code>`. `signup-modal.js:73-77` already opens the popup for `?signin=1` and removes only `signup` and `signin` from the address, so `error` is still there when `start.js` loads; `start.js` shows the message and clears the address as it does today. |

Policy acceptance: the popup has no tick box. In sign-up mode the notice under the button ("By continuing, you agree to …", `signup.html:24`) is the agreement, and it is hidden in sign-in mode (`start.js:187`). So `accept_policies` is `true` in sign-up mode and `false` in sign-in mode, for both the email code and the Google link. The `POLICIES` list and `POLICY_MSG` (`start.js:9-10`) are no longer sent; the server records its own policy list.

There is no separate sign-in and sign-up on the server: one verify call signs in, or creates the account when the email is new and the policies were accepted. Consequences, each mapped to text the popup already has:

| Case | Server answer | Popup shows (existing string) |
|---|---|---|
| Sign-up mode, email already has an account | 200 `created: false` | "Welcome back. Opening your dashboard..." (`start.js:112`) |
| Sign-in mode, no account for that email | 400 `policies_required` | "We could not find an account for that email. Start your free trial to create one." (`start.js:118`, today shown for a 404). Confirm in D4. |
| Wrong or expired code | 400 `invalid_code` | The server's message, through the existing `res.data.message` fallback (`start.js:119`) |
| Too many attempts | 429 `rate_limited` | "Too many attempts. Please try again in a few minutes." (`start.js:117`) |
| Closed account | 403 `account_closed` | The server's message "This account is closed." |
| Invalid email on request | 400 `invalid_request`, `fields.email` | The field error under the email box (`start.js:71`) |

`api.js` `call()` (`api.js:14-24`) gets the same `flatten` as the dashboard, so `res.data.fields.email` and `res.data.message` keep working. The `f.policy_version` and `f.accepted_policies` branches (`start.js:72-73`) are removed: the server no longer sends them. `getToken`, `setToken` and `TOKEN_KEY` (`api.js:6-9`) are unused and are removed, so the site stores nothing but the referral cookie.

Resend: the popup lets the visitor resend after 30 seconds (`start.js:91-98`); the server refuses a second code inside 60 seconds with 429. See decision D5.

### 6.2 The Google failure redirect

`<SITE_URL>/?signin=1&error=<code>`. The popup's existing messages (`api.js:49-59`) are keyed by the legacy codes. Mapping, with existing strings only:

| New code | Meaning (`apps/accounts/api.py`, `services.py`) | Existing string proposed |
|---|---|---|
| `google_state_invalid` | The flow cookie is missing, altered or older than ten minutes | `invalid_state`: "That sign-in session expired. Please try again." |
| `google_cancelled` | The visitor declined at Google | `cancelled`: "Sign-in was cancelled. You can try again or use an email code." |
| `google_failed` | Google could not be reached or answered badly | `failed`: "We could not complete that sign-in. Please try again." |
| `policies_required` | No account for that Google email and the policies were not accepted (the link was used in sign-in mode) | `no_account`: "We could not find an account for that sign-in. Create your account to start your free trial." |
| `account_closed` | The account is closed | `disabled`: "This account is not active. Please contact support." |
| `google_email_unverified` | Google has not verified that email | No existing string fits. Decision D4. |
| `google_account_mismatch` | The email belongs to an account already linked to a different Google account | No existing string fits. Decision D4. |
| anything else | — | The existing default: "We could not complete that sign-in. Please try again." |

### 6.3 A defect found in the copied popup

`start.js:148`, the "Use a different email" button, reads `keepErrors`, which is not defined in that scope (it is a parameter of `setMode`, `start.js:181`). The click appears to throw before `show("step1")` runs, so the button does nothing. It is in the copied code, not caused by this work. See decision D7.

## 7. Every legacy endpoint still called, and whether the new API serves it

"Now" means live on staging on 2026-11-10 (in the staging OpenAPI). "After PR 30" means in backend PR 30, not yet deployed.

### Served

| Endpoint | Called from | Status | Shape change |
|---|---|---|---|
| `GET /me/` | `app.js:422, 518` | Now | Section 5.3 |
| `POST /auth/logout/` | `app.js:383` | Now | None |
| `POST /auth/email-code/request/` | `start.js:67` | Now | Section 6.1 P3 |
| `POST /auth/email-code/verify/` | `start.js:110` | Now | Section 6.1 P4 |
| `GET /account/` | `account.js:76` | Now, different shape | See Account Settings below |
| `GET /account/setup/` | `dashboard.js:505, 875, 1214` | After PR 30 | Section 5.5 |
| `GET /sites/` | `dashboard.js:889`, `business.js:95`, `payments.js:67`, `earnings.js:240, 256`, `storefront-settings.js:110` | After PR 30 | `{items, next_cursor}` |
| `POST /sites/subdomain-check/` | `dashboard.js:1106` | After PR 30 | None |
| `POST /sites/` | `dashboard.js:1121` | After PR 30 | Codes, string id |
| `GET /sites/{id}/` | `dashboard.js:1144`, `business.js:101` | After PR 30 | Top-level keys |
| `PATCH /sites/{id}/settings/` | `dashboard.js:1193`, `business.js:80` | After PR 30, as `PATCH /sites/{id}/` | Section 5.5 row 8 |
| `GET PATCH /sites/{id}/business-profile/` | `business.js:82, 101` | After PR 30 | None in the keys the screen uses |

### Not available yet

For each: what the screen does today when the call fails (read from the code), and the smallest behaviour that keeps the accepted screens intact. **The last column is a recommendation for the coordinator to rule on (decision D1), not something this plan decides.**

| Endpoint | Called from | Arrives with | What the screen does when it fails | Smallest behaviour recommended |
|---|---|---|---|---|
| `GET /dashboard/` | `dashboard.js:505` | Billing slice (trial), slice 7 (referral), commerce (figures) | A 404 makes a finished account's Overview show "We could not load your dashboard" (`dashboard.js:659`) | Settled, not a decision: stop calling it; Overview from an empty payload with no trial strip (5.5 row 12) |
| `GET /platform/eligibility/` | `dashboard.js:857` | Never (replaced) | The setup error card | Settled: read the setup answer (5.5 row 5) |
| `GET /billing/sites/`, `…/overview/`, `…/payment/`, `…/statements/`, and the Billing page's writes | `billing.js:231, 239-252, 324, 330, 689` | Spec slice 4, at different paths (`sites/{id}/billing/…`) | `GET /billing/sites/` fails, so the page shows the existing panel "We couldn’t load your billing. Check your connection and try again." with Try again (`billing.js:299-305`) | Leave the page as it is; it shows that panel until the billing slice |
| `GET PATCH /sites/{id}/payment-methods/`, `accounts/`, `xendit/` | `payments.js:74, 113, 314, 327, 410, 423, 434` | Not in the backend MVP spec (commerce, section 10) | The site list loads, then the 404 shows "We couldn’t load your payment settings" with Try again (`payments.js:81-85`) | Leave as is |
| `GET /sites/{id}/withdrawals/` and its writes | `earnings.js:159, 176, 208, 229` | Not in the backend MVP spec (Santé domain) | "That did not work. Check your connection and try again." with Try again (`earnings.js:222-225`) | Leave as is |
| `GET /account/mobile/` | `earnings.js:254` (on every Overview) | Spec slice 8 | Fails silently: no "Withdrawals are not open" strip (`earnings.js:255`) | Leave as is |
| `POST /account/mobile/start/`, `/verify/` | `earnings.js:74, 84`, `account.js:566, 586` | Spec slice 8 | Reached only from screens that are themselves unavailable | Leave as is |
| `GET PUT /sites/{id}/storefront-settings/` | `storefront-settings.js:69, 90` | Not in the backend MVP spec | "Shipping settings are not available for this store yet." with Try again (`storefront-settings.js:29, 95`) | Leave as is |
| Account Settings editing: `PATCH /account/` with `first_name`, `last_name`; `POST /account/email/start/`, `/confirm/`; `POST /account/sessions/sign-out-others/` | `account.js:438, 465, 508, 537` | Endpoints are live now, with different bodies and answers (`name` instead of first and last; confirm needs `{email, code}`; sign-out answers `{revoked}`) | `GET /account/` answers 200 without `writes_open`, so `account.js:79` draws the earlier read-only panel: "Your details" and "Changing your account details is not available yet." | Leave as is. Adapting this page is Phase 4, outside this plan. The read-only panel shows the name through the `/me/` adapter. |
| `POST /account/connections/{facebook,google}/start/`, `/disconnect/` | `account.js:604-609` | Not in the backend spec as endpoints | Not reached (the page is read-only, above) | Leave as is |
| `POST /auth/resend-verification/` | `app.js:406` | Never (no email links) | Not reached (5.3) | Leave as is (note N1) |
| `POST /auth/verify-email/`, `POST /auth/social/exchange/`, `POST /auth/social/facebook/link/` | `verify.js:44, 66, 72`, `social-complete.js:33` | Never | The two pages show "expired or already used" | Leave as is (note N2) |
| `GET /auth/social/providers/` | `api.js:70`, `app.js:461` | Never | No provider buttons; the email form stays open | Replaced on the site (6.1 P5). The dashboard copy (`app.js:460-476`) is used only by the two dead pages and is left. |
| `GET /referrals/{code}/` | `start.js:37`, `signup-modal.js:68` | Spec slice 7 | No banner, no cookie | Decision D6 |
| `GET /plan/preview/` | `start.js:47` | Never needed | Blocks sending the code ("We could not load the policy details") | Removed (6.1 P2) |
| `POST /contact/` | `apps/site/public/assets/js/contact.js:106` | Not in the backend spec | Outside the popup and outside this plan; listed so it is not lost. The contact form cannot send on the new API. |

## 8. Removing `preview.js`

`apps/dash/public/assets/js/preview.js` and its tag at `apps/dash/public/index.html:284`.

What it does: on `dash-staging.negosyonline.com`, `localhost` and `127.0.0.1` only, it writes a fake `no_dash_token` to `localStorage` and answers every API call itself, in the **legacy** shapes (`/me/` flat, `/sites/` as `{sites}`, numeric id 1). On `dash.negosyotest.com` it does nothing, so the local check on the test domains is unaffected by it.

It cannot outlive the dashboard change: once `app.js` reads the new shapes, the preview's legacy answers would be misread on staging. So the file, the tag and the README section are removed **in the same pull request as the dashboard change** (PR 2), not before and not after.

That pull request is safe to merge to `main` (which deploys staging) only when all of these hold:

1. Backend PR 30 is merged and deployed on staging: `https://api-staging.negosyonline.com/v1/openapi.json` lists `/v1/account/setup/` and `/v1/sites/`.
2. The staging API allows both frontend origins with credentials. Check, with no secret involved:
   `curl -s -o /dev/null -D - -H "Origin: https://dash-staging.negosyonline.com" https://api-staging.negosyonline.com/v1/me/`
   must show `access-control-allow-origin: https://dash-staging.negosyonline.com` and `access-control-allow-credentials: true` (with a 401 status). The same for `https://www-staging.negosyonline.com`.
3. The popup change (PR 1) is live on `www-staging`, so there is a way to sign in. Without it the staging dashboard would only ever redirect to the site.
4. The local check in section 9 has passed and Coach Ed has accepted it.

Until then staging keeps showing the preview. After it, a signed-out visit to `dash-staging` goes to `https://www-staging.negosyonline.com/?signin=1`.

## 9. Local test setup

Three servers on one machine. The names resolve to 127.0.0.1 through `/etc/hosts`; every URL needs its port.

| Service | URL | How it runs |
|---|---|---|
| API | `http://api.negosyotest.com:8000` | Backend `main` with PR 30 merged: `uv run python manage.py runserver 8000` |
| Public site | `http://www.negosyotest.com:3000` | `pnpm dev:site` |
| Dashboard | `http://dash.negosyotest.com:3001` | `pnpm dev:dash` |

The API port is not fixed by any document; 8000 is Django's default (decision D8).

API environment for that run (names from the backend's `.env.example`; values contain no secret):

```
DJANGO_DEBUG=true
DJANGO_ALLOWED_HOSTS=api.negosyotest.com,localhost,127.0.0.1
API_ALLOWED_ORIGINS=http://www.negosyotest.com:3000,http://dash.negosyotest.com:3001
SITE_URL=http://www.negosyotest.com:3000
DASHBOARD_URL=http://dash.negosyotest.com:3001
SITE_PARENT_HOST=negosyotest.com
EMAIL_HOST=
```

Frontend environment, in an untracked `.env.local` in `apps/site` and in `apps/dash` (`.env*` is already ignored by both `.gitignore` files), read when the dev server starts:

```
SITE_API_BASE=http://api.negosyotest.com:8000/v1
SITE_URL=http://www.negosyotest.com:3000
SITE_DASH_URL=http://dash.negosyotest.com:3001
```

Why the cookie and CORS work with these values:

- With `DJANGO_DEBUG=true` the session cookie is not `Secure` (`sessions.py`, `secure=not settings.DEBUG`), so it is stored over plain http.
- The cookie is host-only on `api.negosyotest.com`. `www.negosyotest.com`, `dash.negosyotest.com` and `api.negosyotest.com` share the registrable domain `negosyotest.com`, so calls between them are same-site (the port does not count), and a `SameSite=Lax` cookie is sent on `fetch` with `credentials: "include"`. The same holds on staging for the three `negosyonline.com` hosts.
- `API_ALLOWED_ORIGINS` must hold the two origins exactly, with scheme and port, or the API answers without the credentials header and refuses writes with 403.
- The CSP `connect-src` in both `next.config.ts` files is built from `SITE_API_BASE`, so it allows the local API automatically.
- With `EMAIL_HOST` empty the 6-digit code is printed in the API's own log; the tester reads it there.
- `/assets/js/config.js` is cached for an hour: after changing `.env.local`, restart the dev server and hard-reload.
- Google sign-in answers 404 locally unless Google variables are set, so the Google button is checked only for its link and for the `?error=` messages (opened by hand).
- A local database is needed (`migrate` on the default SQLite file). Running the API locally at all is decision D8.

**Local visual check** (desktop width, then repeated at phone width 390 by 844):

1. `http://www.negosyotest.com:3000/` → Start Free Trial → email → code from the API log → lands on `http://dash.negosyotest.com:3001/`, onboarding popup at Step 1. The popup looks as on staging today.
2. Step 2: type a web address; "is available" appears; a reserved name (`admin`) and a short one (`ab`) show the server's messages; Create.
3. Step 3: business name, email, mobile; Save and finish; "You're all set up!". Reload: the normal Overview, the eyebrow carries the site name, no trial strip, the sidebar shows the site name.
4. Reload at Step 3 before saving (resume): the popup reopens at Step 3 with the site created.
5. Settings › General: the values saved in Step 3 are shown; change the mobile, save, reload, still there. An invalid TIN shows the field error.
6. Sign out from the account menu: lands on the public site; opening the dashboard URL goes to `http://www.negosyotest.com:3000/?signin=1` and the sign-in popup opens.
7. Login with the same email: "Welcome back", lands on the dashboard.
8. Login with an email that has no account: the "could not find an account" message.
9. `http://www.negosyotest.com:3000/?signin=1&error=google_cancelled`: the popup opens with the cancelled message; the address bar is cleaned.
10. Browser storage: `localStorage` and `sessionStorage` on both hosts hold no token (only the theme key on the dashboard). The `no_session` cookie is on `api.negosyotest.com`, `HttpOnly`.
11. Billing, Payments, Earnings, Shipping, Account Settings: each shows what section 7 says, nothing else.
12. Side by side with staging's current dashboard and popup at both widths: no visual difference in layout, spacing, colour or wording, other than the absent trial strip.

After Coach Ed accepts the local check, the same list is run on staging (`https://www-staging.negosyonline.com`, `https://dash-staging.negosyonline.com`) once section 8's conditions hold.

## 10. Tasks

Two pull requests. Both branch from `origin/main`; both names and descriptions carry `z8uq9mach6`.

- **PR 1, `feat/z8uq9mach6-site-popup-new-api`** (Tasks 1 to 3): `apps/site` only. Its endpoints are live on staging now, so it does not wait for PR 30.
- **PR 2, `feat/z8uq9mach6-dash-new-api`** (Tasks 4 to 9): `apps/dash` only. Local work can start against a local API with PR 30; merging waits for section 8's conditions.

Each task ends with `pnpm --dir apps/<app> lint`, `pnpm --dir apps/<app> build` and the tests, and a commit. Report actual output.

### Task 1: Test loader and the popup's API helper (`apps/site`)

**Files:**
- Create: `apps/site/tests/load.mjs`, `apps/site/tests/api.test.mjs`
- Modify: `apps/site/public/assets/js/api.js:5-24, 49-87, 89`, `apps/site/package.json`

- [ ] **Step 1: Add the loader.** `apps/site/tests/load.mjs`:

```js
/* Loads a browser script from public/assets/js into a bare context, so its pure helpers can be tested
   with node --test. No DOM library: only what the scripts touch while loading. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const JS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "assets", "js");

export function load(files, { config = {}, search = "", fetch } = {}) {
  const calls = [];
  const window = { NO_CONFIG: config, addEventListener() {} };
  const location = { search, pathname: "/", replaced: null, assigned: null,
    replace(u) { this.replaced = u; }, assign(u) { this.assigned = u; } };
  const document = { getElementById: () => null, querySelectorAll: () => [], addEventListener() {},
    createElement: () => ({ setAttribute() {}, appendChild() {} }), cookie: "" };
  const context = vm.createContext({ window, document, location, console, URLSearchParams, Promise, setTimeout,
    clearTimeout, Intl, fetch: (url, opts) => { calls.push({ url, opts }); return fetch(url, opts); } });
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(JS, f), "utf8"), context, { filename: f });
  return { window, location, calls };
}

export function answer(status, body) {
  return () => Promise.resolve({ ok: status >= 200 && status < 300, status,
    json: () => (body === undefined ? Promise.reject(new Error("no body")) : Promise.resolve(body)) });
}
```

- [ ] **Step 2: Write the failing tests.** `apps/site/tests/api.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { load, answer } from "./load.mjs";

const CFG = { apiBase: "http://api.test/v1", siteUrl: "http://www.test", dashUrl: "http://dash.test" };

test("an API error is flattened to code, message and one string per field", async () => {
  const body = { error: { code: "invalid_request", message: "Some values are missing or invalid.",
    fields: { email: ["Enter a valid email address."] } } };
  const { window } = load(["api.js"], { config: CFG, fetch: answer(400, body) });
  const res = await window.NOApi.call("POST", "/auth/email-code/request/", { email: "x" });
  assert.equal(res.ok, false);
  assert.equal(res.data.code, "invalid_request");
  assert.equal(res.data.fields.email, "Enter a valid email address.");
});

test("a 204 resolves ok with an empty object", async () => {
  const { window } = load(["api.js"], { config: CFG, fetch: answer(204) });
  const res = await window.NOApi.call("POST", "/auth/email-code/request/", { email: "a@b.co" });
  assert.equal(res.ok, true);
  assert.deepEqual(res.data, {});
});

test("no Authorization header and no token helpers", async () => {
  const { window, calls } = load(["api.js"], { config: CFG, fetch: answer(200, {}) });
  await window.NOApi.call("POST", "/auth/email-code/verify/", { email: "a@b.co", code: "123456" }, false, true);
  assert.equal(calls[0].opts.credentials, "include");
  assert.equal(calls[0].opts.headers.Authorization, undefined);
  assert.equal(window.NOApi.getToken, undefined);
  assert.equal(window.NOApi.setToken, undefined);
});

test("the Google link carries accept_policies only when signing up", () => {
  const { window } = load(["api.js"], { config: CFG, fetch: answer(200, {}) });
  assert.equal(window.NOApi.googleStartUrl("signup"), "http://api.test/v1/auth/google/start/?accept_policies=true");
  assert.equal(window.NOApi.googleStartUrl("signin"), "http://api.test/v1/auth/google/start/");
});

test("each Google failure code has a message, and an unknown code gets the default", () => {
  const { window } = load(["api.js"], { config: CFG, fetch: answer(200, {}) });
  const m = window.NOApi.socialErrorMessage;
  assert.equal(m("google_state_invalid"), "That sign-in session expired. Please try again.");
  assert.equal(m("google_cancelled"), "Sign-in was cancelled. You can try again or use an email code.");
  assert.equal(m("account_closed"), "This account is not active. Please contact support.");
  assert.equal(m("something_else"), "We could not complete that sign-in. Please try again.");
});
```

- [ ] **Step 3: Add the script and see the tests fail.** In `apps/site/package.json` scripts add `"test": "node --test tests/"`. Run `pnpm --dir apps/site test`. Expected: 5 failing tests (`fields.email` is undefined, `googleStartUrl is not a function`, and so on).

- [ ] **Step 4: Change `api.js`.**
  - Remove `TOKEN_KEY`, `getToken`, `setToken` (lines 6-9) and the `auth` header line (16).
  - Add `flatten` (the function in section 5.2, same body) and use it: `return { ok: r.ok, status: r.status, data: flatten(data) };` at line 21.
  - Replace the keys of `SOCIAL_ERRORS` (lines 49-59) with the new codes, keeping the existing strings as mapped in section 6.2; the two codes with no string are filled by the ruling on D4.
  - Add:

```js
/* Google sign-in is a browser navigation to the API, which redirects to Google and back.
   accept_policies is sent only in sign-up mode, where the notice under the button is the agreement. */
function googleStartUrl(mode) {
  return cfg.apiBase + "/auth/google/start/" + (mode === "signup" ? "?accept_policies=true" : "");
}
```

  - Replace `socialButtons` (lines 69-87): no request. It draws the one Google button, with the existing icon, class and "Continue with Google" label, when the ruling on D3 says to, and resolves the number of buttons (0 or 1) as before, so `start.js:156-161` is untouched. The click handler is `location.assign(googleStartUrl(getMode()))`.
  - Export `googleStartUrl` and `flatten` on `window.NOApi`; drop `getToken` and `setToken`.

- [ ] **Step 5: Tests pass.** `pnpm --dir apps/site test`. Expected: 5 passing.
- [ ] **Step 6: Commit.** `git add apps/site && git commit -m "feat(site): read the new API's error shape and link Google sign-in [z8uq9mach6]"`

### Task 2: The popup's two calls and the failure redirect (`apps/site`)

**Files:**
- Modify: `apps/site/public/assets/js/start.js:8-10, 46-51, 61-76, 105-122, 151-161, 199-204`

- [ ] **Step 1: Request.** `sendCode()` (lines 61-76): remove the `preview` guard and the two bodies; send `{ email: email }`. Remove the `f.policy_version` and `f.accepted_policies` branches. Keep the `f.email` branch and the 429 and fallback banner.
- [ ] **Step 2: Verify.** `submitCode()` (lines 105-122): body `{ email: email, code: code, accept_policies: mode === "signup" }`; on success keep the two `code-msg` strings and replace line 113 with `location.assign(cfg.dashUrl + "/");`. In the error branch, replace the `res.status === 404` test with `res.data.code === "policies_required"` (same string).
- [ ] **Step 3: Remove what the server now owns.** `POLICIES`, `POLICY_MSG` (lines 9-10), `preview`, `loadPreview()` and its call (lines 8, 46-51, 199).
- [ ] **Step 4: Google.** The `A.socialButtons` call (lines 151-161) passes `function () { return mode; }` instead of the query builder; the rest of the block is unchanged.
- [ ] **Step 5: The failure redirect.** Lines 200-204: read `get("error")` instead of `get("social_error")`.
- [ ] **Step 6: Referral.** Per the ruling on D6. The recommendation leaves `initReferral()` (lines 33-45) as it is.
- [ ] **Step 7: Check by hand against the local API of section 9** (the staging API refuses a local origin, so it cannot be used from a local site): items 1, 7, 8 and 9 of the local visual check, as far as the redirect to the dashboard URL.
- [ ] **Step 8: Lint, build, test, commit.** `git commit -m "feat(site): sign up and sign in against the new API [z8uq9mach6]"`

### Task 3: Site README and PR 1

- [ ] **Step 1:** `apps/site/README.md`: "Before launch" first bullet and the `api.js` line in "Shared" no longer mention a sign-in form token; state that the popup signs in with the API's cookie session and stores nothing.
- [ ] **Step 2:** Run `pnpm --dir apps/site lint && pnpm --dir apps/site build && pnpm --dir apps/site test`; record the output.
- [ ] **Step 3:** Give the coordinator the review packet for the popup (commit, the three local URLs with ports, the checklist items 1, 7, 8, 9, both widths). Open PR 1 only after Coach Ed's local acceptance.

### Task 4: The dashboard's API client (`apps/dash`)

**Files:**
- Create: `apps/dash/tests/load.mjs` (the same file as Task 1 Step 1), `apps/dash/tests/client.test.mjs`
- Modify: `apps/dash/public/assets/js/app.js:5-8, 20-48, 382-384, 419-442, 517-525`, `apps/dash/public/assets/js/billing.js:689-690`, `apps/dash/package.json`

- [ ] **Step 1: Write the failing tests.** `apps/dash/tests/client.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { load, answer } from "./load.mjs";

const CFG = { apiBase: "http://api.test/v1", siteUrl: "http://www.test" };

test("every call sends the cookie and no Authorization header", async () => {
  const { window, calls } = load(["app.js"], { config: CFG, fetch: answer(200, {}) });
  await window.NODash.call("GET", "/me/", null, true);
  assert.equal(calls[0].url, "http://api.test/v1/me/");
  assert.equal(calls[0].opts.credentials, "include");
  assert.equal((calls[0].opts.headers || {}).Authorization, undefined);
  assert.equal((calls[0].opts.headers || {})["Content-Type"], undefined);
});

test("a body is sent as JSON", async () => {
  const { window, calls } = load(["app.js"], { config: CFG, fetch: answer(200, {}) });
  await window.NODash.call("PATCH", "/sites/site_x/", { contact_email: "a@b.co" }, true);
  assert.equal(calls[0].opts.headers["Content-Type"], "application/json");
  assert.equal(calls[0].opts.body, '{"contact_email":"a@b.co"}');
});

test("a 401 leaves for the public site's sign-in popup", async () => {
  const body = { error: { code: "unauthenticated", message: "Sign in to continue." } };
  const { window, location } = load(["app.js"], { config: CFG, fetch: answer(401, body) });
  const res = await window.NODash.call("GET", "/me/", null, true);
  assert.equal(res.status, 401);
  assert.equal(location.replaced, "http://www.test/?signin=1");
});

test("nothing is stored: there are no token helpers", () => {
  const { window } = load(["app.js"], { config: CFG, fetch: answer(200, {}) });
  assert.equal(window.NODash.getToken, undefined);
  assert.equal(window.NODash.setToken, undefined);
});

test("errors are flattened with one string per field", async () => {
  const body = { error: { code: "subdomain_taken", message: "That name is already taken. Please choose another.",
    fields: { subdomain: ["That name is already taken. Please choose another."] } } };
  const { window } = load(["app.js"], { config: CFG, fetch: answer(409, body) });
  const res = await window.NODash.call("POST", "/sites/", {}, true);
  assert.equal(res.data.code, "subdomain_taken");
  assert.equal(res.data.fields.subdomain, "That name is already taken. Please choose another.");
});

test("the site list and the ?site= choice use opaque ids", () => {
  const { window } = load(["app.js"], { config: CFG, fetch: answer(200, {}) });
  const D = window.NODash, a = "site_0123456789abcdefghjk", b = "site_zzzzzzzzzzzzzzzzzzzz";
  assert.deepEqual(D.sitesOf({ ok: true, data: { items: [{ id: a }], next_cursor: null } }), [{ id: a }]);
  assert.deepEqual(D.sitesOf({ ok: false, data: {} }), []);
  assert.equal(D.siteFromQuery([a, b], "?site=" + b), b);
  assert.equal(D.siteFromQuery([a, b], "?site=7"), a);
  assert.equal(D.siteFromQuery([a], "?site=" + b), a);
  assert.equal(D.siteFromQuery([a, b], ""), a);
});

test("/me/ is adapted to the keys the screens read", () => {
  const { window } = load(["app.js"], { config: CFG, fetch: answer(200, {}) });
  const v = window.NODash.accountView({ account: { id: "acc_1", email: "ana@example.com", name: "Ana Maria Cruz",
    email_verified: true, created_at: "2026-11-10T08:00:00+08:00" } });
  assert.equal(v.first_name, "Ana");
  assert.equal(v.last_name, "Maria Cruz");
  assert.equal(v.email_verified, true);
  assert.equal(window.NODash.accountView({ account: { email: "x@y.co", name: "" } }).first_name, "");
});
```

- [ ] **Step 2: See them fail.** Add `"test": "node --test tests/"` to `apps/dash/package.json`. Run `pnpm --dir apps/dash test`. Expected: 7 failing.
- [ ] **Step 3: Change `app.js`** as section 5.1, 5.2, 5.3 and 5.4 describe. The new `call()`:

```js
/* Resolves {ok, status, data}. The API's session cookie rides every call; nothing is stored here.
   A 401 leaves for the public site, which opens its sign-in popup. The fourth and fifth arguments
   are no longer used; call sites still pass them. */
function call(method, path, body) {
  var opts = { method: method, credentials: "include" };
  if (body) { opts.headers = { "Content-Type": "application/json" }; opts.body = JSON.stringify(body); }
  return fetch(cfg.apiBase + path, opts)
    .then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (r.status === 401) goSignIn();
        return { ok: r.ok, status: r.status, data: flatten(data) };
      });
    })
    .catch(function () { return { ok: false, status: 0, data: { message: "We could not reach the server. Please check your connection and try again." } }; });
}
```

  `send()` the same with `body: form` and no headers. `requireAccount()` and `refreshAccount()` use `accountView(res.data)`. Add `sitesOf`, `SITE_ID_RE`, `siteFromQuery`, `accountView`, `flatten`, `setWorkspace` and export them.
- [ ] **Step 4:** `billing.js:689-690` as in 5.1.
- [ ] **Step 5: Tests pass**, lint, build. Commit: `feat(dash): cookie session and the new API's error shape [z8uq9mach6]`

### Task 5: Site ids in the settings screens (`apps/dash`)

**Files:** `business.js:23, 80, 97-100, 104`, `earnings.js:9, 242-246, 257`, `payments.js:8, 70-73`, `storefront-settings.js:10, 86, 112-119, 132`, `billing.js:7, 31-32`, `dashboard.js:101`

- [ ] **Step 1:** Apply the table in section 5.4 and rows 8 and 9 of section 5.5 for `business.js`.
- [ ] **Step 2: Check.** `grep -n -E 'parseInt\(m\[1\]|\[1-9\]\[0-9\]|\.sites\b|/settings/"' apps/dash/public/assets/js/*.js` must print only `billing.js:234` (`res.data.sites` from `/billing/sites/`, an endpoint with no new shape yet).
- [ ] **Step 3:** Lint, build, test. Commit: `feat(dash): opaque site ids in the settings screens [z8uq9mach6]`

### Task 6: Overview and onboarding (`apps/dash`)

**Files:**
- Create: `apps/dash/tests/onboarding.test.mjs`
- Modify: `dashboard.js:477-518, 536, 541-563, 568-594, 855-863, 889-893, 1121-1131, 1180-1202`

- [ ] **Step 1: Write the failing tests.** `apps/dash/tests/onboarding.test.mjs` (the stubbed `fetch` answers 401 to the `/me/` read that `dashboard.js` makes when it loads, so the page never starts and only the exported helpers are exercised; loading both real files this way was tried on 2026-11-10 and works):

```js
import test from "node:test";
import assert from "node:assert/strict";
import { load, answer } from "./load.mjs";

const { window } = load(["app.js", "dashboard.js"], { config: { apiBase: "http://api.test/v1", siteUrl: "http://www.test" },
  fetch: answer(401, { error: { code: "unauthenticated", message: "Sign in to continue." } }) });
const U = window.NOOnboarding.util, ID = "site_0123456789abcdefghjk";
const ok = (data) => ({ ok: true, status: 200, data });

test("setup states route with a string site id", () => {
  assert.equal(U.setupView(ok({ state: "not_started" })), "not_started");
  assert.equal(U.setupView(ok({ state: "in_progress", first_site: { id: ID } })), "step3");
  assert.equal(U.setupView(ok({ state: "in_progress", minimum_completed_at: "2026-11-10T08:00:00+08:00", first_site: { id: ID } })), "complete");
  assert.equal(U.setupView(ok({ state: "minimum_complete" })), "complete");
  assert.equal(U.setupView(ok({ state: "blocked", blocked_reason: "first_site_removed" })), "b3");
  assert.equal(U.setupView(ok({ state: "blocked", blocked_reason: "owner_email_unverified" })), "today");
});

test("step 2 opens from the setup answer alone", () => {
  assert.equal(U.step2Slot({ can_create_site: true }), "step2");
  assert.equal(U.step2Slot({ can_create_site: false }), "reread");
  assert.equal(U.suffixOf({ site_host_suffix: "negosyotest.com" }), ".negosyotest.com");
});

test("the create body is Sante and exactly three keys", () => {
  assert.deepEqual(U.createBody(" Ana's Store ", " Anas-Store "), { template: "sante", subdomain: "anas-store", display_name: "Ana's Store" });
});

test("create outcomes follow the new codes", () => {
  assert.equal(U.createOutcome({ status: 201, data: { id: ID, subdomain: "anas-store" } }).kind, "created");
  assert.equal(U.createOutcome({ status: 409, data: { code: "subdomain_taken", fields: { subdomain: "Taken." } } }).text, "Taken.");
  assert.equal(U.createOutcome({ status: 400, data: { code: "subdomain_reserved", fields: { subdomain: "Reserved." } } }).field, "subdomain");
  assert.equal(U.createOutcome({ status: 409, data: { code: "site_limit_reached" } }).kind, "already");
  assert.equal(U.createOutcome({ status: 409, data: { code: "first_site_removed" } }).kind, "reread");
  assert.equal(U.createOutcome({ status: 403, data: { code: "email_not_verified", message: "Confirm your email to continue." } }).text, "Confirm your email to continue.");
});

test("step 3 is prefilled from top-level site keys", () => {
  assert.deepEqual(U.prefill({ business_name: "Ana Trading", contact_email: "a@b.co", contact_mobile: "+639171234567" }, { display_name: "Ana's Store", subdomain: "anas-store" }),
    { business_name: "Ana Trading", contact_email: "a@b.co", contact_mobile: "+639171234567" });
});

test("a live site counts as the second step done", () => {
  assert.equal(U.countOf({ first_site: { id: ID, deleted: false } }), 2);
  assert.equal(U.countOf({ first_site: null }), 1);
});
```

- [ ] **Step 2: See them fail.** `pnpm --dir apps/dash test`. Expected: the `step3`, `step2`, `site_limit_reached`, `prefill` and `countOf` assertions fail.
- [ ] **Step 3: Change `dashboard.js`** as rows 5, 7, 8, 9, 10 and 12 of section 5.5 and the three `dashboard.js` rows of 5.4 describe. The new `onSave()` request, replacing line 1193:

```js
var contacts = { contact_email: values.contact_email, contact_mobile: values.contact_mobile };
D.call("PATCH", "/sites/" + first.id + "/", contacts, true).then(function (a) {
  if (!a.ok) return a;
  return D.call("PATCH", "/sites/" + first.id + "/business-profile/", { business_name: values.business_name }, true);
}).then(function (res) {
```

  The body of the `then` is unchanged. In `load()`, the `Promise.all` becomes the single setup read and `lastDash = { ok: true, status: 200, data: {} }`; in `render()`, `if (data.trial) wrap.appendChild(trialStrip(data.trial));`. `showToday()` line 660 reads `wrap.querySelector(".ov-trial")`, which may now be null: the referral branch at 661-665 is not entered without referral data, so no edit is needed there; confirm by reading.
- [ ] **Step 4:** After each setup answer, `D.setWorkspace(siteName(lastSetup))`.
- [ ] **Step 5: Tests pass**, lint, build. Commit: `feat(dash): onboarding and Overview on the new API [z8uq9mach6]`

### Task 7: Remove the preview (`apps/dash`)

**Files:** Delete `apps/dash/public/assets/js/preview.js`; modify `apps/dash/public/index.html:283-293`, `apps/dash/README.md`

- [ ] **Step 1:** Delete the file and line 284 of `index.html`.
- [ ] **Step 2:** Bump the `?v=` token of every script this plan changed (`app.js`, `dashboard.js`, `billing.js`, `payments.js`, `business.js`, `storefront-settings.js`, `earnings.js`) to one new value, for example `20261110na1` (README rule: assets are cached for an hour).
- [ ] **Step 3:** README: remove "Temporary staging preview"; in the first paragraph and "Behaviour notes" replace the bearer-token sentences with the cookie session and "nothing is stored in the browser except the theme".
- [ ] **Step 4: Check.** `grep -rn -E 'preview\.js|no_dash_token|Bearer' apps/dash --include='*.js' --include='*.html' --include='*.md' --include='*.ts'` prints nothing.
- [ ] **Step 5:** Lint, build, test. Commit: `chore(dash): remove the temporary staging preview [z8uq9mach6]`

### Task 8: Local check

- [ ] **Step 1:** Start the three servers as in section 9 (subject to D8).
- [ ] **Step 2:** Run the twelve items of the local visual check at desktop width and at 390 by 844. Record each result as passed or failed with what was seen; a screenshot per screen at both widths.
- [ ] **Step 3:** Network panel: no request carries `Authorization`; every API request carries the cookie; no request goes to `/dashboard/`, `/platform/eligibility/`, `/plan/preview/` or `/auth/social/providers/`.
- [ ] **Step 4:** Send the coordinator the review packet: commit of each branch, the three URLs with protocol and port, the test email used, the checklist with results, what was not verified.

### Task 9: PR 2 and staging

- [ ] **Step 1:** After Coach Ed's local acceptance, confirm section 8's four conditions; report any that does not hold instead of merging.
- [ ] **Step 2:** Open PR 2 with the task id and URL, what was built against which rows of this plan, and what was verified where.
- [ ] **Step 3:** After the merge and the staging deploy, run the same checklist on the staging hosts and report it. Merging and the staging check follow `/push-staging`.

## 11. Decisions needed

Only what the ClickUp task, the backend spec and plans, and the rulings do not settle. Each has a recommendation. Nothing that depends on one is built before it is answered.

**D1. What the screens whose endpoints do not exist yet show** (Billing, Payments, Earnings, Shipping, Account Settings editing; section 7).
- Recommended: change nothing. Each already shows an existing panel when its read fails, and Account Settings already falls back to its read-only panel. No new wording, no hidden menu items. The cost: Billing, Payments and Earnings say "check your connection and try again" when the real reason is that the feature is not built.
- Alternative: one shared "Not available yet" card for those views, in the style of the existing My Subscription card. Clearer, but it is new wording on accepted screens, so it needs Coach Ed.

**D2. Showing one `name` where the design shows a first name.** The API has `name` only. The greeting ("Good morning, Ana"), the initials and the Account panel were built on first and last name.
- Recommended: greeting uses the first word of `name`; initials are the first letters of the first and last words, or the email's first letter when there is no name; the Account panel shows the whole `name`. An account that signed up by email has no name yet, so it sees "Good morning" and its email initial, which is what the legacy dashboard showed before a name was entered.
- Alternative: greet with the whole name.

**D3. When the Google button is drawn.** The legacy popup asked the API which providers are configured. The new API has no such endpoint, and `auth/google/start/` answers a JSON 404 on an environment where Google is not set up, which a visitor would land on.
- Recommended: a site environment flag, `SITE_GOOGLE_SIGNIN` (default off), exposed as `NO_CONFIG.googleSignIn`. The button is drawn only when it is `true`. It is switched on per environment when the backend's Google variables are set there. Setting the Vercel variable needs Coach Ed's approval at that time.
- Alternative: always draw it. Simpler, but until the backend variables are set the button leads to an error page.
- Not proposed: a new API endpoint, because the ruling is that the API does not adapt.

**D4. Wording for three sign-in cases with no exact existing string.** Proposed mapping to existing strings, so no new copy is written:
- Email sign-in for an email with no account (`policies_required` in sign-in mode): "We could not find an account for that email. Start your free trial to create one."
- `google_email_unverified`: the general "We could not complete that sign-in. Please try again."
- `google_account_mismatch`: "An account with that email already exists. Sign in with an email code instead."
- If Coach Ed prefers the server's own messages or new wording, he supplies it.

**D5. Resend wait.** The popup allows a resend after 30 seconds and shows "0:30"; the server refuses a second code within 60 seconds.
- Recommended: make the popup wait 60 seconds ("1:00"), so the button never leads straight to an error. A two-character change in the countdown.
- Alternative: keep 30 seconds; an early resend shows "Too many attempts. Please try again in a few minutes."

**D6. Referral links until the backend's referral slice.** `GET /referrals/{code}/` does not exist, and sign-up accepts no referral code. A visitor arriving on a referral link sees no "Referred by" banner, and an account created now is not attributed to its referrer.
- Recommended: leave the popup's referral code untouched (it fails quietly), and tell Coach Ed that referral attribution is not recorded for accounts created before that slice.
- Alternative: none on the frontend; attribution needs the backend.

**D7. The "Use a different email" button** (`start.js:148`, section 6.3) appears to be broken in the copied code.
- Recommended: fix it in PR 1 (remove the undefined `keepErrors` test, one line), because the local check walks through that button and the fix changes nothing visible. Say so in the PR.
- Alternative: leave it and raise a separate task.

**D8. Running the API locally.** The local check needs the backend at `main` with PR 30, a local SQLite database (`migrate`), and a port. The backend repository is read-only for this builder, and its working copy is on another session's branch.
- Recommended: the coordinator says who starts the local API and on which port (8000 proposed). If it is this builder: from a separate throwaway copy of backend `main` outside both repositories, SQLite only, with the values in section 9, so the shared working copy is not touched.

**D9. Tests in CI.** The repository has no JavaScript tests today. This plan adds `node --test` files with no new dependency.
- Recommended: also add a "Test" step (`pnpm test`) to the `site` and `dash` jobs in `.github/workflows/ci.yml`. That file is shared, so the coordinator decides whether it goes in these PRs or in a separate one.

Notes, not decisions:

- **N1.** `verifyGate()` and its resend button (`app.js:388-417`) are unreachable with the new sign-in and are left in place.
- **N2.** `apps/dash/public/verify-email.html`, `social-complete.html` and their scripts belong to the legacy flow. Nothing links to them after this plan. Deleting them (and the `standalone` entries in `apps/dash/next.config.ts:8`) is a proposed follow-up.
- **N3.** Staging settings this plan depends on and cannot see: Railway `API_ALLOWED_ORIGINS` holding both staging frontend origins, and `SITE_URL` and `DASHBOARD_URL`. Section 8 item 2 checks the first without any secret.
- **N4.** A sign-in by email code revokes the account's other sessions. A subscriber signed in on two devices is signed out on the first when signing in on the second. This is the API's rule (spec section 4), stated here because testers will see it.
- **N5.** The contact form (`contact.js:106`, `POST /contact/`) has no endpoint on the new API. Outside this plan.

## 12. Self-review against the brief

| Brief item | Where |
|---|---|
| 1. Session, 401, sign-out | 5.1; Task 4 |
| 2. One error shape everywhere errors are read | 5.2 (every read site listed); Tasks 1 and 4 |
| 3. Opaque site ids in the six files | 5.4; Task 5 |
| 4. Every row of the backend table | 5.5: all twelve rows of the backend table (thirteen lines with its header), plus the Santé rule. Rows 1 to 3 are detailed in 5.1, 5.2 and 5.4. |
| 5. Popup inventory, new endpoints, policy acceptance, `?error=`, Google button | 6.1, 6.2; Tasks 1 and 2 |
| 6. Removing `preview.js` and when it is safe | 8; Task 7 |
| 7. Every legacy endpoint, marked, with today's failure behaviour | 7 |
| 8. Local setup, visual check, phone width | 9; Task 8 |
| 9. Tasks, checks, PR split, decisions | 10, 11 |

Checked: every function named in a later task is defined in an earlier one (`flatten`, `accountView`, `sitesOf`, `siteFromQuery`, `SITE_ID_RE`, `setWorkspace`, `googleStartUrl`); no request body carries a key the strict schemas refuse; no step adds a page, markup, style or new wording.
