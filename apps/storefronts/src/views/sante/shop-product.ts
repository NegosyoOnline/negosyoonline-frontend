/* One product: TWCinc's store_product.html (the merchant product page): hero, quantity stepper, Add to Cart, the support
   line, the "More Details" and "Specifications" accordions, the certification row, the Feature, Advantages and Benefits
   sections, "You Might Also Like" and the compliance note. Follows TWCinc's sante_barley product_detail.html: the extra photos
   are gallery thumbnails (a click swaps the main photo, pack-store.js) and each text section shows only when it is filled.
   An empty photo slot or text shows nothing. Photo 2 sits beside Feature, 3 beside Advantages, 4 beside Benefits, when they exist.
   TWCinc's two support lines named Cash on Delivery and card payment; bank or e-wallet transfer is the only payment here,
   so the one line says so (plan z8uq9mek5v R6). */
import { html, type Markup } from "../../lib/html.ts";
import type { CatalogProduct } from "../../lib/shop-api.ts";
import { trustBadges } from "./home.ts";
import { PRODUCT_PLACEHOLDER, php, safeImage } from "./shop-shell.ts";

export type ProductModel = { product: CatalogProduct; related: CatalogProduct[]; members: boolean };

/** Paragraphs as Django's linebreaks: a blank line starts a new paragraph, a single newline is a <br>. */
function paragraphs(text: string): Markup {
  const parts = text.replace(/\r\n?/g, "\n").trim().split(/\n{2,}/).filter(Boolean);
  return html`${parts.map((p) => html`<p>${p.split("\n").map((line, i) => (i === 0 ? html`${line}` : html`<br>${line}`))}</p>`)}`;
}

function trust(): Markup {
  return html`
<div class="trust-bar">
  ${trustBadges()}
</div>`;
}

export function productContent(m: ProductModel): Markup {
  const p = m.product;
  const image = safeImage(p.image_url);
  const photos = p.image_urls.map(safeImage);
  if (image && !photos[0]) photos[0] = image;
  const thumbs = photos.filter(Boolean);
  const fab = (kind: string, eyebrow: string, title: string, text: string, photo: string, cls: string): Markup =>
    text.trim() ? html`
<section class="sf-fab ${cls}" data-sf-${kind}>
  <div class="section-inner">
    <div class="sf-fab-block${cls ? " sf-fab-reverse" : ""}">
      ${photo ? html`<div class="sf-fab-img"><img src="${photo}" alt="" loading="lazy"></div>` : ""}
      <div class="sf-fab-text">
        <div class="sf-fab-eyebrow">${eyebrow}</div>
        <h2 class="sf-fab-title">${title}</h2>
        <div class="sf-fab-body">${paragraphs(text)}</div>
      </div>
    </div>
  </div>
</section>` : html``;
  return html`
<section class="section sf-detail">
  <div class="section-inner">
    <div class="sf-detail-grid">

      <div class="sf-gallery">
        ${image ? html`<img class="sf-gallery-main" id="sfGalleryMain" src="${image}" alt="${p.name}">` : ""}
        ${thumbs.length > 1 ? html`<div class="sf-gallery-thumbs">${thumbs.map((u, i) => html`<img src="${u}" alt="" data-sf-thumb${i === 0 ? html` class="active"` : ""}>`)}</div>` : ""}
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

        ${p.long_description || p.specifications.trim() ? html`
        <div class="sf-accordions">
          ${p.long_description ? html`<div class="sf-accordion">
            <button type="button" class="faq-q" data-sf-acc aria-expanded="false" aria-controls="sfAccDetails">More Details <span class="faq-icon" aria-hidden="true">+</span></button>
            <div class="faq-a" id="sfAccDetails">${paragraphs(p.long_description)}</div>
          </div>` : ""}
          ${p.specifications.trim() ? html`<div class="sf-accordion">
            <button type="button" class="faq-q" data-sf-acc aria-expanded="false" aria-controls="sfAccSpecs">Specifications <span class="faq-icon" aria-hidden="true">+</span></button>
            <div class="faq-a" id="sfAccSpecs">${paragraphs(p.specifications)}</div>
          </div>` : ""}
        </div>` : ""}
      </div>

    </div>
  </div>
</section>

<div class="sf-detail-trust">
  ${trust()}
</div>

${fab("feature", "Product Feature", "What's Inside", p.features, photos[1] ?? "", "")}
${fab("advantages", "Advantages", "Why It Stands Out", p.advantages, photos[2] ?? "", "sf-fab-tinted")}
${fab("benefits", "Benefits", "What You Get From It", p.benefits, photos[3] ?? "", "")}

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
          <div class="product-img-wrap">${img ? html`<img src="${img}" alt="${r.name}" loading="lazy">` : PRODUCT_PLACEHOLDER}</div>
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

