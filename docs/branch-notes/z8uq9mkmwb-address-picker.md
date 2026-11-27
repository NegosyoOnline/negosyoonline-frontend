# z8uq9mkmwb: Santé address forms, Shopee-style Region/Province/City/Barangay picker

Branch `feat/z8uq9mkmwb-address-picker` (from origin/main 52c1025). Ruling ADDRESS-SHOPEE-PICKER (Coach Ed, 2026-11-27). Frontend only: no backend, API or migration change. No TWCinc code was brought in; pack-address.js was already an adapted TWCinc script and is rewritten here.

## What changed (apps/storefronts)
- `public/assets/sante/js/pack-address.js`: one picker for all three forms. A pure model (`createModel`: items per tab, pick, reset-below, clear, restore, values) plus the page code that draws a field and a four-tab panel (Region | Province | City | Barangay) and drives the posted inputs. The pure parts are exposed as `window.PPAddress` for tests.
- `src/views/sante/address-picker.ts` (new): the server markup shared by the three forms: three plain text inputs `province`, `city`, `barangay` (the no-JS fallback; the script hides them and drives them), the ZIP input beside the field, the server's error lines, optional hidden `barangay_code`.
- `pack-onboarding.ts`, `member-address.ts` (now has the picker; it had three plain text inputs before), `shop-checkout.ts` use it. Order: picker + ZIP, then "Street name, Building, House no.", Country (where it was), Landmark.
- `address-flow.ts`, `shop-flow.ts`: load `css/pack-picker.css`; the member page also loads `js/pack-address.js`.
- `public/assets/sante/css/pack-picker.css` (new): field, panel, ZIP row. Light blue focus, no red/Shopee branding. Phone: panel is a bottom sheet. Dark: member dashboard's `html[data-theme="dark"]` only (the onboarding and checkout have no dark theme).
- `pack-shop.js`: the three province/city/barangay checks removed (the picker checks itself); the confirm popup stands aside when the picker or ZIP check has already stopped the submit.
- `assets.ts`: new `css/pack-picker.css` entry; `pack-address.js` and `pack-shop.js` ?v= bumped.

## Rules as built
- Region groups (Supervisor decision): Metro Manila 13; North Luzon 01 02 03 14; South Luzon 04 05 17; Visayas 06 07 08; Mindanao 09 10 11 12 15 16. Region only filters provinces, is never posted. One province (Metro Manila) auto-selects and goes to City.
- Posted names/values unchanged (province, city, barangay, barangay_code, postal_code/zip, line, landmark): the dataset's upper-case names; the field shows title case.
- ZIP: authoritative (barangay, city_unique) = filled, read-only; any other answer with a ZIP = prefilled, editable, with the city-ZIP hint; no answer = empty, editable, required 4 digits with the existing error text "Enter the 4-digit ZIP code for this address." Before a barangay is chosen the ZIP is empty and read-only. The ZIP row is always shown now (it used to hide when authoritative and post empty); the authoritative ZIP is now posted, the server derives it the same way and ignores a typed one.
- Re-render restore: the script reads the three inputs the server drew and resolves them against the data (a hand-written name still matches, e.g. "Naga" to NAGA CITY). Unresolvable parts stay empty. Data failure: the text inputs come back and still post.
- Submit: with the picker live, an incomplete path or a ZIP that is not 4 digits stops the submit with a message; the server still validates every field.

## Decisions to note
- Member address page ZIP: it was optional before (blank kept the saved ZIP). Now it follows the same three states; the server-side keep-saved-ZIP logic (`withZip`) is untouched.
- The member page reads the ZIP from the checkout's route `/checkout/zip/` (site-scoped, public lookup).
- Search inside each tab (except Region); keyboard: Enter/Space on the field, Arrow Up/Down, Enter, Esc, Left/Right on tabs; ARIA dialog/tablist/listbox/combobox.

## Checks
See the Supervisor report (lint, tests, build counts). Local visual check was done on a static harness of the real script, CSS and data (desktop, phone width, dark); the three real pages still need the Supervisor's local look.
