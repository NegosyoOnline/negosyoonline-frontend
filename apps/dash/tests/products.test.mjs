/* Products (/products/, ClickUp z8uq9mek5w): the pure helpers, the error mapping, and the screen driven through a small
   stand-in document (dom.mjs) and a recorded fetch: list, read-only, add, edit, image, stale revision, history. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDocument } from "./dom.mjs";

const JS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "assets", "js");
const read = (f) => fs.readFileSync(path.join(JS, f), "utf8");
const SRC = read("products.js");
const CSS = fs.readFileSync(path.join(JS, "..", "css", "products.css"), "utf8");
const SITE = "site_aaaaaaaaaaaaaaaaaaaa", SITE2 = "site_bbbbbbbbbbbbbbbbbbbb";
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 8; i++) await tick(); };

const product = (n, over = {}) => ({ id: "prod_" + n, code: "SPH" + n, name: "Product " + n, short_description: "", long_description: "", category: "barley",
  image_url: null, weight_kg: "0.18", srp_centavos: 45000, earnings_rate: "0.4000", volume_slot: null, shipping_qty: null,
  length_cm: null, width_cm: null, height_cm: null, is_active: true, revision: 1, unit_members_price_centavos: 27000, updated_at: "2026-11-13T00:00:00Z", ...over });

class FakeForm { constructor() { this.parts = []; } append(k, v) { this.parts.push([k, v]); } get(k) { const p = this.parts.find((x) => x[0] === k); return p ? p[1] : null; } }

function boot({ products = [product("1"), product("2", { is_active: false, image_url: "https://media.test/p2.jpg" })], canEdit = true, routes, sites } = {}) {
  const doc = makeDocument(), calls = [], toasts = [], stored = [];
  const page = doc.body.appendChild(doc.createElement("div"));
  for (const id of ["pr-root", "pr-live"]) { const n = doc.createElement("div"); n.setAttribute("id", id); page.appendChild(n); }
  const state = { products: products.map((p) => ({ ...p })), canEdit, revisions: {} };
  const siteList = sites || [{ id: SITE, template: "sante", display_name: "Nena's Shop" }];
  const fallback = (method, p, body) => {
    if (method === "GET" && p === "/sites/") return { status: 200, body: { items: siteList, next_cursor: null } };
    const m = /^\/sites\/(site_[0-9a-z]{20})\/catalog\/products\/(?:(prod_\w+)\/)?(image\/|revisions\/)?(\?.*)?$/.exec(p);
    if (!m) return { status: 404, body: { error: { code: "not_found", message: "Not found." } } };
    if (method === "GET" && !m[2]) return { status: 200, body: { can_edit: state.canEdit, products: state.products } };
    if (method === "GET" && m[3] === "revisions/") return { status: 200, body: { revisions: state.revisions[m[2]] || [] } };
    if (method === "POST" && !m[2]) {
      const created = product(String(state.products.length + 1), { ...body, id: "prod_" + (state.products.length + 1), unit_members_price_centavos: 1 });
      state.products.push(created); return { status: 201, body: created };
    }
    const cur = state.products.find((x) => x.id === m[2]);
    if (!cur) return { status: 404, body: { error: { code: "not_found", message: "Not found." } } };
    if (method === "PATCH") { const rest = { ...body }; delete rest.revision; Object.assign(cur, rest, { revision: cur.revision + 1 }); return { status: 200, body: cur }; }
    if (m[3] === "image/") { cur.image_url = method === "POST" ? "https://media.test/new.png" : null; cur.revision += 1; return { status: 200, body: cur }; }
    return { status: 404, body: {} };
  };
  const fetch = (url, opts) => {
    const p = url.replace("http://api.test/v1", ""), isForm = opts.body instanceof FakeForm;
    const body = opts.body && !isForm ? JSON.parse(opts.body) : null;
    calls.push({ method: opts.method, path: p, body, form: isForm ? opts.body : null });
    const answer = (routes && routes(opts.method, p, body, state)) || fallback(opts.method, p, body);
    return Promise.resolve(answer).then((a) => ({ ok: a.status >= 200 && a.status < 300, status: a.status, json: () => Promise.resolve(a.body) }));
  };
  const storage = (name) => ({ getItem: () => null, removeItem() {}, setItem(k) { stored.push(name + ":" + k); } });
  const window = { NO_CONFIG: { apiBase: "http://api.test/v1", siteUrl: "http://www.test" }, addEventListener() {} };
  const location = { search: "", pathname: "/products/", replace() {}, assign() {} };
  const context = vm.createContext({ window, document: doc, location, history: { replaceState() {} }, console, URLSearchParams, Promise, setTimeout, clearTimeout, Intl, Date,
    FormData: FakeForm, localStorage: storage("local"), sessionStorage: storage("session"), requestAnimationFrame() {}, fetch });
  for (const f of ["app.js", "products.js"]) vm.runInContext(read(f), context, { filename: f });
  window.NODash.toast = (title, sub) => toasts.push(title + (sub ? ": " + sub : ""));
  const $ = (id) => doc.getElementById(id);
  const all = (cls, root = $("pr-root")) => root.all((n) => n.classList.contains(cls));
  const buttons = (text, root = $("pr-root")) => root.all((n) => n.tagName === "BUTTON" && n.textContent === text);
  const form = () => $("pr-root").all((n) => n.tagName === "FORM")[0];
  return { doc, window, calls, toasts, stored, state, $, all, buttons, form, P: window.NOProducts,
    writes: () => calls.filter((c) => c.method !== "GET"),
    async show() { window.NOProducts.show(); await settle(); },
    set(id, v) { const n = $("pr-f-" + id); n.value = v; n.fire("input"); return n; },
    async submit() { form().fire("submit"); await settle(); },
    error(name) { const n = $("pr-e-" + name); return n && !n.hidden ? n.textContent : ""; } };
}

test("pure helpers: pesos to whole centavos, never a float", () => {
  const u = boot().P.util;
  assert.equal(u.pesosToCentavos("450"), 45000);
  assert.equal(u.pesosToCentavos("1,400"), 140000);
  assert.equal(u.pesosToCentavos("₱450.5"), 45050);
  assert.equal(u.pesosToCentavos("19.99"), 1999);
  for (const bad of ["", "0", "0.00", "-5", "12.345", "abc", "1e3"]) assert.equal(u.pesosToCentavos(bad), null, bad);
  assert.equal(u.formatPeso(140000), "₱1,400.00");
  assert.equal(u.formatPeso(5), "₱0.05");
  assert.equal(u.centavosToField(45050), "450.50");
  assert.equal(u.centavosToField(140000), "1400");
});

test("pure helpers: the 40% rate is sent as \"0.4000\" and read back as 40", () => {
  const u = boot().P.util;
  assert.equal(u.percentToRate("40"), "0.4000");
  assert.equal(u.percentToRate("20"), "0.2000");
  assert.equal(u.percentToRate("12.5"), "0.1250");
  assert.equal(u.percentToRate("10"), "0.1000");
  assert.equal(u.percentToRate("50"), "0.5000");
  for (const bad of ["9.99", "50.01", "51", "", "x", "100", "0.4"]) assert.equal(u.percentToRate(bad), null, bad);
  assert.equal(u.rateToPercent("0.4000"), "40");
  assert.equal(u.rateToPercent("0.1250"), "12.5");
  assert.equal(u.rateToPercent("0.2000"), "20");
});

test("pure helpers: the members price rounds half up to the centavo like the server", () => {
  const u = boot().P.util;
  assert.equal(u.membersPrice(45000, "0.4000"), 27000);
  assert.equal(u.membersPrice(50000, "0.2000"), 40000);
  assert.equal(u.membersPrice(154500, "0.4000"), 92700);
  assert.equal(u.membersPrice(1, "0.5000"), 0, "0.5 centavo rounds up to 1 off");
  assert.equal(u.membersPrice(333, "0.1000"), 300, "33.3 off rounds to 33");
  assert.equal(u.membersPrice(335, "0.1000"), 301, "33.5 off rounds half up to 34");
});

test("error mapping: each failure has its own sentence", () => {
  const { describeError: d } = boot().P.util;
  const r = (status, code, extra = {}) => d({ status, data: { code, message: "server text", fields: {}, ...extra } });
  assert.deepEqual([r(409, "stale_revision").kind, r(409, "stale_revision").message], ["stale", "This product was changed since you loaded it."]);
  assert.equal(r(409, "code_taken", { fields: { code: "That product code is already in the catalog." } }).fields.code, "That product code is already in the catalog.");
  assert.equal(r(403, "catalog_read_only").kind, "readonly");
  assert.match(r(403, "billing_only").message, /Billing/);
  assert.equal(r(503, "image_store_not_configured").kind, "image");
  assert.match(r(503, "image_store_not_configured").message, /image store is not set up/);
  assert.equal(r(502, "image_not_saved").message, "The image could not be stored. Try again.");
  assert.equal(r(400, "invalid_request", { fields: { name: "Use 1 to 120 characters." } }).fields.name, "Use 1 to 120 characters.");
  assert.equal(d({ status: 0, data: { message: "We could not reach the server. Please check your connection and try again." } }).message, "We could not reach the server. Please check your connection and try again.");
  const texts = new Set([r(409, "stale_revision").message, r(403, "catalog_read_only").message, r(403, "billing_only").message, r(503, "image_store_not_configured").message, r(502, "image_not_saved").message]);
  assert.equal(texts.size, 5);
});

test("history phrases: what changed, no writer", () => {
  const { changes } = boot().P.util;
  const a = product("1"), b = { ...a, revision: 2, srp_centavos: 50000, name: "Renamed", is_active: false, image_url: "https://x/y.png" };
  assert.deepEqual(Array.from(changes(a, null)), ["Product added"]);
  assert.deepEqual(Array.from(changes(b, a)), ["Name changed", "Image changed", "Price (SRP) ₱450.00 to ₱500.00", "Hidden from shops"]);
  assert.deepEqual(Array.from(changes(a, a)), ["Saved with no changes"]);
});

test("owner list: a card for each product with image or placeholder, chips, SRP and members price; cards and titles are not focusable", async () => {
  const d = boot();
  await d.show();
  assert.deepEqual(d.calls.map((c) => c.method + " " + c.path), ["GET /sites/", `GET /sites/${SITE}/catalog/products/`]);
  const cards = d.all("pr-card");
  assert.equal(cards.length, 2);
  assert.equal(d.all("pr-count")[0].textContent, "2 products");
  assert.equal(d.buttons("Add product").length, 1);
  assert.equal(d.all("pr-edit").length, 2);
  assert.match(cards[0].textContent, /SPH1/);
  assert.match(cards[0].textContent, /₱450\.00/);
  assert.match(cards[0].textContent, /₱270\.00/);
  assert.match(cards[0].textContent, /No image/);
  assert.match(cards[1].textContent, /Hidden/);
  assert.equal(cards[1].all((n) => n.tagName === "IMG").length, 1);
  for (const c of cards) {
    for (const n of [c, ...c.all()]) assert.equal(n.getAttribute("tabindex"), null, "nothing in a card has a tabindex");
    assert.equal(c.all((n) => n.tagName === "H2")[0].getAttribute("tabindex"), null);
  }
  assert.deepEqual(d.stored, [], "no storage key");
});

test("a store that cannot edit sees the list read-only with a one-line note", async () => {
  const d = boot({ canEdit: false });
  await d.show();
  assert.equal(d.all("pr-card").length, 2);
  assert.equal(d.buttons("Add product").length, 0);
  assert.equal(d.all("pr-edit").length + d.all("pr-hist").length, 0);
  assert.equal(d.all("pr-note").length, 1);
  assert.match(d.all("pr-note")[0].textContent, /managed centrally/);
});

test("empty states, and an account with no Santé store", async () => {
  const owner = boot({ products: [] });
  await owner.show();
  assert.match(owner.$("pr-root").textContent, /Add your first product/);
  const member = boot({ products: [], canEdit: false });
  await member.show();
  assert.match(member.$("pr-root").textContent, /No products yet/);
  const none = boot({ sites: [{ id: SITE, template: "basic", display_name: "Other" }] });
  await none.show();
  assert.match(none.$("pr-root").textContent, /Santé stores/);
  assert.equal(none.calls.length, 1, "no catalog request for a store that is not Santé");
});

test("add: pesos become centavos, the 40% rate goes as \"0.4000\", the code is upper-cased, and the new product is added active", async () => {
  const d = boot({ products: [] });
  await d.show();
  d.buttons("Add product")[0].fire("click");
  d.set("code", "sph9001"); d.set("name", "  New Coffee "); d.set("category", "drinks"); d.set("srp_centavos", "1,400");
  assert.equal(d.$("pr-f-earnings_rate").value, "40");
  assert.match(d.all("pr-preview")[0].textContent, /₱840\.00/, "the live members price");
  d.set("earnings_rate", "20");
  assert.match(d.all("pr-preview")[0].textContent, /₱1,120\.00/);
  d.set("earnings_rate", "40");
  await d.submit();
  const w = d.writes();
  assert.equal(w.length, 1);
  assert.equal(w[0].method, "POST");
  assert.equal(w[0].path, `/sites/${SITE}/catalog/products/`);
  assert.equal(w[0].body.code, "SPH9001");
  assert.equal(w[0].body.name, "New Coffee");
  assert.equal(w[0].body.srp_centavos, 140000);
  assert.strictEqual(typeof w[0].body.srp_centavos, "number");
  assert.equal(w[0].body.earnings_rate, "0.4000");
  assert.equal(w[0].body.weight_kg, "0.00");
  assert.ok(!("is_active" in w[0].body) && !("revision" in w[0].body));
  assert.equal(d.all("pr-card").length, 1, "back on the list");
  assert.ok(d.toasts.some((t) => /Saved/.test(t)));
});

test("add with Show in shops off: created, then a second write hides it", async () => {
  const d = boot({ products: [] });
  await d.show();
  d.buttons("Add product")[0].fire("click");
  d.set("code", "X1"); d.set("name", "Hidden one"); d.set("srp_centavos", "100");
  d.$("pr-f-is_active").checked = false;
  await d.submit();
  assert.deepEqual(d.writes().map((c) => c.method), ["POST", "PATCH"]);
  assert.deepEqual(d.writes()[1].body, { revision: 1, is_active: false });
});

test("add: missing or invalid values are named under their fields and nothing is sent", async () => {
  const d = boot({ products: [] });
  await d.show();
  d.buttons("Add product")[0].fire("click");
  d.set("srp_centavos", "0"); d.set("earnings_rate", "60");
  await d.submit();
  assert.equal(d.writes().length, 0);
  for (const f of ["code", "name", "srp_centavos", "earnings_rate"]) assert.ok(d.error(f), f + " has a message");
});

test("server field errors and a taken code show under their fields", async () => {
  const d = boot({ products: [], routes: (m) => m === "POST" ? { status: 409, body: { error: { code: "code_taken", message: "That product code is already in the catalog.", fields: { code: ["That product code is already in the catalog."] } } } } : null });
  await d.show();
  d.buttons("Add product")[0].fire("click");
  d.set("code", "DUP"); d.set("name", "n"); d.set("srp_centavos", "10");
  await d.submit();
  assert.equal(d.error("code"), "That product code is already in the catalog.");
  assert.equal(d.$("pr-f-code").getAttribute("aria-invalid"), "true");
});

test("edit: only the changed fields go, with the loaded revision; the code is read-only; an unchanged form sends nothing", async () => {
  const d = boot();
  await d.show();
  d.all("pr-edit")[0].fire("click");
  assert.equal(d.$("pr-f-code").readOnly, true);
  assert.equal(d.$("pr-f-srp_centavos").value, "450");
  assert.equal(d.$("pr-f-earnings_rate").value, "40");
  await d.submit();
  assert.equal(d.writes().length, 0);
  assert.match(d.form().textContent, /no changes to save/i);
  d.set("srp_centavos", "500"); d.set("name", "Renamed");
  await d.submit();
  assert.equal(d.writes().length, 1);
  assert.equal(d.writes()[0].method, "PATCH");
  assert.equal(d.writes()[0].path, `/sites/${SITE}/catalog/products/prod_1/`);
  assert.deepEqual(d.writes()[0].body, { revision: 1, name: "Renamed", srp_centavos: 50000 });
});

test("edit: hiding a product sends is_active false", async () => {
  const d = boot();
  await d.show();
  d.all("pr-edit")[0].fire("click");
  d.$("pr-f-is_active").checked = false;
  await d.submit();
  assert.deepEqual(d.writes()[0].body, { revision: 1, is_active: false });
});

test("stale revision: its own sentence and a Reload that brings the fresh values", async () => {
  let first = true;
  const d = boot({ routes: (m) => { if (m === "PATCH" && first) { first = false; return { status: 409, body: { error: { code: "stale_revision", message: "server" } } }; } return null; } });
  await d.show();
  d.all("pr-edit")[0].fire("click");
  d.state.products[0].name = "Changed elsewhere"; d.state.products[0].revision = 4;
  d.set("srp_centavos", "999");
  await d.submit();
  assert.match(d.form().textContent, /This product was changed since you loaded it\./);
  const reload = d.buttons("Reload");
  assert.equal(reload.length, 1);
  reload[0].fire("click"); await settle();
  assert.equal(d.$("pr-f-name").value, "Changed elsewhere");
  d.set("srp_centavos", "999");
  await d.submit();
  assert.equal(d.writes().filter((c) => c.method === "PATCH").pop().body.revision, 4);
});

test("read-only and billing refusals use their own sentences", async () => {
  for (const [code, re] of [["catalog_read_only", /Only the catalog owner site/], ["billing_only", /Billing/]]) {
    const d = boot({ routes: (m) => m === "PATCH" ? { status: 403, body: { error: { code, message: "server" } } } : null });
    await d.show();
    d.all("pr-edit")[0].fire("click");
    d.set("name", "x");
    await d.submit();
    assert.match(d.form().textContent, re);
  }
});

test("image: upload sends file and revision as multipart, replace and remove follow the new revision; the 2 MB and type limits are checked first", async () => {
  const d = boot();
  await d.show();
  d.all("pr-edit")[0].fire("click");
  const file = d.$("pr-f-image");
  file.files = [{ type: "application/pdf", size: 10 }];
  file.fire("change");
  assert.match(d.$("pr-e-image").textContent, /JPEG, PNG or WebP/);
  file.files = [{ type: "image/png", size: 3 * 1024 * 1024 }];
  file.fire("change");
  assert.match(d.$("pr-e-image").textContent, /2 MB/);
  assert.equal(d.writes().length, 0);
  const png = { type: "image/png", size: 1000, name: "a.png" };
  d.$("pr-f-image").files = [png];
  d.$("pr-f-image").fire("change"); await settle();
  const up = d.writes()[0];
  assert.equal(up.method, "POST");
  assert.equal(up.path, `/sites/${SITE}/catalog/products/prod_1/image/`);
  assert.equal(up.form.get("revision"), "1");
  assert.equal(up.form.get("file"), png);
  assert.equal(d.all("pr-image-row")[0].all((n) => n.tagName === "IMG").length, 1);
  d.buttons("Remove image")[0].fire("click"); await settle();
  const del = d.writes()[1];
  assert.equal(del.method, "DELETE");
  assert.equal(del.path, `/sites/${SITE}/catalog/products/prod_1/image/?revision=2`);
  assert.equal(d.buttons("Upload image").length, 1);
});

test("image store failures show their own sentences", async () => {
  for (const [status, code, re] of [[503, "image_store_not_configured", /image store is not set up/], [502, "image_not_saved", /could not be stored/]]) {
    const d = boot({ routes: (m, p) => m === "POST" && /image/.test(p) ? { status, body: { error: { code, message: "server" } } } : null });
    await d.show();
    d.all("pr-edit")[0].fire("click");
    d.$("pr-f-image").files = [{ type: "image/jpeg", size: 100 }];
    d.$("pr-f-image").fire("change"); await settle();
    assert.match(d.$("pr-e-image").textContent, re);
  }
});

test("history: newest first, each revision against the one before, Seed or Owner, and no writer", async () => {
  const d = boot();
  const base = product("1");
  d.state.revisions.prod_1 = [
    { ...base, revision: 2, srp_centavos: 50000, source: "owner", changed_at: "2026-11-14T02:00:00Z" },
    { ...base, revision: 1, source: "seed", changed_at: "2026-11-13T02:00:00Z" }];
  await d.show();
  d.all("pr-hist")[0].fire("click"); await settle();
  assert.equal(d.calls.pop().path, `/sites/${SITE}/catalog/products/prod_1/revisions/`);
  const items = d.all("pr-histitem");
  assert.equal(items.length, 2);
  assert.match(items[0].textContent, /Owner/);
  assert.match(items[0].textContent, /Price \(SRP\) ₱450\.00 to ₱500\.00/);
  assert.match(items[1].textContent, /Seed/);
  assert.match(items[1].textContent, /Product added/);
  assert.ok(!/account|@|operator/i.test(d.$("pr-root").textContent));
});

test("several Santé stores: a chooser, and a change loads that store's list", async () => {
  const d = boot({ sites: [{ id: SITE, template: "sante", display_name: "One" }, { id: SITE2, template: "sante", display_name: "Two" }] });
  await d.show();
  const sel = d.$("pr-site");
  sel.value = SITE2; sel.fire("change"); await settle();
  assert.equal(d.calls.pop().path, `/sites/${SITE2}/catalog/products/`);
  assert.ok(d.$("pr-site"), "the chooser stays");
});

test("source rules: API strings never reach innerHTML, no storage key, focus is light blue and never gold", () => {
  assert.ok(!/innerHTML|insertAdjacentHTML|document\.write|localStorage|sessionStorage|eval\(/.test(SRC));
  assert.ok(/:focus-visible/.test(CSS));
  assert.ok(!/#f2d99b|#c59a3b|#e8c16a|var\(--gold\)|var\(--cat\)|var\(--c-cat\)/i.test(CSS));
  for (const m of CSS.matchAll(/:focus-visible[^{]*\{([^}]*)\}/g)) assert.match(m[1], /var\(--link\)/);
});
