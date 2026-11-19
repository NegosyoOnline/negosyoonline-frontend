/* The customer-first member Home, /dashboard/ (ClickUp z8uq9mgmjg, Coach Ed's direction of 2026-11-19), and the pieces the
   My Membership and Help pages share.

   Sections, in order: A welcome and the membership-package order card, B membership benefits, C Explore Santé products,
   D getting started, E Need Help?, F the Earn with Santé invitation. Notices sit below A and B, never above the order card.
   Everything shown is real data from the existing reads (member/orders, member/pack, the catalog, the site's own contact
   details); a missing read gets a truthful state. No cart, Buy Now, Add to Cart or Buy Again, no Packed step, no link into the
   membership funnel (the Membership Terms PDF is the central agreement route), no invented price, percentage, date or ETA.
   Member prices are not written on Home, as on the member product page: members see "Check member prices in the Santé Mobile App". */
import { html, safe, type Markup } from "../../lib/html.ts";
import type { OrderCard, OrderStep } from "../../lib/pack-api.ts";
import type { CatalogProduct } from "../../lib/shop-api.ts";
import { shortDate } from "./pack-orders.ts";
import { HELP_PATH, MEMBERSHIP_PATH, PURCHASES_PATH } from "./member.ts";
import { PRODUCT_PLACEHOLDER, php, safeImage } from "./shop-shell.ts";

export const HOME_PRODUCTS_MAX = 4;
export const AGREEMENT_PDF_PATH = "/funnel/membership-pack/membership-terms.pdf";
export const TRAINING_ENTRY_PATH = "/dashboard/training/";

/* The approved membership statements: Coach Ed's funnel copy (views/sante/pack-landing.ts), quoted unchanged. */
export const LIFETIME_LINE = "Lifetime Membership";
export const NO_FEES_LINE = "No renewal fees. No monthly quotas. No maintenance purchases.";
export const APP_PRICES_LINE = "Member prices are shown in the Santé Mobile App.";
export const APP_PRICES_CHECK = "Check member prices in the Santé Mobile App";
export const NO_APP_LINK_LINE = "Ask us for the Santé Mobile App link.";
export const ORDER_ERROR = "We couldn't load your order update";

/** The terms link: the central agreement PDF of the current version, or nothing when no version is known. */
export const termsHref = (versionId: number | null | undefined): string => (typeof versionId === "number" && versionId > 0 ? `${AGREEMENT_PDF_PATH}?v=${versionId}` : "");

export type OrdersRead = { state: "ok"; cards: OrderCard[] } | { state: "failed" };
export type RegistrationInfo = { label: string; line: string; registered: boolean; member_id: string; act: boolean };
export type Contacts = { email: string; mobile: string; mobile_raw: string };
export type HomeInput = {
  first_name: string;
  orders: OrdersRead;
  registration: RegistrationInfo | null;
  app_url: string;
  terms_href: string;
  /** null: the catalog could not be read, or the shop is off. */
  products: CatalogProduct[] | null;
  notices: Markup;
  contacts: Contacts;
};

/* ---- which order, which state ------------------------------------------------------------------------------ */

const KNOWN_PAYMENT = ["pending_review", "rejected", "verified", "awaiting_xendit", "xendit_expired", "xendit_mismatch"];
const FAILED_PAYMENT = ["rejected", "xendit_expired", "xendit_mismatch"];

export type OrderState = "action" | "review" | "active" | "delivered" | "unknown";

/** The step at a fixed place of the card's four (Placed, Verified, Shipped, Delivered); the backend has no Packed step. */
function step(c: OrderCard, index: number): OrderStep | null {
  return c.steps[index] ?? null;
}
const stepDone = (c: OrderCard, index: number): boolean => step(c, index)?.state === "done";

export const isVerified = (c: OrderCard): boolean => c.payment_status === "verified";
export const isShipped = (c: OrderCard): boolean => isVerified(c) && (stepDone(c, 2) || stepDone(c, 3));
export const isDelivered = (c: OrderCard): boolean => isVerified(c) && stepDone(c, 3);

export function stateOf(c: OrderCard): OrderState {
  if (!KNOWN_PAYMENT.includes(c.payment_status)) return "unknown"; // the bank backend may add statuses: neutral, never a success
  if (FAILED_PAYMENT.includes(c.payment_status) || c.payment_status === "awaiting_xendit" || c.problem) return "action";
  if (c.payment_status === "pending_review") return "review";
  if (c.membership?.act) return "action"; // paid, and the registration details are still to be sent
  return isDelivered(c) ? "delivered" : "active";
}

const stamp = (c: OrderCard): number => Date.parse(c.created_at) || 0;
const RANK: Record<OrderState, number> = { action: 0, review: 1, active: 1, unknown: 1, delivered: 2 };

/** A purchase needing action; else an active (undelivered) purchase; else the latest. Newest first inside each group. */
export function pickOrder(cards: OrderCard[]): { card: OrderCard; state: OrderState } | null {
  const rows = cards.map((card) => ({ card, state: stateOf(card) }));
  rows.sort((a, b) => RANK[a.state] - RANK[b.state] || stamp(b.card) - stamp(a.card));
  return rows[0] ?? null;
}

/** The date of the latest dated step on the card (a real status change); the placed date when no later step has one. */
export function lastUpdated(c: OrderCard): string {
  const dated = c.steps.filter((s) => s.state === "done" && s.date && Number.isFinite(Date.parse(s.date)));
  const latest = [...dated].sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0];
  return shortDate(latest ? latest.date : c.created_at);
}

/* ---- small parts ------------------------------------------------------------------------------------------- */

const ICON = (d: string): Markup => html`<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${safe(d)}</svg>`;
const I = {
  box: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4.5"/><path d="M12 17.5h.01"/>',
};
export const icons = { ICON, I };

type Tone = "ok" | "wait" | "warn" | "plain";
type Line = { key: "payment" | "shipment" | "registration"; title: string; text: string; tone: Tone; extra?: Markup; cta?: { href: string; label: string } };
const LINE_LABEL = { payment: "Payment", shipment: "Shipment", registration: "Membership registration" } as const;

const toneMark = (t: Tone): string => (t === "ok" ? "✓" : t === "warn" ? "!" : t === "wait" ? "…" : "•");

function lineMarkup(l: Line): Markup {
  return html`<li class="mh-line mh-tone-${l.tone}" data-mh-line="${l.key}">
    <span class="mh-line-dot" aria-hidden="true">${toneMark(l.tone)}</span>
    <div class="mh-line-body">
      <div class="mh-line-head"><span class="mh-line-k">${LINE_LABEL[l.key]}</span><strong>${l.title}</strong></div>
      <p>${l.text}</p>
      ${l.extra ?? ""}
      ${l.cta ? html`<a class="mh-link" href="${l.cta.href}">${l.cta.label} &rarr;</a>` : ""}
    </div>
  </li>`;
}

/* ---- the three separate lines: payment, shipment, registration ---------------------------------------------- */

export function paymentLine(c: OrderCard): Line {
  const mine = (title: string, text: string, tone: Tone, cta?: Line["cta"]): Line => ({ key: "payment", title, text, tone, cta });
  const own = c.problem_line;
  switch (c.payment_status) {
    case "verified":
      return mine("Payment confirmed", "The store verified your payment.", "ok");
    case "pending_review":
      return mine("Payment under review", "We received your payment details and the store is checking them. Sending proof is not payment confirmation: your package is prepared once the payment is confirmed.", "wait");
    case "awaiting_xendit":
      return mine("Waiting for your payment", "Your order is placed, but the payment is not complete yet.", "warn", { href: PURCHASES_PATH, label: "Complete my payment" });
    case "xendit_expired":
      return mine("Payment link expired", own || "The payment was not completed in time. Open My Purchases for the next step, or contact us with your order number.", "warn", { href: PURCHASES_PATH, label: "See what to do next" });
    case "xendit_mismatch":
      return mine("Payment needs attention", own || "The amount received did not match your order. Contact us with your order number and we will help.", "warn", { href: `${HELP_PATH}#order`, label: "Get help with my order" });
    case "rejected":
      return mine("Payment needs attention", own || "The store could not verify your payment. You can send new proof of payment.", "warn", { href: PURCHASES_PATH, label: "Send new proof of payment" });
    default:
      return mine("We're checking your order", "We can't show the payment status of this order right now. If this stays, contact us with your order number.", "plain", { href: `${HELP_PATH}#order`, label: "Get help with my order" });
  }
}

const trackingBlock = (c: OrderCard): Markup => {
  const shippedOn = step(c, 2)?.date ? shortDate(step(c, 2)!.date) : "";
  return html`<dl class="mh-facts mh-ship">
    ${c.courier ? html`<div><dt>Courier</dt><dd>${c.courier}</dd></div>` : ""}
    ${c.tracking ? html`<div><dt>Tracking number</dt><dd><span class="mh-track" data-mh-tracking>${c.tracking}</span> <button type="button" class="mh-copy" data-mh-copy="${c.tracking}" hidden>Copy</button></dd></div>` : ""}
    ${shippedOn ? html`<div><dt>Shipped on</dt><dd>${shippedOn}</dd></div>` : ""}
  </dl>${c.tracking ? "" : html`<p class="mh-note">Tracking will appear once the store provides it.</p>`}`;
};

export function shipmentLine(c: OrderCard): Line {
  const mine = (title: string, text: string, tone: Tone, extra?: Markup): Line => ({ key: "shipment", title, text, tone, extra });
  if (!KNOWN_PAYMENT.includes(c.payment_status)) return mine("Updates will appear here", "We will show your shipment as soon as we can read your order.", "plain");
  if (!isVerified(c)) return mine("Not started", "Shipping starts after your payment is confirmed.", "plain");
  if (isDelivered(c)) {
    const on = step(c, 3)?.date ? shortDate(step(c, 3)!.date) : "";
    return mine("Delivered", on ? `Your package was delivered on ${on}.` : "Your package was delivered.", "ok");
  }
  if (isShipped(c)) return mine("Shipped", "Your package is on its way.", "ok", trackingBlock(c));
  return mine("Being prepared", "The store is preparing your package. Courier and tracking details appear here once it ships.", "wait");
}

export function registrationLine(c: OrderCard): Line {
  const mine = (title: string, text: string, tone: Tone, extra?: Markup, cta?: Line["cta"]): Line => ({ key: "registration", title, text, tone, extra, cta });
  if (!KNOWN_PAYMENT.includes(c.payment_status)) return mine("Updates will appear here", "We will show your registration as soon as we can read your order.", "plain");
  if (!isVerified(c)) return mine("Not started", "Membership registration opens once your payment is confirmed.", "plain");
  const m = c.membership;
  if (!m) return mine("See My Membership", "Your membership registration is shown under My Membership.", "plain", undefined, { href: MEMBERSHIP_PATH, label: "Open My Membership" });
  const id = m.registered && m.sante_member_id ? html`<p class="mh-id">Official Santé Member ID <strong>${m.sante_member_id}</strong></p>` : html``;
  return mine(m.label || (m.registered ? "Registered" : "Registration pending"), m.line, m.registered ? "ok" : m.act ? "warn" : "wait", id, m.act ? { href: PURCHASES_PATH, label: "Complete my registration" } : undefined);
}

/* ---- A: welcome and the order card ------------------------------------------------------------------------- */

export const viewOrderHref = (c: OrderCard): string => `${PURCHASES_PATH}#order-${encodeURIComponent(c.order_number)}`;

function welcome(first: string, sub: string): Markup {
  return html`<header class="mh-welcome"><h1>${first ? html`Welcome to Sant&eacute;, ${first}!` : html`Welcome to Sant&eacute;!`}</h1>${sub ? html`<p>${sub}</p>` : ""}</header>`;
}

function itemSummary(c: OrderCard): string {
  const lines = c.item_lines.filter((l) => l.name).map((l) => `${l.qty > 1 ? `${l.qty} × ` : ""}${l.name}`);
  return lines.length ? lines.join(", ") : c.headline;
}

const allLink = (others: number): Markup => (others > 0 ? html`<a class="mh-link" href="${PURCHASES_PATH}">All my purchases (${others + 1}) &rarr;</a>` : html``);

function orderCardFull(c: OrderCard, state: OrderState, others: number): Markup {
  const verified = isVerified(c);
  return html`<section class="mh-card mh-order" id="mh-order" data-mh-state="${state}" aria-labelledby="mh-order-h">
  <div class="mh-card-head"><span class="mh-ic" aria-hidden="true">${ICON(I.box)}</span><h2 id="mh-order-h">Your Membership Package</h2>${c.chip_label ? html`<span class="mh-chip">${c.chip_label}</span>` : ""}</div>
  <dl class="mh-facts">
    <div><dt>Order reference</dt><dd>${c.order_number}</dd></div>
    <div><dt>Purchased</dt><dd>${shortDate(c.created_at) || "—"}</dd></div>
    <div><dt>Package</dt><dd>${itemSummary(c) || "—"}</dd></div>
    <div><dt>${verified ? "Amount paid" : "Order total"}</dt><dd>&#8369;${c.total}</dd></div>
  </dl>
  <ul class="mh-lines">${lineMarkup(paymentLine(c))}${lineMarkup(shipmentLine(c))}${lineMarkup(registrationLine(c))}</ul>
  <p class="mh-updated">Last updated ${lastUpdated(c)}</p>
  <div class="mh-actions"><a class="mh-btn mh-btn-primary" href="${viewOrderHref(c)}">View My Order</a>${allLink(others)}</div>
</section>`;
}

/** Delivered: a compact confirmation, the details one tap away. */
function orderCardCompact(c: OrderCard, others: number): Markup {
  const on = step(c, 3)?.date ? shortDate(step(c, 3)!.date) : "";
  return html`<section class="mh-card mh-order mh-compact" id="mh-order" data-mh-state="delivered" aria-labelledby="mh-order-h">
  <div class="mh-card-head"><span class="mh-ic" aria-hidden="true">${ICON(I.box)}</span><h2 id="mh-order-h">Your Membership Package</h2><span class="mh-chip mh-chip-ok">Delivered</span></div>
  <p class="mh-compact-line">Order <strong>${c.order_number}</strong> was delivered${on ? html` on ${on}` : ""}. Amount paid &#8369;${c.total}.</p>
  <div class="mh-actions"><a class="mh-btn" href="${viewOrderHref(c)}">View My Order</a>${allLink(others)}</div>
</section>`;
}

function orderError(): Markup {
  return html`<section class="mh-card mh-order mh-card-warn" id="mh-order" data-mh-state="error" role="alert" aria-labelledby="mh-order-h">
  <div class="mh-card-head"><span class="mh-ic" aria-hidden="true">${ICON(I.box)}</span><h2 id="mh-order-h">${ORDER_ERROR}</h2></div>
  <p>Your order is safe. We just can't show its update right now.</p>
  <div class="mh-actions"><a class="mh-btn mh-btn-primary" href="/dashboard/" data-mh-retry>Retry</a><a class="mh-btn" href="${PURCHASES_PATH}">My Purchases</a><a class="mh-link" href="${HELP_PATH}">Help &rarr;</a></div>
</section>`;
}

function orderNone(): Markup {
  return html`<section class="mh-card mh-order mh-compact" id="mh-order" data-mh-state="none" aria-labelledby="mh-order-h">
  <div class="mh-card-head"><span class="mh-ic" aria-hidden="true">${ICON(I.box)}</span><h2 id="mh-order-h">Your Membership Package</h2></div>
  <p class="mh-compact-line">There is no membership package purchase on this account. If you expected one, contact us with your order number.</p>
  <div class="mh-actions"><a class="mh-btn" href="${HELP_PATH}#order">Get help with an order</a></div>
</section>`;
}

/* ---- B: membership card ------------------------------------------------------------------------------------ */

export function membershipCard(reg: RegistrationInfo | null, appUrl: string, terms: string, hasOrder: boolean): Markup {
  const status = reg
    ? html`<p class="mh-reg"><strong>${reg.label || (reg.registered ? "Registered" : "Registration pending")}</strong></p>${reg.line ? html`<p>${reg.line}</p>` : ""}`
    : hasOrder ? html`<p class="mh-reg"><strong>Registration not started</strong></p><p>Membership registration opens once your payment is confirmed.</p>`
    : html`<p>Your membership details are not available right now. <a class="mh-link" href="${HELP_PATH}#membership">Ask us</a> if you need them.</p>`;
  const id = reg?.registered && reg.member_id
    ? html`<p class="mh-id">Official Santé Member ID <strong>${reg.member_id}</strong></p>`
    : html`<p class="mh-muted">Your official Santé Member ID appears here once your registration is complete. <a class="mh-link" href="${HELP_PATH}#membership">Need help?</a></p>`;
  return html`<section class="mh-card mh-member" id="mh-member" aria-labelledby="mh-member-h">
  <div class="mh-card-head"><span class="mh-ic" aria-hidden="true">${ICON(I.shield)}</span><h2 id="mh-member-h">Your Membership Benefits</h2></div>
  ${status}${id}
  <ul class="mh-ticks"><li><strong>${LIFETIME_LINE}</strong></li><li>${NO_FEES_LINE}</li><li>${APP_PRICES_LINE}</li></ul>
  <div class="mh-actions"><a class="mh-btn mh-btn-primary" href="${MEMBERSHIP_PATH}#how-to-use">How to Use My Membership</a>
    ${appUrl ? html`<a class="mh-btn" href="${appUrl}" rel="noopener" target="_blank">Open Sant&eacute; Mobile App</a>` : ""}
    ${terms ? html`<a class="mh-link" href="${terms}" target="_blank" rel="noopener">View Membership Terms &rarr;</a>` : ""}</div>
</section>`;
}

/* ---- C: Explore Santé products ----------------------------------------------------------------------------- */

const cut = (text: string, max: number): string => { const t = text.trim(); return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`; };

export function productTile(p: CatalogProduct): Markup {
  const image = safeImage(p.image_url);
  const pack = typeof p.servings_per_pack === "number" && p.servings_per_pack > 0 ? `${p.servings_per_pack} serving${p.servings_per_pack === 1 ? "" : "s"} per pack` : "";
  return html`<article class="mh-prod" data-mh-product="${p.code}">
    <a class="mh-prod-img" href="/products/${p.code}/" tabindex="-1" aria-hidden="true">${image ? html`<img src="${image}" alt="" loading="lazy">` : PRODUCT_PLACEHOLDER}</a>
    <h3><a href="/products/${p.code}/">${p.name}</a></h3>
    ${pack ? html`<p class="mh-prod-pack">${pack}</p>` : ""}
    ${p.short_description ? html`<p class="mh-prod-desc">${cut(p.short_description, 100)}</p>` : ""}
    ${p.srp_centavos > 0 ? html`<p class="mh-prod-price">${php(p.srp_centavos)}</p>` : ""}
    <p class="mh-muted mh-prod-app">${APP_PRICES_CHECK}</p>
    <a class="mh-btn" href="/products/${p.code}/">View Product</a>
  </article>`;
}

export function exploreSection(products: CatalogProduct[] | null, appUrl: string): Markup {
  const shown = (products ?? []).slice(0, HOME_PRODUCTS_MAX);
  return html`<section class="mh-sect" id="mh-explore" aria-labelledby="mh-explore-h">
  <div class="mh-sect-head"><h2 id="mh-explore-h">Explore Sant&eacute; products</h2>${shown.length ? html`<a class="mh-link" href="/products/">Explore All Products &rarr;</a>` : ""}</div>
  ${shown.length ? html`<div class="mh-prods">${shown.map(productTile)}</div>` : html`<div class="mh-card mh-empty" data-mh-empty="products">
    <p>${products === null ? "We can't show products right now." : "No products are listed here yet."} Members order in the Sant&eacute; Mobile App.</p>
    <div class="mh-actions">${appUrl ? html`<a class="mh-btn mh-btn-primary" href="${appUrl}" rel="noopener" target="_blank">Open Sant&eacute; Mobile App</a>` : html`<span class="mh-muted">${NO_APP_LINK_LINE}</span>`}<a class="mh-link" href="/products/">Explore All Products &rarr;</a></div></div>`}
</section>`;
}

/* ---- D: getting started ------------------------------------------------------------------------------------- */

/** The catalog products that appear among the purchased items, by name. */
export function purchasedProducts(c: OrderCard | null, products: CatalogProduct[] | null): CatalogProduct[] {
  if (!c || !products) return [];
  const names = [c.headline, ...c.item_lines.map((l) => l.name)].map((n) => n.toLowerCase()).filter(Boolean);
  return products.filter((p) => p.name && names.some((n) => n.includes(p.name.toLowerCase()))).slice(0, 3);
}

export function gettingStarted(c: OrderCard | null, products: CatalogProduct[] | null, appUrl: string): Markup {
  const mine = purchasedProducts(c, products);
  return html`<section class="mh-sect" id="mh-start" aria-labelledby="mh-start-h">
  <div class="mh-sect-head"><h2 id="mh-start-h">Getting started with your products</h2></div>
  <div class="mh-two">
    <div class="mh-card" data-mh-guide="app">
      <h3>Using the Sant&eacute; Mobile App</h3>
      <ol class="mh-steps"><li>${appUrl ? html`Open the <a href="${appUrl}" rel="noopener" target="_blank">Sant&eacute; Mobile App</a>.` : html`Get the Sant&eacute; Mobile App. ${NO_APP_LINK_LINE}`}</li><li>${APP_PRICES_LINE}</li><li>Place your member orders in the app. This website shows your membership package and product information.</li></ol>
    </div>
    <div class="mh-card" data-mh-guide="products">
      <h3>Your products</h3>
      ${mine.length ? html`<ul class="mh-list">${mine.map((p) => html`<li><strong>${p.name}</strong><br><a class="mh-link" href="/products/${p.code}/">${(p.faq?.length || p.category_faq?.length) ? "Read the FAQs and product details" : "View product details"} &rarr;</a></li>`)}</ul>`
        : html`<p>Product details and common questions are on each product page.</p><a class="mh-link" href="/products/">Browse product details &rarr;</a>`}
      <p><a class="mh-link" href="${HELP_PATH}#product">Ask a product question &rarr;</a></p>
    </div>
  </div>
</section>`;
}

/* ---- E: Need Help? ------------------------------------------------------------------------------------------ */

export function helpBlock(ct: Contacts): Markup {
  return html`<section class="mh-sect" id="mh-help" aria-labelledby="mh-help-h">
  <div class="mh-card">
    <div class="mh-card-head"><span class="mh-ic" aria-hidden="true">${ICON(I.help)}</span><h2 id="mh-help-h">Need help?</h2></div>
    <div class="mh-actions"><a class="mh-btn" href="${HELP_PATH}#order">About my order</a><a class="mh-btn" href="${HELP_PATH}#membership">Membership or app setup</a><a class="mh-btn" href="${HELP_PATH}#product">A product question</a></div>
    ${ct.email || ct.mobile ? html`<p class="mh-contact">${ct.email ? html`<a class="mh-link" href="mailto:${ct.email}">${ct.email}</a>` : ""}${ct.email && ct.mobile ? " · " : ""}${ct.mobile ? html`<a class="mh-link" href="tel:${ct.mobile_raw}">${ct.mobile}</a>` : ""}</p>` : ""}
  </div>
</section>`;
}

/* ---- F: Earn with Santé ------------------------------------------------------------------------------------- */

export function earnInvite(): Markup {
  return html`<section class="mh-sect mh-earn" id="mh-earn" aria-labelledby="mh-earn-h">
  <div class="mh-card mh-card-soft"><h2 id="mh-earn-h">Interested in sharing Sant&eacute;?</h2><p>Explore the business opportunity when you're ready.</p><a class="mh-btn" href="${TRAINING_ENTRY_PATH}">Explore Ways to Earn</a></div>
</section>`;
}

/* ---- the Home ----------------------------------------------------------------------------------------------- */

function registrationOf(i: HomeInput, card: OrderCard | null): RegistrationInfo | null {
  if (i.registration) return i.registration;
  const m = card?.membership;
  return m ? { label: m.label, line: m.line, registered: m.registered, member_id: m.sante_member_id, act: m.act } : null;
}

/** The Home body. Emphasis follows the order's state: before delivery the order card is first and largest; once delivered, or with
    no active package, membership use, product guidance and product discovery come first. */
export function homeBody(i: HomeInput): Markup {
  const picked = i.orders.state === "ok" ? pickOrder(i.orders.cards) : null;
  const others = i.orders.state === "ok" ? Math.max(0, i.orders.cards.length - 1) : 0;
  const card = picked?.card ?? null;
  const returning = !picked || picked.state === "delivered";
  const sub = !picked ? "Here is your membership at a glance."
    : picked.state === "delivered" ? "Your package has arrived. Here is how to enjoy your membership."
    : isVerified(picked.card) ? "Thank you for purchasing your membership package."
    : "Here is where your membership package stands.";
  const a = i.orders.state === "failed" ? orderError() : !picked ? orderNone() : picked.state === "delivered" ? orderCardCompact(picked.card, others) : orderCardFull(picked.card, picked.state, others);
  const b = membershipCard(registrationOf(i, card), i.app_url, i.terms_href, !!card);
  const explore = exploreSection(i.products, i.app_url);
  const start = gettingStarted(card, i.products, i.app_url);
  return html`${welcome(i.first_name, sub)}
<div class="mh-top${returning ? " mh-top-returning" : ""}">${a}${b}</div>
${i.notices}
${returning ? html`${start}${explore}` : html`${explore}${start}`}
${helpBlock(i.contacts)}
${earnInvite()}`;
}
