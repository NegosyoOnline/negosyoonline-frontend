/* The checkout page: TWCinc's store_checkout.html, _store_address_form.html, _store_transfer_proof.html, _store_summary_lines.html
   and _store_summary_totals.html. Step trail Cart / Shipping Address / Payment / Order Complete; a member with active benefits sees only
   their own saved address, read-only, at the member price (no ship-to choice: member-price orders ship to the member's own address). Payment is a bank or e-wallet transfer to the store's own account with a proof file, posted
   in the same request as the order ("Complete Order"). Not carried over from TWCinc: Cash on Delivery with its code popup, the card
   method, the referral-code box (Coach Ed's Q3) and the disabled coupon box. The two checkout scripts TWCinc wrote inline are
   moved to js/pack-shop.js (the policy allows none). Every figure is Django's.

   The page keeps no checkout state of its own: the address step posts to the payment step, which carries the typed address in
   hidden fields to the one post that places the order, so nothing a buyer typed is stored anywhere before then. */
import { asset } from "../../lib/assets.ts";
import { html, type Markup } from "../../lib/html.ts";
import type { Address, Quote, ShopAccount } from "../../lib/shop-api.ts";
import { MSG_NO_HOME_ADDRESS, MSG_PAYMENT_UNAVAILABLE } from "../../lib/shop-flow-text.ts";
import { shippingCell, shippingLabel } from "./shop-cart.ts";
import { money, php } from "./shop-shell.ts";

export const CHECKOUT_PATH = "/checkout/";
export const ZIP_PATH = "/checkout/zip/";
export const QR_PATH = "/checkout/qr/";
/** The checkout's edit mode for the member's saved address (TWCinc /checkout/?edit=home). */
export const EDIT_ADDRESS_PATH = "/checkout/?edit=home";

export type Step = "address" | "payment";
export type Mode = "guest" | "home";

/** The fields of the address step, in the order the buyer sees them. */
export const ADDRESS_FIELDS = ["first_name", "last_name", "mobile", "email", "line", "province", "city", "barangay", "zip", "landmark"] as const;
export const PAY_FIELDS = ["account_id", "reference_number", "amount_sent"] as const;

export type CheckoutModel = {
  step: Step;
  /** The address form in edit mode: the member changes their saved home address (the page shows only that form). */
  edit: boolean;
  /** A member with active benefits: their own saved address shows, read-only. Anyone else is shipped to the typed address at SRP. */
  benefits: boolean;
  member: { name: string; mobile: string } | null;
  mode: Mode;
  quote: Quote | null;
  /** The member's own-address quote (the member's saved address comes from it). */
  quotes: { home: Quote | null };
  posted: Record<string, string>;
  field_errors: Record<string, string>;
  error_message: string;
  accounts: ShopAccount[] | null;
  submit_key: string;
};

const KEYS = (name: string, value: string): Markup => html`<input type="hidden" name="${name}" value="${value}">`;

/** "9171234567" or "917 123 4567" -> "+63 917 123 4567"; anything else as typed. */
export function prettyMobile(local: string): string {
  const d = local.replace(/\D/g, "");
  return d.length === 10 ? `+63 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : local;
}

function steps(active: 2 | 3 | 4): Markup {
  const item = (n: number, label: string) => html`<div class="sf-step${n < active ? " is-done" : n === active ? " is-active" : ""}"><span class="sf-step-circle"><span class="sf-step-check">&#10003;</span><span class="sf-step-num">${n}</span></span><span class="sf-step-label">${label}</span></div>`;
  const line = (done: boolean) => html`<div class="sf-step-line${done ? " is-done" : ""}"></div>`;
  return html`<div class="sf-steps">
      <div class="sf-step is-done"><span class="sf-step-circle"><span class="sf-step-check">&#10003;</span><span class="sf-step-num">1</span></span><span class="sf-step-label">Cart</span></div>
      ${line(true)}
      ${item(2, "Shipping Address")}
      ${line(active > 2)}
      ${item(3, "Payment")}
      ${line(active > 3)}
      ${item(4, "Order Complete")}
    </div>`;
}

export { steps as checkoutSteps };

function fieldError(m: CheckoutModel, name: string): Markup {
  return m.field_errors[name] ? html`<p class="sf-field-error">${m.field_errors[name]}</p>` : html``;
}
const invalid = (m: CheckoutModel, name: string): string => (m.field_errors[name] ? " sf-field-invalid" : "");

/* ---- the address form (TWCinc _store_address_form.html) ------------------------------------------------------- */

function receiverRows(m: CheckoutModel, edit: boolean, autofill: (value: string) => string): Markup {
  const p = m.posted;
  if (edit) {
    // Edit mode changes the address only: the member's own name and mobile are shown as text (no new stored field, plan z8uq9mek5v).
    const who = m.member ?? { name: "", mobile: "" };
    return html`
            <dl class="sf-own-addr-dl">
              <dt>Name</dt><dd>${who.name}</dd>
              ${who.mobile ? html`<dt>Mobile</dt><dd>${who.mobile}</dd>` : ""}
            </dl>`;
  }
  return html`
            <div class="sf-field-row">
              <div class="sf-field">
                <label for="cf_first_name">First Name *</label>
                <input type="text" id="cf_first_name" name="first_name" maxlength="60" value="${p.first_name ?? ""}" autocomplete="${autofill("given-name")}"${m.field_errors.receiver_name ? html` class="sf-field-invalid"` : ""}>
                ${m.field_errors.receiver_name ? html`<p class="sf-field-error">${m.field_errors.receiver_name}</p>` : ""}
              </div>
              <div class="sf-field">
                <label for="cf_last_name">Last Name *</label>
                <input type="text" id="cf_last_name" name="last_name" maxlength="60" value="${p.last_name ?? ""}" autocomplete="${autofill("family-name")}">
              </div>
            </div>
            <div class="sf-field-row sf-row-contact">
              <div class="sf-field">
                <label for="cf_mobile">Phone Number *</label>
                <div class="sf-phone-combo${invalid(m, "receiver_mobile")}">
                  <span class="sf-phone-prefix">+63</span>
                  <input type="tel" id="cf_mobile" name="mobile" maxlength="12" inputmode="tel" placeholder="9XX XXX XXXX" autocomplete="${autofill("tel-national")}" value="${p.mobile ?? ""}">
                </div>
                ${fieldError(m, "receiver_mobile")}
              </div>
              <div class="sf-field">
                <label for="cf_email">Email (Optional)</label>
                <div class="sf-phone-combo${invalid(m, "contact_email")}">
                  <span class="sf-phone-prefix sf-email-prefix" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg></span>
                  <input type="email" id="cf_email" name="email" value="${p.email ?? ""}" autocomplete="${autofill("email")}">
                </div>
                ${fieldError(m, "contact_email")}
              </div>
            </div>`;
}

function addressForm(m: CheckoutModel, mode: "guest" | "edit"): Markup {
  const p = m.posted;
  const edit = mode === "edit";
  const autofill = (value: string) => (m.benefits ? "off" : value);
  return html`
        <form method="post" action="${CHECKOUT_PATH}" id="delivery" novalidate>
          <input type="hidden" name="action" value="${edit ? "save_home" : "address"}">${edit ? "" : KEYS("ship_mode", mode)}
          <div class="sf-modal" id="sfConfirmAddressModal" hidden>
            <div class="sf-modal-card sf-confirm-modal-card">
              <button type="button" class="sf-modal-close" id="sfConfirmAddressClose">&#x2715;</button>
              <div class="sf-confirm-icon" aria-hidden="true">&#9888;</div>
              <h3>Confirm Shipping Details</h3>
              <p>Please review your shipping address before proceeding to payment.</p>
              <div class="sf-confirm-actions">
                <button type="button" class="sf-confirm-review" id="sfConfirmReview">Review again</button>
                <button type="button" class="btn-cart sf-confirm-proceed" id="sfConfirmProceed">Yes, proceed</button>
              </div>
            </div>
          </div>
          <fieldset class="sf-block">
            <legend>Shipping Address</legend>
            ${edit ? html`<p class="sf-locked-note">Who receives your parcel and where it goes. Your account details stay as they are.</p>` : ""}
            ${receiverRows(m, edit, autofill)}
            <div class="sf-field">
              <label for="cf_line">Address *</label>
              <input type="text" id="cf_line" name="line" maxlength="120" value="${p.line ?? ""}" required autocomplete="${autofill("street-address")}"${m.field_errors.line ? html` class="sf-field-invalid"` : ""}>
              ${fieldError(m, "line")}
            </div>
            <div data-pp-address data-ph-provinces="${asset("data/provinces.json")}" data-ph-cities="${asset("data/city-mun.json")}" data-ph-barangays="${asset("data/barangays.json")}" data-zip-url="${ZIP_PATH}">
              <div class="sf-field-row">
                <div class="sf-field">
                  <label for="cf_province" class="set-lbl">Province *</label>
                  <select id="cf_province" name="province" data-pk-select data-placeholder="Select province" data-value="${p.province ?? ""}" disabled><option value=""></option></select>
                  ${fieldError(m, "province")}
                </div>
                <div class="sf-field">
                  <label for="cf_city" class="set-lbl">City / Municipality *</label>
                  <select id="cf_city" name="city" data-pk-select data-placeholder="Select city / municipality" data-value="${p.city ?? ""}" disabled><option value=""></option></select>
                  ${fieldError(m, "city")}
                </div>
              </div>
              <div class="sf-field-row">
                <div class="sf-field">
                  <label for="cf_barangay" class="set-lbl">Barangay *</label>
                  <select id="cf_barangay" name="barangay" data-pk-select data-placeholder="Select barangay" data-value="${p.barangay ?? ""}" disabled><option value=""></option></select>
                  ${fieldError(m, "barangay")}
                </div>
                <div class="sf-field sf-field-country">
                  <label for="cf_country" class="set-lbl">Country</label>
                  <select id="cf_country" data-pk-select disabled><option value="Philippines" selected>Philippines</option></select>
                </div>
              </div>
              <div class="sf-field-row">
                <div class="sf-field" data-pp-zip-field${m.field_errors.zip || p.zip ? html`` : html` hidden`}>
                  <label for="cf_zip" class="set-lbl">ZIP Code *</label>
                  <input type="text" id="cf_zip" name="zip" value="${p.zip ?? ""}" inputmode="numeric" maxlength="4" placeholder="4 digits, e.g. 1300" autocomplete="${autofill("postal-code")}">
                  <p class="sf-field-hint" data-pp-zip-hint></p>
                  ${fieldError(m, "zip")}
                </div>
              </div>
            </div>
            <div class="sf-field">
              <label for="cf_landmark">Landmark *</label>
              <input type="text" id="cf_landmark" name="landmark" value="${p.landmark ?? ""}" maxlength="120" required placeholder="e.g. Near the barangay hall"${m.field_errors.landmark ? html` class="sf-field-invalid"` : ""}>
              ${fieldError(m, "landmark")}
            </div>
            ${fieldError(m, "delivery_address")}
          </fieldset>
          <div class="sf-step-actions">
            ${edit ? html`<a href="${CHECKOUT_PATH}" class="sf-step-back-link">Cancel</a>` : m.benefits ? html`<button type="button" class="sf-step-back-link" id="sfBackToChoice">Back</button>` : html`<a href="/cart/" class="sf-step-back-link">Back</a>`}
            <button type="submit" class="btn-cart sf-step-next">${edit ? "Save Address" : "Confirm Address"}</button>
          </div>
        </form>`;
}

/* ---- the order summary (TWCinc _store_summary_lines.html, _store_summary_totals.html) ------------------------------ */

/** The member's saving on a quote: what the lines would cost at SRP less what they cost here (0 for anyone paying SRP). */
export function savingsOf(q: Quote): number {
  const srp = q.lines.reduce((sum, l) => sum + (l.available ? l.unit_srp_centavos * l.quantity : 0), 0);
  return Math.max(0, srp - q.subtotal_centavos);
}

function summaryLines(q: Quote): Markup {
  const saving = savingsOf(q) > 0;
  return html`${q.lines.map((l) => html`
        <div class="sf-summary-line"><span>${l.quantity} × ${l.name || "Product"}</span><strong>${l.available ? php(saving ? l.unit_srp_centavos * l.quantity : l.line_total_centavos) : html`Unavailable`}</strong></div>`)}`;
}

function summaryTotals(q: Quote, plainShipping = false): Markup {
  if (!q.ok) return q.errors.length > 0 ? html`<p class="sf-quote-error" role="alert">${q.errors[0]}</p>` : html``;
  const saving = savingsOf(q);
  return html`
        <div class="sf-totals-row"><span>Subtotal</span><strong>${php(saving > 0 ? q.subtotal_centavos + saving : q.subtotal_centavos)}</strong></div>
        <div class="sf-totals-row"><span>${plainShipping ? "Shipping" : shippingLabel(q)}</span><strong>${shippingCell(q)}</strong></div>
        ${saving > 0 ? html`<div class="sf-totals-row sf-totals-save"><span>Member savings</span><strong>&minus;${php(saving)}</strong></div>` : ""}
        <div class="sf-totals-row sf-totals-grand"><span>Total</span><strong>${php(q.total_centavos)}</strong></div>
        ${q.shipping.policy === "zero" ? html`<p class="sf-freeship-note">&#128666; ${q.shipping.note || "This store pays your shipping."}</p>` : ""}`;
}

function summaryAside(m: CheckoutModel): Markup {
  return html`
      <aside class="sf-checkout-summary">
        <h3>Order Summary</h3>
        <div>${m.quote ? summaryLines(m.quote) : ""}</div>
        <div class="sf-totals">${m.quote ? summaryTotals(m.quote, m.benefits && !homeAddressOf(m)) : ""}</div>
      </aside>`;
}

/* ---- the own-address step for a member with benefits ------------------------------------------------------------- */

/** The member's saved address from whichever quote carries it (the home quote first), or null from an older backend / none saved. */
function homeAddressOf(m: CheckoutModel): Address | null {
  return m.quotes.home?.home_address ?? m.quote?.home_address ?? null;
}

/** "line, barangay, city, province ZIP" with an empty part left out. */
export function addressText(a: Address): string {
  const head = [a.line, a.barangay, a.city, a.province].map((s) => s.trim()).filter(Boolean).join(", ");
  return a.zip ? `${head} ${a.zip}` : head;
}

/** True while the member's home address cannot be changed (a recovery hold). An older backend sends no flag: not locked. */
function homeLockedOf(m: CheckoutModel): boolean {
  return [m.quotes.home, m.quote].some((q) => q?.home_address_locked === true);
}

const LOCK_ICON = html`<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 1 1 6 0v3H9z" fill="currentColor"/></svg>`;

function memberAddressStep(m: CheckoutModel): Markup {
  const who = m.member ?? { name: "", mobile: "" };
  const saved = homeAddressOf(m);
  const locked = homeLockedOf(m);
  return html`
        <form method="post" action="${CHECKOUT_PATH}" id="sfOwnPanel">
          <input type="hidden" name="action" value="choose"><input type="hidden" name="choice" value="home">
          <div class="sf-block sf-own-addr">
            <h2 class="sf-block-title">Shipping Address</h2>
            <p class="sf-locked-note">Member-price orders ship to your own saved address.</p>
            <div class="sf-own-addr-card">
              <span class="sf-own-addr-pin" aria-hidden="true">&#128205;</span>
              <div>
                <div class="sf-own-addr-name">${who.name}</div>
                <dl class="sf-own-addr-dl">
                  ${who.mobile ? html`<dt>Mobile</dt><dd>${who.mobile}</dd>` : ""}
                  ${saved ? html`<dt>Address</dt><dd>${addressText(saved)}</dd>
                  ${saved.landmark ? html`<dt>Landmark</dt><dd>${saved.landmark}</dd>` : ""}` : html``}
                </dl>
              </div>
              ${saved && !locked ? html`<a href="${EDIT_ADDRESS_PATH}" class="sf-own-addr-edit" aria-label="Edit my shipping address">Edit</a>` : ""}
            </div>
            ${saved ? html`<p class="sf-own-addr-manage">To change it for good, <a href="/dashboard/">open your member dashboard</a>.</p>` : html`<p class="sf-form-error" id="sfNoHomeAddress" role="alert">${MSG_NO_HOME_ADDRESS} <a href="/dashboard/address/">Add your home address</a></p>`}
            ${locked ? html`<div class="sf-own-addr-note" id="sfHomeLockedNote" role="note">${LOCK_ICON}<span>Your home address cannot be changed right now.</span></div>` : ""}
          </div>
          <div class="sf-step-actions">
            <a href="/cart/" class="sf-step-back-link">Back</a>
            <button type="submit" class="btn-cart sf-step-next"${saved ? "" : html` disabled`}>Confirm Address</button>
          </div>
        </form>`;
}

/* ---- the payment step (TWCinc _store_transfer_proof.html) ------------------------------------------------------- */

function typeLabel(a: ShopAccount): string {
  return a.account_type === "savings" ? "Savings" : a.account_type === "checking" ? "Checking" : "";
}

function paymentPanel(m: CheckoutModel, total: number): Markup {
  const accounts = m.accounts ?? [];
  const p = m.posted;
  const many = accounts.length > 1;
  const error = (name: string) => (m.field_errors[name] ? html`<p class="sf-field-error">${m.field_errors[name]}</p>` : html``);
  return html`
            <div class="sf-direct-panel" id="sfDirectPanel">
              <div class="sf-send-callout">
                <span class="sf-send-label">Send exactly</span>
                <strong class="sf-send-amount">${php(total)}</strong>
                <span class="sf-send-to">to ${many ? "one of these accounts" : "this account"}. Your order is placed with your proof, and the store reviews it before shipping.</span>
              </div>
              <div class="sf-direct-sheet">
              ${accounts.map((a) => html`
              <div class="sf-acct">
                ${a.has_qr ? html`<button type="button" class="sf-acct-qrbtn" data-qr-zoom aria-label="Enlarge the QR code for ${a.provider_name}"><img class="sf-acct-qr" src="${QR_PATH}${a.id}/" alt="QR code for ${a.provider_name}" width="172" height="172"></button>` : ""}
                <div class="sf-acct-body">
                  <dl class="sf-acct-dl">
                  <div class="sf-acct-row"><dt>${a.kind === "ewallet" ? "E-wallet" : "Bank"}</dt><dd>${a.provider_name}${a.kind === "bank" && typeLabel(a) ? ` (${typeLabel(a)})` : ""}</dd></div>
                  <div class="sf-acct-row"><dt>Account name</dt><dd>${a.account_name}</dd></div>
                  <div class="sf-acct-row"><dt>Account number</dt><dd class="sf-acct-numrow"><span class="sf-acct-num" data-num>${a.account_number}</span><button type="button" class="sf-copy" data-copy hidden aria-label="Copy account number">Copy</button></dd></div>
                  </dl>
                  ${a.has_qr ? html`<p class="sf-acct-qrhint">Tap the QR code to enlarge it.</p>` : ""}
                </div>
              </div>`)}
              <p class="sf-direct-head">Your payment details</p>
              ${many ? html`
              <div class="sf-field">
                <label for="sfProofAccount">Account you paid to *</label>
                <select id="sfProofAccount" name="account_id"${m.field_errors.account_id ? html` class="sf-field-invalid"` : ""}>
                  <option value="">Choose an account</option>
                  ${accounts.map((a) => html`<option value="${a.id}"${p.account_id === a.id ? html` selected` : ""}>${a.provider_name}${a.kind === "bank" && typeLabel(a) ? ` (${typeLabel(a)})` : ""} &middot; ${a.account_name}</option>`)}
                </select>
                ${error("account_id")}
              </div>` : html`${accounts.map((a) => html`<input type="hidden" name="account_id" value="${a.id}">`)}${error("account_id")}`}
              <div class="sf-field">
                <label for="sfProofRef">Reference number *</label>
                <input type="text" id="sfProofRef" name="reference_number" maxlength="64" autocomplete="off" value="${p.reference_number ?? ""}"${m.field_errors.reference_number ? html` class="sf-field-invalid"` : ""}>
                ${error("reference_number")}
              </div>
              <div class="sf-field">
                <label for="sfProofAmount">Amount sent *</label>
                <div class="sf-phone-combo${invalid(m, "amount_sent")}">
                  <span class="sf-phone-prefix" aria-hidden="true">&#8369;</span>
                  <input type="text" id="sfProofAmount" name="amount_sent" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${p.amount_sent ?? ""}">
                </div>
                ${error("amount_sent")}
              </div>
              <div class="sf-field">
                <label for="sfProofFile">Proof of payment *</label>
                <input type="file" id="sfProofFile" name="proof" accept="image/jpeg,image/png,image/webp,application/pdf"${m.field_errors.proof ? html` class="sf-field-invalid"` : ""}>
                ${m.field_errors.proof ? html`<p class="sf-field-error">${m.field_errors.proof}</p>` : Object.keys(m.field_errors).length > 0 ? html`<p class="sf-direct-hint">Please choose your receipt again.</p>` : html`<p class="sf-direct-hint">A screenshot or receipt. JPEG, PNG, WebP or PDF.</p>`}
              </div>
              <p class="sf-direct-hint">Placing your order sends your payment proof for the store's review. Your order ships after the store verifies it.</p>
              </div>
            </div>`;
}

function paymentStep(m: CheckoutModel): Markup {
  const p = m.posted;
  const q = m.quote;
  const accounts = m.accounts ?? [];
  const ready = q !== null && q.ok && accounts.length > 0;
  const savedHome = m.mode === "home" ? homeAddressOf(m) : null;
  const carried = html`${ADDRESS_FIELDS.map((k) => (p[k] !== undefined && m.mode !== "home" ? KEYS(k, p[k]) : html``))}${KEYS("ship_mode", m.mode)}`;
  const who = m.mode === "home" ? { name: m.member?.name ?? "", mobile: m.member?.mobile ?? "" } : { name: [p.first_name, p.last_name].map((s) => (s ?? "").trim()).filter(Boolean).join(" "), mobile: prettyMobile(p.mobile ?? "") };
  return html`
        ${accounts.length === 0 || m.accounts === null ? html`<p class="sf-form-error">${MSG_PAYMENT_UNAVAILABLE}</p>` : html`
        <form method="post" action="${CHECKOUT_PATH}" enctype="multipart/form-data" id="sfPlaceForm">
          <input type="hidden" name="action" value="place">${KEYS("submit_key", m.submit_key)}${KEYS("fingerprint", q?.fingerprint ?? "")}${carried}
          <fieldset class="sf-block">
            <legend>Payment Option</legend>
            <label class="sf-pay-card">
              <input type="radio" name="method" value="direct" checked>
              <span class="sf-pay-icon" aria-hidden="true">&#127974;</span>
              <span class="sf-pay-body"><span class="sf-pay-title">Bank or E-wallet Transfer</span><span class="sf-pay-desc">Send the exact total to the store's account, then upload your proof of payment. The store reviews it before shipping.</span></span>
            </label>
            ${paymentPanel(m, q?.total_centavos ?? 0)}
          </fieldset>
          <button type="submit" class="btn-cart sf-place-order"${ready ? "" : html` disabled`}><span>Complete Order</span></button>
        </form>`}
        <form method="post" action="${CHECKOUT_PATH}" class="sf-edit-address">
          <input type="hidden" name="action" value="edit">${carried}
          <button type="submit" class="sf-cancel-order-link">${m.mode === "guest" ? "Cancel Order" : "Change address"}</button>
        </form>
        <div class="sf-block sf-address-summary">
          <div class="sf-address-summary-title">Shipping Address</div>
          <div class="sf-address-summary-row"><span class="sf-address-summary-icon" aria-hidden="true">&#128100;</span><strong>${who.name}</strong></div>
          ${who.mobile ? html`<div class="sf-address-summary-row"><span class="sf-address-summary-icon" aria-hidden="true">&#128241;</span><span>${who.mobile}</span></div>` : ""}
          ${m.mode === "home"
            ? (savedHome
              ? html`<div class="sf-address-summary-row"><span class="sf-address-summary-icon" aria-hidden="true">&#128205;</span><span>${addressText(savedHome)}${savedHome.landmark ? ` — Landmark: ${savedHome.landmark}` : ""}</span></div>`
              : html`<div class="sf-address-summary-row"><span class="sf-address-summary-icon" aria-hidden="true">&#128205;</span><span>The delivery address saved in your member profile</span></div>`)
            : html`<div class="sf-address-summary-row"><span class="sf-address-summary-icon" aria-hidden="true">&#128205;</span><span>${p.line}, ${p.barangay}, ${p.city}, ${p.province}${p.zip ? ` ${p.zip}` : ""}${p.landmark ? ` — Landmark: ${p.landmark}` : ""}</span></div>`}
        </div>`;
}

export function checkoutContent(m: CheckoutModel): Markup {
  return html`
<section class="section sf-checkout-page">
  <div class="section-inner">
    ${steps(m.step === "payment" ? 3 : 2)}
    ${m.error_message ? html`<p class="sf-form-error" role="alert">${m.error_message}</p>` : ""}

    <div class="sf-checkout-grid">
      <div class="sf-checkout-main">
        ${m.step === "payment" ? paymentStep(m) : m.edit ? addressForm(m, "edit") : m.benefits ? memberAddressStep(m) : addressForm(m, "guest")}
      </div>
      ${summaryAside(m)}
    </div>
  </div>
</section>`;
}

/** The amount the page asks the buyer to send, for the tests. */
export { money };
