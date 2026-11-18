/* The member dashboard's own pages: the Announcements & promos panel and the placeholder pages
   (Media Library, Affiliate Hub, Orders) and the My Purchases heading. Plain markup, no script. */
import { html, type Markup } from "../../lib/html.ts";
import type { Notice } from "../../lib/notices-api.ts";
import { SECTIONS } from "./member.ts";
import { safeImage } from "./shop-shell.ts";

const manila = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric" });

function when(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "" : manila.format(new Date(t));
}

/** "Nov 14, 2026", "From Nov 14, 2026", "Until Nov 20, 2026" or "Nov 14, 2026 to Nov 20, 2026" from a notice's window; "" when open. */
export function windowText(n: Pick<Notice, "starts_at" | "ends_at">): string {
  const a = when(n.starts_at);
  const b = when(n.ends_at);
  if (a && b) return `${a} to ${b}`;
  if (a) return `From ${a}`;
  if (b) return `Until ${b}`;
  return "";
}

/** The Announcements & promos panel. Nothing at all when there are no notices on now. */
export function noticesPanel(notices: Notice[]): Markup {
  if (notices.length === 0) return html``;
  return html`<section class="md-notices" id="md-notices" aria-labelledby="md-notices-h">
  <h2 id="md-notices-h">Announcements &amp; promos</h2>
  ${notices.map((n) => {
    const image = safeImage(n.image_url);
    const dates = windowText(n);
    return html`<article class="md-notice" data-notice-id="${n.id}">
    <span class="md-kind md-kind-${n.kind}">${n.kind === "promo" ? "Promo" : "Announcement"}</span>
    <h3>${n.title}</h3>
    ${image ? html`<img class="md-notice-img" src="${image}" alt="" loading="lazy">` : ""}
    ${n.body ? html`<p class="md-notice-body">${n.body}</p>` : ""}
    ${dates ? html`<p class="md-notice-dates">${dates}</p>` : ""}
  </article>`;
  })}
</section>`;
}

/** A page heading in the Santé hero style. */
export function pageHero(title: string, sub: string): Markup {
  return html`<div class="acct-hero"><div class="acct-hero-id"><div class="acct-hero-idtext"><h1>${title}</h1>${sub ? html`<div class="acct-hero-sub"><span>${sub}</span></div>` : ""}</div></div></div>`;
}

export const APP_ORDERS_LINE = "Your orders are placed and tracked in the Santé Mobile App.";

/** The Santé Mobile App button, only when the link is set. */
export function appButton(appUrl: string): Markup {
  return appUrl ? html`<p><a href="${appUrl}" class="btn md-app-btn" rel="noopener" target="_blank">Open the Sant&eacute; Mobile App</a></p>` : html``;
}

/** Affiliate Hub: the app line, with the app button when the link is set. No earnings, no referral link. */
export function appOrdersContent(title: string, appUrl: string): Markup {
  return html`<div class="pd md-plain" data-md-page="app-orders">${pageHero(title, "")}<section class="md-card">
  <p>${APP_ORDERS_LINE}</p>
  ${appButton(appUrl)}
</section></div>`;
}

export const NO_PURCHASE_LINE = "You have no Membership Pack purchase on this account yet.";

/** My Purchases for a member who has no Membership Pack order: one plain card, in the placeholder pages' style. */
export function noPurchaseCard(): Markup {
  return html`<section class="md-card" data-md-page="no-purchase"><p>${NO_PURCHASE_LINE}</p></section>`;
}

export function purchasesHero(): Markup {
  return pageHero("My Purchases", "Your Membership Pack payment and registration.");
}

const QUICK_KEYS = ["training", "media", "affiliate"];

/** "Explore your dashboard": the bottom of the Home, always. Labels and addresses come from the menu. */
export function quickLinks(): Markup {
  const links = SECTIONS.filter((s) => QUICK_KEYS.includes(s.key) && s.built);
  return html`<section class="md-card md-quick" data-md-page="quick-links" aria-labelledby="md-quick-h"><h2 id="md-quick-h">Explore your dashboard</h2>
  <p class="md-quick-row">${links.map((l) => html`<a class="tr-btn" href="${l.path}">${l.label}</a>`)}</p></section>`;
}
