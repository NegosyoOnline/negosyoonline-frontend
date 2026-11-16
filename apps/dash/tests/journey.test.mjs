/* The Santé Prospect List (ClickUp z8uq9meyqk and z8uq9mfw14, journey.js: /prospect-list/). Driven like media.test.mjs: the real scripts run in a vm with the
   stand-in document from dom.mjs and a recorded fetch that plays GET /sites/{id}/pack/journey/prospects/. Fake data only. */
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

const prospectsBody = (over = {}) => ({
  page: 1, page_size: 25, pages: 1, total: 5,
  stage_counts: { all: 5, new_lead: 2, landing_page: 0, start_watching: 0, done_watching: 0, added_to_cart: 1, checked_out: 1, account_setup: 1, activated: 0 },
  results: [
    { kind: "order", name: "Ana Reyes", order_number: "PK-0001", order_id: "ord_1", source: "pack_page", stage: "account_setup", registration_status: "ready_to_register", video_percent: 90, mobile: "+639170000009", email: "coach.test@example.test", last_activity: "2026-11-15T03:00:00Z", placed_at: "2026-11-15T03:00:00Z", payment_status: "verified", price_centavos: 148800, currency: "PHP" },
    { kind: "order", name: "Ben Cruz", order_number: "PK-0002", order_id: "ord_2", source: "pack_page", stage: "checked_out", registration_status: null, video_percent: null, mobile: "+639170000010", email: "", last_activity: "2026-11-14T03:00:00Z", placed_at: "2026-11-14T03:00:00Z", payment_status: "pending_review", price_centavos: 148800, currency: "PHP" },
    { kind: "visit", name: "Cora Cart", order_number: null, order_id: null, source: "pack_page", stage: "added_to_cart", registration_status: null, video_percent: 50, mobile: "09171234567", email: "cora@buyer.test", last_activity: "2026-11-14T01:00:00Z" },
    { kind: "inquiry", name: "Chat Person", order_number: null, order_id: null, source: "webchat", stage: "new_lead", registration_status: null, video_percent: null, mobile: "", email: "", last_activity: "2026-11-13T03:00:00Z" },
    { kind: "inquiry", name: "", order_number: null, order_id: null, source: "facebook", stage: "new_lead", registration_status: null, video_percent: null, mobile: "", email: "", last_activity: "2026-11-12T03:00:00Z" },
  ],
  ...over,
});

function boot({ prospects = () => ({ status: 200, body: prospectsBody() }), siteId = A } = {}) {
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

const btns = (n, label) => n.all((x) => x.tagName === "BUTTON" && (x.getAttribute("aria-label") || "").startsWith(label));
const press = (doc, key, extra = {}) => doc.fire("keydown", { key, ...extra });

test("index.html: the Prospect List view, root, script and stylesheet are in the page, every link starts hidden and is named Prospect List", () => {
  for (const id of ["view-journey", "h-journey", "jr-root", "jr-live"]) assert.ok(HTML.includes(`id="${id}"`), id);
  assert.ok(HTML.includes("/assets/js/journey.js") && HTML.includes("/assets/css/journey.css"));
  const links = [...HTML.matchAll(/<a\b[^>]*href="\/prospect-list\/"[^>]*>[^<]*(?:<svg[\s\S]*?<\/svg>)?([^<]*)<\/a>/g)];
  assert.equal(links.length, 2);
  for (const l of links) { assert.ok(/data-journey-nav/.test(l[0]) && /\bhidden\b/.test(l[0]), l[0]); assert.equal(l[1], "Prospect List"); }
  assert.ok(/<h1 class="bl-sr" id="h-journey"[^>]*>Prospect List<\/h1>/.test(HTML), "a visually hidden h1 keeps the page heading");
  assert.ok(!/<header class="view-head">[^]*?Membership Pack<\/p><h1 id="h-journey"/.test(HTML), "no heading block");
  assert.ok(!/Journey/.test(HTML.slice(HTML.indexOf('id="view-journey"'), HTML.indexOf('id="view-settings-shipping"'))), "no old name on the page");
});

test("dashboard.js: the route (the old /journey/ address still opens the page), its title, the hooks and the probe", () => {
  const dash = read("dashboard.js");
  assert.match(dash, /"\/prospect-list\/": \{ view: "journey", title: "Prospect List \| NegosyoOnline"/);
  assert.match(dash, /var MOVED = \{[^}]*"\/journey\/": "\/prospect-list\/"/, "the old address moves to the new one");
  assert.match(dash, /"media", "journey"/);
  assert.match(dash, /JY\.show\(\)/);
  assert.match(dash, /JY\.hide\(\)/);
  assert.match(dash, /window\.NOJourney\.probe\(\)/);
});

test("the page is the Prospects list alone: it asks only for the prospects, and the old cards, counts and Meta text are gone", async () => {
  const d = boot(); await d.open();
  assert.ok(d.calls.includes(`/sites/${A}/pack/journey/prospects/?page=1`));
  assert.ok(!d.calls.some((c) => /pack\/journey\/\?period/.test(c)), "the counts endpoint is not read");
  const t = d.text();
  for (const w of ["Steps reached", "Events sent to Meta", "Recent orders", "Period", "Meta"]) assert.ok(!t.includes(w), w);
  assert.ok(d.nav.every((n) => n.hidden === false), "the links show once the API answered");
  assert.equal(d.root().all((n) => n.tagName === "SELECT").length, 0);
});

test("a 404 says the Prospect List is not available and keeps the links hidden; an error offers Try again", async () => {
  let d = boot({ prospects: () => ({ status: 404, body: { error: { code: "not_found", message: "Not found." } } }) }); await d.open();
  assert.ok(d.text().includes("The Prospect List is not available yet"));
  assert.ok(d.nav.every((n) => n.hidden === true));
  d = boot({ prospects: () => ({ status: 500, body: { error: { code: "x", message: "Boom." } } }) }); await d.open();
  assert.ok(d.text().includes("We could not load the prospects.") && d.text().includes("Boom."));
});

test("probe shows the links only on a 200", async () => {
  const d = boot(); d.window.NOJourney.probe(); await settle();
  assert.ok(d.nav.every((n) => n.hidden === false));
  const e = boot({ prospects: () => ({ status: 404, body: {} }) }); e.window.NOJourney.probe(); await settle();
  assert.ok(e.nav.every((n) => n.hidden === true));
});

test("Prospects: the royal blue header with the search inside it at the right, the approved lead, the segmented stage bar and the table head", async () => {
  const d = boot(); await d.open();
  const t = d.text();
  assert.ok(t.includes("Prospects") && t.includes("People who visited your Membership Pack page") && !t.includes("newest activity first"));
  assert.ok(d.$("jr-pr-q") && d.$("jr-pr-q").getAttribute("placeholder") === "Search by name, order number, mobile or email");
  const head = d.root().all((n) => n.classList && n.classList.contains("jr-pr-head"))[0];
  assert.ok(head.all((n) => n.id === "jr-pr-q").length === 1, "the search is in the header band");
  assert.ok(head.all((n) => n.classList && n.classList.contains("jr-pr-tools"))[0].all((n) => (n.tagName || "").toUpperCase() === "SVG").length === 1, "a magnifier inside the field");
  assert.match(CSS, /\.jr-pr-head \{[^}]*justify-content: space-between/);
  assert.match(CSS, /@media \(max-width: 640px\) \{[^@]*\.jr-pr-tools \{ width: 100%/);
  const chips = d.$("jr-pr-chips").all((n) => n.tagName === "BUTTON");
  assert.deepEqual(chips.map((b) => b.textContent), ["All", "New Lead", "Landing Page", "Start Watching", "Done Watching", "Add to Cart", "Checked Out", "Account Setup", "Activated"]);
  assert.equal(chips[1].getAttribute("title"), "New Lead, 2 people");
  assert.match(CSS, /\.jr-pr-head \{[^}]*background: var\(--primary\);[^}]*color: #fff/);
  assert.match(CSS, /\.jr-pr-chip\.is-on[^{]*\{[^}]*background: var\(--primary\);[^}]*color: #fff/);
  assert.match(CSS, /\.jr-pr-table thead th \{[^}]*letter-spacing[^}]*text-transform: uppercase/);
  const heads = d.$("jr-pr-body").all((n) => n.tagName === "TH").map((n) => n.textContent);
  assert.deepEqual(heads, ["Prospect", "Contact", "Video progress", "Stage", "Last activity", "ACTION"]);
});

test("Prospects: line 1 the name with its initials, line 2 the source; no Source column; the order number is not on the row", async () => {
  const d = boot(); await d.open();
  const body = d.$("jr-pr-body"), t = body.textContent;
  for (const w of ["Membership Pack page", "Website chat", "Facebook via Pancake", "Ready to register", "No name", "Ana Reyes"]) assert.ok(t.includes(w), w);
  assert.ok(!t.includes("Order PK-0001"));
  const ana = body.all((n) => n.tagName === "TR").find((r) => r.textContent.includes("Ana Reyes"));
  const who = ana.all((n) => n.classList && n.classList.contains("jr-pr-id"))[0];
  assert.deepEqual(who.children.map((c) => c.textContent), ["Ana Reyes", "Membership Pack page"]);
  assert.equal(d.window.NOJourney.util.initials("ana reyes cruz"), "AR");
  assert.equal(d.window.NOJourney.util.initials(""), "?");
});

test("Prospects: the Contact column shows a phone icon with the mobile and an email icon with the email, a dash for none", async () => {
  const d = boot(); await d.open();
  const rows = d.$("jr-pr-body").all((n) => n.tagName === "TR").slice(1);
  const cell = (r) => r.all((n) => n.classList && n.classList.contains("jr-pr-c-contact"))[0];
  const ana = cell(rows[0]);
  assert.equal(ana.textContent, "09170000009coach.test@example.test", "+63 is shown the way it is dialled");
  assert.equal(ana.all((n) => n.tagName === "svg" || n.tagName === "SVG").length, 2);
  assert.ok(ana.all((n) => (n.tagName || "").toUpperCase() === "SVG").every((s) => s.getAttribute("aria-hidden") === "true"));
  assert.equal(cell(rows[1]).textContent, "09170000010", "no email, no email line");
  assert.equal(cell(rows[2]).textContent, "09171234567cora@buyer.test");
  assert.equal(cell(rows[3]).textContent, "\u2013", "none shows a dash");
  assert.equal(d.window.NOJourney.util.mobileText("09171234567"), "09171234567");
});

test("Prospects: an unknown video progress (null) shows a dash with no bar; a known one shows its bar", async () => {
  const d = boot(); await d.open();
  const body = d.$("jr-pr-body");
  const dashes = body.all((n) => n.classList && n.classList.contains("jr-pr-c-video") && n.textContent === "\u2013").length;
  assert.equal(dashes, 3, "Ben Cruz (order, no visit) and the two inquiry rows");
  assert.equal(body.all((n) => n.classList && n.classList.contains("jr-pr-video")).length, 2, "only Ana and Cora have a bar");
});

test("Prospects: the Action column is icon only, with a label and tooltip; SMS needs a mobile, Email an email, Open order an order", async () => {
  const d = boot(); await d.open();
  const rows = d.$("jr-pr-body").all((n) => n.tagName === "TR").slice(1);
  const acts = (r) => r.all((n) => n.tagName === "BUTTON").map((b) => b.getAttribute("aria-label"));
  assert.deepEqual(acts(rows[0]), ["SMS Ana Reyes", "Email Ana Reyes", "Open order PK-0001"]);
  assert.deepEqual(acts(rows[1]), ["SMS Ben Cruz", "Open order PK-0002"]);
  assert.deepEqual(acts(rows[2]), ["SMS Cora Cart", "Email Cora Cart"]);
  assert.deepEqual(acts(rows[3]), []);
  for (const b of d.$("jr-pr-body").all((n) => n.tagName === "BUTTON")) {
    assert.equal(b.getAttribute("title"), b.getAttribute("aria-label"));
    assert.equal(b.textContent, "", "icon only, no visible text");
    assert.equal(b.all((n) => (n.tagName || "").toUpperCase() === "SVG").length, 1);
  }
  assert.equal(d.$("jr-pr-body").all((n) => n.tagName === "A").length, 0, "no link in the rows: the order opens in a popup");
});

test("Open order: a popup with the order summary the Orders page shows and a link to the full order; Esc closes it and focus returns", async () => {
  const d = boot(); await d.open();
  const opener = btns(d.$("jr-pr-body"), "Open order PK-0001")[0];
  opener.focus(); opener.fire("click");
  const dlg = d.root().all((n) => n.getAttribute("role") === "dialog")[0];
  assert.ok(dlg && dlg.getAttribute("aria-modal") === "true" && dlg.getAttribute("aria-labelledby") === "jr-dlg-h");
  const t = dlg.textContent;
  for (const w of ["Order PK-0001", "Ana Reyes", "Nov 15, 2026", "Verified", "\u20B11,488.00", "Ready to register"]) assert.ok(t.includes(w), w);
  assert.ok(!/09170000009|coach\.test/.test(t), "no contact, no new data");
  assert.deepEqual(dlg.all((n) => n.tagName === "A").map((a) => a.getAttribute("href")), ["/orders/?order=ord_1"]);
  assert.equal(d.doc.activeElement.getAttribute("aria-label"), "Close", "focus moved in");
  press(d.doc, "Escape");
  assert.equal(d.root().all((n) => n.getAttribute("role") === "dialog").length, 0);
  assert.equal(d.doc.activeElement, opener, "focus returned to the button");
});

test("SMS and Email: a shell with the recipient and a message box; the Send button is disabled and nothing is sent or linked", async () => {
  const d = boot(); await d.open();
  const before = d.calls.length;
  for (const [label, kind, to] of [["SMS Ana Reyes", "SMS", "09170000009"], ["Email Ana Reyes", "Email", "coach.test@example.test"]]) {
    const opener = btns(d.$("jr-pr-body"), label)[0];
    opener.focus(); opener.fire("click");
    const dlg = d.root().all((n) => n.getAttribute("role") === "dialog")[0];
    assert.equal(dlg.all((n) => n.tagName === "H2")[0].textContent, kind);
    assert.ok(dlg.textContent.includes("Ana Reyes") && dlg.textContent.includes(to));
    assert.equal(dlg.all((n) => n.tagName === "TEXTAREA").length, 1);
    const send = dlg.all((n) => n.tagName === "BUTTON" && n.textContent === "Send")[0];
    assert.equal(send.disabled, true);
    send.fire("click");
    assert.equal(dlg.all((n) => n.tagName === "A").length, 0, "no mailto or sms link");
    assert.equal(d.calls.length, before, "no request is made");
    dlg.all((n) => n.tagName === "BUTTON" && n.textContent === "Close")[0].fire("click");
    assert.equal(d.root().all((n) => n.getAttribute("role") === "dialog").length, 0);
    assert.equal(d.doc.activeElement, opener);
  }
  assert.match(read("journey.js"), /HOLD: sending behaviour awaits Coach Ed's decision \(Manager\)/);
});

test("popups: the close button and a click outside close; Tab stays inside", async () => {
  const d = boot(); await d.open();
  btns(d.$("jr-pr-body"), "SMS Ana Reyes")[0].fire("click");
  const dlg = d.root().all((n) => n.getAttribute("role") === "dialog")[0];
  const inside = dlg.all((n) => n.tagName === "BUTTON" && !n.disabled);
  inside[inside.length - 1].focus();
  const e = press(d.doc, "Tab"); assert.ok(e.prevented, "Tab from the last control wraps");
  assert.equal(d.doc.activeElement, inside[0]);
  d.root().all((n) => n.classList && n.classList.contains("jr-overlay"))[0].fire("click");
  assert.equal(d.root().all((n) => n.getAttribute("role") === "dialog").length, 0, "a click outside closes");
  btns(d.$("jr-pr-body"), "SMS Ana Reyes")[0].fire("click");
  d.root().all((n) => n.getAttribute("aria-label") === "Close")[0].fire("click");
  assert.equal(d.root().all((n) => n.getAttribute("role") === "dialog").length, 0, "the close button closes");
});

test("Prospects: a stage chip re-reads with that stage; search re-reads after a pause with q and page 1", async () => {
  const d = boot(); await d.open();
  const chip = d.$("jr-pr-chips").all((n) => n.tagName === "BUTTON").find((b) => b.textContent === "New Lead");
  chip.fire("click"); await settle();
  assert.ok(d.calls.includes(`/sites/${A}/pack/journey/prospects/?page=1&stage=new_lead`));
  assert.equal(d.$("jr-pr-chips").all((n) => n.tagName === "BUTTON").find((b) => b.textContent === "New Lead").getAttribute("aria-pressed"), "true");
  const q = d.$("jr-pr-q"); q.value = "  PK-0001 "; q.fire("input");
  await new Promise((r) => setTimeout(r, 400)); await settle();
  assert.ok(d.calls.includes(`/sites/${A}/pack/journey/prospects/?page=1&stage=new_lead&q=PK-0001`));
});

test("Prospects: paging, empty and error states", async () => {
  let d = boot({ prospects: () => ({ status: 200, body: prospectsBody({ page: 1, pages: 3, total: 60 }) }) }); await d.open();
  assert.ok(d.text().includes("Page 1 of 3") && d.text().includes("60 people"));
  d.root().all((n) => n.tagName === "BUTTON").find((b) => b.textContent === "Next").fire("click"); await settle();
  assert.ok(d.calls.includes(`/sites/${A}/pack/journey/prospects/?page=2`));
  d = boot({ prospects: () => ({ status: 200, body: prospectsBody({ results: [], total: 0, stage_counts: { all: 0 } }) }) }); await d.open();
  assert.ok(d.text().includes("No prospects yet."));
});

test("the CSS: light blue focus, no gold, the segmented bar scrolls on a phone, popups use dash tokens", () => {
  assert.match(CSS, /\.jr-pr-tools:focus-within \{[^}]*border-color: var\(--link\)/);
  assert.match(CSS, /\.jr-pr-chips \{[^}]*overflow-x: auto/);
  assert.ok(!/#f2d99b|#c59a3b|#e8c16a|var\(--gold\)|var\(--cat\)/i.test(CSS));
  assert.match(CSS, /\.jr-dialog \{[^}]*background: var\(--card\)/);
  assert.ok(!/jr-combo|jr-steps|jr-order|jr-break/.test(CSS), "no CSS left for the removed cards or the period dropdown");
});
