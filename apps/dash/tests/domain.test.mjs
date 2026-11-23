/* The Domain screen, "Your website address" (ClickUp z8uq9mhgvj, /settings/domain/, domain.js). Driven like notices.test.mjs: the real
   scripts run in a vm with the small stand-in document from dom.mjs and a recorded fetch that plays the owner API of apps/domains.
   Fake data only; no network. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDocument } from "./dom.mjs";

const JS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "assets", "js");
const read = (f) => fs.readFileSync(path.join(JS, f), "utf8");
const A = "site_aaaaaaaaaaaaaaaaaaaa";
const BASE = `/sites/${A}/domain/`;
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 10; i++) await tick(); };

const claim = (state, over = {}) => ({ id: "dom_1", name: "yourbusiness.com", state, label: "", reason: "", quote_expires_at: null, can_buy: false, can_retry: false, ...over });
const answer = (domain, over = {}) => ({ eligible: true, locked_reason: "", extensions: [".com"], registered_name: "", domain, ...over });
const err = (status, code, message, fields) => ({ status, body: { error: { code, message, ...(fields ? { fields } : {}) } } });

function boot({ get = { status: 200, body: answer(null) }, post = {} } = {}) {
  const doc = makeDocument(), calls = [], toasts = [], timers = [];
  const page = doc.body.appendChild(doc.createElement("div"));
  for (const id of ["dm-root", "dm-live"]) { const n = doc.createElement("div"); n.setAttribute("id", id); page.appendChild(n); }
  const s = { get, post };
  const fetch = (url, opts) => {
    const p = url.replace("http://api.test/v1", "");
    const body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ method: opts.method, path: p, body });
    let a = err(404, "not_found", "Not found.");
    if (opts.method === "GET" && p === "/sites/") a = { status: 200, body: { items: [{ id: A, template: "sante" }], next_cursor: null } };
    else if (opts.method === "GET" && p === BASE) a = typeof s.get === "function" ? s.get() : s.get;
    else if (opts.method === "POST" && p.startsWith(BASE)) { const k = p.slice(BASE.length); a = typeof s.post[k] === "function" ? s.post[k](body) : s.post[k] || err(404, "not_found", "Not found."); }
    return Promise.resolve({ ok: a.status >= 200 && a.status < 300, status: a.status, json: () => Promise.resolve(a.body) });
  };
  const window = { NO_CONFIG: { apiBase: "http://api.test/v1", siteUrl: "http://www.test" }, addEventListener() {}, removeEventListener() {}, innerHeight: 800 };
  const storage = { getItem: () => null, removeItem() {}, setItem() {} };
  const location = { search: "", pathname: "/settings/domain/", replace() {}, assign() {} };
  let n = 0;
  const context = vm.createContext({ window, document: doc, location, console, URLSearchParams, Promise, Intl, Uint8Array, Date, JSON,
    setTimeout: (fn, ms) => { timers.push({ fn, ms, id: ++n, live: true }); return n; },
    clearTimeout: (id) => { const t = timers.find((x) => x.id === id); if (t) t.live = false; },
    localStorage: storage, sessionStorage: storage, requestAnimationFrame() {}, fetch });
  vm.runInContext(read("app.js"), context, { filename: "app.js" });
  vm.runInContext(read("domain.js"), context, { filename: "domain.js" });
  window.NODash.toast = (title, text) => toasts.push(title + ": " + text);
  const $ = (id) => doc.getElementById(id);
  const buttons = (nd) => nd.all((x) => x.tagName === "BUTTON");
  return { doc, calls, toasts, s, $, window, buttons,
    press: (label) => buttons($("dm-root")).find((b) => b.textContent === label),
    text: () => $("dm-root").textContent,
    list: () => calls.map((c) => c.method + " " + c.path),
    pending: () => timers.filter((t) => t.live),
    async open() { window.NODomain.show(); await settle(); },
    async click(node) { node.fire("click"); await settle(); },
    async tickPoll() { const t = timers.filter((x) => x.live).pop(); t.live = false; t.fn(); await settle(); },
    async submit(value) { $("dm-name").value = value; $("dm-name").parentNode.fire("submit"); await settle(); } };
}

test("a 404 from the API (the switch is off): the page says it is not available yet and offers nothing", async () => {
  const d = boot({ get: err(404, "not_found", "Not found.") });
  await d.open();
  assert.deepEqual(d.list(), ["GET /sites/", "GET " + BASE]);
  assert.ok(d.text().includes("Your website address is not available yet"));
  assert.equal(d.buttons(d.$("dm-root")).length, 0);
  assert.equal(d.$("dm-name"), null);
  assert.equal(d.pending().length, 0, "no polling");
});

test("not yet eligible (trial or no paid cycle): it says it unlocks after the first subscription payment, with no search", async () => {
  const d = boot({ get: { status: 200, body: answer(null, { eligible: false, locked_reason: "Your domain unlocks after your first payment is approved." }) } });
  await d.open();
  assert.ok(/unlocks after your first subscription payment/.test(d.text()));
  assert.equal(d.$("dm-name"), null);
  assert.equal(d.buttons(d.$("dm-root")).length, 0);
  assert.ok(d.text().includes("Free for your first year: one address for your store."));
});

test("a lock for another reason shows the API's own sentence", async () => {
  const d = boot({ get: { status: 200, body: answer(null, { eligible: false, locked_reason: "This site is on hold." }) } });
  await d.open();
  assert.ok(d.text().includes("This site is on hold."));
});

test("eligible: the placeholder line, a search box and Check name; the plan's ending is added when none is typed", async () => {
  const d = boot({ post: { "check/": (b) => ({ status: 200, body: answer(claim("checking", { name: b.name })) }) } });
  await d.open();
  assert.ok(d.text().includes("Free for your first year: one address for your store."));
  assert.ok(d.press("Check name"));
  assert.equal(d.$("dm-name").tagName, "INPUT");
  await d.submit("  https://www.YourBusiness/ ");
  assert.deepEqual(d.calls.at(-1), { method: "POST", path: BASE + "check/", body: { name: "yourbusiness.com" } });
  assert.ok(d.text().includes("Checking the name"));
  assert.equal(d.pending().length, 1);
  assert.equal(d.pending()[0].ms, 3000, "it asks again after a few seconds");
});

test("an empty box asks for a name and sends nothing", async () => {
  const d = boot();
  await d.open();
  await d.submit("   ");
  assert.equal(d.calls.filter((c) => c.method === "POST").length, 0);
  assert.ok(d.text().includes("Type the address you want"));
});

test("the poll turns a checking claim into an available name with Buy; a name that did not pass shows the API's reason", async () => {
  let n = 0;
  const d = boot({
    get: () => ({ status: 200, body: answer(++n < 2 ? claim("checking") : claim("quoted", { can_buy: true, label: "Available, included in your plan" })) }),
    post: { "check/": { status: 200, body: answer(claim("checking")) } },
  });
  await d.open();
  assert.ok(d.text().includes("Checking the name"));
  await d.tickPoll();
  assert.ok(d.text().includes("This address is available"));
  assert.ok(d.text().includes("yourbusiness.com"));
  assert.ok(d.press("Buy this address"));
  assert.equal(d.pending().length, 0, "the poll stops once the owner has to decide");

  const bad = boot({ get: { status: 200, body: answer(claim("ended", { reason: "That name is taken. Please choose another." })) } });
  await bad.open();
  assert.ok(bad.text().includes("That name is taken. Please choose another."));
  assert.ok(bad.press("Check name"));
});

test("Buy asks first: nothing is bought until the owner confirms, and Cancel buys nothing", async () => {
  const d = boot({
    get: { status: 200, body: answer(claim("quoted", { can_buy: true })) },
    post: { "buy/": (b) => ({ status: 200, body: answer(claim("confirmed", { name: b.name, label: "We will buy it shortly" })) }) },
  });
  await d.open();
  await d.click(d.press("Buy this address"));
  assert.equal(d.calls.filter((c) => c.method === "POST").length, 0, "the first press only opens the confirm step");
  assert.ok(d.text().includes("Buy yourbusiness.com for your store?"));
  assert.ok(d.press("Yes, buy it") && d.press("Cancel"));
  await d.click(d.press("Cancel"));
  assert.equal(d.calls.filter((c) => c.method === "POST").length, 0);
  assert.ok(d.press("Buy this address"));
  await d.click(d.press("Buy this address"));
  await d.click(d.press("Yes, buy it"));
  const posts = d.calls.filter((c) => c.method === "POST");
  assert.deepEqual(posts, [{ method: "POST", path: BASE + "buy/", body: { name: "yourbusiness.com" } }]);
  assert.ok(d.text().includes("Setting up your address"));
  assert.ok(d.text().includes("We will buy it shortly"));
  assert.ok(d.toasts.length === 1);
});

test("an expired quote has no Buy: it asks to check the name again", async () => {
  const d = boot({ get: { status: 200, body: answer(claim("quoted", { can_buy: false })) } });
  await d.open();
  assert.equal(d.press("Buy this address"), undefined);
  assert.ok(d.press("Check name"));
  assert.ok(d.text().includes("Check the name again"));
});

test("the state mapping: stage and setup step for every state the API sends", () => {
  const d = boot();
  const u = d.window.NODomain.util;
  const stage = (state, over) => u.stage(answer(claim(state, over)));
  assert.equal(u.stage(answer(null)), "search");
  assert.equal(u.stage(answer(null, { eligible: false })), "locked");
  assert.equal(stage("checking"), "checking");
  assert.equal(stage("quoted", { can_buy: true }), "quoted");
  assert.equal(stage("quoted", { can_buy: false }), "expired");
  for (const st of ["confirmed", "awaiting_gate", "registering", "registered", "zone", "connecting", "activating"]) assert.equal(stage(st), "progress", st);
  assert.equal(stage("live"), "live");
  assert.equal(stage("attention"), "attention");
  assert.equal(stage("failed"), "failed");
  assert.equal(stage("conflict"), "conflict");
  assert.equal(stage("removal_pending"), "removing");
  assert.equal(stage("ended"), "search");
  assert.equal(stage("something_new"), "search");
  const step = (st) => u.stepOf(answer(claim(st)));
  assert.deepEqual(["confirmed", "awaiting_gate", "registering", "registered", "zone", "connecting", "activating"].map(step), [0, 0, 1, 2, 2, 2, 3]);
  assert.equal(step("live"), -1);
  assert.equal(u.pollSeconds(answer(claim("quoted", { can_buy: true }))), 0);
  assert.equal(u.pollSeconds(answer(claim("live"))), 0);
  assert.ok(u.pollSeconds(answer(claim("connecting"))) > 0);
  assert.equal(u.pollSeconds(answer(claim("connecting"), { eligible: false })), 0);
});

test("progress shows the four steps and marks the current one", async () => {
  const d = boot({ get: { status: 200, body: answer(claim("connecting", { label: "Connecting your website" })) } });
  await d.open();
  const items = d.$("dm-root").all((n) => n.tagName === "LI");
  assert.deepEqual(items.map((n) => n.textContent), ["Requested", "Registering", "Connecting", "Activating"]);
  assert.deepEqual(items.map((n) => n.classList.contains("dm-done") || n.classList.contains("dm-now")), [true, true, true, false]);
  assert.equal(items[2].getAttribute("aria-current"), "step");
  assert.ok(d.text().includes("Connecting your website"));
  assert.equal(d.$("dm-live").textContent, "Connecting your website");
});

test("live: the www address, as a link only for a plain host", async () => {
  const d = boot({ get: { status: 200, body: answer(claim("live")) } });
  await d.open();
  const link = d.$("dm-root").all((n) => n.tagName === "A")[0];
  assert.equal(link.textContent, "www.yourbusiness.com");
  assert.equal(link.getAttribute("href"), "https://www.yourbusiness.com");
  assert.equal(link.getAttribute("rel"), "noopener noreferrer");
  const odd = boot({ get: { status: 200, body: answer(claim("live", { name: "javascript:alert(1)//x.com" })) } });
  await odd.open();
  assert.equal(odd.$("dm-root").all((n) => n.tagName === "A").length, 0);
});

test("failed shows Retry only when the API allows it, and Retry posts to retry/", async () => {
  const d = boot({
    get: { status: 200, body: answer(claim("failed", { can_retry: true, label: "Something went wrong", reason: "We could not connect your website." })) },
    post: { "retry/": { status: 200, body: answer(claim("zone", { label: "Setting up your domain" })) } },
  });
  await d.open();
  assert.ok(d.text().includes("We could not connect your website."));
  await d.click(d.press("Retry"));
  assert.deepEqual(d.calls.at(-1), { method: "POST", path: BASE + "retry/", body: null });
  assert.ok(d.text().includes("Setting up your address"));

  const no = boot({ get: { status: 200, body: answer(claim("failed", { can_retry: false })) } });
  await no.open();
  assert.equal(no.press("Retry"), undefined);
});

test("attention and conflict say it plainly; conflict has no Retry", async () => {
  const at = boot({ get: { status: 200, body: answer(claim("attention", { label: "Your website is not answering yet" })) } });
  await at.open();
  assert.ok(at.text().includes("Your website is not answering yet"));
  assert.ok(at.text().includes("www.yourbusiness.com"));
  const co = boot({ get: { status: 200, body: answer(claim("conflict", { can_retry: false, reason: "Waiting for the NegosyoOnline team." })) } });
  await co.open();
  assert.ok(co.text().includes("Waiting for the NegosyoOnline team."));
  assert.equal(co.press("Retry"), undefined);
  assert.equal(co.buttons(co.$("dm-root")).length, 0);
});

test("errors show the API's message plainly, never JSON, and a stale screen is re-read", async () => {
  const d = boot({ post: { "check/": err(409, "not_eligible", "Your domain unlocks after your first payment is approved.") } });
  await d.open();
  d.s.get = { status: 200, body: answer(null, { eligible: false, locked_reason: "Your domain unlocks after your first payment is approved." }) };
  await d.submit("brand.com");
  assert.ok(/unlocks after your first subscription payment/.test(d.text()), "the re-read answer is the locked screen");
  assert.equal(d.calls.at(-1).method, "GET", "the screen read the status again");

  const f = boot({ post: { "check/": err(400, "invalid_request", "Some values are missing or invalid.", { name: ["Use letters, digits and hyphens in a dotted name."] }) } });
  await f.open();
  await f.submit("bad name.com");
  assert.ok(f.text().includes("Use letters, digits and hyphens in a dotted name."));
  assert.ok(!/[{}\[\]"]|error|code/.test(f.text().replace(/Use letters, digits and hyphens in a dotted name\./g, "")), "no raw JSON");
  assert.ok(f.$("dm-name"), "the box stays so the owner can fix the name");

  const r = boot({ post: { "check/": err(429, "rate_limited", "Too many requests. Please try again later.") } });
  await r.open();
  await r.submit("brand.com");
  assert.ok(r.text().includes("Too many requests. Please try again later."));
});

test("a failed Buy shows its message and leaves the confirm step", async () => {
  const d = boot({
    get: { status: 200, body: answer(claim("quoted", { can_buy: true })) },
    post: { "buy/": err(409, "purchase_not_open", "Domains are not open for buying yet.") },
  });
  await d.open();
  await d.click(d.press("Buy this address"));
  await d.click(d.press("Yes, buy it"));
  assert.ok(d.text().includes("Domains are not open for buying yet."));
  assert.equal(d.press("Yes, buy it"), undefined);
});

test("an unreadable status answers a retry panel, not raw data; a 404 on a write ends in not available", async () => {
  const d = boot({ get: { status: 500, body: { detail: "boom" } } });
  await d.open();
  assert.ok(d.text().includes("We couldn’t load your website address"));
  assert.ok(!d.text().includes("boom"));
  assert.ok(d.press("Try again"));
  const w = boot({ post: { "check/": err(404, "not_found", "Not found.") } });
  await w.open();
  await w.submit("brand.com");
  assert.ok(w.text().includes("not available yet"));
});

const HOLD = "Your address stays connected while you stay subscribed. From year 2 its renewal is paid. NegosyoOnline registers and holds it for your store.";
test("no screen shows a price or an amount; the one hold line is the only mention of renewal or a year", async () => {
  const states = [answer(null), answer(null, { eligible: false }), answer(claim("checking")), answer(claim("quoted", { can_buy: true })), answer(claim("confirmed")),
    answer(claim("activating")), answer(claim("live")), answer(claim("attention")), answer(claim("failed", { can_retry: true })), answer(claim("conflict"))];
  for (const body of states) {
    const d = boot({ get: { status: 200, body } });
    await d.open();
    if (body.domain && body.domain.state === "quoted") await d.click(d.press("Buy this address"));
    const t = d.text().split(HOLD).join("").replace(/Free for your first year|Free first year/g, "");
    assert.ok(!/[₱$]|\d|price|renew|year|\bfee\b|cost|999/i.test(t.replace(/yourbusiness\.com/g, "")), t);
    assert.ok(!/included with your plan/i.test(d.text()));
  }
});

test("registered: Free until <date> from free_until, written the dash way; nothing when it is missing or the claim is not registered yet", async () => {
  for (const [state, shown] of [["registered", true], ["zone", true], ["connecting", true], ["activating", true], ["live", true], ["attention", true], ["registering", false], ["confirmed", false], ["quoted", false]]) {
    const d = boot({ get: { status: 200, body: answer(claim(state, { can_buy: true, free_until: "2027-11-22T16:00:00Z" })) } });
    await d.open();
    assert.equal(d.text().includes("Free until Nov 23, 2027"), shown, state);
  }
  const plain = boot({ get: { status: 200, body: answer(claim("live", { free_until: "2027-03-05" })) } });
  await plain.open();
  assert.ok(plain.text().includes("Free until Mar 5, 2027"));
  assert.ok(plain.text().includes(HOLD));
  for (const v of [undefined, null, "", "garbage", 12345]) {
    const d = boot({ get: { status: 200, body: answer(claim("live", { free_until: v })) } });
    await d.open();
    assert.ok(!/free until/i.test(d.text()), String(v));
  }
  const top = boot({ get: { status: 200, body: answer(claim("live"), { free_until: "2027-03-05" }) } });
  await top.open();
  assert.ok(top.text().includes("Free until Mar 5, 2027"));
});

test("the hold line shows on search, quoted and live", async () => {
  for (const body of [answer(null), answer(claim("quoted", { can_buy: true })), answer(claim("live"))]) {
    const d = boot({ get: { status: 200, body } });
    await d.open();
    assert.ok(d.text().includes(HOLD));
  }
});

test("a poll that fails keeps the last screen; leaving the page stops the timer and drops a late answer", async () => {
  const d = boot({ get: { status: 200, body: answer(claim("connecting")) } });
  await d.open();
  d.s.get = { status: 500, body: {} };
  await d.tickPoll();
  assert.ok(d.text().includes("Setting up your address"));
  assert.ok(d.pending().length === 1);
  d.window.NODomain.hide();
  assert.equal(d.pending().length, 0);
  assert.equal(d.$("dm-root").childNodes.length, 0);
});

test("cleanName and errText", () => {
  const u = boot().window.NODomain.util;
  assert.equal(u.cleanName("Brand", [".com"]), "brand.com");
  assert.equal(u.cleanName("http://www.Brand.com/shop?x=1", [".com"]), "brand.com");
  assert.equal(u.cleanName("brand", [".net"]), "brand.net");
  assert.equal(u.cleanName("  ", [".com"]), "");
  assert.equal(u.cleanName("brand", [".net", ".com", ".org"]), "brand.net", "several endings: the first one");
  assert.equal(u.cleanName("brand", []), "brand.com");
  assert.equal(u.cleanName("brand", undefined), "brand.com");
  assert.equal(u.cleanName("Brand.xyz", [".net", ".com"]), "brand.xyz", "a typed ending is sent as typed");
  assert.equal(u.errText({ data: { message: "M", fields: { name: "F" } } }), "F");
  assert.equal(u.errText({ data: { message: "M" } }), "M");
  assert.equal(u.errText({ data: { detail: "x" } }), "Something went wrong. Please try again.");
});

test("the ending hint is built from the API's extensions", async () => {
  const hint = async (extensions) => { const d = boot({ get: { status: 200, body: answer(null, { extensions }) } }); await d.open(); return d; };
  let d = await hint([".com"]);
  assert.ok(d.text().includes("You can choose an address ending in .com."));
  assert.equal(d.$("dm-ext").textContent, "You can choose an address ending in .com.");
  assert.equal(d.$("dm-name").getAttribute("aria-describedby"), "dm-hint dm-ext dm-err");
  assert.ok(d.$("dm-hint") && d.$("dm-err"), "the old hint and error ids stay");
  d = await hint([".com", ".net"]);
  assert.equal(d.$("dm-ext").textContent, "You can choose an address ending in .com or .net.");
  d = await hint([".com", ".net", ".org", ".xyz"]);
  assert.equal(d.$("dm-ext").textContent, "You can choose an address ending in .com, .net, .org or .xyz.");
  for (const none of [[], undefined, null, "x", [".COM", "com", ".a", "<b>", 5]]) {
    d = await hint(none);
    assert.equal(d.$("dm-ext"), null, "no hint for " + JSON.stringify(none));
    assert.equal(d.$("dm-name").getAttribute("aria-describedby"), "dm-hint dm-err");
  }
  d = await hint([".com", "bad", ".net<i>", ".org"]);
  assert.equal(d.$("dm-ext").textContent, "You can choose an address ending in .com or .org.", "bad items dropped");
});

test("several endings: a name typed without one gets the first; the API's refusal is shown as sent", async () => {
  const msg = "This name is not included. Please choose another.";
  const d = boot({
    get: { status: 200, body: answer(null, { extensions: [".net", ".com"] }) },
    post: { "check/": (b) => (b.name === "pricey.xyz" ? err(400, "invalid_request", msg, { name: [msg] }) : { status: 200, body: answer(claim("checking", { name: b.name })) }) },
  });
  await d.open();
  await d.submit("Brand");
  assert.deepEqual(d.calls.at(-1), { method: "POST", path: BASE + "check/", body: { name: "brand.net" } });
  const e = boot({ get: { status: 200, body: answer(null, { extensions: [".net", ".com", ".xyz"] }) }, post: { "check/": err(400, "invalid_request", msg, { name: msg }) } });
  await e.open();
  await e.submit("pricey.xyz");
  assert.deepEqual(e.calls.at(-1), { method: "POST", path: BASE + "check/", body: { name: "pricey.xyz" } });
  assert.equal(e.$("dm-err").textContent, msg);
});

test("year-2 line: only on the result before Buy, only for a positive whole number of cents", async () => {
  const Y = (x) => `Free for the first year. From year 2: US$${x} a year, Cloudflare\u2019s renewal price with no markup, billed in pesos at the BSP rate when the renewal bill is made.`;
  for (const [cents, line] of [[4220, "42.20"], [1046, "10.46"]]) {
    const d = boot({ get: { status: 200, body: answer(claim("quoted", { can_buy: true, renewal_usd_cents: cents })) } });
    await d.open();
    assert.ok(d.text().includes(Y(line)), line);
    await d.click(d.press("Buy this address"));
    assert.ok(d.text().includes(Y(line)), "also in the confirm view");
    assert.ok(!/first[- ]year price/i.test(d.text()));
  }
  for (const bad of [null, undefined, 0, -5, 10.5, "4220", NaN]) {
    const d = boot({ get: { status: 200, body: answer(claim("quoted", { can_buy: true, renewal_usd_cents: bad })) } });
    await d.open();
    assert.ok(!d.text().includes("US$"), "hidden for " + String(bad));
  }
  const m = boot({ get: { status: 200, body: answer(claim("quoted", { can_buy: true })) } });
  await m.open();
  assert.ok(!m.text().includes("US$"), "hidden when missing");
  for (const st of ["checking", "confirmed", "activating", "live", "attention", "failed", "conflict"]) {
    const d = boot({ get: { status: 200, body: answer(claim(st, { can_buy: false, renewal_usd_cents: 4220 })) } });
    await d.open();
    assert.ok(!d.text().includes("US$"), st);
  }
  const s = boot({ get: { status: 200, body: answer(null) } });
  await s.open();
  assert.ok(!s.text().includes("US$"), "search view");
  const l = boot({ get: { status: 200, body: answer(null, { eligible: false, renewal_usd_cents: 4220 }) } });
  await l.open();
  assert.ok(!l.text().includes("US$"), "locked view");
});
