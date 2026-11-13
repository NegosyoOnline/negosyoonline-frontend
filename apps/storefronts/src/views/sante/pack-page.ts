/* The Membership Pack page chrome: the document, the green top bar, the footer and the policy popup.

   Transcribed from TWCinc's negosyoonline_sante_pack/base.html, _top_bar.html, _footer.html, _policy_dialog.html and
   _icon.html. Markup, class names, text and order are the templates'. Different from them, on purpose:
   - asset links point at /assets/sante/ (src/lib/assets.ts);
   - the footer shows the owner's BIR badge through /business-seal/ when one is uploaded (Coach Ed, 2026-11-12). */
import { asset } from "../../lib/assets.ts";
import { html, type Markup } from "../../lib/html.ts";
import type { Pack, Site } from "../../lib/django.ts";
import { chrome, type Chrome } from "./member.ts";

/** What every pack page reads: the site chrome plus the page's own values (TWCinc's template context). */
export type PackCtx = Chrome & {
  cta: boolean;
  checkout_path: string;
  price: string;
  total: string;
  message: string;
  video_url: string;
  /* The Meta notice, or the Pixel's data block and script, just before </body> (src/lib/meta.ts). Set only for the
     landing and checkout pages. */
  tracking?: Markup;
};

export const LANDING_PATH = "/funnel/membership-pack/landing-page/";
export const CHECKOUT_PATH = "/funnel/membership-pack/checkout/";

/* TWCinc constants.py: why the order button is off. */
export const MSG_NOT_AVAILABLE = "Membership Pack checkout is not available yet.";
export const MSG_AGREEMENT_UNAVAILABLE = "Membership checkout is not available right now. Please check back soon.";

/* TWCinc's Bunny Stream embed of the landing video (constants.VIDEO_EMBED_URL, Coach Ed 2026-10-30). */
export const VIDEO_EMBED_URL =
  "https://player.mediadelivery.net/embed/744094/312f84cc-4cb6-41eb-bba6-5207f604817b" +
  "?autoplay=true&loop=true&muted=true&preload=true&responsive=true&playsinline=true&disableIosPlayer=true";

/** Centavos as the pages show them: "₱1,488.00". */
export function pesos(centavos: number): string {
  const whole = Math.floor(centavos / 100);
  return `\u20B1${whole.toLocaleString("en-US")}.${String(centavos % 100).padStart(2, "0")}`;
}

/** TWCinc's `landing` view context: the order button shows only when the pack can be bought; when it cannot, the
    message says which of the two reasons it is (no payment account to pay to, or no published agreement). */
export function packContext(site: Site, pack: Pack, now: Date = new Date()): PackCtx {
  const price = pesos(pack.price_centavos);
  return {
    ...chrome(site, now),
    cta: pack.available,
    checkout_path: CHECKOUT_PATH,
    price,
    total: price,
    message: pack.available ? "" : pack.payment_accounts.length === 0 ? MSG_NOT_AVAILABLE : MSG_AGREEMENT_UNAVAILABLE,
    video_url: VIDEO_EMBED_URL,
  };
}

export function topBar(): Markup {
  return html`
<div class="bg-[#03572d] text-white"><div class="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-2 px-5 py-2.5 tab:px-8 desk:flex-nowrap desk:py-3">
  <a href="/funnel/membership-pack/landing-page/" class="pp-brandlink flex shrink-0 items-center gap-3"><img src="${asset("img/sante-logo-white.webp")}" alt="Santé" width="402" height="96" class="h-6 w-auto shrink-0 tab:h-7 desk:h-8"></a>
  <ul class="flex w-full flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs font-semibold tab:gap-x-8 tab:text-sm desk:w-auto desk:flex-1 desk:justify-end desk:gap-x-10 desk:text-[0.9375rem]">
    <li class="inline-flex items-center gap-1.5 tab:gap-2.5"><svg viewBox="0 0 24 24" fill="${html`none`}" stroke="${html`currentColor`}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="h-4 w-4 shrink-0 tab:h-6 tab:w-6"><path d="M3 7h10v9H3zM13 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/></svg>Free Shipping Nationwide</li>
    <li class="inline-flex items-center gap-1.5 tab:gap-2.5"><svg viewBox="0 0 24 24" aria-hidden="true" class="h-4 w-4 shrink-0 tab:h-6 tab:w-6"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="m7.5 12.3 3 3 6-6.3" fill="none" stroke="#03572d" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>One-Time Purchase</li>
    <li class="inline-flex items-center gap-1.5 tab:gap-2.5"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" class="h-4 w-4 shrink-0 tab:h-6 tab:w-6"><path d="M12 21s-8.5-5.1-8.5-11.4A4.9 4.9 0 0 1 12 6.7a4.9 4.9 0 0 1 8.5 2.9C20.5 15.9 12 21 12 21z"/></svg>Lifetime Membership</li>
  </ul>
</div></div>
`;
}

export function footer(c: PackCtx): Markup {
  return html`
<footer class="footer">
  <div class="footer-inner">
    ${(c.biz.has_seal || c.biz.registered_name || c.biz.dti_business_number || c.biz.contact_email || c.biz.contact_mobile) ? html`
    <div class="footer-registration">
      <ul class="footer-reg-list">
        ${(c.biz.registered_name) ? html`<li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 21V6l8-3 8 3v15M9 21v-5h6v5M8 9h2M14 9h2M8 12.5h2M14 12.5h2"/></svg><div><span>Registered business</span>${c.biz.registered_name}</div></li>` : ""}
        ${(c.biz.dti_business_number) ? html`<li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l9-5 9 5M5 9v9M9.5 9v9M14.5 9v9M19 9v9M3 21h18M3 9h18"/></svg><div><span>DTI registration no.</span>${c.biz.dti_business_number}</div></li>` : ""}
        ${(c.biz.contact_email || c.biz.contact_mobile) ? html`<li class="footer-reg-contact"><div>
          ${(c.biz.contact_email) ? html`<a href="mailto:${c.biz.contact_email}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18v12H3zM3 7l9 6 9-6"/></svg>${c.biz.contact_email}</a>` : ""}
          ${(c.biz.contact_mobile) ? html`<a href="tel:${c.biz.contact_mobile_raw}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>${c.biz.contact_mobile}</a>` : ""}
        </div></li>` : ""}
      </ul>
      ${(c.biz.has_seal) ? html`<div class="footer-seal-box"><img class="footer-seal" src="/business-seal/" alt="BIR registered business seal" width="240" height="84"></div>` : ""}
    </div>
    ` : ""}
    <div class="footer-bottom">
      <div class="footer-meta">
        ${(c.policy_links.length > 0) ? html`<ul class="footer-legal-row">${c.policy_links.map((l) => html`<li><a href="${l.path}">${l.label}</a></li>`)}</ul>` : ""}
        <div class="footer-copyright">&#169; ${c.year} ${c.store_name}. All rights reserved.</div>
        <div class="footer-disclaimer">Products are for general wellness support only. Not intended to diagnose, treat, cure, or prevent any disease. Results may vary.</div>
      </div>
    </div>
  </div>
</footer>
`;
}

export function policyDialog(c: PackCtx): Markup {
  return html`
${(c.policy_links.length > 0) ? html`
<dialog class="pp-policy-dlg" id="pp-policy-dlg" aria-labelledby="pp-policy-dlg-title" data-policy-paths="${c.policy_links.map((l) => html`${l.path} `)}">
  <div class="pp-policy-dlg-head">
    <h2 id="pp-policy-dlg-title"></h2>
    <button type="button" class="pp-policy-dlg-close" id="pp-policy-dlg-close" aria-label="Close">&times;</button>
  </div>
  <div class="pp-policy-dlg-body" id="pp-policy-dlg-body" tabindex="0"></div>
</dialog>
<script src="${asset("js/pack-policy-popup.js")}"></script>
` : ""}
`;
}

/** A pack page: base.html. `head`, `afterShell` and `scripts` are its blocks of those names. */
export function packDocument(
  c: PackCtx,
  args: { title: string; content: Markup; head?: Markup; afterShell?: Markup; scripts?: string[]; noPolicyPopup?: boolean },
): Markup {
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${args.title} | ${c.store_name}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700;800&amp;display=swap">
<link rel="stylesheet" href="${asset("css/pack-select.css")}">
<link rel="stylesheet" href="${asset("css/pack-landing.min.css")}">
<link rel="stylesheet" href="${asset("css/pack-footer.min.css")}">
<link rel="stylesheet" href="${asset("css/pack-forms.css")}">
<link rel="stylesheet" href="${asset("css/pack-registration.css")}">
<link rel="stylesheet" href="${asset("css/pack-focus.css")}">
${args.head ?? ""}
</head>
<body class="pp-pack">
<div class="pb pp-shell">
${topBar()}
<main class="pp-main">${args.content}</main>
${footer(c)}
</div>
${args.afterShell ?? ""}
${args.noPolicyPopup ? "" : policyDialog(c)}
${(args.scripts ?? []).map((s) => html`<script src="${asset(s)}"></script>`)}
${c.tracking ?? ""}
</body>
</html>
`;
}
