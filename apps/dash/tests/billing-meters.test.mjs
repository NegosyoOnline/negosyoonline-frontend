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
  orders: { count: 132, limit: 500, period_start: "2026-11-21T00:00:00+08:00", period_end: "2026-12-21T00:00:00+08:00", period_kind: "billing_month", ...orders } });

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
  assert.equal(periodText("2026-11-21T00:00:00+08:00", "2026-12-21T00:00:00+08:00"), "Nov 21 – Dec 20");
  const d = boot(); await d.show();
  assert.match(d.text(d.card()), /Orders this period Nov 21 – Dec 20/);
});

test("a date range over a year change keeps both years", () => {
  const { periodText } = boot().util;
  assert.equal(periodText("2026-12-21T00:00:00+08:00", "2027-01-21T00:00:00+08:00"), "Dec 21, 2026 – Jan 20, 2027");
  assert.equal(periodText(null, "2027-01-20T00:00:00+08:00"), "");
});

test("accessibility: each bar is a labelled progressbar and the limit line is a status", async () => {
  const d = boot({ meters: ok(meters({ used_bytes: 5000000000 })) }); await d.show();
  const bars = d.has(d.card(), "pu-track");
  assert.deepEqual(bars.map((b) => b.getAttribute("role")), ["progressbar", "progressbar"]);
  for (const b of bars) assert.ok(d.doc.getElementById(b.getAttribute("aria-labelledby")));
  assert.equal(d.has(d.card(), "pu-limit")[0].getAttribute("role"), "status");
});

test("a billing-exempt site shows the card too (calendar month), and still hides it on 404", async () => {
  const x = { ...BILLING, billing_exempt: true };
  let d = boot({ billing: x, meters: ok(meters({}, { period_kind: "calendar_month", period_start: "2026-11-01T00:00:00+08:00", period_end: "2026-12-01T00:00:00+08:00" })) }); await d.show();
  assert.ok(d.list().includes("GET " + B + "meters/"));
  assert.ok(d.card()); assert.match(d.text(d.card()), /this month, not counting cancelled ones\./); assert.match(d.text(d.card()), /Nov 1 – Nov 30/);
  d = boot({ billing: x, meters: { status: 404, body: {} } }); await d.show();
  assert.equal(d.card(), null);
});

test("period end is exclusive: a billing month at midnight, a calendar month, a trial ending mid-day", () => {
  const { periodText } = boot().util;
  assert.equal(periodText("2026-11-21T00:00:00+08:00", "2026-12-21T00:00:00+08:00"), "Nov 21 – Dec 20");
  assert.equal(periodText("2026-11-01T00:00:00+08:00", "2026-12-01T00:00:00+08:00"), "Nov 1 – Nov 30");
  assert.equal(periodText("2026-11-13T00:00:00+08:00", "2026-11-27T15:30:00+08:00"), "Nov 13 – Nov 27");
  assert.equal(periodText("2026-12-21T00:00:00+08:00", "2027-01-21T00:00:00+08:00"), "Dec 21, 2026 – Jan 20, 2027");
  assert.equal(periodText("2026-12-01T00:00:00+08:00", "2027-01-01T00:00:00+08:00"), "Dec 1 – Dec 31");
});

test("source: no innerHTML, and no hard-coded plan numbers in the meter code", () => {
  assert.doesNotMatch(SRC, /innerHTML/);
  assert.doesNotMatch(SRC.slice(SRC.indexOf("function usageCard")), /\b500\b|\b5000000000\b|"5 GB"/);
});

const OVER = { overage_applies: true, overage_centavos_per_order: 500 };
const OVER_LINE = "You have reached your plan’s 500 orders. Orders above 500 are billed at PHP 5 each on your next bill.";
const limitLine = (d) => { const l = d.has(d.card(), "pu-limit"); assert.equal(l.length, 1); return l[0]; };

test("orders at 100% with overage_applies true: the orders line, from the response's limit and price (z8uq9mhpaz)", async () => {
  const d = boot({ meters: ok(meters({}, { count: 500, ...OVER })) }); await d.show();
  assert.equal(limitLine(d).textContent, OVER_LINE);
  assert.ok(limitLine(d).classList.contains("pu-red"));
  assert.ok(d.meter(1).classList.contains("pu-red"));
  const d2 = boot({ meters: ok(meters({}, { count: 1100, limit: 1000, overage_applies: true, overage_centavos_per_order: 700 })) }); await d2.show();
  assert.equal(limitLine(d2).textContent, "You have reached your plan’s 1000 orders. Orders above 1000 are billed at PHP 7 each on your next bill.");
});

test("orders at 100% with overage_applies false or missing: the plain limit line", async () => {
  for (const o of [{ overage_applies: false, overage_centavos_per_order: 500 }, {}, { overage_applies: true }, { overage_centavos_per_order: 500 }]) {
    const d = boot({ meters: ok(meters({}, { count: 520, ...o })) }); await d.show();
    assert.equal(limitLine(d).textContent, "You have reached your plan’s limit.", JSON.stringify(o));
  }
});

test("storage alone at 100% keeps the plain limit line, even when overage applies", async () => {
  const d = boot({ meters: ok(meters({ used_bytes: 5000000000 }, { count: 100, ...OVER })) }); await d.show();
  assert.equal(limitLine(d).textContent, "You have reached your plan’s limit.");
});

test("both bars at 100%: only the orders line", async () => {
  const d = boot({ meters: ok(meters({ used_bytes: 5000000000 }, { count: 500, ...OVER })) }); await d.show();
  assert.equal(limitLine(d).textContent, OVER_LINE);
  assert.doesNotMatch(d.text(d.card()), /plan’s limit\./);
});

test("orders under 100% show no overage line, and the bars stay amber below 100%", async () => {
  const d = boot({ meters: ok(meters({}, { count: 450, ...OVER })) }); await d.show();
  assert.equal(d.has(d.card(), "pu-limit").length, 0);
  assert.ok(d.meter(1).classList.contains("pu-amber"));
});

test("the Billing note: 500 orders included, PHP 5 each above, no share of sales", async () => {
  const d = boot(); await d.show();
  const t = d.text();
  assert.ok(t.includes("Billing is for your site’s plan. It includes 500 orders a month; orders above 500 are PHP 5 each. NegosyoOnline never takes a share of your sales."));
  assert.doesNotMatch(t, /Nothing is charged per order or per sale/);
});


/* ---------- V-1 (ClickUp z8uq9mkfkd): the third bar, Video delivery, only while the answer has a `video` block ---------- */
const withVideo = (video, o = {}, orders = {}) => ok({ ...meters(o, orders), video });
const VID = (over = {}) => ({ used_bytes: 12000000000, limit_bytes: 50000000000, read_at: "2026-11-26T05:30:00+08:00", period_start: "2026-11-21T00:00:00+08:00", period_end: "2026-12-21T00:00:00+08:00", ...over });

test("video: no `video` key, the card is exactly as today (two bars, no video wording)", async () => {
  const d = boot(); await d.show();
  assert.equal(d.has(d.card(), "pu-track").length, 2);
  assert.doesNotMatch(d.text(d.card()), /Video delivery|Not measured/);
});

test("video: a third bar, Video delivery, after Orders, with the draft sub-line, the period and no price wording", async () => {
  const d = boot({ meters: withVideo(VID()) }); await d.show();
  const c = d.card(), t = d.text(c);
  assert.equal(d.has(c, "pu-track").length, 3);
  assert.match(t, /Video delivery Nov 21 – Dec 20/); assert.match(t, /12\.0 GB of 50 GB \(24%\)/);
  assert.match(t, /Video watched on your store this billing month\./);
  assert.equal(d.has(d.meter(2), "pu-fill")[0].style.width, "24%");
  assert.ok(!d.meter(2).classList.contains("pu-amber") && !d.meter(2).classList.contains("pu-red"));
  assert.equal(d.has(c, "pu-limit").length, 0);
  assert.doesNotMatch(t, /upgrade|PHP|charge|price|billed/i);
  assert.equal(d.has(c, "pu-track")[2].getAttribute("role"), "progressbar");
  assert.ok(d.doc.getElementById(d.has(c, "pu-track")[2].getAttribute("aria-labelledby")));
});

test("video: amber from 80% (and 79% stays normal), red at 100% with the one limit line", async () => {
  let d = boot({ meters: withVideo(VID({ used_bytes: 39900000000 })) }); await d.show();
  assert.ok(!d.meter(2).classList.contains("pu-amber"));
  d = boot({ meters: withVideo(VID({ used_bytes: 40000000000 })) }); await d.show();
  assert.ok(d.meter(2).classList.contains("pu-amber")); assert.equal(d.has(d.card(), "pu-limit").length, 0);
  d = boot({ meters: withVideo(VID({ used_bytes: 50000000000 })) }); await d.show();
  assert.ok(d.meter(2).classList.contains("pu-red"));
  const lines = d.has(d.card(), "pu-limit"); assert.equal(lines.length, 1);
  assert.equal(lines[0].textContent, "You have reached your plan\u2019s limit.");
  assert.equal(d.has(d.card(), "pu-fill")[2].style.width, "100%");
});

test("video: read_at null says Not measured yet with an empty bar, no percent and no limit line", async () => {
  const d = boot({ meters: withVideo(VID({ used_bytes: 0, read_at: null })) }); await d.show();
  const m = d.meter(2), t = d.text(m);
  assert.match(t, /Not measured yet/); assert.doesNotMatch(t, /%|GB/);
  assert.equal(d.has(m, "pu-fill")[0].style.width, "0%");
  assert.equal(d.has(m, "pu-track")[0].getAttribute("aria-valuetext"), "Not measured yet");
  assert.equal(d.has(d.card(), "pu-limit").length, 0);
});

test("video: a malformed block is left out and the card stays as it was", async () => {
  for (const v of [{}, { used_bytes: 1, limit_bytes: 0, read_at: "x" }, { used_bytes: "a", limit_bytes: 5, read_at: "x" }, { used_bytes: -1, limit_bytes: 5, read_at: "x" }, "x", 5]) {
    const d = boot({ meters: withVideo(v) }); await d.show();
    assert.ok(d.card(), JSON.stringify(v)); assert.equal(d.has(d.card(), "pu-track").length, 2, JSON.stringify(v));
  }
});

test("video: the two existing bars are unchanged when the video bar is shown", async () => {
  const d = boot({ meters: withVideo(VID()) }); await d.show();
  assert.match(d.text(d.card()), /1\.2 GB of 5 GB \(24%\)/); assert.match(d.text(d.card()), /132 of 500 \(26%\)/);
  assert.match(d.text(d.card()), /Images and videos in your Media Library\./);
});
