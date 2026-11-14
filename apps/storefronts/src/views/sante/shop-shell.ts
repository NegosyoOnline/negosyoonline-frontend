/* The shop pages' shell: TWCinc's store_base.html (announce bar, navbar, content, footer, basket drawer) over this
   storefront's home nav and footer (storeNav, storeFooter), plus the basket drawer's rows (TWCinc _store_drawer.html).
   Every amount arrives from Django in centavos and is only written out here; no price is worked out in this file. */
import { asset } from "../../lib/assets.ts";
import { html, type Markup } from "../../lib/html.ts";
import { localMediaOrigin } from "../../lib/local-media.ts";
import type { CartLine } from "../../lib/shop-cart.ts";
import { countOf } from "../../lib/shop-cart.ts";
import type { Quote } from "../../lib/shop-api.ts";
import { storeDrawer, storeFooter, storeNav } from "./home.ts";
import type { HomeModel } from "./model.ts";

/** Centavos as TWCinc's pages write them after the peso sign: "1,488.00". */
export function money(centavos: number): string {
  const sign = centavos < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(centavos));
  return `${sign}${Math.floor(abs / 100).toLocaleString("en-US")}.${String(abs % 100).padStart(2, "0")}`;
}

/** "&#8369;1,488.00" */
export function php(centavos: number): Markup {
  return html`&#8369;${money(centavos)}`;
}

/** A product photo is shown only from the public media store's own https host (the CSP allows no other). Local development
    only: when STOREFRONT_LOCAL_MEDIA_ORIGIN is exactly a loopback http origin, photos under that origin are shown too. */
export function safeImage(url: string, source: Record<string, string | undefined> = process.env): string {
  if (/^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/[^\s"'<>]+$/.test(url)) return url;
  const local = localMediaOrigin(source);
  return local && url.startsWith(`${local}/`) && /^[^\s"'<>]+$/.test(url.slice(local.length + 1)) ? url : "";
}

/** What a product card shows when the product has no photo: a neutral bottle mark centred on the card's own light
    background (the green and gradient pack-home.css already uses). Decorative, so hidden from readers. */
export const PRODUCT_PLACEHOLDER: Markup = html`<span class="product-img-placeholder" aria-hidden="true"><svg viewBox="0 0 48 48" width="56" height="56" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d="M19 5h10v6l3 4v26a3 3 0 0 1-3 3H19a3 3 0 0 1-3-3V15l3-4z"/><path d="M16 22h16M16 33h16"/></svg></span>`;

export type DrawerLine = { id: string; name: string; unit_centavos: number; quantity: number; available: boolean; image: string };

export function itemsLabel(count: number): string {
  return `${count} item${count === 1 ? "" : "s"}`;
}

/** The basket drawer's data. `quote` null with lines in the basket means the prices could not be read now. */
export function drawerOf(lines: CartLine[], quote: Quote | null, images: Map<string, string>): HomeModel["drawer"] {
  const count = countOf(lines);
  const rows: DrawerLine[] = quote
    ? quote.lines.map((l) => ({
        id: l.id, name: l.name, quantity: l.quantity, available: l.available, image: images.get(l.id) ?? "",
        unit_centavos: quote.member_price && l.unit_members_price_centavos !== null && quote.ship_mode === "home" ? l.unit_members_price_centavos : l.unit_srp_centavos,
      }))
    : [];
  return {
    count, count_label: itemsLabel(count), subtotal: quote ? money(quote.subtotal_centavos) : "0.00", lines: lines.length > 0,
    error: lines.length > 0 && !quote ? "We could not load your basket. Please try again." : "",
    rows: html`${rows.map(drawerRow)}`,
  };
}

function drawerRow(l: DrawerLine): Markup {
  return html`
      <div class="sf-drawer-item">
        ${l.image ? html`<img src="${l.image}" alt="">` : html`<span class="sf-drawer-noimg"></span>`}
        <div class="sf-drawer-item-info">
          <div class="sf-drawer-item-name">${l.name || "Product"}</div>
          <div class="sf-drawer-item-price">${l.available ? php(l.unit_centavos) : html`No longer available`}</div>
        </div>
        <div class="sf-drawer-item-actions">
          ${l.available ? html`
          <form method="post" action="/cart/" data-sf-drawer-form>
            <input type="hidden" name="action" value="set"><input type="hidden" name="product_id" value="${l.id}">
            <div class="sf-qty-stepper">
              <button type="submit" name="quantity" value="${l.quantity - 1}" aria-label="Decrease"${l.quantity <= 1 ? html` disabled` : ""}>&minus;</button>
              <span>${l.quantity}</span>
              <button type="submit" name="quantity" value="${l.quantity + 1}" aria-label="Increase"${l.quantity >= 99 ? html` disabled` : ""}>+</button>
            </div>
          </form>` : ""}
          <form method="post" action="/cart/" data-sf-drawer-form>
            <input type="hidden" name="action" value="remove"><input type="hidden" name="product_id" value="${l.id}">
            <button type="submit" class="sf-remove" aria-label="Remove" data-sf-drawer-remove>&#128465;</button>
          </form>
        </div>
      </div>`;
}

export type ShopPage = {
  title: string;
  content: Markup;
  css?: string[];
  scripts?: string[];
  /** Markup placed after the footer and before the drawer (the checkout's modals). */
  afterContent?: Markup;
};

export function shopDocument(v: HomeModel, p: ShopPage): Markup {
  return html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex">
  <title>${p.title} — ${v.store_name}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&amp;display=swap">
  <link rel="stylesheet" href="${asset("css/pack-home.css")}">
  <link rel="stylesheet" href="${asset("css/pack-storefront.css")}">
  ${(p.css ?? []).map((c) => html`<link rel="stylesheet" href="${asset(c)}">`)}
</head>
<body>
<a class="sf-skip" href="#main-content">Skip to content</a>
${v.free_shipping_banner ? html`<div class="sf-announce">&#128666; <strong>FREE SHIPPING</strong> on all orders — for a limited time!</div>` : ""}
${storeNav(v)}
<main id="main-content" tabindex="-1">
${p.content}
</main>
${storeFooter(v)}
${p.afterContent ?? ""}
${storeDrawer(v)}
<script src="${asset("js/pack-home.js")}"></script>
<script src="${asset("js/pack-store.js")}"></script>
${(p.scripts ?? []).map((s) => html`<script src="${asset(s)}"></script>`)}
</body>
</html>
`;
}
