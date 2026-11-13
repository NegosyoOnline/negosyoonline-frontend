import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CART, ORDER, cookieName } from "../src/lib/cookies.ts";
import { applyChange, countOf, parseCart, readCart, serializeCart, MAX_LINES } from "../src/lib/shop-cart.ts";
import { fetchCatalog, shopQuote, parseBuyerOrder } from "../src/lib/shop-api.ts";
import { addressErrors, cartGet, cartPost, checkoutGet, checkoutPost, doneGet, localDigits, productGet, productsGet, readOrder, shopOf, splitName } from "../src/lib/shop-flow.ts";
import { homeDocument } from "../src/views/sante/home.ts";
import { homeModel } from "../src/views/sante/model.ts";
import { money, safeImage } from "../src/views/sante/shop-shell.ts";
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
};

/** A fake Django: records every call and answers the shop routes. `member` means the token is a member with active benefits. */
function backend(o: Opts = {}) {
  const calls: { url: string; body: unknown; form?: FormData }[] = [];
  const fetchImpl = (url: string, init: RequestInit) => {
    const u = new URL(url);
    const path = u.pathname;
    if (path.endsWith("/catalog/products/")) return Promise.resolve(Response.json({ products: [P1, P2] }));
    if (path.endsWith("/shop/payment-accounts/")) return Promise.resolve(Response.json({ available: true, accounts: o.accounts ?? [ACCOUNT] }));
    if (path.endsWith("/member/me/")) return Promise.resolve(Response.json({ member: { id: "m1", full_name: "Ana Reyes", email: "ana@example.test", mobile: "+639171234567", email_verified: true, mobile_verified: true } }));
    if (init.body instanceof FormData) {
      calls.push({ url, body: Object.fromEntries([...init.body.entries()].filter(([, v]) => typeof v === "string")), form: init.body });
      if (path.endsWith("/shop/orders/")) return Promise.resolve(Response.json(o.placeBody ?? { order_id: "sho_1", order_number: "SO00001", view_token: "T".repeat(43), replay: false }, { status: o.placeStatus ?? 200 }));
    }
    const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ url, body });
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
      return Promise.resolve(Response.json({ ok, member_price: members, ship_mode: mode, lines, subtotal_centavos: subtotal, shipping: { charged_centavos: 0, policy: "zero", estimated: o.estimated ?? true, available: true, error: "", note: "This store pays your shipping." }, total_centavos: subtotal, fingerprint: ok ? `fp-${mode}-${subtotal}` : "", errors: ok ? [] : ["This product is no longer available. Remove it to continue."], currency: "PHP", ...(members ? o.quoteExtra : {}) }, { status: o.quoteStatus ?? 200 }));
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
  assert.match(page, /Pay by bank or e-wallet transfer/);
  assert.doesNotMatch(page, /Cash on Delivery|credit or debit card/i);
  assert.match(page, /You Might Also Like/);
  assert.equal((await productGet(shop(backend()), "NOPE")).status, 404);
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

test("a member with benefits chooses how to ship: own address at the member price, another address at SRP, with what they earn", async () => {
  const page = await text(await checkoutGet(shop(backend({ member: true }), `no_cart=${P1.id}.2; ${MEMBER}`)));
  assert.match(page, /How should we ship this order\?/);
  assert.match(page, /Ship to my address/);
  assert.match(page, /For your own use\. You pay the member price\./);
  assert.match(page, /Ship to another address/);
  assert.match(page, /You earn <b>&#8369;360\.00<\/b>/);
  assert.match(page, /data-sf-for="home"/);
  assert.match(page, /data-sf-for="different"/);
  assert.match(page, /Member savings<\/span><strong>&minus;&#8369;360\.00/);
  assert.match(page, /name="choice" value="home"/);
  assert.match(page, /name="ship_mode" value="different"/);
});

test("'ship to my address' goes to payment at the member price with no typed address, and places with ship mode home", async () => {
  const b = backend({ member: true });
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

test("'ship to another address' pays SRP and posts the typed address", async () => {
  const b = backend({ member: true });
  const cookie = `no_cart=${P1.id}.2; ${MEMBER}`;
  const pay = await text((await checkoutPost(shop(b, cookie), { ...ADDR, action: "address", ship_mode: "different" }, null)) as Response);
  assert.match(pay, /&#8369;900\.00/);
  assert.match(pay, /name="fingerprint" value="fp-different-90000"/);
  assert.match(pay, /name="ship_mode" value="different"/);
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

test("a member whose profile has no address is told so and sent to the other card", async () => {
  const cookie = `no_cart=${P1.id}.1; ${MEMBER}`;
  const r = (await checkoutPost(shop(backend({ member: true, placeStatus: 422, placeBody: { error: { code: "no_home_address", message: "x", fields: {} } } }), cookie),
    { action: "place", ship_mode: "home", fingerprint: "fp-home-27000", submit_key: "k", account_id: "acc_1", reference_number: "R", amount_sent: "1" }, null)) as Response;
  const page = await text(r);
  assert.match(page, /Add your delivery address to your member profile first\./);
  assert.match(page, /Update address/);
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
  assert.doesNotMatch(page, /sf-own-addr-edit/); // a profile address has no page to edit it yet
  assert.doesNotMatch(page, /The delivery address saved in your member profile\./);
  const pay = await text((await checkoutPost(shop(b, memberCookie), { action: "choose", choice: "home" }, null)) as Response);
  assert.match(pay, /7 Rizal St, Poblacion, Makati, Metro Manila 1210 — Landmark: Blue gate/);
  assert.doesNotMatch(pay, /The delivery address saved in your member profile/);
});

test("Edit shows only for a Package-order address; a profile address or an older response with no source has the card but no Edit", async () => {
  const edit = /<a href="\/dashboard\/#registration" class="sf-own-addr-edit"[^>]*>Edit<\/a>/;
  const cases: [Record<string, unknown>, boolean][] = [
    [{ home_address: HOME, home_address_source: "pack_order" }, true],
    [{ home_address: HOME, home_address_source: "profile" }, false],
    [{ home_address: HOME }, false],
  ];
  for (const [quoteExtra, shown] of cases) {
    const page = await text(await checkoutGet(shop(backend({ member: true, quoteExtra }), memberCookie)));
    assert.match(page, /<dd>7 Rizal St, Poblacion, Makati, Metro Manila 1210<\/dd>/);
    assert.equal(edit.test(page), shown, JSON.stringify(quoteExtra));
  }
});

test("without home_address (an older backend, or none saved) the sentence stays and there is no Edit link", async () => {
  for (const quoteExtra of [undefined, { home_address: null, home_address_source: "" }]) {
    const b = backend({ member: true, quoteExtra });
    const page = await text(await checkoutGet(shop(b, memberCookie)));
    assert.match(page, /The delivery address saved in your member profile\./);
    assert.doesNotMatch(page, /sf-own-addr-edit/);
    const pay = await text((await checkoutPost(shop(b, memberCookie), { action: "choose", choice: "home" }, null)) as Response);
    assert.match(pay, /The delivery address saved in your member profile/);
    assert.doesNotMatch(pay, /undefined|NaN/);
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
