/* The product list: TWCinc's store_products.html (business_sites sante_barley products page). Differences, as TWCinc's own: no
   Best Seller badge (the catalog has no flags), no pagination (one page for the whole catalog). "Members price" shows only
   when Django says this buyer is a member with active benefits (quote.member_price); a guest never gets it. */
import { html, type Markup } from "../../lib/html.ts";
import type { CatalogProduct } from "../../lib/shop-api.ts";
import { PRODUCT_PLACEHOLDER, php, safeImage } from "./shop-shell.ts";

/** The four categories as the store's own footer names them (backend apps/catalog/services.py CATEGORIES). */
export const CATEGORIES: readonly { value: string; label: string }[] = [
  { value: "barley", label: "Santé Barley" },
  { value: "drinks", label: "Santé Special Drinks" },
  { value: "essentials", label: "Santé Essentials" },
  { value: "beauty", label: "Santé Beauty" },
];

export type ProductsModel = { products: CatalogProduct[]; category: string; members: boolean; message: string };

/** A word-boundary cut with an ellipsis, as Django's truncatechars. */
export function truncate(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/* The image link only repeats the title link beside it, so keyboard and screen-reader users skip it (aria-hidden,
   tabindex -1); the title link names the product. A photo keeps its alt text. */
export function productCard(p: CatalogProduct, members: boolean): Markup {
  const image = safeImage(p.image_url);
  return html`
      <div class="product-card">
        <a href="/products/${p.code}/" class="product-img-wrap sf-card-link" aria-hidden="true" tabindex="-1">
          ${image ? html`<img src="${image}" alt="${p.name}" loading="lazy">` : PRODUCT_PLACEHOLDER}
        </a>
        <div class="product-info">
          <div class="product-name"><a href="/products/${p.code}/">${p.name}</a></div>
          ${p.short_description ? html`<div class="product-desc">${truncate(p.short_description, 110)}</div>` : ""}
          <div class="product-pricing-block">
            <div class="product-price">${php(p.srp_centavos)}</div>
            ${members ? html`<div class="product-desc">Members price ${php(p.unit_members_price_centavos)} each</div>` : ""}
          </div>
          <form method="post" action="/cart/">
            <input type="hidden" name="action" value="add">
            <input type="hidden" name="product_id" value="${p.id}"><input type="hidden" name="quantity" value="1">
            <button type="submit" class="btn-cart">Add to Cart</button>
          </form>
        </div>
      </div>`;
}

export function productsContent(m: ProductsModel): Markup {
  return html`
<section class="section products-section sf-catalog">
  <div class="section-inner">
    <div class="section-header">
      <span class="section-label">Our Products</span>
      <h2 class="section-title">Shop Sant&eacute; Products</h2>
      <p class="section-subtitle">100% authentic, shipped straight from the Sant&eacute; warehouse.</p>
    </div>

    <div class="sf-facets">
      <a href="/products/" class="sf-facet-pill${m.category ? "" : " active"}">All</a>
      ${CATEGORIES.map((c) => html`<a href="/products/?category=${c.value}" class="sf-facet-pill${m.category === c.value ? " active" : ""}">${c.label}</a>`)}
    </div>

    ${m.products.length > 0 ? html`
    <div class="products-grid">
      ${m.products.map((p) => productCard(p, m.members))}
    </div>` : html`
    <div class="sf-empty">
      <p>${m.message || "No products available in this category right now. Please check back soon."}</p>
      <a href="/products/" class="btn-cart">View All Products</a>
    </div>`}
  </div>
</section>`;
}
