/* The Santé Journey panel (ClickUp z8uq9meyqk, journey.js: /journey/). Driven like media.test.mjs: the real scripts run in a vm with the
   stand-in document from dom.mjs and a recorded fetch that plays GET /sites/{id}/pack/journey/. Fake data only. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDocument } from "./dom.mjs";

const JS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "assets", "js");
const read = (f) => fs.readFileSync(path.join(JS, f), "utf8");
const HTML = fs.readFileSync(path.join(JS, "..", "..", "index.html"), "utf8");
const CSS = fs.readFileSync(path.join(JS, "..", "css", "journey.css"), "utf8");
const A = "site_aaaaaaaaaaaaaaaaaaaa";
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 12; i++) await tick(); };

const payload = (over = {}) => ({
  period: "30d", since: "2026-10-17T00:00:00Z", generated_at: "2026-11-16T04:00:00Z",
  meta: { connected: true, events: [{ name: "InitiateCheckout", sent: 12, failed: 1 }, { name: "Purchase", sent: 3, failed: 0 }] },
  stages: [
    { key: "dashboard_access", count: 1 }, { key: "checkout_started", count: 20 }, { key: "order_placed", count: 9 }, { key: "proof_submitted", count: 6 },
    { key: "payment_verified", count: 4 }, { key: "onboarding", count: 4, breakdown: [{ status: "ready_to_register", count: 1 }, { status: "registered", count: 3 }] },
  ],
  attribution: { per_person: "not_recorded" },
  recent: [{ order_id: "ord_1", order_number: "PK-0001", placed_at: "2026-11-15T03:00:00Z", payment_status: "verified", registration_status: "registered", dashboard_access: true },
    { order_id: "ord_2", order_number: "PK-0002", placed_at: "2026-11-15T05:00:00Z", payment_status: "pending_review", registration_status: null, dashboard_access: false }],
  ...over,
});

const prospectsBody = (over = {}) => ({
  page: 1, page_size: 25, pages: 1, total: 5,
  stage_counts: { all: 5, new_lead: 2, landing_page: 0, start_watching: 0, done_watching: 0, added_to_cart: 1, checked_out: 1, account_setup: 1, activated: 0 },
  results: [
    { kind: "order", name: "Ana Reyes", order_number: "PK-0001", order_id: "ord_1", source: "pack_page", stage: "account_setup", registration_status: "ready_to_register", video_percent: 90, mobile: "", email: "", last_activity: "2026-11-15T03:00:00Z" },
    { kind: "order", name: "Ben Cruz", order_number: "PK-0002", order_id: "ord_2", source: "pack_page", stage: "checked_out", registration_status: null, video_percent: null, mobile: "", email: "", last_activity: "2026-11-14T03:00:00Z" },
    { kind: "visit", name: "Cora Cart", order_number: null, order_id: null, source: "pack_page", stage: "added_to_cart", registration_status: null, video_percent: 50, mobile: "09171234567", email: "cora@buyer.test", last_activity: "2026-11-14T01:00:00Z" },
    { kind: "inquiry", name: "Chat Person", order_number: null, order_id: null, source: "webchat", stage: "new_lead", registration_status: null, video_percent: null, mobile: "", email: "", last_activity: "2026-11-13T03:00:00Z" },
    { kind: "inquiry", name: "", order_number: null, order_id: null, source: "facebook", stage: "new_lead", registration_status: null, video_percent: null, mobile: "", email: "", last_activity: "2026-11-12T03:00:00Z" },
  ],
  ...over,
});

function boot({ answer = () => ({ status: 200, body: payload() }), prospects = () => ({ status: 200, body: prospectsBody() }), siteId = A } = {}) {
  const doc = makeDocument(), calls = [];
  const page = doc.body.appendChild(doc.createElement("div"));
  for (const id of ["jr-root", "jr-live"]) { const n = doc.createElement("div"); n.setAttribute("id", id); page.appendChild(n); }
  const nav = [0, 1, 2].map(() => { const a = doc.createElement("a"); a.setAttribute("data-journey-nav", ""); a.hidden = true; page.appendChild(a); return a; });
  doc.querySelectorAll = (sel) => (sel === "[data-journey-nav]" ? nav : []);
  const fetch = (url) => {
    const p = url.replace("http://api.test/v1", "");
    calls.push(p);
    let a = { status: 404, body: { error: { code: "not_found", message: "Not found." } } };
    if (p === "/sites/") a = { status: 200, body: { items: [{ id: siteId, template: "sante" }], next_cursor: null } };
    else if (p.startsWith(`/sites/${A}/pack/journey/prospects/`)) a = prospects(p);
    else if (p.startsWith(`/sites/${A}/pack/journey/`)) a = answer(p);
    return Promise.resolve({ ok: a.status >= 200 && a.status < 300, status: a.status, json: () => Promise.resolve(a.body) });
  };
  const window = { NO_CONFIG: { apiBase: "http://api.test/v1", siteUrl: "http://www.test" }, addEventListener() {}, removeEventListener() {}, innerHeight: 800 };
  const storage = { getItem: () => null, removeItem() {}, setItem() {} };
  const context = vm.createContext({ window, document: doc, location: { search: "", pathname: "/journey/", replace() {}, assign() {} }, history: {}, console, URLSearchParams,
    Promise, setTimeout, clearTimeout, Intl, Date, localStorage: storage, sessionStorage: storage, requestAnimationFrame() {}, fetch });
  vm.runInContext(read("app.js"), context, { filename: "app.js" });
  vm.runInContext(read("journey.js"), context, { filename: "journey.js" });
  const $ = (id) => doc.getElementById(id);
  return { doc, calls, nav, window, $, root: () => $("jr-root"), text: () => $("jr-root").textContent,
    async open() { window.NOJourney.show(); await settle(); } };
}

test("index.html: the Journey view, root, script and stylesheet are in the page and every Journey link starts hidden", () => {
  for (const id of ["view-journey", "h-journey", "jr-root", "jr-live"]) assert.ok(HTML.includes(`id="${id}"`), id);
  assert.ok(HTML.includes("/assets/js/journey.js") && HTML.includes("/assets/css/journey.css"));
  const links = [...HTML.matchAll(/<a\b[^>]*href="\/journey\/"[^>]*>/g)].map((m) => m[0]);
  assert.equal(links.length, 2);
  for (const l of links) assert.ok(/data-journey-nav/.test(l) && /\bhidden\b/.test(l), l);
});

test("dashboard.js: the route, the view name, the hooks and the probe", () => {
  const dash = read("dashboard.js");
  assert.match(dash, /"\/journey\/": \{ view: "journey"/);
  assert.match(dash, /"media", "journey"/);
  assert.match(dash, /JY\.show\(\)/);
  assert.match(dash, /JY\.hide\(\)/);
  assert.match(dash, /window\.NOJourney\.probe\(\)/);
});

test("it asks the API for 30 days of this site by default and shows the stages in funnel order", async () => {
  const d = boot(); await d.open();
  assert.ok(d.calls.includes(`/sites/${A}/pack/journey/?period=30d`));
  const t = d.text();
  const at = ["Checkout started", "Order placed", "Payment proof submitted", "Payment verified", "Registration", "Member dashboard access"].map((s) => t.indexOf(s));
  assert.ok(at.every((n) => n >= 0), "all six steps show");
  assert.deepEqual([...at].sort((a, b) => a - b), at, "in funnel order, whatever order the API sends");
  assert.ok(t.includes("Ready to register") && t.includes("Registered"), "the onboarding breakdown");
  assert.ok(d.nav.every((n) => n.hidden === false), "the links show once the API answered");
});

test("the period box is the house dropdown, shows its default and re-reads on change", async () => {
  const d = boot(); await d.open();
  const sel = d.$("jr-period");
  assert.ok(sel && sel.classList.contains("jr-combo-native"));
  const input = d.root().all((n) => n.tagName === "INPUT")[0];
  assert.equal(input.value, "Last 30 days");
  assert.equal(input.getAttribute("role"), "combobox");
  assert.deepEqual(sel.children.map((o) => o.textContent), ["Last 7 days", "Last 30 days", "All time"]);
  sel.value = "7d"; sel.fire("change"); await settle();
  assert.ok(d.calls.includes(`/sites/${A}/pack/journey/?period=7d`));
  assert.equal(d.root().all((n) => n.tagName === "INPUT")[0].value, "Last 7 days");
});

test("Meta: labelled as events, counts shown, and the per-person line is honest", async () => {
  const d = boot(); await d.open();
  const t = d.text();
  assert.ok(t.includes("Events sent to Meta") && t.includes("not counts of people"));
  assert.ok(t.includes("InitiateCheckout") && t.includes("Purchase"));
  assert.ok(t.includes("Per-person Meta attribution is not recorded"));
  assert.ok(!/ROAS|return on|conversion rate|performance/i.test(t), "no claim about ad results");
});

test("Meta not connected is said plainly", async () => {
  const d = boot({ answer: () => ({ status: 200, body: payload({ meta: { connected: false, events: [] } }) }) }); await d.open();
  assert.ok(d.text().includes("Meta is not connected."));
});

test("empty states: no orders, no steps reached, no events", async () => {
  const d = boot({ answer: () => ({ status: 200, body: payload({ stages: [{ key: "checkout_started", count: 0 }], recent: [], meta: { connected: true, events: [] } }) }) }); await d.open();
  const t = d.text();
  assert.ok(t.includes("No orders in this period yet."));
  assert.ok(t.includes("No one has reached these steps in this period yet."));
  assert.ok(t.includes("No events were sent to Meta in this period."));
});

test("recent orders link to the existing order detail and say registration and member dashboard plainly", async () => {
  const d = boot(); await d.open();
  const links = d.root().all((n) => n.tagName === "A" && n.classList.contains("jr-order-link")).map((a) => a.getAttribute("href"));
  assert.deepEqual(links, ["/orders/?order=ord_1", "/orders/?order=ord_2"]);
  const t = d.text();
  assert.ok(t.includes("Registration: No registration yet") && t.includes("Member dashboard: not yet") && t.includes("Member dashboard: signed in"));
});

test("a 404 says the Journey is not available and keeps the links hidden; an error offers Try again", async () => {
  let d = boot({ answer: () => ({ status: 404, body: { error: { code: "not_found", message: "Not found." } } }) }); await d.open();
  assert.ok(d.text().includes("The Journey is not available yet"));
  assert.ok(d.nav.every((n) => n.hidden === true));
  d = boot({ answer: () => ({ status: 500, body: { error: { code: "server_error", message: "Boom." } } }) }); await d.open();
  assert.ok(d.root().all((n) => n.tagName === "BUTTON").some((b) => b.textContent === "Try again"));
});

test("probe shows the links only on a 200", async () => {
  const d = boot(); d.window.NOJourney.probe(); await settle();
  assert.ok(d.nav.every((n) => n.hidden === false));
  const e = boot({ answer: () => ({ status: 404, body: {} }) }); e.window.NOJourney.probe(); await settle();
  assert.ok(e.nav.every((n) => n.hidden === true));
});

test("the dropdown focus is the light blue, never gold", () => {
  assert.ok(!/#f2d99b|#c59a3b|#e8c16a|var\(--gold\)|var\(--cat\)/i.test(CSS));
  assert.match(CSS, /\.jr-combo-box:focus-within \{ border-color: var\(--link\)/);
});

test("the Steps reached lead and the Checkout started hint are plain and accurate", async () => {
  for (const period of ["30d", "all"]) {
    const d = boot({ answer: () => ({ status: 200, body: payload({ period }) }) }); await d.open();
    const t = d.text();
    assert.ok(t.includes("How many reached each step in the period you chose. Each step is counted on its own, so a later step can be larger or smaller than the one before it."));
    assert.ok(!/in last 30 days|in all time/.test(t));
    assert.ok(t.includes("Checkouts started on your Membership Pack page") && !t.includes("People who began checking out"));
  }
});

test("Prospects: the card, the approved lead, the search, the stage chips with counts and the columns", async () => {
  const d = boot(); await d.open();
  assert.ok(d.calls.includes(`/sites/${A}/pack/journey/prospects/?page=1`));
  const t = d.text();
  assert.ok(t.includes("Prospects") && t.includes("People with a Membership Pack order or a message to your site, newest activity first."));
  assert.ok(d.$("jr-pr-q") && d.$("jr-pr-q").getAttribute("placeholder") === "Search by name or order number");
  const chips = d.$("jr-pr-chips").all((n) => n.tagName === "BUTTON").map((b) => b.textContent);
  assert.deepEqual(chips, ["All5", "New Lead2", "Landing Page0", "Start Watching0", "Done Watching0", "Add to Cart1", "Checked Out1", "Account Setup1", "Activated0"]);
  for (const w of ["Membership Pack page", "Facebook via Pancake", "Website chat", "Ready to register", "No name", "Order PK-0001"]) assert.ok(t.includes(w), w);
  const heads = d.$("jr-pr-body").all((n) => n.tagName === "TH").map((n) => n.textContent);
  assert.deepEqual(heads, ["Prospect", "Source", "Video progress", "Stage", "Last activity", "Action"]);
  for (const w of ["90%", "50%", "09171234567", "cora@buyer.test", "Account Setup", "Add to Cart", "New Lead"]) assert.ok(d.$("jr-pr-body").textContent.includes(w), w);
});

test("Prospects: an unknown video progress (null) shows a dash with no bar, on order rows as on inquiry rows; a known 0 shows 0%", async () => {
  const d = boot(); await d.open();
  const body = d.$("jr-pr-body");
  const dashes = body.all((n) => n.classList && n.classList.contains("jr-pr-none")).length;
  assert.equal(dashes, 3, "Ben Cruz (order, no visit) and the two inquiry rows");
  assert.equal(body.all((n) => n.classList && n.classList.contains("jr-pr-video")).length, 2, "only Ana and Cora have a bar");
});

test("Prospects: Open order only on order rows; no chat button; the blank name stays a placeholder", async () => {
  const d = boot(); await d.open();
  const links = d.$("jr-pr-body").all((n) => n.tagName === "A").map((a) => a.getAttribute("href"));
  assert.deepEqual(links, ["/orders/?order=ord_1", "/orders/?order=ord_2"]);
  assert.ok(!/chat|message prospect/i.test(d.$("jr-pr-body").all((n) => n.tagName === "BUTTON").map((b) => b.textContent).join(" ")));
  const u = d.window.NOJourney.util;
  assert.equal(u.initials("ana reyes cruz"), "AR"); assert.equal(u.initials(""), "?");
});

test("Prospects: a stage chip re-reads with that stage; search re-reads after a pause with q and page 1", async () => {
  const d = boot(); await d.open();
  const chip = d.$("jr-pr-chips").all((n) => n.tagName === "BUTTON").find((b) => b.textContent.startsWith("New Lead"));
  chip.fire("click"); await settle();
  assert.ok(d.calls.includes(`/sites/${A}/pack/journey/prospects/?page=1&stage=new_lead`));
  assert.equal(d.$("jr-pr-chips").all((n) => n.tagName === "BUTTON").find((b) => b.textContent.startsWith("New Lead")).getAttribute("aria-pressed"), "true");
  const q = d.$("jr-pr-q"); q.value = "  PK-0001 "; q.fire("input");
  await new Promise((r) => setTimeout(r, 400)); await settle();
  assert.ok(d.calls.includes(`/sites/${A}/pack/journey/prospects/?page=1&stage=new_lead&q=PK-0001`));
});

test("Prospects: paging, empty and error states; the period change does not reload them", async () => {
  let d = boot({ prospects: () => ({ status: 200, body: prospectsBody({ page: 1, pages: 3, total: 60 }) }) }); await d.open();
  assert.ok(d.text().includes("Page 1 of 3") && d.text().includes("60 people"));
  d.root().all((n) => n.tagName === "BUTTON").find((b) => b.textContent === "Next").fire("click"); await settle();
  assert.ok(d.calls.includes(`/sites/${A}/pack/journey/prospects/?page=2`));
  const before = d.calls.filter((c) => c.includes("/prospects/")).length;
  const sel = d.$("jr-period"); sel.value = "7d"; sel.fire("change"); await settle();
  assert.equal(d.calls.filter((c) => c.includes("/prospects/")).length, before);
  d = boot({ prospects: () => ({ status: 200, body: prospectsBody({ results: [], total: 0, stage_counts: { all: 0 } }) }) }); await d.open();
  assert.ok(d.text().includes("No prospects yet."));
  d = boot({ prospects: () => ({ status: 500, body: { error: { code: "x", message: "Boom." } } }) }); await d.open();
  assert.ok(d.text().includes("We could not load the prospects.") && d.text().includes("Boom."));
});

test("Prospects: the CSS has the light-blue focus and no gold", () => {
  assert.match(CSS, /\.jr-pr-q:focus[^}]*border-color: var\(--link\)/);
  assert.ok(!/#f2d99b|#c59a3b|#e8c16a|var\(--gold\)/i.test(CSS));
});
