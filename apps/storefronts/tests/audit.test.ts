import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { homeDocument } from "../src/views/sante/home.ts";
import { homeModel } from "../src/views/sante/model.ts";
import { productCard } from "../src/views/sante/shop-products.ts";
import { FILLED } from "./site.ts";

const PUBLIC = path.join(import.meta.dirname, "..", "public", "assets", "sante");
const css = (f: string) => readFileSync(path.join(PUBLIC, "css", f), "utf8");
const page = homeDocument(homeModel(FILLED, undefined, new Date("2026-11-11T10:00:00+08:00"))).value;
const P = { id: "prd_AAAAAAAAAAAA", code: "SPH1", name: "Fusion <Coffee>", category: "drinks", short_description: "", long_description: "", image_url: "", srp_centavos: 45000, unit_members_price_centavos: 27000, revision: 1 };

test("home images below the fold are lazy and carry their size (item 1, lazy part)", () => {
  const imgs = page.match(/<img [^>]*img\/(about_\d|blog_\d|category_[a-z]+)\.png[^>]*>/g) ?? [];
  assert.ok(imgs.length >= 11);
  for (const i of imgs) {
    assert.match(i, /loading="lazy"/);
    if (/about_\d/.test(i)) assert.match(i, /width="1549" height="1015"/);
  }
});

test("exactly one h1 on the home page", () => {
  assert.equal((page.match(/<h1[\s>]/g) ?? []).length, 1);
  assert.equal((page.match(/class="hero-title"/g) ?? []).length, 3);
});

test("a product image link is hidden from keyboard and readers, and keeps its alt text", () => {
  const without = productCard(P, false).value;
  assert.match(without, /class="product-img-wrap sf-card-link" aria-hidden="true" tabindex="-1"/);
  assert.match(without, /<a href="\/products\/SPH1\/">Fusion &lt;Coffee&gt;<\/a>/);
  const withImg = productCard({ ...P, image_url: "https://abc123.public.blob.vercel-storage.com/p.jpg" }, false).value;
  assert.match(withImg, /aria-hidden="true" tabindex="-1"/);
  assert.match(withImg, /<img src="[^"]+" alt="Fusion &lt;Coffee&gt;"/);
});

test("the Basket link is at least 44 x 44 px", () => {
  assert.match(css("pack-storefront.css"), /\.nav-cart \{[^}]*min-width: 44px; min-height: 44px/);
});

test("skip link comes first in the body and reaches the main landmark", () => {
  assert.match(page, /<body>\n<a class="sf-skip" href="#main-content">Skip to content<\/a>/);
  assert.equal((page.match(/<main id="main-content" tabindex="-1">/g) ?? []).length, 1);
  assert.match(css("pack-storefront.css"), /\.sf-skip:focus[^{]*\{ top: 8px; \}/);
});

test("the focus ring is 2px light blue (3:1 on white and on #F7F9F7), never gold, and card titles are not focusable", () => {
  const c = css("pack-storefront.css");
  assert.match(c, /--sf-focus: #6A89FA;/);
  assert.match(c, /:root :focus-visible \{ outline: 2px solid var\(--sf-focus\); outline-offset: 2px; \}/);
  const lum = (h: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  assert.ok(ratio("#6A89FA", "#FFFFFF") >= 3);
  assert.ok(ratio("#6A89FA", "#F7F9F7") >= 3);
  assert.doesNotMatch(c.slice(c.indexOf("--sf-focus")).replace(/\/\*[^]*?\*\//g, ""), /gold|#FFD/i);
  assert.doesNotMatch(productCard(P, false).value, /<h[1-6][^>]*tabindex/);
});

test("shop pages carry the skip link first and one main landmark", async () => {
  const { shopDocument } = await import("../src/views/sante/shop-shell.ts");
  const doc = shopDocument(homeModel(FILLED, undefined, new Date("2026-11-11T10:00:00+08:00")), { title: "t", content: "<p>x</p>" } as never).value;
  assert.match(doc, /<body>\n<a class="sf-skip" href="#main-content">Skip to content<\/a>/);
  assert.equal((doc.match(/<main id="main-content" tabindex="-1">/g) ?? []).length, 1);
});

test("the home serves WebP with the PNG as fallback, and the about background offers WebP first (item 1)", () => {
  for (const n of ["category_barley", "category_drinks", "category_essential", "category_beauty", "about_1", "about_2", "about_3", "about_4", "blog_1", "blog_2", "blog_3"]) {
    assert.match(page, new RegExp(`<picture><source type="image/webp" srcset="/assets/sante/img/${n}\\.webp\\?v=[0-9a-f]{8}"><img [^>]*src="/assets/sante/img/${n}\\.png\\?v=[0-9a-f]{8}"[^>]*loading="lazy"[^>]*></picture>`));
  }
  assert.match(css("pack-home.css"), /url\('\.\.\/img\/about_bg\.png'\);\s*background-image:[^;]*image-set\(url\('\.\.\/img\/about_bg\.webp'\) type\('image\/webp'\), url\('\.\.\/img\/about_bg\.png'\) type\('image\/png'\)\)/);
});

test("a product without a photo shows a placeholder, not an empty box (item 2)", () => {
  const without = productCard(P, false).value;
  assert.match(without, /<a href="\/products\/SPH1\/" class="product-img-wrap sf-card-link" aria-hidden="true" tabindex="-1">\s*<span class="product-img-placeholder" aria-hidden="true"><svg/);
  assert.doesNotMatch(without, /<img/);
  assert.match(css("pack-home.css"), /\.product-img-placeholder \{[^}]*aspect-ratio: 1 \/ 1/);
  const withImg = productCard({ ...P, image_url: "https://abc123.public.blob.vercel-storage.com/p.jpg" }, false).value;
  assert.doesNotMatch(withImg, /product-img-placeholder/);
});
