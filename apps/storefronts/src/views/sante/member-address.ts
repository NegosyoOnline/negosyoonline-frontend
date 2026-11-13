/* The member Home address page, /dashboard/address/: TWCinc's negosyoonline_storefront/templates/negosyoonline_storefront/address.html
   (C14 home-address editor), in the member dashboard shell. Text, class names and order are the template's, with these differences:
   - no CSRF field: every POST is checked by its Origin / Sec-Fetch-Site (src/lib/cookies.ts);
   - while the address is locked (a recovery hold) the form is not drawn: the page says "Your home address cannot be changed right
     now." (TWCinc refuses the save under the same lock);
   - "Saved." is the notice TWCinc shows after a save (its ?saved=1 redirect). */
import { html, type Markup } from "../../lib/html.ts";
import type { Address } from "../../lib/shop-api.ts";
import { MSG_ADDRESS_LOCKED } from "../../lib/shop-flow-text.ts";

export const ADDRESS_PAGE_PATH = "/dashboard/address/";

export type AddressPage = {
  address: Record<string, string>;
  field_errors: Record<string, string>;
  error_message: string;
  saved: boolean;
  locked: boolean;
};

export const EMPTY_ADDRESS: Address = { line: "", barangay: "", city: "", province: "", zip: "", landmark: "" };

type FieldSpec = { name: keyof Address; id: string; label: string; required: boolean; max?: number; numeric?: boolean };
const FIELDS: readonly FieldSpec[] = [
  { name: "line", id: "addr-line", label: "House or building, street", required: true, max: 200 },
  { name: "landmark", id: "addr-landmark", label: "Landmark", required: true, max: 200 },
  { name: "barangay", id: "addr-barangay", label: "Barangay", required: false },
  { name: "city", id: "addr-city", label: "City or municipality", required: true },
  { name: "province", id: "addr-province", label: "Province", required: true },
  { name: "zip", id: "addr-zip", label: "ZIP code", required: false, numeric: true },
];

function field(f: FieldSpec, p: AddressPage): Markup {
  const msg = p.field_errors[f.name];
  return html`<div class="fld">
<label for="${f.id}">${f.label}</label>
<input id="${f.id}" class="inp${msg ? " bad" : ""}" name="${f.name}"${f.max ? html` maxlength="${String(f.max)}"` : ""} value="${p.address[f.name] ?? ""}"${f.numeric ? html` inputmode="numeric"` : ""}${f.required ? html` required` : ""}${msg ? html` aria-invalid="true" aria-describedby="${f.id}-msg"` : ""}>
${msg ? html`<p class="err" id="${f.id}-msg">${msg}</p>` : ""}
</div>`;
}

export function addressContent(p: AddressPage): Markup {
  return html`<div class="card">
<h1>Home address</h1>
<p>New home orders ship here. Orders you already placed keep the address they were placed with.</p>
${p.saved ? html`<div class="note info" role="status">Saved.</div>` : ""}
${p.error_message ? html`<div class="note bad" role="alert">${p.error_message}</div>` : ""}
${p.locked ? html`<div class="note warn" role="status"><b>${MSG_ADDRESS_LOCKED}</b></div>` : html`<form method="post" action="${ADDRESS_PAGE_PATH}">
${FIELDS.map((f) => field(f, p))}
<button class="btn" type="submit">Save address</button>
</form>`}
<p style="margin:14px 0 0"><a class="lnk" href="/dashboard/account/">Back to account</a></p>
</div>`;
}
