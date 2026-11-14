import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { assetVersions } from "../src/lib/assets.ts";
import { CART, ORDER, cookieName } from "../src/lib/cookies.ts";
import { applyChange, countOf, parseCart, readCart, serializeCart, MAX_LINES } from "../src/lib/shop-cart.ts";
import { fetchCatalog, shopQuote, parseBuyerOrder } from "../src/lib/shop-api.ts";
import { addressErrors, cartGet, cartPost, checkoutGet, checkoutPost, doneGet, localDigits, productGet, productsGet, readOrder, shopOf, splitName } from "../src/lib/shop-flow.ts";
import { productContent } from "../src/views/sante/shop-product.ts";
import { homeDocument } from "../src/views/sante/home.ts";
import { homeModel } from "../src/views/sante/model.ts";
import { money, safeImage } from "../src/views/sante/shop-shell.ts";
import { localMediaOrigin } from "../src/lib/local-media.ts";
import { shopCard } from "../src/views/sante/pack-orders.ts";
import { SITE } from "./site.ts";

const secret = randomBytes(24).toString("hex"); // throwaway, made for this run only
const env = { apiBase: "http://api.test", secret };
const PUBLIC = path.join(import.meta.dirname, "..", "public");

const P1 = { id: "prd_AAAAAAAAAAAA", code: "SPH1", name: "Fusion <Coffee>", category: "drinks", short_description: "Good.", long_description: "More.\n\nAnd more.", image_url: "", srp_centavos: 45000, unit_members_price_centavos: 27000, revision: 1 };
const P2 = { id: "prd_BBBBBBBBBBBB", code: "SPH2", name: "Barley", category: "barley", short_description: "", long_description: "", image_url: "https://abc123.public.blob.vercel-storage.com/p2.jpg", srp_centavos: 74000, unit_members_price_centavos: 44400, revision: 1 };
const ACCOUNT = { id: "acc_1", kind: "bank", account_type: "savings", provider_name: "BDO", account_name: "Demo Store", account_number: "0012", has_qr: true };

type Opts = {
  member?: boolean; quoteStatus?: number; placeStatus?: number; placeBody?: unknown; accounts?: unknown[];
  /** Extra quote fields (home_address, home_address_source) and a change to the quote's shipping. */
  quoteExtra?: Record<string, unknown>; estimated?: boolean;
  /** Extra fields of the buyer's order view (the parity fields), and per-line extras. */
  viewExtra?: Record<string, unknown>; lineExtra?: Record<string, unknown>;
  /** A fixed answer of the member address save (the fake saves and answers 200 without it). */
  addressReply?: { status: number; body: unknown };
  /** Django's ZIP lookup answer for the address form (none: the lookup finds nothing). */
  zip?: { zip_code: string; zip_precision: string };
  /** The product reviews pages Django answers (page 1 first), and a fixed answer of the buyer review save. */
  reviewPages?: unknown[]; reviewReply?: { status: number; body: unknown };
  /** The Membership Pack read: "on" answers a pack, "throw" fails the call, anything else is off (404). */
  pack?: "on" | "throw";
};

/** A fake Django: records every call and answers the shop routes. `member` means the token is a member with active benefits. */
function backend(o: Opts = {}) {
  const calls: { url: string; body: unknown; form?: FormData; method?: string }[] = [];
  let extra = o.quoteExtra; // the address save changes what the next quote carries, like the real backend
  const fetchImpl = (url: string, init: RequestInit) => {
    const u = new URL(url);
    const path = u.pathname;
    if (path.endsWith("/catalog/products/")) return Promise.resolve(Response.json({ products: [P1, P2] }));
    if (path.endsWith("/storefront/v1/pack/")) {
      if (o.pack === "throw") return Promise.reject(new Error("down"));
      return Promise.resolve(o.pack === "on" ? Response.json({ price_centavos: 150000, currency: "PHP", available: true, agreement: null, payment_accounts: [] }) : Response.json({}, { status: 404 }));
    }
    if (path.endsWith("/shop/payment-accounts/")) return Promise.resolve(Response.json({ available: true, accounts: o.accounts ?? [ACCOUNT] }));
    if (path.endsWith("/member/me/")) return Promise.resolve(Response.json({ member: { id: "m1", full_name: "Ana Reyes", email: "ana@example.test", mobile: "+639171234567", email_verified: true, mobile_verified: true } }));
    if (init.body instanceof FormData) {
      calls.push({ url, body: Object.fromEntries([...init.body.entries()].filter(([, v]) => typeof v === "string")), form: init.body });
      if (path.endsWith("/shop/orders/")) return Promise.resolve(Response.json(o.placeBody ?? { order_id: "sho_1", order_number: "SO00001", view_token: "T".repeat(43), replay: false }, { status: o.placeStatus ?? 200 }));
    }
    const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ url, body, method: init.method });
    if (path.endsWith("/shop/products/" + P1.id + "/reviews/")) return Promise.resolve(Response.json(o.reviewPages?.[Number(u.searchParams.get("page")) - 1] ?? { rating_average: null, rating_count: 0, page: 1, page_size: 10, has_more: false, reviews: [] }));
    if (path.includes("/lines/") && path.endsWith("/review/")) return Promise.resolve(Response.json(o.reviewReply?.body ?? { id: "rev_1", rating: body.rating, body: body.body ?? "", display_name: body.display_name ?? "Ana R.", created_at: "2026-11-14T02:00:00Z", edited: false, can_edit: true }, { status: o.reviewReply?.status ?? 200 }));
    if (path.endsWith("/address/zip/")) return Promise.resolve(Response.json(o.zip ? { ok: true, ...o.zip } : { ok: false, zip_code: "", zip_precision: "" }));
    if (path.endsWith("/member/address/")) {
      if (o.addressReply) return Promise.resolve(Response.json(o.addressReply.body, { status: o.addressReply.status }));
      const saved = Object.fromEntries(Object.entries(body).filter(([k]) => !["host", "visitor_ip", "member_token"].includes(k)));
      extra = { ...extra, home_address: saved, home_address_source: "profile" };
      return Promise.resolve(Response.json({ home_address: saved, home_address_source: "profile" }));
    }
    if (path.endsWith("/shop/quote/")) {
      const token = body.member_token as string;
      if (token === "stale") return Promise.resolve(Response.json({ error: { code: "member_session_invalid", message: "Not signed in." } }, { status: 401 }));
      const members = !!o.member && token !== "";
      const mode = members ? (body.ship_mode === "different" ? "different" : "home") : "guest";
      const lines = (body.lines as { id: string; qty: number }[]).map((l) => {
        const p = l.id === P1.id ? P1 : l.id === P2.id ? P2 : null;
        if (!p) return { id: l.id, code: "", name: "", quantity: l.qty, available: false, error: "This product is no longer available. Remove it to continue.", unit_srp_centavos: 0, unit_members_price_centavos: null, line_total_centavos: 0 };
        return { id: p.id, code: p.code, name: p.name, quantity: l.qty, available: true, error: "", unit_srp_centavos: p.srp_centavos, unit_members_price_centavos: members ? p.unit_members_price_centavos : null, line_total_centavos: l.qty * (mode === "home" ? p.unit_members_price_centavos : p.srp_centavos) };
      });
      const ok = lines.every((l) => l.available);
      const subtotal = lines.reduce((n, l) => n + l.line_total_centavos, 0);
      return Promise.resolve(Response.json({ ok, member_price: members, ship_mode: mode, lines, subtotal_centavos: subtotal, shipping: { charged_centavos: 0, policy: "zero", estimated: o.estimated ?? true, available: true, error: "", note: "This store pays your shipping." }, total_centavos: subtotal, fingerprint: ok ? `fp-${mode}-${subtotal}` : "", errors: ok ? [] : ["This product is no longer available. Remove it to continue."], currency: "PHP", ...(members ? extra : {}) }, { status: o.quoteStatus ?? 200 }));
    }
    if (path.includes("/shop/orders/") && path.endsWith("/view/")) {
      if (body.view_token !== "T".repeat(43)) return Promise.resolve(Response.json({ error: { code: "not_found", message: "Not found." } }, { status: 404 }));
      return Promise.resolve(Response.json({ id: "sho_1", order_number: "SO00001", status: "placed", status_label: "Payment under review", tracker: ["Order Placed", "Order Confirmed", "Shipped", "Delivered"], cancelled: false, created_at: "2026-11-13T02:00:00Z", ship_mode: "guest", receiver_name: "Ana Reyes", delivery_address: { line: "1 St", barangay: "B", city: "C", province: "P", zip: "1300", landmark: "Near" }, subtotal_centavos: 45000, shipping_charged_centavos: 0, total_centavos: 45000, currency: "PHP", courier: "", tracking_no: "", shipped_on: null, delivered_on: null, lines: [{ code: "SPH1", name: P1.name, quantity: 1, line_charged_centavos: 45000, ...o.lineExtra }], ...o.viewExtra }));
    }
    return Promise.resolve(Response.json({}, { status: 500 }));
  };
  return { calls, fetchImpl };
}

function shop(b: ReturnType<typeof backend>, cookie = "", headers: Record<string, string> = {}) {
  const request = new Request("http://demo.test:3070/cart/", { headers: { host: "demo.test:3070", cookie, ...headers } });
  const s = shopOf(request, SITE, { request, host: "demo.test", visitor_ip: "", member_token: /no_member=([A-Za-z0-9_-]+)/.exec(cookie)?.[1] ?? "", binding: "", env: { ...env, hostAliases: "" } });
  s.calls = { env, fetchImpl: b.fetchImpl, log: () => {} };
  return s;
}

const MEMBER = "no_member=" + "M".repeat(43);
const text = (r: Response) => r.text();

/* ---- the basket cookie --------------------------------------------------------------------------------------------- */

test("the basket cookie round-trips and a hand-edited one only shrinks to valid lines", () => {
  const lines = [{ id: "prd_A", qty: 2 }, { id: "prd_B", qty: 99 }];
  assert.equal(serializeCart(lines), "prd_A.2~prd_B.99");
  assert.deepEqual(parseCart("prd_A.2~prd_B.99"), lines);
  assert.deepEqual(parseCart("prd_A.0~bad id.1~prd_A.3~x.-2~prd_C.500~~.4"), [{ id: "prd_A", qty: 3 }, { id: "prd_C", qty: 99 }]);
  const many = Array.from({ length: 30 }, (_, i) => `p${i}.1`).join("~");
  assert.equal(parseCart(many).length, MAX_LINES);
  assert.equal(countOf(lines), 101);
});

test("the cart cookie and the order cookie are named like the other host-only cookies", () => {
  assert.equal(cookieName(CART, true), "__Host-no_cart");
  assert.equal(cookieName(ORDER, false), "no_order");
  const r = new Request("http://a.test/", { headers: { cookie: "no_cart=prd_A.2~prd_B.1" } });
  assert.deepEqual(readCart(r), [{ id: "prd_A", qty: 2 }, { id: "prd_B", qty: 1 }]);
  assert.deepEqual(readCart(new Request("http://a.test/", { headers: { cookie: "no_cart=prd_A.2; no_cart=prd_B.1" } })), []);
  assert.equal(readOrder(new Request("http://a.test/", { headers: { cookie: `no_order=sho_1.${"T".repeat(43)}` } }))?.id, "sho_1");
  assert.equal(readOrder(new Request("http://a.test/", { headers: { cookie: "no_order=junk" } })), null);
});

test("add, set and remove keep quantity 1 to 99 and 20 lines", () => {
  let r = applyChange([], { action: "add", id: "prd_A", qty: 1 });
  assert.deepEqual(r.lines, [{ id: "prd_A", qty: 1 }]);
  r = applyChange(r.lines, { action: "add", id: "prd_A", qty: 98 });
  assert.deepEqual(r.lines, [{ id: "prd_A", qty: 99 }]);
  assert.equal(applyChange(r.lines, { action: "add", id: "prd_A", qty: 5 }).lines[0].qty, 99);
  assert.match(applyChange(r.lines, { action: "set", id: "prd_A", qty: 100 }).error, /1 to 99/);
  assert.match(applyChange(r.lines, { action: "set", id: "prd_A", qty: 0 }).error, /1 to 99/);
  assert.equal(applyChange(r.lines, { action: "set", id: "prd_A", qty: 7 }).lines[0].qty, 7);
  assert.deepEqual(applyChange(r.lines, { action: "remove", id: "prd_A", qty: 0 }).lines, []);
  const full = Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, qty: 1 }));
  assert.match(applyChange(full, { action: "add", id: "new", qty: 1 }).error, /up to 20/);
  assert.match(applyChange([], { action: "add", id: "../x", qty: 1 }).error, /Check the products/);
});

/* ---- the calls ----------------------------------------------------------------------------------------------------- */

test("the quote call sends ids, quantities, ship mode and address, never a price, with the credential", async () => {
  const b = backend();
  const r = await shopQuote({ host: "h.test", visitor_ip: "", lines: [{ id: P1.id, qty: 2 }], member_token: "", ship_mode: "", address: null }, { env, fetchImpl: b.fetchImpl, log: () => {} });
  assert.equal(r.state, "ok");
  assert.ok(b.calls[0].url.endsWith("/storefront/v1/shop/quote/"));
  assert.deepEqual(Object.keys(b.calls[0].body as object).sort(), ["host", "lines", "member_token", "ship_mode", "visitor_ip"]);
  assert.equal(JSON.stringify(b.calls[0].body).includes("price"), false);
});

test("the catalog read fails closed: 404 quietly, no secret no call", async () => {
  const f = (status: number) => (() => Promise.resolve(Response.json({}, { status }))) as never;
  assert.equal(await fetchCatalog("h", { env, fetchImpl: f(404), log: () => {} }), null);
  assert.equal(await fetchCatalog("h", { env: { apiBase: "x", secret: "short" }, fetchImpl: f(200), log: () => {} }), null);
  assert.equal(await fetchCatalog("h", { env, fetchImpl: f(500), log: () => {} }), null);
});

test("the buyer's order view reads Django's shape", () => {
  assert.equal(parseBuyerOrder({}), null);
  assert.equal(parseBuyerOrder({ id: "a", order_number: "SO1", total_centavos: 5, lines: [] })?.order_number, "SO1");
});

/* ---- products ------------------------------------------------------------------------------------------------------ */

test("a guest sees SRP and never the members price; a member with benefits sees both", async () => {
  const guest = await text(await productsGet(shop(backend())));
  assert.match(guest, /Shop Sant&eacute; Products/);
  assert.match(guest, /&#8369;450\.00/);
  assert.doesNotMatch(guest, /Members price/);
  assert.match(guest, /Fusion &lt;Coffee&gt;/, "a product name is escaped");
  const member = await text(await productsGet(shop(backend({ member: true }), MEMBER)));
  assert.match(member, /Members price &#8369;270\.00 each/);
  const benefitless = await text(await productsGet(shop(backend({ member: false }), MEMBER)));
  assert.doesNotMatch(benefitless, /Members price/);
});

test("category pills filter; an unknown category shows all; the Add to Cart form posts ids only", async () => {
  const drinks = await text(await productsGet(shop(backend(), "", {}) ));
  assert.match(drinks, /sf-facet-pill active">All/);
  const b = backend();
  const s = shop(b);
  s.request = new Request("http://demo.test/products/?category=barley", { headers: { host: "demo.test" } });
  const page = await text(await productsGet(s));
  assert.match(page, /sf-facet-pill active">Santé Barley/);
  assert.match(page, /abc123\.public\.blob\.vercel-storage\.com/);
  assert.doesNotMatch(page, /Fusion/);
  assert.match(page, /name="action" value="add"/);
  assert.doesNotMatch(page, /name="price/i);
});

test("one product by code; an unknown code is the neutral 404; related products are others", async () => {
  const ok = await productGet(shop(backend()), "SPH1");
  assert.equal(ok.status, 200);
  const page = await text(ok);
  assert.match(page, /Easy payment by bank or e-wallet transfer/);
  assert.doesNotMatch(page, /Cash on Delivery|credit or debit card/i);
  assert.match(page, /You Might Also Like/);
  assert.equal((await productGet(shop(backend()), "NOPE")).status, 404);
});

const B = "https://abc123.public.blob.vercel-storage.com/";
const FULL = { ...P1, image_url: B + "a.jpg", image_urls: [B + "a.jpg", B + "b.jpg", null, B + "d.jpg", null], features: "Rich <b>in</b> fibre.", specifications: "Net 100g", advantages: "Easy.\n\nFast.", benefits: "Energy." };

test("an older API without the detail keys gives empty texts and the one photo; a new one gives five slots", async () => {
  const old = await fetchCatalog("h.test", { env, fetchImpl: backend().fetchImpl, log: () => {} });
  assert.deepEqual(old?.[1].image_urls, [P2.image_url, "", "", "", ""]);
  assert.equal(old?.[1].features, "");
  const fetchImpl = () => Promise.resolve(Response.json({ products: [FULL] }));
  const now = await fetchCatalog("h.test", { env, fetchImpl: fetchImpl as never, log: () => {} });
  assert.deepEqual(now?.[0].image_urls, [B + "a.jpg", B + "b.jpg", "", B + "d.jpg", ""]);
  assert.equal(now?.[0].advantages, "Easy.\n\nFast.");
});

test("the product page shows extra photos as thumbnails and the four sections only when filled", () => {
  const rel: never[] = [];
  const full = productContent({ product: { ...FULL, image_urls: FULL.image_urls.map((u) => u ?? "") }, related: rel, members: false }).value;
  assert.equal(full.match(/data-sf-thumb/g)?.length, 3);
  assert.match(full, /data-sf-thumb class="active"/);
  assert.match(full, /Product Feature[\s\S]*What Makes It Special/);
  assert.match(full, /Rich &lt;b&gt;in&lt;\/b&gt; fibre\./);
  assert.match(full, /<button type="button" class="faq-q" data-sf-acc aria-expanded="false" aria-controls="sfAccSpecs">Specifications <span class="faq-icon" aria-hidden="true">\+<\/span><\/button>/);
  assert.match(full, /<button type="button" class="faq-q" data-sf-acc aria-expanded="false" aria-controls="sfAccDetails">More Details /);
  assert.doesNotMatch(full, /data-faq-toggle/, "the home FAQ's one-open-at-a-time script is not attached to these");
  assert.match(full, /Why It Stands Out/);
  assert.match(full, /What You Get From It/);
  assert.equal(full.match(/class="sf-fab-img"/g)?.length, 2); // photo 2 beside Feature, photo 4 beside Benefits; slot 3 is empty
  const bare = productContent({ product: { ...P1, image_url: B + "a.jpg", image_urls: [B + "a.jpg", "", "", "", ""], features: "", specifications: "", advantages: "", benefits: "" }, related: rel, members: false }).value;
  assert.doesNotMatch(bare, /data-sf-thumb|sf-gallery-thumbs|sf-fab|Specifications/);
});

test("product page accordions and detail sections have their own light-page and gutter rules", () => {
  const css = readFileSync(path.join(process.cwd(), "public/assets/sante/css/pack-storefront.css"), "utf8");
  assert.match(css, /\.sf-accordion \.faq-q \{[^}]*color: var\(--text\)/);
  assert.match(css, /\.sf-accordion \.faq-icon \{[^}]*color: var\(--green-dark\)/);
  assert.match(css, /\.sf-accordion\.open \.faq-a \{ display: block; \}/);
  assert.match(css, /\.sf-fab \{ padding: 48px 20px; \}/);
  assert.match(css, /\.sf-fab \{ padding: 64px 40px; \}/);
});

const BADGES = ["Trusted Since 2007", "BioGro NZ Certified", "Global Standard", "Halal Certified", "FDA Registered"];
const badgeLabels = (page: string) => [...page.matchAll(/class="trust-item-label">([^<]+)</g)].map((m) => m[1]);

test("the product page and the home page show the same five certification badges, in TWCinc's order, no Superbrands", async () => {
  const product = await text(await productGet(shop(backend()), "SPH1"));
  const home = homeDocument(homeModel(SITE, undefined, new Date("2026-11-11T10:00:00+08:00"))).value;
  for (const page of [product, home]) {
    assert.deepEqual(badgeLabels(page), BADGES);
    assert.match(page, /Certified, Tested &amp; Recognized Worldwide/);
    assert.doesNotMatch(page, /superbrands/i);
  }
  assert.equal(product.match(/<div class="trust-item[ "]/g)?.length, 5);
});

test("pages carry no inline script and load nothing from another origin but the font and the media store", async () => {
  const page = await text(await productsGet(shop(backend())));
  assert.doesNotMatch(page, /<script(?![^>]*\ssrc=)[^>]*>[^<]/);
  assert.doesNotMatch(page, /\son[a-z]+\s*=|javascript:/i);
  for (const m of page.matchAll(/(?:src|href)="(https?:[^"]+)"/g)) {
    assert.ok(/^https:\/\/(fonts\.g|[a-z0-9-]+\.public\.blob\.vercel-storage\.com)/.test(m[1]), m[1]);
  }
});

test("a photo from any other host is not shown", () => {
  assert.equal(safeImage("https://evil.test/x.jpg"), "");
  assert.equal(safeImage("http://abc.public.blob.vercel-storage.com/x.jpg"), "");
  assert.equal(safeImage("https://abc.public.blob.vercel-storage.com/x.jpg"), "https://abc.public.blob.vercel-storage.com/x.jpg");
});

test("local media (dev only): unset changes nothing; a loopback http origin is accepted; anything else is ignored", () => {
  const local = "http://127.0.0.1:8141/files/products/a.jpg";
  assert.equal(safeImage(local, {}), "", "unset: not shown");
  assert.equal(safeImage(local), "", "the real environment has it unset");
  assert.equal(safeImage(local, { STOREFRONT_LOCAL_MEDIA_ORIGIN: "http://127.0.0.1:8141" }), local);
  assert.equal(safeImage("http://localhost:8141/files/a.jpg", { STOREFRONT_LOCAL_MEDIA_ORIGIN: "http://localhost:8141" }), "http://localhost:8141/files/a.jpg");
  const on = { STOREFRONT_LOCAL_MEDIA_ORIGIN: "http://127.0.0.1:8141" };
  assert.equal(safeImage("http://127.0.0.1:8142/files/a.jpg", on), "", "another port");
  assert.equal(safeImage("http://127.0.0.1:81410/a.jpg", on), "", "a longer port is not a prefix match");
  assert.equal(safeImage("http://127.0.0.1:8141", on), "", "no file");
  assert.equal(safeImage("http://127.0.0.1:8141/", on), "", "no file name");
  assert.equal(safeImage("http://127.0.0.1:8141/a b.jpg", on), "");
  assert.equal(safeImage("https://evil.test/x.jpg", on), "");
  assert.equal(safeImage("https://abc.public.blob.vercel-storage.com/x.jpg", on), "https://abc.public.blob.vercel-storage.com/x.jpg", "the Blob rule is unchanged");
  for (const bad of ["https://127.0.0.1:8141", "http://127.0.0.1", "http://127.0.0.1:8141/", "http://127.0.0.1:8141/files", "http://example.com:8141",
    "http://127.0.0.1.evil.test:8141", "http://127.0.0.1:99999", "http://127.0.0.1:08141", "http://user@127.0.0.1:8141", "http://[::1]:8141", " http://127.0.0.1:8141", "*", ""]) {
    assert.equal(localMediaOrigin({ STOREFRONT_LOCAL_MEDIA_ORIGIN: bad }), "", JSON.stringify(bad));
    assert.equal(safeImage(local, { STOREFRONT_LOCAL_MEDIA_ORIGIN: bad }), "", "ignored: " + JSON.stringify(bad));
  }
  assert.equal(localMediaOrigin({ STOREFRONT_LOCAL_MEDIA_ORIGIN: "http://localhost:3" }), "http://localhost:3");
});

/* ---- the cart ------------------------------------------------------------------------------------------------------ */

test("an empty cart says so; a navigation post redirects and sets the cookie; a background post answers the page", async () => {
  assert.match(await text(await cartGet(shop(backend()))), /Your cart is empty\./);
  const nav = await cartPost(shop(backend(), "", { "sec-fetch-mode": "navigate" }), { action: "add", product_id: P1.id, quantity: "2" });
  assert.equal(nav.status, 303);
  assert.equal(nav.headers.get("location"), "/cart/");
  assert.match(nav.headers.get("set-cookie") ?? "", new RegExp(`no_cart=${P1.id}\\.2; .*HttpOnly`));
  const bg = await cartPost(shop(backend(), "", { "sec-fetch-mode": "same-origin" }), { action: "add", product_id: P1.id, quantity: "1" });
  assert.equal(bg.status, 200);
  const page = await text(bg);
  assert.match(page, /id="sfDrawer"/);
  assert.match(page, /<span data-sf-drawer-count>1 item<\/span>/);
  assert.match(page, /data-sf-drawer-form/);
});

test("the cart shows Django's figures: subtotal, FREE shipping, total; a gone product blocks checkout", async () => {
  const page = await text(await cartGet(shop(backend(), `no_cart=${P1.id}.2`)));
  assert.match(page, /Subtotal<\/span><strong>&#8369;900\.00/);
  assert.match(page, /Estimated shipping \(Metro Manila\)<\/span><strong>FREE/);
  assert.match(page, /Proceed to Checkout/);
  const gone = await text(await cartGet(shop(backend(), "no_cart=prd_GONE.1")));
  assert.match(gone, /No longer available/);
  assert.doesNotMatch(gone, /Proceed to Checkout/);
});

/* ---- the checkout: scenario 1, a guest at SRP --------------------------------------------------------------------- */

const ADDR = { first_name: "Ben", last_name: "Cruz", mobile: "917 123 4567", email: "", line: "1 Main St", province: "METRO MANILA", city: "QUEZON CITY", barangay: "Bagumbayan", zip: "1110", landmark: "Near the church", ship_mode: "guest" };

test("an empty cart goes back to the cart", async () => {
  const r = await checkoutGet(shop(backend()));
  assert.equal(r.status, 303);
  assert.equal(r.headers.get("location"), "/cart/");
});

test("a guest sees the address form, no ship-mode cards, no referral or coupon box, no Cash on Delivery", async () => {
  const page = await text(await checkoutGet(shop(backend(), `no_cart=${P1.id}.1`)));
  assert.match(page, /Shipping Address/);
  assert.match(page, /id="cf_first_name"/);
  assert.match(page, /Email \(Optional\)/);
  assert.doesNotMatch(page, /How should we ship this order\?|Referral|Coupon|Cash On Delivery/i);
  assert.match(page, /&#8369;450\.00/);
  assert.match(page, /name="ship_mode" value="guest"/);
});

test("the address step refuses what is missing in TWCinc's words and keeps what was typed", async () => {
  const b = backend();
  const r = await checkoutPost(shop(b, `no_cart=${P1.id}.1`), { ...ADDR, action: "address", last_name: "", landmark: "" }, null);
  const page = await text(r as Response);
  assert.match(page, /Check the highlighted fields\./);
  assert.match(page, /Enter the first and last name\./);
  assert.match(page, /Enter a landmark\./);
  assert.match(page, /value="Ben"/);
  assert.deepEqual(addressErrors({ ...ADDR }), {});
  assert.equal(localDigits("+63 917 123 4567"), "9171234567");
  assert.deepEqual(splitName("Ana Maria Reyes"), { first: "Ana Maria", last: "Reyes" });
});

test("a guest's payment step: the store's account, the amount to send, the proof fields, the fingerprint of Django's quote", async () => {
  const b = backend();
  const page = await text((await checkoutPost(shop(b, `no_cart=${P1.id}.2`), { ...ADDR, action: "address" }, null)) as Response);
  assert.match(page, /Send exactly/);
  assert.match(page, /&#8369;900\.00/);
  assert.match(page, /BDO \(Savings\)/);
  assert.match(page, /name="fingerprint" value="fp-guest-90000"/);
  assert.match(page, /name="reference_number"/);
  assert.match(page, /name="amount_sent"/);
  assert.match(page, /name="proof"/);
  assert.match(page, /src="\/checkout\/qr\/acc_1\/"/);
  assert.match(page, /Complete Order/);
  assert.match(page, /Cancel Order/);
  assert.match(page, /Landmark: Near the church/);
});

test("placing sends ids, mode, address and the proof, no price; success sets the order cookie, clears the cart and goes to done", async () => {
  const b = backend();
  const proof = new File([new Uint8Array([1, 2, 3])], "proof.png", { type: "image/png" });
  const r = (await checkoutPost(shop(b, `no_cart=${P1.id}.2`), { ...ADDR, action: "place", fingerprint: "fp-guest-90000", submit_key: "key1", account_id: "acc_1", reference_number: "REF9", amount_sent: "900.00" }, proof)) as Response;
  assert.equal(r.status, 303);
  assert.equal(r.headers.get("location"), "/checkout/done/");
  const cookies = r.headers.getSetCookie().join("\n");
  assert.match(cookies, new RegExp(`no_order=sho_1\\.${"T".repeat(43)}; .*Max-Age=7200`));
  assert.match(cookies, /no_cart=; .*Max-Age=0/);
  const call = b.calls.find((c) => c.url.endsWith("/shop/orders/"))!;
  const body = call.body as Record<string, string>;
  assert.equal(body.fingerprint, "fp-guest-90000");
  assert.equal(body.submit_key, "key1");
  assert.deepEqual(JSON.parse(body.lines), [{ id: P1.id, qty: 2 }]);
  assert.equal(body.receiver_name, "Ben Cruz");
  assert.equal(body.receiver_mobile, "09171234567");
  assert.equal(body.ship_mode, "");
  assert.equal(JSON.parse(body.address).landmark, "Near the church");
  assert.ok(call.form!.get("proof") instanceof File);
  assert.equal(Object.keys(body).some((k) => /price|total|amount_centavos/.test(k)), false);
});

test("a refusal comes back on its own step: fields to the address, proof fields to the payment, changed prices re-quoted", async () => {
  const lines = `no_cart=${P1.id}.1`;
  const send = (code: string, status: number, fields: Record<string, string[]>) =>
    checkoutPost(shop(backend({ placeStatus: status, placeBody: { error: { code, message: "Nope.", fields } } }), lines), { ...ADDR, action: "place", fingerprint: "x", submit_key: "k", account_id: "acc_1", reference_number: "R", amount_sent: "1" }, null) as Promise<Response>;
  const addr = await text(await send("invalid_address", 422, { zip: ["Check the ZIP."] }));
  assert.match(addr, /id="delivery"/);
  assert.match(addr, /Check the ZIP\./);
  const pay = await text(await send("invalid_proof", 422, { proof: ["Choose a file."] }));
  assert.match(pay, /id="sfPlaceForm"/);
  assert.match(pay, /Choose a file\./);
  assert.match(pay, /Please choose your receipt again\.|Choose a file\./);
  const changed = await text(await send("prices_changed", 409, {}));
  assert.match(changed, /Prices changed\. Review your order\./);
  assert.match(changed, /name="fingerprint" value="fp-guest-45000"/);
  const gone = await send("product_unavailable", 409, {});
  assert.equal(gone.headers.get("location"), "/cart/");
  const limited = await send("rate_limited", 429, {});
  assert.equal(limited.status, 429);
});

test("a proof over 4 MB is refused here, with the same words as the Package checkout, before anything is sent", async () => {
  const b = backend();
  const big = new File([new Uint8Array(4 * 1024 * 1024 + 1)], "big.pdf", { type: "application/pdf" });
  const page = await text((await checkoutPost(shop(b, `no_cart=${P1.id}.1`), { ...ADDR, action: "place", fingerprint: "x", submit_key: "k", account_id: "acc_1", reference_number: "R", amount_sent: "1" }, big)) as Response);
  assert.match(page, /The file is too large\. The limit is 4 MB\./);
  assert.equal(b.calls.some((c) => c.url.endsWith("/shop/orders/")), false);
});

/* ---- the checkout: scenario 2, a signed-in member ---------------------------------------------------------------- */

test("a member with benefits sees only their own address at the member price: no ship-to choice, no dropshipping words", async () => {
  const page = await text(await checkoutGet(shop(backend({ member: true, quoteExtra: { home_address: { line: "7 Rizal St", barangay: "Poblacion", city: "Makati", province: "Metro Manila", zip: "1210", landmark: "" } } }), `no_cart=${P1.id}.2; ${MEMBER}`)));
  assert.doesNotMatch(page, /How should we ship this order\?|ship_radio|sfShipMode|Ship to another address|Dropshipping|You earn|selling it|your customer/i);
  assert.doesNotMatch(page, /id="delivery"|name="ship_mode" value="different"/);
  assert.match(page, /Member-price orders ship to your own saved address\./);
  assert.match(page, /<dd>7 Rizal St, Poblacion, Makati, Metro Manila 1210<\/dd>/);
  assert.match(page, /open your member dashboard/);
  assert.match(page, /Member savings<\/span><strong>&minus;&#8369;360\.00/);
  assert.match(page, /name="choice" value="home"/);
  assert.doesNotMatch(page, /sf-step-next"[^>]* disabled/);
});

test("'ship to my address' goes to payment at the member price with no typed address, and places with ship mode home", async () => {
  const b = backend({ member: true, quoteExtra: { home_address: { line: "7 Rizal St", barangay: "Poblacion", city: "Makati", province: "Metro Manila", zip: "1210", landmark: "" } } });
  const cookie = `no_cart=${P1.id}.2; ${MEMBER}`;
  const pay = await text((await checkoutPost(shop(b, cookie), { action: "choose", choice: "home" }, null)) as Response);
  assert.match(pay, /&#8369;540\.00/);
  assert.match(pay, /name="fingerprint" value="fp-home-54000"/);
  assert.match(pay, /name="ship_mode" value="home"/);
  assert.match(pay, /Ana Reyes/);
  const proof = new File([new Uint8Array([1])], "p.png", { type: "image/png" });
  const placed = (await checkoutPost(shop(b, cookie), { action: "place", ship_mode: "home", fingerprint: "fp-home-54000", submit_key: "k2", account_id: "acc_1", reference_number: "R", amount_sent: "540" }, proof)) as Response;
  assert.equal(placed.status, 303);
  const body = b.calls.find((c) => c.url.endsWith("/shop/orders/"))!.body as Record<string, string>;
  assert.equal(body.ship_mode, "home");
  assert.equal(body.member_token, "M".repeat(43));
  assert.equal("address" in body, false, "the member's own address is Django's, never posted");
  assert.equal("receiver_name" in body, false);
});

test("a member with benefits who posts a typed address is refused with the own-address message and nothing is priced or sent", async () => {
  const b = backend({ member: true });
  const cookie = `no_cart=${P1.id}.2; ${MEMBER}`;
  const refused = await text((await checkoutPost(shop(b, cookie), { ...ADDR, action: "address", ship_mode: "different" }, null)) as Response);
  assert.match(refused, /Member-price orders ship only to your own saved address\./);
  assert.doesNotMatch(refused, /name="fingerprint"/);
  const proof = new File([new Uint8Array([1])], "p.png", { type: "image/png" });
  for (const mode of ["different", "guest", ""]) {
    const placed = await text((await checkoutPost(shop(b, cookie), { ...ADDR, action: "place", ship_mode: mode, fingerprint: "fp", submit_key: "k", account_id: "acc_1", reference_number: "R", amount_sent: "1" }, proof)) as Response);
    assert.match(placed, /Member-price orders ship only to your own saved address\./, mode);
  }
  assert.equal(b.calls.some((c) => c.url.endsWith("/shop/orders/")), false, "tampered posts never reach Django");
});

test("Django's member_own_address_only refusal is shown with its clear message", async () => {
  const cookie = `no_cart=${P1.id}.1; ${MEMBER}`;
  const r = (await checkoutPost(shop(backend({ member: true, placeStatus: 422, placeBody: { error: { code: "member_own_address_only", message: "x", fields: { ship_mode: ["x"] } } } }), cookie),
    { action: "place", ship_mode: "home", fingerprint: "fp-home-27000", submit_key: "k", account_id: "acc_1", reference_number: "R", amount_sent: "1" }, null)) as Response;
  assert.match(await text(r), /Member-price orders ship only to your own saved address\./);
});

test("a member without benefits is a guest at SRP: no cards, 'home' refused, name and contact prefilled", async () => {
  const b = backend({ member: false });
  const cookie = `no_cart=${P1.id}.1; ${MEMBER}`;
  const page = await text(await checkoutGet(shop(b, cookie)));
  assert.doesNotMatch(page, /How should we ship this order\?/);
  assert.match(page, /value="Ana"/);
  assert.match(page, /value="Reyes"/);
  const home = await text((await checkoutPost(shop(b, cookie), { action: "choose", choice: "home" }, null)) as Response);
  assert.match(home, /Choose how to ship this order\./);
  assert.match(home, /id="delivery"/);
});

test("a member whose profile has no address is told so, with the dashboard link, and Continue is blocked", async () => {
  const cookie = `no_cart=${P1.id}.1; ${MEMBER}`;
  const page = await text(await checkoutGet(shop(backend({ member: true }), cookie)));
  assert.match(page, /Add your delivery address in your member dashboard first\./);
  assert.match(page, /<a href="\/dashboard\/">Open your member dashboard<\/a>/);
  assert.match(page, /btn-cart sf-step-next" disabled/);
  assert.doesNotMatch(page, /id="delivery"|Ship to another address/);
  const choose = await text((await checkoutPost(shop(backend({ member: true }), cookie), { action: "choose", choice: "home" }, null)) as Response);
  assert.match(choose, /Add your delivery address in your member dashboard first\./);
  assert.doesNotMatch(choose, /name="fingerprint"/);
  const r = (await checkoutPost(shop(backend({ member: true, placeStatus: 422, placeBody: { error: { code: "no_home_address", message: "x", fields: {} } } }), cookie),
    { action: "place", ship_mode: "home", fingerprint: "fp-home-27000", submit_key: "k", account_id: "acc_1", reference_number: "R", amount_sent: "1" }, null)) as Response;
  assert.match(await text(r), /Add your delivery address in your member dashboard first\./);
});

test("a dead member session is dropped: the visitor is a guest and the cookie is cleared", async () => {
  const r = await productsGet(shop(backend({ member: true }), "no_member=stale"));
  assert.equal(r.status, 200);
  assert.match(r.headers.get("set-cookie") ?? "", /no_member=; .*Max-Age=0/);
});

/* ---- the done page ------------------------------------------------------------------------------------------------- */

test("only the placing buyer opens the done page; anyone else goes back to the shop", async () => {
  const none = await doneGet(shop(backend()));
  assert.equal(none.headers.get("location"), "/products/");
  const wrong = await doneGet(shop(backend(), `no_order=sho_1.${"W".repeat(43)}`));
  assert.equal(wrong.headers.get("location"), "/products/");
  const page = await text(await doneGet(shop(backend(), `no_order=sho_1.${"T".repeat(43)}`)));
  assert.match(page, /Thanks for your order, Ana!/);
  assert.match(page, /SO00001/);
  assert.match(page, /Status: Payment under review/);
  assert.match(page, /We received your payment proof\. The store will review it\./);
  assert.match(page, /Landmark: Near/);
  assert.match(page, /Track Your Order/);
});

/* ---- parity with TWCinc (z8uq9mek5v) --------------------------------------------------------------------------------- */

const HOME = { line: "7 Rizal St", barangay: "Poblacion", city: "Makati", province: "Metro Manila", zip: "1210", landmark: "Blue gate" };
const memberCookie = `no_cart=${P1.id}.2; ${MEMBER}`;
const readyOrder = (parity: boolean) => backend(parity ? {
  viewExtra: {
    receiver_mobile: "+639171234567", receiver_email: "ana@example.test", verified_at: "2026-11-14T03:00:00Z",
    member_savings_centavos: 36000, srp_subtotal_centavos: 90000, subtotal_centavos: 54000, total_centavos: 54000,
  },
  lineExtra: { unit_centavos: 45000, image_url: P2.image_url, quantity: 2, line_charged_centavos: 54000 },
} : {});

test("'Ship to my address' shows the saved address card with Edit, in the panel and under Payment", async () => {
  const b = backend({ member: true, quoteExtra: { home_address: HOME, home_address_source: "profile" } });
  const page = await text(await checkoutGet(shop(b, memberCookie)));
  assert.match(page, /sf-own-addr-name">Ana Reyes</);
  assert.match(page, /<dt>Mobile<\/dt><dd>\+639171234567<\/dd>/);
  assert.match(page, /<dt>Address<\/dt><dd>7 Rizal St, Poblacion, Makati, Metro Manila 1210<\/dd>/);
  assert.match(page, /<dt>Landmark<\/dt><dd>Blue gate<\/dd>/);
  assert.match(page, /<a href="\/checkout\/\?edit=home" class="sf-own-addr-edit"[^>]*>Edit<\/a>/);
  assert.doesNotMatch(page, /The delivery address saved in your member profile\./);
  const pay = await text((await checkoutPost(shop(b, memberCookie), { action: "choose", choice: "home" }, null)) as Response);
  assert.match(pay, /7 Rizal St, Poblacion, Makati, Metro Manila 1210 — Landmark: Blue gate/);
  assert.doesNotMatch(pay, /The delivery address saved in your member profile/);
});

test("Edit shows for both sources and for an older response with no source; the lock replaces it with the note", async () => {
  const edit = /<a href="\/checkout\/\?edit=home" class="sf-own-addr-edit"[^>]*>Edit<\/a>/;
  const note = /id="sfHomeLockedNote" role="note">[\s\S]*<span>Your home address cannot be changed right now\.<\/span>/;
  const cases: [Record<string, unknown>, boolean][] = [
    [{ home_address: HOME, home_address_source: "pack_order" }, false],
    [{ home_address: HOME, home_address_source: "profile" }, false],
    [{ home_address: HOME }, false], // an older backend: no home_address_locked at all
    [{ home_address: HOME, home_address_source: "profile", home_address_locked: false }, false],
    [{ home_address: HOME, home_address_source: "profile", home_address_locked: true }, true],
    [{ home_address: HOME, home_address_source: "pack_order", home_address_locked: true }, true],
  ];
  for (const [quoteExtra, locked] of cases) {
    const page = await text(await checkoutGet(shop(backend({ member: true, quoteExtra }), memberCookie)));
    assert.match(page, /<dd>7 Rizal St, Poblacion, Makati, Metro Manila 1210<\/dd>/);
    assert.equal(edit.test(page), !locked, JSON.stringify(quoteExtra));
    assert.equal(note.test(page), locked, JSON.stringify(quoteExtra));
    assert.doesNotMatch(page, /dashboard\/#registration/);
  }
});

/* ---- the member edits the saved address (z8uq9mewrw) ----------------------------------------------------------------- */

const editGet = (b: ReturnType<typeof backend>, cookie = memberCookie) => {
  const s = shop(b, cookie);
  const request = new Request("http://demo.test:3070/checkout/?edit=home", { headers: { host: "demo.test:3070", cookie } });
  return checkoutGet({ ...s, request });
};
const NEW = { line: "9 Mabini St", barangay: "Bel-Air", city: "Makati", province: "Metro Manila", zip: "1209", landmark: "Red roof" };
const own = { member: true, quoteExtra: { home_address: HOME, home_address_source: "pack_order" } } as const;

test("the edit mode shows only the address form, prefilled, with name and mobile as text, the note, Cancel and Save Address", async () => {
  const r = await editGet(backend(own));
  assert.equal(r.status, 200);
  const page = await text(r);
  assert.match(page, /<input type="hidden" name="action" value="save_home">/);
  assert.doesNotMatch(page, /name="ship_mode"|sfShipMode|name="first_name"|name="mobile"|name="email"|sfOwnPanel/);
  assert.match(page, /<dt>Name<\/dt><dd>Ana Reyes<\/dd>/);
  assert.match(page, /<dt>Mobile<\/dt><dd>\+639171234567<\/dd>/);
  assert.match(page, /<p class="sf-locked-note">Who receives your parcel and where it goes\. Your account details stay as they are\.<\/p>/);
  assert.doesNotMatch(page, /someone else will receive/);
  assert.match(page, /name="line"[^>]*value="7 Rizal St"/);
  assert.match(page, /data-value="Metro Manila"/);
  assert.match(page, /data-value="Makati"/);
  assert.match(page, /data-value="Poblacion"/);
  assert.match(page, /name="zip" value="1210"/);
  assert.match(page, /name="landmark" value="Blue gate"/);
  assert.match(page, /<a href="\/checkout\/" class="sf-step-back-link">Cancel<\/a>/);
  assert.match(page, /btn-cart sf-step-next">Save Address</);
  assert.doesNotMatch(page, /Confirm Address/);
});

test("the edit mode sends nobody but a member with a saved, unlocked address; a guest goes back to the checkout", async () => {
  assert.equal((await editGet(backend({ member: false }), `no_cart=${P1.id}.1`)).headers.get("location"), "/checkout/");
  assert.equal((await editGet(backend({ member: true }))).headers.get("location"), "/checkout/"); // none saved
  assert.equal((await editGet(backend({ member: true, quoteExtra: { ...own.quoteExtra, home_address_locked: true } }))).headers.get("location"), "/checkout/");
  assert.equal((await editGet(backend(own), `no_cart=${P1.id}.1`)).headers.get("location"), "/checkout/"); // no member session
  assert.equal((await editGet(backend(own), "")).headers.get("location"), "/cart/"); // no basket
});

test("saving round-trips: the six keys go to Django with the session and no ids, then the checkout shows the new address, Edit and Confirm Address", async () => {
  const b = backend(own);
  const r = (await checkoutPost(shop(b, memberCookie), { action: "save_home", ...NEW, first_name: "Evil", mobile: "0999", receiver_name: "X", member_id: "m9", site_id: "s9" }, null)) as Response;
  assert.equal(r.status, 303);
  assert.equal(r.headers.get("location"), "/checkout/");
  const call = b.calls.find((c) => c.url.endsWith("/storefront/v1/member/address/"));
  assert.deepEqual(call?.body, { host: "demo.test", visitor_ip: "", member_token: "M".repeat(43), ...NEW });
  const page = await text(await checkoutGet(shop(b, memberCookie)));
  assert.match(page, /<dd>9 Mabini St, Bel-Air, Makati, Metro Manila 1209<\/dd>/);
  assert.match(page, /<dt>Landmark<\/dt><dd>Red roof<\/dd>/);
  assert.match(page, /sf-own-addr-edit/);
  assert.match(page, /name="action" value="choose"/); // Confirm Address is still the next step
  assert.match(page, />Confirm Address</);
});

test("the edit form posts the barangay with no ZIP (the row is hidden): the saved ZIP is kept, or the lookup's, never lost", async () => {
  const noZip = { ...HOME, zip: "", line: "99 Checkout Edit Rd" };
  const saved = async (b: ReturnType<typeof backend>, fields: Record<string, string>) => {
    await checkoutPost(shop(b, memberCookie), { action: "save_home", ...fields }, null);
    return (b.calls.find((c) => c.url.endsWith("/storefront/v1/member/address/"))?.body as Record<string, string>).zip;
  };
  // the lookup is exact for the barangay: its ZIP
  assert.equal(await saved(backend({ ...own, zip: { zip_code: "1210", zip_precision: "barangay" } }), noZip), "1210");
  // no lookup answer, same province, city and barangay: the saved ZIP stays (names compared without case)
  assert.equal(await saved(backend(own), { ...noZip, city: "MAKATI", barangay: "POBLACION" }), "1210");
  // another barangay and no lookup answer: no ZIP is invented
  assert.equal(await saved(backend(own), { ...noZip, barangay: "Bel-Air" }), "");
  // a typed ZIP is never replaced
  assert.equal(await saved(backend({ ...own, zip: { zip_code: "1210", zip_precision: "barangay" } }), { ...noZip, zip: "1234" }), "1234");
  // an approximate (city) ZIP is not taken as the barangay's
  assert.equal(await saved(backend({ ...own, zip: { zip_code: "1200", zip_precision: "city_approx" } }), { ...noZip, barangay: "Bel-Air" }), "");
});

test("a refusal with field errors shows each beside its field, with what was typed", async () => {
  const fields = { line: ["Enter the street address."], city: ["Enter the city or municipality."], zip: ["Enter a 4-digit ZIP code."] };
  const b = backend({ ...own, addressReply: { status: 422, body: { error: { code: "invalid_address", message: "Some values are missing or invalid.", fields } } } });
  const r = (await checkoutPost(shop(b, memberCookie), { action: "save_home", ...NEW, line: "", city: "", zip: "12" }, null)) as Response;
  assert.equal(r.status, 200);
  const page = await text(r);
  assert.match(page, /<p class="sf-form-error" role="alert">Check the highlighted fields\.<\/p>/);
  assert.match(page, /name="line"[^>]*class="sf-field-invalid"[\s\S]*?<p class="sf-field-error">Enter the street address\.<\/p>/);
  assert.match(page, /<p class="sf-field-error">Enter the city or municipality\.<\/p>/);
  assert.match(page, /<p class="sf-field-error">Enter a 4-digit ZIP code\.<\/p>/);
  assert.match(page, /name="landmark" value="Red roof"/);
  assert.match(page, /Save Address/);
});

test("a hold (423), the throttle (429), a dead session (401) and a failing Django are each answered in words", async () => {
  const reply = (status: number, code: string, message: string) => backend({ ...own, addressReply: { status, body: { error: { code, message } } } });
  const post = async (b: ReturnType<typeof backend>) => (await checkoutPost(shop(b, memberCookie), { action: "save_home", ...NEW }, null)) as Response;
  const locked = await post(reply(423, "address_locked", "Your home address cannot be changed right now."));
  assert.equal(locked.status, 200);
  assert.match(await text(locked), /sf-form-error" role="alert">Your home address cannot be changed right now\./);
  const throttled = await post(reply(429, "rate_limited", "Too many tries. Please wait a while."));
  assert.equal(throttled.status, 429);
  const tp = await text(throttled);
  assert.match(tp, /Too many tries\. Please wait a while\./);
  assert.match(tp, /Save Address/);
  const dead = await post(reply(401, "member_session_invalid", "Not signed in."));
  assert.match(dead.headers.get("set-cookie") ?? "", /no_member=; .*Max-Age=0/);
  assert.match(await text(dead), /Your sign-in has ended/);
  const down = await post(backend({ ...own, addressReply: { status: 500, body: {} } }));
  assert.equal(down.status, 503);
  const dp = await text(down);
  assert.match(dp, /We could not save your address\. Please try again shortly\./);
  assert.match(dp, /name="line"[^>]*value="9 Mabini St"/); // what was typed stays
});

test("an older backend without the save route (404) leaves the form with a message, and Edit still shows without home_address_locked", async () => {
  const b = backend({ ...own, addressReply: { status: 404, body: { detail: "Not Found" } } });
  const page = await text(await checkoutGet(shop(b, memberCookie)));
  assert.match(page, /sf-own-addr-edit/);
  const r = (await checkoutPost(shop(b, memberCookie), { action: "save_home", ...NEW }, null)) as Response;
  assert.equal(r.status, 503);
  assert.match(await text(r), /We could not save your address\./);
});

test("without home_address (an older backend, or none saved) the member is told to add one, there is no Edit link and Continue is blocked", async () => {
  for (const quoteExtra of [undefined, { home_address: null, home_address_source: "" }]) {
    const b = backend({ member: true, quoteExtra });
    const page = await text(await checkoutGet(shop(b, memberCookie)));
    assert.match(page, /Add your delivery address in your member dashboard first\./);
    assert.doesNotMatch(page, /sf-own-addr-edit/);
    const pay = await text((await checkoutPost(shop(b, memberCookie), { action: "choose", choice: "home" }, null)) as Response);
    assert.match(pay, /Add your delivery address in your member dashboard first\./);
    assert.doesNotMatch(pay, /undefined|NaN|name="fingerprint"/);
  }
});

test("the shipping row says 'Estimated shipping (Metro Manila)' only while the quote's shipping is an estimate", async () => {
  const cart = `no_cart=${P1.id}.1`;
  const est = await text(await cartGet(shop(backend(), cart)));
  assert.match(est, /<span>Estimated shipping \(Metro Manila\)<\/span>/);
  const exact = await text(await cartGet(shop(backend({ estimated: false }), cart)));
  assert.match(exact, /<span>Shipping<\/span>/);
  assert.doesNotMatch(exact, /Estimated shipping/);
  const checkout = await text(await checkoutGet(shop(backend(), cart)));
  assert.match(checkout, /<span>Estimated shipping \(Metro Manila\)<\/span>/);
  const checkoutExact = await text(await checkoutGet(shop(backend({ estimated: false }), cart)));
  assert.match(checkoutExact, /<span>Shipping<\/span>/);
});

test("the done page shows the photo, 'xN - unit price', SRP subtotal, Member savings, phone and email", async () => {
  const page = await text(await doneGet(shop(readyOrder(true), `no_order=sho_1.${"T".repeat(43)}`)));
  assert.match(page, /<img src="https:\/\/abc123\.public\.blob\.vercel-storage\.com\/p2\.jpg" alt="">/);
  assert.match(page, /&times;2 &middot; &#8369;450\.00/);
  assert.match(page, /Subtotal<\/span><strong>&#8369;900\.00/);
  assert.match(page, /Member savings<\/span><strong>&minus;&#8369;360\.00/);
  assert.match(page, /Total<\/span><strong>&#8369;540\.00/);
  assert.match(page, /sf-os-total">&#8369;900\.00/);
  assert.match(page, /\+63 917 123 4567/);
  assert.match(page, /ana@example\.test/);
});

test("the done page without the new fields renders as before: no photo, no unit price, no savings, no phone or email", async () => {
  const page = await text(await doneGet(shop(readyOrder(false), `no_order=sho_1.${"T".repeat(43)}`)));
  assert.match(page, /<small>&times;1<\/small>/);
  assert.match(page, /Subtotal<\/span><strong>&#8369;450\.00/);
  assert.doesNotMatch(page, /Member savings|<img src="https|&#128241;|&#128231;|undefined|NaN/);
});

test("a member with no savings gets no Member savings row, and an empty email row is left out", async () => {
  const b = backend({ viewExtra: { receiver_mobile: "09171234567", receiver_email: "", member_savings_centavos: 0, srp_subtotal_centavos: 45000 }, lineExtra: { unit_centavos: 45000, image_url: null } });
  const page = await text(await doneGet(shop(b, `no_order=sho_1.${"T".repeat(43)}`)));
  assert.doesNotMatch(page, /Member savings|&#128231;|<img src="https/);
  assert.match(page, /&#128241;/);
  assert.match(page, /&times;1 &middot; &#8369;450\.00/);
});

test("My Orders shop card: verified date on step 2, Waybill, photo and unit price, totals, phone and email", async () => {
  const view = parseBuyerOrder({
    id: "sho_1", order_number: "SO00001", status: "confirmed", status_label: "Order confirmed", tracker: ["Order Placed", "Order Confirmed", "Shipped", "Delivered"],
    created_at: "2026-11-13T02:00:00Z", verified_at: "2026-11-14T03:00:00Z", courier: "J&T", tracking_no: "JT123", shipped_on: null, delivered_on: null,
    receiver_name: "Ana Reyes", receiver_mobile: "+639171234567", receiver_email: "ana@example.test",
    delivery_address: HOME, subtotal_centavos: 54000, shipping_charged_centavos: 15000, total_centavos: 69000,
    member_savings_centavos: 36000, srp_subtotal_centavos: 90000,
    lines: [{ code: "SPH2", name: "Barley", quantity: 2, line_charged_centavos: 54000, unit_centavos: 45000, image_url: P2.image_url }],
  });
  assert.ok(view);
  const card = shopCard(view).toString();
  assert.match(card, /Order Confirmed<\/div>\s*<div class="oc-track-date">Nov 14<\/div>/);
  assert.match(card, /Waybill/);
  assert.match(card, /<span>Courier<\/span><b>J&amp;T<\/b>/);
  assert.match(card, /<span>Tracking #<\/span><b>JT123<\/b>/);
  assert.match(card, /Shipping fee<\/span><b>&#8369;150\.00/);
  assert.match(card, /<img class="oc-dimg" src="https:\/\/abc123\.public\.blob\.vercel-storage\.com\/p2\.jpg"/);
  assert.match(card, /oc-dunit">&#8369;450\.00/);
  assert.match(card, /Subtotal<\/span><b>&#8369;900\.00/);
  assert.match(card, /Member savings<\/span><b>&minus;&#8369;360\.00/);
  assert.match(card, /Total<\/span><b>&#8369;690\.00/);
  assert.match(card, /oc-dphone">\+639171234567/);
  assert.match(card, /ana@example\.test/);
});

test("My Orders shop card from an older backend: no step-2 date, no photo, no totals block, Waybill still shows", () => {
  const view = parseBuyerOrder({
    id: "sho_1", order_number: "SO00001", status: "confirmed", status_label: "Order confirmed", tracker: [], created_at: "2026-11-13T02:00:00Z",
    receiver_name: "Ana Reyes", delivery_address: HOME, subtotal_centavos: 45000, shipping_charged_centavos: 0, total_centavos: 45000,
    lines: [{ code: "SPH1", name: "Fusion", quantity: 1, line_charged_centavos: 45000 }],
  });
  assert.ok(view);
  const card = shopCard(view).toString();
  assert.doesNotMatch(card, /oc-track-date">Nov 14|oc-dimg|oc-dunit|Member savings|oc-dphone|undefined|NaN/);
  assert.match(card, /Waybill/);
  assert.match(card, /To be assigned/);
  assert.match(card, /Not yet assigned/);
  assert.match(card, /<span>Shipping<\/span><b>FREE<\/b>/);
});

/* ---- files --------------------------------------------------------------------------------------------------------- */

test("money is written as TWCinc writes it", () => {
  assert.equal(money(148800), "1,488.00");
  assert.equal(money(5), "0.05");
  assert.equal(money(0), "0.00");
});

test("the shop script and sheet exist and have no TWCinc name, no inline handler and no Cash on Delivery popup", () => {
  const js = readFileSync(path.join(PUBLIC, "assets/sante/js/pack-shop.js"), "utf8");
  const css = readFileSync(path.join(PUBLIC, "assets/sante/css/pack-shop.css"), "utf8");
  assert.doesNotMatch(js + css, /twc-select|data-twc|sfOtpModal|cod_send/i);
  assert.match(css, /#6C8CFF/);
  assert.doesNotMatch(css.replace(/\/\*[^]*?\*\//g, ""), /gold|#FFD/i);
});

test("product page accordions open and close on their own; aria-expanded follows; the home FAQ script is left alone", () => {
  const listeners: Record<string, ((e: unknown) => void)[]> = {};
  const doc = { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null,
    addEventListener: (t: string, f: (e: unknown) => void) => { (listeners[t] ||= []).push(f); } };
  const mk = () => {
    const cls = new Set<string>(), attrs: Record<string, string> = {};
    const item = { classList: { contains: (c: string) => cls.has(c), toggle: (c: string, on: boolean) => { if (on) cls.add(c); else cls.delete(c); } } };
    const head = { parentElement: item, setAttribute: (k: string, v: string) => { attrs[k] = v; }, closest: (sel: string) => (sel === "[data-sf-acc]" ? head : null) };
    return { cls, attrs, head };
  };
  new Function("document", readFileSync(path.join(process.cwd(), "public/assets/sante/js/pack-store.js"), "utf8"))(doc);
  const click = (a: { head: unknown }) => listeners.click.forEach((f) => f({ target: a.head }));
  const a = mk(), b = mk();
  click(a);
  assert.ok(a.cls.has("open")); assert.equal(a.attrs["aria-expanded"], "true");
  click(b);
  assert.ok(a.cls.has("open") && b.cls.has("open"), "opening one does not close the other");
  click(a);
  assert.ok(!a.cls.has("open")); assert.equal(a.attrs["aria-expanded"], "false");
  assert.ok(b.cls.has("open"));
  const outside = { closest: () => null };
  assert.doesNotThrow(() => listeners.click.forEach((f) => f({ target: outside })));
  /* the home FAQ is still the one-open-at-a-time toggle on .faq-item */
  const home = readFileSync(path.join(process.cwd(), "public/assets/sante/js/pack-home.js"), "utf8");
  assert.match(home, /querySelectorAll\('\.faq-item\.open'\)/);
  assert.equal(assetVersions()["js/pack-home.js"], "db367a6b", "pack-home.js is untouched");
});

/* ---- round 5a: per serving, trust strip, FAQs ------------------------------------------------------------------------ */

const R5 = { ...P1, image_urls: ["", "", "", "", ""], features: "", specifications: "", advantages: "", benefits: "", servings_per_pack: 30, price_per_serving_centavos: 1500, members_price_per_serving_centavos: 900, faq: [{ q: "Who is it for?", a: "Anyone <b>busy</b>.\n\nReally." }] };

test("the product page shows the price per serving and a plain-text Members row, hidden when unset", () => {
  const on = productContent({ product: R5, related: [], members: false }).value;
  assert.match(on, /&#8369;450\.00 <span class="sf-per-serving">&#8369;15\.00 \/ serving<\/span>/);
  assert.match(on, /<p class="sf-members-row">Members &#8369;270\.00 <span class="sf-per-serving">\(&#8369;9\.00 \/ serving\)<\/span><\/p>/);
  assert.doesNotMatch(on.match(/<p class="sf-members-row">[\s\S]*?<\/p>/)?.[0] ?? "", /<a /, "the Members row is plain text");
  const noServings = productContent({ product: { ...R5, price_per_serving_centavos: null, members_price_per_serving_centavos: null }, related: [], members: false }).value;
  assert.doesNotMatch(noServings, /serving/);
  assert.match(noServings, /Members &#8369;270\.00<\/p>/);
  const older = productContent({ product: { ...P1, image_urls: ["", "", "", "", ""], features: "", specifications: "", advantages: "", benefits: "" } as never, related: [], members: false }).value;
  assert.doesNotMatch(older, /serving|undefined/);
  const noMembers = productContent({ product: { ...R5, unit_members_price_centavos: 0 }, related: [], members: false }).value;
  assert.doesNotMatch(noMembers, /sf-members-row|Members save/);
});

test("the trust strip sits under Add to Cart with four lines; the members line needs a members rate", () => {
  const on = productContent({ product: R5, related: [], members: false }).value;
  const cart = on.indexOf('id="sfAddToCart"');
  const strip = on.indexOf("data-sf-trust");
  assert.ok(cart > 0 && strip > cart, "the strip follows the Add to Cart button");
  assert.match(on, /Easy payment by bank or e-wallet transfer/);
  assert.match(on, /<a href="\/#contact">Talk to your Sant&eacute; store<\/a> anytime/);
  assert.match(on, /100% genuine Sant&eacute;, trusted since 2007/);
  assert.match(on, /Members save up to 40%/);
  const none = productContent({ product: { ...R5, unit_members_price_centavos: 0 }, related: [], members: false }).value;
  assert.doesNotMatch(none, /Members save up to/);
  assert.match(none, /trusted since 2007/);
});

test("the trust strip's Members line links to the membership pack funnel; the other lines are unchanged", () => {
  const on = productContent({ product: R5, related: [], members: false, packOn: true }).value;
  assert.match(on, /<li data-sf-trust-members>.*<a href="\/funnel\/membership-pack\/landing-page\/">Members save up to 40%<\/a>/);
  const off = productContent({ product: R5, related: [], members: false, packOn: false }).value;
  assert.match(off, /<li data-sf-trust-members>.*<span>Members save up to 40%<\/span>/);
  assert.doesNotMatch(off, /membership-pack/);
  assert.match(on, /<a href="\/#contact">Talk to your Sant&eacute; store<\/a> anytime/);
  assert.match(on, /<span>100% genuine Sant&eacute;, trusted since 2007<\/span>/);
});

test("the product page links the Members line only while the pack is on; a failed pack read is plain text, not an error", async () => {
  const link = /<a href="\/funnel\/membership-pack\/landing-page\/">Members save up to 40%<\/a>/;
  const on = await productGet(shop(backend({ pack: "on" })), "SPH1");
  assert.equal(on.status, 200);
  assert.match(await text(on), link);
  for (const pack of [undefined, "throw"] as const) {
    const r = await productGet(shop(backend({ pack })), "SPH1");
    assert.equal(r.status, 200);
    const page = await text(r);
    assert.match(page, /Members save up to 40%/);
    assert.doesNotMatch(page, /membership-pack/);
  }
});

test("the FAQs sit right after Benefits and before You Might Also Like; not in the info column", () => {
  const full = { ...R5, features: "Inside", advantages: "Stands out", benefits: "You get" };
  const r = { ...R5, code: "SPH2", id: "prd_BBBBBBBBBBBB" };
  const on = productContent({ product: full, related: [r], members: false }).value;
  const at = (s: string) => on.indexOf(s);
  assert.ok(at("What You Get From It") > 0 && at("data-sf-faqs") > at("What You Get From It"), "after Benefits");
  assert.ok(at("data-sf-faqs") < at("You Might Also Like"), "before Related");
  assert.ok(at("What&#39;s Inside") < 0 || at("What's Inside") < at("data-sf-faqs"), "Inside and Why it stands out stay above");
  assert.ok(at("Why It Stands Out") < at("data-sf-faqs"));
  assert.ok(at("data-sf-faqs") > at('class="sf-detail-trust"'), "no longer in the info column");
  const noBen = productContent({ product: { ...full, benefits: "" }, related: [r], members: false }).value;
  assert.ok(noBen.indexOf("data-sf-faqs") > noBen.indexOf("Why It Stands Out") && noBen.indexOf("data-sf-faqs") < noBen.indexOf("You Might Also Like"));
});

test("the FAQs block lists the product's pairs then the fixed How do I pay? item, escaped, even with none", () => {
  const on = productContent({ product: R5, related: [], members: false }).value;
  assert.match(on, /data-sf-faqs/);
  assert.equal(on.match(/data-sf-acc aria-expanded="false" aria-controls="sfFaq/g)?.length, 2);
  assert.ok(on.indexOf("Who is it for?") < on.indexOf("How do I pay?"), "the fixed item is last");
  assert.match(on, /Anyone &lt;b&gt;busy&lt;\/b&gt;\./);
  assert.doesNotMatch(on, /<b>busy/);
  const hostile = productContent({ product: { ...R5, faq: [{ q: "<script>x</script>", a: "<img src=x onerror=y>" }] }, related: [], members: false }).value;
  assert.doesNotMatch(hostile, /<script>x|<img src=x/);
  const none = productContent({ product: { ...R5, faq: [] }, related: [], members: false }).value;
  assert.match(none, /data-sf-faqs/);
  assert.match(none, /How do I pay\?/);
  assert.match(none, /proof of payment/);
  const older = productContent({ product: { ...P1, image_urls: ["", "", "", "", ""], features: "", specifications: "", advantages: "", benefits: "" } as never, related: [], members: false }).value;
  assert.match(older, /How do I pay\?/);
});

test("the catalog parser reads the r5a fields and tolerates an older API", async () => {
  const fetchImpl = () => Promise.resolve(Response.json({ products: [R5, { ...P2, faq: [{ q: "", a: "x" }, { q: "ok", a: "yes" }, 5] }] }));
  const got = await fetchCatalog("h.test", { env, fetchImpl: fetchImpl as never, log: () => {} });
  assert.equal(got?.[0].servings_per_pack, 30);
  assert.equal(got?.[0].price_per_serving_centavos, 1500);
  assert.equal(got?.[0].members_price_per_serving_centavos, 900);
  assert.deepEqual(got?.[0].faq, [{ q: "Who is it for?", a: "Anyone <b>busy</b>.\n\nReally." }]);
  assert.equal(got?.[1].servings_per_pack, null);
  assert.deepEqual(got?.[1].faq, [{ q: "ok", a: "yes" }]);
  const old = await fetchCatalog("h.test", { env, fetchImpl: backend().fetchImpl, log: () => {} });
  assert.equal(old?.[0].price_per_serving_centavos, null);
  assert.deepEqual(old?.[0].faq, []);
});

/* ---- round 5b: ingredient cards ---------------------------------------------------------------------------------------- */

const BLOB = "https://abc123.public.blob.vercel-storage.com/";
const R5B = { ...R5, ingredients: [{ name: "Barley <grass>", line: "Young & green.", photo_url: BLOB + "g.jpg" }, { name: "Lemon", line: "", photo_url: null }] };

test("What's Inside shows a card per ingredient, only when there are some, and the Feature subtitle no longer clashes", () => {
  const on = productContent({ product: R5B, related: [], members: false }).value;
  assert.match(on, /data-sf-ingredients/);
  assert.match(on, /<h2 class="section-title">What&rsquo;s Inside<\/h2>/);
  assert.equal(on.match(/class="sf-ing-card"/g)?.length, 2);
  assert.match(on, /<img class="sf-ing-img" src="https:\/\/abc123\.public\.blob\.vercel-storage\.com\/g\.jpg" alt="" loading="lazy">/);
  assert.equal(on.match(/class="sf-ing-img"/g)?.length, 1, "no photo for the card without one");
  assert.match(on, /<h3 class="sf-ing-name">Lemon<\/h3>\s*<\/div>/, "an empty line shows no paragraph");
  const none = productContent({ product: { ...R5, ingredients: [] }, related: [], members: false }).value;
  assert.doesNotMatch(none, /data-sf-ingredients|sf-ing-/);
  const older = productContent({ product: R5, related: [], members: false }).value;
  assert.doesNotMatch(older, /data-sf-ingredients/);
  const feature = productContent({ product: { ...R5B, features: "Made with care." }, related: [], members: false }).value;
  assert.equal(feature.match(/What&rsquo;s Inside|What's Inside/g)?.length, 1, "the r3 Feature section has its own title now");
  assert.match(feature, /<h2 class="sf-fab-title">What Makes It Special<\/h2>/);
});

test("ingredient text is escaped and a photo must pass safeImage", () => {
  const hostile = productContent({ product: { ...R5, ingredients: [
    { name: "<script>x</script>", line: "<img src=x onerror=y>", photo_url: "javascript:alert(1)" },
    { name: "B", line: "", photo_url: "https://evil.test/p.jpg" }] }, related: [], members: false }).value;
  assert.doesNotMatch(hostile, /<script>x|<img src=x|javascript:|evil\.test/);
  assert.match(hostile, /&lt;script&gt;x&lt;\/script&gt;/);
  assert.doesNotMatch(hostile, /sf-ing-img/);
});

test("the catalog parser reads ingredients, drops nameless ones, caps at 8 and tolerates an older API", async () => {
  const many = Array.from({ length: 10 }, (_, i) => ({ name: "I" + i, line: "", photo_url: null }));
  const fetchImpl = () => Promise.resolve(Response.json({ products: [R5B, { ...P2, ingredients: [{ name: " ", line: "x", photo_url: null }, 5, ...many] }] }));
  const got = await fetchCatalog("h.test", { env, fetchImpl: fetchImpl as never, log: () => {} });
  assert.deepEqual(got?.[0].ingredients, [{ name: "Barley <grass>", line: "Young & green.", photo_url: BLOB + "g.jpg" }, { name: "Lemon", line: "", photo_url: null }]);
  assert.equal(got?.[1].ingredients?.length, 8);
  const old = await fetchCatalog("h.test", { env, fetchImpl: backend().fetchImpl, log: () => {} });
  assert.deepEqual(old?.[0].ingredients, []);
});

/* ---- round 5b: reviews --------------------------------------------------------------------------------------------------- */

import { fetchReviewPage } from "../src/lib/shop-api.ts";
import { reviewPost } from "../src/lib/shop-flow.ts";
import { noticeFrom, ratingSummary, reviewsSection, stars, summaryStars } from "../src/views/sante/shop-review.ts";
import { doneContent } from "../src/views/sante/shop-done.ts";

const RV = (over: Record<string, unknown> = {}) => ({ id: "rev_1", rating: 5, body: "Love it.\n\nWill buy again.", display_name: "Maria S.", created_at: "2026-11-14T02:00:00Z", edited: false, verified_buyer: true, ...over });
const PAGE1 = { rating_average: "4.5", rating_count: 12, page: 1, page_size: 10, has_more: true, reviews: [RV(), RV({ id: "rev_2", rating: 4, body: "" })] };
const PAGE2 = { rating_average: "4.5", rating_count: 12, page: 2, page_size: 10, has_more: false, reviews: [RV({ id: "rev_3", rating: 3, display_name: "Jo D." })] };
const parsed = async (pages: unknown[]) => {
  const fetchImpl = () => Promise.resolve(Response.json(pages[0]));
  return fetchReviewPage("h.test", P1.id, 1, { env, fetchImpl: fetchImpl as never, log: () => {} });
};

test("the review page parser keeps only verified, rated reviews and keeps the text as data", async () => {
  const got = await parsed([{ ...PAGE1, reviews: [RV(), RV({ rating: 9 }), RV({ verified_buyer: false }), 5, RV({ display_name: "<b>x</b>" })] }]);
  assert.equal(got?.rating_average, "4.5");
  assert.equal(got?.rating_count, 12);
  assert.equal(got?.has_more, true);
  assert.deepEqual(got?.reviews.map((r) => r.display_name), ["Maria S.", "<b>x</b>"]);
  assert.equal(await parsed([{ rating_average: null, rating_count: 0, has_more: false, reviews: [] }]).then((r) => r?.rating_average), null);
  assert.equal(await fetchReviewPage("h", P1.id, 1, { env, fetchImpl: (() => Promise.resolve(Response.json({}, { status: 404 }))) as never, log: () => {} }), null);
  assert.equal(await fetchReviewPage("h", P1.id, 1, { env, fetchImpl: (() => Promise.resolve(Response.json({ nope: 1 }))) as never, log: () => {} }), null);
});

test("the product page shows nothing about reviews until the first real review", () => {
  const none = [undefined, null, { rating_average: null, rating_count: 0, has_more: false, reviews: [] }];
  for (const reviews of none) {
    const page = productContent({ product: R5, related: [], members: false, reviews }).value;
    assert.doesNotMatch(page, /sf-star|data-sf-reviews|data-sf-rating|review|Verified buyer/i);
  }
  assert.equal(ratingSummary(null).value, "");
  assert.equal(reviewsSection(null, "#").value, "");
});

test("with reviews the page shows stars, average, count, each review as a verified buyer, escaped, and More reviews only when paged", () => {
  const page = productContent({ product: R5, related: [], members: false, reviews: PAGE1, moreHref: "/products/SPH1/?reviews=2#reviews" }).value;
  assert.match(page, /data-sf-rating>[\s\S]*<strong>4\.5<\/strong> <span>\(12 reviews\)<\/span>/);
  assert.ok(page.indexOf("data-sf-rating") < page.indexOf('id="sfAddToCart"'), "the summary sits by the name, above Add to Cart");
  assert.match(page, /id="reviews" data-sf-reviews/);
  assert.match(page, /Based on 12 reviews/);
  assert.equal(page.match(/class="sf-verified">Verified buyer</g)?.length, 2);
  assert.match(page, /<p>Love it\.<\/p><p>Will buy again\.<\/p>/);
  assert.equal(page.match(/class="sf-review-body"/g)?.length, 1, "a review without words shows no empty text");
  assert.match(page, /href="\/products\/SPH1\/\?reviews=2#reviews" data-sf-more-reviews>More reviews</);
  assert.match(page, /aria-label="4\.5 out of 5 stars"/, "the summary label states the real average");
  assert.equal(page.match(/aria-label="4\.5 out of 5 stars"/g)?.length, 2, "under the name and in What Our Customers Say");
  assert.equal(page.match(/is-half/g)?.length, 2, "each summary draws one half star");
  assert.equal(page.match(/aria-label="5 out of 5 stars"/g)?.length, 1, "only the 5-star review says 5; individual reviews keep whole stars");
  assert.match(page, /aria-label="4 out of 5 stars"/);
  const last = productContent({ product: R5, related: [], members: false, reviews: { ...PAGE2, rating_count: 1 } }).value;
  assert.doesNotMatch(last, /More reviews/);
  assert.match(last, /\(1 review\)/);
  assert.equal(stars(4.4).value.match(/is-on/g)?.length, 4);
  assert.equal(stars(4.5).value.match(/is-on/g)?.length, 5);
  const sum = (n: number) => { const v = summaryStars(n).value; return { on: v.match(/is-on/g)?.length ?? 0, half: v.match(/is-half/g)?.length ?? 0, label: v.match(/aria-label="([^"]+)"/)?.[1] }; };
  assert.deepEqual(sum(4.5), { on: 4, half: 1, label: "4.5 out of 5 stars" });
  assert.deepEqual(sum(4.2), { on: 4, half: 0, label: "4.2 out of 5 stars" });
  assert.deepEqual(sum(4.3), { on: 4, half: 1, label: "4.3 out of 5 stars" });
  assert.deepEqual(sum(4.7), { on: 4, half: 1, label: "4.7 out of 5 stars" });
  assert.deepEqual(sum(4), { on: 4, half: 0, label: "4.0 out of 5 stars" });
  assert.deepEqual(sum(5), { on: 5, half: 0, label: "5.0 out of 5 stars" });
  assert.deepEqual(sum(1.2), { on: 1, half: 0, label: "1.2 out of 5 stars" });
  assert.deepEqual(sum(0.4), { on: 0, half: 1, label: "0.4 out of 5 stars" });
  assert.deepEqual(sum(NaN), { on: 0, half: 0, label: "0.0 out of 5 stars" });
  const css = readFileSync(path.join(PUBLIC, "assets/sante/css/pack-reviews.css"), "utf8");
  assert.match(css, /\.sf-star\.is-half \{[^}]*linear-gradient\(90deg, #e8a317 50%, #d0d6d0 50%\)/);
});

test("review text is escaped, never trusted", () => {
  const hostile = productContent({ product: R5, related: [], members: false, reviews: { ...PAGE1, reviews: [RV({ display_name: "<script>x</script>", body: "<img src=x onerror=y>\n\n<b>bold</b>" })] } }).value;
  assert.doesNotMatch(hostile, /<script>x|<img src=x|<b>bold/);
  assert.match(hostile, /&lt;script&gt;x&lt;\/script&gt;/);
  assert.match(hostile, /&lt;img src=x onerror=y&gt;/);
});

test("the product page loads the pages asked for, newest first, and links to the next", async () => {
  const b = backend({ reviewPages: [PAGE1, PAGE2] });
  const s = shop(b);
  s.request = new Request("http://demo.test/products/SPH1/?reviews=2", { headers: { host: "demo.test" } });
  const page = await text(await productGet(s, "SPH1"));
  assert.equal(b.calls.filter((c) => c.url.includes("/reviews/")).length, 2);
  assert.match(page, /Jo D\./);
  assert.doesNotMatch(page, /More reviews/);
  const one = backend({ reviewPages: [PAGE1, PAGE2] });
  const first = await text(await productGet(shop(one), "SPH1"));
  assert.equal(one.calls.filter((c) => c.url.includes("/reviews/")).length, 1);
  assert.match(first, /\/products\/SPH1\/\?reviews=2#reviews/);
  assert.doesNotMatch(first, /Jo D\./);
  const none = await text(await productGet(shop(backend()), "SPH1"));
  assert.doesNotMatch(none, /data-sf-reviews|sf-star/, "a store with no reviews shows nothing");
  const bad = await text(await productGet(shop(backend({ reviewPages: [{ nope: 1 }] })), "SPH1"));
  assert.doesNotMatch(bad, /data-sf-reviews/, "an unreadable answer shows nothing and the page still loads");
});

const LINE = { position: 1, product_id: P1.id, can_review: true, review: null };
const orderOf = (line: Record<string, unknown>, status = "delivered") => parseBuyerOrder({ id: "sho_1", order_number: "SO00001", status, status_label: "Delivered", total_centavos: 45000, lines: [{ code: "SPH1", name: "Fusion <Coffee>", quantity: 1, line_charged_centavos: 45000, ...line }] })!;

test("the order page offers Rate this product per delivered line, as a plain form that posts to this host", () => {
  const page = doneContent(orderOf(LINE)).value;
  assert.match(page, /data-sf-review-block/);
  assert.match(page, /<form class="sf-rv-form" method="post" action="\/checkout\/done\/review\/" data-sf-review-form>/);
  assert.match(page, /name="position" value="1"/);
  assert.match(page, /name="mode" value="create"/);
  assert.doesNotMatch(page, /name="order_id"/, "the placing buyer's cookie names the order");
  assert.equal(page.match(/type="radio" name="rating"/g)?.length, 5);
  assert.match(page, /name="rating" id="[^"]+-r5" value="5" required/);
  assert.match(page, /name="body" rows="3" maxlength="1000"/);
  assert.match(page, /name="display_name" maxlength="40"/);
  assert.match(page, /Post review/);
  assert.match(page, /Fusion &lt;Coffee&gt;/);
  assert.doesNotMatch(page, /Edit your review/);
});

test("no form for an order not delivered, a line already reviewed with no edit left, or an older backend", () => {
  assert.doesNotMatch(doneContent(orderOf({ position: 1, can_review: false, review: null }, "placed")).value, /data-sf-review-block/);
  assert.doesNotMatch(doneContent(orderOf({})).value, /data-sf-review-block/, "an older backend sends no review keys");
  const locked = doneContent(orderOf({ position: 1, can_review: false, review: { id: "r", rating: 4, body: "Nice <b>one</b>", display_name: "Ana R.", created_at: "2026-11-14T02:00:00Z", edited: true, can_edit: false } })).value;
  assert.match(locked, /data-sf-my-review/);
  assert.match(locked, /aria-label="4 out of 5 stars"/);
  assert.match(locked, /Nice &lt;b&gt;one&lt;\/b&gt;/);
  assert.match(locked, /\(edited\)/);
  assert.doesNotMatch(locked, /<form|Edit your review/);
});

test("a review with an Edit left shows it once, prefilled, in edit mode; My Orders adds the order id", () => {
  const mine = { position: 2, can_review: false, review: { id: "r", rating: 3, body: "Okay & fine", display_name: "Ana R.", created_at: "2026-11-14T02:00:00Z", edited: false, can_edit: true } };
  const page = doneContent(orderOf(mine)).value;
  assert.equal(page.match(/Edit your review/g)?.length, 1);
  assert.match(page, /name="mode" value="edit"/);
  assert.match(page, /id="[^"]+-r3" value="3" checked/);
  assert.match(page, />Okay &amp; fine<\/textarea>/);
  assert.match(page, /value="Ana R\."/);
  assert.match(page, /Save changes/);
  const card = shopCard(orderOf(LINE), 0).value;
  assert.match(card, /action="\/dashboard\/orders\/review\/"/);
  assert.match(card, /name="order_id" value="sho_1"/);
  assert.ok(card.indexOf("data-sf-review-block") < card.indexOf("oc-detail-toggle"), "the prompt is visible without opening the details");
});

test("a review post comes back as a fixed notice on its own line and nothing the buyer typed", () => {
  const o = orderOf(LINE);
  const note = (q: string) => doneContent(o, noticeFrom(new URLSearchParams(q))).value;
  assert.match(note("review=saved&order=sho_1&line=1"), /role="status">Thank you! Your review is posted\./);
  assert.match(note("review=invalid&order=sho_1&line=1"), /choose a rating/);
  assert.match(note("review=locked&order=sho_1&line=1"), /can no longer be changed/);
  assert.doesNotMatch(note("review=saved&order=sho_1&line=2"), /sf-rv-notice/, "another line");
  assert.doesNotMatch(note("review=saved&order=sho_9&line=1"), /sf-rv-notice/, "another order");
  assert.equal(noticeFrom(new URLSearchParams("review=%3Cscript%3E&order=sho_1&line=1")), null, "only known outcomes");
  assert.equal(noticeFrom(new URLSearchParams("review=saved&order=a b&line=1")), null);
  assert.equal(noticeFrom(new URLSearchParams("review=saved&order=sho_1&line=0")), null);
});

const REVIEWER = `no_order=sho_1.${"T".repeat(43)}`;
const posted = (b: ReturnType<typeof backend>, form: Record<string, string>, cookie = REVIEWER) => reviewPost(shop(b, cookie), form);

test("the order-done review post sends the order's own proof, a JSON rating and only what was typed; the answer redirects with an outcome", async () => {
  const b = backend();
  const r = await posted(b, { position: "1", mode: "create", rating: "5", body: "  Great  ", display_name: "" });
  assert.equal(r.status, 303);
  assert.equal(r.headers.get("location"), "/checkout/done/?review=saved&order=sho_1&line=1#review-sho_1-1");
  const call = b.calls.find((c) => c.url.includes("/lines/1/review/"))!;
  assert.equal(call.method, "POST");
  assert.ok(call.url.endsWith("/storefront/v1/shop/orders/sho_1/lines/1/review/"));
  assert.deepEqual(call.body, { host: "demo.test", visitor_ip: "", view_token: "T".repeat(43), member_token: "", rating: 5, body: "  Great  " });
  assert.strictEqual(typeof (call.body as { rating: unknown }).rating, "number");
  const edit = backend();
  await posted(edit, { position: "2", mode: "edit", rating: "4", body: "", display_name: " Ana R. " });
  assert.equal(edit.calls.find((c) => c.url.includes("/lines/2/review/"))?.method, "PATCH");
  assert.equal((edit.calls.find((c) => c.url.includes("/lines/2/review/"))?.body as { display_name: string }).display_name, "Ana R.");
});

test("a review post without a rating never reaches Django; refusals map to fixed outcomes; a stranger gets no review", async () => {
  const b = backend();
  const none = await posted(b, { position: "1", mode: "create", rating: "", body: "x" });
  assert.match(none.headers.get("location") ?? "", /review=invalid/);
  assert.equal(b.calls.filter((c) => c.url.includes("/review/")).length, 0);
  const refused = async (status: number, code: string) => (await posted(backend({ reviewReply: { status, body: { error: { code, message: "m", fields: {} } } } }), { position: "1", mode: "create", rating: "5" })).headers.get("location") ?? "";
  assert.match(await refused(409, "not_delivered"), /review=not_delivered/);
  assert.match(await refused(409, "already_reviewed"), /review=exists/);
  assert.match(await refused(409, "review_locked"), /review=locked/);
  assert.match(await refused(422, "invalid_request"), /review=invalid/);
  assert.match(await refused(404, "not_found"), /review=failed/);
  assert.equal((await posted(backend(), { position: "1", rating: "5" }, "")).headers.get("location"), "/products/", "no order cookie, no review");
  assert.equal((await posted(backend(), { position: "x", rating: "5" })).status, 404);
  assert.equal((await posted(backend(), { position: "1000", rating: "5" })).status, 404);
});
