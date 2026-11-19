/* The buyer portal pages: the sign-in and the read-only orders, for a paid Membership Pack buyer of a Santé site that is off.
   They reuse the Santé member shell (member-base-css.ts, the same sheets and the same sign-in markup as /dashboard/sign-in/),
   with the light-blue focus sheet (pack-focus.css), never gold. The bar holds the logo and Logout only and there is no
   footer: no link goes to a page that is not open. No text is added beyond the banner the API sends and the neutral line
   "This store is not taking orders."; every other word is the API's (labels, lines) or a caption of the dashboard's cards.
   Only the contract's fields are drawn (src/lib/portal-api.ts); a field the API adds is not shown. */
import { asset } from "../../lib/assets.ts";
import { html, safe, type Markup } from "../../lib/html.ts";
import type { PortalCard, PortalOrders, PortalSite } from "../../lib/portal-api.ts";
import { MEMBER_BASE_CSS } from "./member-base-css.ts";
import { signInDocument, signInModel, SIGN_IN_SCRIPTS, type Chrome, type SignInModel } from "./member.ts";
import { shortDate } from "./pack-orders.ts";
import { money } from "./shop-shell.ts";

export const PORTAL_PATH = "/portal/";
export const ORDERS_PATH = "/portal/orders/";
export const PORTAL_NEUTRAL_LINE = "This store is not taking orders.";

function bar(signedIn: boolean): Markup {
  return html`<nav class="pdn" id="pdn"><div class="pdn-inner">
    <a href="${PORTAL_PATH}" class="pdn-logo"><img src="${asset("img/navbar-logo.webp")}" alt="Santé International"></a>
    ${signedIn ? html`<div class="pdn-actions"><form method="post" action="/portal/sign-out/" class="pdn-out"><button type="submit">Logout</button></form></div>` : ""}
  </div></nav>`;
}

const banner = (text: string): Markup => (text ? html`<div class="note info" role="status">${text}</div>` : html``);

export function portalDocument(site: PortalSite, args: { title: string; signedIn: boolean; content: Markup; scripts: string[] }): Markup {
  const accent = /^#[0-9a-fA-F]{3,8}$/.test(site.accent_color) ? site.accent_color : "";
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${args.title} | ${site.display_name}</title>
<style>${safe(MEMBER_BASE_CSS)}</style>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700;800&amp;display=swap">
<link rel="stylesheet" href="${asset("css/pack-landing.min.css")}">
<link rel="stylesheet" href="${asset("css/pack-registration.css")}">
<link rel="stylesheet" href="${asset("css/pack-dashboard-shell.css")}">
<link rel="stylesheet" href="${asset("css/pack-dashboard.css")}">
<link rel="stylesheet" href="${asset("css/pack-focus.css")}">
</head>
<body>
<div class="e4"${accent ? html` style="--accent:${accent}"` : ""}>
${bar(args.signedIn)}
${args.signedIn ? html`<div class="shell"><main class="main">${args.content}</main></div>` : html`<main class="wrap">${args.content}</main>`}
${args.scripts.map((s) => html`<script src="${asset(s)}"></script>`)}
</div>
</body>
</html>
`;
}

/* ---- sign-in: the dashboard's own card, taken from its document so the two never drift apart -------------------- */

const NO_CHROME: Chrome = {
  store_name: "", accent_color: "", free_shipping_banner: false, year: 0, policy_links: [],
  biz: { registered_name: "", dti_business_number: "", tin: "", contact_email: "", contact_mobile: "", contact_mobile_raw: "", has_seal: false },
};

export function signInContent(m: SignInModel): Markup {
  const page = signInDocument(NO_CHROME, m).value;
  const start = page.indexOf('<main class="wrap">');
  const end = page.indexOf("</main>", start);
  if (start < 0 || end < 0) throw new Error("the sign-in document has no main block");
  return safe(page.slice(start + '<main class="wrap">'.length, end));
}

export function portalSignInDocument(site: PortalSite, m: SignInModel): Markup {
  return portalDocument(site, {
    title: "Track Your Orders", signedIn: false, scripts: SIGN_IN_SCRIPTS,
    content: html`<div class="portal-sign-in">${banner(site.banner)}${signInContent({ ...m, next: "orders" })}</div>`,
  });
}

export { signInModel };

/* ---- the orders ----------------------------------------------------------------------------------------------------- */

function card(c: PortalCard): Markup {
  const m = c.registration;
  return html`<div class="oc-card">
  <div class="oc-top">
    <div><div class="oc-ref">${c.order_number}</div><div class="oc-date">Placed ${shortDate(c.created_at)}</div></div>
    <div class="oc-total"><span>${c.payment_method_label} &middot; ${c.payment_label}</span>&#8369;${c.total_text}</div>
  </div>
  <div class="oc-track">
    ${c.steps.map((s) => html`<div class="oc-track-step is-${s.status}">
      <div class="oc-track-dot">${s.status === "done" ? html`&#10003;` : s.status === "current" ? html`<span class="oc-track-pip"></span>` : s.num}</div>
      <div class="oc-track-label">${s.label}</div>
      ${s.date && shortDate(s.date, false) ? html`<div class="oc-track-date">${shortDate(s.date, false)}</div>` : ""}
    </div>`)}
  </div>
  ${c.courier || c.tracking ? html`<div class="oc-courier">${c.courier ? html`Shipping via <strong>${c.courier}</strong>` : ""}${c.tracking ? html`${c.courier ? html` &middot; ` : ""}Tracking# ${c.tracking}` : ""}</div>` : ""}
  ${c.proofs.length ? html`<div class="oc-detail"><div class="oc-dcard">${c.proofs.map((p) => html`<div class="oc-drow"><span><a href="/portal/proof/${p.id}/" target="_blank" rel="noopener">Payment proof ${p.seq}</a></span><b>&#8369;${money(p.amount_sent_centavos)}${p.reference_number ? html` &middot; ${p.reference_number}` : ""}</b></div>`)}</div></div>` : ""}
  ${m ? html`<div class="oc-member">
    <div class="oc-member-body">
      <p><strong>${m.label}</strong></p>
      <p>${m.line}</p>
    </div>
  </div>` : ""}
</div>`;
}

export function ordersDocument(site: PortalSite, orders: PortalOrders): Markup {
  const content = html`<div class="pd" id="pp-dash-orders">
${banner(orders.banner)}
<div class="acct-hero"><div class="acct-hero-id"><div class="acct-hero-idtext"><h1>My Orders</h1></div></div></div>
<div class="oc-list">${orders.cards.map(card)}</div>
</div>`;
  return portalDocument(site, { title: "My Orders", signedIn: true, content, scripts: [] });
}
