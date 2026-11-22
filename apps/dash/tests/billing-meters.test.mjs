/* The Plan usage card on the Billing page (billing.js, ClickUp z8uq9mhk1n): media storage and orders against the plan's
   limits, from GET /sites/{id}/billing/meters/. Driven like billing-documents.test.mjs: the stand-in document and a recorded fetch. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDocument } from "./dom.mjs";

const JS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "assets", "js");
const read = (f) => fs.readFileSync(path.join(JS, f), "utf8");
const SRC = read("billing.js");
const A = "site_aaaaaaaaaaaaaaaaaaaa";
const B = `/sites/${A}/billing/`;
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 8; i++) await tick(); };

const BILLING = { state: "active", storefront_served: true, billing_only: false,
  plan: { name: "NegosyoOnline Monthly", price_centavos: 249900, currency: "PHP", interval: "month", trial_days: 14 },
  trial_start_at: "2026-11-01T00:00:00+08:00", trial_end_at: "2026-11-15T00:00:00+08:00",
  current_cycle: { sequence: 1, start_at: "2026-11-21T00:00:00+08:00", end_at: "2026-12-20T00:00:00+08:00", settlement: "paid" },
  next_due_at: "2026-12-20T00:00:00+08:00", attention_ends_at: null, cancel_requested_at: null, service_end_at: null, download_until: null, deletion_due_at: null,
  pay_by: null, clocks_started: false, billing_exempt: false, outstanding_centavos: 0, can_cancel: true, can_reactivate: false };
const PAY = { payable: false, not_payable_reason: "paid_ahead", payable_from: null, offers: [], usage: { centavos: 0, lines: 0, payable_alone: false },
  transfer_accounts: [], under_review: null, latest: null, proof_rules: { max_bytes: 5242880, content_types: ["image/jpeg"] } };
const ok = (body) => ({ status: 200, body });
const err = (status) => ({ status, body: { error: { code: "x", message: "x" } } });
const meters = (over = {}, orders = {}) => ({ storage: { used_bytes: 1200000000, limit_bytes: 5000000000, ...over },
  orders: { count: 132, limit: 500, period_start: "2026-11-21T00:00:00+08:00", period_end: "2026-12-20T00:00:00+08:00", period_kind: "billing_month", ...orders } });

function boot(init = {}) {
  const doc = makeDocument(), calls = [];
  const page = doc.body.appendChild(doc.createElement("div"));
  for (const id of ["bl-root", "bl-live", "bl-dialog-slot", "h-settings-billing"]) { const n = doc.createElement("div"); n.setAttribute("id", id); page.appendChild(n); }
  const st = { meters: ok(meters()), billing: BILLING, ...init };
  const fetch = (url, opts) => {
    const p = url.replace("http://api.test/v1", "");
    calls.push({ method: opts.method, path: p });
    const key = opts.method + " " + p;
    let a = err(404);
    if (key === "GET /sites/") a = ok({ items: [{ id: A, template: "sante", business_name: "Live4More" }], next_cursor: null });
    else if (key === "GET " + B) a = ok(st.billing);
    else if (key === "GET " + B + "payment/") a = ok(PAY);
    else if (key === "GET " + B + "payments/?limit=20") a = ok({ items: [], next_cursor: null });
    else if (key === "GET " + B + "meters/") { if (st.meters === "reject") return Promise.reject(new Error("network")); a = st.meters; }
    return Promise.resolve({ ok: a.status >= 200 && a.status < 300, status: a.status, json: () => Promise.resolve(a.body) });
  };
  const location = { search: "", pathname: "/settings/billing/", replace() {}, assign() {} };
  const history = { pushState() {}, replaceState() {} };
  const storage = { getItem: () => null, removeItem() {}, setItem() {} };
  const window = { NO_CONFIG: { apiBase: "http://api.test/v1", siteUrl: "http://www.test" }, addEventListener() {}, removeEventListener() {}, innerHeight: 800 };
  const context = vm.createContext({ window, document: doc, location, history, console, URLSearchParams, URL: {}, Promise, setTimeout, clearTimeout, Intl, FormData, File, Blob, Date,
    setInterval: () => 1, clearInterval() {}, localStorage: storage, sessionStorage: storage, requestAnimationFrame() {}, fetch, navigator: {} });
  vm.runInContext(read("app.js"), context, { filename: "app.js" });
  vm.runInContext(SRC, context, { filename: "billing.js" });
  window.NODash.toast = () => {};
  window.NODash.refreshAccount = () => {};
  const root = doc.getElementById("bl-root");
  const has = (n, c) => n.all((x) => x.classList.contains(c));
  const card = () => has(root, "bl-card").find((c) => has(c, "bl-h2")[0] && has(c, "bl-h2")[0].textContent === "Plan usage") || null;
  return { doc, calls, root, has, card, util: window.NOBilling.util, text: (n = root) => n.textContent,
    list: () => calls.map((c) => c.method + " " + c.path),
    meter: (i) => has(card(), "pu-meter")[i],
    async show() { window.NOBilling.show(); await settle(); } };
}

test("normal: both meters under 80%, no limit line, the approved wording", async () => {
  const d = boot(); await d.show();
  assert.ok(d.list().includes("GET " + B + "meters/"));
  const c = d.card(); assert.ok(c);
  const t = d.text(c);
  assert.match(t, /Media storage/); assert.match(t, /1\.2 GB of 5 GB \(24%\)/);
  assert.match(t, /Images and videos in your Media Library\./);
  assert.match(t, /Orders this period/); assert.match(t, /132 of 500 \(26%\)/);
  assert.match(t, /Orders placed on your store this billing month, not counting cancelled ones\./);
  assert.equal(d.has(c, "pu-amber").length, 0); assert.equal(d.has(c, "pu-red").length, 0);
  assert.equal(d.has(c, "pu-limit").length, 0);
  assert.equal(d.has(c, "pu-fill")[0].style.width, "24%"); assert.equal(d.has(c, "pu-fill")[1].style.width, "26%");
  assert.doesNotMatch(t, /video bar|upgrade|PHP|charge|price/i);
  assert.equal(d.has(c, "pu-track").length, 2, "no video bar: two bars only");
});

test("the card sits under the Plan card, ahead of Payment history", async () => {
  const d = boot(); await d.show();
  const titles = d.has(d.root, "bl-h2").map((x) => x.textContent);
  assert.ok(titles.indexOf("Plan usage") > titles.indexOf("Plan"));
  assert.ok(titles.indexOf("Plan usage") < titles.indexOf("Payment history") || titles.indexOf("Payment history") === -1);
});

test("amber from 80%: the bar and percent turn amber, no limit line", async () => {
  const d = boot({ meters: ok(meters({ used_bytes: 4100000000 }, { count: 410 })) }); await d.show();
  const c = d.card(), t = d.text(c);
  assert.match(t, /4\.1 GB of 5 GB \(82%\)/); assert.match(t, /410 of 500 \(82%\)/);
  assert.ok(d.meter(0).classList.contains("pu-amber")); assert.ok(d.meter(1).classList.contains("pu-amber"));
  assert.equal(d.has(c, "pu-limit").length, 0);
});

test("79% stays normal; exactly 80% is amber", async () => {
  let d = boot({ meters: ok(meters({}, { count: 395 })) }); await d.show();
  assert.ok(!d.meter(1).classList.contains("pu-amber"));
  d = boot({ meters: ok(meters({}, { count: 400 })) }); await d.show();
  assert.ok(d.meter(1).classList.contains("pu-amber"));
});

test("red at 100% and over: the bar is full and red, one limit line at the bottom", async () => {
  const d = boot({ meters: ok(meters({ used_bytes: 5000000000 }, { count: 512 })) }); await d.show();
  const c = d.card(), t = d.text(c);
  assert.match(t, /5\.0 GB of 5 GB \(100%\)/); assert.match(t, /512 of 500 \(102%\)/);
  assert.ok(d.meter(0).classList.contains("pu-red")); assert.ok(d.meter(1).classList.contains("pu-red"));
  assert.equal(d.has(c, "pu-fill")[1].style.width, "100%", "never wider than the track");
  const lines = d.has(c, "pu-limit"); assert.equal(lines.length, 1);
  assert.equal(lines[0].textContent, "You have reached your plan’s limit.");
  assert.equal(c.children[c.children.length - 1], lines[0], "last thing in the card");
});

test("one meter at the limit is enough for the limit line", async () => {
  const d = boot({ meters: ok(meters({}, { count: 500 })) }); await d.show();
  assert.ok(d.meter(1).classList.contains("pu-red")); assert.ok(!d.meter(0).classList.contains("pu-red"));
  assert.equal(d.has(d.card(), "pu-limit").length, 1);
});

test("the limits come from the response, not from the page", async () => {
  const d = boot({ meters: ok(meters({ limit_bytes: 10000000000, used_bytes: 2500000000 }, { limit: 1000, count: 100 })) }); await d.show();
  assert.match(d.text(d.card()), /2\.5 GB of 10 GB \(25%\)/); assert.match(d.text(d.card()), /100 of 1000 \(10%\)/);
});

test("404 hides the card quietly: no card, no error box, the rest of the page unchanged", async () => {
  const d = boot({ meters: { status: 404, body: { error: { code: "not_found", message: "Not found." } } } }); await d.show();
  assert.equal(d.card(), null);
  assert.doesNotMatch(d.text(), /Plan usage|couldn’t load/);
  assert.ok(d.has(d.root, "bl-card").length >= 2, "Plan and Payment cards still there");
  assert.equal(d.has(d.root, "bl-panel-err").length, 0);
});

test("a server error, a network failure and a malformed answer also hide it", async () => {
  for (const m of [{ status: 500, body: {} }, "reject", ok({}), ok({ storage: { used_bytes: 1, limit_bytes: 0 }, orders: { count: 1, limit: 500 } })]) {
    const d = boot({ meters: m }); await d.show();
    assert.equal(d.card(), null, JSON.stringify(m));
    assert.equal(d.has(d.root, "bl-panel-err").length, 0);
  }
});

test("the three period kinds: billing month, trial, calendar month", async () => {
  const want = { billing_month: /this billing month, not counting cancelled ones\./, trial: /Orders placed on your store during your trial, not counting cancelled ones\./,
    calendar_month: /Orders placed on your store this month, not counting cancelled ones\./ };
  for (const [kind, re] of Object.entries(want)) {
    const d = boot({ meters: ok(meters({}, { period_kind: kind })) }); await d.show();
    assert.match(d.text(d.card()), re, kind);
  }
});

test("GB formatting: one decimal place, 1 GB = 1,000,000,000 bytes, a whole limit without .0", () => {
  const { gbText } = boot().util;
  assert.equal(gbText(1200000000), "1.2 GB"); assert.equal(gbText(0), "0.0 GB"); assert.equal(gbText(5000000000), "5.0 GB");
  assert.equal(gbText(5000000000, true), "5 GB"); assert.equal(gbText(10000000000, true), "10 GB"); assert.equal(gbText(7500000000, true), "7.5 GB");
  assert.equal(gbText(1073741824), "1.1 GB", "binary GiB is not used"); assert.equal(gbText(49999999), "0.0 GB"); assert.equal(gbText(50000000), "0.1 GB");
});

test("percent rounds down and the limit must be positive", () => {
  const { pctOf } = boot().util;
  assert.equal(pctOf(132, 500), 26); assert.equal(pctOf(499, 500), 99); assert.equal(pctOf(500, 500), 100); assert.equal(pctOf(512, 500), 102);
  assert.equal(pctOf(0, 500), 0); assert.equal(pctOf(1, 0), null);
});

test("a date range in the same year: no year, the dash way", async () => {
  const { periodText } = boot().util;
  assert.equal(periodText("2026-11-21T00:00:00+08:00", "2026-12-20T00:00:00+08:00"), "Nov 21 – Dec 20");
  const d = boot(); await d.show();
  assert.match(d.text(d.card()), /Orders this period Nov 21 – Dec 20/);
});

test("a date range over a year change keeps both years", () => {
  const { periodText } = boot().util;
  assert.equal(periodText("2026-12-21T00:00:00+08:00", "2027-01-20T00:00:00+08:00"), "Dec 21, 2026 – Jan 20, 2027");
  assert.equal(periodText(null, "2027-01-20T00:00:00+08:00"), "");
});

test("accessibility: each bar is a labelled progressbar and the limit line is a status", async () => {
  const d = boot({ meters: ok(meters({ used_bytes: 5000000000 })) }); await d.show();
  const bars = d.has(d.card(), "pu-track");
  assert.deepEqual(bars.map((b) => b.getAttribute("role")), ["progressbar", "progressbar"]);
  for (const b of bars) assert.ok(d.doc.getElementById(b.getAttribute("aria-labelledby")));
  assert.equal(d.has(d.card(), "pu-limit")[0].getAttribute("role"), "status");
});

test("a billing-exempt site shows no usage card and asks for no meters", async () => {
  const d = boot({ billing: { ...BILLING, billing_exempt: true } }); await d.show();
  assert.equal(d.card(), null);
});

test("source: no innerHTML, and no hard-coded plan numbers in the meter code", () => {
  assert.doesNotMatch(SRC, /innerHTML/);
  assert.doesNotMatch(SRC.slice(SRC.indexOf("function usageCard")), /\b500\b|\b5000000000\b|"5 GB"/);
});
