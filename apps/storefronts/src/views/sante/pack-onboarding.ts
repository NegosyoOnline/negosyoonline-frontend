/* The Membership Pack onboarding (verify, address, details), the Completed page and the order-access page.

   Transcribed from TWCinc's negosyoonline_sante_pack/onboarding.html, _ob_verify.html, _ob_code.html, _ob_help.html,
   _ob_address.html, _ob_details.html, completed.html, access.html, _paid_summary.html and _checkout_steps.html (includes
   expanded). Markup, class names, text and order are the templates'. Different from them, on purpose:
   - no CSRF token field: a post is checked for its origin (src/lib/cookies.ts sameOriginPost);
   - the dead-end "Terms" popup draws the PDF with PDF.js on this host (js/pack-terms-popup.js) where TWCinc framed it,
     because this storefront's policy frames none of its own pages;
   - the details gate's messages and reserved names are the backend's own rules (apps/pack/registration_rules.py)
     written here, as TWCinc's view passed them from registration_rules.py;
   - the Payment line of the Order Summary is always the transfer, as this site takes no online payment. */
import { asset } from "../../lib/assets.ts";
import { html, safe, type Markup } from "../../lib/html.ts";
import type { OnboardingState } from "../../lib/pack-api.ts";
import { icon } from "./icons.ts";
import { packDocument, type PackCtx } from "./pack-page.ts";
import { TERMS_ERROR, termsDialog, termsField } from "./pack-terms.ts";

export const ONBOARDING_PATH = "/funnel/membership-pack/onboarding/";
export const VERIFY_PATH = ONBOARDING_PATH + "verify/";
export const ADDRESS_PATH = ONBOARDING_PATH + "address/";
export const DETAILS_PATH = ONBOARDING_PATH + "details/";
export const ZIP_PATH = ONBOARDING_PATH + "zip/";
export const MOBILE_SEND_PATH = ONBOARDING_PATH + "mobile/send/";
export const MOBILE_VERIFY_PATH = ONBOARDING_PATH + "mobile/verify/";
export const EMAIL_SEND_PATH = ONBOARDING_PATH + "email/send/";
export const EMAIL_VERIFY_PATH = ONBOARDING_PATH + "email/verify/";
export const COMPLETED_PATH = "/funnel/membership-pack/completed/";
export const ACCESS_PATH = "/funnel/membership-pack/access/";

export const STEP_PATHS: Record<OnboardingState["step"], string> = {
  verify: VERIFY_PATH, address: ADDRESS_PATH, details: DETAILS_PATH, done: COMPLETED_PATH,
};
export const STEP_ORDER = ["verify", "address", "details", "done"] as const;

export { MEMBERSHIP_TERMS_LABEL, MEMBERSHIP_TERMS_URL } from "./pack-terms.ts";

/* registration_rules.py and registration.py: what pack-details-gate.js says, and the names it refuses. */
const DETAILS_GATE = {
  dob_required: "Enter your date of birth.",
  dob_future: "Date of birth cannot be a future date.",
  dob_minor: "You must be at least 18 years old to register.",
  user_required: "Enter your preferred Santé username.",
  user_format: "Use 8–20 letters or numbers only.",
  user_reserved: "This username isn’t allowed on Santé. Choose another.",
  alt_required: "Enter a secondary Santé username, in case your first is already taken.",
  alt_duplicate: "Each username choice must be different.",
  terms: TERMS_ERROR,
  reserved: [
    "admin", "administrator", "root", "superadmin", "superuser", "owner", "staff", "support", "helpdesk", "moderator", "mod",
    "operator", "manager", "api", "system", "null", "undefined", "true", "false", "test", "demo", "guest", "anonymous", "user",
    "users", "me", "self", "sante", "santeai", "bpract", "sponsor", "upline", "downline", "leader",
  ].sort(),
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export type ObView = {
  sub: "verify" | "address" | "details";
  state: OnboardingState;
  error_message: string;
  field_errors: Record<string, string>;
  posted: Record<string, string>;
  now: Date;
};

const invalid = (on: boolean): string => (on ? " bad" : "");

/** +639171234567 as 917 123 4567, the part typed after the fixed +63 prefix (TWCinc _mobile_display). */
export function mobileDisplay(value: string): string {
  let digits = (value ?? "").replace(/\D/g, "");
  if (digits.startsWith("63")) digits = digits.slice(2);
  digits = digits.replace(/^0+/, "").slice(0, 10);
  return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)].filter(Boolean).join(" ");
}

/** The first onboarding steps done before `current`, as TWCinc's sub_steps. */
function subSteps(current: OnboardingState["step"]): { key: string; label: string; done: boolean }[] {
  const at = STEP_ORDER.indexOf(current);
  return [["verify", "Verify"], ["address", "Delivery"], ["details", "Santé details"]].map(([key, label]) => ({
    key, label, done: STEP_ORDER.indexOf(key as (typeof STEP_ORDER)[number]) < at,
  }));
}

/* ---- the frame: progress track and the Order Summary ---------------------------------------------------------- */

function track(step: "onboarding" | "completed"): Markup {
  const done = (label: string, current = false): Markup =>
    html`<li class="is-done"${current ? html` aria-current="step"` : ""}><span class="pp-co-track-dot">${icon("check", "h-4 w-4")}</span>${label}</li>`;
  return html`
<nav class="pp-co-track" aria-label="Checkout progress">
  <ol>
    ${done("Your Package")}
    ${done("Your Details")}
    ${done("Payment")}
    ${step === "onboarding" ? html`
    <li class="is-current" aria-current="step"><span class="pp-co-track-dot">4</span>Onboarding</li>
    <li><span class="pp-co-track-dot">5</span>Completed</li>
    ` : html`
    ${done("Onboarding")}
    ${done("Completed", true)}
    `}
  </ol>
</nav>
`;
}

function paidSummary(c: PackCtx, paymentLabel: string): Markup {
  return html`
<section class="pp-co-card pp-co-summary" aria-label="Order summary">
  <h2 class="text-lg !leading-snug">Order Summary</h2>
  <img src="${asset("img/order-summary-pack-640.webp")}" srcset="${asset("img/order-summary-pack-640.webp")} 640w, ${asset("img/order-summary-pack-960.webp")} 960w" sizes="(min-width: 1024px) 19rem, calc(100vw - 4rem)" alt="Two boxes and three sachets of Santé Barley Powder with a glass of barley drink, in front of New Zealand mountains." width="640" height="424" loading="lazy" decoding="async" class="mt-3 block h-auto w-full rounded-xl">
  <p class="pp-sum-title mt-3 text-base font-bold leading-snug text-ink-900">Sant&eacute; Membership Package &times; 1</p>
  <dl class="pp-co-totals mt-4 space-y-1.5 border-t border-paper-300 pt-4 text-sm">
    <div class="flex justify-between gap-3"><dt>Subtotal</dt><dd>${c.price}</dd></div>
    <div class="flex justify-between gap-3"><dt>Shipping</dt><dd class="font-semibold text-primary-700">FREE</dd></div>
    <div class="flex justify-between gap-3"><dt>Payment</dt><dd>${paymentLabel || "Bank or e-wallet transfer"}</dd></div>
    <div class="pp-co-total flex justify-between gap-3 border-t border-paper-300 pt-2 text-lg font-bold text-ink-900"><dt>Total</dt><dd>${c.total}</dd></div>
  </dl>
</section>
`;
}

function frame(c: PackCtx, step: "onboarding" | "completed", card: Markup, paymentLabel: string): Markup {
  return html`
<div class="pp-co bg-paper-100 text-ink-700">
  <div class="mx-auto max-w-6xl px-4 pt-5 pb-8 tab:px-8 desk:pt-8 desk:pb-14">
    ${track(step)}
    <div class="mt-6 grid gap-6 desk:grid-cols-[minmax(0,1fr)_22rem] desk:items-start desk:gap-8">
      <div class="min-w-0 space-y-5">
        ${card}
      </div>
      <aside class="space-y-5 desk:sticky desk:top-6" aria-label="Your order">
        ${paidSummary(c, paymentLabel)}
      </aside>
    </div>
  </div>
</div>
`;
}

/* ---- verify ---------------------------------------------------------------------------------------------------- */

function codeCard(v: ObView, a: { masked: string; verify: string; send: string; resend_in: number; attempts_left: number; uid: string }): Markup {
  const fe = v.field_errors;
  const spent = a.attempts_left < 1;
  return html`
<p class="pp-ob-sent">Enter the 6-digit code sent to <strong>${a.masked}</strong>.</p>
<form method="post" action="${a.verify}" novalidate data-pp-otp data-pp-busy-msg="Verifying your code…">
  <input type="hidden" name="code" value="">
  <div class="otp-boxes">${["1", "2", "3", "4", "5", "6"].map((i) => html`<input class="otp-box${fe.code ? " is-invalid" : ""}" id="${a.uid}-${i}" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="1" autocomplete="${i === "1" ? "one-time-code" : "off"}" aria-label="Digit ${i} of 6"${spent ? html` disabled` : ""}>`)}</div>
  ${spent ? html`<p class="pp-mb-error" role="alert">Too many attempts. Send a new code.</p>`
    : fe.code ? html`<p class="pp-mb-error" role="alert">Incorrect code. ${a.attempts_left === 1 ? "You have 1 attempt left." : `You have ${a.attempts_left} attempts left.`}</p>` : ""}
  <button class="btn" type="submit"${spent ? html` disabled` : ""}>Verify Code</button>
</form>
<form method="post" action="${a.send}" class="otp-resend" novalidate data-pp-resend="${a.resend_in}" data-pp-busy-msg="Sending a new code…">
  <span>Didn&rsquo;t receive the OTP?</span>
  <button class="otp-resend-btn" type="submit"${a.resend_in ? html` disabled` : ""}>Resend OTP <span data-pp-resend-timer>${a.resend_in ? `(${a.resend_in}s)` : ""}</span></button>
</form>
`;
}

function help(c: PackCtx, what: string, orderNumber: string): Markup {
  const biz = c.biz;
  const cap = what.charAt(0).toUpperCase() + what.slice(1);
  return html`
<details class="vf-help">
  <summary>${cap} incorrect? ${icon("chevDown", "ic ic-sm vf-chev")}</summary>
  <div class="vf-help-body">
    <p>We can only verify this ${what}, and it cannot be changed on this page. If it is not yours, contact us and include your order number <strong>${orderNumber}</strong>.</p>
    ${(biz.contact_email || biz.contact_mobile) ? html`<dl class="vf-contact">
      ${biz.contact_email ? html`<div><dt>${icon("mail", "ic ic-sm")} Email</dt><dd class="vf-sel"><a href="mailto:${biz.contact_email}">${biz.contact_email}</a></dd></div>` : ""}
      ${biz.contact_mobile ? html`<div><dt>${icon("phone", "ic ic-sm")} Phone</dt><dd class="vf-sel"><a href="tel:${biz.contact_mobile_raw}">${biz.contact_mobile}</a></dd></div>` : ""}
    </dl>` : ""}
    <p class="vf-fine">The team will check your order and help you continue.</p>
  </div>
</details>
`;
}

function verifyStep(c: PackCtx, v: ObView): Markup {
  const s = v.state;
  const fe = v.field_errors;
  if (s.mobile.pending) {
    return html`
<div class="vf vf-center">
  <span class="pp-next-eyebrow">Step 1 of 3 &middot; Mobile number</span>
  <h1>Verify Your Mobile Number</h1>
  ${s.mobile.code_sent_to ? codeCard(v, {
    masked: s.mobile_masked, verify: MOBILE_VERIFY_PATH, send: MOBILE_SEND_PATH, resend_in: s.mobile.resend_in,
    attempts_left: s.mobile.attempts_left, uid: "ob-code",
  }) : html`
  <p class="pp-ob-sent">We will text a 6-digit code to <strong>${s.mobile_masked}</strong>.</p>
  ${fe.mobile ? html`<p class="pp-mb-error" role="alert">${fe.mobile}</p>` : ""}
  <form method="post" action="${MOBILE_SEND_PATH}" novalidate data-pp-busy-msg="Sending your code…">
    <button class="btn" type="submit">Send Code</button>
  </form>
  `}
  ${help(c, "mobile number", s.order_number)}
</div>
`;
  }
  if (!s.email.verified) {
    return html`
<div class="vf vf-center">
  <span class="pp-next-eyebrow">Step 1 of 3 &middot; Email</span>
  <h1>Verify Your Email</h1>
  <p class="pp-ob-done">${icon("check", "h-4 w-4")}Mobile number verified</p>
  ${s.email.code_sent ? codeCard(v, {
    masked: s.email.masked, verify: EMAIL_VERIFY_PATH, send: EMAIL_SEND_PATH, resend_in: s.email.resend_in,
    attempts_left: s.email.attempts_left, uid: "ob-ecode",
  }) : html`
  <p class="pp-ob-sent">We will email a 6-digit code to <strong>${s.email.masked}</strong>.</p>
  ${fe.email ? html`<p class="pp-mb-error" role="alert">${fe.email}</p>` : ""}
  <form method="post" action="${EMAIL_SEND_PATH}" novalidate data-pp-busy-msg="Sending your code…">
    <button class="btn" type="submit">Send Code</button>
  </form>
  `}
  ${help(c, "email", s.order_number)}
</div>
`;
  }
  return html`
<span class="pp-next-eyebrow">Step 1 of 3</span>
<h1>Mobile and email verified</h1>
<p class="pp-ob-done">${icon("check", "h-4 w-4")}Mobile number verified</p>
<p class="pp-ob-done">${icon("check", "h-4 w-4")}Email verified</p>
<a class="btn" href="${ADDRESS_PATH}">Continue</a>
`;
}

/* ---- address --------------------------------------------------------------------------------------------------- */

function addressStep(v: ObView): Markup {
  const fe = v.field_errors;
  const p = v.posted;
  const a = v.state.address;
  const localMobile = mobileDisplay(a.receiver_mobile || v.state.mobile.mobile);
  const field = (name: string, label: string, id: string, attrs: Markup, value: string, hint = ""): Markup => html`
      <div class="fld"><label for="${id}">${label} *</label>
      <input id="${id}" class="inp${invalid(!!fe[name])}" type="text" name="${name}" ${attrs} value="${value}">
      ${fe[name] ? html`<p class="err">${fe[name]}</p>` : hint}</div>`;
  const select = (name: string, label: string, id: string, placeholder: string, value: string): Markup => html`
      <div class="fld${fe[name] ? " is-invalid" : ""}"><label for="${id}">${label} *</label>
      <select id="${id}" name="${name}" data-pk-select data-placeholder="${placeholder}" data-value="${value}" disabled><option value=""></option></select>
      ${fe[name] ? html`<p class="err">${fe[name]}</p>` : ""}</div>`;
  return html`
<span class="pp-next-eyebrow">Step 2 of 3</span>
<h1>Delivery address</h1>
<p class="pp-next-lede">Tell us who receives your Membership Pack and where to deliver it.</p>
<form method="post" action="${ADDRESS_PATH}" novalidate data-pp-busy-msg="Saving your delivery address…">
  <div class="pp-addr" data-pp-address data-ph-provinces="${asset("data/provinces.json")}" data-ph-cities="${asset("data/city-mun.json")}" data-ph-barangays="${asset("data/barangays.json")}" data-zip-url="${ZIP_PATH}">
    <div class="pp-ob-grid">
      ${field("receiver_name", "Receiver Name", "da-name", html`maxlength="120" autocomplete="name"`, p.receiver_name || a.receiver_name)}
      <div class="fld"><label for="da-mobile">Receiver Mobile *</label>
      <div class="pp-phone${invalid(!!fe.receiver_mobile)}"><span class="pp-phone-prefix">+63</span>
      <input id="da-mobile" class="pp-phone-input" type="tel" name="receiver_mobile" inputmode="numeric" autocomplete="tel-national" placeholder="9XX XXX XXXX" value="${p.receiver_mobile || localMobile}"></div>
      ${fe.receiver_mobile ? html`<p class="err">${fe.receiver_mobile}</p>` : ""}</div>
    </div>
    ${field("line", "Address", "da-line", html`maxlength="200" autocomplete="address-line1" placeholder="House or unit number and street"`, p.line || a.line)}
    <div class="pp-ob-grid">
      ${select("province", "Province", "da-province", "Select province", p.province || a.province)}
      ${select("city", "City / Municipality", "da-city", "Select city / municipality", p.city || a.city)}
      ${select("barangay", "Barangay", "da-barangay", "Select barangay", p.barangay || a.barangay)}
      <div class="fld"><label for="da-country">Country</label>
      <input id="da-country" class="inp" type="text" value="Philippines" disabled></div>
    </div>
    <div class="fld" data-pp-zip-field${fe.postal_code ? html`` : html` hidden`}><label for="da-zip">ZIP Code *</label>
    <input id="da-zip" class="inp${invalid(!!fe.postal_code)}" type="text" name="postal_code" inputmode="numeric" maxlength="4" autocomplete="postal-code" placeholder="4 digits, e.g. 1300" value="${p.postal_code ?? ""}">
    <p class="hint" data-pp-zip-hint></p>
    ${fe.postal_code ? html`<p class="err">${fe.postal_code}</p>` : ""}</div>
    ${field("landmark", "Landmark", "da-landmark", html`maxlength="200" placeholder="e.g. Near the barangay hall"`, p.landmark || a.landmark)}
    <input type="hidden" name="barangay_code" value="">
  </div>
  <div class="pp-ob-actions"><button class="btn pp-ob-cta" type="submit">Save and continue<span class="pp-ob-cta-arrow" aria-hidden="true">&rarr;</span></button></div>
</form>
`;
}

/* ---- details --------------------------------------------------------------------------------------------------- */

function detailsStep(v: ObView, termsVersion: number | null): Markup {
  const fe = v.field_errors;
  const p = v.posted;
  const year = new Date(v.now.getTime() + 8 * 3600 * 1000).getUTCFullYear(); // the year in Manila (UTC+8), as TWCinc localdate()
  const years = Array.from({ length: 82 }, (_, i) => year - 18 - i);
  const gate = safe(JSON.stringify(DETAILS_GATE).replace(/</g, "\\u003c"));
  const user = (name: string, label: string, id: string, hint: string): Markup => html`
  <div class="fld"><label for="${id}">${label}</label>
  <input id="${id}" class="inp${invalid(!!fe[name])}" type="text" name="${name}" maxlength="20" autocomplete="off" autocapitalize="none" value="${p[name] ?? ""}">
  ${fe[name] ? html`<p class="err">${fe[name]}</p>` : html`<p class="hint">${hint}</p>`}</div>`;
  return html`
<span class="pp-next-eyebrow">Step 3 of 3</span>
<h1>Your Santé account details</h1>
<p class="pp-next-lede">Our authorised Santé team uses these to register your membership account.</p>
${v.state.details_erased ? html`<p class="pp-next-lede" role="status">Your details were removed after 90 days to protect your privacy. Please enter them again to finish your registration.</p>` : ""}
<script type="application/json" id="pp-details-gate">${gate}</script>
<form method="post" action="${DETAILS_PATH}" novalidate data-pp-details data-pp-busy-msg="Submitting your details…">
  <fieldset class="pp-ob-dob${fe.date_of_birth ? " is-invalid" : ""}">
    <legend>Date of birth</legend>
    <div class="pp-ob-dob-row">
      <select name="dob_month" data-pk-select data-placeholder="Month" aria-label="Month of birth"><option value="">Month</option>${MONTHS.map((name, i) => html`<option value="${i + 1}"${p.dob_month === String(i + 1) ? html` selected` : ""}>${name}</option>`)}</select>
      <select name="dob_day" data-pk-select data-placeholder="Day" aria-label="Day of birth"><option value="">Day</option>${Array.from({ length: 31 }, (_, i) => i + 1).map((d) => html`<option value="${d}"${p.dob_day === String(d) ? html` selected` : ""}>${d}</option>`)}</select>
      <select name="dob_year" data-pk-select data-placeholder="Year" aria-label="Year of birth"><option value="">Year</option>${years.map((y) => html`<option value="${y}"${p.dob_year === String(y) ? html` selected` : ""}>${y}</option>`)}</select>
    </div>
    ${fe.date_of_birth ? html`<p class="err">${fe.date_of_birth}</p>` : ""}
  </fieldset>
  <h2 class="pp-ob-sub">Santé username</h2>
  ${user("desired_username", "Preferred Santé username", "dt-u1", "8 to 20 letters or numbers. No spaces or symbols.")}
  ${user("alternate_username", "Secondary Santé Username", "dt-u2", "Used if your first choice is already taken on Santé. 8 to 20 letters or numbers.")}
  ${termsField(termsVersion, p, fe)}
  <div class="pp-ob-actions"><button class="btn pp-ob-cta" type="submit">Submit my details<span class="pp-ob-cta-arrow" aria-hidden="true">&rarr;</span></button></div>
</form>
${termsDialog(termsVersion)}
`;
}

export function onboardingDocument(c: PackCtx, v: ObView, termsVersion: number | null): Markup {
  const fe = v.field_errors;
  const sub = v.sub;
  const showNote = !!v.error_message && (Object.keys(fe).length === 0 || (sub === "verify" && !fe.mobile && !fe.code));
  const tabs = subSteps(v.state.step);
  const card = html`
        <section class="pp-co-card pp-next">
          <ol class="pp-ob-tabs" aria-label="Onboarding steps">
            ${tabs.map((t) => html`<li class="${t.key === sub ? "is-current" : t.done ? "is-done" : ""}"${t.key === sub ? html` aria-current="step"` : ""}><span class="pp-ob-n">${t.done && t.key !== sub ? icon("check", "h-3.5 w-3.5") : String(tabs.indexOf(t) + 1)}</span>${t.label}</li>`)}
          </ol>
          ${showNote ? html`<div class="note bad" role="alert">${v.error_message}</div>` : ""}
          ${sub === "verify" ? verifyStep(c, v) : sub === "address" ? addressStep(v) : detailsStep(v, termsVersion)}
        </section>`;
  const scripts = ["js/pack-otp.js"];
  if (sub === "address") scripts.push("js/pack-address.js");
  if (sub === "details") scripts.push("js/pack-details-gate.js", "js/pack-terms-popup.js");
  scripts.push("js/pack-busy.js");
  return packDocument(c, {
    title: "Onboarding",
    content: frame(c, "onboarding", card, v.state.payment_method_label),
    head: html`<link rel="stylesheet" href="${asset("css/pack-verify.css")}">
<script src="${asset("js/pack-select.js")}" defer></script>`,
    scripts,
  });
}

/* ---- completed ------------------------------------------------------------------------------------------------- */

export function completedDocument(c: PackCtx, s: OnboardingState): Markup {
  const held = s.registration_held;
  const a = s.address;
  const where = a.line
    ? `, to ${a.receiver_name}, ${a.line}${a.barangay ? `, ${a.barangay}` : ""}${a.city ? `, ${a.city}` : ""}${a.province ? `, ${a.province}` : ""}${a.zip ? ` ${a.zip}` : ""}`
    : "";
  const card = html`
        <section class="pp-co-card pp-next pp-done">
          <div class="pp-paid-head">
            <span class="pp-paid-icon" aria-hidden="true">${held ? (held.label === "Cancelled" ? icon("close", "h-5 w-5") : icon("clock", "h-5 w-5")) : icon("check", "h-5 w-5")}</span>
            <h1>${held ? held.label : "Your onboarding is complete"}</h1>
          </div>
          ${held ? html`<p class="pp-next-lede">${held.line}</p>` : html`<p class="pp-next-lede">Your details are with the store, and your Santé membership registration is being processed.</p>`}
          <p class="pp-done-order"><span>Order number</span><strong>${s.order_number}</strong></p>
          ${held ? "" : html`<h2 class="pp-done-h">What happens next</h2>
          <ol class="pp-done-steps">
            <li>
              <span class="pp-done-ic">${icon("user", "h-5 w-5")}</span>
              <div><h3>Santé Membership Registration</h3><p>Our authorised Santé team uses the details you just sent to register your membership account.</p></div>
            </li>
            <li>
              <span class="pp-done-ic">${icon("shield", "h-5 w-5")}</span>
              <div>${s.payment_verified ? html`<h3>Your payment is verified</h3><p>Your Lifetime Membership is on, with 40% member savings on eligible Santé products.</p>` : html`<h3>The store verifies your payment</h3><p>Your Lifetime Membership then turns on, with 40% member savings on eligible Santé products.</p>`}</div>
            </li>
            <li>
              <span class="pp-done-ic">${icon("truck", "h-5 w-5")}</span>
              <div><h3>Membership Package Delivery</h3><p>${s.payment_verified ? html`It ships once your membership is registered${where}.` : html`It ships once your membership is registered and your payment is verified${where}.`}</p></div>
            </li>
          </ol>`}
          <form method="post" action="${COMPLETED_PATH}" data-pp-busy-msg="Taking you to your dashboard…"><button class="btn inline pp-done-cta" type="submit" data-pp-busy-label="Taking you to your dashboard&hellip;">Go to my dashboard<span class="pp-ob-cta-arrow" aria-hidden="true">&rarr;</span></button></form>
        </section>`;
  return packDocument(c, { title: "Completed", content: frame(c, "completed", card, s.payment_method_label), scripts: ["js/pack-busy.js"] });
}

/* ---- the secure order-access link ------------------------------------------------------------------------------ */

export type AccessView = {
  error_message: string;
  contacts_replaced: boolean;
  sent: boolean;
  link_open: boolean;
  renewable: boolean;
  sign_in_path: string;
};

export function accessDocument(c: PackCtx, v: AccessView): Markup {
  const body = v.contacts_replaced ? html`
<h1>Check your email</h1>
<p style="margin-top:12px">The store updated your contact details, so this page has closed. Check your email for a secure link to continue your order.</p>` : v.sent ? html`
<h1>Check your email</h1>
<p style="margin-top:12px">Check your email for a new secure link.</p>` : v.link_open ? html`
<h1>Continue your order</h1>
<p style="margin-top:12px">Tap the button to confirm your mobile number and continue your order.</p>
<form method="post" novalidate style="margin-top:16px">
<input type="hidden" name="action" value="continue">
<button class="btn" type="submit">Continue</button>
</form>` : v.renewable ? html`
<h1>This link has been used or has expired</h1>
<p style="margin-top:12px">Each link works once and lasts 7 days. We can email you a new one.</p>
<form method="post" novalidate style="margin-top:16px">
<input type="hidden" name="action" value="renew">
<button class="btn" type="submit">Email me a new link</button>
</form>` : html`
<h1>This link is no longer needed</h1>
<p style="margin-top:12px">Your mobile number is confirmed, so you can sign in with a code.</p>
<a class="btn" href="${v.sign_in_path}" style="margin-top:16px">Sign in</a>`;
  return packDocument(c, {
    title: "Continue your order",
    content: html`
<div class="pp-co"><div class="pp-co-wrap"><div class="pp-narrow"><div class="card">
${v.error_message ? html`<div class="note bad" role="alert">${v.error_message}</div>` : ""}
${body}
</div></div></div></div>`,
  });
}
