/* The shop's pages and posts: products, one product, the cart, the checkout, the order-done page (TWCinc's store views,
   negosyoonline_sante_pack/store_views.py, over Django's shop API: src/lib/shop-api.ts).

   Who pays what is Django's decision. A signed-in member's session cookie goes to Django as data; Django says whether this
   buyer is a member with active benefits (quote.member_price), prices every line, works out the shipping and signs the quote
   with a fingerprint that the order must carry back. The browser sends product ids, quantities, the ship mode and an address:
   never a price. Nothing a buyer typed is stored here before the order is placed; the placing buyer's key to the done page is
   the `no_order` cookie. Every refusal re-draws the page it came from with TWCinc's own words, never a status page. */
import { randomBytes } from "node:crypto";
import { MEMBER, ORDER, ORDER_MAX_AGE, clearCookie, cookieName, isSecure, readCookieShaped, setCookie } from "./cookies.ts";
import type { Member, Site } from "./django.ts";
import { fetchPack, memberMe } from "./django.ts";
import { htmlResponse } from "./html.ts";
import { callFor, redirect, type Call } from "./member.ts";
import { PROOF_MAX_BYTES, type Calls } from "./pack-api.ts";
import {
  fetchCatalog, fetchReviewPage, fetchShopAccounts, saveHomeAddress, shopOrderView, shopPlace, shopQuote, withZip,
  type Address, type CatalogProduct, type Quote, type ReviewPage,
} from "./shop-api.ts";
import { ORDER_ID, readReviewForm, submitReview } from "./review-flow.ts";
import { applyChange, readCart, writeCart, type CartChange, type CartLine } from "./shop-cart.ts";
import { MSG_ADDRESS_LOCKED, MSG_ADDRESS_NOT_SAVED, MSG_CHECK_FIELDS, MSG_MEMBER_OWN_ADDRESS_ONLY, MSG_PRICES_CHANGED, MSG_SHIP_MODE, MSG_TRY_AGAIN } from "./shop-flow-text.ts";
import { neutralNotFound } from "../views/neutral.ts";
import { homeModel, emptyContactForm, type HomeModel } from "../views/sante/model.ts";
import { cartContent } from "../views/sante/shop-cart.ts";
import { checkoutContent, ADDRESS_FIELDS, CHECKOUT_PATH, type CheckoutModel, type Mode } from "../views/sante/shop-checkout.ts";
import { doneContent } from "../views/sante/shop-done.ts";
import { noticeFrom } from "../views/sante/shop-review.ts";
import { productContent } from "../views/sante/shop-product.ts";
import { CATEGORIES, productsContent } from "../views/sante/shop-products.ts";
import { drawerOf, safeImage, shopDocument } from "../views/sante/shop-shell.ts";

export const PROOF_TOO_LARGE = `The file is too large. The limit is ${PROOF_MAX_BYTES / (1024 * 1024)} MB.`;
const SESSION_ENDED = "Your sign-in has ended. Please sign in again to ship at the member price.";
const ADDRESS_FIELD_KEYS = new Set(["receiver_name", "receiver_mobile", "contact_email", "line", "barangay", "city", "province", "zip", "landmark", "delivery_address", "ship_mode"]);
const PAY_FIELD_KEYS = new Set(["account_id", "reference_number", "amount_sent", "proof"]);

export type Shop = { request: Request; site: Site; host: string; visitor_ip: string; member_token: string; calls: Calls; now?: Date };

export function shopOf(request: Request, site: Site, call: Call = callFor(request)): Shop {
  return { request, site, host: call.host, visitor_ip: call.visitor_ip, member_token: call.member_token, calls: { env: call.env } };
}

/* ---- the basket, priced -------------------------------------------------------------------------------------------- */

export type Basket = {
  lines: CartLine[];
  /** The quote of the basket as it stands; null for an empty basket or when Django could not price it. */
  quote: Quote | null;
  /** A member with active benefits (Django's word). */
  members: boolean;
  /** The session cookie turned out dead: the page treats the visitor as a guest. */
  stale: boolean;
  /** Django said the shop is off (404). */
  off: boolean;
};

type Pricing = { ship_mode?: string; address?: Address | null };

/** One quote, with a dead member session retried as a guest. */
async function price(s: Shop, lines: CartLine[], opts: Pricing = {}): Promise<{ quote: Quote | null; stale: boolean; off: boolean }> {
  const ask = (token: string) =>
    shopQuote({ host: s.host, visitor_ip: s.visitor_ip, lines, member_token: token, ship_mode: opts.ship_mode ?? "", address: opts.address ?? null }, s.calls);
  let r = await ask(s.member_token);
  let stale = false;
  if (r.state === "refused" && r.status === 401 && s.member_token) {
    stale = true;
    r = await ask("");
  }
  if (r.state === "ok") return { quote: r.quote, stale, off: false };
  return { quote: null, stale, off: r.state === "unavailable" };
}

/** The visitor's basket priced, and whether they buy as a member. An empty basket of a signed-in member asks about the first product,
    because the product pages show the members' price only to a member with active benefits. */
export async function basketOf(s: Shop, lines: CartLine[], probe: CatalogProduct | null): Promise<Basket> {
  if (lines.length > 0) {
    const r = await price(s, lines);
    return { lines, quote: r.quote, members: r.quote?.member_price === true, stale: r.stale, off: r.off };
  }
  if (s.member_token && probe) {
    const r = await price(s, [{ id: probe.id, qty: 1 }]);
    return { lines, quote: null, members: r.quote?.member_price === true, stale: r.stale, off: r.off };
  }
  return { lines, quote: null, members: false, stale: false, off: false };
}

function imagesOf(products: CatalogProduct[] | null): Map<string, string> {
  return new Map((products ?? []).map((p) => [p.id, safeImage(p.image_url)]));
}

function chromeOf(s: Shop, b: Basket, products: CatalogProduct[] | null, extraError = ""): HomeModel {
  const base = homeModel(s.site, emptyContactForm(), s.now, s.member_token !== "" && !b.stale);
  const drawer = drawerOf(b.lines, b.quote, imagesOf(products));
  return { ...base, drawer: extraError ? { ...drawer, error: extraError } : drawer };
}

/** The home page's basket: the visitor's cookie priced, so the badge and the drawer are live (no catalog call without a basket). */
export async function homeDrawer(request: Request, site: Site): Promise<HomeModel["drawer"]> {
  const s = shopOf(request, site);
  const lines = readCart(request);
  if (lines.length === 0) return drawerOf([], null, new Map());
  const b = await basketOf(s, lines, null);
  const products = b.quote ? await fetchCatalog(s.host, s.calls) : null;
  return drawerOf(lines, b.quote, imagesOf(products));
}

function page(s: Shop, b: Basket, products: CatalogProduct[] | null, args: Parameters<typeof shopDocument>[1], status = 200, extraError = ""): Response {
  const response = htmlResponse(shopDocument(chromeOf(s, b, products, extraError), args), status);
  if (b.stale) clearCookie(response, s.request, MEMBER);
  return response;
}

/* ---- products ------------------------------------------------------------------------------------------------------ */

export async function productsGet(s: Shop): Promise<Response> {
  const products = await fetchCatalog(s.host, s.calls);
  if (!products) return neutralNotFound();
  const asked = new URL(s.request.url).searchParams.get("category") ?? "";
  const category = CATEGORIES.some((c) => c.value === asked) ? asked : "";
  const b = await basketOf(s, readCart(s.request), products[0] ?? null);
  const shown = category ? products.filter((p) => p.category === category) : products;
  return page(s, b, products, { title: "Products", content: productsContent({ products: shown, category, members: b.members, message: "" }) });
}

/** One product by its code (the list is 18 rows, so there is no second route: plan R2). */
export async function productGet(s: Shop, code: string): Promise<Response> {
  /* The pack read runs beside the catalog; "Members save up to N%" links to the pack landing page only while the pack is on
     for this host. fetchPack never throws and answers null when it is off or failed, so the page never breaks on it. */
  const [products, pack] = await Promise.all([
    fetchCatalog(s.host, s.calls),
    fetchPack(s.host, s.calls.env, s.calls.fetchImpl, s.calls.log).catch(() => null),
  ]);
  if (!products) return neutralNotFound();
  const product = products.find((p) => p.code === code);
  if (!product) return neutralNotFound();
  const b = await basketOf(s, readCart(s.request), product);
  const others = products.filter((p) => p.id !== product.id);
  const related = [...others.filter((p) => p.category === product.category), ...others.filter((p) => p.category !== product.category)].slice(0, 4);
  const asked = Number(new URL(s.request.url).searchParams.get("reviews") ?? "1");
  const pages = Number.isInteger(asked) ? Math.min(MAX_REVIEW_PAGES, Math.max(1, asked)) : 1;
  const reviews = await reviewsOf(s, product.id, pages);
  return page(s, b, products, {
    title: product.name, css: [REVIEWS_CSS],
    content: productContent({ product, related, members: b.members, packOn: pack !== null, reviews: reviews?.page ?? null, moreHref: `/products/${encodeURIComponent(product.code)}/?reviews=${(reviews?.loaded ?? 1) + 1}#reviews` }),
  });
}

const MAX_REVIEW_PAGES = 10;
export const REVIEWS_CSS = "css/pack-reviews.css";

/** The product's reviews, the first `pages` pages (10 each, newest first) in one list; null when Django cannot answer (the page then simply has no reviews). */
async function reviewsOf(s: Shop, productId: string, pages: number): Promise<{ page: ReviewPage; loaded: number } | null> {
  const first = await fetchReviewPage(s.host, productId, 1, s.calls);
  if (!first) return null;
  const merged: ReviewPage = { ...first, reviews: [...first.reviews] };
  let loaded = 1;
  while (loaded < pages && merged.has_more) {
    const next = await fetchReviewPage(s.host, productId, loaded + 1, s.calls);
    if (!next) break;
    merged.reviews.push(...next.reviews);
    merged.has_more = next.has_more;
    loaded += 1;
  }
  return { page: merged, loaded };
}

/* ---- the cart ------------------------------------------------------------------------------------------------------ */

async function cartPage(s: Shop, lines: CartLine[], error = "", write = false): Promise<Response> {
  const products = await fetchCatalog(s.host, s.calls);
  if (!products) return neutralNotFound();
  const b = await basketOf(s, lines, products[0] ?? null);
  if (b.off) return neutralNotFound();
  const failed = lines.length > 0 && b.quote === null;
  const response = page(s, b, products, {
    title: "Your Cart",
    content: cartContent({ quote: b.quote, images: imagesOf(products), error: error || (failed ? "We could not price your cart. Please try again." : ""), empty: lines.length === 0 }),
  }, 200, error);
  if (write || lines.length > 0) writeCart(response, s.request, lines); // the basket's seven days slide with each visit
  return response;
}

export const cartGet = (s: Shop): Promise<Response> => cartPage(s, readCart(s.request));

/** A post to /cart/: add, set or remove one product. A page navigation goes back to /cart/ (so a reload posts nothing twice); the
    basket script's background post gets the page itself, whose drawer it swaps in. */
export async function cartPost(s: Shop, text: Record<string, string>): Promise<Response> {
  const action = text.action;
  if (action !== "add" && action !== "set" && action !== "remove") return neutralNotFound();
  const change: CartChange = { action, id: (text.product_id ?? "").trim(), qty: Number((text.quantity ?? "1").trim()) };
  const before = readCart(s.request);
  const { lines, error } = applyChange(before, change);
  const navigating = s.request.headers.get("sec-fetch-mode") === "navigate";
  if (navigating) {
    const response = redirect("/cart/");
    writeCart(response, s.request, lines);
    return response;
  }
  return cartPage(s, lines, error, true);
}

/* ---- the checkout -------------------------------------------------------------------------------------------------- */

function submitKey(): string {
  return randomBytes(12).toString("base64url");
}

/** "Ana Maria Reyes" -> first "Ana Maria", last "Reyes" (TWCinc's checkout splits a saved name the same way). */
export function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  const last = parts.length > 1 ? (parts.pop() ?? "") : "";
  return { first: parts.join(" "), last };
}

/** The 10 digits after +63 of a Philippine mobile, or the digits as they are. */
export function localDigits(raw: string): string {
  let d = (raw ?? "").replace(/\D/g, "");
  if (d.startsWith("63")) d = d.slice(2);
  else if (d.startsWith("0")) d = d.slice(1);
  return d.slice(0, 10);
}

function addressOf(text: Record<string, string>): Address {
  const t = (k: string) => (text[k] ?? "").trim();
  return { line: t("line"), barangay: t("barangay"), city: t("city"), province: t("province"), zip: t("zip"), landmark: t("landmark") };
}

/** The checks the address step makes before payment, in TWCinc's words; Django checks it all again when the order is placed. */
export function addressErrors(text: Record<string, string>): Record<string, string> {
  const e: Record<string, string> = {};
  const t = (k: string) => (text[k] ?? "").trim();
  if (!t("first_name") || !t("last_name")) e.receiver_name = "Enter the first and last name.";
  if (!/^9\d{9}$/.test(localDigits(text.mobile ?? ""))) e.receiver_mobile = "Enter a valid Philippine mobile number.";
  if (t("email") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t("email"))) e.contact_email = "Enter a valid email address.";
  if (!t("line")) e.line = "Enter the street address.";
  if (!t("province")) e.province = "Enter the province.";
  if (!t("city")) e.city = "Enter the city or municipality.";
  if (!t("barangay")) e.barangay = "Enter the barangay.";
  if (!t("landmark")) e.landmark = "Enter a landmark.";
  return e;
}

async function memberInfo(s: Shop): Promise<Member | null> {
  if (!s.member_token) return null;
  const me = await memberMe({ host: s.host, token: s.member_token }, s.calls);
  return me.state === "ok" ? me.member : null;
}

type Prepared = { response: Response } | { lines: CartLine[]; quote: Quote; products: CatalogProduct[]; stale: boolean };

/** The basket for a checkout page, priced; an empty basket, a product that is gone or a quote Django would not sign sends the buyer to the cart. */
async function prepared(s: Shop): Promise<Prepared> {
  const lines = readCart(s.request);
  if (lines.length === 0) return { response: redirect("/cart/") };
  const products = await fetchCatalog(s.host, s.calls);
  if (!products) return { response: neutralNotFound() };
  const r = await price(s, lines);
  if (r.off) return { response: neutralNotFound() };
  if (!r.quote || !r.quote.ok) return { response: redirect("/cart/") };
  return { lines, quote: r.quote, products, stale: r.stale };
}

function blank(over: Partial<CheckoutModel> = {}): CheckoutModel {
  return {
    step: "address", edit: false, benefits: false, member: null, mode: "guest", quote: null, quotes: { home: null },
    posted: {}, field_errors: {}, error_message: "", accounts: null, submit_key: "", ...over,
  };
}

function checkoutPage(s: Shop, p: { lines: CartLine[]; quote: Quote; products: CatalogProduct[]; stale: boolean }, m: CheckoutModel, status = 200): Response {
  const b: Basket = { lines: p.lines, quote: p.quote, members: p.quote.member_price, stale: p.stale, off: false };
  return page(s, b, p.products, {
    title: "Checkout", content: checkoutContent(m), css: ["css/pack-select.css", "css/pack-shop.css"],
    scripts: ["js/pack-select.js", "js/pack-address.js", "js/pack-shop.js"],
  }, status);
}

/** The shipping-address step: a member with benefits sees only their own saved address (no ship-to choice); a guest types one. */
async function addressStep(s: Shop, p: Extract<Prepared, { lines: CartLine[] }>, over: Partial<CheckoutModel> = {}): Promise<Response> {
  const benefits = p.quote.member_price;
  const member = await memberInfo(s);
  let posted = over.posted ?? {};
  if (!benefits && member && Object.keys(posted).length === 0) {
    const n = splitName(member.full_name);
    posted = { first_name: n.first, last_name: n.last, mobile: localDigits(member.mobile), email: member.email };
  }
  let home: Quote | null = null;
  if (benefits) home = (await price(s, p.lines, { ship_mode: "home" })).quote;
  const m = blank({
    step: "address", benefits, member: member ? { name: member.full_name, mobile: member.mobile } : null, mode: "guest",
    quote: benefits ? home ?? p.quote : p.quote, quotes: { home }, posted, ...over,
  });
  return checkoutPage(s, p, m);
}

export async function checkoutGet(s: Shop): Promise<Response> {
  const p = await prepared(s);
  if ("response" in p) return p.response;
  if (new URL(s.request.url).searchParams.get("edit") === "home") return editStep(s, p);
  return addressStep(s, p);
}

/** The member's saved address, or the empty address, as the form's posted fields. */
function postedOf(a: Address | null | undefined): Record<string, string> {
  return a ? { line: a.line, barangay: a.barangay, city: a.city, province: a.province, zip: a.zip, landmark: a.landmark } : {};
}

/** TWCinc's /checkout/?edit=home: the address form on its own, prefilled with the saved address. Only a member with benefits whose
    address is not locked and who has one saved gets it; anyone else goes back to the checkout. */
async function editStep(
  s: Shop, p: Extract<Prepared, { lines: CartLine[] }>, over: Partial<CheckoutModel> = {}, status = 200,
): Promise<Response> {
  if (!p.quote.member_price) return redirect(CHECKOUT_PATH);
  const home = (await price(s, p.lines, { ship_mode: "home" })).quote;
  const saved = home?.home_address ?? null;
  if (!home || !saved || home.home_address_locked === true) return redirect(CHECKOUT_PATH);
  const member = await memberInfo(s);
  const m = blank({
    step: "address", edit: true, benefits: true, member: member ? { name: member.full_name, mobile: member.mobile } : null, mode: "home",
    quote: home, quotes: { home }, posted: postedOf(saved), ...over,
  });
  return checkoutPage(s, p, m, status);
}

/** The member saves the address of the edit form (TWCinc action save_home). Success returns to the checkout, where the address is
    confirmed again before paying; a refusal is shown on the edit form. */
async function saveHomePost(s: Shop, text: Record<string, string>): Promise<Response> {
  const p = await prepared(s);
  if ("response" in p) return p.response;
  if (!p.quote.member_price) return redirect(CHECKOUT_PATH);
  const typed = addressOf(text);
  const saved = typed.zip ? null : (await price(s, p.lines, { ship_mode: "home" })).quote?.home_address ?? null;
  const address = await withZip(typed, saved, s, s.calls);
  const posted = postedOf(address);
  const r = await saveHomeAddress({ host: s.host, visitor_ip: s.visitor_ip, member_token: s.member_token, address }, s.calls);
  if (r.state === "ok") return redirect(CHECKOUT_PATH);
  // an older backend has no such route (404), and a failed call may be a passing fault: the form stays, with what was typed
  if (r.state === "unavailable" || r.state === "failed") return editStep(s, p, { error_message: MSG_ADDRESS_NOT_SAVED, posted }, 503);
  switch (r.status === 401 ? "session" : r.code) {
    case "session": {
      const response = await addressStep({ ...s, member_token: "" }, p, { error_message: SESSION_ENDED });
      clearCookie(response, s.request, MEMBER);
      return response;
    }
    case "address_locked":
      return addressStep(s, p, { error_message: r.message || MSG_ADDRESS_LOCKED });
    case "invalid_address":
      return editStep(s, p, { error_message: MSG_CHECK_FIELDS, field_errors: r.fields, posted });
    default:
      return editStep(s, p, { error_message: r.message || MSG_ADDRESS_NOT_SAVED, field_errors: r.fields, posted }, r.status === 429 ? 429 : 200);
  }
}

/** The payment step for a chosen ship mode and address: a fresh quote (its fingerprint rides in the order), the store's accounts. */
async function paymentStep(
  s: Shop, p: Extract<Prepared, { lines: CartLine[] }>, mode: Mode, text: Record<string, string>, over: Partial<CheckoutModel> = {}, status = 200,
): Promise<Response> {
  const address = mode === "home" ? null : addressOf(text);
  const r = await price(s, p.lines, { ship_mode: mode === "guest" ? "" : mode, address });
  if (r.off) return neutralNotFound();
  if (!r.quote || !r.quote.ok) return redirect("/cart/");
  const accounts = await fetchShopAccounts(s.host, s.calls);
  const member = await memberInfo(s);
  const posted: Record<string, string> = {};
  for (const k of [...ADDRESS_FIELDS, "account_id", "reference_number", "amount_sent"]) if (text[k] !== undefined) posted[k] = text[k];
  const m = blank({
    step: "payment", benefits: r.quote.member_price, member: member ? { name: member.full_name, mobile: member.mobile } : null, mode, quote: r.quote,
    posted, accounts, submit_key: submitKey(), ...over,
  });
  return checkoutPage(s, { ...p, quote: r.quote }, m, status);
}

function cleanedPosted(text: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of ADDRESS_FIELDS) if (text[k] !== undefined) out[k] = text[k];
  return out;
}

export async function checkoutPost(s: Shop, text: Record<string, string>, proof: File | null): Promise<Response | null> {
  const action = text.action ?? "";
  if (action === "place") return placePost(s, text, proof);
  if (action === "save_home") return saveHomePost(s, text);
  const p = await prepared(s);
  if ("response" in p) return p.response;
  const mode = text.ship_mode ?? "";

  if (action === "choose") {
    if (!p.quote.member_price || text.choice !== "home") return addressStep(s, p, { error_message: MSG_SHIP_MODE });
    const home = (await price(s, p.lines, { ship_mode: "home" })).quote;
    if (!home?.home_address) return addressStep(s, p);
    return paymentStep(s, p, "home", {});
  }
  if (action === "address") {
    // A member with benefits has no typed address: member-price orders ship to the saved one only.
    if (p.quote.member_price) return addressStep(s, p, { error_message: MSG_MEMBER_OWN_ADDRESS_ONLY });
    if (mode !== "guest") return addressStep(s, p, { error_message: MSG_SHIP_MODE, posted: cleanedPosted(text) });
    const field_errors = addressErrors(text);
    if (Object.keys(field_errors).length > 0) {
      return addressStep(s, p, { error_message: MSG_CHECK_FIELDS, field_errors, posted: cleanedPosted(text) });
    }
    return paymentStep(s, p, "guest", text);
  }
  if (action === "edit") {
    // "Cancel Order" / "Change address": back to the address step with what was typed (a home order has nothing typed)
    return addressStep(s, p, { posted: cleanedPosted(text) });
  }
  return null;
}

/** The order. One post: the address carried from the last step, the payment fields and the proof file. */
async function placePost(s: Shop, text: Record<string, string>, proof: File | null): Promise<Response | null> {
  const p = await prepared(s);
  if ("response" in p) return p.response;
  const posted = text.ship_mode ?? "";
  const mode: Mode = posted === "home" ? "home" : "guest";
  if (posted === "different" || (p.quote.member_price && mode !== "home")) {
    return addressStep(s, p, { error_message: MSG_MEMBER_OWN_ADDRESS_ONLY }); // never sent to Django: member-price orders ship to the saved address only
  }
  if (mode !== "guest" && !p.quote.member_price) return addressStep(s, p, { error_message: SESSION_ENDED });
  if (proof && proof.size > PROOF_MAX_BYTES) {
    return paymentStep(s, p, mode, text, { error_message: MSG_CHECK_FIELDS, field_errors: { proof: PROOF_TOO_LARGE } });
  }

  const form = new FormData();
  form.append("host", s.host);
  form.append("visitor_ip", s.visitor_ip);
  form.append("lines", JSON.stringify(p.lines.map((l) => ({ id: l.id, qty: l.qty }))));
  form.append("member_token", s.member_token);
  form.append("ship_mode", mode === "guest" ? "" : mode);
  if (mode !== "home") {
    form.append("address", JSON.stringify(addressOf(text)));
    form.append("receiver_name", [text.first_name, text.last_name].map((x) => (x ?? "").trim()).filter(Boolean).join(" "));
    const digits = localDigits(text.mobile ?? "");
    form.append("receiver_mobile", digits ? `0${digits}` : "");
    form.append("contact_email", (text.email ?? "").trim());
  }
  form.append("fingerprint", text.fingerprint ?? "");
  form.append("submit_key", text.submit_key ?? "");
  for (const k of ["account_id", "reference_number", "amount_sent"]) form.append(k, (text[k] ?? "").trim());
  if (proof && proof.size > 0) form.append("proof", proof, proof.name || "proof");

  const r = await shopPlace(form, s.calls);
  if (r.state === "unavailable") return neutralNotFound();
  if (r.state === "failed") return paymentStep(s, p, mode, text, { error_message: MSG_TRY_AGAIN }, 503);
  if (r.state === "ok") return placed(s, r);

  // a refusal: shown on the step the fields belong to
  const keys = Object.keys(r.fields);
  switch (r.code) {
    case "prices_changed":
      return paymentStep(s, p, mode, text, { error_message: MSG_PRICES_CHANGED });
    case "product_unavailable":
    case "empty_cart":
    case "invalid_line":
    case "too_many_lines":
    case "invalid_quantity":
      return redirect("/cart/");
    case "member_session_invalid": {
      const response = await addressStep({ ...s, member_token: "" }, p, { error_message: SESSION_ENDED, posted: cleanedPosted(text) });
      clearCookie(response, s.request, MEMBER);
      return response;
    }
    case "no_home_address":
      return addressStep(s, p); // the page itself says so, with the dashboard link
    case "member_own_address_only":
      return addressStep(s, p, { error_message: MSG_MEMBER_OWN_ADDRESS_ONLY });
    case "ship_mode_not_allowed":
    case "ship_mode_required":
      return addressStep(s, p, { error_message: r.message || MSG_SHIP_MODE, posted: cleanedPosted(text) });
    default:
  }
  if (keys.some((k) => ADDRESS_FIELD_KEYS.has(k))) {
    return addressStep(s, p, { error_message: MSG_CHECK_FIELDS, field_errors: r.fields, posted: cleanedPosted(text) });
  }
  const onSheet = keys.some((k) => PAY_FIELD_KEYS.has(k));
  const status = r.status === 429 ? 429 : 200;
  return paymentStep(s, p, mode, text, { error_message: onSheet ? MSG_CHECK_FIELDS : r.message || MSG_TRY_AGAIN, field_errors: r.fields }, status);
}

function placed(s: Shop, r: { order_id: string; view_token: string }): Response {
  const response = redirect("/checkout/done/");
  const had = readOrder(s.request);
  if (r.view_token) setCookie(response, s.request, ORDER, `${r.order_id}.${r.view_token}`, ORDER_MAX_AGE);
  else if (!had || had.id !== r.order_id) return replayAnswer(s); // a replay answers its token once, to the first post
  writeCart(response, s.request, []);
  return response;
}

function replayAnswer(s: Shop): Response {
  const response = redirect(s.member_token ? "/dashboard/orders/" : "/products/");
  writeCart(response, s.request, []);
  return response;
}

/* ---- the order-done page ------------------------------------------------------------------------------------------- */

const ORDER_SHAPE = /^[A-Za-z0-9_-]{1,64}\.[A-Za-z0-9_-]{16,200}$/;

export function readOrder(request: Request): { id: string; token: string } | null {
  const raw = readCookieShaped(request.headers.get("cookie"), cookieName(ORDER, isSecure(request)), ORDER_SHAPE);
  if (!raw) return null;
  const at = raw.indexOf(".");
  return { id: raw.slice(0, at), token: raw.slice(at + 1) };
}

export async function doneGet(s: Shop): Promise<Response> {
  const key = readOrder(s.request);
  if (!key) return redirect("/products/");
  const r = await shopOrderView({ host: s.host, visitor_ip: s.visitor_ip, order_id: key.id, view_token: key.token }, s.calls);
  if (r.state === "unavailable") {
    // a wrong id or token and a switched-off shop answer alike: only the placing buyer opens this page
    const gone = redirect("/products/");
    clearCookie(gone, s.request, ORDER);
    return gone;
  }
  if (r.state !== "ok") return htmlResponse(shopDocument(chromeOf(s, { lines: [], quote: null, members: false, stale: false, off: false }, null), {
    title: "Order", content: cartContent({ quote: null, images: new Map(), error: MSG_TRY_AGAIN, empty: true }),
  }), 503);
  const b: Basket = { lines: [], quote: null, members: false, stale: false, off: false };
  return page(s, b, null, { title: `Order ${r.order.order_number}`, css: [REVIEWS_CSS], content: doneContent(r.order, noticeFrom(new URL(s.request.url).searchParams)) });
}

/** POST /checkout/done/review/: the placing buyer reviews a line of their own order (the `no_order` cookie is their proof). */
export async function reviewPost(s: Shop, text: Record<string, string>): Promise<Response> {
  const key = readOrder(s.request);
  if (!key) return redirect("/products/");
  const form = readReviewForm(text);
  if (!form || !ORDER_ID.test(key.id)) return neutralNotFound();
  return submitReview({ host: s.host, visitor_ip: s.visitor_ip, order_id: key.id, view_token: key.token, member_token: "", calls: s.calls }, form, "/checkout/done/");
}

