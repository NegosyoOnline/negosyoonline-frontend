/* The order-done page: TWCinc's store_done.html, _store_order_steps.html, _store_order_thanks.html and _store_order_card.html.
   The tracker with every step checked, then the thanks card (order number, "Status: Payment under review", "We received your payment
   proof. The store will review it.", Track Your Order) beside the Order Summary. Only the placing buyer opens it (the `no_order`
   cookie holds the key Django checks), and there is no guest lookup, as in TWCinc. Django's buyer view carries the receiver's
   name and delivery address but not the phone or email, so those two rows are not shown. */
import { html, type Markup } from "../../lib/html.ts";
import type { BuyerOrder } from "../../lib/shop-api.ts";
import { checkoutSteps } from "./shop-checkout.ts";
import { php } from "./shop-shell.ts";

export const PROOF_RECEIVED = "We received your payment proof. The store will review it.";

export function doneContent(o: BuyerOrder): Markup {
  const first = o.receiver_name.trim().split(/\s+/)[0] ?? "";
  const a = o.delivery_address;
  const area = [a.barangay, a.city, a.province].filter(Boolean).join(", ");
  return html`
<section class="section sf-checkout-page sf-order-page">
  <div class="section-inner">
    ${checkoutSteps(4)}
    <div class="sf-order-inner sf-order-cols">
      <div class="sf-order-card sf-order-hero">
        <div class="sf-order-check">&#10003;</div>
        <h2 class="sf-order-title">Thanks for your order${first ? `, ${first}` : ""}!</h2>
        <p class="sf-order-subtitle">We've received it and we're getting it ready.</p>

        <div class="sf-order-ref-box">
          <div>
            <div class="sf-order-ref-label">Order Reference</div>
            <div class="sf-order-ref" id="sfOrderRef">${o.order_number}</div>
          </div>
          <span class="sf-pay-pill">Status: ${o.status_label}</span>
        </div>
        <p class="sf-order-note">${PROOF_RECEIVED}</p>

        <div class="sf-order-hero-foot">
          <a href="/dashboard/sign-in/?next=orders" class="btn-cart sf-order-cta sf-order-cta-wide">Track Your Order</a>
        </div>
        <div class="sf-block sf-address-summary sf-order-shipto">
          <div class="sf-address-summary-title">Shipping Address</div>
          <div class="sf-address-summary-row"><span class="sf-address-summary-icon" aria-hidden="true">&#128100;</span><strong>${o.receiver_name}</strong></div>
          <div class="sf-address-summary-row"><span class="sf-address-summary-icon" aria-hidden="true">&#128205;</span><span>${a.line}, ${area}${a.zip ? ` ${a.zip}` : ""}${a.landmark ? ` — Landmark: ${a.landmark}` : ""}</span></div>
        </div>
      </div>
      <aside class="sf-order-card sf-order-summary">
        <h3>Order Summary</h3>
        <div>
          ${o.lines.map((l) => html`
          <div class="sf-os-line">
            <div class="sf-os-name">${l.name || "Product"}<small>&times;${l.quantity}</small></div>
            <strong class="sf-os-total">${php(l.line_charged_centavos)}</strong>
          </div>`)}
        </div>
        <div class="sf-totals">
          <div class="sf-totals-row"><span>Subtotal</span><strong>${php(o.subtotal_centavos)}</strong></div>
          <div class="sf-totals-row"><span>Shipping</span><strong>${o.shipping_charged_centavos === 0 ? html`FREE` : php(o.shipping_charged_centavos)}</strong></div>
          <div class="sf-totals-row sf-totals-grand"><span>Total</span><strong>${php(o.total_centavos)}</strong></div>
        </div>
      </aside>
    </div>
  </div>
</section>`;
}
