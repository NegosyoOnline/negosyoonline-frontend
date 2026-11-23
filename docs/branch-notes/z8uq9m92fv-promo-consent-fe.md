# z8uq9m92fv PROMO-CONSENT FE (SANTE)

Branch feat/z8uq9m92fv-promo-consent-fe, apps/storefronts only. Approval source: ClickUp 1100430000616135 (Coach Ed, 23 Nov 2026, 'Just build it.. no need to be strict', relayed by the Manager).
BE head used: origin/feat/z8uq9mbreu-promo-consent-be at de123b6. ClickUp subtask pending (MCP limit until ~04:40 Tue). z8uq9med6x description and the subtask were not read (no ClickUp calls).

## Decisions
- Contract gap: the contact form renders before checkout/contact/, so the flag cannot come from that answer for a first-time buyer. SANTE Supervisor decision (23 Nov): read the 3 fields from GET /storefront/v1/pack/ (fetchPack, src/lib/django.ts, read on every checkout render) first, with the checkout/contact/ answer as the fallback; missing means off everywhere. HQ BE contract v1.2 (the 3 fields on GET pack/, omitted when off) is in place at de123b6 (HQ-reviewed): GET pack/ returns them when the switch is on, so the box shows on the first render. The pack/ case is tested with mocked answers.
- Box shown on the contact step (after the Terms tick) and the payment step; unticked unless re-rendered after a refusal with the tick; label is promo_sms_text escaped, never hard-coded; ticked adds promo_sms_ok=1 to checkout/place/, unticked or switch-off sends nothing.
- Toggle: its own card on /dashboard/account/ (no JS: a form posting to new /dashboard/account/preferences/, which calls member/preferences/ and re-renders the account page with a notice). Hidden when member/preferences/read/ answers 404 or fails. Wording 'Promotions by text from <store>'. Existing .card/.row/.badge/.btn classes, so desktop and phone match the account page. Preference calls use member_token as the contract says.

## Files
-  M apps/storefronts/src/lib/account-flow.ts
-  M apps/storefronts/src/lib/checkout-flow.ts
-  M apps/storefronts/src/lib/django.ts
-  M apps/storefronts/src/lib/pack-api.ts
-  M apps/storefronts/src/views/sante/pack-account.ts
-  M apps/storefronts/src/views/sante/pack-checkout.ts
- ?? apps/storefronts/src/app/dashboard/account/preferences/
- ?? apps/storefronts/tests/promo-consent.test.ts
- ?? docs/branch-notes/z8uq9m92fv-promo-consent-fe.md

## Checks (apps/storefronts)
- pnpm test: 701 pass, 0 fail (11 new in tests/promo-consent.test.ts)
- pnpm lint: 0 errors (13 warnings, all pre-existing in public/assets js)
- npx tsc --noEmit: clean; pnpm build: ok
- Not run: local browser look against the BE branch (see report).

## Subtask draft
# DRAFT ClickUp subtask (create under z8uq9m92fv when the ClickUp MCP limit resets, ~Tue 24 Nov 05:00 HKT)

**Name:** PROMO-CONSENT FE (SANTE): Pack checkout opt-in checkbox + member dashboard promo-text toggle

**Authority:** Coach Ed, 23 Nov 2026, Manager session, ClickUp 1100430000616135: PROMO-CONSENT "Just build it.. no need to be strict" (opt-in checkbox + toggle + filter; no blocking, no footer; HQ owns the BE and the filter FE; SANTE owns the checkout/profile checkbox and toggle FE; switch off; local preview to Ed). Split agreed between the HQ and SANTE Supervisors, 23 Nov.

**Contract:** HQ PROMO-CONSENT BE contract v1.2 (side-session-notes/local_62a06250-5710-4ff0-bea6-ab789927bc90/promo-consent-be-contract-2026-11-23.md; also in docs/ on the BE branch). BE branch origin/feat/z8uq9mbreu-promo-consent-be, head de123b6 (HQ-reviewed, not yet released). Switch PROMO_SMS_CONSENT_ENABLED, off by default.

**Repo:** negosyoonline-frontend, apps/storefronts only. Own worktree, branch feat/z8uq9m92fv-promo-consent-fe from latest origin/main.

## Deliverable
1. **Pack checkout checkbox** (apps/storefronts: src/views/sante/pack-checkout.ts, src/lib/pack-api.ts, src/lib/checkout-flow.ts, and the funnel/membership-pack checkout routes as needed):
   - Read `promo_sms_consent_enabled`, `promo_sms_version` and `promo_sms_text` from the checkout/contact/ answer. A missing field means false (the BE omits all three while the switch is off).
   - Only when the flag is true, show one **unticked** checkbox whose label is `promo_sms_text`, exactly as given. Never hard-code the wording.
   - Ticked: add form field `promo_sms_ok=1` to POST checkout/place/. Unticked: send nothing.
   - Never block or change the order when it is unticked. No footer, no extra text.
2. **Member dashboard toggle** (apps/storefronts dashboard, the account page `src/app/dashboard/account/`, in the same style as the address/account settings):
   - POST /storefront/v1/member/preferences/read/ {host, visitor_ip, member_token} returns {promo_sms_ok, promo_sms_at}. On a 404 (switch off), hide the toggle completely.
   - The toggle posts /storefront/v1/member/preferences/ {host, visitor_ip, member_token, promo_sms_ok: bool} and shows the saved state.
   - Label: the same consent idea, e.g. "Promotions by text from <store>". Reply STOP to a store text also turns it off (no extra UI for that).
   - Member-session errors: handle them like the other member routes.

## Acceptance
- Switch off (no promo fields; read route 404): checkout and dashboard look exactly like origin/main.
- Switch on: the checkbox shows unticked with the BE text; ticking it sends promo_sms_ok=1; the toggle reads, saves and shows the value.
- Tests cover both switch states, the omitted-field case, the exact-text rendering and the toggle's 404 hide; storefronts tests, lint, build and tsc pass.
- Desktop and phone layout match the existing checkout fields and account settings; house look; focus border light blue.
- Branch notes list files, checks and the contract head used.

## Boundaries
- FE only; no BE, migration, Railway variable or switch change. No dash or HQ edits (HQ owns the owner filter).
- No PR. Report to the SANTE Supervisor. FOR CHECKING when done; then my local visual test and Ed's local OK through the Manager before ready.
- Ask the SANTE Supervisor about anything unclear in the contract; HQ answers BE questions through SANTE.

## BE contract v1.1
# PROMO-CONSENT: backend contract (HQ owns the BE), v1, Mon 2026-11-23

Approval: Coach Ed, "Just build it.. again no need to be strict what to text to its customer/subscribers!" (Manager relay, Mon 2026-11-23).
Not strict: consent is a label and a filter only.
- The composer never refuses a text for lack of consent.
- Nothing appends a footer.
- A "Promotional" flag is optional and only a label.

Split agreed with SANTE (~12:2x):
- HQ owns all the BE and the owner dash filter FE.
- SANTE owns the checkout checkbox FE and the member toggle FE.

Base: BE main e59fa75. ClickUp subtasks under z8uq9mbreu: IDs to follow (the ClickUp daily limit is hit until ~Tue 05:00 HKT).

## Switch
`PROMO_SMS_CONSENT_ENABLED`, default off. Railway is not changed by this work.
- Off: every field below is absent from the answers, the checkout ignores `promo_sms_ok`, and the member preference routes answer 404 `not_found`.
- On: as below.

## Model (one migration, under the standing staging migration rule)
On `members.Member`:
- `promo_sms_ok` BooleanField default False
- `promo_sms_at` DateTimeField null: when the current value was last set
- `promo_sms_version` CharField(16) blank: the consent wording version shown when it was set to true, e.g. "2026-11-23"

Additive only. Existing members start at False.

## 1. Pack checkout (storefront, `POST /storefront/v1/checkout/place/`, multipart form)
- New optional form field `promo_sms_ok`: "1" means true. Omitted or any other value means false.
- When the order creates or updates the member:
  - true sets `promo_sms_ok=True`, `promo_sms_at=now`, `promo_sms_version=<current>`.
  - false never clears an existing true. The checkout can only opt in.
- Replays (the same `submit_key`) change nothing.
- The answer is unchanged.

### 1a. The checkout reads the flag first (v1.1, SANTE's request, agreed)
- The `POST /storefront/v1/checkout/contact/` answer gains three fields:
  - `promo_sms_consent_enabled: bool`
  - `promo_sms_version: str|null`: the current version when on, null when off
  - `promo_sms_text: str|null`: the exact checkbox wording when on, null when off
- The FE shows the checkbox only when `promo_sms_consent_enabled` is true, and renders `promo_sms_text` exactly as given.
- The wording lives in one BE constant, with `{store}` filled from the site's display name:
  "Send me promotions from {store} by text. Reply STOP anytime."
  Version "2026-11-23". Any change to that wording must bump the version, and a test pins the pair.
- `promo_sms_version` stored on a member is the version that was current when they said yes.

## 2. Member preferences (storefront member area, same style as `/member/address/`)
- `POST /storefront/v1/member/preferences/read/` body `{host, visitor_ip, member_token}`
  - 200 `{promo_sms_ok: bool, promo_sms_at: iso|null}`
- `POST /storefront/v1/member/preferences/` body `{host, visitor_ip, member_token, promo_sms_ok: bool}`
  - 200, same shape as read. It sets the value, `promo_sms_at=now`, and the version when true.
- Errors as for the other member routes: 401 or 403 with the existing session codes; 404 `not_found` when the switch is off.
- Held stores (H3): the member routes stay open, like the other member writes.

## 3. STOP
When a STOP reaches a store (`apps/inquiries/sms_inbox.store_incoming`, stop=True), every member of that site with that mobile gets `promo_sms_ok=False`, `promo_sms_at=now`. The store's opt-out list is unchanged.

## 4. Owner API (dash)
- `GET /v1/sites/{site_id}/members/` rows gain `promo_sms_ok: bool`.
- New query param `promo=1` returns only members with `promo_sms_ok=True`.
  - With `promo=1`, `q` may be empty, to list all agreed members, 20 per page, newest first.
  - The cursor param follows the existing list style, if any. Otherwise `page`.
- Nothing is masked further than today.

## 5. Not in scope
- No gate in the SMS composer or bulk send.
- No footer.
- No HQ-side change.
- No email consent.

## FE owners
- SANTE: the checkout checkbox (posts `promo_sms_ok=1`) and the member dashboard toggle (the two routes in section 2).
- HQ: the dash members filter or tag (section 4).

## Fix round 1 (local visual test)
- Payment-step box: the `.pp-co-agree` rules are now one shared constant printed on both steps (payment step prints it only when the box shows); contact step unchanged. Test added.
- Account toggle: the save answers 303 to /dashboard/account/?promo=on|off|error; the page shows the notice from the marker (works without JS; reload resubmits nothing). Member-session errors unchanged.
- Off badge: new `.badge.off` built from existing tokens (var(--line), var(--muted)); no new colours. The page had no neutral badge.
- Out of scope, noted: the as-you-type "already registered" contact check and the phone transfer-panel overflow (both pre-existing).
