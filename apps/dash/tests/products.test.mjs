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

const FULL = { image_url: "https://media.test/x.jpg", short_description: "s", long_description: "l", volume_slot: 1, shipping_qty: 2, length_cm: "1", width_cm: "1", height_cm: "1" };
const tileText = (d) => d.all("pr-tile").map((t) => t.textContent);
const stat = (d, label) => d.all("pr-stat").find((b) => b.all((n) => n.classList.contains("pr-stat-label"))[0].textContent === label);
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
  assert.equal(d.all("pr-hero").length, 1, "the masthead");
  assert.match(d.all("pr-hero-eyebrow")[0].textContent, /Nena's Shop/);
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

test("owner header tiles: products, live, hidden, needs a fix; status strip counts", async () => {
  const d = boot({ products: [product("1", FULL), product("2", { ...FULL, is_active: false }), product("3")] });
  await d.show();
  assert.deepEqual(tileText(d), ["Products in catalog3in the shared catalog", "Live on storefront2shown in shops", "Hidden1not in shops", "Needs a fix1missing details"]);
  assert.ok(d.all("pr-hero-kpi").some((t) => t.classList.contains("has-work")), "the Needs a fix tile shows it has work");
  assert.deepEqual(d.all("pr-stat").map((b) => b.textContent), ["3Allreset filters", "2Liveon storefront", "1Hiddennot in shops", "1Incompletemissing details"]);
  assert.deepEqual(Array.from(d.$("pr-status").children).map((o) => o.textContent), ["All status", "Live", "Hidden", "Incomplete"]);
  assert.equal(d.all("pr-stat")[0].getAttribute("aria-pressed"), "true");
  assert.match(d.rows()[2].textContent, /Incomplete/);
  assert.match(d.rows()[2].textContent, /Missing: Photo, Description, Packed size, Shipping details/);
  assert.ok(!/Incomplete/.test(d.rows()[0].textContent));
});

test("status tiles filter, search matches name or code, category narrows, paging at 20, clear filters", async () => {
  const many = [];
  for (let i = 1; i <= 25; i++) many.push(product(String(i), { ...FULL, name: i === 3 ? "Barley Mix" : "Item " + i, category: i === 3 ? "drinks" : "barley", is_active: i % 5 !== 0 }));
  const d = boot({ products: many });
  await d.show();
  assert.equal(d.rows().length, 20);
  assert.match(d.$("pr-root").textContent, /Page 1 of 2/);
  d.all("pr-next")[0].fire("click");
  assert.equal(d.rows().length, 5);
  stat(d, "Hidden").fire("click");
  assert.equal(d.rows().length, 5, "five hidden, back on page 1");
  assert.equal(d.$("pr-status").value, "hidden", "the select follows the tile");
  assert.equal(stat(d, "Hidden").getAttribute("aria-pressed"), "true");
  stat(d, "All").fire("click");
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

test("pure helpers: gaps, counts, filters", () => {
  const u = boot().P.util;
  assert.deepEqual(Array.from(u.gaps(product("1", FULL))), []);
  assert.deepEqual(Array.from(u.gaps(product("1", { ...FULL, image_url: "", category: "", short_description: "", width_cm: null, shipping_qty: null }))),
    ["Photo", "Category", "Description", "Packed size", "Shipping details"]);
  const ps = [product("1", FULL), product("2", { is_active: false })];
  assert.deepEqual({ ...u.counts(ps, true) }, { all: 2, live: 1, hidden: 1, incomplete: 1 });
  assert.equal(u.counts(ps, false).incomplete, 0, "incomplete is the owner's only");
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

test("Manage menu: edit, history, hide and show; hide sends the loaded revision", async () => {
  const d = boot();
  await d.show();
  assert.equal(d.all("pr-menu").length, 0);
  d.all("pr-manage")[0].fire("click");
  assert.equal(d.all("pr-menu").length, 1);
  assert.deepEqual(d.all("pr-menu-item").map((b) => b.textContent), ["Edit details", "History", "Hide from shops"]);
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
  assert.deepEqual(tileText(d), ["Products in catalog2in the shared catalog", "Live on storefront1shown in shops"]);
  assert.deepEqual(d.all("pr-stat").map((b) => b.textContent), ["2Allreset filters", "1Liveon storefront"]);
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
  assert.equal(d.$("pr-f-earnings_rate").value, "40");
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

test("hiding and showing a product updates the masthead tiles and the strip together", async () => {
  const many = [];
  for (let i = 1; i <= 18; i++) many.push(product(String(i), FULL));
  const d = boot({ products: many });
  await d.show();
  const tiles = () => d.all("pr-tile").map((t) => t.all((n) => n.classList.contains("pr-tile-num"))[0].textContent);
  const strip = () => d.all("pr-stat").map((b) => b.all((n) => n.classList.contains("pr-stat-num"))[0].textContent);
  assert.deepEqual(tiles(), ["18", "18", "0", "0"]);
  d.manage(0, "pr-toggle"); await settle();
  assert.deepEqual(tiles(), ["18", "17", "1", "0"]);
  assert.deepEqual(strip(), ["18", "17", "1", "0"]);
  d.manage(0, "pr-toggle"); await settle();
  assert.deepEqual(tiles(), ["18", "18", "0", "0"]);
  assert.deepEqual(strip(), ["18", "18", "0", "0"]);
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
  assert.equal(d.all("pr-menu-sep").length, 2);
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
  /* a status tile and Clear filters redraw the box */
  stat(d, "Live").fire("click");
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
  assert.deepEqual(optionTexts(sel), ["No category", "Barley", "Specialty Drinks", "Essentials", "Beauty"]);
  pickRow(d, "pr-f-category", "No category");
  assert.equal(sel.value, "");
  assert.equal(input.value, "No category");
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
  assert.match(html, /products\.css\?v=20261114prod3/);
  assert.match(html, /products\.js\?v=20261114prod3/);
});

const openAdd = async (opts) => { const d = boot({ products: [], ...(opts || {}) }); await d.show(); d.buttons("Add product")[0].fire("click"); return d; };
const fill = (d, over = {}) => { d.set("code", "x1"); d.set("name", "Mug"); d.set("srp_centavos", "100"); for (const k of Object.keys(over)) d.set(k, over[k]); };
const pickSlot = (d, n, f) => { d.$("pr-f-image-" + n).files = [f]; d.$("pr-f-image-" + n).fire("change"); };
const slot = (d, n) => d.all("pr-islot")[n - 1];
const topmsg = (d) => d.all("pr-topmsg")[0].textContent;
const tabs = (d) => d.all("pr-tab");

test("editor (Add): crumb, title, three tabs with Media Library disabled, five cards in TWCinc's order, a save bar; no TWC-only wording, no stock", async () => {
  const d = await openAdd();
  assert.deepEqual(d.buttons("Back to products").length, 1);
  assert.equal(d.all("pr-formtitle")[0].textContent, "Add a product");
  assert.equal(d.all("pr-formtitle")[0].getAttribute("tabindex"), "-1");
  assert.equal(d.all("pr-tabs")[0].getAttribute("role"), "tablist");
  assert.deepEqual(tabs(d).map((t) => t.textContent), ["Details", "Description", "Media Library Coming soon"]);
  assert.equal(tabs(d)[0].getAttribute("aria-selected"), "true");
  assert.equal(tabs(d)[1].getAttribute("aria-selected"), "false");
  const media = tabs(d)[2];
  assert.equal(media.getAttribute("aria-disabled"), "true");
  assert.equal(media.disabled, true);
  assert.equal(media.listeners.click, undefined, "the Media Library tab does nothing");
  const cards = d.all("pr-card").filter((c) => c.attrs.id && c.attrs.id.indexOf("pr-s-") === 0);
  assert.deepEqual(cards.map((c) => c.all((n) => n.tagName === "H3")[0].textContent), ["Identity", "Photos", "Pricing", "Promo packs", "Shipping"]);
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
  assert.equal(cards[3].getAttribute("aria-disabled"), "true");
  assert.match(cards[3].textContent, /Coming soon/);
  assert.equal(cards[3].all((n) => n.tagName === "INPUT" || n.tagName === "TEXTAREA" || n.tagName === "SELECT").length, 0, "Promo packs has nothing to save");
  for (const k of ["length_cm", "width_cm", "height_cm", "weight_kg", "shipping_qty"]) assert.ok(inCard(4, "pr-f-" + k), k);
  assert.match(cards[4].all((n) => n.classList.contains("pr-pv"))[0].textContent, /Packaging & fee/);
  const bar = d.all("pr-abar")[0];
  assert.equal(bar.all((n) => n.classList.contains("pr-abar-note"))[0].textContent, "Changes are saved and applied immediately.");
  assert.deepEqual(bar.all((n) => n.tagName === "BUTTON").map((b) => b.textContent), ["Save Details"]);
  assert.equal(bar.all((n) => n.tagName === "BUTTON")[0].getAttribute("type"), "submit");
  const text = d.$("pr-root").textContent;
  assert.ok(!/TWC|SKU|Merchant|commission|platform fee|payment fee|you receive|Opening stock|Units on hand|Save draft|Submit for review/i.test(text), "no TWC-only wording, no commission lines, no stock");
  assert.match(d.$("pr-panel-description").textContent, /Save the Details tab first to create the product, then add its description here\./);
  assert.equal(d.$("pr-panel-description").all((n) => n.tagName === "FORM").length, 0, "no description form before the product exists");
  assert.equal(d.$("pr-panel-description").hidden, true);
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
  assert.deepEqual(descForm.all((n) => n.tagName === "BUTTON").map((b) => b.textContent), ["Save Description"]);
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
  assert.equal(d.all("pr-islot").length, 5);
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
  assert.deepEqual({ ...u.previewBody(ok).body }, { volume_slot: null, weight_kg: "0.18", length_cm: "20", width_cm: "10", height_cm: "5.5", shipping_qty: 3 });
  assert.equal(u.previewBody({ ...ok, shipping_qty: "" }).body.shipping_qty, null);
  assert.equal(u.previewBody({ ...ok, volume_slot: "2.5" }).body.volume_slot, "2.5");
  assert.equal(u.previewBody({ ...ok, volume_slot: "x" }).body.volume_slot, null);
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
  assert.deepEqual(asked()[0].body, { volume_slot: null, weight_kg: "0.5", length_cm: "20", width_cm: "10", height_cm: "6", shipping_qty: null });
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

test("Packaging & fee: volume slot goes in the body; a reason beside figures shows under them; a 400 invalid_request shows its field message", async () => {
  const d = boot({ products: [product("1", { length_cm: "20", width_cm: "10", height_cm: "5", weight_kg: "0.5", volume_slot: "3.00" })] });
  d.state.preview = { ncr_centavos: 0, mindanao_centavos: 0, billable_kg: "0.50", reason: "Shipping is free for now." };
  await d.show();
  d.manage(0, "pr-edit");
  await wait(420);
  const asked = () => d.calls.filter((c) => /shipping-preview/.test(c.path));
  assert.equal(asked()[0].body.volume_slot, "3.00");
  const pv = () => d.$("pr-pkg-preview").textContent;
  assert.match(pv(), /To NCR/);
  assert.match(pv(), /Shipping is free for now\./);
  d.set("volume_slot", ""); await wait(420);
  assert.equal(asked().pop().body.volume_slot, null);
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
