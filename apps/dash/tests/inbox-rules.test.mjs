/* Settings > Inbox > "Comment auto-replies" (ClickUp z8uq9mg9pk, COMMENTS C4 FE): inbox-rules.js against the C2 contract (backend
   docs/c2-api-contract.md). The real scripts (app.js, inbox.js, inbox-settings.js, inbox-rules.js) run in a vm with the stand-in document
   from dom.mjs and a recorded fetch that plays the API. Fake data only: no Facebook call, no real comment. */
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
const CSS = fs.readFileSync(path.join(JS, "..", "css", "inbox.css"), "utf8");
const A = "site_aaaaaaaaaaaaaaaaaaaa";
const BASE = `/sites/${A}/inquiries/`, RB = BASE + "comment-rules/";
const R1 = "cr_000000000000000000000001", R2 = "cr_000000000000000000000002";
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 8; i++) await tick(); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const POSTS = [{ id: "1_1", is_ad: false, caption: "Fresh mangoes", permalink: "https://www.facebook.com/1_1" }, { id: "1_2", is_ad: true, caption: "Summer sale ad", permalink: null }];
const rule = (over = {}) => ({ ref: R1, enabled: true, trigger: "keywords", keywords: ["price", "magkano"], scope: "all", post_ids: [], posts: [], public_text: "{Hi|Hello} {name}!", private_text: "{Hi|Hello} {name}, details: example.com", public_variants: 2, private_variants: 2, ...over });
const automation = (over = {}) => ({ enabled: true, active: true, ready: true, reason: "", banner: null, today: { count: 12, cap: 300, date: "2026-11-19" }, hour: { count: 3, cap: 30 }, limits: { max_rules: 20 }, ...over });
const CM_OK = { enabled: true, connected: true, page_name: "Santé Beauty", ready: true, reason: "" };
const M_ACTIVE = { status: "active", page_id: "111", page_name: "Santé Beauty", connected_at: "2026-11-18T00:00:00Z", pick_pending: false };

function boot({ rules = [rule()], auto = automation(), off = false, cm = CM_OK, putAnswer = null, previewer = null } = {}) {
  const doc = makeDocument(), calls = [], toasts = [];
  const make = doc.createElement;
  doc.createElement = (tag) => { const n = make(tag); n.replaceChild = (fresh, old) => { n.insertBefore(fresh, old); n.removeChild(old); return old; }; n.dispatchEvent = (e) => n.fire(e.type); return n; };
  const page = doc.body.appendChild(doc.createElement("div"));
  for (const id of ["ib-root", "ib-live", "ibs-root", "ibs-live"]) { const n = doc.createElement("div"); n.setAttribute("id", id); page.appendChild(n); }
  doc.querySelectorAll = () => [];
  const s = { rules: rules.map((r) => ({ ...r })), auto: { ...auto }, off, putAnswer, n: 2 };
  const fetch = (url, opts) => {
    const p = url.replace("http://api.test/v1", ""), body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ method: opts.method, path: p, body });
    let a = { status: 404, body: { error: { code: "not_found", message: "Not found." } } };
    if (opts.method === "GET" && p === "/sites/") a = { status: 200, body: { items: [{ id: A, template: "sante" }], next_cursor: null } };
    else if (p === BASE + "channels/") a = { status: 200, body: { webchat_enabled: false, paused_until: null } };
    else if (p === BASE + "messenger/connection/") a = { status: 200, body: M_ACTIVE };
    else if (p === BASE + "comments/status/") a = cm ? { status: 200, body: cm } : a;
    else if (p.startsWith(RB) && s.off) a = a;
    else if (p === RB && opts.method === "GET") a = { status: 200, body: { automation: s.auto, rules: s.rules } };
    else if (p === RB + "automation/" && opts.method === "PUT") { s.auto = { ...s.auto, enabled: body.enabled, active: body.enabled && s.auto.ready, banner: body.enabled ? null : s.auto.banner }; a = { status: 200, body: s.auto }; }
    else if (p === RB + "preview/") a = { status: 200, body: previewer ? previewer(body) : { valid: true, error: null, variant_count: 2, samples: ["Hi Maria!", "Hello Maria!"] } };
    else if (p.startsWith(RB + "posts/")) {
      const q = /[?&]q=([^&]*)/.exec(p), cur = /cursor=([^&]*)/.exec(p);
      a = { status: 200, body: cur ? { items: [{ id: "1_3", is_ad: false, caption: "Page two post", permalink: null }], next_cursor: null } : { items: q ? POSTS.filter((x) => x.caption.toLowerCase().includes(decodeURIComponent(q[1]).toLowerCase())) : POSTS, next_cursor: q ? null : "30" } };
    }
    else if (p === RB && opts.method === "POST") a = s.putAnswer || (() => { s.n++; const r = rule({ ref: "cr_00000000000000000000000" + s.n, ...body, posts: [], public_variants: 2, private_variants: 0 }); s.rules.push(r); return { status: 201, body: r }; })();
    else if (/comment-rules\/cr_\w+\/$/.test(p) && opts.method === "PUT") {
      const ref = /(cr_\w+)\/$/.exec(p)[1];
      a = s.putAnswer || (() => { s.rules = s.rules.map((r) => (r.ref === ref ? { ...r, ...body } : r)); return { status: 200, body: s.rules.find((r) => r.ref === ref) }; })();
    }
    else if (/comment-rules\/cr_\w+\/$/.test(p) && opts.method === "DELETE") { const ref = /(cr_\w+)\/$/.exec(p)[1]; s.rules = s.rules.filter((r) => r.ref !== ref); a = { status: 200, body: { deleted: true } }; }
    return Promise.resolve({ ok: a.status >= 200 && a.status < 300, status: a.status, json: () => Promise.resolve(a.body) });
  };
  const storage = { getItem: () => null, removeItem() {}, setItem() {} };
  const window = { NO_CONFIG: { apiBase: "http://api.test/v1", siteUrl: "http://www.test" }, addEventListener() {}, removeEventListener() {}, innerHeight: 800, history: { replaceState() {} } };
  const location = { search: "", pathname: "/settings/inbox/", replace() {}, assign() {}, href: "" };
  const context = vm.createContext({ window, document: doc, Event: class { constructor(type) { this.type = type; } }, location, console, URLSearchParams, Promise, Intl, Uint8Array, Date,
    setTimeout, clearTimeout, localStorage: storage, sessionStorage: storage, requestAnimationFrame() {}, fetch });
  for (const f of ["app.js", "inbox.js", "inbox-settings.js", "inbox-rules.js"]) vm.runInContext(read(f), context, { filename: f });
  window.NODash.toast = (title, text) => toasts.push(title + ": " + text);
  const $ = (id) => doc.getElementById(id);
  return { doc, calls, toasts, s, window, location, $, text: (id) => $(id).textContent, list: () => calls.map((c) => c.method + " " + c.path),
    all: (n, c) => n.all((x) => x.classList.contains(c)),
    async open() { window.NOInboxSettings.show(); await settle(); await settle(); },
    async click(n) { n.fire("click"); await settle(); },
    async type(n, v) { n.value = v; n.fire("input"); await sleep(420); await settle(); },
    async pick(id, v) { const n = $(id); n.value = v; n.fire("change"); await settle(); } };
}

test("the editor is not drawn when GET comment-rules/ is 404, and not asked for when comments/status is 404", async () => {
  const off = boot({ off: true });
  await off.open();
  assert.ok(off.list().includes("GET " + RB));
  assert.equal(off.$("pm-h-cr"), null);
  assert.ok(off.$("pm-h-fm"));
  const nocm = boot({ cm: null });
  await nocm.open();
  assert.ok(!nocm.list().includes("GET " + RB));
  assert.equal(nocm.$("pm-h-cr"), null);
});

test("rules list, counters, master switch and per-rule switch", async () => {
  const d = boot({ rules: [rule(), rule({ ref: R2, enabled: false, trigger: "any", scope: "selected", post_ids: ["1_1"], posts: [POSTS[0]], public_text: "Thanks {Maria|friend}" })] });
  await d.open();
  assert.equal(d.text("pm-h-cr"), "Comment auto-replies");
  assert.equal(d.text("ibr-counters"), "Today: 12 of 300This hour: 3 of 30");
  assert.equal(d.text("ibr-rl-0"), "Containing: price, magkano");
  assert.match(d.$("ibr-rl-1").parentNode.textContent, /Any comment|Where: 1 selected post or ad/);
  assert.equal(d.$("ibr-sw-master").getAttribute("aria-checked"), "true");
  assert.equal(d.$("ibr-sw-1").getAttribute("aria-checked"), "false");
  await d.click(d.$("ibr-sw-master"));
  assert.deepEqual(d.calls.filter((c) => c.path === RB + "automation/").map((c) => c.body), [{ enabled: false }]);
  assert.equal(d.$("ibr-sw-master").getAttribute("aria-checked"), "false");
  await d.click(d.$("ibr-sw-1"));
  assert.deepEqual(d.calls.find((c) => c.method === "PUT" && c.path === RB + R2 + "/").body, { enabled: true });
  assert.equal(d.$("ibr-sw-1").getAttribute("aria-checked"), "true");
});

test("banners: paused_rate_limit shows the API message and the time, needs_reenable shows its message", async () => {
  const p = boot({ auto: automation({ active: false, banner: { code: "paused_rate_limit", message: "Facebook asked us to slow down, so auto-replies are paused for 1 hour.", paused_until: "2026-11-19T04:00:00Z" } }) });
  await p.open();
  assert.match(p.text("ibr-banner"), /paused for 1 hour\./);
  assert.match(p.text("ibr-banner"), /Resumes .*12:00 PM/);
  const n = boot({ auto: automation({ enabled: false, active: false, banner: { code: "needs_reenable", message: "Auto-replies were switched off after Facebook slowed us down 3 times today. Turn them back on when you are ready.", paused_until: null } }) });
  await n.open();
  assert.match(n.text("ibr-banner"), /Turn them back on when you are ready\./);
  assert.ok(!/Resumes/.test(n.text("ibr-banner")));
  const ok = boot();
  await ok.open();
  assert.equal(ok.$("ibr-banner"), null);
});

test("not ready: permission_missing offers Turn on comments (start/?comments=1); other reasons point to Messenger", async () => {
  const d = boot({ auto: automation({ ready: false, reason: "permission_missing", active: false }), cm: { ...CM_OK, ready: false, reason: "permission_missing" } });
  await d.open();
  assert.equal(d.text("ibr-connect"), "Turn on comments");
  assert.equal(d.text("ibs-m-cm-connect"), "Turn on comments");
  await d.click(d.$("ibr-connect"));
  assert.equal(d.location.href, "http://api.test/v1" + BASE + "messenger/start/?comments=1");
  const r = boot({ auto: automation({ ready: false, reason: "reconnect", active: false }) });
  await r.open();
  assert.equal(r.$("ibr-connect"), null);
  assert.match(r.doc.body.textContent, /Connect your Facebook Page in Messenger above so auto-replies can send\./);
});

test("add rule: house dropdowns start empty, keywords and post picker show on choice, live preview, save", async () => {
  const d = boot({ rules: [] });
  await d.open();
  assert.match(d.doc.body.textContent, /No rules yet\./);
  await d.click(d.$("ibr-add"));
  await settle();
  assert.equal(d.$("ibr-when").value, "");
  assert.equal(d.$("ibr-where").value, "");
  assert.equal(d.all(d.$("ibr-form"), "ib-combo").length, 2);
  assert.deepEqual(d.all(d.$("ibr-form"), "ib-combo-input").map((n) => n.getAttribute("placeholder")), ["Choose when", "Choose where"]);
  assert.equal(d.$("ibr-keywords-field").hidden, true);
  assert.equal(d.$("ibr-posts-field").hidden, true);
  await d.pick("ibr-when", "keywords");
  assert.equal(d.$("ibr-keywords-field").hidden, false);
  await d.pick("ibr-where", "selected");
  assert.equal(d.$("ibr-posts-field").hidden, false);
  assert.ok(d.list().includes("GET " + RB + "posts/"));
  await d.type(d.$("ibr-keywords"), "price, hm ,,magkano");
  await d.type(d.$("ibr-public"), "{Hi|Hello} {name}!");
  assert.equal(d.calls.filter((c) => c.path === RB + "preview/").pop().body.kind, "public");
  assert.equal(d.text("ibr-public-prev").startsWith("2 variants"), true);
  assert.match(d.text("ibr-public-prev"), /Hi Maria!/);
  /* pick a post from the picker */
  const cb = d.$("ibr-posts").all((n) => n.tagName === "INPUT" && n.attrs.type === "checkbox")[0];
  cb.checked = true; cb.fire("change"); await settle();
  assert.match(d.text("ibr-posts"), /1 post or ad selected/);
  await d.click(d.$("ibr-save"));
  const post = d.calls.find((c) => c.method === "POST" && c.path === RB);
  assert.deepEqual(post.body, { enabled: true, trigger: "keywords", scope: "selected", public_text: "{Hi|Hello} {name}!", private_text: "", keywords: ["price", "hm", "magkano"], post_ids: ["1_1"] });
  assert.equal(d.$("ibr-form"), null);
  assert.equal(d.text("ibr-rl-0"), "Containing: price, hm, magkano");
});

test("post picker: search passes q, Load more passes the cursor", async () => {
  const d = boot({ rules: [] });
  await d.open();
  await d.click(d.$("ibr-add")); await settle();
  await d.pick("ibr-where", "selected");
  assert.ok(d.$("ibr-post-more"));
  await d.click(d.$("ibr-post-more"));
  assert.ok(d.list().includes("GET " + RB + "posts/?cursor=30"));
  assert.match(d.text("ibr-posts"), /Page two post/);
  await d.type(d.$("ibr-post-q"), "sale");
  assert.ok(d.list().includes("GET " + RB + "posts/?q=sale"));
  assert.match(d.text("ibr-posts"), /Summer sale ad/);
  assert.ok(!/Fresh mangoes/.test(d.$("ibr-posts").textContent));
});

test("API 422 messages show at the field, verbatim; the form stays open", async () => {
  const msg = "Links cannot go in a public reply. Put the link in the private message.";
  const d = boot({ rules: [], putAnswer: { status: 422, body: { error: { code: "link_in_public_reply", message: "Check the form.", fields: { public_text: [msg], keywords: ["Add at least one word to look for."] } } } } });
  await d.open();
  await d.click(d.$("ibr-add")); await settle();
  await d.pick("ibr-when", "keywords"); await d.pick("ibr-where", "all");
  await d.type(d.$("ibr-public"), "see www.example.com");
  await d.click(d.$("ibr-save"));
  assert.equal(d.text("ibr-public-err"), msg);
  assert.equal(d.$("ibr-public-err").hidden, false);
  assert.equal(d.$("ibr-public").getAttribute("aria-invalid"), "true");
  assert.equal(d.text("ibr-keywords-err"), "Add at least one word to look for.");
  assert.ok(d.$("ibr-form"));
  await d.type(d.$("ibr-public"), "see us");
  assert.equal(d.$("ibr-public-err").hidden, true);
});

test("preview shows the API error while typing an invalid template", async () => {
  const d = boot({ rules: [], previewer: () => ({ valid: false, error: { code: "invalid_spintax", message: "Check the { } and | in your text." }, variant_count: 0, samples: [] }) });
  await d.open();
  await d.click(d.$("ibr-add")); await settle();
  await d.type(d.$("ibr-private"), "{Hi}");
  assert.equal(d.text("ibr-private-prev"), "Check the { } and | in your text.");
});

test("edit fills the form from the rule; delete asks first and then deletes", async () => {
  const d = boot();
  await d.open();
  await d.click(d.$("ibr-edit-0")); await settle();
  assert.equal(d.$("ibr-keywords").value, "price, magkano");
  assert.equal(d.$("ibr-public").value, "{Hi|Hello} {name}!");
  assert.equal(d.$("ibr-when").value, "keywords");
  await d.type(d.$("ibr-public"), "{Hi|Hello}!");
  await d.click(d.$("ibr-save"));
  assert.deepEqual(d.calls.find((c) => c.method === "PUT" && c.path === RB + R1 + "/").body.public_text, "{Hi|Hello}!");
  await d.click(d.$("ibr-del-0"));
  assert.match(d.doc.body.textContent, /Delete this rule\?/);
  assert.ok(!d.calls.some((c) => c.method === "DELETE"));
  await d.click(d.$("ibr-del-yes"));
  assert.ok(d.calls.some((c) => c.method === "DELETE" && c.path === RB + R1 + "/"));
  assert.match(d.doc.body.textContent, /No rules yet\./);
});

test("the Add rule button is off at the API's max_rules", async () => {
  const d = boot({ auto: automation({ limits: { max_rules: 1 } }) });
  await d.open();
  assert.equal(d.$("ibr-add").disabled, true);
  assert.match(d.doc.body.textContent, /You can have up to 1 auto-reply rules\./);
});

test("pure helpers, script and style wiring, no innerHTML and no native select left visible", () => {
  const u = boot().window.NOCommentRules.util;
  assert.deepEqual(Array.from(u.splitKeywords(" a, b ,,c ")), ["a", "b", "c"]);
  assert.equal(u.pluralVariants(1), "1 variant");
  assert.equal(u.pluralVariants(3), "3 variants");
  assert.equal(u.whereLine({ scope: "all" }), "All posts and ads");
  assert.ok(HTML.indexOf("/assets/js/inbox-rules.js") > HTML.indexOf("/assets/js/inbox-settings.js"));
  assert.match(HTML, /inbox-rules\.js\?v=\d+cm\d+/);
  assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML/.test(read("inbox-rules.js")));
  assert.ok(!/gold|#d4a|#c9a/i.test(CSS.slice(CSS.indexOf("/* ---- Comment auto-replies"), CSS.indexOf("/* the house dropdown"))));
  assert.match(CSS, /#view-settings-inbox \[hidden\] \{ display: none !important; \}/);
});
