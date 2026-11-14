/* The member dashboard's own pages: the Announcements & promos panel and the two slots on the Home, the placeholder pages
   (Training, Media Library, Affiliate Hub, Orders) and the My Purchases heading. Plain markup, no script. */
import { html, type Markup } from "../../lib/html.ts";
import type { Notice } from "../../lib/notices-api.ts";
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

/** Where "next live training" and "pick up where you left off" go once M3 fills them: empty markers, nothing visible now. */
export const HOME_SLOTS: Markup = html`<div data-slot="next-live-training"></div><div data-slot="pick-up-where-you-left-off"></div>`;

/** A page heading in the Santé hero style. */
export function pageHero(title: string, sub: string): Markup {
  return html`<div class="acct-hero"><div class="acct-hero-id"><div class="acct-hero-idtext"><h1>${title}</h1>${sub ? html`<div class="acct-hero-sub"><span>${sub}</span></div>` : ""}</div></div></div>`;
}

export const SOON = "This page is coming soon.";
export const APP_ORDERS_LINE = "Your orders are placed and tracked in the Santé Mobile App.";

/** Training and Media Library until their tasks land. */
export function soonContent(title: string): Markup {
  return html`<div class="pd md-plain" data-md-page="soon">${pageHero(title, "")}<section class="md-card"><p>${SOON}</p></section></div>`;
}

/** Orders and Affiliate Hub: the app line, with the app button when the link is set. No earnings, no referral link. */
export function appOrdersContent(title: string, appUrl: string): Markup {
  return html`<div class="pd md-plain" data-md-page="app-orders">${pageHero(title, "")}<section class="md-card">
  <p>${APP_ORDERS_LINE}</p>
  ${appUrl ? html`<p><a href="${appUrl}" class="btn md-app-btn" rel="noopener" target="_blank">Open the Sant&eacute; Mobile App</a></p>` : ""}
</section></div>`;
}

export function purchasesHero(): Markup {
  return pageHero("My Purchases", "Your Membership Pack payment and registration.");
}
