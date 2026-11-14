/* The member Home's four tiles and Order Monitoring, and the My Orders page.
   Transcribed from TWCinc's dash_home.html (hero tiles), _order_monitor.html, dash_orders.html and _order_card.html: text, class
   names and order are the templates'. Money arrives formatted from the backend. Dates are Manila's, as TWCinc's. */
import { html, safe, type Markup } from "../../lib/html.ts";
import type { HomeSummary, OrderCard, OrderMonitor } from "../../lib/pack-api.ts";
import type { BuyerOrder } from "../../lib/shop-api.ts";
import { money, safeImage } from "./shop-shell.ts";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "M j, Y" (Nov 12, 2026), or "M j" without the year, in Manila time; "" for an unreadable date. */
export function shortDate(iso: string, year = true): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t + 8 * 3600 * 1000);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}${year ? `, ${d.getUTCFullYear()}` : ""}`;
}

export function heroTiles(s: HomeSummary): Markup {
  return html`<div class="acct-kpis">
    <div class="acct-kpi acct-kpi-lead"><span class="acct-kpi-label">Total Spent</span><span class="acct-kpi-value">&#8369;${s.total_spent}</span></div>
    <div class="acct-kpi"><span class="acct-kpi-label">Orders</span><span class="acct-kpi-value">${s.total_orders}</span></div>
    <div class="acct-kpi"><span class="acct-kpi-label">Delivered</span><span class="acct-kpi-value">${s.delivered}</span></div>
    <div class="acct-kpi"><span class="acct-kpi-label">Needs Attention</span><span class="acct-kpi-value">${s.needs_attention}</span></div>
  </div>`;
}

const svg = (inner: string) => html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${safe(inner)}</svg>`;
const plural = (n: number) => (n === 1 ? "" : "s");

export function orderMonitor(m: OrderMonitor): Markup {
  const delta = m.delta > 0 ? html`<span class="sf-om-delta sf-om-delta--up">&#9650; +${m.delta} vs last month</span>`
    : m.delta < 0 ? html`<span class="sf-om-delta sf-om-delta--down">&#9660; ${m.delta} vs last month</span>`
    : html`<span class="sf-om-delta sf-om-delta--flat">No change yet</span>`;
  const stat = (cls: string, icon: string, n: number, label: string) =>
    html`<div class="sf-om-stat"><span class="sf-om-stat-ic sf-om-stat-ic--${cls}" aria-hidden="true">${svg(icon)}</span><div><div class="sf-om-stat-n">${n}</div><div class="sf-om-stat-l">${label}</div></div></div>`;
  return html`<section class="sf-om" aria-labelledby="sfOmTitle">
  <div class="sf-om-head">
    <span class="sf-om-head-ic" aria-hidden="true">${svg('<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>')}</span>
    <div class="sf-om-head-txt">
      <h2 class="sf-om-title" id="sfOmTitle">Order Monitoring</h2>
      <p class="sf-om-sub">Track your weekly order activity.</p>
    </div>
    ${delta}
  </div>
  <div class="sf-om-stats">
    ${stat("approval", '<path d="M6 3h12M6 21h12"/><path d="M7 3v3l5 6 5-6V3"/><path d="M7 21v-3l5-6 5 6v3"/>', m.awaiting_approval, "Under Review")}
    ${stat("booking", '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M9 10h6M9 14h6M9 18h3"/>', m.for_booking, "Preparing")}
    ${stat("shipping", '<path d="M3 6h11v10H3z"/><path d="M14 9h4l3 3v4h-7"/><circle cx="7" cy="17.5" r="1.5"/><circle cx="17" cy="17.5" r="1.5"/>', m.for_shipping, "Shipping")}
    ${stat("delivered", '<path d="M4 9h16l-2 11H6L4 9z"/><path d="M9 9l3-5 3 5"/><path d="M10 13v4M14 13v4"/>', m.delivered, "Delivered")}
  </div>
  <div class="sf-om-week">Weekly Orders &middot; Sun&ndash;Sat</div>
  <div class="sf-om-chart">
    <ul class="sf-om-bars">
      ${m.series.map((d) => html`<li class="sf-om-col"><span class="sf-om-bar sf-om-h-${d.h}" aria-hidden="true" title="${d.count} order${plural(d.count)}"></span><span class="sf-om-x">${d.label}</span><span class="visually-hidden">: ${d.count} order${plural(d.count)}</span></li>
      `)}
    </ul>
    ${!m.has_orders ? html`<p class="sf-om-empty">No orders yet. Your order activity will appear here.</p>` : ""}
  </div>
</section>`;
}

export function viewAllLink(): Markup {
  return html`<p class="sf-dash-all"><a href="/dashboard/orders/">View all orders</a></p>`;
}

function card(c: OrderCard, i = 0): Markup {
  const tail = c.problem
    ? html`<div class="oc-problem-banner">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    <p>${c.problem_line} See your <a href="/dashboard/">Dashboard</a> for what to do next, or contact the store with this order number.</p>
  </div>`
    : c.note ? html`<p class="oc-awaiting-note">${c.note}</p>`
    : c.awaiting_payment ? html`<p class="oc-awaiting-note">This order will start processing once payment is completed. Open your <a href="/dashboard/">Dashboard</a> to finish paying.</p>`
    : c.under_review ? html`<p class="oc-awaiting-note">We received your payment. The store is <strong>checking</strong> it, and your order starts processing once it is verified.</p>`
    : html`<div class="oc-track">
    ${c.steps.map((s) => html`<div class="oc-track-step is-${s.state}">
      <div class="oc-track-dot">${s.state === "done" ? html`&#10003;` : s.state === "current" ? html`<span class="oc-track-pip"></span>` : s.num}</div>
      <div class="oc-track-label">${s.label}</div>
      ${s.date && shortDate(s.date, false) ? html`<div class="oc-track-date">${shortDate(s.date, false)}</div>` : ""}
    </div>`)}
  </div>
  ${c.courier || c.tracking ? html`<div class="oc-courier">${c.courier ? html`Shipping via <strong>${c.courier}</strong>` : ""}${c.tracking ? html`${c.courier ? html` &middot; ` : ""}Tracking# ${c.tracking}` : ""}</div>` : ""}`;
  const m = c.membership;
  return html`<div class="oc-card${c.problem ? " problem" : ""}">
  <div class="oc-top">
    <div><div class="oc-ref">${c.order_number}</div><div class="oc-date">Placed ${shortDate(c.created_at)}</div></div>
    <div class="oc-total"><span>Total &middot; ${c.payment_label}</span>&#8369;${c.total}</div>
  </div>
  <div class="oc-body">
    <div class="oc-items-text"><strong>${c.headline}</strong></div>
    <span class="sf-status-chip ${c.chip_class}">${c.chip_label}</span>
  </div>
  ${tail}
  ${m ? html`<div class="oc-member">
    <div class="oc-member-head">
      <span class="oc-member-ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg></span>
      <span class="oc-member-title">Membership Status</span>
    </div>
    <div class="oc-member-body">
      <p><strong>${m.label}</strong></p>
      <p>${m.line}</p>
      ${m.registered && m.sante_member_id ? html`<dl class="pp-dash-rows"><div><dt>Member / Reference ID</dt><dd>${m.sante_member_id}</dd></div></dl>` : ""}
      ${m.act ? html`<a href="/dashboard/" class="oc-member-link">Review your details &rarr;</a>` : ""}
    </div>
  </div>` : ""}
  <div class="oc-footline"><button type="button" class="oc-view-link oc-detail-toggle" aria-expanded="false" aria-controls="oc-detail-p${i}">View Details &rarr;</button></div>
  <div class="oc-detail" id="oc-detail-p${i}" hidden>
    <div class="oc-dgrid">
      <div class="oc-dcard">
        <div class="oc-dcard-head"><span class="oc-dcard-ic ic-gold" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M14 9h4l4 4v4a1 1 0 0 1-1 1h-1"/><circle cx="7.5" cy="18.5" r="1.5"/><circle cx="17.5" cy="18.5" r="1.5"/></svg></span><span class="oc-dcard-htxt">Waybill</span></div>
        <div class="oc-drow"><span>Courier</span><b>${c.courier || "To be assigned"}</b></div>
        <div class="oc-drow"><span>Tracking #</span>${c.tracking ? html`<b>${c.tracking}</b>` : html`<b class="oc-dmuted">Not yet assigned</b>`}</div>
        <div class="oc-drow oc-drow-total"><span>Shipping fee</span><b>${c.shipping_label}</b></div>
      </div>
      <div class="oc-dcard">
        <div class="oc-dcard-head"><span class="oc-dcard-ic ic-blue" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.3 7 12 12l8.7-5"/><path d="M12 22V12"/></svg></span><span class="oc-dcard-htxt">Items &middot; ${c.item_count}</span></div>
        ${c.item_lines.map((l) => html`<div class="oc-ditem"><span class="oc-dqty">&times;${l.qty}</span><span class="oc-diname">${l.name}</span></div>`)}
      </div>
      ${c.address ? html`<div class="oc-dcard">
        <div class="oc-dcard-head"><span class="oc-dcard-ic ic-teal" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg></span><span class="oc-dcard-htxt">Deliver to</span></div>
        <div class="oc-dname">${c.receiver_name}</div>
        ${c.receiver_mobile ? html`<div class="oc-dphone">${c.receiver_mobile}</div>` : ""}
        <div class="oc-daddr">${c.address}</div>
      </div>` : ""}
    </div>
  </div>
</div>`;
}

const SHOP_TRACK = ["placed", "confirmed", "shipped", "delivered"] as const;

/** A shop order as a card beside the pack's (TWCinc _store_order_card.html over the pack card's look): the buyer's four-step tracker,
    "This order was cancelled." for a cancelled one, the courier line and the details. Django's buyer view is the source of every word. */
export function shopCard(o: BuyerOrder, i = 0): Markup {
  const at = SHOP_TRACK.indexOf(o.status as (typeof SHOP_TRACK)[number]);
  const names = o.tracker.length === 4 ? o.tracker : ["Order Placed", "Order Confirmed", "Shipped", "Delivered"];
  const dates = [o.created_at, o.verified_at ?? "", o.shipped_on, o.delivered_on];
  const headline = o.lines.map((l) => `${l.quantity} × ${l.name || "Product"}`).join(", ");
  const chip = o.cancelled ? "sf-status-expired" : o.status === "placed" ? "" : "sf-status-approved";
  const a = o.delivery_address;
  const shipping = o.shipping_charged_centavos === 0 ? html`FREE` : html`&#8369;${money(o.shipping_charged_centavos)}`;
  const tail = o.cancelled
    ? html`<div class="oc-problem-banner"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><p>${o.status_label} Contact the store with this order number if you have questions.</p></div>`
    : html`<div class="oc-track">
    ${names.map((label, i) => {
      const state = i < at || (at === 3 && i === 3) ? "done" : i === at ? "current" : "todo";
      return html`<div class="oc-track-step is-${state}">
      <div class="oc-track-dot">${state === "done" ? html`&#10003;` : state === "current" ? html`<span class="oc-track-pip"></span>` : i + 1}</div>
      <div class="oc-track-label">${label}</div>
      ${state !== "todo" && dates[i] && shortDate(dates[i], false) ? html`<div class="oc-track-date">${shortDate(dates[i], false)}</div>` : ""}
    </div>`;
    })}
  </div>
  ${o.courier || o.tracking_no ? html`<div class="oc-courier">${o.courier ? html`Shipping via <strong>${o.courier}</strong>` : ""}${o.tracking_no ? html`${o.courier ? html` &middot; ` : ""}Tracking# ${o.tracking_no}` : ""}</div>` : ""}`;
  return html`<div class="oc-card${o.cancelled ? " problem" : ""}">
  <div class="oc-top">
    <div><div class="oc-ref">${o.order_number}</div><div class="oc-date">Placed ${shortDate(o.created_at)}</div></div>
    <div class="oc-total"><span>Total &middot; ${o.cancelled ? "Cancelled" : o.status_label}</span>&#8369;${money(o.total_centavos)}</div>
  </div>
  <div class="oc-body">
    <div class="oc-items-text"><strong>${headline}</strong></div>
    <span class="sf-status-chip ${chip}">${o.cancelled ? "Cancelled" : o.status_label}</span>
  </div>
  ${tail}
  <div class="oc-footline"><button type="button" class="oc-view-link oc-detail-toggle" aria-expanded="false" aria-controls="oc-detail-s${i}">View Details &rarr;</button></div>
  <div class="oc-detail" id="oc-detail-s${i}" hidden>
    <div class="oc-dgrid">
      <div class="oc-dcard">
        <div class="oc-dcard-head"><span class="oc-dcard-ic ic-gold" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M14 9h4l4 4v4a1 1 0 0 1-1 1h-1"/><circle cx="7.5" cy="18.5" r="1.5"/><circle cx="17.5" cy="18.5" r="1.5"/></svg></span><span class="oc-dcard-htxt">Waybill</span></div>
        <div class="oc-drow"><span>Courier</span><b>${o.courier || "To be assigned"}</b></div>
        <div class="oc-drow"><span>Tracking #</span>${o.tracking_no ? html`<b>${o.tracking_no}</b>` : html`<b class="oc-dmuted">Not yet assigned</b>`}</div>
        <div class="oc-drow oc-drow-total"><span>Shipping fee</span><b>${shipping}</b></div>
      </div>
      <div class="oc-dcard">
        <div class="oc-dcard-head"><span class="oc-dcard-htxt">Items &middot; ${o.lines.reduce((n, l) => n + l.quantity, 0)}</span></div>
        ${o.lines.map((l) => {
          const image = safeImage(l.image_url ?? "");
          return html`<div class="oc-ditem">${image ? html`<img class="oc-dimg" src="${image}" alt="">` : ""}<span class="oc-dqty">&times;${l.quantity}</span><span class="oc-diname">${l.name || "Product"}</span>${l.unit_centavos !== undefined ? html`<span class="oc-dunit">&#8369;${money(l.unit_centavos)}</span>` : ""}</div>`;
        })}
        ${o.srp_subtotal_centavos !== undefined ? html`
        <div class="oc-drow oc-drow-total"><span>Subtotal</span><b>&#8369;${money(o.srp_subtotal_centavos)}</b></div>
        ${(o.member_savings_centavos ?? 0) > 0 ? html`<div class="oc-drow oc-dsave"><span>Member savings</span><b>&minus;&#8369;${money(o.member_savings_centavos ?? 0)}</b></div>` : ""}
        <div class="oc-drow"><span>Shipping</span><b>${shipping}</b></div>
        <div class="oc-drow"><span>Total</span><b>&#8369;${money(o.total_centavos)}</b></div>` : html`
        <div class="oc-drow"><span>Shipping</span><b>${shipping}</b></div>`}
      </div>
      ${a.line ? html`<div class="oc-dcard">
        <div class="oc-dcard-head"><span class="oc-dcard-htxt">Deliver to</span></div>
        <div class="oc-dname">${o.receiver_name}</div>
        ${o.receiver_mobile ? html`<div class="oc-dphone">${o.receiver_mobile}</div>` : ""}
        ${o.receiver_email ? html`<div class="oc-daddr">${o.receiver_email}</div>` : ""}
        <div class="oc-daddr">${[a.line, a.barangay, a.city, a.province].filter(Boolean).join(", ")}${a.zip ? ` ${a.zip}` : ""}</div>
      </div>` : ""}
    </div>
  </div>
</div>`;
}

export function ordersContent(memberName: string, cards: OrderCard[], shop: BuyerOrder[] = []): Markup {
  // Package and shop cards share one list, newest first
  const all = [...cards.map((c, i) => ({ at: Date.parse(c.created_at) || 0, view: card(c, i) })), ...shop.map((o, i) => ({ at: Date.parse(o.created_at) || 0, view: shopCard(o, i) }))].sort((x, y) => y.at - x.at);
  return html`<div class="pd" id="pp-dash-orders">
<div class="acct-hero">
  <div class="acct-hero-id">
    <span class="acct-hero-ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg></span>
    <div class="acct-hero-idtext">
      <h1>My Orders</h1>
      <div class="acct-hero-sub"><span>Signed in as <strong>${memberName}</strong></span></div>
    </div>
  </div>
</div>
${all.length ? html`<div class="oc-list">${all.map((x) => x.view)}</div>` : html`<div class="sf-empty"><p>No orders on your dashboard yet.</p></div>`}
<div class="sf-dash-foot"><p>Need help? Contact the store with your order number.</p></div>
</div>`;
}
