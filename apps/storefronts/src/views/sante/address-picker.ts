/* The one delivery-address picker every Santé address form draws (ClickUp z8uq9mkmwb, ruling ADDRESS-SHOPEE-PICKER): the
   Membership Pack onboarding address, the member Home address and the shop checkout. One field, "Region, Province, City,
   Barangay", that opens a panel with four tabs, and the ZIP code beside it.

   The server draws only what must exist without a script: the three posted inputs (province, city, barangay, plain text, so a
   no-JS browser still posts and the server still validates), the ZIP input, and the server's own error lines. public/assets/
   sante/js/pack-address.js builds the picker into [data-pp-pick-mount], hides the three text inputs and drives them, so the
   posted names and values are exactly what the three dropdowns posted. The region is only a filter and is never posted. */
import { asset } from "../../lib/assets.ts";
import { html, type Markup } from "../../lib/html.ts";

export type PickerStyle = "ob" | "sf";

export type PickerArgs = {
  /** "ob": the onboarding and member forms (.fld, .inp, .err); "sf": the checkout (.sf-field, .sf-field-error). */
  style: PickerStyle;
  ids: { province: string; city: string; barangay: string; zip: string };
  /** The name the ZIP posts under: postal_code (onboarding) or zip (member address, checkout). */
  zipName: "postal_code" | "zip";
  values: { province: string; city: string; barangay: string; zip: string };
  /** Server error lines by posted name (province, city, barangay and the ZIP's own name). */
  errors: Record<string, string | undefined>;
  /** autocomplete for the ZIP input (the checkout turns autofill off while the benefits are locked). */
  zipAutocomplete?: string;
  /** Draw the hidden barangay_code input the onboarding form posts. */
  barangayCode?: boolean;
};

/** The data-* attributes of the element that holds the picker (the same three files and ZIP route the cascade read). */
export function pickerData(zipUrl: string): Markup {
  return html`data-pp-address data-ph-provinces="${asset("data/provinces.json")}" data-ph-cities="${asset("data/city-mun.json")}" data-ph-barangays="${asset("data/barangays.json")}" data-zip-url="${zipUrl}"`;
}

const PARTS = [
  { name: "province", label: "Province", auto: "address-level1" },
  { name: "city", label: "City / Municipality", auto: "address-level2" },
  { name: "barangay", label: "Barangay", auto: "address-level3" },
] as const;

export function addressPicker(a: PickerArgs): Markup {
  const sf = a.style === "sf";
  const c = sf
    ? { fld: "sf-field", err: "sf-field-error", hint: "sf-field-hint", bad: " sf-field-invalid", lbl: "set-lbl", inp: "" }
    : { fld: "fld", err: "err", hint: "hint", bad: " bad", lbl: "", inp: "inp" };
  const zipErr = a.errors[a.zipName];
  const pickErrors = PARTS.filter((p) => a.errors[p.name]);
  return html`<div class="pp-pick-row">
  <div class="pp-pick-main" data-pp-pick>
    <div data-pp-pick-mount></div>
    <div class="pp-pick-fallback" data-pp-pick-fallback>
      ${PARTS.map((p) => html`<div class="${c.fld}"><label for="${a.ids[p.name]}" class="${c.lbl}">${p.label} *</label>
      <input type="text" id="${a.ids[p.name]}" class="${c.inp}${a.errors[p.name] ? c.bad : ""}" name="${p.name}" maxlength="100" autocomplete="${p.auto}" value="${a.values[p.name]}"${a.errors[p.name] ? html` aria-invalid="true" aria-describedby="${a.ids[p.name]}-msg"` : ""}></div>`)}
    </div>
    <div data-pp-pick-errors>${pickErrors.map((p) => html`<p class="${c.err}" id="${a.ids[p.name]}-msg">${a.errors[p.name]}</p>`)}</div>
  </div>
  <div class="${c.fld} pp-pick-zip" data-pp-zip-field>
    <label for="${a.ids.zip}" class="${c.lbl}">ZIP Code *</label>
    <input type="text" id="${a.ids.zip}" class="${c.inp}${zipErr ? c.bad : ""}" name="${a.zipName}" inputmode="numeric" maxlength="4" autocomplete="${a.zipAutocomplete ?? "postal-code"}" placeholder="4 digits, e.g. 1300" value="${a.values.zip}"${zipErr ? html` aria-invalid="true"` : ""}>
    <p class="${c.hint}" data-pp-zip-hint></p>
    ${zipErr ? html`<p class="${c.err}">${zipErr}</p>` : ""}
  </div>
</div>${a.barangayCode ? html`
<input type="hidden" name="barangay_code" value="">` : ""}`;
}
