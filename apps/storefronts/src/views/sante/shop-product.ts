/* One product: TWCinc's store_product.html (the merchant product page): hero, quantity stepper, Add to Cart, the support
   line, the "More Details" accordion, the certification row, "You Might Also Like" and the compliance note. The catalog
   has one photo and one description pair, so the gallery thumbnails and feature sections are not shown (as TWCinc's).
   TWCinc's two support lines named Cash on Delivery and card payment; bank or e-wallet transfer is the only payment here,
   so the one line says so (plan z8uq9mek5v R6). */
import { asset } from "../../lib/assets.ts";
import { html, type Markup } from "../../lib/html.ts";
import type { CatalogProduct } from "../../lib/shop-api.ts";
import { php, safeImage } from "./shop-shell.ts";

export type ProductModel = { product: CatalogProduct; related: CatalogProduct[]; members: boolean };

/** Paragraphs as Django's linebreaks: a blank line starts a new paragraph, a single newline is a <br>. */
function paragraphs(text: string): Markup {
  const parts = text.replace(/\r\n?/g, "\n").trim().split(/\n{2,}/).filter(Boolean);
  return html`${parts.map((p) => html`<p>${p.split("\n").map((line, i) => (i === 0 ? html`${line}` : html`<br>${line}`))}</p>`)}`;
}

function trust(): Markup {
  return html`
<div class="trust-bar">
  <div class="trust-bar-label">Certified, Tested &amp; Recognized Worldwide</div>
  <div class="trust-bar-inner">
    <div class="trust-item biogro"><img src="${asset("img/certifications/biogro-certified-organic.png")}" alt="BioGro NZ Certified Organic" loading="lazy"><span class="trust-item-label">BioGro NZ Certified</span></div>
    <div class="trust-item trust-item-halal"><img src="${asset("img/certifications/halal-idcp.png")}" alt="Halal Certified" loading="lazy"><span class="trust-item-label">Halal Certified</span></div>
    <div class="trust-item"><img src="${asset("img/certifications/superbrands-philippines-choice.png")}" alt="Superbrands Philippines Choice" loading="lazy"><span class="trust-item-label">Superbrands Choice</span></div>
    <div class="trust-item trust-item-fda"><img src="${asset("img/fda-philippines.png")}" alt="Philippine FDA Registered" loading="lazy"><span class="trust-item-label">FDA Registered</span></div>
  </div>
</div>`;
}

export function productContent(m: ProductModel): Markup {
  const p = m.product;
  const image = safeImage(p.image_url);
  return html`
<section class="section sf-detail">
  <div class="section-inner">
    <div class="sf-detail-grid">

      <div class="sf-gallery">
        ${image ? html`<img class="sf-gallery-main" id="sfGalleryMain" src="${image}" alt="${p.name}">` : ""}
      </div>

      <div class="sf-detail-info">
        <h1 class="sf-detail-name">${p.name}</h1>
        <div class="sf-detail-price">${php(p.srp_centavos)}</div>
        ${m.members ? html`<p class="sf-units-note">Members price ${php(p.unit_members_price_centavos)} each</p>` : ""}
        ${p.short_description ? html`<div class="sf-detail-lead">${paragraphs(p.short_description)}</div>` : ""}

        <form method="post" action="/cart/">
          <input type="hidden" name="action" value="add">
          <input type="hidden" name="product_id" value="${p.id}">
          <div class="sf-qty-row">
            <span class="sf-qty-label">Quantity</span>
            <div class="sf-qty-stepper">
              <button type="button" data-sf-qty-minus aria-label="Decrease quantity">&#8722;</button>
              <input type="number" id="sfQty" name="quantity" value="1" min="1" max="99" inputmode="numeric">
              <button type="button" data-sf-qty-plus aria-label="Increase quantity">+</button>
            </div>
          </div>
          <button type="submit" class="btn-cart sf-add-to-cart" id="sfAddToCart">Add to Cart</button>
        </form>

        <ul class="sf-cta-support">
          <li>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            Pay by bank or e-wallet transfer
          </li>
        </ul>

        ${p.long_description ? html`
        <div class="sf-accordions">
          <div class="sf-accordion">
            <div class="faq-q" data-faq-toggle>More Details <span class="faq-icon">+</span></div>
            <div class="faq-a">${paragraphs(p.long_description)}</div>
          </div>
        </div>` : ""}
      </div>

    </div>
  </div>
</section>

<div class="sf-detail-trust">
  ${trust()}
</div>

<section class="section">
  <div class="section-inner">
    ${m.related.length > 0 ? html`
    <div class="sf-related">
      <h2 class="section-title">You Might Also Like</h2>
      <div class="products-grid">
        ${m.related.map((r) => {
          const img = safeImage(r.image_url);
          return html`
        <div class="product-card">
          <div class="product-img-wrap">${img ? html`<img src="${img}" alt="${r.name}" loading="lazy">` : ""}</div>
          <div class="product-info">
            <div class="product-name">${r.name}</div>
            <div class="product-pricing-block"><div class="product-price">${php(r.srp_centavos)}</div></div>
            <a href="/products/${r.code}/" class="btn-cart">View Product</a>
          </div>
        </div>`;
        })}
      </div>
    </div>` : ""}
    <p class="sf-legal-box">
      <strong>Important:</strong> This is a food supplement and is not intended to
      diagnose, treat, cure, or prevent any disease. No approved therapeutic
      claims. Consult your physician before use if you are pregnant, nursing,
      or taking medication.
    </p>
  </div>
</section>`;
}

