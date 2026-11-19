/* The member Home, /dashboard/ (ClickUp z8uq9mgmjg, v3 redesign: Coach Ed's approved visual reference of 2026-11-19), and the pieces the
   My Membership and Help pages share.

   Layout, top to bottom: the welcome line; the membership-package order card (62%) beside the emerald membership card (38%);
   "Discover more from Santé" with up to four real catalog products; two guidance tiles; the support strip with the secondary
   earning invitation. Notices sit below the top row. Everything shown is real data from the existing reads (member/orders,
   member/pack, the catalog); a missing read gets a truthful state. No cart, Buy Now, Add to Cart or Buy Again, no Packed step,
   no registration milestone in the shipment tracker, no link into the membership funnel (the Membership Terms PDF is the
   central agreement route), no invented price, percentage, date or ETA. Member prices are not written on Home: members see them in the app. */
import { html, safe, type Markup } from "../../lib/html.ts";
import type { OrderCard, OrderStep } from "../../lib/pack-api.ts";
import type { CatalogProduct } from "../../lib/shop-api.ts";
import { REGISTERED_LINE, shortDate } from "./pack-orders.ts";
export { REGISTERED_LINE };
import { EARN_ENTRY_PATH, HELP_PATH, MEMBERSHIP_PATH, PURCHASES_PATH } from "./member.ts";
import { PRODUCT_PLACEHOLDER, safeImage } from "./shop-shell.ts";
import { appButtons, hasAppLink, type AppLinkInput } from "./app-links.ts";

export const HOME_PRODUCTS_MAX = 4;
export const AGREEMENT_PDF_PATH = "/funnel/membership-pack/membership-terms.pdf";

/* The two guidance tiles' destinations, one place each (Supervisor decision: "View guides" opens the Media Library, confirmed 2026-11-19). */
export const GUIDE_START_HREF = `${MEMBERSHIP_PATH}#how-to-use`;
export const GUIDE_PRODUCT_HREF = "/dashboard/media/";
export const HELP_CONTACT_HREF = `${HELP_PATH}#contact`;

/* The approved membership statements: Coach Ed's funnel copy (views/sante/pack-landing.ts), the three lines of the sentence quoted unchanged.
   The card headline is one constant (Coach Ed, D-LIFE, 2026-11-19: "Member benefits, for life"). */
export const MEMBERSHIP_HEADLINE = "Member benefits, for life";
export const LIFETIME_LINE = "Lifetime Membership";
export const BENEFIT_LINES = ["No renewal fees", "No monthly quotas", "No maintenance purchases"] as const;
export const NO_FEES_LINE = `${BENEFIT_LINES.join(". ")}.`;
export const APP_PRICES_LINE = "Member prices are shown in the Santé Mobile App.";
export const ORDERING_LINE = "Members order in the Santé Mobile App, where member prices are shown.";
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
  app_url: AppLinkInput;
  /** null: the catalog could not be read, or the shop is off. */
  products: CatalogProduct[] | null;
  notices: Markup;
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

/* ---- icons ------------------------------------------------------------------------------------------------- */

const ICON = (d: string, size = 20): Markup => html`<svg viewBox="0 0 24 24" width="${String(size)}" height="${String(size)}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${safe(d)}</svg>`;
const I = {
  box: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4.5"/><path d="M12 17.5h.01"/>',
  truck: '<rect x="1.5" y="5" width="12.5" height="11" rx="1"/><path d="M14 9h4.5l3 3.5V16H14"/><circle cx="6" cy="18.5" r="2"/><circle cx="17.5" cy="18.5" r="2"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  layers: '<path d="m12 3 9 4.5-9 4.5-9-4.5z"/><path d="m3 12 9 4.5 9-4.5"/><path d="m3 16.5 9 4.5 9-4.5"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18.5h2"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="m10 8.5 5.5 3.5-5.5 3.5z"/>',
  headset: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="2.5" y="13" width="4" height="6" rx="1.5"/><rect x="17.5" y="13" width="4" height="6" rx="1.5"/><path d="M20 19a4 4 0 0 1-4 3h-3"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.5a5 5 0 0 1 5 5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5"/><path d="M12 16.5h.01"/>',
};
export const icons = { ICON, I };

/* A simple CSS/SVG package for an order with no matching catalog image; never a stock photo. */
const PACKAGE_ART = html`<svg class="mh-pkg-art" viewBox="0 0 120 110" fill="none" aria-hidden="true" focusable="false">
  <path d="M60 14 104 36v44L60 102 16 80V36z" fill="#EAF4EE" stroke="#00693A" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M16 36 60 58l44-22M60 58v44" stroke="#00693A" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M38 25 82 47v13" stroke="#00693A" stroke-width="2.4" stroke-linejoin="round" opacity=".55"/>
  <path d="M96 76c10-2 16-9 18-18-10 1-17 8-18 18z" fill="#8CC63F" stroke="#00693A" stroke-width="1.8" stroke-linejoin="round"/>
</svg>`;

/* ---- the order card: state, headline, pill, tracker --------------------------------------------------------- */

export type Tone = "ok" | "wait" | "warn" | "plain";
export type StepStatus = "done" | "current" | "todo" | "alert";
export const TRACKER_LABELS = ["Payment confirmed", "Ready to ship", "Shipped", "Delivered"] as const;
const TRACKER_ICONS = [I.card, I.box, I.truck, I.checkCircle];

export type OrderView = {
  /** Which stage the order is at. */
  kind: "unknown" | "review" | "payment_due" | "payment_expired" | "payment_mismatch" | "rejected" | "problem" | "prepared" | "shipped" | "delivered";
  headline: string;
  pill: string;
  tone: Tone;
  /** null: no tracker, a plain line instead (the status cannot be read). */
  tracker: StepStatus[] | null;
  /** The first step's label: "Payment confirmed" only once the payment is verified, else the real state. */
  first: string;
};

/** The four steps from the existing states: the payment is confirmed once verified; Ready to ship is where a verified, unshipped order waits
    (the store preparing it); Shipped and Delivered follow the card's own steps. No Packed step, and registration is not a step. */
export function trackerOf(c: OrderCard): StepStatus[] {
  if (!isVerified(c)) return ["current", "todo", "todo", "todo"];
  if (isDelivered(c)) return ["done", "done", "done", "done"];
  if (isShipped(c)) return ["done", "done", "current", "todo"];
  return ["done", "current", "todo", "todo"];
}

export function viewOf(c: OrderCard): OrderView {
  const CONFIRMED = TRACKER_LABELS[0];
  if (!KNOWN_PAYMENT.includes(c.payment_status)) return { kind: "unknown", headline: "We're checking your order", pill: "Checking", tone: "plain", tracker: null, first: CONFIRMED };
  const alert = (kind: OrderView["kind"], headline: string, first: string): OrderView => ({ kind, headline, pill: "Action needed", tone: "warn", tracker: ["alert", "todo", "todo", "todo"], first });
  switch (c.payment_status) {
    case "awaiting_xendit": return { ...alert("payment_due", "Complete your payment", "Payment due"), pill: "Payment due" };
    case "xendit_expired": return alert("payment_expired", "Your payment link expired", "Payment expired");
    case "xendit_mismatch": return alert("payment_mismatch", "Your payment needs attention", "Payment needs attention");
    case "rejected": return alert("rejected", "We couldn't verify your payment", "Payment needs attention");
    case "pending_review": return { kind: "review", headline: "Your payment is under review", pill: "Under review", tone: "wait", tracker: trackerOf(c), first: "Payment under review" };
    default: break;
  }
  if (c.problem) return alert("problem", "Your order needs attention", "Payment needs attention");
  if (isDelivered(c)) return { kind: "delivered", headline: "Your package was delivered", pill: "Delivered", tone: "ok", tracker: trackerOf(c), first: CONFIRMED };
  if (isShipped(c)) return { kind: "shipped", headline: "Your package has shipped", pill: "On its way", tone: "ok", tracker: trackerOf(c), first: CONFIRMED };
  return { kind: "prepared", headline: "Your package is being prepared", pill: "Preparing", tone: "ok", tracker: trackerOf(c), first: CONFIRMED };
}

const PILL_ICON: Record<Tone, string> = { ok: I.truck, wait: I.clock, warn: I.alert, plain: I.clock };
const KIND_ICON: Partial<Record<OrderView["kind"], string>> = { prepared: I.box, delivered: I.checkCircle };

function trackerMarkup(t: StepStatus[], first: string): Markup {
  return html`<ol class="mh-track-steps" aria-label="Package progress">${TRACKER_LABELS.map((base, i) => i === 0 ? first : base).map((label, i) => html`<li class="mh-ts mh-ts-${t[i]}"${t[i] === "current" ? safe(' aria-current="step"') : ""}>
    <span class="mh-ts-dot" aria-hidden="true">${t[i] === "done" ? ICON(I.check, 16) : t[i] === "alert" ? html`!` : t[i] === "current" ? ICON(TRACKER_ICONS[i], 16) : ""}</span>
    <span class="mh-ts-label">${label}<span class="sr-only">, ${t[i] === "done" ? "done" : t[i] === "current" ? "current step" : t[i] === "alert" ? "needs attention" : "not yet"}</span></span>
  </li>`)}</ol>`;
}

export const viewOrderHref = (c: OrderCard): string => `${PURCHASES_PATH}#order-${encodeURIComponent(c.order_number)}`;

function itemSummary(c: OrderCard): string {
  const lines = c.item_lines.filter((l) => l.name).map((l) => `${l.qty > 1 ? `${l.qty} × ` : ""}${l.name}`);
  return lines.length ? lines.join(", ") : c.headline;
}

/** The catalog products that appear among the purchased items, by name. */
const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, " ").trim();
const wordChar = /[\p{L}\p{N}]/u;

/** A product matches an item only when its name equals the item's name, or the item's name starts with it followed by a non-letter,
    non-digit boundary ("Barley 1" never matches "Barley 10's"). The longest matching product name comes first. */
export function purchasedProducts(c: OrderCard | null, products: CatalogProduct[] | null): CatalogProduct[] {
  if (!c || !products) return [];
  const names = [...c.item_lines.map((l) => l.name), c.headline].map(norm).filter(Boolean);
  const hit = (p: CatalogProduct): boolean => {
    const n = norm(p.name);
    return !!n && names.some((item) => item === n || (item.startsWith(n) && !wordChar.test(item.charAt(n.length))));
  };
  return products.filter(hit).sort((a, b) => norm(b.name).length - norm(a.name).length).slice(0, 3);
}

function orderArt(c: OrderCard, products: CatalogProduct[] | null): Markup {
  const own = safeImage(purchasedProducts(c, products)[0]?.image_url ?? "");
  return own ? html`<div class="mh-order-art mh-order-art-photo"><img src="${own}" alt="" loading="lazy"></div>` : html`<div class="mh-order-art">${PACKAGE_ART}</div>`;
}

type Strip = { icon: string; lead: string; text: Markup; cta: { href: string; label: string; data?: string }; secondary?: { href: string; label: string } };

function stripOf(c: OrderCard, v: OrderView): Strip {
  const view = { href: viewOrderHref(c), label: "View order" };
  switch (v.kind) {
    case "unknown": return { icon: I.help, lead: "", text: html`We can't show the status of this order right now.`, cta: { href: `${HELP_PATH}#order`, label: "Get help" }, secondary: view };
    case "review": return { icon: I.clock, lead: "", text: html`The store is checking your payment details. Your package is prepared once the payment is confirmed.`, cta: view };
    case "payment_due": return { icon: I.card, lead: "", text: html`Your order is placed, but the payment is not complete yet.`, cta: { href: PURCHASES_PATH, label: "Complete payment" }, secondary: view };
    case "payment_expired": return { icon: I.alert, lead: "", text: html`${c.problem_line || "The payment was not completed in time. Open your order for the next step."}`, cta: { href: PURCHASES_PATH, label: "See next steps" }, secondary: view };
    case "payment_mismatch": return { icon: I.alert, lead: "", text: html`${c.problem_line || "The amount received did not match your order. Contact us with your order number."}`, cta: { href: `${HELP_PATH}#order`, label: "Get help" }, secondary: view };
    case "rejected": return { icon: I.alert, lead: "", text: html`${c.problem_line || "The store could not verify your payment. You can send new proof of payment."}`, cta: { href: PURCHASES_PATH, label: "Send new proof" }, secondary: view };
    case "problem": return { icon: I.alert, lead: "", text: html`${c.problem_line || "There is a problem with this order. Open it to see the next step."}`, cta: view };
    case "prepared": return { icon: I.box, lead: "", text: html`The store is preparing your package. Courier details appear here once it ships.`, cta: view };
    case "delivered": {
      const on = step(c, 3)?.date ? shortDate(step(c, 3)!.date) : "";
      return { icon: I.checkCircle, lead: c.courier, text: html`${on ? `Delivered on ${on}.` : "Your package was delivered."}`, cta: view };
    }
    default: {
      const on = step(c, 2)?.date ? shortDate(step(c, 2)!.date) : "";
      const text = c.tracking
        ? html`Tracking number <span class="mh-track" data-mh-tracking>${c.tracking}</span> <button type="button" class="mh-copy" data-mh-copy="${c.tracking}" hidden>Copy</button>`
        : html`${on ? `Shipped on ${on}. ` : ""}Tracking will appear once the store provides it.`;
      return { icon: I.truck, lead: c.courier || "Shipped", text, cta: view };
    }
  }
}

function orderCard(c: OrderCard, state: OrderState, others: number, products: CatalogProduct[] | null): Markup {
  const v = viewOf(c);
  const s = stripOf(c, v);
  return html`<section class="mh-card mh-order" id="mh-order" data-mh-state="${state}" data-mh-kind="${v.kind}" aria-labelledby="mh-order-h">
  <div class="mh-order-top">
    <p class="mh-eyebrow"><span class="mh-eyebrow-ic" aria-hidden="true">${ICON(I.box, 22)}</span>Your Membership Package</p>
    <span class="mh-pill mh-pill-${v.tone}"><span aria-hidden="true">${ICON(KIND_ICON[v.kind] && v.tone !== "warn" ? KIND_ICON[v.kind]! : PILL_ICON[v.tone], 18)}</span>${v.pill}</span>
  </div>
  <div class="mh-order-main">
    ${orderArt(c, products)}
    <div class="mh-order-body">
      <h2 id="mh-order-h">${v.headline}</h2>
      <p class="mh-order-meta"><span>Order reference <strong>${c.order_number}</strong></span><span class="mh-order-sum">${itemSummary(c)}</span></p>
      ${v.tracker ? trackerMarkup(v.tracker, v.first) : ""}
    </div>
  </div>
  <div class="mh-strip">
    <span class="mh-strip-ic" aria-hidden="true">${ICON(s.icon, 24)}</span>
    ${s.lead ? html`<strong class="mh-strip-lead">${s.lead}</strong>` : ""}
    <span class="mh-strip-text">${s.text}</span>
    <span class="mh-strip-actions">${s.secondary ? html`<a class="mh-link" href="${s.secondary.href}">${s.secondary.label}</a>` : ""}${others > 0 ? html`<a class="mh-link" href="${PURCHASES_PATH}">All purchases (${others + 1})</a>` : ""}<a class="mh-btn mh-btn-primary" href="${s.cta.href}">${s.cta.label}</a></span>
  </div>
</section>`;
}

function orderError(): Markup {
  return html`<section class="mh-card mh-order mh-card-warn" id="mh-order" data-mh-state="error" role="alert" aria-labelledby="mh-order-h">
  <div class="mh-order-top"><p class="mh-eyebrow"><span class="mh-eyebrow-ic" aria-hidden="true">${ICON(I.box, 22)}</span>Your Membership Package</p></div>
  <div class="mh-order-main"><div class="mh-order-art">${PACKAGE_ART}</div><div class="mh-order-body"><h2 id="mh-order-h">${ORDER_ERROR}</h2><p class="mh-order-meta">Your order is safe. We just can't show its update right now.</p></div></div>
  <div class="mh-strip"><span class="mh-strip-ic" aria-hidden="true">${ICON(I.alert, 24)}</span><span class="mh-strip-text"><a class="mh-link" href="${HELP_PATH}">Help</a> &middot; <a class="mh-link" href="${PURCHASES_PATH}">My Purchases</a></span>
    <span class="mh-strip-actions"><a class="mh-btn mh-btn-primary" href="/dashboard/" data-mh-retry>Retry</a></span></div>
</section>`;
}

function orderNone(): Markup {
  return html`<section class="mh-card mh-order" id="mh-order" data-mh-state="none" aria-labelledby="mh-order-h">
  <div class="mh-order-top"><p class="mh-eyebrow"><span class="mh-eyebrow-ic" aria-hidden="true">${ICON(I.box, 22)}</span>Your Membership Package</p></div>
  <div class="mh-order-main"><div class="mh-order-art">${PACKAGE_ART}</div><div class="mh-order-body"><h2 id="mh-order-h">No package order yet</h2><p class="mh-order-meta">There is no membership package purchase on this account. If you expected one, contact us with your order number.</p></div></div>
  <div class="mh-strip"><span class="mh-strip-ic" aria-hidden="true">${ICON(I.help, 24)}</span><span class="mh-strip-text">Our team can look into it.</span>
    <span class="mh-strip-actions"><a class="mh-btn mh-btn-primary" href="${HELP_PATH}#order">Get help with an order</a></span></div>
</section>`;
}

/* ---- the membership card ------------------------------------------------------------------------------------ */

const LEAF_ART = html`<svg class="mh-leaf" viewBox="0 0 120 220" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <path d="M96 214C92 150 98 70 112 8"/>
  <path d="M97 176C70 176 48 160 42 134 70 134 92 150 97 176z"/><path d="M97 176C80 166 62 152 48 138"/>
  <path d="M95 140C68 136 52 118 50 94 76 98 92 116 95 140z"/><path d="M95 140C80 128 66 112 56 98"/>
  <path d="M100 104C80 96 70 78 74 56 94 62 102 80 100 104z"/><path d="M100 104C92 92 84 76 78 62"/>
  <path d="M100 168C118 160 128 144 126 124 108 128 100 146 100 168z"/><path d="M100 168C110 156 118 142 124 128"/>
  <path d="M105 96C122 88 130 72 126 54 110 60 104 76 105 96z"/>
</svg>`;

const BENEFIT_ICONS = [I.checkCircle, I.calendar, I.layers];

export function membershipCard(reg: RegistrationInfo | null, hasOrder: boolean): Markup {
  const pill = reg
    ? html`<span class="mh-pill ${reg.registered ? "mh-pill-ok" : reg.act || reg.label ? "mh-pill-wait" : "mh-pill-plain"}"><span aria-hidden="true">${ICON(reg.registered ? I.checkCircle : I.clock, 18)}</span>${reg.label || (reg.registered ? "Registered" : "Registration pending")}</span>`
    : hasOrder ? html`<span class="mh-pill mh-pill-plain"><span aria-hidden="true">${ICON(I.clock, 18)}</span>Registration not started</span>` : "";
  const unavailable = !reg && !hasOrder ? html`<p class="mh-member-note">Your membership details are not available right now. <a href="${HELP_PATH}#membership">Ask us</a> if you need them.</p>` : "";
  const id = reg?.registered && reg.member_id ? html`<p class="mh-member-id">Member ID <strong>${reg.member_id}</strong></p>` : "";
  const act = reg && !reg.registered && reg.act ? html`<p class="mh-member-note"><a href="${PURCHASES_PATH}">Complete my registration &rarr;</a></p>` : "";
  return html`<section class="mh-card mh-member" id="mh-member" aria-labelledby="mh-member-h">
  <span class="mh-leaf-wrap" aria-hidden="true">${LEAF_ART}</span>
  <p class="mh-eyebrow"><span class="mh-eyebrow-ic" aria-hidden="true">${ICON(I.shield, 22)}</span>Your Sant&eacute; Membership</p>
  <h2 id="mh-member-h">${MEMBERSHIP_HEADLINE}</h2>
  ${pill}${id}${unavailable}${act}
  <ul class="mh-benefits">${BENEFIT_LINES.map((b, i) => html`<li><span aria-hidden="true">${ICON(BENEFIT_ICONS[i], 22)}</span>${b}</li>`)}</ul>
  <a class="mh-btn mh-btn-light" href="${MEMBERSHIP_PATH}">View membership</a>
</section>`;
}

/* ---- discover products -------------------------------------------------------------------------------------- */

const cut = (text: string, max: number): string => { const t = text.trim(); return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`; };

export function productTile(p: CatalogProduct): Markup {
  const image = safeImage(p.image_url);
  const href = `/products/${p.code}/`;
  return html`<article class="mh-prod" data-mh-product="${p.code}">
    <a class="mh-prod-img" href="${href}" tabindex="-1" aria-hidden="true">${image ? html`<img src="${image}" alt="" loading="lazy">` : PRODUCT_PLACEHOLDER}</a>
    <div class="mh-prod-body">
      <h3><a href="${href}">${p.name}</a></h3>
      ${p.short_description ? html`<p class="mh-prod-desc">${cut(p.short_description, 90)}</p>` : ""}
      <a class="mh-link mh-prod-go" href="${href}">Explore<span class="sr-only"> ${p.name}</span> &rarr;</a>
    </div>
  </article>`;
}

export function exploreSection(products: CatalogProduct[] | null, appUrl: AppLinkInput): Markup {
  const shown = (products ?? []).slice(0, HOME_PRODUCTS_MAX);
  const guidance = html`<div class="mh-sect-sub"><p>${ORDERING_LINE}${hasAppLink(appUrl) ? "" : ` ${NO_APP_LINK_LINE}`}</p>${hasAppLink(appUrl) ? html`<span class="mh-app-btns">${appButtons(appUrl, "mh-btn mh-btn-sm")}</span>` : ""}</div>`;
  return html`<section class="mh-sect" id="mh-explore" aria-labelledby="mh-explore-h">
  <div class="mh-sect-head"><h2 id="mh-explore-h">Discover more from Sant&eacute;</h2><a class="mh-link mh-all" href="/products/">View all products &rarr;</a></div>
  ${guidance}
  ${shown.length ? html`<div class="mh-prods" data-count="${shown.length}">${shown.map(productTile)}</div>` : html`<div class="mh-card mh-empty" data-mh-empty="products">
    <p>${products === null ? "We can't show products right now." : "No products are listed here yet."} Members order in the Sant&eacute; Mobile App.</p></div>`}
</section>`;
}

/* ---- guidance, support, earning ----------------------------------------------------------------------------- */

function tile(icon: string, title: string, text: string, href: string, action: string, key: string): Markup {
  return html`<div class="mh-tile" data-mh-guide="${key}"><span class="mh-tile-ic" aria-hidden="true">${ICON(icon, 28)}</span><div class="mh-tile-tx"><h3>${title}</h3><p>${text}</p></div><a class="mh-link mh-tile-go" href="${href}">${action} &rarr;</a></div>`;
}

export function guidanceRow(): Markup {
  return html`<section class="mh-guides" aria-label="Guides">
  ${tile(I.phone, "Make the most of your membership", "Learn how to order in the Santé Mobile App.", GUIDE_START_HREF, "Start here", "app")}
  ${tile(I.play, "Your product guide", "Simple preparation and storage guides.", GUIDE_PRODUCT_HREF, "View guides", "products")}
</section>`;
}

export function supportStrip(): Markup {
  return html`<section class="mh-support" id="mh-help" aria-label="Support">
  <div class="mh-support-help"><span class="mh-support-ic" aria-hidden="true">${ICON(I.headset, 28)}</span><p>Need a hand? We're here to help.</p><a class="mh-link" href="${HELP_CONTACT_HREF}">Contact your store &rarr;</a></div>
  <div class="mh-support-earn" id="mh-earn"><span class="mh-support-ic" aria-hidden="true">${ICON(I.users, 28)}</span><p>Interested in sharing Sant&eacute;?</p><a class="mh-link" href="${EARN_ENTRY_PATH}">Explore ways to earn &rarr;</a></div>
</section>`;
}

/* ---- the Home ----------------------------------------------------------------------------------------------- */

const DECO = html`<svg class="mh-deco" viewBox="0 0 260 150" fill="none" aria-hidden="true" focusable="false">
  <path d="M258 6C200 22 150 56 120 104" stroke="#8CC63F" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>
  <path d="M234 14c-16 2-34 12-42 30 18 0 36-10 42-30z" fill="#CFE8B8" opacity=".7"/>
  <path d="M206 34c-18 4-34 18-38 38 20-2 36-16 38-38z" fill="#B7DC96" opacity=".6"/>
  <path d="M176 62c-16 6-28 20-30 38 18-4 30-18 30-38z" fill="#CFE8B8" opacity=".75"/>
  <path d="M252 30c-8 10-10 26-4 40 10-8 12-26 4-40z" fill="#B7DC96" opacity=".5"/>
</svg>`;

function registrationOf(i: HomeInput, card: OrderCard | null): RegistrationInfo | null {
  if (i.registration) return i.registration;
  const m = card?.membership;
  return m ? { label: m.label, line: m.line, registered: m.registered, member_id: m.sante_member_id, act: m.act } : null;
}

export const welcomeText = (first: string): string => (first.trim() ? `Welcome, ${first.trim()}` : "Welcome");

/** The Home body. */
export function homeBody(i: HomeInput): Markup {
  const picked = i.orders.state === "ok" ? pickOrder(i.orders.cards) : null;
  const others = i.orders.state === "ok" ? Math.max(0, i.orders.cards.length - 1) : 0;
  const card = picked?.card ?? null;
  const a = i.orders.state === "failed" ? orderError() : !picked ? orderNone() : orderCard(picked.card, picked.state, others, i.products);
  const b = membershipCard(registrationOf(i, card), !!card);
  return html`<header class="mh-welcome">${DECO}<h1>${welcomeText(i.first_name)}</h1><p>Your membership, products and order updates in one place.</p></header>
<div class="mh-top">${a}${b}</div>
${i.notices}
${exploreSection(i.products, i.app_url)}
${guidanceRow()}
${supportStrip()}`;
}
