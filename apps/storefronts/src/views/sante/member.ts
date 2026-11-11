/* The Santé member pages: the shell, the sign-in page and the dashboard home.

   Transcribed from TWCinc's approved templates: negosyoonline_sante_pack/shell.html, sign_in.html, dash_home.html,
   _footer.html, and the member base negosyoonline_members/base.html. Markup, class names, text and order are the
   templates'. Different from them, on purpose:
   - asset links point at /assets/sante/ (src/lib/assets.ts);
   - no CSRF token field: every POST is checked by its Origin / Sec-Fetch-Site instead (src/lib/cookies.ts);
   - the shell's menu script is the external js/pack-nav-toggle.js, not an inline script (the policy allows none);
   - the Basket icon links to /products/ and opens no drawer until the checkout slice (PK6);
   - the menu holds only the sections that exist (SECTIONS below): My Orders and Commission come with their pages;
   - the home is the hero without its four tiles, the payment and registration panels, Order Monitoring and
     "View all orders": those come with the dashboard slice (PK11);
   - "Text me the code" shows only when TEXT_ME_ENABLED is true, which waits for the member SMS slice (PK2b). */
import { asset } from "../../lib/assets.ts";
import { html, safe, type Markup } from "../../lib/html.ts";
import type { Site } from "../../lib/django.ts";
import { formatMobile } from "./model.ts";
import { MEMBER_BASE_CSS } from "./member-base-css.ts";

export const SIGN_IN_PATH = "/dashboard/sign-in/";
export const HOME_PATH = "/dashboard/";

/* The one switch for the "Text me the code" button and its handler. Flip it when the member SMS route exists. */
export const TEXT_ME_ENABLED = false;

/* The dashboard menu. `built: false` hides a section until its page exists (no dead link): the later slice
   flips it. The order is TWCinc's (dashboard.py SECTIONS). */
export type Section = { key: string; label: string; path: string; built: boolean };
export const SECTIONS: readonly Section[] = [
  { key: "home", label: "Dashboard", path: "/dashboard/", built: true },
  { key: "orders", label: "My Orders", path: "/dashboard/orders/", built: false },
  { key: "commission", label: "Commission", path: "/dashboard/commission/", built: false },
  { key: "account", label: "Account", path: "/dashboard/account/", built: false },
];

/* The ?next= keys of TWCinc (site_views.NEXT_TARGETS). A key whose page is not built yet lands on the home. */
const NEXT_PATHS: Record<string, string> = {
  home: "/dashboard/", account: "/dashboard/account/", orders: "/dashboard/orders/",
  commission: "/dashboard/commission/", payout: "/dashboard/commission/payout/",
  withdraw: "/dashboard/commission/withdraw/", address: "/dashboard/address/",
};

export function nextKey(value: string | null | undefined): string {
  return value && Object.prototype.hasOwnProperty.call(NEXT_PATHS, value) ? value : "";
}

export function nextTarget(key: string): string {
  const path = NEXT_PATHS[key];
  const built = SECTIONS.some((s) => s.path === path && s.built);
  return path && built ? path : HOME_PATH;
}

export const EMAIL_HINT = "If you have verified your email, you can sign in with it instead.";

export type Chrome = {
  store_name: string;
  accent_color: string;
  free_shipping_banner: boolean;
  year: number;
  policy_links: { label: string; path: string }[];
  biz: { registered_name: string; dti_business_number: string; contact_email: string; contact_mobile: string; contact_mobile_raw: string; has_seal: boolean };
};

export function chrome(site: Site, now: Date = new Date()): Chrome {
  const year = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", year: "numeric" }).format(now));
  const raw = site.business.contact_mobile;
  return {
    store_name: site.display_name,
    accent_color: /^#[0-9a-fA-F]{3,8}$/.test(site.accent_color) ? site.accent_color : "",
    free_shipping_banner: site.free_shipping_banner,
    year,
    policy_links: site.policy_links.filter((link) => /^\/[^/\\]/.test(link.path)),
    biz: {
      registered_name: site.business.registered_name,
      dti_business_number: site.business.dti_business_number,
      contact_email: site.business.contact_email,
      contact_mobile: formatMobile(raw) || raw,
      contact_mobile_raw: raw,
      has_seal: false, // no /business-seal/ route until private files exist: the design's no-seal state
    },
  };
}

const ICON = (path: string) =>
  html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;

function footer(v: Chrome): Markup {
  const b = v.biz;
  return html`<div class="pb pd-footer"><footer class="footer">
  <div class="footer-inner">
    ${b.has_seal || b.registered_name || b.dti_business_number || b.contact_email || b.contact_mobile ? html`
    <div class="footer-registration">
      <ul class="footer-reg-list">
        ${b.registered_name ? html`<li>${ICON("M4 21V6l8-3 8 3v15M9 21v-5h6v5M8 9h2M14 9h2M8 12.5h2M14 12.5h2")}<div><span>Registered business</span>${b.registered_name}</div></li>` : ""}
        ${b.dti_business_number ? html`<li>${ICON("M3 9l9-5 9 5M5 9v9M9.5 9v9M14.5 9v9M19 9v9M3 21h18M3 9h18")}<div><span>DTI registration no.</span>${b.dti_business_number}</div></li>` : ""}
        ${b.contact_email || b.contact_mobile ? html`<li class="footer-reg-contact"><div>
          ${b.contact_email ? html`<a href="mailto:${b.contact_email}">${ICON("M3 6h18v12H3zM3 7l9 6 9-6")}${b.contact_email}</a>` : ""}
          ${b.contact_mobile ? html`<a href="tel:${b.contact_mobile_raw}">${ICON("M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2")}${b.contact_mobile}</a>` : ""}
        </div></li>` : ""}
      </ul>
      ${b.has_seal ? html`<div class="footer-seal-box"><img class="footer-seal" src="/business-seal/" alt="BIR registered business seal" width="240" height="84"></div>` : ""}
    </div>
    ` : ""}
    <div class="footer-bottom">
      <div class="footer-meta">
        ${v.policy_links.length ? html`<ul class="footer-legal-row">${v.policy_links.map((l) => html`<li><a href="${l.path}">${l.label}</a></li>`)}</ul>` : ""}
        <div class="footer-copyright">&#169; ${v.year} ${v.store_name}. All rights reserved.</div>
        <div class="footer-disclaimer">Products are for general wellness support only. Not intended to diagnose, treat, cure, or prevent any disease. Results may vary.</div>
      </div>
    </div>
  </div>
</footer></div>`;
}

function bar(v: Chrome, member: string | null, current: string): Markup {
  const signedIn = member !== null;
  return html`${!signedIn && v.free_shipping_banner ? html`<div class="pdn-announce">&#128666; <strong>FREE SHIPPING</strong> on all orders — for a limited time!</div>` : ""}<nav class="pdn" id="pdn"${signedIn ? safe(' aria-label="Dashboard"') : ""}>
  <div class="pdn-inner">
    <a href="${signedIn ? "/dashboard/" : "/"}" class="pdn-logo"><img src="${asset("img/navbar-logo.webp")}" alt="Santé International"></a>
    ${!signedIn ? html`
    <ul class="pdn-links pdn-links-home" id="pdnLinks">
      <li><a href="/">Home</a></li>
      <li><a href="/#about">About</a></li>
      <li><a href="/#faq">FAQ</a></li>
      <li><a href="/#contact">Contact</a></li>
      <li><a href="/products/">Shop</a></li>
      <li class="pdn-track-li"><a href="/dashboard/sign-in/?next=orders">Track Order</a></li>
    </ul>
    <div class="pdn-actions">
      <a href="/dashboard/sign-in/?next=orders" class="pdn-track">Track Order</a>
      <a href="/products/" class="pdn-cart" aria-label="Basket">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="22" height="22" aria-hidden="true"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
      </a>
      <a href="/dashboard/sign-in/" class="pdn-login">Login</a>
      <button type="button" class="pdn-toggle" aria-label="Menu" aria-controls="pdnLinks" aria-expanded="false" id="pdnToggle"><span></span><span></span><span></span></button>
    </div>
    ` : ""}
    ${signedIn ? html`
    <ul class="pdn-links" id="pdnLinks">${SECTIONS.filter((s) => s.built).map((s) => html`
      <li><a href="${s.path}"${s.key === current ? safe(' aria-current="page"') : ""}>${s.label}</a></li>`)}
    </ul>
    <div class="pdn-actions">
      ${member ? html`<span class="pdn-who">${member}</span>` : ""}
      <form method="post" action="/dashboard/sign-out/" class="pdn-out"><button type="submit">Logout</button></form>
      <button type="button" class="pdn-toggle" aria-label="Menu" aria-controls="pdnLinks" aria-expanded="false" id="pdnToggle"><span></span><span></span><span></span></button>
    </div>
    ` : ""}
  </div>
</nav>`;
}

/** A member page: the base document, with the Santé bar and footer around `content`. `member` is the signed-in
    member's name ("" when the name is empty), or null on a signed-out page (the sign-in page). */
export function memberDocument(
  v: Chrome, args: { title: string; member: string | null; current: string; content: Markup; scripts: string[] },
): Markup {
  const signedIn = args.member !== null;
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${args.title} | ${v.store_name}</title>
<style>${safe(MEMBER_BASE_CSS)}</style>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700;800&amp;display=swap">
<link rel="stylesheet" href="${asset("css/pack-landing.min.css")}">
<link rel="stylesheet" href="${asset("css/pack-footer.min.css")}">
<link rel="stylesheet" href="${asset("css/pack-registration.css")}">
<link rel="stylesheet" href="${asset("css/pack-dashboard-shell.css")}">
<link rel="stylesheet" href="${asset("css/pack-dashboard.css")}">
<link rel="stylesheet" href="${asset("css/pack-focus.css")}">
</head>
<body>
<div class="e4"${v.accent_color ? html` style="--accent:${v.accent_color}"` : ""}>
${bar(v, args.member, args.current)}
<script src="${asset("js/pack-nav-toggle.js")}"></script>
${signedIn ? html`<div class="shell"><main class="main">${args.content}</main></div>` : html`<main class="wrap">${args.content}</main>`}
${footer(v)}
${args.scripts.map((s) => html`<script src="${asset(s)}"></script>`)}
</div>
</body>
</html>
`;
}

/* ---- the sign-in page -------------------------------------------------------------------------- */

export type SignInModel = {
  step: "contact" | "code";
  next: string;
  message: string;
  offer_email: boolean;
  error_code: string;
  error_message: string;
  field_errors: { contact?: string; code?: string };
  hint: string;
  sms_in: number;
  email_in: number;
};

export function signInModel(over: Partial<SignInModel> = {}): SignInModel {
  return { step: "contact", next: "", message: "", offer_email: false, error_code: "", error_message: "", field_errors: {}, hint: "", sms_in: 0, email_in: 0, ...over };
}

const nextField = (next: string) => (next ? html`<input type="hidden" name="next" value="${next}">` : "");

function signInBody(m: SignInModel): Markup {
  const noFieldErrors = !m.field_errors.contact && !m.field_errors.code;
  const smsPaused = m.error_code === "sms_paused" || m.error_code === "sms_unavailable";
  const expired = m.error_code === "code_expired" || m.error_code === "code_burned";
  const orders = m.next === "orders";
  const icon = html`<div class="sc-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5"/><path d="M12 13v8"/></svg></div>`;
  if (m.step === "code") {
    return html`<div class="sc-card">
${icon}
<h1>Enter your OTP</h1>
${smsPaused ? html`<div class="note warn" role="alert"><b>${m.error_message}</b>${m.hint ? html`<br>${m.hint}` : ""}</div>`
  : expired ? html`<div class="note bad" role="alert">This code is no longer valid. Ask for a new code.</div>`
  : m.error_message && noFieldErrors ? html`<div class="note bad" role="alert">${m.error_message}</div>` : ""}
${m.offer_email ? html`
<div class="note warn">Text messages are unavailable right now. We can email your code instead.</div>
<form method="post" class="stack">
${nextField(m.next)}
<button class="btn" type="submit" name="action" value="email">Email me a code</button>
</form>` : expired ? html`
<form method="post" class="stack">
${nextField(m.next)}
<button class="btn" type="submit" name="action" value="resend">Send a new code</button>
</form>` : html`
${m.message && !m.error_message ? html`<p class="sc-lead">${m.message}</p>` : ""}
<form method="post" class="sc-otp" data-pp-otp data-pp-busy-msg="Verifying your code&hellip;" novalidate>
${nextField(m.next)}
<input type="hidden" name="action" value="verify">
<input type="hidden" name="code" value="">
<div class="otp-boxes">${[1, 2, 3, 4, 5, 6].map((i) => html`<input class="otp-box${m.field_errors.code ? " is-invalid" : ""}" id="si-code-${i}" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="1" autocomplete="${i === 1 ? "one-time-code" : "off"}" aria-label="Digit ${i} of 6">`)}</div>
${m.field_errors.code ? html`<p class="pp-mb-error" role="alert">${m.field_errors.code}</p>` : ""}
<button class="btn" type="submit" data-pp-busy-label="Verifying&hellip;">${orders ? "Track My Orders" : "Log in to My Account"}</button>
</form>`}
${!m.offer_email ? html`
<div class="sc-alts"><p class="sc-alts-h">Didn&rsquo;t receive the OTP?</p><div class="sc-alts-row">
<form method="post">
${nextField(m.next)}
<button class="btn ghost sc-alt" type="submit" name="action" value="email"${m.email_in ? html` disabled data-pp-count="${m.email_in}"` : ""}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg><span>Email me the code<b data-pp-count-label>${m.email_in ? ` (${m.email_in}s)` : ""}</b></span></button>
</form>
${TEXT_ME_ENABLED ? html`<form method="post">
${nextField(m.next)}
<button class="btn ghost sc-alt" type="submit" name="action" value="text"${m.sms_in ? html` disabled data-pp-count="${m.sms_in}"` : ""}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg><span>Text me the code<b data-pp-count-label>${m.sms_in ? ` (${m.sms_in}s)` : ""}</b></span></button>
</form>` : ""}
</div></div>` : ""}
<form method="post" class="sc-center sc-back">
${nextField(m.next)}
<button class="link-btn" type="submit" name="action" value="restart">&larr; Use a different number</button>
</form>
</div>`;
  }
  return html`<div class="sc-card">
${icon}
<h1>${orders ? "Track Your Orders" : "Member Login"}</h1>
${smsPaused ? html`<div class="note warn" role="alert"><b>${m.error_message}</b>${m.hint ? html`<br>${m.hint}` : ""}</div>`
  : m.error_message && noFieldErrors ? html`<div class="note bad" role="alert">${m.error_message}</div>`
  : html`<p class="sc-lead">${orders ? html`Enter your mobile number. You&rsquo;ll confirm it with one quick text &mdash; no password, no account to create.` : html`<strong>For Sant&eacute; members only.</strong> Enter the mobile number you registered with to log in to your member dashboard. We&rsquo;ll text you a one-time code &mdash; no password needed.`}</p>`}
<form method="post" data-pp-busy-msg="Sending your code&hellip;">
<input type="hidden" name="action" value="request">
${nextField(m.next)}
<div class="fld">
<label for="contact">Mobile Number</label>
<div class="sc-phone${m.field_errors.contact ? " bad" : ""}"><span class="sc-phone-prefix">+63</span><input id="contact" class="sc-phone-input" type="tel" name="contact" inputmode="numeric" autocomplete="tel-national" placeholder="9XX XXX XXXX" data-pp-phone required${m.field_errors.contact ? safe(' aria-invalid="true" aria-describedby="contact-msg"') : ""}></div>
${m.field_errors.contact ? html`<p class="err" id="contact-msg">${m.field_errors.contact}</p>` : ""}
</div>
<button class="btn" type="submit" data-pp-busy-label="Sending OTP&hellip;">Send Verification Code</button>
</form>
</div>`;
}

export const SIGN_IN_SCRIPTS = ["js/pack-phone.js", "js/pack-otp.js", "js/pack-busy.js", "js/pack-code-timer.js"];

export function signInDocument(v: Chrome, m: SignInModel): Markup {
  return memberDocument(v, {
    title: m.next === "orders" ? "Track Your Orders" : "Member Login",
    member: null,
    current: "",
    content: signInBody(m),
    scripts: SIGN_IN_SCRIPTS,
  });
}

/* ---- the dashboard home ------------------------------------------------------------------------ */

export function homeDocument(v: Chrome, memberName: string, panels: Markup = html``, scripts: string[] = []): Markup {
  const content = html`<div class="pd" id="pp-dash-home">
<div class="acct-hero">
  <div class="acct-hero-id">
    <span class="acct-hero-ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg></span>
    <div class="acct-hero-idtext">
      <h1>Dashboard</h1>
      <div class="acct-hero-sub"><span>Signed in as <strong>${memberName}</strong></span></div>
    </div>
  </div>
</div>
${panels}
</div>`;
  return memberDocument(v, { title: "Dashboard", member: memberName, current: "home", content, scripts });
}
