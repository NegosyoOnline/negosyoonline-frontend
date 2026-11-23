/* The Membership Pack checkout, /funnel/membership-pack/checkout/.

   Transcribed from TWCinc's negosyoonline_sante_pack/checkout.html with _checkout_steps.html, _transfer_proof.html and
   _agreement_dialog.html (includes expanded). Markup, class names, text and order are the templates'. Different from
   them, on purpose:
   - Xendit (ClickUp z8uq9mgkp1, Coach Ed 2026-11-18): "Credit / Debit Card / GCash / Maya" is a second card when the site offers it, and the
     transfer card and proof fields are left out when the site does not offer transfer (the API's pack.methods);
   - no CSRF token or hidden "action" field: a post is checked for its origin (src/lib/cookies.ts sameOriginPost), and
     the step is the button (name="action");
   - the receipt hint says "up to 4 MB" (TWCinc said 10 MB): a Vercel Function body is capped at 4.5 MB;
   - the inline scripts and the values they carried are js/pack-checkout.js and data- attributes on the forms;
   - the QR codes and the agreement PDF are this server's own addresses, never a private-media URL. */
import { html, safe, type Markup } from "../../lib/html.ts";
import { asset } from "../../lib/assets.ts";
import { icon } from "./icons.ts";
import { CHECKOUT_PATH, LANDING_PATH, packDocument, type PackCtx } from "./pack-page.ts";

export const CHECK_PATH = CHECKOUT_PATH + "check/";
export const QR_PATH = CHECKOUT_PATH + "qr/";
export { AGREEMENT_PDF_PATH } from "./pack-terms.ts";
export const TERMS_SLUG = "terms-and-conditions";
export const PRIVACY_PATH = "/privacy-policy/";

/* TWCinc constants.py and site_views.py: the words of this page. */
export const ENROLLMENT_AUTHORIZATION =
  "I understand that this package includes an application for Santé International membership, and I authorize the submission of my registration information to Santé International for enrollment, subject to the applicable privacy notice.";
export const MSG_ENROLLMENT_REQUIRED = "Please tick this box to continue.";
export const MSG_CHECKOUT_EXPIRED = "This checkout has expired. Please start again.";
export const MSG_PAYMENT_UNAVAILABLE = "Payment is not available right now.";
export const PAY_ONLINE_LABEL = "Credit / Debit Card / GCash / Maya";
export const PAY_ONLINE_HINT = "You'll be redirected to our secure payment provider powered by Xendit.";
export const PAY_ONLINE_STEP_HINT = "You will finish paying on Xendit's secure page. Your order is placed when you continue.";
export const VERIFY_FIRST = "Verify your mobile number first.";
export const AGREE_ERROR = "Please agree to the Website Terms & Conditions to continue.";
export const EMAIL_ERROR = "Enter a valid email address.";

export type CheckoutAccount = {
  id: string;
  kind: string;
  account_type: string;
  provider_name: string;
  account_name: string;
  account_number: string;
  has_qr: boolean;
};

export type CheckoutStep = "contact" | "code" | "payment";

export type CheckoutModel = {
  step: CheckoutStep;
  submit_key: string;
  error_code: string;
  error_message: string;
  field_errors: Record<string, string>;
  posted: Record<string, string>;
  first_name: string;
  last_name: string;
  email: string;
  mobile: string;
  enrollment_held: boolean;
  accounts: CheckoutAccount[];
  /** The methods this site offers buyers now (the API's pack.methods). */
  methods: { direct: boolean; xendit: boolean };
  /** The promotional-text opt-in (PROMO-CONSENT): the backend's wording, or null while the switch is off. */
  promo: { version: string; text: string } | null;
};

export function checkoutModel(over: Partial<CheckoutModel> & { accounts: CheckoutAccount[] }): CheckoutModel {
  return {
    step: "contact", submit_key: "", error_code: "", error_message: "", field_errors: {}, posted: {},
    first_name: "", last_name: "", email: "", mobile: "",
    enrollment_held: false, methods: { direct: true, xendit: false }, promo: null,
    ...over,
  };
}

/** "Savings" or "Checking" for a bank account, as TWCinc's type_label. */
function typeLabel(a: CheckoutAccount): string {
  return a.account_type === "savings" ? "Savings" : a.account_type === "checking" ? "Checking" : "";
}

/** django's date:"F j, Y". */
export function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** The box shows 9XX XXX XXXX after a fixed +63: `cut:' '|slice:'-10:'`. */
function tenDigits(raw: string): string {
  return raw.replace(/ /g, "").slice(-10);
}

/** The opt-in tick (PROMO-CONSENT): unticked unless the buyer ticked it on the page just refused; the label is the
    backend's wording exactly as given. Nothing at all while the switch is off. */
/** The tick-box rules, shared so the payment step draws the box exactly as the contact step does. */
const AGREE_CSS = safe(".pp-co-agree{display:flex;align-items:flex-start;gap:14px;padding-left:18px;font-size:.9375rem;line-height:1.5;cursor:pointer}\n.pp-co-agree input{flex:none;width:18px;height:18px;margin-top:3px}");

function promoBox(m: CheckoutModel): Markup {
  if (!m.promo) return html``;
  return html`
          <label class="pp-co-agree mt-4" for="promo_sms_ok">
            <input type="checkbox" id="promo_sms_ok" name="promo_sms_ok" value="1"${checked(m.posted.promo_sms_ok === "1")}>
            <span>${m.promo.text}</span>
          </label>`;
}

const checked = (on: boolean): Markup => (on ? html` checked` : html``);
const invalid = (on: boolean): Markup => (on ? html` is-invalid` : html``);

const SUBMIT_CLASS =
  "pp-co-submit mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-accent-500 px-3 py-3.5 text-[0.9375rem] leading-6 font-bold whitespace-nowrap text-primary-950 shadow-[var(--shadow-cta)] transition-[background-color,box-shadow,transform] duration-200 ease-out hover:bg-accent-400 active:translate-y-px tab:px-6 tab:text-lg";

/** The method the page opens on: the buyer's own pick if the site still offers it, else transfer, else online. */
export function chosenMethod(m: CheckoutModel): "direct" | "xendit" {
  const posted = m.posted.pay_method;
  if (posted === "xendit" && m.methods.xendit) return "xendit";
  if (posted === "direct" && m.methods.direct) return "direct";
  return m.methods.direct ? "direct" : "xendit";
}

/** The payment cards (one radio each, name pay_method) and, under the transfer card, the transfer sheet. */
function payCards(c: PackCtx, m: CheckoutModel, extra: Markup): Markup {
  const chosen = chosenMethod(m);
  return html`
          <div class="pp-co-pay-list space-y-3">
          ${m.methods.xendit ? html`
          <label class="pp-co-pay-card pp-co-pay-opt flex items-start gap-3 rounded-xl p-4">
            <input class="sr" type="radio" name="pay_method" value="xendit"${checked(chosen === "xendit")}>
            <span class="pp-co-pay-dot mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full">${icon("check", "h-3 w-3")}</span>
            <span class="pp-co-pay-body">
              <span class="pp-co-pay-head"><strong class="block text-base text-ink-900">${PAY_ONLINE_LABEL}</strong><span class="pp-co-secure">${icon("lock", "h-3.5 w-3.5 shrink-0")}Secure Payment</span></span>
              <span class="mt-0.5 block text-sm text-ink-600">${PAY_ONLINE_HINT}</span>
            </span>
          </label>
          ` : ""}
          ${m.methods.direct ? html`
          <label class="pp-co-pay-card pp-co-pay-opt flex items-start gap-3 rounded-xl p-4">
            <input class="sr" type="radio" name="pay_method" value="direct"${checked(chosen === "direct")}>
            <span class="pp-co-pay-dot mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full">${icon("check", "h-3 w-3")}</span>
            <span class="pp-co-pay-body">
              <span class="pp-co-pay-head"><strong class="block text-base text-ink-900">Bank or e-wallet transfer</strong></span>
              <span class="mt-0.5 block text-sm text-ink-600">Send ${c.total} to one of the store's accounts, then upload your proof.</span>
            </span>
          </label>
          ${transferProof(c, m, chosen !== "direct")}
          ` : ""}
          ${extra}
          </div>`;
}

function steps(step: CheckoutStep): Markup {
  const done = (label: string): Markup => html`<li class="is-done"><span class="pp-co-track-dot">${icon("check", "h-4 w-4")}</span>${label}</li>`;
  return html`
<nav class="pp-co-track" aria-label="Checkout progress">
  <ol>
    ${done("Your Package")}
    ${step === "payment" ? html`
    ${done("Your Details")}
    <li class="is-current" aria-current="step"><span class="pp-co-track-dot">3</span>Payment</li>
    <li><span class="pp-co-track-dot">4</span>Onboarding</li>
    <li><span class="pp-co-track-dot">5</span>Completed</li>
    ` : html`
    <li class="is-current" aria-current="step"><span class="pp-co-track-dot">2</span>Your Details</li>
    <li><span class="pp-co-track-dot">3</span>Payment</li>
    <li><span class="pp-co-track-dot">4</span>Onboarding</li>
    <li><span class="pp-co-track-dot">5</span>Completed</li>
    `}
  </ol>
  ${step === "payment" ? html`<p>Last step: choose how you want to pay.</p>` : ""}
</nav>
`;
}

function fieldBlock(m: CheckoutModel, name: string, label: string, attrs: Markup, placeholder: string, max = 0): Markup {
  const err = m.field_errors[name];
  return html`
    <div class="pp-co-field">
      <label class="pp-co-label" for="${name}">${label} *</label>
      <input id="${name}" class="pp-co-input${invalid(!!err)}" type="text" name="${name}" required ${attrs} placeholder="${placeholder}"${max ? html` maxlength="${max}"` : ""} value="${m.posted[name] ?? ""}"${err ? html` aria-invalid="true" aria-describedby="${name}-msg"` : ""}>
      ${err ? html`<p class="pp-co-error" id="${name}-msg">${err}</p>` : ""}
    </div>`;
}

export function transferProof(c: PackCtx, m: CheckoutModel, hidePanel: boolean): Markup {
  const fe = m.field_errors;
  const many = m.accounts.length > 1;
  const anyErrors = Object.keys(fe).length > 0;
  return html`
<div id="direct-panel" class="pp-co-direct pp-co-slide${hidePanel ? html`` : html` is-open`}"${hidePanel ? html` aria-hidden="true"` : ""}><div class="pp-co-slide-in"><div class="acct-sheet">
  ${m.accounts.map((a) => html`
  <div class="acct">
    ${a.has_qr ? html`<button type="button" class="acct-qr" data-qr-zoom aria-label="Enlarge the QR code for ${a.provider_name}"><img src="${QR_PATH}${a.id}/" alt="QR code for ${a.provider_name}"></button>` : ""}
    <div class="acct-body">
      <p class="acct-title">Send exactly ${c.total} to this account</p>
      <dl><dt>${a.kind === "ewallet" ? "E-wallet" : "Bank"}</dt><dd>${a.provider_name}${a.kind === "bank" && typeLabel(a) ? html` (${typeLabel(a)})` : ""}</dd>
      <dt>Account name</dt><dd>${a.account_name}</dd>
      <dt>Account number</dt><dd><span data-num>${a.account_number}</span><button class="copy" type="button" hidden data-copy aria-label="Copy account number">Copy</button></dd></dl>
      ${a.has_qr ? html`<p class="acct-qr-hint">Tap the QR code to enlarge it.</p>` : ""}
    </div>
  </div>
  `)}
  <p class="acct-form-head">Your payment details</p>
  <div class="mt-3 grid gap-4 tab:grid-cols-2">
    ${many ? html`
    <div class="pp-co-field tab:col-span-2${invalid(!!fe.account_id)}">
      <label class="pp-co-label" for="account_id">Account You Paid To *</label>
      <select id="account_id" name="account_id" data-pk-select data-placeholder="Choose an account"${fe.account_id ? html` aria-invalid="true" aria-describedby="account_id-msg"` : ""}>
        <option value="">Choose an account</option>
        ${m.accounts.map((a) => html`<option value="${a.id}"${m.posted.account_id === a.id ? html` selected` : ""}>${a.provider_name} · ${a.account_name}</option>`)}
      </select>
      ${fe.account_id ? html`<p class="pp-co-error" id="account_id-msg">${fe.account_id}</p>` : ""}
    </div>
    ` : m.accounts.map((a) => html`<input type="hidden" name="account_id" value="${a.id}">`)}
    ${fieldBlock(m, "sender_bank", "Sender Bank", html``, "BDO", 60)}
    ${fieldBlock(m, "reference_number", "Reference Number", html``, "1234 5678 90", 64)}
    ${fieldBlock(m, "sender_first_name", "Sender First Name", html``, "Juan", 59)}
    ${fieldBlock(m, "sender_last_name", "Sender Last Name", html``, "dela Cruz", 59)}
    ${fieldBlock(m, "sender_account_number", "Sender Account Number", html``, "1234 5678 12", 64)}
    ${fieldBlock(m, "amount_sent", "Amount", html`inputmode="decimal"`, "1,488.00")}
    <div class="pp-co-field pp-co-dt tab:col-span-2${invalid(!!fe.transferred_at)}" id="tt-field" data-posted="${m.posted.transferred_at ?? ""}">
      <label class="pp-co-label" for="tt_date">Time of Transfer *</label>
      <input type="hidden" id="transferred_at" name="transferred_at" value="${m.posted.transferred_at ?? ""}">
      <div class="pp-co-dt-row">
        <div class="pp-co-dt-date"><input type="date" id="tt_date" required data-pk-date data-placeholder="Select date"${fe.transferred_at ? html` aria-invalid="true" aria-describedby="transferred_at-msg"` : ""}></div>
        <div class="pp-co-dt-time">
          <select id="tt_hour" required data-pk-select data-placeholder="Hour" aria-label="Hour"><option value="">Hour</option>${Array.from({ length: 12 }, (_, i) => html`<option value="${i + 1}">${i + 1}</option>`)}</select>
          <select id="tt_min" required data-pk-select data-placeholder="Min" aria-label="Minute"><option value="">Min</option></select>
          <select id="tt_ampm" required data-pk-select data-placeholder="AM/PM" aria-label="AM or PM"><option value="">AM/PM</option><option value="AM">AM</option><option value="PM">PM</option></select>
        </div>
      </div>
      ${fe.transferred_at ? html`<p class="pp-co-error" id="transferred_at-msg">${fe.transferred_at}</p>` : ""}
    </div>
    <div class="pp-co-field tab:col-span-2">
      <label class="pp-co-label" for="proof">Upload the Payment Receipt *</label>
      <div class="file${fe.proof ? html` bad` : ""}"><input id="proof" type="file" name="proof" accept="image/jpeg,image/png,image/webp,application/pdf"${fe.proof ? html` aria-invalid="true" aria-describedby="proof-msg"` : ""}></div>
      ${fe.proof ? html`<p class="pp-co-error" id="proof-msg">${fe.proof}</p>` : anyErrors ? html`<p class="pp-co-hint">Please choose your receipt again.</p>` : html`<p class="pp-co-hint">A screenshot or receipt. JPEG, PNG, WebP or PDF, up to 4 MB.</p>`}
    </div>
  </div>
  <p class="pp-co-hint mt-3">Placing your order sends your payment for the store's review. Your pack ships after the store verifies it.</p>
</div></div></div>
`;
}

function contactStep(c: PackCtx, m: CheckoutModel): Markup {
  const fe = m.field_errors;
  const mobileValue = tenDigits(m.posted.mobile || m.mobile);
  const termsPath = c.policy_links.find((l) => l.path === `/${TERMS_SLUG}/`)?.path ?? "";
  const privacyPath = c.policy_links.find((l) => l.path === PRIVACY_PATH)?.path ?? "";
  return html`
        <form method="post" action="${CHECKOUT_PATH}" enctype="multipart/form-data" id="contact-form" class="space-y-5" data-check-path="${CHECK_PATH}" data-email-error="${EMAIL_ERROR}" novalidate>
        <input type="hidden" name="action" value="contact">
        <input type="hidden" name="submit_key" value="${m.submit_key}">

        <div class="pp-co-card"><fieldset class="pp-co-block min-w-0">
          <legend class="pp-co-legend">Customer Information</legend>
          <div class="grid gap-4 tab:grid-cols-2">
            <div class="pp-co-field">
              <label class="pp-co-label" for="first_name">First Name *</label>
              <input class="pp-co-input${invalid(!!fe.full_name)}" type="text" id="first_name" name="first_name" autocomplete="given-name" placeholder="Juan" value="${m.posted.first_name || m.first_name}" required>
              ${fe.full_name ? html`<p class="pp-co-error">${fe.full_name}</p>` : ""}
            </div>
            <div class="pp-co-field">
              <label class="pp-co-label" for="last_name">Last Name *</label>
              <input class="pp-co-input${invalid(!!fe.full_name)}" type="text" id="last_name" name="last_name" autocomplete="family-name" placeholder="Dela Cruz" value="${m.posted.last_name || m.last_name}" required>
            </div>
            <div class="pp-co-field">
              <label class="pp-co-label" for="mobile">Mobile Number *</label>
              <div class="pp-co-phone${invalid(!!fe.mobile)}">
                <span class="pp-co-phone-prefix">+63</span>
                <input class="pp-co-phone-input" type="tel" id="mobile" name="mobile" inputmode="numeric" autocomplete="tel-national" required
                       placeholder="9XX XXX XXXX" value="${mobileValue}">
              </div>
              <p class="pp-co-hint">For delivery updates.</p>
              ${fe.mobile ? html`<p class="pp-co-error">${fe.mobile}</p>` : ""}
            </div>
            <div class="pp-co-field">
              <label class="pp-co-label" for="email">Email Address *</label>
              <input class="pp-co-input${invalid(!!fe.email)}" type="email" id="email" name="email" autocomplete="email" placeholder="juan@example.com" value="${m.posted.email || m.email}" required>
              <p class="pp-co-hint">For order confirmation and membership link.</p>
              ${fe.email ? html`<p class="pp-co-error">${fe.email}</p>` : ""}
            </div>
          </div>
        </fieldset></div>

        <div class="pp-co-card"><fieldset class="pp-co-block min-w-0">
          <legend class="pp-co-legend">Select Payment Method</legend>
          ${payCards(c, m, html``)}
          <label class="pp-co-agree mt-4" for="enrollment_authorized">
            <input type="checkbox" id="enrollment_authorized" name="enrollment_authorized" value="1"${checked(!!m.posted.enrollment_authorized || m.enrollment_held)}>
            <span>${ENROLLMENT_AUTHORIZATION}</span>
          </label>
          ${fe.enrollment_authorized ? html`<p class="pp-co-error" id="enrollment-msg">${fe.enrollment_authorized}</p>` : html`<p class="pp-co-error" id="enrollment-msg" hidden>${MSG_ENROLLMENT_REQUIRED}</p>`}
          <details class="pp-co-notice"><summary>Read the privacy notice</summary><p>${privacyPath ? html`The privacy notice that applies is this store's <a class="lnk" href="${privacyPath}" target="_blank" rel="noopener">Privacy &amp; Cookies Policy</a>.` : "This store has not published its privacy notice yet."}</p></details>
          <label class="pp-co-agree mt-4" for="agree">
            <input type="checkbox" id="agree" name="agree" value="1"${checked(!!m.posted.agree)}>
            <span>I have read and agree to the ${termsPath ? html`<a class="lnk" href="${termsPath}" target="_blank" rel="noopener">Website Terms &amp; Conditions</a>` : "Website Terms & Conditions"}.</span>
          </label>
          <p class="pp-co-error" id="agree-msg"${fe.agree ? html`` : html` hidden`}>${AGREE_ERROR}</p>
          ${promoBox(m)}

          <button type="submit" id="contact-btn" class="pp-co-submit mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-accent-500 px-3 py-3.5 text-[0.9375rem] leading-6 font-bold whitespace-nowrap text-primary-950 shadow-[var(--shadow-cta)] transition-[background-color,box-shadow,transform] duration-200 ease-out hover:bg-accent-400 active:translate-y-px disabled:cursor-wait disabled:opacity-70 tab:px-6 tab:text-lg">
            <span class="pp-co-submit-label" id="contact-btn-label" data-direct="Place Order — ${c.total}"${m.methods.xendit ? html` data-xendit="Continue to Payment — ${c.total}"` : html``}>${chosenMethod(m) === "direct" ? "Place Order" : "Continue to Payment"} &mdash; ${c.total}</span>
          </button>
          <p class="pp-co-footnote mt-3 text-center text-xs leading-snug text-ink-500">${icon("lock", "mr-1 inline-block h-3.5 w-3.5 -translate-y-px align-middle")}We never ask for card details on this page. No recurring charges are set up.</p>
        </fieldset></div>
        </form>
<style>
.pp-co-control{position:relative;display:block}
.pp-co-phone{position:relative}
.pp-co-check{display:none;position:absolute;right:14px;top:50%;transform:translateY(-50%);color:#2e7d32;font-weight:700;pointer-events:none}
.pp-co-ok .pp-co-check{display:block}
.pp-co-control.pp-co-ok .pp-co-input,.pp-co-phone.pp-co-ok{border-color:#2e7d32}
.pp-co-control.pp-co-ok .pp-co-input,.pp-co-phone.pp-co-ok .pp-co-phone-input{padding-right:40px}
${AGREE_CSS}
#agree-msg{padding-left:50px}
#agree-msg[hidden]{display:none}
#contact-btn{white-space:normal;text-align:center}
</style>
`;
}

function codeStep(m: CheckoutModel): Markup {
  const expired = m.error_code === "code_expired" || m.error_code === "code_burned";
  const fe = m.field_errors;
  return html`
        <div class="pp-co-card"><fieldset class="pp-co-block min-w-0">
          <legend class="pp-co-legend">Confirm Your Mobile Number</legend>
          <p class="text-sm leading-relaxed text-ink-600">We text the 6-digit code to ${m.mobile}.</p>
          ${expired ? html`
          <form method="post" action="${CHECKOUT_PATH}"><input type="hidden" name="action" value="resend">
            <button type="submit" class="${SUBMIT_CLASS}">Send a new code</button>
          </form>
          ` : html`
          <form method="post" action="${CHECKOUT_PATH}" class="mt-4" novalidate>
            <input type="hidden" name="action" value="verify">
            <div class="pp-co-field">
              <label class="pp-co-label" for="code">6-digit code</label>
              <input id="code" class="pp-co-input${invalid(!!fe.code)}" type="text" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required${fe.code ? html` aria-invalid="true" aria-describedby="code-msg"` : ""}>
              ${fe.code ? html`<p class="pp-co-error" id="code-msg">${fe.code}</p>` : html`<p class="pp-co-hint">The code expires in 10 minutes.</p>`}
            </div>
            <button type="submit" class="${SUBMIT_CLASS}">Confirm</button>
          </form>
          <form method="post" action="${CHECKOUT_PATH}" class="mt-3"><input type="hidden" name="action" value="resend"><button class="link-btn" type="submit">Send a new code</button></form>
          `}
          <form method="post" action="${CHECKOUT_PATH}" class="mt-1"><input type="hidden" name="action" value="change_number"><button class="link-btn" type="submit">Change number</button></form>
        </fieldset></div>
`;
}

function paymentStep(c: PackCtx, m: CheckoutModel): Markup {
  const fe = m.field_errors;
  if (fe.mobile || fe.email || fe.full_name || fe.agree) {
    return html`
        <div class="pp-co-banner is-error" role="alert">${fe.mobile || fe.email || fe.full_name || fe.agree}</div>
        <form method="post" action="${CHECKOUT_PATH}"><input type="hidden" name="action" value="change_number"><button class="btn ghost" type="submit">Change your details</button></form>
`;
  }
  if (!m.methods.xendit && (!m.methods.direct || m.accounts.length === 0)) return html`
        <div class="pp-co-banner is-warn" role="status">${MSG_PAYMENT_UNAVAILABLE}</div>
`;
  return html`
        <form method="post" action="${CHECKOUT_PATH}" enctype="multipart/form-data" id="place-form" class="space-y-5" novalidate>
        <input type="hidden" name="action" value="place">
        <input type="hidden" name="submit_key" value="${m.submit_key}">

        <div class="pp-co-card"><fieldset class="pp-co-block min-w-0">
          <legend class="pp-co-legend">Select Payment Method</legend>
          ${payCards(c, m, m.methods.xendit ? html`<p id="xendit-panel" class="pp-co-hint"${chosenMethod(m) === "xendit" ? html`` : html` hidden`}>${PAY_ONLINE_STEP_HINT}</p>` : html``)}
          ${promoBox(m)}${m.promo ? html`<style>
${AGREE_CSS}
</style>` : html``}
          <button type="submit" id="place-btn" class="pp-co-submit mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-accent-500 px-3 py-3.5 text-[0.9375rem] leading-6 font-bold whitespace-nowrap text-primary-950 shadow-[var(--shadow-cta)] transition-[background-color,box-shadow,transform] duration-200 ease-out hover:bg-accent-400 active:translate-y-px disabled:cursor-wait disabled:opacity-70 tab:px-6 tab:text-lg" data-direct="Place order"${m.methods.xendit ? html` data-xendit="Pay with Xendit"` : html``}>${chosenMethod(m) === "direct" ? "Place order" : "Pay with Xendit"}</button>
          <p class="pp-co-footnote mt-3 text-center text-xs leading-snug text-ink-500">${icon("lock", "mr-1 inline-block h-3.5 w-3.5 -translate-y-px align-middle")}We never ask for card details on this page. No recurring charges are set up.</p>
        </fieldset></div>
        </form>
`;
}

function banner(m: CheckoutModel): Markup {
  if (!m.error_message) return html``;
  if (m.error_code === "sms_paused" || m.error_code === "sms_unavailable") {
    return html`<div class="pp-co-banner is-warn" role="alert">${m.error_message}</div>`;
  }
  if (m.error_code === "code_expired" || m.error_code === "code_burned") {
    return html`<div class="pp-co-banner is-error" role="alert">This code is no longer valid. Ask for a new code.</div>`;
  }
  const noFields = Object.keys(m.field_errors).length === 0;
  if (noFields || (m.step === "code" && !m.field_errors.code)) {
    return html`<div class="pp-co-banner is-error" role="alert">${m.error_message}</div>`;
  }
  return html``;
}

export function checkoutContent(c: PackCtx, m: CheckoutModel): Markup {
  return html`
<style>
.pp-co-legend,.pp-co-summary h2{padding-bottom:.75rem;border-bottom:1px solid var(--color-paper-300)}
.pp-co-legend{display:block}
.pp-co-summary h2{margin-bottom:1rem;font-size:var(--text-xl)}
#pp-checkout:has(input[value="direct"]:checked) .pp-co-summary-secure{display:none}
</style>
<div id="pp-checkout" class="pp-co bg-paper-100 text-ink-700">
  <div class="mx-auto max-w-6xl px-4 pt-5 pb-8 tab:px-8 desk:pt-8 desk:pb-14">
    <a href="${LANDING_PATH}" class="pp-co-back inline-flex items-center gap-1.5 rounded text-sm font-semibold text-primary-700 transition-colors duration-200 hover:text-primary-600">${icon("chevL", "h-4 w-4 shrink-0")}Back to the Sant&eacute; Membership Package</a>

    ${steps(m.step)}
    <h1 class="sr-only">Checkout</h1>

    <div class="mt-6 grid gap-6 desk:grid-cols-[minmax(0,1fr)_22rem] desk:items-start desk:gap-8">
      <div class="pp-co-form min-w-0 space-y-5">
        ${banner(m)}
${m.step === "contact" ? contactStep(c, m) : m.step === "code" ? codeStep(m) : paymentStep(c, m)}
      </div>

      <aside class="pp-co-summary hidden desk:sticky desk:top-6 desk:block" aria-label="Order summary">
        <div class="pp-co-card">
          <h2 class="text-lg !leading-snug">Order Summary</h2>
          <img src="${asset("img/order-summary-pack-640.webp")}" srcset="${asset("img/order-summary-pack-640.webp")} 640w, ${asset("img/order-summary-pack-960.webp")} 960w" sizes="19rem" alt="Two boxes and three sachets of Santé Barley Powder with a glass of barley drink, in front of New Zealand mountains." width="640" height="424" loading="lazy" decoding="async" class="mt-3 block h-auto w-full rounded-xl">
          <p class="mt-3 text-base font-bold leading-snug text-ink-900">Sant&eacute; Membership Package</p>
          <ul class="mt-3 space-y-1.5 text-sm text-ink-700">
            <li class="flex items-start gap-2">${icon("check", "mt-0.5 h-4 w-4 shrink-0 text-primary-600")}2 Boxes With Stevia &middot; 20 Sachets</li>
            <li class="flex items-start gap-2">${icon("check", "mt-0.5 h-4 w-4 shrink-0 text-primary-600")}10 Individual 3g Sachets per Box</li>
            <li class="flex items-start gap-2">${icon("check", "mt-0.5 h-4 w-4 shrink-0 text-primary-600")}Free Nationwide Shipping</li>
          </ul>
          <dl class="pp-co-totals mt-4 space-y-1.5 border-t border-paper-300 pt-4 text-sm">
            <div class="flex justify-between gap-3"><dt>Subtotal</dt><dd>${c.price}</dd></div>
            <div class="flex justify-between gap-3"><dt>Shipping</dt><dd class="font-semibold text-primary-700">FREE</dd></div>
            <div class="pp-co-total flex justify-between gap-3 border-t border-paper-300 pt-2 text-lg font-bold text-ink-900"><dt>Total</dt><dd>${c.total}</dd></div>
          </dl>
        </div>
      </aside>
    </div>
  </div>

  <div class="pp-co-totalbar sticky bottom-0 z-30 border-t border-mint-200 bg-white/95 px-4 py-2.5 backdrop-blur desk:hidden" aria-hidden="true">
    <div class="mx-auto flex max-w-md items-center justify-between gap-3">
      <p class="text-sm font-semibold text-ink-700">Total <span class="ml-1 text-lg font-bold text-ink-900">${c.total}</span></p>
      <p class="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700">${icon("truck", "h-4 w-4 shrink-0")}Free Shipping</p>
    </div>
  </div>
</div>
`;
}

export const CHECKOUT_SCRIPTS = ["js/pack-checkout.js"];

export function checkoutDocument(c: PackCtx, m: CheckoutModel): Markup {
  return packDocument(c, {
    title: "Checkout",
    content: checkoutContent(c, m),
    head: html`<script src="${asset("js/pack-select.js")}" defer></script>`,
    scripts: CHECKOUT_SCRIPTS,
  });
}
