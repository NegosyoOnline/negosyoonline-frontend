/* Orders > Registrations (ClickUp z8uq9meyqj). Driven like member-recovery.test.mjs: the real app.js, pack-orders.js and registrations.js,
   a small stand-in document (dom.mjs) and a recorded fetch answering the owner API's registrations routes (backend apps/pack/api_owner.py). */
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
const CSS = fs.readFileSync(path.join(PUBLIC, "assets", "css", "registrations.css"), "utf8");
const A = "site_aaaaaaaaaaaaaaaaaaaa";
const REGS = `/sites/${A}/pack/registrations/`;
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 14; i++) await tick(); };
const err = (code, message, fields) => ({ error: { code, message, fields: fields || {} } });

const ADDRESS = { line: "12 Rizal St", barangay: "Poblacion", city: "Naga", province: "Camarines Sur", zip: "4400", receiver_name: "Maria Santos" };
const DETAILS = { date_of_birth: "1990-05-17", desired_username: "mariasantos90", alternate_username: "msantos1990", mobile: "+639171234567", delivery_address: ADDRESS, details_erased: false };
const reg = (o) => ({ id: "mem_1", name: "Maria Santos", status: "ready_to_register", order_number: "SMP00042", state_version: 2, status_entered_at: "2026-11-13T01:00:00+00:00",
  sante_member_id: "", registered_at: null, email: null, details: DETAILS, ...o });
const TO_REGISTER = [reg({}), reg({ id: "mem_2", name: "Carlo Mendoza", status: "in_registration", order_number: "SMP00038", state_version: 3 })];
const DONE = [{ id: "mem_3", name: "Liza Ramos", status: "registered", order_number: "SMP00037", state_version: 4, status_entered_at: "2026-11-13T02:00:00+00:00",
  sante_member_id: "SA-1234567", registered_at: "2026-11-13T02:00:00+00:00", email: { state: "sent", attempts: 1, last_error_code: "", sent_at: "2026-11-13T02:00:05+00:00", gave_up_at: null } }];

function boot({ lists = {}, handlers = {} } = {}) {
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
  for (const t of ["overview", "product", "pack", "registrations"]) { const a = doc.createElement("a"); a.setAttribute("data-tab", t); a.textContent = t; tabs.appendChild(a); }
  const vw = doc.createElement("div"); vw.setAttribute("id", "view-pack-orders"); page.appendChild(vw);
  for (const id of ["po-sub", "po-body"]) { const n = doc.createElement("div"); n.setAttribute("id", id); vw.appendChild(n); }
  for (const id of ["po-dlg-slot", "reg-root"]) { const n = doc.createElement("div"); n.setAttribute("id", id); page.appendChild(n); }
  doc.getElementById("reg-root").hidden = true;
  const state = { to_register: lists.to_register || TO_REGISTER, registered: lists.registered || DONE, status: lists.status || 200 };
  const fetch = (url, opts) => {
    const p = url.replace("http://api.test/v1", ""), body = opts.body ? JSON.parse(opts.body) : null, method = opts.method || "GET";
    calls.push({ method, path: p, body, credentials: opts.credentials });
    const res = (status, b) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(b), blob: () => Promise.resolve({}) });
    if (p === "/sites/") return res(200, { items: [{ id: A, template: "sante" }], next_cursor: null });
    if (p === `/sites/${A}/pack/orders/?filter=all`) return res(200, { orders: [] });
    if (p.startsWith(REGS + "?filter=")) return state.status === 200 ? res(200, { registrations: state[p.split("=")[1]] }) : res(state.status, err("not_found", "Not found."));
    const key = method + " " + p.replace(REGS, "");
    for (const k of Object.keys(handlers)) if (key.startsWith(k)) return handlers[k](body, res, state);
    return res(404, err("not_found", "Not found."));
  };
  const window = { NO_CONFIG: { apiBase: "http://api.test/v1", siteUrl: "http://www.test" }, addEventListener() {}, removeEventListener() {}, innerHeight: 800, open() {} };
  const storage = { getItem: () => null, removeItem() {}, setItem() {} };
  const context = vm.createContext({ window, document: doc, location: { search: "", pathname: "/orders/", replace() {}, assign() {} }, console, URLSearchParams, Promise, setTimeout, clearTimeout, Intl,
    localStorage: storage, sessionStorage: storage, requestAnimationFrame() {}, fetch, URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} } });
  vm.runInContext(read("app.js"), context, { filename: "app.js" });
  vm.runInContext(read("registrations.js"), context, { filename: "registrations.js" });
  vm.runInContext(read("pack-orders.js"), context, { filename: "pack-orders.js" });
  window.NODash.toast = (title, text, kind) => toasts.push([title, text || "", kind || "ok"]);
  const $ = (id) => doc.getElementById(id), root = $("reg-root");
  const all = (n, test) => n.all(test);
  const buttons = (n) => all(n, (x) => x.tagName === "BUTTON");
  const press = (n, label, i = 0) => buttons(n).filter((b) => b.textContent === label)[i];
  const cls = (n, c) => all(n, (x) => x.classList.contains(c));
  const text = (n) => all(n, () => true).map((x) => x.text || x.textContent || "").join(" ");
  return { doc, calls, toasts, $, root, vw, tabs, buttons, press, cls, text, state,
    list: () => calls.map((c) => c.method + " " + c.path),
    async show() { window.NOPackOrders.show(); await settle(); },
    async tab(name) { const a = tabs.children.filter((x) => x.getAttribute("data-tab") === name)[0]; a.fire("click", { preventDefault() {} }); await settle(); } };
}

test("the page: the Registrations tab, its panel, stylesheet and script; no inline script; registrations.js loads before pack-orders.js", () => {
  const view = HTML.slice(HTML.indexOf('id="orders-tabs"'), HTML.indexOf('id="orders-tabs"') + 400);
  assert.ok(view.includes('<a href="#" data-tab="registrations">Registrations</a>'));
  assert.ok(HTML.includes('<div id="reg-root" hidden></div>'));
  assert.ok(HTML.includes("/assets/css/registrations.css?v=") && HTML.includes("/assets/js/registrations.js?v="));
  assert.ok(HTML.indexOf("registrations.js") < HTML.indexOf("pack-orders.js"));
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(HTML), "no inline script");
});

test("the focus is light blue, never gold; only the API's strings go through textContent", () => {
  assert.ok(!/#f2d99b|#c59a3b|var\(--gold\)|var\(--cat\)/i.test(CSS), "no gold");
  assert.match(CSS, /\.rg-input:focus[^{]*\{[^}]*border-color:var\(--link\)/);
  assert.ok(!/innerHTML|insertAdjacentHTML/.test(read("registrations.js")));
  assert.ok(!/tabindex/.test(read("registrations.js")), "card titles are not focusable");
});

test("opening the tab reads the to-register list with the session and shows details and the right button per status", async () => {
  const d = boot();
  await d.show(); await d.tab("registrations");
  assert.ok(d.list().includes(`GET ${REGS}?filter=to_register`));
  assert.equal(d.calls.find((c) => c.path.startsWith(REGS)).credentials, "include");
  assert.equal(d.root.hidden, false);
  assert.equal(d.vw.hidden, true);
  const t = d.text(d.root);
  for (const s of ["Maria Santos", "May 17, 1990", "mariasantos90", "msantos1990", "+639171234567", "12 Rizal St", "Ready to register", "In registration"]) assert.ok(t.includes(s), s);
  assert.equal(d.buttons(d.root).filter((b) => b.textContent === "Start registration").length, 1);
  assert.equal(d.buttons(d.root).filter((b) => b.textContent === "Mark registered").length, 1);
});

test("Start posts the row's state_version, toasts, and reloads", async () => {
  const d = boot({ handlers: { "POST mem_1/start/": (body, res) => res(200, reg({ status: "in_registration", state_version: 3 })) } });
  await d.show(); await d.tab("registrations");
  d.press(d.root, "Start registration").fire("click"); await settle();
  const post = d.calls.find((c) => c.method === "POST");
  assert.equal(post.path, REGS + "mem_1/start/");
  assert.deepEqual(post.body, { state_version: 2 });
  assert.equal(d.toasts[0][0], "Registration started");
  assert.equal(d.list().filter((x) => x === `GET ${REGS}?filter=to_register`).length, 2, "the list is read again");
});

test("Mark registered asks for the Santé member ID, posts it, shows an API field error, and never posts an empty form twice at once", async () => {
  const seen = [];
  const d = boot({ handlers: { "POST mem_2/registered/": (body, res) => { seen.push(body); return body.sante_member_id === "SA-1" ? res(200, {}) : res(422, err("invalid_success", "Check the highlighted fields.", { sante_member_id: ["Enter the Santé member ID."] })); } } });
  await d.show(); await d.tab("registrations");
  d.press(d.root, "Mark registered").fire("click"); await settle();
  const input = d.$("rg-sid"); assert.ok(input);
  input.value = "bad id"; input.fire("input");
  d.press(d.root, "Mark registered").fire("click"); await settle();
  assert.deepEqual(seen[0], { state_version: 3, sante_member_id: "bad id" });
  assert.ok(d.text(d.root).includes("Enter the Santé member ID."));
  assert.equal(d.$("rg-sid").getAttribute("aria-invalid"), "true");
  const input2 = d.$("rg-sid"); input2.value = "SA-1"; input2.fire("input");
  d.press(d.root, "Mark registered").fire("click"); await settle();
  assert.equal(seen[1].sante_member_id, "SA-1");
  assert.equal(d.toasts.at(-1)[0], "Marked as registered");
  assert.equal(d.$("rg-sid"), null, "the form closes");
});

test("a 409 reloads and says so; nothing else changes", async () => {
  const d = boot({ handlers: { "POST mem_1/start/": (body, res) => res(409, err("stale", "This registration changed.")) } });
  await d.show(); await d.tab("registrations");
  d.press(d.root, "Start registration").fire("click"); await settle();
  assert.equal(d.toasts[0][2], "error");
  assert.equal(d.list().filter((x) => x === `GET ${REGS}?filter=to_register`).length, 2);
});

test("the Registered view shows name, ID, date and the email state, and never the encoding details", async () => {
  const d = boot();
  await d.show(); await d.tab("registrations");
  d.press(d.root, "Registered").fire("click"); await settle();
  assert.ok(d.list().includes(`GET ${REGS}?filter=registered`));
  const t = d.text(d.root);
  for (const s of ["Liza Ramos", "SA-1234567", "Email sent"]) assert.ok(t.includes(s), s);
  for (const s of ["1990", "mariasantos90", "Rizal", "+63917"]) assert.ok(!t.includes(s), s);
  assert.equal(d.buttons(d.root).filter((b) => /Start|Mark registered/.test(b.textContent)).length, 0);
});

test("the three email states: sending/failed and trying again, and gave up with the reason", async () => {
  const mk = (email) => [{ ...DONE[0], email }];
  let d = boot({ lists: { registered: mk({ state: "retrying", attempts: 2, last_error_code: "no_verified_email", sent_at: null, gave_up_at: null }) } });
  await d.show(); await d.tab("registrations"); d.press(d.root, "Registered").fire("click"); await settle();
  let t = d.text(d.root);
  assert.ok(t.includes("Email failed, trying again") && t.includes("The member's email is not verified.") && t.includes("Tried 2 times."));
  assert.equal(d.cls(d.root, "chip-warn").length, 1);
  d = boot({ lists: { registered: mk({ state: "gave_up", attempts: 7, last_error_code: "email_not_sent", sent_at: null, gave_up_at: "2026-11-15T00:00:00+00:00" }) } });
  await d.show(); await d.tab("registrations"); d.press(d.root, "Registered").fire("click"); await settle();
  t = d.text(d.root);
  assert.ok(t.includes("Email not sent") && t.includes("We gave up after 7 tries.") && t.includes("Contact the member yourself."));
  assert.equal(d.cls(d.root, "chip-danger").length, 1);
  d = boot({ lists: { registered: mk({ state: "sending", attempts: 0, last_error_code: "", sent_at: null, gave_up_at: null }) } });
  await d.show(); await d.tab("registrations"); d.press(d.root, "Registered").fire("click"); await settle();
  assert.ok(d.text(d.root).includes("Email sending"));
});

test("erased details are shown as such; a 404 (not a Santé site) and an empty list say so; leaving the tab hides the panel", async () => {
  let d = boot({ lists: { to_register: [reg({ details: { ...DETAILS, date_of_birth: null, desired_username: "", alternate_username: "", details_erased: true } })] } });
  await d.show(); await d.tab("registrations");
  assert.ok(d.text(d.root).includes("Erased or not given"));
  d = boot({ lists: { status: 404 } });
  await d.show(); await d.tab("registrations");
  assert.ok(d.text(d.root).includes("Nothing to register here"));
  d = boot({ lists: { to_register: [] } });
  await d.show(); await d.tab("registrations");
  assert.ok(d.text(d.root).includes("No one is waiting to be registered"));
  await d.tab("pack");
  assert.equal(d.root.hidden, true);
  assert.equal(d.vw.hidden, false);
});
