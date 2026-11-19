/* ClickUp z8uq9mgtt2: the chat widget on the funnel, no name or email fields, and the optional contact ask. */
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { chatContact, type ChatContact } from "../src/lib/django.ts";
import { POST as contactPost, GET as contactGet } from "../src/app/chat/contact/route.ts";
import { landingDocument } from "../src/views/sante/pack-landing.ts";
import { checkoutDocument } from "../src/views/sante/pack-checkout.ts";
import { checkoutModel } from "../src/views/sante/pack-checkout.ts";
import { payDocument, returnDocument } from "../src/views/sante/pack-pay.ts";
import { policyDocument } from "../src/views/sante/pack-policies.ts";
import { packContext, packDocument } from "../src/views/sante/pack-page.ts";
import { html } from "../src/lib/html.ts";
import { FILLED, SITE } from "./site.ts";

const secret = randomBytes(24).toString("hex"); // throwaway, made for this run only
const env = { apiBase: "http://api.test", secret };
const VISITOR = "V".repeat(43);
const PACK = { price_centavos: 148800, currency: "PHP", available: true, agreement: { id: 1, label: "v1.0", effective_date: "2026-11-01" }, payment_accounts: [] };
const ASSETS = path.join(import.meta.dirname, "..", "public", "assets", "sante");
const SRC = path.join(import.meta.dirname, "..", "src");
const CONTACT: ChatContact = { host: "demo-store.negosyotest.com", visitor_ip: "203.0.113.7", visitor_secret: VISITOR, contact: "09171234567" };

/* --- the widget on every funnel page ---------------------------------------------------------- */

const CSS = /<link rel="stylesheet" href="\/assets\/sante\/css\/chat-widget\.css\?v=[0-9a-f]{8}">/;
const JS = /<script src="\/assets\/sante\/js\/chat-widget\.js\?v=[0-9a-f]{8}" data-chat-widget data-store="[^"]*"><\/script>/;

test("the widget is on the landing, checkout, pay and return pages: its stylesheet in the head, its script last, the store name escaped", () => {
  const c = packContext({ ...FILLED, display_name: 'A "<B>" Store' }, PACK);
  const pages = [
    landingDocument(c).value,
    checkoutDocument(c, checkoutModel({ accounts: [] })).value,
    payDocument(c, "https://checkout.example.test/i/1").value,
    returnDocument(c, { pane: "waiting", price_centavos: 148800, error_message: "" }).value,
  ];
  for (const page of pages) {
    assert.match(page, CSS);
    assert.match(page, JS);
    assert.ok(page.includes('data-store="A &quot;&lt;B&gt;&quot; Store"'));
    assert.ok(page.indexOf("chat-widget.css") < page.indexOf("</head>"));
    assert.ok(page.indexOf("chat-widget.js") > page.indexOf("</main>"));
    assert.ok(page.indexOf("chat-widget.js") < page.indexOf("</body>"));
    assert.equal(page.match(/chat-widget\.js/g)?.length, 1);
  }
});

test("every funnel document goes through packDocument, which mounts the widget; only the policy pages leave it out", () => {
  const c = packContext(SITE, PACK);
  const bare = packDocument(c, { title: "T", content: html`<p>x</p>` }).value;
  assert.match(bare, CSS);
  assert.match(bare, JS);
  assert.doesNotMatch(packDocument(c, { title: "T", content: html`<p>x</p>`, chat: false }).value, /chat-widget/);
  const policy = policyDocument(c, { slug: "privacy-policy", title: "P", version: "1", effective_date: "", business: {}, shipping: {}, privacy: {} } as never);
  if (policy) assert.doesNotMatch(policy.value, /chat-widget/);
  for (const file of ["pack-landing", "pack-checkout", "pack-onboarding", "pack-pay"]) {
    const code = readFileSync(path.join(SRC, "views", "sante", `${file}.ts`), "utf8");
    assert.ok(code.includes("packDocument("), file);
    assert.doesNotMatch(code, /chat:\s*false/, file);
  }
});

test("chat off is the widget's own gate: it draws nothing until its first poll says chat is on (404 when the host has chat off), and no page is built differently", () => {
  const code = readFileSync(path.join(ASSETS, "js", "chat-widget.js"), "utf8");
  assert.match(code, /if \(r\.status === 404\) \{ writeProbe\(session, host, Date\.now\(\), false, "none"\); return; \}/);
  assert.match(code, /if \(ok\) build\(\);/);
  const c = packContext(SITE, PACK);
  assert.equal(landingDocument(c).value, landingDocument(c).value);
});

test("the launcher clears the funnel's own sticky bars on a phone", () => {
  const css = readFileSync(path.join(ASSETS, "css", "chat-widget.css"), "utf8");
  assert.match(css, /body\.sw-on:has\(\.pp-sticky:not\(\.pp-sticky-off\)\) \.sw-launcher/);
  assert.match(css, /body\.sw-on:has\(\.pp-co-totalbar\) \.sw-launcher/);
});

/* --- the widget: no name or email, the contact ask --------------------------------------------- */

type Widget = {
  start(doc: unknown, win: unknown): void; contactKind(v: string, mobileOn?: boolean): string; errorKind(status: number, body: unknown): string;
  readContact(st: unknown, now?: number): string; writeContact(st: unknown, done: string, now?: number): void;
  TEXT: Record<string, string>; ERRORS: Record<string, string>; CHAT_CONTACT_MOBILE: boolean; CONTACT_KEY: string; LOG_TTL_MS: number;
};
const widget = createRequire(import.meta.url)(path.join(ASSETS, "js", "chat-widget.js")) as Widget;
const memory = () => {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

/* A small recording DOM: elements with children, attributes, text and listeners, enough to open the panel and read what it drew. */
class El {
  tagName: string; className = ""; children: El[] = []; attrs: Record<string, string> = {}; listeners: Record<string, ((e: unknown) => void)[]> = {};
  textContent = ""; value = ""; hidden = false; disabled = false; id = ""; type = ""; style = {}; parentNode: El | null = null; firstChild: El | null = null;
  classList = { add: () => {}, remove: () => {}, contains: () => false };
  constructor(tag: string) { this.tagName = tag.toUpperCase(); }
  appendChild(n: El) { n.parentNode = this; this.children.push(n); this.firstChild = this.children[0]; return n; }
  removeChild(n: El) { this.children = this.children.filter((c) => c !== n); this.firstChild = this.children[0] ?? null; return n; }
  setAttribute(k: string, v: string) { this.attrs[k] = v; }
  getAttribute(k: string) { return this.attrs[k] ?? null; }
  addEventListener(t: string, f: (e: unknown) => void) { (this.listeners[t] ??= []).push(f); }
  contains() { return false; }
  focus() {}
  fire(t: string, e: Record<string, unknown> = {}) { (this.listeners[t] ?? []).forEach((f) => f({ preventDefault() {}, ...e })); }
  all(): El[] { return this.children.flatMap((c) => [c, ...c.all()]); }
  text(): string { return this.textContent + this.children.map((c) => c.text()).join(" "); }
}
const find = (root: El, cls: string) => root.all().filter((n) => n.className.split(" ").includes(cls));

async function open(answers: Record<string, { status: number; body: unknown }>, local = memory(), mobile?: boolean) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const body = new El("body");
  const doc = { currentScript: null, querySelector: () => null, createElement: (t: string) => new El(t), createElementNS: (_n: string, t: string) => new El(t),
    createTextNode: (t: string) => { const n = new El("#text"); n.textContent = t; return n; }, body, documentElement: new El("html"),
    activeElement: null, getElementById: () => null, addEventListener() {}, hidden: false };
  (body as unknown as { classList: unknown }).classList = { add() {} };
  const win = { sessionStorage: memory(), localStorage: local, location: { host: "demo.test" }, setTimeout: (f: () => void) => { void f; return 0; }, clearTimeout() {}, AbortController,
    fetch: (url: string, init: { body: string }) => {
      calls.push({ url, body: JSON.parse(init.body) });
      const a = answers[url] ?? { status: 404, body: null };
      return Promise.resolve({ status: a.status, json: () => Promise.resolve(a.body) });
    } };
  void mobile;
  widget.start(doc, win);
  await new Promise((r) => setTimeout(r, 5));
  const root = body.children[0];
  const launcher = find(root, "sw-launcher")[0];
  launcher.fire("click");
  await new Promise((r) => setTimeout(r, 5));
  return { root, calls, local, wait: () => new Promise((r) => setTimeout(r, 5)), panel: () => find(root, "sw-panel")[0] };
}
const NONE = { "/chat/poll/": { status: 200, body: { ok: true, state: "none", available: true, messages: [] } } };

test("the panel has no Name or Email field: the visitor just types", async () => {
  const w = await open(NONE);
  const fields = w.panel().all().filter((n) => ["INPUT", "TEXTAREA"].includes(n.tagName));
  assert.deepEqual(fields.filter((n) => n.attrs["aria-hidden"] !== "true").map((n) => n.tagName), ["TEXTAREA"]);
  const labels = w.panel().all().filter((n) => n.tagName === "LABEL").map((n) => n.text().trim());
  assert.deepEqual(labels, ["Your message"]);
  assert.ok(!/name|email/i.test(w.panel().text().replace(/Chat with/, "")), w.panel().text());
  const code = readFileSync(path.join(ASSETS, "js", "chat-widget.js"), "utf8");
  assert.doesNotMatch(code, /autocomplete = "(name|email)"|type = "email"|sw-name|sw-email/);
});

test("the first message is sent without a name or email, then the contact ask shows with its exact words, a Save and a Skip button", async () => {
  const w = await open({ ...NONE, "/chat/send/": { status: 200, body: { ok: true, state: "open", available: true, messages: [] } } });
  assert.equal(find(w.panel(), "sw-ask").length, 0, "no ask before a message");
  const msg = w.panel().all().find((n) => n.tagName === "TEXTAREA")!;
  msg.value = "Is the pack in stock?";
  msg.fire("input");
  find(w.panel(), "sw-form")[0].fire("submit");
  await w.wait();
  const sent = w.calls.find((c) => c.url === "/chat/send/")!;
  assert.deepEqual(Object.keys(sent.body).sort(), ["after_id", "opened_at", "text", "website"]);
  const ask = find(w.panel(), "sw-ask");
  assert.equal(ask.length, 1);
  assert.equal(find(ask[0], "sw-ask-text")[0].textContent, "Leave your mobile number or email so we can reach you if you leave this page.");
  assert.deepEqual(ask[0].all().filter((n) => n.tagName === "BUTTON").map((n) => n.textContent), ["Save", "Skip"]);
  assert.equal(ask[0].all().filter((n) => n.tagName === "INPUT").length, 1, "one input for a mobile or an email");
});

async function asked(extra: Record<string, { status: number; body: unknown }> = {}, local = memory()) {
  const w = await open({ ...NONE, "/chat/send/": { status: 200, body: { ok: true, state: "open", available: true, messages: [] } }, ...extra }, local);
  const msg = w.panel().all().find((n) => n.tagName === "TEXTAREA")!;
  msg.value = "Hello";
  msg.fire("input");
  find(w.panel(), "sw-form")[0].fire("submit");
  await w.wait();
  return w;
}
const askInput = (w: Awaited<ReturnType<typeof open>>) => find(w.panel(), "sw-ask")[0].all().find((n) => n.tagName === "INPUT")!;

test("Save sends the contact to /chat/contact/ and the ask is gone for good; Skip also ends it, and it is not asked again on a later visit", async () => {
  const saved = await asked({ "/chat/contact/": { status: 200, body: { ok: true, saved: true, kind: "mobile" } } });
  const input = askInput(saved);
  input.value = "0917 123 4567";
  input.fire("input");
  find(saved.panel(), "sw-ask")[0].fire("submit");
  await saved.wait();
  assert.deepEqual(saved.calls.filter((c) => c.url === "/chat/contact/").map((c) => c.body), [{ contact: "0917 123 4567" }]);
  assert.equal(find(saved.panel(), "sw-ask").length, 0);
  assert.equal(find(saved.panel(), "sw-thanks").length, 1);
  assert.equal(widget.readContact(saved.local), "saved");
  assert.ok(!JSON.stringify([...saved.local.m.values()]).includes("0917"), "the number is never kept in the browser");

  const skipped = await asked();
  find(skipped.panel(), "sw-skip")[0].fire("click");
  assert.equal(find(skipped.panel(), "sw-ask").length, 0);
  assert.equal(skipped.calls.filter((c) => c.url === "/chat/contact/").length, 0, "Skip sends nothing");
  assert.equal(widget.readContact(skipped.local), "skipped");
  const again = memory();
  widget.writeContact(again, "skipped");
  const later = await open({ ...NONE, "/chat/poll/": { status: 200, body: { ok: true, state: "open", available: true, messages: [{ id: 3, text: "Hi!", at: "2026-11-19T08:00:00Z" }] } } }, again);
  assert.equal(find(later.panel(), "sw-ask").length, 0, "answered once per conversation");
});

test("a bad value is caught in the browser with a friendly line; a 422 from Django shows the same line; other failures say try again", async () => {
  const w = await asked({ "/chat/contact/": { status: 422, body: { ok: false, error: "contact" } } });
  askInput(w).value = "not a contact";
  find(w.panel(), "sw-ask")[0].fire("submit");
  await w.wait();
  assert.equal(w.calls.filter((c) => c.url === "/chat/contact/").length, 0, "nothing sent for an obvious typo");
  assert.equal(find(w.panel(), "sw-ask-err")[0].textContent, widget.ERRORS.contact);
  askInput(w).value = "09171234567";
  find(w.panel(), "sw-ask")[0].fire("submit");
  await w.wait();
  assert.equal(w.calls.filter((c) => c.url === "/chat/contact/").length, 1);
  assert.equal(find(w.panel(), "sw-ask-err")[0].textContent, widget.ERRORS.contact, "Django's 422");
  assert.equal(find(w.panel(), "sw-ask").length, 1, "the ask stays for another try");
  const down = await asked({ "/chat/contact/": { status: 503, body: { ok: false, error: "failed" } } });
  askInput(down).value = "ana@example.test";
  find(down.panel(), "sw-ask")[0].fire("submit");
  await down.wait();
  assert.equal(find(down.panel(), "sw-ask-err")[0].textContent, widget.ERRORS.contactFailed);
  assert.equal(widget.errorKind(422, { ok: false, error: "contact" }), "contact");
});

test("mobile forms 09XXXXXXXXX, 9XXXXXXXXX and +639XXXXXXXXX and an email are accepted; CHAT_CONTACT_MOBILE = false makes the check email-only", () => {
  assert.equal(widget.CHAT_CONTACT_MOBILE, true);
  for (const ok of ["09171234567", "9171234567", "+639171234567", "0917-123-4567", " 0917 123 4567 ", "(0917) 123 4567"]) assert.equal(widget.contactKind(ok), "mobile", ok);
  for (const ok of ["ana@example.test", "A.B+c@mail.example.ph"]) assert.equal(widget.contactKind(ok), "email", ok);
  for (const bad of ["", "  ", "ana", "ana@", "@x.test", "a b@c.test", "0817123456", "0917123456", "+6391712345678", "12345", "ana@example"]) assert.equal(widget.contactKind(bad), "", bad);
  for (const mobile of ["09171234567", "9171234567", "+639171234567"]) assert.equal(widget.contactKind(mobile, false), "", `${mobile} with the mobile option off`);
  assert.equal(widget.contactKind("ana@example.test", false), "email");
  const code = readFileSync(path.join(ASSETS, "js", "chat-widget.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.equal(code.match(/CHAT_CONTACT_MOBILE\s*=/g)?.length, 1, "one constant, set in one place");
  assert.match(code, /var CHAT_CONTACT_MOBILE = true;/);
  assert.match(code, /askLabel: CHAT_CONTACT_MOBILE \? "Mobile number or email" : "Email"/);
  assert.match(code, /contact: CHAT_CONTACT_MOBILE \? "[^"]*mobile[^"]*" : "Please enter an email like you@example\.com\."/);
});

test("with the mobile option off, the whole widget reads email-only", () => {
  const code = readFileSync(path.join(ASSETS, "js", "chat-widget.js"), "utf8").replace("var CHAT_CONTACT_MOBILE = true;", "var CHAT_CONTACT_MOBILE = false;");
  const sandbox = { exports: {} as Widget };
  new Function("module", "exports", "window", code)(sandbox, sandbox.exports, undefined);
  const off = (sandbox as unknown as { exports: Widget }).exports;
  assert.equal(off.CHAT_CONTACT_MOBILE, false);
  assert.equal(off.contactKind("09171234567"), "");
  assert.equal(off.contactKind("ana@example.test"), "email");
  assert.equal(off.TEXT.askLabel, "Email");
  assert.ok(!/mobile/i.test(off.ERRORS.contact + off.TEXT.askHint + off.TEXT.askLabel));
  assert.equal(off.TEXT.askText, "Leave your mobile number or email so we can reach you if you leave this page.", "the sentence is the ruled one");
});

test("the kept 'answered' mark lasts as long as the conversation and survives a blocked store", () => {
  const st = memory(), t = 5_000_000_000;
  widget.writeContact(st, "saved", t);
  assert.equal(widget.readContact(st, t + widget.LOG_TTL_MS), "saved");
  assert.equal(widget.readContact(st, t + widget.LOG_TTL_MS + 1), "");
  assert.ok(!st.m.has(widget.CONTACT_KEY));
  st.m.set(widget.CONTACT_KEY, "{bad");
  assert.equal(widget.readContact(st), "");
  const blocked = { getItem() { throw new Error("b"); }, setItem() { throw new Error("b"); }, removeItem() { throw new Error("b"); } };
  assert.equal(widget.readContact(blocked), "");
  assert.doesNotThrow(() => widget.writeContact(blocked, "saved"));
});

test("the contact ask is light blue on focus, never gold, and works in the dark theme", () => {
  const css = readFileSync(path.join(ASSETS, "css", "chat-widget.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /\.sw-skip:focus-visible \{ outline: 3px solid #6C8CFF/);
  assert.match(css, /\.sw-ask \{[^}]*var\(--sw-note-bg\)/);
  assert.doesNotMatch(css, /gold/i);
});

/* --- the Django call and the storefront route -------------------------------------------------- */

test("contact: one POST to /storefront/v1/chat/contact/ with the credential and exactly host, visitor_ip, visitor_secret, contact", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const result = await chatContact(CONTACT, env, (url: string, init: RequestInit) => { calls.push({ url, init }); return Promise.resolve(Response.json({ saved: true, kind: "mobile" })); });
  assert.deepEqual(result, { state: "ok", chat: { saved: true, kind: "mobile" } });
  assert.equal(calls[0].url, "http://api.test/storefront/v1/chat/contact/");
  assert.equal(calls[0].init.method, "POST");
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, `Bearer ${secret}`);
  assert.deepEqual(JSON.parse(calls[0].init.body as string), CONTACT);
});

test("contact: 404 unavailable, 422 and 429 refusals, a wrong shape or a server error failed, and nothing typed is logged", async () => {
  const run = (response: () => Response, logs: string[] = []) => chatContact(CONTACT, env, () => Promise.resolve(response()), (r) => logs.push(r));
  assert.deepEqual(await run(() => Response.json({}, { status: 404 })), { state: "unavailable" });
  const refused = await run(() => Response.json({ error: { code: "invalid_request", message: "m", fields: { contact: ["Enter a valid mobile or email."] } } }, { status: 422 }));
  assert.deepEqual(refused, { state: "refused", status: 422, code: "invalid_request", message: "m", fields: { contact: "Enter a valid mobile or email." } });
  assert.equal((await run(() => Response.json({}, { status: 429 }))).state, "refused");
  const logs: string[] = [];
  for (const odd of [() => Response.json({ saved: true, kind: "fax" }), () => Response.json({ saved: false, kind: "email" }), () => Response.json({}, { status: 500 })]) {
    assert.deepEqual(await run(odd, logs), { state: "failed" });
  }
  for (const line of logs) for (const word of [secret, VISITOR, CONTACT.contact, "api.test", CONTACT.visitor_ip]) assert.ok(!line.includes(word), line);
});

type Seen = { url: string; init?: RequestInit };
async function withDjango(answer: () => Response, run: (seen: Seen[]) => Promise<void>, vars: Record<string, string> = {}): Promise<void> {
  const seen: Seen[] = [];
  const names = ["STOREFRONT_API_BASE", "STOREFRONT_SERVER_SECRET", "STOREFRONT_HOST_ALIASES", "VERCEL"];
  const before = { fetch: globalThis.fetch, error: console.error, env: names.map((n) => process.env[n]) };
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => { seen.push({ url: String(input), init }); return answer(); }) as typeof fetch;
  console.error = () => {};
  Object.assign(process.env, { STOREFRONT_API_BASE: "http://api.test", STOREFRONT_SERVER_SECRET: secret, STOREFRONT_HOST_ALIASES: "www.santetest.com=demo-store.negosyotest.com", VERCEL: "", ...vars });
  try { await run(seen); } finally {
    globalThis.fetch = before.fetch; console.error = before.error;
    names.forEach((n, i) => { if (before.env[i] === undefined) delete process.env[n]; else process.env[n] = before.env[i]; });
  }
}
function post(body: unknown, opts: { cookie?: string; headers?: Record<string, string> } = {}): Request {
  const headers: Record<string, string> = { host: "www.santetest.com:3062", "content-type": "application/json", "sec-fetch-site": "same-origin", ...opts.headers };
  if (opts.cookie) headers.cookie = opts.cookie;
  return new Request("http://www.santetest.com:3062/chat/contact/", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers });
}
const calls = (seen: Seen[]) => seen.filter((c) => c.url.includes("/storefront/v1/chat/contact/"));

test("the contact route: the aliased host, the cookie secret and the contact go to Django; the browser gets {ok, saved, kind}", async () => {
  await withDjango(() => Response.json({ saved: true, kind: "email" }), async (seen) => {
    const answer = await contactPost(post({ contact: "ana@example.test", host: "evil.test", visitor_secret: "x" }, { cookie: `no_chat=${VISITOR}`, headers: { "x-vercel-forwarded-for": "203.0.113.7" } }));
    assert.equal(answer.status, 200);
    assert.equal(answer.headers.get("cache-control"), "no-store");
    assert.deepEqual(await answer.json(), { ok: true, saved: true, kind: "email" });
    const sent = JSON.parse(calls(seen)[0].init?.body as string);
    assert.deepEqual(sent, { host: "demo-store.negosyotest.com", visitor_ip: "203.0.113.7", visitor_secret: VISITOR, contact: "ana@example.test" });
  }, { VERCEL: "1" });
});

test("the contact route: a visitor with no cookie sends an empty secret and the browser's own host and secret are ignored", async () => {
  await withDjango(() => Response.json({ saved: true, kind: "mobile" }), async (seen) => {
    await contactPost(post({ contact: "09171234567", visitor_secret: "W".repeat(43) }));
    assert.equal(JSON.parse(calls(seen)[0].init?.body as string).visitor_secret, "");
  });
});

test("the contact route errors: 422 on the contact is the 'contact' kind, 429 limited, anything else failed, chat off is the neutral 404; no words of Django pass on", async () => {
  const cases: [Response, number, unknown][] = [
    [Response.json({ error: { code: "invalid_request", message: "secret words", fields: { contact: ["Enter a valid mobile or email."] } } }, { status: 422 }), 422, { ok: false, error: "contact" }],
    [Response.json({ error: { code: "rate_limited", message: "secret words" } }, { status: 429 }), 429, { ok: false, error: "limited" }],
    [Response.json({ error: { code: "conflict" } }, { status: 409 }), 503, { ok: false, error: "failed" }],
    [Response.json({ error: { code: "invalid_request", fields: { other: ["x"] } } }, { status: 422 }), 503, { ok: false, error: "failed" }],
    [Response.json({}, { status: 500 }), 503, { ok: false, error: "failed" }],
  ];
  for (const [response, status, body] of cases) {
    await withDjango(() => response.clone(), async () => {
      const answer = await contactPost(post({ contact: "x@y.test" }, { cookie: `no_chat=${VISITOR}` }));
      assert.equal(answer.status, status);
      assert.deepEqual(await answer.json(), body);
      assert.ok(!(answer.headers.get("set-cookie") ?? ""));
    });
  }
  await withDjango(() => Response.json({}, { status: 404 }), async () => {
    const answer = await contactPost(post({ contact: "x@y.test" }));
    assert.equal(answer.status, 404);
    assert.match(await answer.text(), /Page not found\./);
  });
  await withDjango(() => { throw new TypeError("fetch failed"); }, async () => {
    assert.equal((await contactPost(post({ contact: "x@y.test" }))).status, 503);
  });
});

test("the contact route answers a same-origin JSON post only; any other method or shape is the neutral 404 and Django is not called", async () => {
  await withDjango(() => Response.json({ saved: true, kind: "email" }), async (seen) => {
    const noProof = new Request("http://www.santetest.com:3062/chat/contact/", { method: "POST", body: "{}", headers: { host: "www.santetest.com:3062", "content-type": "application/json" } });
    const form = new Request("http://www.santetest.com:3062/chat/contact/", { method: "POST", body: "contact=a", headers: { host: "www.santetest.com:3062", "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": "same-origin" } });
    for (const request of [post({}, { headers: { "sec-fetch-site": "cross-site" } }), noProof, form, post("{not json"), post("[1]")]) {
      assert.equal((await contactPost(request)).status, 404);
    }
    assert.equal((await contactGet()).status, 404);
    assert.equal(calls(seen).length, 0);
  });
});

test("every chat route is listed: send, poll and contact", () => {
  assert.deepEqual(readdirSync(path.join(SRC, "app", "chat")).sort(), ["contact", "poll", "send"]);
});
