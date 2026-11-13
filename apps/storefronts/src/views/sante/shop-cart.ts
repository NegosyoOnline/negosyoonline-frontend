/* The cart page: TWCinc's store_cart.html. The server draws the rows from the quote, so every figure is Django's. The quantity
   buttons are submit buttons that send the new quantity (no script needed); a quantity can not go below 1, Remove takes a line out.
   The Metro Manila note shows while the shipping shown is an estimate; the "FREE" shipping label shows under the `zero` policy. */
import { html, type Markup } from "../../lib/html.ts";
import type { Quote } from "../../lib/shop-api.ts";
import { MSG_EMPTY_CART } from "../../lib/shop-flow-text.ts";
import { php, safeImage } from "./shop-shell.ts";

export type CartModel = { quote: Quote | null; images: Map<string, string>; error: string; empty: boolean };

/** The shipping line of the totals: the quote's own label, FREE under the `zero` policy. */
export function shippingCell(q: Quote): Markup {
  return q.shipping.policy === "zero" ? html`FREE` : php(q.shipping.charged_centavos);
}

export function cartContent(m: CartModel): Markup {
  const q = m.quote;
  const lines = q?.lines ?? [];
  const ready = q !== null && q.ok;
  return html`
<section class="section sf-cart-page">
  <div class="section-inner">
    <div class="section-header">
      <span class="section-label">Your Cart</span>
      <h2 class="section-title">Review Your Items</h2>
      ${lines.length > 0 && q && q.shipping.estimated && q.shipping.policy !== "zero" ? html`<p class="section-subtitle sf-quote-note">Shipping shown is a Metro Manila estimate — your exact fee appears at checkout once you enter your delivery address.</p>` : ""}
    </div>
    ${m.error ? html`<p class="sf-quote-error" role="alert">${m.error}</p>` : ""}

    ${m.empty || lines.length === 0 ? html`
    <div class="sf-empty">
      <p>${MSG_EMPTY_CART}</p>
      <a href="/products/" class="btn-cart">Shop Products</a>
    </div>` : html`
    <div>
      <div class="sf-table-scroll">
        <table class="sf-cart-table">
          <thead>
            <tr><th>Item</th><th>Qty</th><th>Line Total</th><th></th></tr>
          </thead>
          <tbody>
            ${lines.map((l) => {
              const image = safeImage(m.images.get(l.id) ?? "");
              return html`
            <tr>
              <td class="sf-cart-item">${image ? html`<img src="${image}" alt="">` : ""}<span>${l.name || "Product"}</span></td>
              <td>
                ${l.available ? html`
                <form method="post" action="/cart/">
                  <input type="hidden" name="action" value="set"><input type="hidden" name="product_id" value="${l.id}">
                  <div class="sf-qty-stepper">
                    <button type="submit" name="quantity" value="${l.quantity - 1}" aria-label="Decrease"${l.quantity <= 1 ? html` disabled` : ""}>−</button>
                    <span>${l.quantity}</span>
                    <button type="submit" name="quantity" value="${l.quantity + 1}" aria-label="Increase"${l.quantity >= 99 ? html` disabled` : ""}>+</button>
                  </div>
                </form>` : html`${l.quantity}`}
              </td>
              <td>${l.available ? php(l.line_total_centavos) : html`No longer available`}</td>
              <td>
                <form method="post" action="/cart/">
                  <input type="hidden" name="action" value="remove"><input type="hidden" name="product_id" value="${l.id}">
                  <button type="submit" class="sf-remove" aria-label="Remove">&#10005;</button>
                </form>
              </td>
            </tr>`;
            })}
          </tbody>
        </table>
      </div>

      <div class="sf-totals">
        ${ready && q ? html`
        <div class="sf-totals-row"><span>Subtotal</span><strong>${php(q.subtotal_centavos)}</strong></div>
        <div class="sf-totals-row"><span>Shipping</span><strong>${shippingCell(q)}</strong></div>
        <div class="sf-totals-row sf-totals-grand"><span>Total</span><strong>${php(q.total_centavos)}</strong></div>` : q && q.errors.length > 0 ? html`<p class="sf-quote-error" role="alert">${q.errors[0]}</p>` : ""}
      </div>

      <div class="sf-cart-actions">
        <a href="/products/" class="sf-continue-link">&#8249; Continue shopping</a>
        ${ready ? html`<a href="/checkout/" class="btn-cart sf-checkout-cta">Proceed to Checkout</a>` : ""}
      </div>
    </div>`}
  </div>
</section>`;
}
