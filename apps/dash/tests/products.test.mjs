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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const settle = async () => { for (let i = 0; i < 8; i++) await tick(); };

const product = (n, over = {}) => ({ id: "prod_" + n, code: "SPH" + n, name: "Product " + n, short_description: "", long_description: "", category: "barley",
  image_url: null, weight_kg: "0.18", srp_centavos: 45000, earnings_rate: "0.4000", volume_slot: null, shipping_qty: null,
  length_cm: null, width_cm: null, height_cm: null, is_active: true, revision: 1, unit_members_price_centavos: 27000, updated_at: "2026-11-13T00:00:00Z", ...over });

class FakeForm { constructor() { this.parts = []; } append(k, v) { this.parts.push([k, v]); } get(k) { const p = this.parts.find((x) => x[0] === k); return p ? p[1] : null; } }

function boot({ products = [product("1"), product("2", { is_active: false, image_url: "https://media.test/p2.jpg" })], canEdit = true, routes, sites, cropper } = {}) {
  const doc = makeDocument(), calls = [], toasts = [], stored = [];
  /* The stand-in nodes have no dispatchEvent; the dropdown announces its change that way, so give them one. */
  const make = doc.createElement;
  doc.createElement = (tag) => { const n = make(tag); n.dispatchEvent = (e) => n.fire(e.type); return n; };
  const page = doc.body.appendChild(doc.createElement("div"));
  for (const id of ["pr-root", "pr-live"]) { const n = doc.createElement("div"); n.setAttribute("id", id); page.appendChild(n); }
  const state = { products: products.map((p) => ({ ...p })), canEdit, revisions: {} };
  const siteList = sites || [{ id: SITE, template: "sante", display_name: "Nena's Shop" }];
  const fallback = (method, p, body) => {
    if (method === "GET" && p === "/sites/") return { status: 200, body: { items: siteList, next_cursor: null } };
    if (method === "POST" && /^\/sites\/site_[0-9a-z]{20}\/catalog\/shipping-preview\/$/.test(p)) return { status: 200, body: state.preview || { ncr_centavos: 12000, mindanao_centavos: 18000, billable_kg: "0.50", reason: "" } };
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
    if (m[3] === "image/") {
      const slot = Number((/slot=(\d)/.exec(m[4] || "") || [0, 1])[1]);
      if (!cur.image_urls) cur.image_urls = [cur.image_url || null, null, null, null, null];
      cur.image_urls[slot - 1] = method === "POST" ? "https://media.test/new" + slot + ".png" : null;
      cur.image_url = cur.image_urls[0]; cur.revision += 1; return { status: 200, body: cur };
    }
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
  const window = { NO_CONFIG: { apiBase: "http://api.test/v1", siteUrl: "http://www.test" }, addEventListener() {}, removeEventListener() {}, innerHeight: 800 };
  const location = { search: "", pathname: "/products/", replace() {}, assign() {} };
  /* cropper: { sizes: [png bytes, jpeg bytes] } puts a stand-in Cropper.js and object URLs on the page. */
  const made = [], revoked = [];
  if (cropper) {
    window.URL = { createObjectURL: (b) => { made.push(b); return "blob:test/" + made.length; }, revokeObjectURL: (u) => revoked.push(u) };
    window.Cropper = class { constructor(img, opts) { this.opts = opts; window.cropperOpts = opts; } destroy() { window.cropperDestroyed = true; }
      getCroppedCanvas(o) { window.cropOut = o; return { toBlob: (cb, type) => cb(cropper.sizes[type === "image/png" ? 0 : 1] == null ? null : { type, size: cropper.sizes[type === "image/png" ? 0 : 1] }) }; } };
  }
  const context = vm.createContext({ window, document: doc, Event: class { constructor(type) { this.type = type; } }, ...(cropper ? { URL: window.URL } : {}), location, history: { replaceState() {} }, console, URLSearchParams, Promise, setTimeout, clearTimeout, Intl, Date,
    FormData: FakeForm, localStorage: storage("local"), sessionStorage: storage("session"), requestAnimationFrame() {}, fetch });
  for (const f of ["app.js", "products.js"]) vm.runInContext(read(f), context, { filename: f });
  window.NODash.toast = (title, sub) => toasts.push(title + (sub ? ": " + sub : ""));
  const $ = (id) => doc.getElementById(id);
  const all = (cls, root = $("pr-root")) => root.all((n) => n.classList.contains(cls));
  /* The icon glyph before "Add product" and "Arrange" is not part of the name a test asks for. */
  const buttons = (text, root = $("pr-root")) => root.all((n) => n.tagName === "BUTTON" && n.textContent.replace(/^[＋⇅]\s/, "") === text);
  const form = () => $("pr-root").all((n) => n.tagName === "FORM")[0];
  return { doc, window, calls, toasts, stored, state, made, revoked, $, all, buttons, form, P: window.NOProducts,
    writes: () => calls.filter((c) => c.method !== "GET" && !/shipping-preview/.test(c.path)),
    async show() { window.NOProducts.show(); await settle(); },
    manage(i, cls) { all("pr-manage")[i].fire("click"); all(cls)[0].fire("click"); },
    async pick(i, cls) { this.manage(i, cls); await settle(); },
    rows: () => all("pr-row"),
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
  assert.deepEqual(Array.from(changes(b, a)), ["Name changed", "Photo 1 changed", "Price (SRP) ₱450.00 to ₱500.00", "Hidden from shops"]);
  assert.deepEqual(Array.from(changes(a, a)), ["Saved with no changes"]);
});

const FULL = { image_url: "https://media.test/x.jpg", short_description: "s", long_description: "l", weight_kg: "0.18", shipping_qty: 2, length_cm: "1", width_cm: "1", height_cm: "1" };
const names = (d) => d.rows().map((r) => r.all((n) => n.classList.contains("pr-name"))[0].textContent);

test("owner list: a table row for each product with thumbnail or code placeholder, SRP, members price, Live or Hidden; no card, no focusable cell", async () => {
  const d = boot();
  await d.show();
  assert.deepEqual(d.calls.map((c) => c.method + " " + c.path), ["GET /sites/", `GET /sites/${SITE}/catalog/products/`]);
  assert.equal(d.all("pr-card").length, 0, "the card grid is gone");
  assert.equal(d.$("pr-root").all((n) => n.tagName === "TABLE").length, 1);
  const rows = d.rows();
  assert.equal(rows.length, 2);
  assert.equal(d.buttons("Add product").length, 1);
  assert.equal(d.buttons("Export CSV").length, 1);
  assert.equal(d.buttons("Arrange").length, 1);
  assert.equal(d.buttons("Search").length, 0, "no Search button: the table filters as you type");
  assert.equal(d.all("pr-qs").length, 1, "the quick-links style search box");
  assert.equal(d.all("pr-qs")[0].all((n) => n.tagName === "SVG").length, 1, "the magnifier sits inside the box");
  assert.deepEqual(d.$("pr-root").all((n) => n.tagName === "TH").map((th) => th.textContent), ["Product", "Price", "Storefront", "Action"]);
  assert.equal(d.all("pr-hero").length, 0, "no masthead");
  assert.equal(d.all("pr-tile").length + d.all("pr-stat").length + d.all("pr-strip").length, 0, "no stat tiles, no status strip");
  const tb = d.all("pr-toolbar")[0];
  assert.equal(tb.parentNode.children[0], tb, "the page opens on the toolbar");
  assert.equal(d.all("pr-cat").length, 0, "no category chip");
  const lines = rows[0].all((n) => n.classList.contains("pr-prod-text"))[0].children;
  assert.deepEqual(Array.from(lines).map((n) => n.textContent), ["Product 1", "SPH1 (Barley)"], "two lines: name, then CODE (Category)");
  assert.equal(d.all("pr-manage").length, 2);
  assert.match(rows[0].textContent, /SPH1/);
  assert.match(rows[0].textContent, /₱450\.00/);
  assert.match(rows[0].textContent, /₱270\.00/);
  assert.match(rows[0].textContent, /SPH/, "placeholder is the first three letters of the code");
  assert.match(rows[0].textContent, /Live/);
  assert.match(rows[1].textContent, /Hidden/);
  assert.equal(rows[1].all((n) => n.tagName === "IMG").length, 1);
  for (const r of rows) for (const n of [r, ...r.all()]) assert.equal(n.getAttribute("tabindex"), null, "nothing in a row has a tabindex");
  assert.equal(d.$("pr-root").all((n) => n.tagName === "H2").length, 0, "no card titles");
  assert.deepEqual(d.stored, [], "no storage key");
});

test("owner status dropdown carries every filter the old tiles gave; incomplete rows flag their gaps", async () => {
  const d = boot({ products: [product("1", FULL), product("2", { ...FULL, is_active: false }), product("3", { category: "" })] });
  await d.show();
  assert.deepEqual(Array.from(d.$("pr-status").children).map((o) => o.textContent), ["All status", "Live", "Hidden", "Incomplete"]);
  const sel = d.$("pr-status");
  sel.value = "incomplete"; sel.fire("change");
  assert.deepEqual(names(d), ["Product 3"]);
  sel.value = "hidden"; sel.fire("change");
  assert.deepEqual(names(d), ["Product 2"]);
  sel.value = "all"; sel.fire("change");
  assert.match(d.rows()[2].textContent, /Incomplete/);
  assert.match(d.rows()[2].textContent, /Missing: Photo, Category, Description, Packed size, Shipping details/);
  assert.ok(!/Incomplete/.test(d.rows()[0].textContent));
  assert.equal(d.rows()[2].all((n) => n.classList.contains("pr-code"))[0].textContent, "SPH3", "no category shows just the code");
});

test("status filter, search matches name or code, category narrows, paging at 20, clear filters", async () => {
  const many = [];
  for (let i = 1; i <= 25; i++) many.push(product(String(i), { ...FULL, name: i === 3 ? "Barley Mix" : "Item " + i, category: i === 3 ? "drinks" : "barley", is_active: i % 5 !== 0 }));
  const d = boot({ products: many });
  await d.show();
  assert.equal(d.rows().length, 20);
  assert.match(d.$("pr-root").textContent, /Page 1 of 2/);
  d.all("pr-next")[0].fire("click");
  assert.equal(d.rows().length, 5);
  const stSel = d.$("pr-status");
  stSel.value = "hidden"; stSel.fire("change");
  assert.equal(d.rows().length, 5, "five hidden, back on page 1");
  stSel.value = "all"; stSel.fire("change");
  const q = d.$("pr-search");
  q.value = "BARLEY"; q.fire("input");
  assert.equal(d.rows().length, 20, "not yet: the table waits for a pause in typing");
  await wait(320);
  assert.deepEqual(names(d), ["Barley Mix"]);
  q.value = "sph7"; q.fire("input"); await wait(320);
  assert.deepEqual(names(d), ["Item 7"], "by code");
  q.value = "Item 1"; q.fire("input"); q.value = "zzz"; q.fire("input"); await wait(320);
  assert.equal(d.rows().length, 0, "only the last keystrokes count");
  q.value = "Item 4"; q.fire("input"); q.fire("keydown", { key: "Enter" });
  assert.deepEqual(names(d), ["Item 4"], "Enter filters at once");
  q.value = "zzz"; q.fire("input"); await wait(320);
  assert.match(d.$("pr-root").textContent, /No products match/);
  d.all("pr-clear")[0].fire("click");
  assert.equal(d.rows().length, 20);
  const c = d.$("pr-category"); c.value = "drinks"; c.fire("change");
  assert.deepEqual(names(d), ["Barley Mix"]);
  assert.deepEqual(d.calls.filter((x) => x.method === "GET").length, 2, "filtering never calls the server");
});

test("pure helpers: gaps, filters", () => {
  const u = boot().P.util;
  assert.deepEqual(Array.from(u.gaps(product("1", FULL))), []);
  assert.deepEqual(Array.from(u.gaps(product("1", { ...FULL, image_url: "", category: "", short_description: "", width_cm: null, shipping_qty: null }))),
    ["Photo", "Category", "Description", "Packed size", "Shipping details"]);
  assert.deepEqual(Array.from(u.gaps(product("1", { ...FULL, volume_slot: null }))), [], "a missing volume slot is not a gap: the API derives it");
  assert.deepEqual(Array.from(u.gaps(product("1", { ...FULL, weight_kg: null }))), ["Shipping details"]);
  const ps = [product("1", FULL), product("2", { is_active: false })];
  assert.equal(u.filterProducts(ps, { status: "incomplete" }, false).length, 0);
  assert.equal(u.filterProducts(ps, { status: "incomplete" }, true).length, 1);
});

test("CSV: formula-looking cells get an apostrophe, quotes and commas are escaped, the rate is never in it", () => {
  const u = boot().P.util;
  for (const c of ["=1+1", "+5", "-2", "@SUM(A1)"]) assert.equal(u.csvCell(c), "'" + c);
  assert.equal(u.csvCell('He said "hi", ok'), '"He said ""hi"", ok"');
  assert.equal(u.csvCell("=a,b"), "\"'=a,b\"");
  const rows = [product("1", { ...FULL, name: "=HYPERLINK(1)", srp_centavos: 45050 }), product("2", { is_active: false })];
  const owner = u.csvText(rows, true).split("\r\n");
  assert.equal(owner[0], "Code,Name,Category,SRP,Members price,Storefront,Incomplete,Missing");
  assert.equal(owner[1], "SPH1,'=HYPERLINK(1),Barley,450.50,270.00,Live,No,");
  assert.match(owner[2], /^SPH2,Product 2,Barley,450\.00,270\.00,Hidden,Yes,Photo; /);
  const member = u.csvText(rows, false).split("\r\n");
  assert.equal(member[0], "Code,Name,Category,SRP,Members price,Storefront");
  assert.ok(!/0\.4000|Incomplete|Missing/.test(u.csvText(rows, false)));
});

test("Manage menu: edit, history, reviews, hide and show; hide sends the loaded revision", async () => {
  const d = boot();
  await d.show();
  assert.equal(d.all("pr-menu").length, 0);
  d.all("pr-manage")[0].fire("click");
  assert.equal(d.all("pr-menu").length, 1);
  assert.deepEqual(d.all("pr-menu-item").map((b) => b.textContent), ["Edit details", "History", "Reviews", "Hide from shops"]);
  d.all("pr-toggle")[0].fire("click"); await settle();
  const w = d.writes();
  assert.equal(w.length, 1);
  assert.equal(w[0].method, "PATCH");
  assert.deepEqual(w[0].body, { revision: 1, is_active: false });
  assert.match(d.rows()[0].textContent, /Hidden/);
  assert.ok(d.toasts.some((t) => /Hidden from shops/.test(t)));
  d.all("pr-manage")[0].fire("click");
  assert.equal(d.all("pr-toggle")[0].textContent, "Show in shops");
  d.all("pr-manage")[0].fire("click");
  assert.equal(d.all("pr-menu").length, 0, "Manage again closes the menu");
});

test("a store that cannot edit sees the same table read-only, with no owner controls", async () => {
  const d = boot({ canEdit: false });
  await d.show();
  assert.equal(d.rows().length, 2);
  assert.equal(d.buttons("Add product").length, 0);
  assert.equal(d.buttons("Arrange").length, 0);
  assert.equal(d.buttons("Export CSV").length, 1);
  assert.equal(d.all("pr-manage").length, 0);
  assert.equal(d.all("pr-edit").length + d.all("pr-hist").length, 0);
  assert.deepEqual(d.$("pr-root").all((n) => n.tagName === "TH").map((th) => th.textContent), ["Product", "Price", "Storefront"]);
  assert.deepEqual(Array.from(d.$("pr-status").children).map((o) => o.value), ["all", "live"]);
  assert.ok(!/Incomplete|Missing|Needs a fix/.test(d.$("pr-root").textContent));
  assert.equal(d.all("pr-note").length, 1);
  assert.match(d.all("pr-note")[0].textContent, /managed centrally/);
});

test("empty states, and an account with no Santé store", async () => {
  const owner = boot({ products: [] });
  await owner.show();
  assert.match(owner.$("pr-root").textContent, /No products yet — add your first product to get started\./);
  assert.equal(owner.all("pr-empty-state").length, 1, "the empty message sits in the table, under its header");
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
  assert.equal(d.$("pr-f-earnings_rate").value, "", "Add starts with an empty discount; 40 is only the placeholder");
  d.set("earnings_rate", "40");
  assert.equal(d.$("pr-c-mem").textContent, "₱840.00", "the live members price");
  assert.equal(d.$("pr-c-srp").textContent, "₱1,400.00");
  assert.equal(d.$("pr-c-disc").textContent, "−₱560.00");
  d.set("earnings_rate", "20");
  assert.equal(d.$("pr-c-mem").textContent, "₱1,120.00");
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
  assert.equal(d.all("pr-formtitle")[0].textContent, "Edit product", "Add became Edit");
  assert.ok(d.toasts.some((t) => /Saved/.test(t)));
});

test("add with Show in shops off: created, then a second write hides it", async () => {
  const d = boot({ products: [] });
  await d.show();
  d.buttons("Add product")[0].fire("click");
  d.set("code", "X1"); d.set("name", "Hidden one"); d.set("srp_centavos", "100"); d.set("earnings_rate", "40");
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
  d.set("code", "DUP"); d.set("name", "n"); d.set("srp_centavos", "10"); d.set("earnings_rate", "40");
  await d.submit();
  assert.equal(d.error("code"), "That product code is already in the catalog.");
  assert.equal(d.$("pr-f-code").getAttribute("aria-invalid"), "true");
});

test("edit: only the changed fields go, with the loaded revision; the code is read-only; an unchanged form sends nothing", async () => {
  const d = boot();
  await d.show();
  d.manage(0, "pr-edit");
  assert.equal(d.$("pr-f-code").readOnly, true);
  assert.equal(d.$("pr-f-srp_centavos").value, "450");
  assert.equal(d.$("pr-f-earnings_rate").value, "40");
  await d.submit();
  assert.equal(d.writes().length, 0);
  assert.match(d.all("pr-topmsg")[0].textContent, /no changes to save/i);
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
  d.manage(0, "pr-edit");
  d.$("pr-f-is_active").checked = false;
  await d.submit();
  assert.deepEqual(d.writes()[0].body, { revision: 1, is_active: false });
});

test("stale revision: its own sentence and a Reload that brings the fresh values", async () => {
  let first = true;
  const d = boot({ routes: (m) => { if (m === "PATCH" && first) { first = false; return { status: 409, body: { error: { code: "stale_revision", message: "server" } } }; } return null; } });
  await d.show();
  d.manage(0, "pr-edit");
  d.state.products[0].name = "Changed elsewhere"; d.state.products[0].revision = 4;
  d.set("srp_centavos", "999");
  await d.submit();
  assert.match(d.all("pr-topmsg")[0].textContent, /This product was changed since you loaded it\./);
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
    d.manage(0, "pr-edit");
    d.set("name", "x");
    await d.submit();
    assert.match(d.all("pr-topmsg")[0].textContent, re);
  }
});

test("image store failures show their own sentences", async () => {
  for (const [status, code, re] of [[503, "image_store_not_configured", /image store is not set up/], [502, "image_not_saved", /could not be stored/]]) {
    const d = boot({ routes: (m, p) => m === "POST" && /image/.test(p) ? { status, body: { error: { code, message: "server" } } } : null });
    await d.show();
    d.manage(0, "pr-edit");
    pickSlot(d, 1, { type: "image/jpeg", size: 100 }); await settle();
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
  d.manage(0, "pr-hist"); await settle();
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

test("hiding and showing a product keeps the row and flips its badge", async () => {
  const d = boot({ products: [product("1", FULL)] });
  await d.show();
  assert.match(d.rows()[0].textContent, /Live/);
  d.manage(0, "pr-toggle"); await settle();
  assert.match(d.rows()[0].textContent, /Hidden/);
  d.manage(0, "pr-toggle"); await settle();
  assert.match(d.rows()[0].textContent, /Live/);
});

test("pure helper: moveId moves one id a place and stops at the ends", () => {
  const { moveId } = boot().P.util;
  assert.deepEqual(Array.from(moveId(["a", "b", "c"], "b", -1)), ["b", "a", "c"]);
  assert.deepEqual(Array.from(moveId(["a", "b", "c"], "b", 1)), ["a", "c", "b"]);
  assert.deepEqual(Array.from(moveId(["a", "b", "c"], "a", -1)), ["a", "b", "c"]);
  assert.deepEqual(Array.from(moveId(["a", "b", "c"], "c", 1)), ["a", "b", "c"]);
  assert.deepEqual(Array.from(moveId(["a", "b", "c"], "zz", 1)), ["a", "b", "c"]);
});

const orderRoute = (answer) => (method, p, body, state) => {
  if (method === "POST" && /\/catalog\/products\/order\/$/.test(p)) return answer ? answer(body, state) : (() => {
    state.products = body.product_ids.map((id) => state.products.find((x) => x.id === id));
    return { status: 200, body: { can_edit: true, products: state.products } };
  })();
  return null;
};
const arrangeNames = (d) => d.all("pr-ar-row").map((r) => r.all((n) => n.classList.contains("pr-ar-name"))[0].textContent);
const press = (d, i, key) => d.all("pr-ar-grip")[i].fire("keydown", { key });

test("Arrange (owner): every product, hidden too, arrow keys move a row and each move saves the whole order", async () => {
  const d = boot({ products: [product("1"), product("2", { is_active: false }), product("3")], routes: orderRoute() });
  await d.show();
  d.buttons("Arrange")[0].fire("click");
  assert.equal(d.all("pr-ar-row").length, 3, "hidden products are in the list");
  assert.deepEqual(arrangeNames(d), ["Product 1", "Product 2", "Product 3"]);
  assert.equal(d.all("pr-row").length, 0, "the table is replaced");
  assert.match(d.all("pr-ar-row")[1].textContent, /Hidden/);
  assert.match(d.all("pr-ar-row")[0].textContent, /₱450\.00/);
  press(d, 2, "ArrowUp"); await settle();
  assert.deepEqual(arrangeNames(d), ["Product 1", "Product 3", "Product 2"]);
  const w = d.writes();
  assert.equal(w.length, 1);
  assert.equal(w[0].method, "POST");
  assert.equal(w[0].path, `/sites/${SITE}/catalog/products/order/`);
  assert.deepEqual(w[0].body, { product_ids: ["prod_1", "prod_3", "prod_2"] });
  assert.match(d.all("pr-ar-status-text")[0].textContent, /Saved/);
  assert.equal(d.doc.activeElement, d.all("pr-ar-grip")[1], "focus stays on the moved row's handle");
  press(d, 0, "ArrowUp"); await settle();
  assert.equal(d.writes().length, 1, "the first row cannot move up: nothing is sent");
  press(d, 0, "Enter"); await settle();
  assert.equal(d.writes().length, 1);
  assert.deepEqual(d.all("pr-ar-pos").map((n) => n.textContent), ["1.", "2.", "3."]);
  d.all("pr-ar-back")[0].fire("click"); await settle();
  assert.deepEqual(names(d), ["Product 1", "Product 3", "Product 2"], "back to the list in the saved order");
  assert.deepEqual(d.stored, [], "no storage key");
});

test("Arrange: a refused save keeps the order on screen, says it is unsaved and offers a reload", async () => {
  const d = boot({ routes: orderRoute(() => ({ status: 400, body: { code: "invalid_request", message: "x", fields: { product_ids: ["Send every product once."] } } })) });
  await d.show();
  d.buttons("Arrange")[0].fire("click");
  press(d, 0, "ArrowDown"); await settle();
  assert.deepEqual(arrangeNames(d), ["Product 2", "Product 1"], "nothing is rolled back");
  assert.match(d.all("pr-ar-status-text")[0].textContent, /^Not saved\. The product list changed/);
  assert.equal(d.all("pr-ar-reload")[0].hidden, false);
  assert.ok(d.toasts.some((t) => /Order not saved/.test(t)));
  const ro = boot({ routes: orderRoute(() => ({ status: 403, body: { code: "catalog_read_only", message: "no" } })) });
  await ro.show();
  ro.buttons("Arrange")[0].fire("click");
  press(ro, 0, "ArrowDown"); await settle();
  assert.match(ro.all("pr-ar-status-text")[0].textContent, /Only the catalog owner site can change the shared catalog/);
});

test("Arrange: changes made while a save is running are sent after it, the last order winning", async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const d = boot({ products: [product("1"), product("2"), product("3")], routes: (m, p, body, state) => {
    if (m === "POST" && /order\/$/.test(p)) {
      state.products = body.product_ids.map((id) => state.products.find((x) => x.id === id));
      const out = { status: 200, body: { can_edit: true, products: state.products } };
      return state.sent++ === 0 ? gate.then(() => out) : out;
    }
    return null;
  } });
  d.state.sent = 0;
  await d.show();
  d.buttons("Arrange")[0].fire("click");
  press(d, 0, "ArrowDown"); await settle();
  press(d, 1, "ArrowDown"); await settle();
  assert.equal(d.writes().length, 1, "one request at a time");
  release(); await settle();
  const w = d.writes();
  assert.equal(w.length, 2);
  assert.deepEqual(w[1].body.product_ids, ["prod_2", "prod_3", "prod_1"]);
});

test("Arrange is the owner's only, and the Manage menu has separators and no stock actions", async () => {
  const ro = boot({ canEdit: false });
  await ro.show();
  assert.equal(ro.buttons("Arrange").length, 0);
  assert.equal(ro.all("pr-ar").length, 0);
  const d = boot();
  await d.show();
  d.all("pr-manage")[0].fire("click");
  assert.equal(d.all("pr-menu-sep").length, 3);
  assert.equal(d.all("pr-menu")[0].getAttribute("role"), "menu");
  assert.ok(!/Restock|Adjust|Threshold|Remove|Toggle availability/.test(d.$("pr-root").textContent), "no stock actions: there is no stock");
  assert.ok(!/Stock|Cover|Health|Units on hand|Inventory value|Low stock/.test(d.$("pr-root").textContent), "no stock columns or tiles");
});

/* ---- round 2: the house dropdown, and the Add screen after the TWCinc add-product page ---- */

const optionTexts = (sel) => Array.from(sel.children).map((o) => o.textContent);
const comboOf = (d, id) => { const sel = d.$(id); return sel.parentNode; };
const pickRow = (d, id, text) => { const wrap = comboOf(d, id); wrap.all((n) => n.classList.contains("pr-combo-box"))[0].fire("click"); wrap.all((n) => n.classList.contains("pr-combo-opt")).find((n) => n.textContent === text).fire("click"); };

test("dropdowns: the list filters and the Category field use the house dropdown, the native select stays under it with its id", async () => {
  const d = boot({ products: [product("1", { category: "barley" }), product("2", { category: "drinks", is_active: false })] });
  await d.show();
  assert.equal(d.all("pr-combo").length, 2, "status and category");
  for (const id of ["pr-status", "pr-category"]) {
    const sel = d.$(id), wrap = sel.parentNode;
    assert.ok(wrap.classList.contains("pr-combo"));
    assert.ok(sel.classList.contains("pr-combo-native"));
    assert.equal(sel.getAttribute("aria-hidden"), "true");
    assert.equal(sel.getAttribute("tabindex"), "-1");
    const input = wrap.all((n) => n.classList.contains("pr-combo-input"))[0];
    assert.equal(input.getAttribute("role"), "combobox");
    assert.equal(input.getAttribute("aria-expanded"), "false");
  }
  const input = (id) => comboOf(d, id).all((n) => n.classList.contains("pr-combo-input"))[0];
  assert.equal(input("pr-status").value, "All status");
  assert.equal(input("pr-category").value, "All categories");
  /* the panel lists every option, the first too, so a chosen filter can be un-picked */
  comboOf(d, "pr-status").all((n) => n.classList.contains("pr-combo-box"))[0].fire("click");
  assert.equal(comboOf(d, "pr-status").classList.contains("is-open"), true);
  assert.deepEqual(comboOf(d, "pr-status").all((n) => n.classList.contains("pr-combo-opt")).map((n) => n.textContent), ["All status", "Live", "Hidden", "Incomplete"]);
  pickRow(d, "pr-status", "Hidden");
  assert.equal(d.$("pr-status").value, "hidden");
  assert.equal(input("pr-status").value, "Hidden");
  assert.equal(comboOf(d, "pr-status").classList.contains("is-open"), false, "choosing closes it");
  assert.deepEqual(names(d), ["Product 2"]);
  pickRow(d, "pr-status", "All status");
  assert.equal(d.$("pr-status").value, "all");
  assert.equal(names(d).length, 2);
  pickRow(d, "pr-category", "Specialty Drinks");
  assert.deepEqual(names(d), ["Product 2"]);
  /* Clear filters redraws the box */
  pickRow(d, "pr-status", "Live");
  assert.equal(input("pr-status").value, "Live");
  d.$("pr-search").value = "zzz"; d.$("pr-search").fire("input");
  d.all("pr-clear")[0].fire("click");
  assert.equal(input("pr-status").value, "All status");
  assert.equal(input("pr-category").value, "All categories");
});

test("dropdowns: typing filters the options, arrows and Enter pick, Escape closes", async () => {
  const d = boot();
  await d.show();
  const wrap = comboOf(d, "pr-category"), input = wrap.all((n) => n.classList.contains("pr-combo-input"))[0];
  const opts = () => wrap.all((n) => n.classList.contains("pr-combo-opt")).map((n) => n.textContent);
  input.value = "bea"; input.fire("input");
  assert.deepEqual(opts(), ["Beauty"]);
  input.value = "zzz"; input.fire("input");
  assert.deepEqual(opts(), ["No matches"]);
  input.value = ""; input.fire("input");
  input.fire("keydown", { key: "ArrowDown" });
  input.fire("keydown", { key: "ArrowDown" });
  input.fire("keydown", { key: "Enter" });
  assert.equal(d.$("pr-category").value, "barley", "arrow down twice lands on the second row");
  input.fire("click");
  wrap.all((n) => n.classList.contains("pr-combo-box"))[0].fire("click");
  assert.equal(wrap.classList.contains("is-open"), true);
  const esc = input.fire("keydown", { key: "Escape", stopPropagation() {} });
  assert.equal(wrap.classList.contains("is-open"), false);
  assert.equal(esc.prevented, true);
});

test("dropdowns: the form Category is the house dropdown too, and No category can be picked again", async () => {
  const d = boot({ products: [product("1", { category: "barley" })] });
  await d.show();
  d.manage(0, "pr-edit");
  const sel = d.$("pr-f-category");
  assert.ok(sel.parentNode.classList.contains("pr-combo"));
  assert.equal(sel.getAttribute("aria-hidden"), "true");
  const input = sel.parentNode.all((n) => n.classList.contains("pr-combo-input"))[0];
  assert.equal(input.getAttribute("aria-describedby"), "pr-e-category");
  assert.equal(input.value, "Barley");
  /* opening with nothing picked lists every option and needs no deleting */
  pickRow(d, "pr-f-category", "No category");
  assert.equal(input.value, "");
  sel.parentNode.all((n) => n.classList.contains("pr-combo-box"))[0].fire("click");
  assert.deepEqual(sel.parentNode.all((n) => n.classList.contains("pr-combo-opt")).map((n) => n.textContent), ["No category", "Barley", "Specialty Drinks", "Essentials", "Beauty"]);
  pickRow(d, "pr-f-category", "Barley");
  assert.deepEqual(optionTexts(sel), ["No category", "Barley", "Specialty Drinks", "Essentials", "Beauty"]);
  pickRow(d, "pr-f-category", "No category");
  assert.equal(sel.value, "");
  assert.equal(input.value, "", "the box is empty, not typed with No category");
  assert.equal(input.getAttribute("placeholder"), "No category");
  await d.submit();
  assert.equal(d.writes()[0].body.category, "", "the cleared category is what is sent");
  assert.ok(!("name" in d.writes()[0].body), "edit still sends only what changed");
});

test("the Products page has no visible title above the list, and the cache-bust strings moved", () => {
  const html = fs.readFileSync(path.join(JS, "..", "..", "index.html"), "utf8");
  const sect = /<section class="view" id="view-products"[^>]*>\s*<header[^>]*>([^]*?)<\/header>/.exec(html)[1];
  assert.ok(!/dash-eyebrow/.test(sect), "no eyebrow");
  assert.match(sect, /<h1 id="h-products" class="pr-sr"/, "the heading stays for screen readers, hidden from sight");
  assert.match(CSS, /\.pr-sr \{ position: absolute/);
  assert.equal((html.match(/dash-eyebrow">Orders</g) || []).length >= 1, true, "the other pages keep theirs");
  assert.match(html, /products\.css\?v=20261114prod11/);
  assert.match(html, /products\.js\?v=20261114prod12/);
});

const openAdd = async (opts) => { const d = boot({ products: [], ...(opts || {}) }); await d.show(); d.buttons("Add product")[0].fire("click"); return d; };
const fill = (d, over = {}) => { d.set("code", "x1"); d.set("name", "Mug"); d.set("srp_centavos", "100"); d.set("earnings_rate", "40"); for (const k of Object.keys(over)) d.set(k, over[k]); };
const pickSlot = (d, n, f) => { d.$("pr-f-image-" + n).files = [f]; d.$("pr-f-image-" + n).fire("change"); };
const slot = (d, n) => d.all("pr-islot")[n - 1];
const topmsg = (d) => d.all("pr-topmsg")[0].textContent;
const tabs = (d) => d.all("pr-tab");

test("editor (Add): back link, tab bar, Description and Media Library off, four cards, a save bar; no TWC-only wording, no stock", async () => {
  const d = await openAdd();
  assert.equal(d.buttons("Back to products").length, 0, "the back control is a link, not a button");
  const back = d.all("pr-backlink")[0];
  assert.equal(back.tagName, "A");
  assert.equal(back.textContent, "Back to products");
  assert.equal(back.all((n) => n.tagName === "SVG").length, 1, "an arrow icon");
  assert.equal(d.all("pr-formtitle")[0].getAttribute("tabindex"), "-1");
  assert.ok(d.all("pr-formtitle")[0].classList.contains("pr-sr"), "no visible title");
  assert.equal(d.all("pr-addsub").length, 0, "no name and code line");
  assert.equal(d.all("pr-tabs")[0].getAttribute("role"), "tablist");
  assert.ok(d.all("pr-tabs")[0].classList.contains("set-tabs"), "the Settings menu style");
  assert.deepEqual(tabs(d).map((t) => t.textContent), ["Details", "Description", "Media Library Coming soon"]);
  assert.equal(tabs(d)[1].getAttribute("aria-disabled"), "true", "Description is off on Add");
  assert.equal(tabs(d)[1].disabled, true);
  assert.equal(tabs(d)[1].listeners.click, undefined, "the Description tab does nothing on Add");
  assert.equal(tabs(d)[0].getAttribute("aria-selected"), "true");
  const media = tabs(d)[2];
  assert.equal(media.getAttribute("aria-disabled"), "true");
  assert.equal(media.disabled, true);
  assert.equal(media.listeners.click, undefined, "the Media Library tab does nothing");
  const cards = d.all("pr-card").filter((c) => c.attrs.id && c.attrs.id.indexOf("pr-s-") === 0);
  assert.deepEqual(cards.map((c) => c.all((n) => n.tagName === "H3")[0].textContent), ["Identity", "Photos", "Pricing", "Shipping"]);
  assert.ok(!/Promo packs/.test(d.$("pr-root").textContent), "no Promo packs card");
  for (const c of cards) {
    assert.equal(c.all((n) => n.tagName === "H3")[0].getAttribute("tabindex"), null, "card titles are not focusable");
    assert.equal(c.all((n) => n.tagName === "SVG").length, 1, "an icon");
    assert.equal(c.all((n) => n.classList.contains("pr-card-hint")).length, 1, "a hint");
  }
  const inCard = (n, f) => cards[n].all((x) => x.attrs.id === f).length === 1;
  assert.ok(inCard(0, "pr-f-code") && inCard(0, "pr-f-name") && inCard(0, "pr-f-category") && inCard(0, "pr-f-is_active"));
  assert.equal(slot(d, 1).all((n) => n.classList.contains("pr-main"))[0].textContent, "MAIN");
  assert.equal(d.all("pr-islot").length, 5, "five photo slots");
  assert.equal(d.all("pr-main").length, 1, "only slot 1 is MAIN");
  assert.ok(inCard(2, "pr-f-srp_centavos") && inCard(2, "pr-f-earnings_rate") && inCard(2, "pr-c-mem"), "SRP, Members discount and the live Members price");
  for (const k of ["length_cm", "width_cm", "height_cm", "weight_kg", "shipping_qty"]) assert.ok(inCard(3, "pr-f-" + k), k);
  assert.match(cards[3].all((n) => n.classList.contains("pr-pv"))[0].textContent, /Packaging & fee/);
  const bar = d.all("pr-abar")[0];
  assert.equal(bar.all((n) => n.classList.contains("pr-abar-note"))[0].textContent, "Changes are saved and applied immediately.");
  assert.deepEqual(bar.all((n) => n.tagName === "BUTTON").map((b) => b.textContent), ["Save Details"]);
  assert.equal(bar.all((n) => n.tagName === "BUTTON")[0].getAttribute("type"), "submit");
  const text = d.$("pr-root").textContent;
  assert.ok(!/TWC|Merchant|commission|platform fee|payment fee|you receive|Opening stock|Units on hand|Save draft|Submit for review/i.test(text), "no TWC-only wording, no commission lines, no stock");
  assert.equal(d.$("pr-panel-description"), null, "no Description panel before the product exists");
  assert.ok(!/Save the Details tab first/.test(text));
  assert.ok(!/position: sticky/.test(CSS.slice(CSS.indexOf(".pr-abar {"), CSS.indexOf(".pr-abar {") + 400)), "the save bar is not sticky");
  assert.ok(!/\.pr-abar \{[^}]*(sticky|fixed)/.test(CSS), "the save bar is in normal flow");
  assert.ok(!/pr-s-packs|pr-card-off|pr-soon-head|pr-card-note/.test(CSS + SRC), "nothing left of the Promo packs card");
});

test("Identity: label Product code (SKU), no help line, name | code then category | Show in shops; the cards use the full column", async () => {
  const d = await openAdd();
  const lab = d.$("pr-f-code").parentNode.all((n) => n.tagName === "LABEL")[0];
  assert.equal(lab.textContent, "Product code (SKU)");
  assert.ok(!/Letters, digits|upper-case|can.t be changed later/.test(d.$("pr-root").textContent), "the code help line is gone");
  assert.equal(d.$("pr-e-code").hidden, true);
  const grid = d.all("pr-identity")[0];
  const ids = (n) => n.attrs && n.attrs.id;
  const order = grid.children.map((c) => c.classList.contains("pr-check") ? "pr-f-is_active" : c.all((x) => /^pr-f-/.test(ids(x) || ""))[0].attrs.id);
  assert.deepEqual(order, ["pr-f-name", "pr-f-code", "pr-f-category", "pr-f-is_active"], "phone order, and the rows read name | code, category | show");
  assert.match(CSS, /\.pr-form\.pr-tabbed \{ max-width: none; margin-inline: 0; \}/, "full width, no centered column");
  assert.ok(!/max-width: 1000px/.test(CSS));
  /* the code rules stay, with their messages */
  fill(d, { code: "" }); await d.submit();
  assert.match(d.$("pr-e-code").textContent, /Enter a product code\./);
});

test("Servings per pack is a suffix group (\"servings\" after the field) in the same class, so it gets the whole-group focus ring", async () => {
  const d = await openAdd();
  const g = d.$("pr-f-servings_per_pack").parentNode;
  assert.ok(g.classList.contains("pr-ig") && g.classList.contains("pr-ig-suffixed"));
  assert.deepEqual(g.all((n) => n.classList.contains("pr-ig-suf")).map((n) => n.textContent), ["servings"]);
  assert.equal(g.all((n) => n.classList.contains("pr-ig-pre")).length, 0, "no # prefix");
});

test("SRP, Members discount and Servings sit in one row (stacked at phone width)", async () => {
  const d = await openAdd();
  const row = d.$("pr-f-srp_centavos").parentNode.parentNode.parentNode;
  assert.ok(row.classList.contains("pr-three"));
  assert.match(CSS, /\.pr-three \{ display: grid; grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(CSS, /@media \(max-width: 640px\) \{[^@]*\.pr-three \{ grid-template-columns: 1fr; \}/);
});

test("Price per serving is live: SRP over servings, rounded half-up to a centavo, hidden when either is empty", async () => {
  const d = await openAdd();
  const note = d.$("pr-perserv");
  assert.ok(note.hidden, "hidden while empty");
  d.set("srp_centavos", "320"); d.set("servings_per_pack", "30");
  assert.ok(!note.hidden);
  assert.equal(note.textContent, "Price per serving ₱10.67");
  d.set("servings_per_pack", "0");
  assert.ok(note.hidden);
  d.set("servings_per_pack", "7"); d.set("srp_centavos", "1");
  assert.equal(note.textContent, "Price per serving ₱0.14");
  d.set("srp_centavos", "");
  assert.ok(note.hidden);
});

test("the focus ring wraps the whole ₱ / % group: light blue, on the group, none on its input", () => {
  assert.match(CSS, /\.pr-ig:focus-within \{ box-shadow: 0 0 0 1px var\(--link\); \}/);
  assert.match(CSS, /\.pr-ig:focus-within \.pr-ig-pre, [^{]*\.pr-ig:focus-within \.pr-ig-suf, [^{]*\.pr-ig:focus-within \.pr-input \{ border-color: var\(--link\); \}/);
  assert.match(CSS, /\.pr-ig \.pr-input:focus \{ box-shadow: none; \}/);
});

test("Shipping: Length, Width, Height, Actual weight and Units per shipping box are one row", async () => {
  const d = await openAdd();
  assert.ok(!/Volume slot/.test(d.$("pr-root").textContent), "no Volume slot field");
  const row = d.all("pr-five")[0];
  assert.deepEqual(row.all((n) => n.tagName === "LABEL").map((n) => n.textContent), ["Length", "Width", "Height", "Actual weight", "Units per shipping box"]);
  assert.deepEqual(d.all("pr-ig-suf").map((n) => n.textContent), ["servings", "cm", "cm", "cm", "kg", "pc(s)"], "units are suffix boxes, not in the labels");
  assert.deepEqual(["length_cm", "width_cm", "height_cm", "weight_kg", "shipping_qty"].map((k) => d.$("pr-f-" + k).getAttribute("placeholder")), ["0.00", "0.00", "0.00", "0.00", "1"]);
  for (const k of ["length_cm", "width_cm", "height_cm", "weight_kg", "shipping_qty"]) {
    assert.equal(d.$("pr-f-" + k).value, "", k + " is empty: placeholders only");
    assert.ok(d.$("pr-f-" + k).parentNode.classList.contains("pr-ig"), k + " sits in the input group");
  }
  assert.match(CSS, /\.pr-five \{ display: grid; grid-template-columns: repeat\(5,/);
  assert.match(CSS, /max-width: 640px\) \{[^@]*\.pr-five \{ grid-template-columns: repeat\(2,/);
});

test("pricing inputs are prefix groups with placeholders only: ₱ 0.00 and % 40; Edit shows the saved values", async () => {
  const d = await openAdd();
  const pre = d.all("pr-ig-pre");
  assert.deepEqual(pre.map((n) => n.textContent), ["₱", "%"]);
  assert.equal(d.$("pr-f-srp_centavos").getAttribute("placeholder"), "0.00");
  assert.equal(d.$("pr-f-earnings_rate").getAttribute("placeholder"), "40");
  assert.equal(d.$("pr-f-srp_centavos").value, "");
  assert.equal(d.$("pr-f-earnings_rate").value, "");
  assert.ok(pre[0].parentNode.classList.contains("pr-ig") && pre[0].parentNode.all((n) => n.tagName === "INPUT")[0] === d.$("pr-f-srp_centavos"));
  assert.match(d.$("pr-root").textContent, /Between 10 and 50\./);
  const e = boot({ products: [product("1")] });
  await e.show(); e.manage(0, "pr-edit");
  assert.equal(e.$("pr-f-srp_centavos").value, "450");
  assert.equal(e.$("pr-f-earnings_rate").value, "40");
});

test("Description tab is off on Add and on after the first Save Details; Back to products returns to the list", async () => {
  const d = await openAdd();
  tabs(d)[1].fire("click"); tabs(d)[0].fire("keydown", { key: "ArrowRight" });
  assert.equal(tabs(d)[0].getAttribute("aria-selected"), "true", "still on Details");
  fill(d); await d.submit();
  assert.equal(tabs(d)[1].getAttribute("aria-disabled"), null);
  assert.equal(tabs(d)[1].disabled, false);
  tabs(d)[1].fire("click");
  assert.equal(d.$("pr-panel-description").hidden, false);
  d.all("pr-backlink")[0].fire("click", { preventDefault() {} });
  await settle();
  assert.equal(d.all("pr-backlink").length, 0);
  assert.equal(d.buttons("Add product").length, 1, "the list is back");
});

test("editor: the search box and Search button are gone from the form screens; the dash search style is light blue, never gold", () => {
  assert.match(CSS, /\.pr-qs:focus-within \{ border-color: var\(--link\)/);
  assert.ok(!/pr-search-btn/.test(CSS) && !/pr-search-btn/.test(SRC));
});

test("tabs: Details and Description switch; the arrow keys move between them; the disabled Media Library never selects", async () => {
  const d = boot({ products: [product("1", { short_description: "S", features: "F" })] });
  await d.show();
  d.manage(0, "pr-edit");
  assert.equal(d.$("pr-panel-description").hidden, true);
  assert.equal(d.all("pr-formtitle")[0].textContent, "Edit product");
  tabs(d)[1].fire("click");
  assert.equal(d.$("pr-panel-description").hidden, false);
  assert.equal(d.$("pr-panel-details").hidden, true);
  assert.equal(tabs(d)[1].getAttribute("aria-selected"), "true");
  assert.equal(tabs(d)[0].getAttribute("tabindex"), "-1");
  tabs(d)[2].fire("click");
  assert.equal(tabs(d)[1].getAttribute("aria-selected"), "true", "Media Library is not a tab you can open");
  tabs(d)[1].fire("keydown", { key: "ArrowLeft" });
  assert.equal(d.$("pr-panel-details").hidden, false);
  assert.equal(d.$("pr-f-features") != null, true);
});

test("Description tab: six texts with their limits; Save Description sends only what changed, with the revision, and the editor stays", async () => {
  const d = boot({ products: [product("1", { short_description: "S", features: "F" })] });
  await d.show();
  d.manage(0, "pr-edit");
  tabs(d)[1].fire("click");
  const limits = {}; for (const k of ["short_description", "long_description", "features", "specifications", "advantages", "benefits"]) limits[k] = d.$("pr-f-" + k).getAttribute("maxlength");
  assert.deepEqual(limits, { short_description: "500", long_description: "20000", features: "5000", specifications: "5000", advantages: "5000", benefits: "5000" });
  assert.equal(d.$("pr-f-features").value, "F");
  const descForm = d.$("pr-root").all((n) => n.tagName === "FORM")[1];
  assert.deepEqual(descForm.all((n) => n.tagName === "BUTTON" && n.getAttribute("type") === "submit").map((b) => b.textContent), ["Save Description"]);
  descForm.fire("submit"); await settle();
  assert.equal(d.writes().length, 0);
  assert.match(topmsg(d), /no changes to save/i);
  d.set("benefits", "  Energy for the day "); d.set("features", "F");
  descForm.fire("submit"); await settle();
  assert.deepEqual(d.writes().map((c) => c.method + " " + c.body.revision), ["PATCH 1"]);
  assert.deepEqual(d.writes()[0].body, { revision: 1, benefits: "Energy for the day" });
  assert.equal(d.all("pr-formtitle")[0].textContent, "Edit product", "still in the editor");
  assert.ok(d.toasts.some((t) => /Saved: The description is saved\./.test(t)));
  d.set("specifications", "100 g");
  descForm.fire("submit"); await settle();
  assert.deepEqual(d.writes()[1].body, { revision: 2, specifications: "100 g" }, "the next save carries the new revision");
});

test("Add becomes Edit after the first Details save: the code is fixed and Description has its form", async () => {
  const d = await openAdd();
  fill(d);
  await d.submit();
  assert.equal(d.all("pr-formtitle")[0].textContent, "Edit product");
  assert.equal(d.$("pr-f-code").readOnly, true);
  assert.equal(d.$("pr-root").all((n) => n.tagName === "FORM").length, 2, "Details and Description forms");
  assert.equal(d.$("pr-panel-details").hidden, false);
  assert.ok(d.toasts.some((t) => /Saved: The product is added\./.test(t)));
  assert.equal(d.rows().length, 0, "the list is not shown");
});

test("photos (Edit): five slots, a picked photo uploads to its own slot at once, Remove deletes that slot with the new revision; type and size are checked first", async () => {
  const d = boot();
  await d.show();
  d.manage(0, "pr-edit");
  assert.equal(d.all("pr-islot", d.all("pr-imgrow")[0]).length, 5);
  pickSlot(d, 2, { type: "application/pdf", size: 10 });
  assert.match(d.$("pr-e-image").textContent, /JPEG, PNG or WebP/);
  pickSlot(d, 2, { type: "image/png", size: 10 * 1024 * 1024 + 1 });
  assert.match(d.$("pr-e-image").textContent, /10 MB/);
  pickSlot(d, 2, { type: "image/png", size: 3 * 1024 * 1024 });
  assert.match(d.$("pr-e-image").textContent, /2 MB/);
  assert.equal(d.writes().length, 0);
  const png = { type: "image/png", size: 1000, name: "a.png" };
  pickSlot(d, 2, png); await settle();
  const up = d.writes()[0];
  assert.equal(up.method, "POST");
  assert.equal(up.path, `/sites/${SITE}/catalog/products/prod_1/image/?slot=2`);
  assert.equal(up.form.get("revision"), "1");
  assert.equal(up.form.get("file"), png);
  assert.equal(slot(d, 2).classList.contains("filled"), true);
  assert.equal(slot(d, 1).classList.contains("filled"), false);
  assert.equal(slot(d, 2).all((n) => n.tagName === "IMG").length, 1);
  pickSlot(d, 1, { type: "image/jpeg", size: 50, name: "m.jpg" }); await settle();
  assert.equal(d.writes()[1].path, `/sites/${SITE}/catalog/products/prod_1/image/?slot=1`);
  assert.equal(d.writes()[1].form.get("revision"), "2", "each upload follows the new revision");
  slot(d, 2).all((n) => n.tagName === "BUTTON" && n.classList.contains("pr-islot-x"))[0].fire("click"); await settle();
  const del = d.writes()[2];
  assert.equal(del.method, "DELETE");
  assert.equal(del.path, `/sites/${SITE}/catalog/products/prod_1/image/?slot=2&revision=3`);
  assert.equal(slot(d, 2).classList.contains("filled"), false);
  assert.equal(slot(d, 1).classList.contains("filled"), true);
});

test("photos: a product from an older API (image_url only) shows its photo in slot 1; image_urls fill their own slots", async () => {
  const u = boot().P.util;
  assert.deepEqual(Array.from(u.imageUrls({ image_url: "https://media.test/a.jpg" })), ["https://media.test/a.jpg", "", "", "", ""]);
  assert.deepEqual(Array.from(u.imageUrls({ image_url: "https://media.test/a.jpg", image_urls: ["https://media.test/a.jpg", null, "https://media.test/c.jpg", null, null] })), ["https://media.test/a.jpg", "", "https://media.test/c.jpg", "", ""]);
  assert.deepEqual(Array.from(u.imageUrls({ image_urls: [null, null, null, null, null] })), ["", "", "", "", ""]);
  const d = boot({ products: [product("1", { image_url: "https://media.test/a.jpg", image_urls: ["https://media.test/a.jpg", null, "https://media.test/c.jpg", null, null] })] });
  await d.show();
  d.manage(0, "pr-edit");
  assert.deepEqual([1, 2, 3, 4, 5].map((n) => slot(d, n).classList.contains("filled")), [true, false, true, false, false]);
});

test("photos (Add): picks are kept per slot and uploaded after the product is created, each with the new revision; then Add becomes Edit", async () => {
  const d = await openAdd();
  fill(d);
  const a = { type: "image/png", size: 1000, name: "mug.png" }, b = { type: "image/jpeg", size: 900, name: "side.jpg" };
  pickSlot(d, 1, a); pickSlot(d, 3, b);
  assert.deepEqual([1, 2, 3, 4, 5].map((n) => slot(d, n).classList.contains("filled")), [true, false, true, false, false]);
  await d.submit();
  assert.deepEqual(d.writes().map((c) => c.method + " " + c.path), [`POST /sites/${SITE}/catalog/products/`, `POST /sites/${SITE}/catalog/products/prod_1/image/?slot=1`, `POST /sites/${SITE}/catalog/products/prod_1/image/?slot=3`]);
  assert.equal(d.writes()[1].form.get("revision"), "1");
  assert.equal(d.writes()[1].form.get("file"), a);
  assert.equal(d.writes()[2].form.get("revision"), "2");
  assert.equal(d.writes()[2].form.get("file"), b);
  assert.equal(d.all("pr-formtitle")[0].textContent, "Edit product");
  assert.deepEqual([1, 2, 3, 4, 5].map((n) => slot(d, n).classList.contains("filled")), [true, false, true, false, false], "the saved photos are in the Edit slots");
  assert.ok(d.toasts.some((t) => /Saved: The product is added\./.test(t)));
});

test("photos (Add) with Show in shops off: product, photo, then the hide call carries the photo's new revision", async () => {
  const d = await openAdd();
  fill(d);
  d.$("pr-f-is_active").checked = false;
  pickSlot(d, 1, { type: "image/jpeg", size: 5, name: "a.jpg" });
  await d.submit();
  assert.deepEqual(d.writes().map((c) => c.method), ["POST", "POST", "PATCH"]);
  assert.deepEqual(d.writes()[2].body, { revision: 2, is_active: false });
  assert.ok(d.toasts.some((t) => /added and hidden/.test(t)));
});

test("photos (Add): refused over 10 MB, over 2 MB without a cropper, and for a wrong type; Remove photo clears the slot", async () => {
  const d = await openAdd();
  pickSlot(d, 1, { type: "application/pdf", size: 5 });
  assert.match(d.$("pr-e-image").textContent, /JPEG, PNG or WebP/);
  pickSlot(d, 1, { type: "image/png", size: 10 * 1024 * 1024 + 1 });
  assert.match(d.$("pr-e-image").textContent, /10 MB/);
  assert.equal(slot(d, 1).classList.contains("filled"), false);
  pickSlot(d, 1, { type: "image/png", size: 3 * 1024 * 1024 });
  assert.match(d.$("pr-e-image").textContent, /2 MB/);
  pickSlot(d, 1, { type: "image/png", size: 2 * 1024 * 1024, name: "ok.png" });
  assert.equal(d.$("pr-e-image").hidden, true);
  assert.equal(slot(d, 1).classList.contains("filled"), true);
  slot(d, 1).all((n) => n.classList.contains("pr-islot-x"))[0].fire("click");
  assert.equal(slot(d, 1).classList.contains("filled"), false);
  fill(d); await d.submit();
  assert.equal(d.writes().length, 1, "no photo, so no image call");
});

test("photos: a pick opens the square crop; the cropped output is checked against 2 MB, PNG first then JPEG", async () => {
  const d = await openAdd({ cropper: { sizes: [500, 400] } });
  pickSlot(d, 2, { type: "image/png", size: 3 * 1024 * 1024, name: "big.png" });
  const ov = d.all("pr-crop")[0];
  assert.ok(ov, "the crop dialog opens");
  assert.equal(ov.getAttribute("role"), "dialog");
  const img = ov.all((n) => n.tagName === "IMG")[0];
  assert.equal(img.getAttribute("src"), "blob:test/1");
  img.fire("load");
  assert.deepEqual({ ...d.window.cropperOpts }, { aspectRatio: 1, viewMode: 2, autoCropArea: 0.9, background: false, responsive: true });
  d.buttons("Use this crop")[0].fire("click");
  assert.equal(d.all("pr-crop").length, 0, "the dialog closes");
  assert.equal(d.window.cropperDestroyed, true);
  assert.deepEqual(d.revoked, ["blob:test/1"]);
  assert.equal(slot(d, 2).classList.contains("filled"), true);
  assert.equal(slot(d, 2).all((n) => n.classList.contains("pr-islot-img")).length, 1, "the cropped photo is the preview");
  fill(d); await d.submit();
  const sent = d.writes()[1].form.get("file");
  assert.equal(d.writes()[1].path, `/sites/${SITE}/catalog/products/prod_1/image/?slot=2`);
  assert.equal(sent.type, "image/png");
  assert.equal(sent.size, 500);
  assert.deepEqual(d.revoked, ["blob:test/1", "blob:test/2"], "the preview URL is released once the product is added");
});

test("photos (Edit): the pick is cropped first, then uploaded", async () => {
  const d = boot({ cropper: { sizes: [500, 400] } });
  await d.show();
  d.manage(0, "pr-edit");
  pickSlot(d, 4, { type: "image/jpeg", size: 8 * 1024 * 1024, name: "big.jpg" });
  assert.equal(d.writes().length, 0, "nothing is sent before the crop");
  d.all("pr-crop")[0].all((n) => n.tagName === "IMG")[0].fire("load");
  d.buttons("Use this crop")[0].fire("click"); await settle();
  assert.equal(d.writes()[0].path, `/sites/${SITE}/catalog/products/prod_1/image/?slot=4`);
  assert.equal(d.writes()[0].form.get("file").size, 500);
});

test("photos: a PNG over 2 MB falls back to a JPEG; both over 2 MB refuses; Cancel keeps nothing", async () => {
  const MB = 1024 * 1024;
  const d = await openAdd({ cropper: { sizes: [3 * MB, MB] } });
  const pick = () => { pickSlot(d, 1, { type: "image/jpeg", size: 9 * MB, name: "a.jpg" }); d.all("pr-crop")[0].all((n) => n.tagName === "IMG")[0].fire("load"); };
  pick(); d.buttons("Use this crop")[0].fire("click");
  fill(d); await d.submit();
  assert.equal(d.writes()[1].form.get("file").type, "image/jpeg");
  const big = await openAdd({ cropper: { sizes: [3 * MB, 3 * MB] } });
  pickSlot(big, 1, { type: "image/png", size: MB, name: "a.png" });
  big.all("pr-crop")[0].all((n) => n.tagName === "IMG")[0].fire("load");
  big.buttons("Use this crop")[0].fire("click");
  assert.match(big.$("pr-e-image").textContent, /still over 2 MB/);
  assert.equal(slot(big, 1).classList.contains("filled"), false);
  const c = await openAdd({ cropper: { sizes: [1, 1] } });
  pickSlot(c, 1, { type: "image/png", size: 1, name: "a.png" });
  c.buttons("Cancel").find((b) => b.classList.contains("pr-crop-cancel")).fire("click");
  assert.equal(c.all("pr-crop").length, 0);
  assert.equal(slot(c, 1).classList.contains("filled"), false);
});

test("photos (Add): when a photo step fails the product is kept and its Edit form opens with the message; nothing is created twice", async () => {
  const d = await openAdd({ routes: (method, p) => (method === "POST" && /image\/\?slot/.test(p) ? { status: 503, body: { error: { code: "image_store_not_configured", message: "x" } } } : null) });
  fill(d);
  d.$("pr-f-is_active").checked = false;
  pickSlot(d, 1, { type: "image/png", size: 9, name: "a.png" });
  await d.submit();
  assert.deepEqual(d.writes().map((c) => c.method), ["POST", "POST", "PATCH"], "the hide step is still tried");
  assert.equal(d.all("pr-formtitle")[0].textContent, "Edit product", "the edit form of the created product");
  assert.equal(d.$("pr-f-code").value, "X1");
  assert.equal(d.$("pr-f-code").readOnly, true);
  const msg = d.all("pr-topmsg")[0];
  assert.equal(msg.hidden, false);
  assert.match(msg.textContent, /product was added/);
  assert.match(msg.textContent, /Photo 1 couldn’t be saved/);
  assert.match(msg.textContent, /image store is not set up/);
  assert.equal(d.state.products.length, 1, "one product");
  assert.equal(d.state.products[0].is_active, false, "hidden anyway");
});

test("add: when the hide step fails the product is kept, active, and the edit form opens with Show in shops off", async () => {
  const d = await openAdd({ routes: (method) => (method === "PATCH" ? { status: 500, body: { error: { code: "boom", message: "Server trouble." } } } : null) });
  fill(d);
  d.$("pr-f-is_active").checked = false;
  await d.submit();
  assert.deepEqual(d.writes().map((c) => c.method), ["POST", "PATCH"]);
  assert.equal(d.all("pr-formtitle")[0].textContent, "Edit product");
  assert.match(d.all("pr-topmsg")[0].textContent, /couldn’t be hidden/);
  assert.equal(d.$("pr-f-is_active").checked, false);
});

test("pure helpers: the shipping preview body needs all three sizes, then the weight; the fee tiles or the reason", () => {
  const u = boot().P.util;
  const ok = { length_cm: "20", width_cm: "10", height_cm: "5.5", weight_kg: "0.18", shipping_qty: "3" };
  assert.deepEqual({ ...u.previewBody(ok).body }, { weight_kg: "0.18", length_cm: "20", width_cm: "10", height_cm: "5.5", shipping_qty: 3 });
  assert.equal(u.previewBody({ ...ok, shipping_qty: "" }).body.shipping_qty, null);
  assert.ok(!("volume_slot" in u.previewBody({ ...ok, volume_slot: "2.5" }).body), "the form never sends a volume slot");
  assert.equal(u.previewBody({ ...ok, height_cm: "" }).why, "sizes");
  assert.equal(u.previewBody({ ...ok, width_cm: "0" }).why, "sizes");
  assert.equal(u.previewBody({ ...ok, weight_kg: "" }).why, "weight");
  assert.equal(u.previewBody({ ...ok, weight_kg: "abc" }).body, null);
  const fm = u.feeModel({ ncr_centavos: 12000, mindanao_centavos: 18050, billable_kg: "0.50", reason: "" });
  assert.deepEqual(Array.from(fm.tiles).map((t) => t.join("|")), ["₱120.00|To NCR", "₱180.50|To Mindanao", "0.50 kg|Billed at"]);
  assert.match(fm.note, /treat this as a floor/);
  assert.equal(fm.reason, "");
  assert.equal(u.feeModel({ ncr_centavos: 0, mindanao_centavos: 0, billable_kg: "0.50", reason: "Shipping is free for now." }).reason, "Shipping is free for now.");
  const none = u.feeModel({ ncr_centavos: null, mindanao_centavos: null, billable_kg: null, reason: "No courier rate covers this size." });
  assert.equal(none.tiles.length, 0);
  assert.equal(none.note, "No courier rate covers this size.");
});

test("Packaging & fee: asks the preview a moment after the last keystroke, shows To NCR, To Mindanao and Billed at; sizes missing says so and asks nothing", async () => {
  const d = boot({ products: [product("1")] });
  await d.show();
  d.manage(0, "pr-edit");
  const pv = () => d.$("pr-pkg-preview").textContent;
  const asked = () => d.calls.filter((c) => /shipping-preview/.test(c.path));
  assert.match(pv(), /Enter all three measurements/);
  assert.equal(asked().length, 0);
  d.set("length_cm", "20"); d.set("width_cm", "10");
  assert.match(pv(), /Enter all three measurements/);
  d.set("weight_kg", "0.5"); d.set("height_cm", "5"); d.set("height_cm", "6");
  assert.equal(asked().length, 0, "not on every keystroke");
  await wait(420);
  assert.equal(asked().length, 1, "one call for the burst");
  assert.equal(asked()[0].method, "POST");
  assert.equal(asked()[0].path, `/sites/${SITE}/catalog/shipping-preview/`);
  assert.deepEqual(asked()[0].body, { weight_kg: "0.5", length_cm: "20", width_cm: "10", height_cm: "6", shipping_qty: null });
  assert.match(pv(), /₱120\.00To NCR/);
  assert.match(pv(), /₱180\.00To Mindanao/);
  assert.match(pv(), /0\.50 kgBilled at/);
  assert.match(pv(), /treat this as a floor/);
  d.state.preview = { ncr_centavos: null, mindanao_centavos: null, billable_kg: null, reason: "No courier rate covers this size." };
  d.set("shipping_qty", "2"); await wait(420);
  assert.match(pv(), /No courier rate covers this size\./);
  assert.ok(!/To NCR/.test(pv()));
  d.set("height_cm", "");
  assert.match(pv(), /Enter all three measurements/);
  assert.equal(d.writes().length, 0, "the preview writes nothing");
});

test("history: photo slots 2 to 5 and the four new texts are named", () => {
  const u = boot().P.util;
  const base = product("1", { image_urls: [null, null, null, null, null] });
  const next = { ...base, features: "x", benefits: "y", image_urls: [null, "https://media.test/b.jpg", null, null, "https://media.test/e.jpg"] };
  assert.deepEqual(Array.from(u.changes(next, base)), ["Features changed", "Benefits changed", "Photo 2 changed", "Photo 5 changed"]);
});

test("source rules: API strings never reach innerHTML, no storage key, focus is light blue and never gold", () => {
  assert.ok(!/innerHTML|insertAdjacentHTML|document\.write|localStorage|sessionStorage|eval\(/.test(SRC));
  assert.ok(/:focus-visible/.test(CSS));
  assert.ok(!/#f2d99b|#c59a3b|#e8c16a|var\(--gold\)|var\(--cat\)|var\(--c-cat\)/i.test(CSS));
  for (const m of CSS.matchAll(/:focus-visible[^{]*\{([^}]*)\}/g)) assert.match(m[1], /var\(--link\)/);
});

test("Packaging & fee: no volume slot in the body; a reason beside figures shows under them; a 400 invalid_request shows its field message", async () => {
  const d = boot({ products: [product("1", { length_cm: "20", width_cm: "10", height_cm: "5", weight_kg: "0.5", volume_slot: "3.00" })] });
  d.state.preview = { ncr_centavos: 0, mindanao_centavos: 0, billable_kg: "0.50", reason: "Shipping is free for now." };
  await d.show();
  d.manage(0, "pr-edit");
  await wait(420);
  const asked = () => d.calls.filter((c) => /shipping-preview/.test(c.path));
  assert.ok(!("volume_slot" in asked()[0].body), "an old product's stored volume slot is not sent");
  assert.equal(d.$("pr-f-volume_slot"), null, "no Volume slot field on the form");
  const pv = () => d.$("pr-pkg-preview").textContent;
  assert.match(pv(), /To NCR/);
  assert.match(pv(), /Shipping is free for now\./);
  const bad = boot({ products: [product("1", { length_cm: "20", width_cm: "10", height_cm: "5", weight_kg: "0.5" })],
    routes: (m, p) => /shipping-preview/.test(p) ? { status: 400, body: { error: { code: "invalid_request", message: "Invalid.", fields: { weight_kg: "Enter a weight above 0." } } } } : null });
  await bad.show();
  bad.manage(0, "pr-edit"); await wait(420);
  assert.match(bad.$("pr-pkg-preview").textContent, /Enter a weight above 0\./);
});

test("a photo upload refused with 400 invalid_request and a slot field shows it under the photos", async () => {
  const d = boot({ routes: (m, p) => m === "POST" && /image\/\?slot/.test(p) ? { status: 400, body: { error: { code: "invalid_request", message: "Invalid.", fields: { slot: "Choose a photo slot from 1 to 5." } } } } : null });
  await d.show();
  d.manage(0, "pr-edit");
  pickSlot(d, 2, { type: "image/png", size: 100, name: "a.png" }); await settle();
  assert.equal(d.$("pr-e-image").hidden, false);
  assert.match(d.$("pr-e-image").textContent, /Choose a photo slot from 1 to 5\./);
});

/* ---- round 5a: servings per pack, FAQ ---------------------------------------------------------------------------- */

const openDesc = async (over) => { const d = boot({ products: [product("1", over)] }); await d.show(); d.manage(0, "pr-edit"); tabs(d)[1].fire("click"); return d; };
const descSubmit = async (d) => { d.$("pr-root").all((n) => n.tagName === "FORM")[1].fire("submit"); await settle(); };
const faqBtn = (d, cls, i = 0) => d.all(cls)[i];
const faqSet = (d, id, v) => { const n = d.$(id); n.value = v; n.fire("input"); };

test("servings per pack: a suffix group beside a 30 placeholder; Add sends the number, empty sends nothing; bad values are named", async () => {
  const d = await openAdd();
  assert.equal(d.$("pr-f-servings_per_pack").getAttribute("placeholder"), "30");
  fill(d, { servings_per_pack: "0" });
  await d.submit();
  assert.equal(d.writes().length, 0);
  assert.match(d.error("servings_per_pack"), /1 to 999/);
  d.set("servings_per_pack", "30");
  await d.submit();
  assert.equal(d.writes()[0].body.servings_per_pack, 30);
  assert.strictEqual(typeof d.writes()[0].body.servings_per_pack, "number");
  const e = await openAdd();
  fill(e);
  await e.submit();
  assert.ok(!("servings_per_pack" in e.writes()[0].body), "empty on Add is left out");
});

test("servings per pack (Edit): shows the saved value, sends only a change, and clearing sends null", async () => {
  const d = boot({ products: [product("1", { servings_per_pack: 30 })] });
  await d.show(); d.manage(0, "pr-edit");
  assert.equal(d.$("pr-f-servings_per_pack").value, "30");
  await d.submit();
  assert.equal(d.writes().length, 0, "unchanged sends nothing");
  d.set("servings_per_pack", "60");
  await d.submit();
  assert.deepEqual(d.writes()[0].body, { revision: 1, servings_per_pack: 60 });
  d.set("servings_per_pack", "");
  await d.submit();
  assert.deepEqual(d.writes()[1].body, { revision: 2, servings_per_pack: null });
  const older = boot({ products: [product("1")] });
  await older.show(); older.manage(0, "pr-edit");
  assert.equal(older.$("pr-f-servings_per_pack").value, "");
  await older.submit();
  assert.equal(older.writes().length, 0, "an older API without the field: nothing to save");
});

test("FAQ editor: add, type, remove and reorder; the limit is 10; Save Description sends the list", async () => {
  const d = await openDesc();
  assert.equal(d.all("pr-faq-item").length, 0);
  assert.match(d.$("pr-root").textContent, /“How do I pay\?” is always added at the end\./);
  faqBtn(d, "pr-faq-add").fire("click"); faqBtn(d, "pr-faq-add").fire("click");
  assert.equal(d.all("pr-faq-item").length, 2);
  assert.equal(d.$("pr-faq-q-0").getAttribute("maxlength"), "150");
  assert.equal(d.$("pr-faq-a-0").getAttribute("maxlength"), "1000");
  assert.deepEqual(d.all("pr-faq-count").map((n) => n.textContent), ["0/150", "0/1000", "0/150", "0/1000"]);
  faqSet(d, "pr-faq-q-0", "Who is it for?"); faqSet(d, "pr-faq-a-0", "Anyone.");
  assert.equal(d.all("pr-faq-count")[0].textContent, "14/150");
  faqSet(d, "pr-faq-q-1", "How to take it?"); faqSet(d, "pr-faq-a-1", "  One a day. ");
  faqBtn(d, "pr-faq-down", 0).fire("click");
  assert.equal(d.$("pr-faq-q-0").value, "How to take it?", "the second moved up and typed text stayed");
  await descSubmit(d);
  assert.deepEqual(d.writes()[0].body, { revision: 1, faq: [{ q: "How to take it?", a: "One a day." }, { q: "Who is it for?", a: "Anyone." }] });
  faqBtn(d, "pr-faq-rm", 0).fire("click");
  assert.equal(d.all("pr-faq-item").length, 1);
  await descSubmit(d);
  assert.deepEqual(d.writes()[1].body, { revision: 2, faq: [{ q: "Who is it for?", a: "Anyone." }] });
  for (let i = 0; i < 12; i++) faqBtn(d, "pr-faq-add").fire("click");
  assert.equal(d.all("pr-faq-item").length, 10, "never more than 10");
  assert.ok(faqBtn(d, "pr-faq-add").disabled);
});

test("FAQ editor: saved pairs load; a half-filled pair is refused and empty ones are dropped; server faq errors show under the list", async () => {
  const d = await openDesc({ faq: [{ q: "Q1", a: "A1" }] });
  assert.equal(d.$("pr-faq-q-0").value, "Q1");
  assert.equal(d.$("pr-faq-a-0").value, "A1");
  await descSubmit(d);
  assert.equal(d.writes().length, 0, "unchanged sends nothing");
  faqBtn(d, "pr-faq-add").fire("click"); faqSet(d, "pr-faq-q-1", "Only a question");
  await descSubmit(d);
  assert.equal(d.writes().length, 0);
  assert.match(d.error("faq"), /answer/);
  faqSet(d, "pr-faq-q-1", "");
  const e = boot({ products: [product("1")], routes: (m) => (m === "PATCH" ? { status: 400, body: { error: { code: "invalid_request", message: "Check the highlighted fields.", fields: { faq: "Too long." } } } } : null) });
  await e.show(); e.manage(0, "pr-edit"); tabs(e)[1].fire("click");
  faqBtn(e, "pr-faq-add").fire("click"); faqSet(e, "pr-faq-q-0", "Q"); faqSet(e, "pr-faq-a-0", "A");
  await descSubmit(e);
  assert.equal(e.error("faq"), "Too long.");
});

test("History names Servings per pack and FAQ", () => {
  const u = boot().P.util;
  const base = product("1", { servings_per_pack: null, faq: [] });
  assert.deepEqual(Array.from(u.changes({ ...base, servings_per_pack: 30 }, base)), ["Servings per pack changed"]);
  assert.deepEqual(Array.from(u.changes({ ...base, faq: [{ q: "a", a: "b" }] }, base)), ["FAQ changed"]);
  assert.deepEqual(Array.from(u.changes({ ...base, faq: [] }, { ...base, faq: undefined })), ["Saved with no changes"]);
});

/* ---- round 5b: ingredients -------------------------------------------------------------------------------------- */

const ingSet = (d, id, v) => { const n = d.$(id); n.value = v; n.fire("input"); };
const ingPhoto = (d, i, v) => { const n = d.$("pr-ing-photo-" + i); n.value = v; n.fire("change"); };
const ingOptions = (d, i) => d.$("pr-ing-photo-" + i).children.map((o) => o.textContent);
const PHOTOS = ["https://media.test/a.jpg", "https://media.test/b.jpg", "", "", ""];

test("Ingredients editor: add, type, pick a photo, reorder, remove; the limit is 8; Save Description sends the list", async () => {
  const d = await openDesc({ image_urls: PHOTOS });
  assert.equal(d.all("pr-ing-item").length, 0);
  assert.match(d.$("pr-root").textContent, /Show what goes into it/);
  d.all("pr-ing-add")[0].fire("click"); d.all("pr-ing-add")[0].fire("click");
  assert.equal(d.all("pr-ing-item").length, 2);
  assert.equal(d.$("pr-ing-name-0").getAttribute("maxlength"), "60");
  assert.equal(d.$("pr-ing-line-0").getAttribute("maxlength"), "200");
  assert.deepEqual(ingOptions(d, 0), ["No photo", "Photo 1", "Photo 2"], "only the product's own photos are offered");
  ingSet(d, "pr-ing-name-0", "Barley grass"); ingSet(d, "pr-ing-line-0", "  Young, green and gentle. "); ingPhoto(d, 0, "2");
  ingSet(d, "pr-ing-name-1", "Lemon");
  d.all("pr-ing-down")[0].fire("click");
  assert.equal(d.$("pr-ing-name-0").value, "Lemon", "the second moved up and typed text stayed");
  assert.equal(d.$("pr-ing-photo-1").value, "2", "the photo choice travels with its card");
  await descSubmit(d);
  assert.deepEqual(d.writes()[0].body, { revision: 1, ingredients: [
    { name: "Lemon", line: "", photo_slot: null }, { name: "Barley grass", line: "Young, green and gentle.", photo_slot: 2 }] });
  d.all("pr-ing-rm")[0].fire("click");
  assert.equal(d.all("pr-ing-item").length, 1);
  await descSubmit(d);
  assert.deepEqual(d.writes()[1].body, { revision: 2, ingredients: [{ name: "Barley grass", line: "Young, green and gentle.", photo_slot: 2 }] });
  for (let i = 0; i < 12; i++) d.all("pr-ing-add")[0].fire("click");
  assert.equal(d.all("pr-ing-item").length, 8, "never more than 8");
  assert.ok(d.all("pr-ing-add")[0].disabled);
});

test("Ingredients editor: saved cards load; unchanged sends nothing; a nameless card is refused and blank ones are dropped; server errors show", async () => {
  const saved = [{ name: "Oats", line: "Whole grain.", photo_slot: 1, photo_url: PHOTOS[0] }];
  const d = await openDesc({ image_urls: PHOTOS, ingredients: saved });
  assert.equal(d.$("pr-ing-name-0").value, "Oats");
  assert.equal(d.$("pr-ing-photo-0").value, "1");
  await descSubmit(d);
  assert.equal(d.writes().length, 0, "unchanged sends nothing");
  d.all("pr-ing-add")[0].fire("click"); ingSet(d, "pr-ing-line-1", "A line with no name");
  await descSubmit(d);
  assert.equal(d.writes().length, 0);
  assert.match(d.error("ingredients"), /name/);
  ingSet(d, "pr-ing-line-1", "");
  await descSubmit(d);
  assert.equal(d.writes().length, 0, "a blank card is dropped, so nothing changed");
  const e = boot({ products: [product("1")], routes: (m) => (m === "PATCH" ? { status: 400, body: { error: { code: "invalid_request", message: "Check the highlighted fields.", fields: { ingredients: "Too many." } } } } : null) });
  await e.show(); e.manage(0, "pr-edit"); tabs(e)[1].fire("click");
  e.all("pr-ing-add")[0].fire("click"); ingSet(e, "pr-ing-name-0", "X");
  await descSubmit(e);
  assert.equal(e.error("ingredients"), "Too many.");
});

test("Ingredients editor: a saved slot whose photo was removed stays visible as empty; an older API without the field starts empty", async () => {
  const d = await openDesc({ image_urls: ["https://media.test/a.jpg", "", "", "", ""], ingredients: [{ name: "Oats", line: "", photo_slot: 3 }] });
  assert.deepEqual(ingOptions(d, 0), ["No photo", "Photo 1", "Photo 3 (empty)"]);
  const older = await openDesc();
  assert.equal(older.all("pr-ing-item").length, 0);
});

test("History names Ingredients", () => {
  const u = boot().P.util;
  const base = product("1", { ingredients: [] });
  assert.deepEqual(Array.from(u.changes({ ...base, ingredients: [{ name: "a", line: "", photo_slot: null }] }, base)), ["Ingredients changed"]);
  assert.deepEqual(Array.from(u.changes({ ...base, ingredients: [] }, { ...base, ingredients: undefined })), ["Saved with no changes"]);
});

/* ---- round 5b: Manage > Reviews --------------------------------------------------------------------------------------- */

const REVS = [
  { id: "rev_1", rating: 5, body: "Love it.\nWill <b>buy</b> again.", display_name: "Maria S.", created_at: "2026-11-14T02:00:00Z", edited: false, verified_buyer: true, product_id: "prod_1", product_code: "SPH1", product_name: "Product 1", order_number: "SO00001", is_hidden: false, hidden_at: null },
  { id: "rev_2", rating: 2, body: "", display_name: "<script>x</script>", created_at: "2026-11-13T02:00:00Z", edited: true, verified_buyer: true, product_id: "prod_1", product_code: "SPH1", product_name: "Product 1", order_number: "SO00002", is_hidden: true, hidden_at: "2026-11-14T00:00:00Z" },
];
const revRoutes = (rows, hook) => (m, p) => {
  if (m === "GET" && /\/shop\/reviews\/\?product=prod_1$/.test(p)) return { status: 200, body: { reviews: rows } };
  const t = /\/shop\/reviews\/(rev_\w+)\/(hide|show)\/$/.exec(p);
  if (m === "POST" && t) { if (hook) return hook(t); const row = rows.find((x) => x.id === t[1]); row.is_hidden = t[2] === "hide"; return { status: 200, body: row }; }
  return null;
};
const openReviews = async (d) => { await d.show(); d.manage(0, "pr-reviews"); await settle(); };

test("Manage > Reviews lists the product's reviews as read-only text with Verified buyer, Hide and Show", async () => {
  const rows = REVS.map((r) => ({ ...r }));
  const d = boot({ routes: revRoutes(rows) });
  await openReviews(d);
  assert.match(d.$("pr-root").textContent, /Reviews of Product 1/);
  assert.equal(d.calls.filter((c) => /shop\/reviews/.test(c.path))[0].path.endsWith("/shop/reviews/?product=prod_1"), true);
  assert.equal(d.all("pr-rev").length, 2);
  assert.match(d.$("pr-root").textContent, /2 reviews · 1 shown in your shop, 1 hidden/);
  assert.equal(d.all("pr-revname")[0].textContent, "Maria S.");
  assert.equal(d.all("pr-revbody")[0].textContent, "Love it.\nWill <b>buy</b> again.", "the buyer's words are text, never markup");
  assert.equal(d.all("pr-revname")[1].textContent, "<script>x</script>");
  assert.equal(d.all("pr-revstars")[0].textContent, "★★★★★");
  assert.equal(d.all("pr-revstars")[1].textContent, "★★☆☆☆");
  assert.equal(d.all("pr-revbody").length, 1, "a review without words shows no empty text");
  assert.match(d.$("pr-root").textContent, /Verified buyer/);
  assert.match(d.$("pr-root").textContent, /Order SO00001/);
  assert.equal(d.all("pr-rev-toggle")[0].textContent, "Hide from shop");
  assert.equal(d.all("pr-rev-toggle")[1].textContent, "Show in shop");
  assert.equal(d.$("pr-root").all((n) => n.tagName === "TEXTAREA" || n.tagName === "INPUT").length, 0, "nothing to edit");
});

test("Hide and Show post to the review and redraw it; a refusal keeps it as it was", async () => {
  const rows = REVS.map((r) => ({ ...r }));
  const d = boot({ routes: revRoutes(rows) });
  await openReviews(d);
  d.all("pr-rev-toggle")[0].fire("click"); await settle();
  assert.deepEqual(d.writes().map((c) => [c.method, c.path.replace(/^\/sites\/site_\w+/, "")]), [["POST", "/shop/reviews/rev_1/hide/"]]);
  assert.equal(d.writes()[0].body, null, "no words are sent, only the hide");
  assert.equal(d.all("pr-rev-toggle")[0].textContent, "Show in shop");
  assert.match(d.$("pr-root").textContent, /2 hidden/);
  assert.ok(d.toasts.some((t) => /Review hidden/.test(t)));
  d.all("pr-rev-toggle")[1].fire("click"); await settle();
  assert.equal(d.writes()[1].path.endsWith("/shop/reviews/rev_2/show/"), true);
  assert.equal(d.all("pr-rev-toggle")[1].textContent, "Hide from shop");
  const bad = boot({ routes: revRoutes(REVS.map((r) => ({ ...r })), () => ({ status: 404, body: { error: { code: "not_found", message: "Not found." } } })) });
  await openReviews(bad);
  bad.all("pr-rev-toggle")[0].fire("click"); await settle();
  assert.equal(bad.all("pr-rev-toggle")[0].textContent, "Hide from shop");
  assert.equal(bad.all("pr-rev-toggle")[0].disabled, false);
  assert.ok(bad.toasts.some((t) => /Not saved/.test(t)));
});

test("Reviews: an empty product says so, a failed read offers Try again, and Back returns to the list", async () => {
  const d = boot({ routes: revRoutes([]) });
  await openReviews(d);
  assert.match(d.$("pr-root").textContent, /No reviews yet/);
  assert.doesNotMatch(d.$("pr-root").textContent, /0 reviews/);
  const e = boot({ routes: (m, p) => (/\/shop\/reviews\//.test(p) ? { status: 500, body: {} } : null) });
  await openReviews(e);
  assert.match(e.$("pr-root").textContent, /couldn’t load the reviews/);
  assert.equal(e.buttons("Try again").length, 1);
  d.buttons("Back to products")[0].fire("click"); await settle();
  assert.equal(d.rows().length, 2);
});

/* ---- Section images (Features, Advantages, Benefits) and Category FAQs, ClickUp z8uq9mek5w r5c ---- */
const secRoutes = (method, p, body, state) => {
  const m = /^\/sites\/site_\w+\/catalog\/products\/(prod_\w+)\/image\/\?section=(features|advantages|benefits)(?:&revision=\d+)?$/.exec(p);
  if (!m) return null;
  const cur = state.products.find((x) => x.id === m[1]);
  cur[m[2] + "_image_url"] = method === "POST" ? "https://media.test/" + m[2] + ".png" : null;
  cur.revision += 1;
  return { status: 200, body: cur };
};

test("section images: only Features, Advantages and Benefits get one; Specifications does not; the tile is the photo slot's look", async () => {
  const d = await openDesc({ features_image_url: "https://media.test/f.png" });
  assert.equal(d.all("pr-secimg").length, 3);
  assert.deepEqual(d.all("pr-secimg").map((n) => n.all((x) => x.classList.contains("pr-secimg-title"))[0].textContent), ["Features image (optional)", "Advantages image (optional)", "Benefits image (optional)"]);
  assert.equal(d.$("pr-f-secimg-specifications"), null);
  assert.ok(d.$("pr-f-secimg-features") && d.$("pr-f-secimg-advantages") && d.$("pr-f-secimg-benefits"));
  assert.match(d.$("pr-f-secimg-features").getAttribute("accept"), /image\/png/);
  const filled = d.all("pr-secimg-slot");
  assert.deepEqual(filled.map((n) => n.classList.contains("filled")), [true, false, false]);
  assert.ok(filled.every((n) => n.classList.contains("pr-islot")), "same slot styles as the photos");
  const img = filled[0].all((n) => n.tagName === "IMG")[0];
  assert.equal(img.getAttribute("src"), "https://media.test/f.png");
  assert.equal(img.getAttribute("alt"), "Features image of Product 1");
  assert.match(CSS, /\.pr-secimg-slot \{ width: 120px; \}/);
});

test("section images: a pick checks type and size, crops, then uploads with ?section= and the revision; Remove deletes with the new revision; never a slot", async () => {
  const e = boot({ products: [product("1")], routes: secRoutes });
  await e.show(); e.manage(0, "pr-edit"); tabs(e)[1].fire("click");
  const pick = (key, f) => { e.$("pr-f-secimg-" + key).files = [f]; e.$("pr-f-secimg-" + key).fire("change"); };
  pick("features", { type: "application/pdf", size: 10 });
  assert.match(e.$("pr-e-secimg-features").textContent, /JPEG, PNG or WebP/);
  pick("features", { type: "image/png", size: 10 * 1024 * 1024 + 1 });
  assert.match(e.$("pr-e-secimg-features").textContent, /10 MB/);
  pick("features", { type: "image/png", size: 3 * 1024 * 1024 });
  assert.match(e.$("pr-e-secimg-features").textContent, /2 MB/);
  assert.equal(e.writes().length, 0);
  const png = { type: "image/png", size: 1000, name: "f.png" };
  pick("features", png); await settle();
  const up = e.writes()[0];
  assert.equal(up.method, "POST");
  assert.equal(up.path, `/sites/${SITE}/catalog/products/prod_1/image/?section=features`);
  assert.equal(up.form.get("revision"), "1");
  assert.equal(up.form.get("file"), png);
  assert.ok(!/slot=/.test(up.path), "slot and section are never sent together");
  assert.equal(e.$("pr-f-secimg-features").parentNode.classList.contains("filled"), true);
  assert.equal(e.$("pr-f-secimg-features").parentNode.all((n) => n.tagName === "IMG")[0].getAttribute("alt"), "Features image of Product 1");
  assert.ok(e.toasts.some((t) => /Saved: Features image is updated\./.test(t)));
  pick("benefits", { type: "image/jpeg", size: 50, name: "b.jpg" }); await settle();
  assert.equal(e.writes()[1].path, `/sites/${SITE}/catalog/products/prod_1/image/?section=benefits`);
  assert.equal(e.writes()[1].form.get("revision"), "2", "each upload follows the new revision");
  const xs = e.all("pr-islot-x").filter((n) => n.getAttribute("aria-label") === "Remove features image");
  assert.equal(xs.length, 1);
  xs[0].fire("click"); await settle();
  const del = e.writes()[2];
  assert.equal(del.method, "DELETE");
  assert.equal(del.path, `/sites/${SITE}/catalog/products/prod_1/image/?section=features&revision=3`);
  assert.equal(e.all("pr-islot-x").filter((n) => n.getAttribute("aria-label") === "Remove features image").length, 0);
  assert.equal(e.all("pr-islot-x").filter((n) => n.getAttribute("aria-label") === "Remove benefits image").length, 1);
  assert.equal(e.writes().length, 3);
});

test("section images: the crop dialog opens for a pick and Use this crop uploads to the section", async () => {
  const e = boot({ products: [product("1")], routes: secRoutes, cropper: { sizes: [900, 800] } });
  await e.show(); e.manage(0, "pr-edit"); tabs(e)[1].fire("click");
  e.$("pr-f-secimg-advantages").files = [{ type: "image/png", size: 5000, name: "a.png" }];
  e.$("pr-f-secimg-advantages").fire("change");
  const dlg = e.all("pr-crop")[0];
  assert.equal(dlg.getAttribute("aria-label"), "Crop advantages image");
  e.$("pr-root").all((n) => n.classList.contains("pr-crop-img"))[0].fire("load");
  e.all("pr-crop-use")[0].fire("click"); await settle();
  assert.equal(e.writes()[0].path, `/sites/${SITE}/catalog/products/prod_1/image/?section=advantages`);
});

test("section images: a refused upload shows its message under that section; a stale revision offers Reload", async () => {
  const e = boot({ products: [product("1")], routes: (m, p) => (/section=/.test(p) ? { status: 503, body: { error: { code: "image_store_not_configured", message: "x" } } } : null) });
  await e.show(); e.manage(0, "pr-edit"); tabs(e)[1].fire("click");
  e.$("pr-f-secimg-benefits").files = [{ type: "image/png", size: 100, name: "b.png" }];
  e.$("pr-f-secimg-benefits").fire("change"); await settle();
  assert.ok(e.$("pr-e-secimg-benefits").textContent.length > 0 && !e.$("pr-e-secimg-benefits").hidden);
  assert.equal(e.$("pr-e-secimg-features").hidden, true);
  const s = boot({ products: [product("1")], routes: (m, p) => (/section=/.test(p) ? { status: 409, body: { error: { code: "stale_revision", message: "x" } } } : null) });
  await s.show(); s.manage(0, "pr-edit"); tabs(s)[1].fire("click");
  s.$("pr-f-secimg-features").files = [{ type: "image/png", size: 100, name: "f.png" }];
  s.$("pr-f-secimg-features").fire("change"); await settle();
  assert.match(s.all("pr-topmsg")[0].textContent, /changed since you loaded it/);
  assert.equal(s.buttons("Reload").length, 1);
});

test("section images (read-only): the image shows with no upload, change or remove control", async () => {
  let stale = true;
  const d = boot({ products: [product("1", { benefits_image_url: "https://media.test/b.png" })], routes: (m) => { if (m === "PATCH" && stale) { stale = false; d.state.canEdit = false; return { status: 409, body: { error: { code: "stale_revision", message: "server" } } }; } return null; } });
  await d.show(); d.manage(0, "pr-edit"); tabs(d)[1].fire("click");
  d.set("benefits", "x");
  await descSubmit(d);
  d.buttons("Reload")[0].fire("click"); await settle();
  assert.equal(d.all("pr-secimg-slot").length, 1, "only the section that has an image");
  assert.equal(d.all("pr-secimg-slot")[0].all((n) => n.tagName === "IMG")[0].getAttribute("src"), "https://media.test/b.png");
  assert.equal(d.all("pr-secimg").map((n) => n.all((x) => x.tagName === "BUTTON" || x.tagName === "INPUT").length).reduce((a, b) => a + b, 0), 0, "no control at all");
  assert.equal(d.$("pr-f-secimg-benefits"), null);
});

test("Category FAQs: the toolbar action is the owner's only", async () => {
  const d = boot({ canEdit: false });
  await d.show();
  assert.equal(d.buttons("Category FAQs").length, 0);
  const o = boot();
  await o.show();
  assert.equal(o.buttons("Category FAQs").length, 1);
  assert.deepEqual(o.all("no-btn").filter((n) => n.tagName === "BUTTON").map((n) => n.textContent.replace(/^[＋⇅]\s/, "")).filter((t) => ["Arrange", "Category FAQs", "Export CSV", "Add product"].includes(t)), ["Arrange", "Category FAQs", "Export CSV", "Add product"]);
});

const catRoutes = (store) => (method, p, body) => {
  const m = /^\/sites\/site_\w+\/catalog\/categories\/(\w+)\/faq\/$/.exec(p);
  if (!m) return null;
  if (method === "PUT") { store[m[1]] = body.faq; return { status: 200, body: { category: m[1], faq: body.faq } }; }
  return { status: 200, body: { category: m[1], faq: store[m[1]] || [] } };
};

test("Category FAQs: a panel with Back, the house dropdown (four names), and the product FAQ editor; GET loads the list, Save PUTs the whole list", async () => {
  const store = { barley: [{ q: "Is it sweet?", a: "No." }] };
  const d = boot({ routes: catRoutes(store) });
  await d.show();
  d.buttons("Category FAQs")[0].fire("click"); await settle();
  assert.equal(d.all("pr-formtitle")[0].textContent, "Category FAQs");
  assert.equal(d.buttons("Back to products").length, 1);
  assert.deepEqual(Array.from(d.$("pr-cf-category").children).map((o) => o.value + ":" + o.textContent), ["barley:Barley", "drinks:Specialty Drinks", "essentials:Essentials", "beauty:Beauty"]);
  assert.equal(d.all("pr-combo").length >= 1, true, "the house dropdown");
  assert.equal(d.calls.filter((c) => c.method === "GET" && /categories/.test(c.path))[0].path, `/sites/${SITE}/catalog/categories/barley/faq/`);
  assert.equal(d.$("pr-faq-q-0").value, "Is it sweet?");
  assert.equal(d.$("pr-faq-a-0").getAttribute("maxlength"), "1000");
  assert.equal(d.$("pr-faq-q-0").getAttribute("maxlength"), "150");
  faqBtn(d, "pr-faq-add").fire("click"); faqSet(d, "pr-faq-q-1", " Who? "); faqSet(d, "pr-faq-a-1", " Everyone. ");
  d.form().fire("submit"); await settle();
  const put = d.writes()[0];
  assert.equal(put.method, "PUT");
  assert.equal(put.path, `/sites/${SITE}/catalog/categories/barley/faq/`);
  assert.deepEqual(put.body, { faq: [{ q: "Is it sweet?", a: "No." }, { q: "Who?", a: "Everyone." }] }, "the whole list, no revision");
  assert.ok(d.toasts.some((t) => /Saved: Barley FAQs are saved\./.test(t)));
  assert.equal(d.all("pr-faq-item").length, 2, "the editor stays, drawn from the saved list");
  faqBtn(d, "pr-faq-rm", 1).fire("click"); faqBtn(d, "pr-faq-rm", 0).fire("click");
  d.form().fire("submit"); await settle();
  assert.deepEqual(d.writes()[1].body, { faq: [] }, "an empty list clears the category");
  d.buttons("Back to products")[0].fire("click"); await settle();
  assert.equal(d.rows().length, 2, "back on the list");
});

test("Category FAQs: another category loads its own list; unsaved typing blocks the switch; half-filled pairs and server errors show under the list", async () => {
  const store = { barley: [{ q: "B?", a: "B." }], drinks: [{ q: "D?", a: "D." }] };
  const d = boot({ routes: catRoutes(store) });
  await d.show();
  d.buttons("Category FAQs")[0].fire("click"); await settle();
  const sel = d.$("pr-cf-category");
  sel.value = "drinks"; sel.fire("change"); await settle();
  assert.equal(d.calls.filter((c) => c.method === "GET" && /categories/.test(c.path)).pop().path, `/sites/${SITE}/catalog/categories/drinks/faq/`);
  assert.equal(d.$("pr-faq-q-0").value, "D?");
  assert.match(d.$("pr-root").textContent, /Specialty Drinks FAQs/);
  faqSet(d, "pr-faq-q-0", "Changed?");
  sel.value = "beauty"; sel.fire("change"); await settle();
  assert.equal(sel.value, "drinks", "the category stays");
  assert.match(d.all("pr-topmsg")[0].textContent, /unsaved changes/);
  assert.equal(d.calls.filter((c) => c.method === "GET" && /beauty/.test(c.path)).length, 0);
  faqSet(d, "pr-faq-q-0", "D?");
  faqBtn(d, "pr-faq-add").fire("click"); faqSet(d, "pr-faq-q-1", "Only a question");
  d.form().fire("submit"); await settle();
  assert.match(d.error("faq"), /answer/);
  const e = boot({ routes: (m, p, b) => (m === "PUT" ? { status: 400, body: { error: { code: "invalid_request", message: "Check.", fields: { faq: "Too long." } } } } : catRoutes({})(m, p, b)) });
  await e.show(); e.buttons("Category FAQs")[0].fire("click"); await settle();
  faqBtn(e, "pr-faq-add").fire("click"); faqSet(e, "pr-faq-q-0", "Q"); faqSet(e, "pr-faq-a-0", "A");
  e.form().fire("submit"); await settle();
  assert.equal(e.error("faq"), "Too long.");
});

test("Category FAQs: a failed read offers Try again; a read-only refusal on save uses its own sentence", async () => {
  let fail = true;
  const d = boot({ routes: (m, p, b) => (m === "GET" && /categories/.test(p) && fail ? { status: 500, body: {} } : m === "PUT" ? { status: 403, body: { error: { code: "catalog_read_only", message: "x" } } } : catRoutes({})(m, p, b)) });
  await d.show(); d.buttons("Category FAQs")[0].fire("click"); await settle();
  assert.match(d.$("pr-root").textContent, /couldn’t load the FAQs for Barley/);
  assert.equal(d.$("pr-root").all((n) => n.tagName === "BUTTON" && n.textContent === "Save category FAQs")[0].disabled, true);
  fail = false;
  d.buttons("Try again")[0].fire("click"); await settle();
  faqBtn(d, "pr-faq-add").fire("click"); faqSet(d, "pr-faq-q-0", "Q"); faqSet(d, "pr-faq-a-0", "A");
  d.form().fire("submit"); await settle();
  assert.match(d.all("pr-topmsg")[0].textContent, /Only the catalog owner site can change the shared catalog\./);
});
