/* My Membership (/dashboard/membership/) and Help (/dashboard/help/): the two pages the member Home links to (ClickUp z8uq9mgmjg).
   Real data only: the registration state and the official member ID (only when issued) come from the member pack read, the
   statements are Coach Ed's approved funnel copy, the terms are the central agreement PDF, the help entries are this store's own
   contact details. No invented eligibility, discount percentage, deadline or deep link. */
import { html, type Markup } from "../../lib/html.ts";
import { pageHero } from "./member-dash.ts";
import {
  APP_PRICES_LINE, LIFETIME_LINE, NO_APP_LINK_LINE, NO_FEES_LINE, icons, type Contacts, type RegistrationInfo,
} from "./member-home.ts";
import { HELP_PATH, PURCHASES_PATH } from "./member.ts";
import { card as orderCard, REGISTERED_LINE } from "./pack-orders.ts";
import type { OrderCard } from "../../lib/pack-api.ts";

export type MembershipInput = { registration: RegistrationInfo | null; has_order: boolean; app_url: string; terms_href: string };

/** The four questions of the benefits Q&A (Coach Ed's direction, section 5). */
export const BENEFIT_QA: readonly { q: string; a: string }[] = [
  { q: "How do I access member prices?", a: APP_PRICES_LINE },
  { q: "Where do I place future orders?", a: "In the Santé Mobile App. This website shows your membership package and product information." },
  { q: "How long does membership last?", a: `${LIFETIME_LINE}.` },
  { q: "Are there renewal fees, quotas or maintenance purchases?", a: NO_FEES_LINE },
];

export function membershipContent(m: MembershipInput): Markup {
  const reg = m.registration;
  const status = reg
    ? html`<p class="mh-reg"><strong>${reg.label || (reg.registered ? "Registered" : "Registration pending")}</strong></p>${reg.registered ? html`<p>${REGISTERED_LINE}</p>` : reg.line ? html`<p>${reg.line}</p>` : ""}
      ${reg.act ? html`<a class="mh-btn mh-btn-primary" href="${PURCHASES_PATH}">Complete my registration</a>` : ""}`
    : m.has_order ? html`<p class="mh-reg"><strong>Registration not started</strong></p><p>Membership registration opens once your payment is confirmed.</p>`
    : html`<p>Your membership details are not available right now. <a class="mh-link" href="${HELP_PATH}#membership">Ask us</a> if you need them.</p>`;
  const id = reg?.registered && reg.member_id
    ? html`<p class="mh-id">Official Santé Member ID <strong>${reg.member_id}</strong></p>`
    : html`<p class="mh-muted">Your official Santé Member ID appears here once your registration is complete.</p>`;
  return html`<div class="pd mh md-plain" data-md-page="membership" id="pp-dash-membership">
${pageHero("My Membership", "Your membership status, benefits and how to use them.")}
<section class="mh-card mh-member" aria-labelledby="mh-ms-h">
  <div class="mh-card-head"><span class="mh-ic" aria-hidden="true">${icons.ICON(icons.I.shield)}</span><h2 id="mh-ms-h">Membership status</h2></div>
  ${status}${id}
</section>
<section class="mh-card" aria-labelledby="mh-qa-h">
  <h2 id="mh-qa-h">Your Membership Benefits</h2>
  <dl class="mh-qa">${BENEFIT_QA.map((x) => html`<div><dt>${x.q}</dt><dd>${x.a}</dd></div>`)}</dl>
  ${m.terms_href ? html`<a class="mh-link" href="${m.terms_href}" target="_blank" rel="noopener">View Membership Terms &rarr;</a>` : html`<p class="mh-muted">The Membership Terms are available from your store on request.</p>`}
</section>
<section class="mh-card" id="how-to-use" aria-labelledby="mh-how-h">
  <h2 id="mh-how-h">How to Use My Membership</h2>
  <ol class="mh-steps">
    <li>${m.app_url ? html`Open the <a href="${m.app_url}" rel="noopener" target="_blank">Sant&eacute; Mobile App</a>.` : html`Get the Sant&eacute; Mobile App. ${NO_APP_LINK_LINE}`}</li>
    <li>${APP_PRICES_LINE}</li>
    <li>Place your member orders in the app. This website shows your membership package and product information.</li>
  </ol>
  <div class="mh-actions">${m.app_url ? html`<a class="mh-btn mh-btn-primary" href="${m.app_url}" rel="noopener" target="_blank">Open Sant&eacute; Mobile App</a>` : html`<a class="mh-btn" href="${HELP_PATH}#membership">Ask us for the app link</a>`}</div>
</section>
</div>`;
}

export const PURCHASES_LIST_ERROR = "We couldn't load your full purchase list.";

/** Every membership-package order of the member, each a card with its details (items, amount, address snapshot, steps, courier and tracking).
    Orders are not editable here. `null` is a failed read: said plainly, never shown as no purchases. */
export function purchasesList(cards: OrderCard[] | null): Markup {
  if (cards === null) return html`<section class="mh-card mh-card-warn" data-mh-list="error" role="alert"><p>${PURCHASES_LIST_ERROR} <a class="mh-link" href="${PURCHASES_PATH}">Try again</a> or <a class="mh-link" href="${HELP_PATH}#order">get help</a>.</p></section>`;
  if (cards.length === 0) return html``;
  const sorted = [...cards].sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));
  return html`<section id="pp-dash-orders" class="mh-list-wrap" data-mh-list="orders" aria-labelledby="mh-all-h"><h2 id="mh-all-h" class="mh-list-h">All my purchases</h2><div class="oc-list">${sorted.map((c, i) => orderCard(c, i))}</div></section>`;
}

/** Help: order, membership or app setup, and product questions, each pointing at this store's own contact details. */
export function helpContent(ct: Contacts, appUrl: string): Markup {
  const contact = html`${ct.email || ct.mobile ? html`<p class="mh-contact">${ct.email ? html`<a class="mh-link" href="mailto:${ct.email}">${ct.email}</a>` : ""}${ct.email && ct.mobile ? " · " : ""}${ct.mobile ? html`<a class="mh-link" href="tel:${ct.mobile_raw}">${ct.mobile}</a>` : ""}</p>` : ""}<p><a class="mh-link" href="/#contact">Send a message through the store's contact form &rarr;</a></p>`;
  const block = (id: string, title: string, text: string, extra: Markup = html``) => html`<section class="mh-card" id="${id}" aria-labelledby="${id}-h"><h2 id="${id}-h">${title}</h2><p>${text}</p>${extra}${contact}</section>`;
  return html`<div class="pd mh md-plain" data-md-page="help" id="pp-dash-help">
${pageHero("Help", "Your store is here to help.")}
${block("order", "About my order", "Tell us your order number and what you need. You can find it under My Purchases.", html`<p><a class="mh-link" href="${PURCHASES_PATH}">Open My Purchases &rarr;</a></p>`)}
${block("membership", "Membership or app setup", "Ask about your membership registration, your member ID or getting the Santé Mobile App.", appUrl ? html`<p><a class="mh-link" href="${appUrl}" rel="noopener" target="_blank">Open the Sant&eacute; Mobile App &rarr;</a></p>` : html`<p class="mh-muted">${NO_APP_LINK_LINE}</p>`)}
${block("product", "A product question", "Ask about how to use, prepare or store a product. Each product page also has its own FAQs.", html`<p><a class="mh-link" href="/products/">Browse products &rarr;</a></p>`)}
</div>`;
}
