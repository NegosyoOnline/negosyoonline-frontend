/* The SMS Gateway settings tab (ClickUp z8uq9mhk1k, /settings/sms-gateway/, sms-gateway-settings.js). Driven like notices.test.mjs: the real scripts
   run in a vm with the small stand-in document from dom.mjs and a recorded fetch that plays the owner API of apps/notifications (api_owner.py).
   Fake data only. The token below is a made-up string. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDocument } from "./dom.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const JS = path.join(ROOT, "assets", "js");
const read = (f) => fs.readFileSync(path.join(JS, f), "utf8");
const HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const CSS = fs.readFileSync(path.join(ROOT, "assets", "css", "sms-gateway-settings.css"), "utf8");
const SITE = "site_aaaaaaaaaaaaaaaaaaaa";
const BASE = `/sites/${SITE}/sms-gateway/`;
const TOKEN = "tok_FAKE_0123456789abcdef0123456789abcdef";
const ADDR = "http://api.test";
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 10; i++) await tick(); };
const ago = (s) => new Date(Date.now() - s * 1000).toISOString();
const phone = (over = {}) => ({ name: "line-site-1", enabled: true, forwards_incoming: false, last_poll_at: null, app_version: null, battery: null, charging: null, connection: "waiting", ...over });
const err = (status, code, message) => ({ status, body: { error: { code, message } } });

function boot({ device = null, off = null, address = ADDR, account = { email: "owner@example.test", step_up_channels: ["email"] } } = {}) {
  const doc = makeDocument(), calls = [], toasts = [], stored = [];
  const make = doc.createElement;
  doc.createElement = (tag) => { const n = make(tag); n.replaceChild = (fresh, old) => { n.insertBefore(fresh, old); n.removeChild(old); return old; }; return n; };
  doc.createTextNode = (t) => { const w = make("span"); w.textContent = t; return w.firstChild; };
  const page = doc.body.appendChild(doc.createElement("div"));
  for (const id of ["sg-root", "sg-live", "sg-dialog-slot"]) { const n = doc.createElement("div"); n.setAttribute("id", id); page.appendChild(n); }
  const nav = doc.createElement("a"); nav.setAttribute("data-sms-gateway-nav", ""); nav.hidden = true; page.appendChild(nav);
  doc.querySelectorAll = (sel) => (sel === "[data-sms-gateway-nav]" ? [nav] : []);
  const s = { device, off, address, account, next: null, stepUp: null, rotate: null, stepUps: 0 };
  const fetch = (url, opts) => {
    const p = url.replace("http://api.test/v1", "");
    const body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ method: opts.method, path: p, body });
    let a = err(404, "not_found", "Not found.");
    const out = () => ({ server_address: s.address, device: s.device });
    if (opts.method === "GET" && p === "/sites/") a = { status: 200, body: { items: [{ id: SITE, template: "sante" }], next_cursor: null } };
    else if (opts.method === "GET" && p === "/account/") a = { status: 200, body: s.account };
    else if (opts.method === "POST" && p === "/account/step-up/") { s.stepUps++; a = s.stepUp || { status: 204, body: {} }; }
    else if (s.off && p.startsWith(BASE)) a = s.off;
    else if (opts.method === "GET" && p === BASE) a = { status: 200, body: out() };
    else if (opts.method === "POST" && p === BASE + "register/") {
      s.device = phone(); a = s.next || { status: 201, body: { ...out(), token: TOKEN } };
    } else if (opts.method === "POST" && p === BASE + "rotate/") a = s.rotate || { status: 200, body: { ...out(), token: TOKEN } };
    else if (opts.method === "POST" && p === BASE + "disable/") { s.device = phone({ enabled: false, connection: "disabled" }); a = { status: 200, body: out() }; }
    return Promise.resolve({ ok: a.status >= 200 && a.status < 300, status: a.status, json: () => (a.body === undefined ? Promise.reject(new Error("none")) : Promise.resolve(a.body)) });
  };
  const window = { NO_CONFIG: { apiBase: "http://api.test/v1", siteUrl: "http://www.test" }, addEventListener() {}, removeEventListener() {}, innerHeight: 800 };
  const storage = { getItem: () => null, removeItem() {}, setItem(k, v) { stored.push([k, v]); } };
  const location = { search: "", pathname: "/settings/sms-gateway/", assigned: null, replaced: null, replace(u) { this.replaced = u; }, assign(u) { this.assigned = u; } };
  const copied = [];
  const navigator = { clipboard: { writeText: (t) => { copied.push(t); return Promise.resolve(); } } };
  const context = vm.createContext({ window, document: doc, location, console, URLSearchParams, Promise, setTimeout, clearTimeout, Intl, Uint8Array, Date,
    FormData, localStorage: storage, sessionStorage: storage, navigator, requestAnimationFrame() {}, fetch });
  vm.runInContext(read("app.js"), context, { filename: "app.js" });
  vm.runInContext(read("sms-gateway-settings.js"), context, { filename: "sms-gateway-settings.js" });
  window.NODash.toast = (title, text) => toasts.push(title + ": " + text);
  const $ = (id) => doc.getElementById(id);
  const buttons = (n) => n.all((x) => x.tagName === "BUTTON");
  const press = (n, label) => buttons(n).find((b) => b.textContent === label);
  return { doc, calls, toasts, s, $, nav, stored, copied, location, window, buttons, press,
    list: () => calls.map((c) => c.method + " " + c.path),
    root: () => $("sg-root"), slot: () => $("sg-dialog-slot"),
    async open() { window.NOSmsGateway.show(); await settle(); },
    async click(node) { node.fire("click"); await settle(); } };
}
const chip = (d) => d.root().all((x) => x.classList.contains("chip"))[0];

test("no phone: the card says so, offers Pair my phone only, shows the server address, and the tab shows", async () => {
  const d = boot();
  await d.open();
  assert.deepEqual(d.list(), ["GET /sites/", "GET " + BASE]);
  assert.equal(chip(d).textContent, "No phone");
  assert.ok(d.root().textContent.includes("No phone is paired yet."));
  assert.ok(d.root().textContent.includes(ADDR));
  assert.deepEqual(d.buttons(d.root()).map((b) => b.textContent), ["Pair my phone", "Refresh"]);
  assert.equal(d.nav.hidden, false);
});

test("the five states and their words: waiting, connected, offline, disabled", async () => {
  let d = boot({ device: phone() });
  await d.open();
  assert.equal(chip(d).textContent, "Waiting for phone");
  assert.ok(d.root().textContent.includes("Enter the token in the Android app."));
  assert.deepEqual(d.buttons(d.root()).map((b) => b.textContent), ["Rotate token", "Disable phone", "Refresh"]);
  d = boot({ device: phone({ connection: "connected", last_poll_at: ago(12), app_version: "1.4.0", battery: 81, charging: true }) });
  await d.open();
  assert.equal(chip(d).textContent, "Connected");
  assert.ok(/Last check-in 1\d seconds? ago/.test(d.root().textContent));
  assert.ok(d.root().textContent.includes("1.4.0") && d.root().textContent.includes("81%, charging"));
  d = boot({ device: phone({ connection: "offline", last_poll_at: ago(14 * 60) }) });
  await d.open();
  assert.equal(chip(d).textContent, "Offline");
  assert.ok(d.root().textContent.includes("Last check-in 14 minutes ago."));
  assert.ok(d.root().textContent.includes("Your store’s texts are refused until your phone is back."));
  d = boot({ device: phone({ enabled: false, connection: "disabled" }) });
  await d.open();
  assert.equal(chip(d).textContent, "Disabled");
  assert.deepEqual(d.buttons(d.root()).map((b) => b.textContent), ["Pair my phone", "Refresh"]);
});

test("a connection word the page has no words for is never shown raw", async () => {
  const d = boot({ device: phone({ connection: "<script>x</script>" }) });
  await d.open();
  assert.equal(chip(d).textContent, "No phone");
  assert.ok(!d.root().textContent.includes("script"));
});

test("no server address from the API: the page says not to enter a token yet and shows no address", async () => {
  const d = boot({ address: "" });
  await d.open();
  assert.ok(d.root().textContent.includes("Server address is not set. Do not enter a token yet."));
  assert.ok(!d.root().textContent.includes("http"));
  const d2 = boot({ address: "javascript:alert(1)" });
  await d2.open();
  assert.ok(d2.root().textContent.includes("Server address is not set."));
});

test("404: the page says it is not available, offers no control, and the tab stays hidden (the switch is dark)", async () => {
  const d = boot({ off: err(404, "not_found", "Not found.") });
  await d.open();
  assert.ok(d.root().textContent.includes("SMS Gateway is not available"));
  assert.deepEqual(d.buttons(d.root()), []);
  assert.equal(d.nav.hidden, true);
});

test("the probe shows the tab only on a 200, never on 404 or 403 or a failure", async () => {
  let d = boot();
  d.window.NOSmsGateway.probe(); await settle();
  assert.equal(d.nav.hidden, false);
  assert.deepEqual(d.list(), ["GET /sites/", "GET " + BASE]);
  for (const off of [err(404, "not_found", "Not found."), err(403, "forbidden", "No."), err(500, "x", "x")]) {
    d = boot({ off });
    d.window.NOSmsGateway.probe(); await settle();
    assert.equal(d.nav.hidden, true, String(off.status));
  }
});

test("a failed read shows a Try again card and hides the tab", async () => {
  const d = boot({ off: err(500, "server_error", "Oops") });
  await d.open();
  assert.ok(d.root().textContent.includes("We couldn’t load your SMS gateway"));
  assert.ok(d.press(d.root(), "Try again"));
  assert.equal(d.nav.hidden, true);
});

const tokenBox = (d) => d.slot().all((n) => n.getAttribute("id") === "sg-token")[0];

test("Pair my phone asks first, then POSTs register with no body and shows the one-time token screen with the server address and the Android steps", async () => {
  const d = boot();
  await d.open();
  await d.click(d.press(d.root(), "Pair my phone"));
  assert.ok(d.slot().textContent.includes("Pair my phone?"));
  assert.equal(d.calls.filter((c) => c.path.endsWith("register/")).length, 0, "nothing is sent until Pair phone");
  await d.click(d.press(d.slot(), "Pair phone"));
  const reg = d.calls.filter((c) => c.path === BASE + "register/");
  assert.equal(reg.length, 1);
  assert.equal(reg[0].body, null);
  assert.equal(tokenBox(d).value, TOKEN);
  assert.equal(tokenBox(d).getAttribute("readonly"), "readonly");
  const text = d.slot().textContent;
  assert.ok(text.includes("Shown once.") && text.includes("Set up the Android app") && text.includes(ADDR));
  assert.ok(text.includes("Open the NegosyoOnline Gateway app, then Settings.") && text.includes("The status turns Connected within a minute."));
  assert.deepEqual(d.buttons(d.slot()).map((b) => b.textContent), ["Copy", "Copy", "Done"]);
});

test("Copy puts the token and the address on the clipboard; Escape does nothing while the token is shown", async () => {
  const d = boot();
  await d.open();
  await d.click(d.press(d.root(), "Pair my phone"));
  await d.click(d.press(d.slot(), "Pair phone"));
  const copies = d.buttons(d.slot()).filter((b) => b.textContent === "Copy");
  await d.click(copies[0]);
  assert.deepEqual(d.copied, [TOKEN]);
  assert.equal(copies[0].textContent, "Copied");
  await d.click(copies[1]);
  assert.deepEqual(d.copied, [TOKEN, ADDR]);
  d.doc.fire("keydown", { key: "Escape" });
  assert.equal(tokenBox(d).value, TOKEN, "the screen stays open on Escape");
});

test("Done closes the screen, clears the token from the box and the script, and reads the phone again; the token is on the page nowhere else", async () => {
  const d = boot();
  await d.open();
  await d.click(d.press(d.root(), "Pair my phone"));
  await d.click(d.press(d.slot(), "Pair phone"));
  const box = tokenBox(d);
  await d.click(d.press(d.slot(), "Done"));
  assert.equal(box.value, "");
  assert.equal(d.slot().children.length, 0);
  assert.equal(d.list().at(-1), "GET " + BASE, "the card reads the phone again");
  assert.ok(!d.root().textContent.includes(TOKEN));
  assert.ok(!d.doc.body.textContent.includes(TOKEN));
  assert.equal(d.root().all((n) => n.tagName === "BUTTON").some((b) => b.textContent === "Rotate token"), true, "the card now offers Rotate and Disable");
});

test("the token is never stored and never in an address: no storage write, no location change, no query, and leaving the page clears it", async () => {
  const d = boot();
  await d.open();
  await d.click(d.press(d.root(), "Pair my phone"));
  await d.click(d.press(d.slot(), "Pair phone"));
  assert.deepEqual(d.stored, []);
  assert.equal(d.location.assigned, null);
  assert.equal(d.location.replaced, null);
  assert.ok(!JSON.stringify(d.calls).includes(TOKEN), "no request carries the token");
  const box = tokenBox(d);
  d.window.NOSmsGateway.hide();
  assert.equal(d.slot().children.length, 0, "leaving the page closes the screen");
  assert.ok(!d.doc.body.textContent.includes(TOKEN));
  assert.equal(box.value, "", "the box is emptied");
});

test("the script and the page never write the token or any state to storage or the address", () => {
  const src = read("sms-gateway-settings.js");
  assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie|history\.(push|replace)State|location\.(href|hash|search)\s*=/.test(src));
  assert.ok(!/console\./.test(src), "nothing is logged");
});

test("a refused register says why: the store already has a phone re-reads the card; 404 turns the page off", async () => {
  let d = boot();
  await d.open();
  await d.click(d.press(d.root(), "Pair my phone"));
  d.s.next = err(409, "phone_exists", "This store already has a phone.");
  await d.click(d.press(d.slot(), "Pair phone"));
  assert.equal(d.slot().children.length, 0);
  assert.equal(d.list().at(-1), "GET " + BASE);
  d = boot();
  await d.open();
  await d.click(d.press(d.root(), "Pair my phone"));
  d.s.next = err(404, "not_found", "Not found.");
  await d.click(d.press(d.slot(), "Pair phone"));
  assert.ok(d.root().textContent.includes("SMS Gateway is not available"));
  assert.equal(d.nav.hidden, true);
});

const byId = (d, id) => d.slot().all((n) => n.getAttribute("id") === id)[0];

async function toRotateCode(d) {
  await d.open();
  await d.click(d.press(d.root(), "Rotate token"));
  await d.click(d.press(d.slot(), "Send code"));
}

test("Rotate asks for a code first: one email code is requested for the sms_line_rotate purpose, then the code, a tick and Rotate", async () => {
  const d = boot({ device: phone({ connection: "connected", last_poll_at: ago(5) }) });
  await toRotateCode(d);
  assert.deepEqual(d.calls.find((c) => c.path === "/account/step-up/").body, { channel: "email", purpose: "sms_line_rotate" });
  assert.ok(d.slot().textContent.includes("We sent a 6-digit code to"));
  assert.ok(d.slot().textContent.includes("The previous token stops working immediately."));
  assert.equal(d.calls.filter((c) => c.path.endsWith("rotate/")).length, 0);
  byId(d, "sg-code").value = "123456";
  await d.click(d.press(d.slot(), "Rotate token"));
  assert.ok(d.slot().textContent.includes("Tick “I understand”"), "the tick is needed");
  assert.equal(d.calls.filter((c) => c.path.endsWith("rotate/")).length, 0);
  byId(d, "sg-ack").checked = true;
  await d.click(d.press(d.slot(), "Rotate token"));
  const rot = d.calls.filter((c) => c.path === BASE + "rotate/");
  assert.equal(rot.length, 1);
  assert.deepEqual(rot[0].body, { step_up_code: "123456" });
  assert.equal(tokenBox(d).value, TOKEN, "the new token shows once, on the same screen as pairing");
  await d.click(d.press(d.slot(), "Done"));
  assert.ok(!d.doc.body.textContent.includes(TOKEN));
});

test("Rotate: a short code is refused before any call; a wrong or expired code keeps the dialog and says so", async () => {
  const d = boot({ device: phone() });
  await toRotateCode(d);
  byId(d, "sg-code").value = "12";
  byId(d, "sg-ack").checked = true;
  await d.click(d.press(d.slot(), "Rotate token"));
  assert.ok(d.slot().textContent.includes("Enter the 6-digit code."));
  assert.equal(byId(d, "sg-code").getAttribute("aria-invalid"), "true");
  assert.equal(d.calls.filter((c) => c.path.endsWith("rotate/")).length, 0);
  d.s.rotate = err(400, "step_up_required", "Enter the code we sent you first.");
  byId(d, "sg-code").value = "654321";
  await d.click(d.press(d.slot(), "Rotate token"));
  assert.ok(d.slot().textContent.includes("That code is wrong or has expired. Ask for a new one."));
  assert.ok(d.press(d.slot(), "Send a new code"));
  assert.ok(!d.doc.body.textContent.includes(TOKEN));
});

test("Rotate with an email and a mobile on the account offers both as radios (no dropdown) and sends to the one chosen", async () => {
  const d = boot({ device: phone(), account: { email: "owner@example.test", step_up_channels: ["email", "mobile"], mobile: { mobile_masked: "+63 9•• ••• 1234" } } });
  await d.open();
  await d.click(d.press(d.root(), "Rotate token"));
  const radios = d.slot().all((n) => n.tagName === "INPUT" && n.getAttribute("type") === "radio");
  assert.deepEqual(radios.map((r) => r.getAttribute("value")), ["email", "mobile"]);
  assert.equal(d.slot().all((n) => n.tagName === "SELECT").length, 0);
  radios[1].fire("change");
  await d.click(d.press(d.slot(), "Send code"));
  assert.deepEqual(d.calls.find((c) => c.path === "/account/step-up/").body, { channel: "mobile", purpose: "sms_line_rotate" });
  assert.ok(d.slot().textContent.includes("We texted a 6-digit code to"));
});

test("Rotate: when the code cannot be sent the dialog says so and nothing is rotated", async () => {
  const d = boot({ device: phone() });
  d.s.stepUp = err(404, "not_found", "Not found.");
  await toRotateCode(d);
  assert.ok(d.slot().textContent.includes("We cannot send a code right now."));
  d.s.stepUp = err(429, "rate_limited", "Slow down.");
  await d.click(d.press(d.slot(), "Send code"));
  assert.ok(d.slot().textContent.includes("Too many codes asked for."));
  assert.equal(d.calls.filter((c) => c.path.endsWith("rotate/")).length, 0);
});

test("Disable asks first, then POSTs disable with no body and shows the Disabled state; Cancel sends nothing", async () => {
  const d = boot({ device: phone({ connection: "connected", last_poll_at: ago(3) }) });
  await d.open();
  await d.click(d.press(d.root(), "Disable phone"));
  assert.ok(d.slot().textContent.includes("Disable phone?"));
  await d.click(d.press(d.slot(), "Cancel"));
  assert.equal(d.calls.filter((c) => c.path.endsWith("disable/")).length, 0);
  await d.click(d.press(d.root(), "Disable phone"));
  await d.click(d.press(d.slot(), "Disable phone"));
  const dis = d.calls.filter((c) => c.path === BASE + "disable/");
  assert.equal(dis.length, 1);
  assert.equal(dis[0].body, null);
  assert.equal(chip(d).textContent, "Disabled");
  assert.deepEqual(d.toasts, ["Phone disabled: Your store’s texts no longer go out from this phone."]);
});

test("the card is the Settings tab of the SMS Marketing page: dashboard.js has no view of its own, /settings/sms-gateway/ redirects to /sms/settings/ (INBOX-FIX-6)", () => {
  const src = read("dashboard.js");
  assert.ok(!src.includes("settings-sms-gateway"));
  assert.ok(src.includes('"/settings/sms-gateway/": "/sms/settings/"'));
  assert.ok(src.includes('"/sms/settings/": { view: "inbox", page: "sms", tab: "settings"'));
  assert.ok(read("inbox.js").includes("window.NOSmsGateway") && read("inbox.js").includes("SG.show()"), "inbox.js mounts the card with the module's own show() and hide()");
});

test("no Settings tab or view any more; the card root, slot and live region sit in #ib-settings inside the Inbox section; the script comes after the notices one", () => {
  const at = (needle) => HTML.indexOf(needle);
  assert.equal(HTML.split("data-sms-gateway-nav").length, 1, "no Settings tab");
  assert.ok(!HTML.includes("view-settings-sms-gateway"));
  for (const id of ["sg-root", "sg-dialog-slot", "sg-live"]) { assert.ok(HTML.includes('id="' + id + '"'), id); assert.ok(at('id="' + id + '"') > at('id="ib-settings"') && at('id="' + id + '"') < at('id="view-storefront"'), id + " is inside #ib-settings"); }
  assert.ok(at("sms-gateway-settings.css") > at("notices.css"));
  assert.ok(at("sms-gateway-settings.js") > at("notices.js"));
  assert.ok(at("sms-gateway-settings.js") > at("assets/js/dashboard.js"), "it loads after dashboard.js, like the other settings pages");
});

test("styles: scoped to the view, light-blue focus (no gold), a phone layout, no native select", () => {
  assert.ok(CSS.includes("#ib-settings .sg-card"));
  const bare = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]]);
  const plain = rules.filter(([sel]) => !sel.includes("@media"));
  for (const [sel] of plain) assert.ok(sel.split(",").every((x) => x.trim().startsWith("#ib-settings")), sel);
  const focus = plain.filter(([sel]) => sel.includes(":focus"));
  assert.ok(focus.length >= 3);
  for (const [sel, body] of focus) assert.ok(!/c59a3b|c9a227|d4af37|gold|f2d99b/i.test(body), "gold in a focus rule: " + sel);
  assert.ok(focus.some(([, body]) => body.includes("var(--link") || body.includes("var(--focus)")));
  assert.ok(CSS.includes("@media (max-width: 640px)"));
  const src = read("sms-gateway-settings.js");
  assert.ok(!src.includes('el("select"') && !src.includes("createElement(\"select\"") && !src.includes("combo("));
});

test("pure helpers: ago, stateOf, addressOf, codeError, channels, masks", () => {
  const u = boot().window.NOSmsGateway.util, now = new Date("2026-11-23T10:00:00Z");
  assert.equal(u.ago("2026-11-23T09:59:48Z", now), "12 seconds ago");
  assert.equal(u.ago("2026-11-23T09:59:59Z", now), "1 second ago");
  assert.equal(u.ago("2026-11-23T09:46:00Z", now), "14 minutes ago");
  assert.equal(u.ago("2026-11-23T07:00:00Z", now), "3 hours ago");
  assert.equal(u.ago("2026-11-20T10:00:00Z", now), "3 days ago");
  assert.equal(u.ago(null, now), "");
  assert.equal(u.stateOf(null), "no_phone");
  assert.equal(u.stateOf({ connection: "offline" }), "offline");
  assert.equal(u.stateOf({ connection: "??", enabled: false }), "disabled");
  assert.equal(u.addressOf({ server_address: " https://api.example.test " }), "https://api.example.test");
  assert.equal(u.addressOf({ server_address: "ftp://x" }), "");
  assert.equal(u.codeError("123456"), "");
  assert.equal(u.codeError("12345a"), "Enter the 6-digit code.");
  assert.deepEqual([...u.channelsOf({})], ["email"]);
  assert.deepEqual([...u.channelsOf({ step_up_channels: ["mobile", "x", "email"] })], ["mobile", "email"]);
  assert.equal(u.maskedEmail("owner@example.test"), "o••••@example.test");
});
