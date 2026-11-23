# z8uq9m92fv checkout fixes (builder branch feat/z8uq9m92fv-checkout-fixes)

ClickUp subtask pending (MCP limit). Authority: Manager routine decision, 23 Nov.

## (b) Phone layout, transfer panel cut off (done)
- File: apps/storefronts/public/assets/sante/css/pack-forms.css only (no change to pack-checkout.ts, so no overlap with feat/z8uq9m92fv-promo-consent-fe).
- Cause: grid items and flex children default to min-width:auto, so the date/time pickers, the receipt box and the fields pushed past the yellow panel at 320 and 375 px.
- Fix: min-width:0 / max-width:100% on the panel, its fields, the picker row and cells, and the .file box (full width), scoped to .acct-sheet / .pp-co-dt; a small gap and padding trim for the three pickers at 430 px and below. Existing colours only, no wording change.
- Checked in Chrome headless on the rendered payment step: before, content ran 85 px (320) and 30 px (375) past the panel; after, nothing overflows at 320, 375, 430. 1200 px desktop and 430 px render byte-identical to before.

## (a) Returning buyer marked "already registered" (NOT fixed here, backend change needed)
- Client: apps/storefronts/public/assets/sante/js/pack-checkout.js check() (about line 165) posts mobile+email to /funnel/membership-pack/checkout/check/, which relays to Django (src/app/funnel/membership-pack/checkout/check/route.ts, src/lib/pack-api.ts:137 checkoutCheck). It shows whatever errors Django returns (showTaken, sets data-taken) and the submit handler (about line 187, `var taken=...`) blocks on data-taken. The client is faithful; the answer carries no "returning" signal.
- Server: apps/pack/checkout.py check_contact (origin/main line 144). With both fields typed, match_existing() (line 112) accepts the same-member pair. The per-field loop then still marks each field: line 177 `if paired or benefits_active(member) or live_order(member) is not None:` flags any non-abandoned member's mobile/email whenever paired is true, ignoring that match_existing just judged the pair a returning buyer. The contact/ path (start_checkout / save_contact) calls only match_existing, so it accepts.
- Needed backend change: in check_contact, keep the result of match_existing (the returning member). In the loop, skip a field whose member is that returning member (still flag if that member has benefits or a live order, which match_existing already raises). Add a backend test: own mobile+email returns {}; own mobile with someone else's email still flags.
- Then no client change is needed; add a client test only if the response shape changes.

## Checks
apps/storefronts: pnpm test 690 pass / 0 fail; pnpm lint 0 errors (13 pre-existing warnings); npx tsc --noEmit clean; pnpm build OK. src/lib/assets.ts: pack-forms.css version 19dbb659 -> 5a3943b6 (the assets test pins it; the promo-consent branch may bump the same line).
