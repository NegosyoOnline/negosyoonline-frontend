/* Orders > Package Order > "Help this member sign in" (ClickUp z8uq9mek5y, MEM-R; mockups 01 to 05).
   Driven like pack.test.mjs: the real app.js, pack-orders.js and member-recovery.js, a small stand-in document (dom.mjs) and a recorded
   fetch that answers the owner API's members routes (backend apps/members/api_owner.py). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDocument } from "./dom.mjs";

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const read = (f) => fs.readFileSync(path.join(PUBLIC, "assets", "js", f), "utf8");
const HTML = fs.readFileSync(path.join(PUBLIC, "index.html"), "utf8");
const CSS = fs.readFileSync(path.join(PUBLIC, "assets", "css", "member-recovery.css"), "utf8");
const A = "site_aaaaaaaaaaaaaaaaaaaa";
const MEMBERS = `/sites/${A}/members/`;
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 14; i++) await tick(); };

const order = (o) => ({ id: "ord_42", order_number: "SMP00042", buyer_name: "Maria Santos", mobile_masked: "+63917***0142", method: "direct", payment_status: "verified",
  created_at: "2026-11-12T01:14:00+00:00", state_version: 3, ...o });
const ROWS = [order({}), order({ id: "ord_38", order_number: "SMP00038", buyer_name: "Mario Santos" }), order({ id: "ord_37", order_number: "SMP00037", buyer_name: "No Account" })];
const mrow = (o) => ({ id: "mem_1", full_name: "Maria Santos", mobile_masked: "0917 *** 4821", email_masked: "ma***@gmail.com", mobile_state: "verified", email_state: "verified",
  hold_ends_at: null, hold_ends_display: null, closed: false, ...o });
const HOLD = "2026-11-14T07:10:00+00:00";
const BY_ORDER = { ord_42: mrow({}), ord_38: mrow({ id: "mem_2", full_name: "Mario Santos", hold_ends_at: HOLD, hold_ends_display: "14 Nov 2026, 3:10 PM (Philippine time)" }) };
const ITEMS = [{ key: "full_name", applicable: true, reference: "Maria D. Santos" }, { key: "delivery_address", applicable: true, reference: "14 Mabini St., Quezon City" },
  { key: "pack_order_number", applicable: true }, { key: "payout_last4", applicable: false }];
const detail = (m, o) => ({ member: m, items: ITEMS, hold: null, recent_recoveries: [], ...o });
const err = (code, message, fields) => ({ error: { code, message, fields: fields || {} } });

function boot({ byOrder = BY_ORDER, byOrderStatus = 200, handlers = {} } = {}) {
  const doc = makeDocument(), make = doc.createElement;
  doc.createElement = (tag) => {
    const n = make(tag), plain = n.querySelector.bind(n);
    n.querySelector = (sel) => (/^[a-z]+(\s*,\s*[a-z]+)*$/.test(sel) ? n.querySelectorAll(sel)[0] || null : plain(sel));
    n.click = () => n.fire("click");
    return n;
  };
  doc.createTextNode = (t) => { const n = doc.createElement("#text"); n.text = String(t); return n; };
  doc.documentElement = doc.createElement("html");
  const calls = [], toasts = [];
  const page = doc.body.appendChild(doc.createElement("div"));
  const tabs = doc.createElement("nav"); tabs.setAttribute("id", "orders-tabs"); page.appendChild(tabs);
  for (const t of ["overview", "product", "pack"]) { const a = doc.createElement("a"); a.setAttribute("data-tab", t); a.textContent = t; tabs.appendChild(a); }
  const vw = doc.createElement("div"); vw.setAttribute("id", "view-pack-orders"); page.appendChild(vw);
  const h1 = doc.createElement("h1"); h1.setAttribute("id", "h-orders"); h1.setAttribute("tabindex", "-1"); vw.appendChild(h1);
  for (const id of ["po-sub", "po-body"]) { const n = doc.createElement("div"); n.setAttribute("id", id); vw.appendChild(n); }
  for (const id of ["po-dlg-slot", "mr-root"]) { const n = doc.createElement("div"); n.setAttribute("id", id); page.appendChild(n); }
  doc.getElementById("mr-root").hidden = true;
  const fetch = (url, opts) => {
    const p = url.replace("http://api.test/v1", ""), body = opts.body ? JSON.parse(opts.body) : null, method = opts.method || "GET";
    calls.push({ method, path: p, body, credentials: opts.credentials });
    const res = (status, b) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(b), blob: () => Promise.resolve({}) });
    if (p === "/sites/") return res(200, { items: [{ id: A, template: "sante" }], next_cursor: null });
    if (p === `/sites/${A}/pack/orders/?filter=all`) return res(200, { orders: ROWS });
    const dm = /^\/sites\/site_[0-9a-z]{20}\/pack\/orders\/(ord_\d+)\/$/.exec(p);
    if (dm) return res(200, { ...ROWS.find((r) => r.id === dm[1]), price_centavos: 148800, currency: "PHP", delivery_address: {}, submissions: [], events: [] });
    if (p.startsWith(MEMBERS + "by-order/")) return byOrderStatus === 200 ? res(200, { members: byOrder }) : res(byOrderStatus, err("not_found", "Not found."));
    const key = method + " " + p.replace(MEMBERS, "");
    for (const k of Object.keys(handlers)) if (key.startsWith(k)) return handlers[k](body);
    return res(404, err("not_found", "Not found."));
  };
  const window = { NO_CONFIG: { apiBase: "http://api.test/v1", siteUrl: "http://www.test" }, addEventListener() {}, removeEventListener() {}, innerHeight: 800, open() {} };
  const storage = { getItem: () => null, removeItem() {}, setItem() {} };
  const context = vm.createContext({ window, document: doc, location: { search: "", pathname: "/orders/", replace() {}, assign() {} }, console, URLSearchParams, Promise, setTimeout, clearTimeout, Intl,
    localStorage: storage, sessionStorage: storage, requestAnimationFrame() {}, fetch, URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} } });
  vm.runInContext(read("app.js"), context, { filename: "app.js" });
  vm.runInContext(read("member-recovery.js"), context, { filename: "member-recovery.js" });
  vm.runInContext(read("pack-orders.js"), context, { filename: "pack-orders.js" });
  window.NODash.toast = (title, text, kind) => toasts.push([title, text || "", kind || "ok"]);
  const $ = (id) => doc.getElementById(id), mr = $("mr-root"), body = $("po-body");
  const all = (n, test) => n.all(test);
  const buttons = (n) => all(n, (x) => x.tagName === "BUTTON");
  const press = (n, label, i = 0) => buttons(n).filter((b) => b.textContent === label || b.getAttribute("aria-label") === label)[i];
  const links = (n) => all(n, (x) => x.tagName === "A");
  const cls = (n, c) => all(n, (x) => x.classList.contains(c));
  const radio = (id) => $(id);
  const pick = (id) => { const r = radio(id); r.checked = true; r.fire("change"); };
  const type = (id, v) => { const i = $(id); i.value = v; i.fire("input"); };
  return { doc, calls, toasts, $, mr, body, buttons, press, links, cls, window, vw, tabs, pick, type,
    list: () => calls.map((c) => c.method + " " + c.path),
    async show() { window.NOPackOrders.show(); await settle(); },
    async open(label = "Help this member sign in, order SMP00042") { press(body, label).click(); await settle(); } };
}

const matchedAll = (d) => { for (const k of ["full_name", "delivery_address", "pack_order_number"]) d.pick(`mr-${k}-matched`); };

test("the page: Orders carries the recovery slot, its stylesheet and script, no inline script, and pack-orders hooks it guardedly", () => {
  assert.ok(HTML.includes('<div id="mr-root" hidden></div>'));
  assert.ok(HTML.includes('/assets/css/member-recovery.css?v=') && HTML.includes('/assets/js/member-recovery.js?v='));
  assert.ok(HTML.indexOf("member-recovery.js") < HTML.indexOf("pack-orders.js"), "member-recovery.js loads first, so pack-orders.js can wire it");
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(HTML), "no inline script");
  const po = read("pack-orders.js");
  assert.ok(/window\.NOMemberRecovery \|\| null/.test(po) && /MR\(\)\.load\(S\.site, S\.rows\)/.test(po) && /MR\(\)\.reset\(\)/.test(po), "guarded hooks: load, reset");
});

test("the focus is light blue, never gold, and nothing sideways at 390 px", () => {
  assert.ok(!/#f2d99b|#c59a3b|var\(--gold\)|var\(--cat\)/i.test(CSS), "no gold");
  assert.match(CSS, /\.mr-input:focus[^{]*\{[^}]*border-color:var\(--link\)/);
  assert.match(CSS, /\.mr-seg label:has\(input:checked\)\{border-color:var\(--link\)/);
  assert.ok(!/tabindex/.test(read("member-recovery.js").replace('t.setAttribute("tabindex", "-1")', "")), "only the h1 is programmatically focusable");
  assert.match(CSS, /\.mr-wrap>\*\{min-width:0\}/);
});

test("entry (mockup 01): one read of the members by order; a button on each order that has an open member, the hold as a chip, none without a member", async () => {
  const d = boot();
  await d.show();
  const by = d.calls.filter((c) => c.path.startsWith(MEMBERS + "by-order/"));
  assert.equal(by.length, 1);
  assert.equal(by[0].path, MEMBERS + "by-order/?ids=ord_42,ord_38,ord_37");
  assert.equal(by[0].credentials, "include");
  assert.ok(!d.calls.some((c) => /members\/\?q=/.test(c.path)), "the dash never searches members");
  assert.deepEqual(d.buttons(d.body).filter((b) => b.textContent === "Help this member sign in").map((b) => b.getAttribute("aria-label")),
    ["Help this member sign in, order SMP00042", "Help this member sign in, order SMP00038"]);
  assert.deepEqual(d.cls(d.body, "mr-chip").map((c) => c.textContent), ["Recovery hold until Nov 14, 3:10 PM"]);
});

test("entry: while the switch is off (404) no button and no chip; a closed member has none either", async () => {
  let d = boot({ byOrderStatus: 404 });
  await d.show();
  assert.equal(d.buttons(d.body).filter((b) => /Help this member/.test(b.textContent)).length, 0);
  assert.equal(d.cls(d.body, "mr-chip").length, 0);
  d = boot({ byOrder: { ord_42: mrow({ closed: true }) } });
  await d.show();
  assert.equal(d.buttons(d.body).filter((b) => /Help this member/.test(b.textContent)).length, 0);
});

test("entry: the order detail carries the banner and its button, only for an order with a member", async () => {
  const d = boot();
  await d.show();
  d.press(d.body, "Show details", 0).click(); await settle();
  assert.equal(d.cls(d.body, "mr-banner").length, 1);
  assert.ok(d.cls(d.body, "mr-banner")[0].textContent.includes("Member lost their email and mobile?You can help them sign in with a new email after you check who they are."));
  assert.ok(d.press(d.cls(d.body, "mr-banner")[0], "Help this member sign in"));
  d.press(d.body, "Show details", 1).click(); await settle();
  assert.equal(d.cls(d.body, "mr-banner").length, 1, "the order without a member has no banner");
});

test("check (mockup 02): opening goes straight to the member, hides the list, shows the checklist from the API", async () => {
  const d = boot({ handlers: { "GET mem_1/recovery/": () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(detail(BY_ORDER.ord_42, { recent_recoveries: [{ field: "email", old_masked: "ol***@x.com", new_masked: "ma***@gmail.com", at: "2026-11-10T02:00:00+00:00" }] })) }) } });
  await d.show();
  await d.open();
  assert.ok(d.list().includes("GET " + MEMBERS + "mem_1/recovery/"));
  assert.equal(d.mr.hidden, false);
  assert.equal(d.vw.hidden, true);
  assert.equal(d.tabs.hidden, true);
  assert.equal(d.mr.all((x) => x.tagName === "H1")[0].textContent, "Help a member sign in");
  const text = d.mr.textContent;
  for (const s of ["Back to order SMP00042", "Maria Santos", "Verified", "0917 *** 4821", "ma***@gmail.com", "Recent recoveries on this member", "Email: ol***@x.com → ma***@gmail.com",
    "Full name", "Delivery address", "Membership Package order number", "On your order records", "Maria D. Santos", "14 Mabini St., Quezon City", "All items must be Matched. A passed check lasts 15 minutes and can be used once."]) {
    assert.ok(text.includes(s), s);
  }
  assert.ok(!text.includes("Payout account"), "an item that does not apply is not shown");
  assert.ok(text.includes("SMP00042"), "the order number stands in for the item's reference");
  assert.ok(!text.includes("Recovery hold: running"));
  assert.deepEqual(d.buttons(d.mr).map((b) => b.textContent), ["Check", "Cancel"]);
});

test("check: a running hold shows on the member card and does not stop the check", async () => {
  const d = boot({ handlers: { "GET mem_2/recovery/": () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(detail(BY_ORDER.ord_38)) }) } });
  await d.show();
  await d.open("Help this member sign in, order SMP00038");
  assert.ok(d.mr.textContent.includes("Recovery hold: running until Nov 14, 3:10 PM"));
  assert.ok(d.press(d.mr, "Check"));
});

test("check: unanswered items are asked for, nothing is sent", async () => {
  const d = boot({ handlers: { "GET mem_1/recovery/": () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(detail(BY_ORDER.ord_42)) }) } });
  await d.show(); await d.open();
  d.pick("mr-full_name-matched");
  d.press(d.mr, "Check").click(); await settle();
  assert.ok(d.mr.textContent.includes("Mark each item Matched or Not matched."));
  assert.ok(!d.list().some((c) => c.includes("/check/")));
});

test("not matched (mockup 05): a failed check says nothing about which item, saves nothing, and Check again resets; repeated fails do not lock", async () => {
  let n = 0;
  const d = boot({ handlers: {
    "GET mem_1/recovery/": () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(detail(BY_ORDER.ord_42)) }),
    "POST mem_1/recovery/check/": () => { n++; return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ check_id: "11", passed: false, expires_at: "2026-11-13T10:15:00+00:00" }) }); } } });
  await d.show(); await d.open();
  d.pick("mr-full_name-not_matched"); d.pick("mr-delivery_address-matched"); d.pick("mr-pack_order_number-matched");
  d.press(d.mr, "Check").click(); await settle();
  assert.deepEqual(d.calls.find((c) => c.path.endsWith("/check/")).body, { answers: { full_name: "not_matched", delivery_address: "matched", pack_order_number: "matched" } });
  const t = d.mr.textContent;
  assert.ok(t.includes("Could not confirm this member") && t.includes("Do not change their contact. Nothing was saved. You can check again."));
  assert.ok(!/Full name|Delivery address/.test(t.slice(t.indexOf("Could not confirm"))), "the item is not named");
  d.press(d.mr, "Check again").click(); await settle();
  assert.ok(d.press(d.mr, "Check"));
  matchedAll(d); d.pick("mr-full_name-not_matched");
  d.press(d.mr, "Check").click(); await settle();
  assert.equal(n, 2);
  assert.ok(d.mr.textContent.includes("Could not confirm this member"), "no lock, no 'try again tomorrow'");
  assert.ok(!/tomorrow/i.test(d.mr.textContent));
});

test("a 429 or any other refusal of the check is shown as the server words it", async () => {
  const d = boot({ handlers: {
    "GET mem_1/recovery/": () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(detail(BY_ORDER.ord_42)) }),
    "POST mem_1/recovery/check/": () => Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve(err("rate_limited", "Too many tries. Wait a little and try again.")) }) } });
  await d.show(); await d.open();
  matchedAll(d);
  d.press(d.mr, "Check").click(); await settle();
  assert.ok(d.mr.textContent.includes("Too many tries. Wait a little and try again."));
  assert.ok(d.press(d.mr, "Check"), "still on the check");
});

test("closed member (mockup 05): the detail or the check answers member_closed", async () => {
  const d = boot({ handlers: { "GET mem_1/recovery/": () => Promise.resolve({ ok: false, status: 409, json: () => Promise.resolve(err("member_closed", "This member's account is closed.")) }) } });
  await d.show(); await d.open();
  assert.ok(d.mr.textContent.includes("This member account is closed") && d.mr.textContent.includes("A closed member cannot be helped to sign in."));
  d.press(d.mr, "Back to order SMP00042").click(); await settle();
  assert.equal(d.vw.hidden, false);
});

function happy(extra = {}) {
  return { handlers: {
    "GET mem_1/recovery/": () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(detail(BY_ORDER.ord_42)) }),
    "POST mem_1/recovery/check/": () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ check_id: "7", passed: true, expires_at: new Date(Date.now() + 14 * 60000).toISOString() }) }),
    ...extra } };
}
async function toContact(d) { await d.show(); await d.open(); matchedAll(d); d.press(d.mr, "Check").click(); await settle(); }

test("new contact (mockup 03): a pass opens the form with minutes left and the warning; an empty email is refused on the spot", async () => {
  const d = boot(happy());
  await toContact(d);
  assert.deepEqual(d.calls.find((c) => c.path.endsWith("/check/")).body, { answers: { full_name: "matched", delivery_address: "matched", pack_order_number: "matched" } });
  const t = d.mr.textContent;
  for (const s of ["Check passed for Maria Santos", "You have 14 minutes to finish. The check works once.", "New contact for Maria Santos", "New email (required)", "New mobile (optional)", "The member confirms it later on their Account page.",
    "This signs the member out everywhere and pauses payout changes and withdrawals for 24 hours. Their old email and mobile are told about it."]) assert.ok(t.includes(s), s);
  assert.ok(!t.includes("Saving restarts the 24-hour hold"), "no hold, no note");
  d.mr.all((x) => x.tagName === "FORM")[0].fire("submit"); await settle();
  assert.ok(d.mr.textContent.includes("Enter the member's new email. They sign in with it."));
  assert.ok(!d.calls.some((c) => c.method === "POST" && c.path === MEMBERS + "mem_1/recovery/"));
  assert.equal(d.$("mr-email").getAttribute("aria-invalid"), "true");
});

test("new contact: with a hold running a one-line note says saving restarts the 24 hours", async () => {
  const d = boot({ handlers: { ...happy().handlers, "GET mem_1/recovery/": () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(detail({ ...BY_ORDER.ord_42, hold_ends_at: HOLD })) }) } });
  await toContact(d);
  assert.ok(d.mr.textContent.includes("A recovery hold is already running for this member (until Nov 14, 3:10 PM). Saving restarts the 24-hour hold."));
});

test("saved (mockup 04): the new email goes with the check id; the facts come from the answer; Done returns to the order", async () => {
  const d = boot(happy({ "POST mem_1/recovery/": () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ saved_message: "Saved.", hold_ends_at: HOLD, hold_ends_display: "x", email_masked: "ma***@gmail.com", mobile_masked: "0917 *** 1111" }) }) }));
  await toContact(d);
  d.type("mr-email", " maria.new@gmail.com "); d.type("mr-mobile", "09171231111");
  d.mr.all((x) => x.tagName === "FORM")[0].fire("submit"); await settle();
  const post = d.calls.find((c) => c.method === "POST" && c.path === MEMBERS + "mem_1/recovery/");
  assert.deepEqual(post.body, { check_id: "7", new_email: "maria.new@gmail.com", new_mobile: "09171231111" });
  const t = d.mr.textContent;
  for (const s of ["Saved", "New contact saved for Maria Santos", "Tell Maria to open your store's sign-in page and sign in with the new email.", "ma***@gmail.com (waiting for the first sign-in)", "0917 *** 1111", "Signed out everywhere",
    "Until Nov 14, 3:10 PM", "While the hold runs", "Maria cannot change their payout details or request a withdrawal"]) assert.ok(t.includes(s), s);
  assert.ok(!t.includes("maria.new@gmail.com"), "the full email is never shown back");
  assert.deepEqual(d.toasts, [["New contact saved", "", "ok"]]);
  assert.deepEqual(d.buttons(d.mr).map((b) => b.textContent), ["Done", "Help another member"]);
  const by0 = d.calls.filter((c) => c.path.startsWith(MEMBERS + "by-order/")).length;
  d.press(d.mr, "Done").click(); await settle();
  assert.equal(d.vw.hidden, false); assert.equal(d.mr.hidden, true); assert.equal(d.tabs.hidden, false);
  assert.equal(d.calls.filter((c) => c.path.startsWith(MEMBERS + "by-order/")).length, by0 + 1, "the list reads the members again: the hold may have changed");
});

test("saved: Help another member goes back to the list with the order closed; mobile left out reads Not added", async () => {
  const d = boot(happy({ "POST mem_1/recovery/": () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ hold_ends_at: HOLD, email_masked: "ma***@gmail.com", mobile_masked: "0917 *** 4821" }) }) }));
  await toContact(d);
  d.type("mr-email", "maria.new@gmail.com");
  d.mr.all((x) => x.tagName === "FORM")[0].fire("submit"); await settle();
  assert.equal(d.calls.find((c) => c.method === "POST" && c.path === MEMBERS + "mem_1/recovery/").body.new_mobile, "");
  assert.ok(d.mr.textContent.includes("Not added"));
  d.press(d.mr, "Help another member").click(); await settle();
  assert.equal(d.vw.hidden, false);
});

test("leaving the flow: Done, Cancel and Back to order scroll that order's row into view and focus its details button; Help another member focuses the heading", async () => {
  const saved = { "POST mem_1/recovery/": () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ hold_ends_at: HOLD, email_masked: "ma***@gmail.com", mobile_masked: "0917 *** 4821" }) }) };
  const prep = async (extra) => { /* the first order's flow, with every drawn node recording scrollIntoView */
    const d = boot(happy(extra)), scrolled = [], make = d.doc.createElement;
    d.doc.createElement = (tag) => { const n = make(tag); n.scrollIntoView = (o) => scrolled.push([n.id, o && o.block]); return n; };
    await toContact(d);
    return { d, scrolled };
  };
  const save = async (d) => { d.type("mr-email", "maria.new@gmail.com"); d.mr.all((x) => x.tagName === "FORM")[0].fire("submit"); await settle(); };
  const expectOnRow = (d, scrolled) => {
    const btn = d.$("pk-row-ord_42").all((x) => x.tagName === "BUTTON" && x.hasAttribute("aria-expanded"))[0];
    assert.ok(btn, "the order's details button exists");
    assert.ok(d.doc.activeElement === btn, "focus is on the order's own control, not the page body");
    assert.ok(scrolled.some((s) => s[0] === "pk-row-ord_42" && s[1] === "center"), "that row was scrolled into view");
  };
  for (const [label, extra] of [["Done", saved], ["Cancel", {}]]) {
    const { d, scrolled } = await prep(extra);
    if (label === "Done") await save(d);
    d.doc.activeElement = d.doc.body; /* what the browser leaves once the flow's nodes are gone */
    d.press(d.mr, label).click(); await settle();
    expectOnRow(d, scrolled);
  }
  const { d } = await prep(saved);
  await save(d);
  d.doc.activeElement = d.doc.body;
  d.press(d.mr, "Help another member").click(); await settle();
  assert.ok(d.doc.activeElement === d.$("h-orders"), "the page heading takes focus");
});

test("errors: a taken email shows on the field; an expired check shows the expired state with Check again; 429 is generic; member_closed closes", async () => {
  const answers = [
    { ok: false, status: 422, body: err("contact_in_use", "That email already belongs to another member. Use a different email.", { new_email: ["That email already belongs to another member. Use a different email."] }) },
    { ok: false, status: 429, body: err("rate_limited", "You have reached today's limit. Try again tomorrow.") },
    { ok: false, status: 409, body: err("recovery_check_invalid", "Complete the recovery checklist again before changing a contact.") },
  ];
  let i = 0;
  const d = boot(happy({ "POST mem_1/recovery/": () => { const a = answers[i++]; return Promise.resolve({ ok: a.ok, status: a.status, json: () => Promise.resolve(a.body) }); } }));
  await toContact(d);
  d.type("mr-email", "ma.taken@gmail.com");
  const form = () => d.mr.all((x) => x.tagName === "FORM")[0];
  form().fire("submit"); await settle();
  assert.ok(d.mr.textContent.includes("That email already belongs to another member. Use a different email."));
  assert.equal(d.$("mr-email").value, "ma.taken@gmail.com", "what was typed stays");
  form().fire("submit"); await settle();
  assert.ok(d.mr.textContent.includes("You have reached today's limit. Try again tomorrow."));
  form().fire("submit"); await settle();
  assert.ok(d.mr.textContent.includes("Check expired") && d.mr.textContent.includes("The 15-minute check ran out. Go back and check the member again."));
  d.press(d.mr, "Check again").click(); await settle();
  assert.ok(d.press(d.mr, "Check"), "back at the checklist, answers cleared");
  assert.equal(d.$("mr-full_name-matched").checked, false);
});

test("leaving Orders resets the flow and shows the list again", async () => {
  const d = boot(happy());
  await d.show(); await d.open();
  assert.equal(d.vw.hidden, true);
  d.window.NOPackOrders.hide();
  assert.equal(d.vw.hidden, false); assert.equal(d.tabs.hidden, false); assert.equal(d.mr.hidden, true); assert.equal(d.mr.childNodes.length, 0);
});

test("pack-orders still works without member-recovery.js", () => {
  assert.ok(/MR\(\) \? MR\(\)\.holdChip\(o\) : null/.test(read("pack-orders.js")));
});
