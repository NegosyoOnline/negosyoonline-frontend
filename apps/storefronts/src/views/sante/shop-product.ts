/* One product: TWCinc's store_product.html (the merchant product page): hero, quantity stepper, Add to Cart, the support
   line, the "More Details" and "Specifications" accordions, the certification row, the Feature, Advantages and Benefits
   sections, "You Might Also Like" and the compliance note. Follows TWCinc's sante_barley product_detail.html: the extra photos
   are gallery thumbnails (a click swaps the main photo, pack-store.js) and each text section shows only when it is filled.
   An empty photo slot or text shows nothing. Photo 2 sits beside Feature, 3 beside Advantages, 4 beside Benefits, when they exist.
   TWCinc's two support lines named Cash on Delivery and card payment; bank or e-wallet transfer is the only payment here,
   so the one line says so (plan z8uq9mek5v R6). */
import { html, safe, type Markup } from "../../lib/html.ts";
import type { CatalogProduct } from "../../lib/shop-api.ts";
import { trustBadges } from "./home.ts";
import { PRODUCT_PLACEHOLDER, php, safeImage } from "./shop-shell.ts";

export type ProductModel = { product: CatalogProduct; related: CatalogProduct[]; members: boolean };

/** Paragraphs as Django's linebreaks: a blank line starts a new paragraph, a single newline is a <br>. */
function paragraphs(text: string): Markup {
  const parts = text.replace(/\r\n?/g, "\n").trim().split(/\n{2,}/).filter(Boolean);
  return html`${parts.map((p) => html`<p>${p.split("\n").map((line, i) => (i === 0 ? html`${line}` : html`<br>${line}`))}</p>`)}`;
}

/** The fixed last FAQ item on every product page. */
export const PAY_FAQ = {
  q: "How do I pay?",
  a: "Paying is simple: place your order, then send your payment by bank or e-wallet transfer using the details shown at checkout. Upload or send us your proof of payment and we will confirm it, then get your order moving. Questions along the way? Just message your Santé store.",
};

function priceRows(p: CatalogProduct): Markup {
  const members = p.unit_members_price_centavos > 0 && p.unit_members_price_centavos < p.srp_centavos;
  return html`
        <div class="sf-detail-price">${php(p.srp_centavos)}${typeof p.price_per_serving_centavos === "number" ? html` <span class="sf-per-serving">${php(p.price_per_serving_centavos)} / serving</span>` : ""}</div>
        ${members ? html`<p class="sf-members-row">Members ${php(p.unit_members_price_centavos)}${typeof p.members_price_per_serving_centavos === "number" ? html` <span class="sf-per-serving">(${php(p.members_price_per_serving_centavos)} / serving)</span>` : ""}</p>` : ""}`;
}

function trustStrip(p: CatalogProduct): Markup {
  const icon = (d: string): Markup => html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${safe(d)}</svg>`;
  // N comes from the product's own two prices; it is a percentage for display, never a money amount.
  const pct = p.srp_centavos > 0 && p.unit_members_price_centavos > 0 && p.unit_members_price_centavos < p.srp_centavos
    ? Math.floor(((p.srp_centavos - p.unit_members_price_centavos) * 100) / p.srp_centavos) : 0;
  return html`
        <ul class="sf-trust-strip" data-sf-trust>
          <li>${icon('<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>')}<span>Easy payment by bank or e-wallet transfer</span></li>
          <li>${icon('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>')}<span><a href="/#contact">Talk to your Sant&eacute; store</a> anytime</span></li>
          <li>${icon('<path d="M12 2l3 6.5 7 .9-5.2 4.8 1.4 7L12 17.8 5.8 21.2l1.4-7L2 9.4l7-.9z"/>')}<span>100% genuine Sant&eacute;, trusted since 2007</span></li>
          ${pct >= 1 ? html`<li data-sf-trust-members>${icon('<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.2"/>')}<span>Members save up to ${String(pct)}%</span></li>` : ""}
        </ul>`;
}

function faqBlock(p: CatalogProduct): Markup {
  const items = [...(p.faq ?? []), PAY_FAQ];
  return html`
          <div class="sf-accordion-group sf-faqs" data-sf-faqs>
            <h2 class="sf-faqs-title">FAQs</h2>
            ${items.map((f, i) => html`<div class="sf-accordion">
              <button type="button" class="faq-q" data-sf-acc aria-expanded="false" aria-controls="sfFaq${String(i)}">${f.q} <span class="faq-icon" aria-hidden="true">+</span></button>
              <div class="faq-a" id="sfFaq${String(i)}">${paragraphs(f.a)}</div>
            </div>`)}
          </div>`;
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
  const photos = p.image_urls.map((u) => safeImage(u));
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
        ${priceRows(p)}
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

        ${trustStrip(p)}

        ${p.long_description || p.specifications.trim() ? html`<div class="sf-accordions">
          ${p.long_description ? html`<div class="sf-accordion">
            <button type="button" class="faq-q" data-sf-acc aria-expanded="false" aria-controls="sfAccDetails">More Details <span class="faq-icon" aria-hidden="true">+</span></button>
            <div class="faq-a" id="sfAccDetails">${paragraphs(p.long_description)}</div>
          </div>` : ""}
          ${p.specifications.trim() ? html`<div class="sf-accordion">
            <button type="button" class="faq-q" data-sf-acc aria-expanded="false" aria-controls="sfAccSpecs">Specifications <span class="faq-icon" aria-hidden="true">+</span></button>
            <div class="faq-a" id="sfAccSpecs">${paragraphs(p.specifications)}</div>
          </div>` : ""}
        </div>` : ""}
        ${faqBlock(p)}
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

