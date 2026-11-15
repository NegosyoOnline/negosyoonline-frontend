import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { checkoutGet, checkoutPost, type Flow } from "../src/lib/checkout-flow.ts";
import { fetchSite, type Pack } from "../src/lib/django.ts";
import { html } from "../src/lib/html.ts";
import {
  buildFbc, CONSENT_MAX_AGE, COOKIE_SETTINGS_PATH, consentChoice, consentGiven, dataBlock, metaEventId, metaPage, NOTICE_ACCEPT, NOTICE_CHANGE, NOTICE_DECLINE, NOTICE_POLICY_LABEL, NOTICE_REMEMBER, NOTICE_TEXT,
  placeFields, sendEvents,
} from "../src/lib/meta.ts";
import { homeDocument } from "../src/views/sante/home.ts";
import { homeModel } from "../src/views/sante/model.ts";
import { landingDocument } from "../src/views/sante/pack-landing.ts";
import { packContext } from "../src/views/sante/pack-page.ts";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { chrome } from "../src/views/sante/member.ts";
import { footer as packFooter } from "../src/views/sante/pack-page.ts";
import nextConfig from "../next.config.ts";
import { SITE } from "./site.ts";

const secret = randomBytes(24).toString("hex"); // throwaway, made for this run only
const env = { apiBase: "http://api.test", secret };
const PIXEL_SITE = { ...SITE, meta_pixel_id: "123456789012345" }; // a made-up number, not a real Pixel
const PACK: Pack = { price_centavos: 148800, currency: "PHP", available: true, agreement: null, payment_accounts: [] };
const FBP = "fb.1.1700000000000.1234567890";
const FBC = "fb.1.1700000000000.AbCdEf_-123";
const URL_CHECKOUT = "https://www.santetest.com/funnel/membership-pack/checkout/";

function req(cookie = "", url = "https://www.santetest.com/", extra: Record<string, string> = {}): Request {
  return new Request(url, { headers: { ...(cookie ? { cookie } : {}), ...extra } });
}

const ACCEPT = "__Host-no_meta_consent=1";
const DECLINE = "__Host-no_meta_consent=0";

/* ---- ids, data block, fbc ---- */

test("event ids are the prefix and 16 hex, new each time", () => {
  assert.match(metaEventId("PageView"), /^pv_[0-9a-f]{16}$/);
  assert.match(metaEventId("ViewContent"), /^vc_[0-9a-f]{16}$/);
  assert.match(metaEventId("InitiateCheckout"), /^ic_[0-9a-f]{16}$/);
  assert.notEqual(metaEventId("PageView"), metaEventId("PageView"));
});

test("the data block escapes < > & and the line separators, so a value cannot close the tag", () => {
  const sep = String.fromCharCode(0x2028, 0x2029);
  const out = dataBlock({ a: "</script><script>alert(1)</script>", b: "x & y", c: sep }).value;
  assert.ok(out.startsWith('<script type="application/json" id="no-meta">') && out.endsWith("</script>"));
  const inner = out.slice(out.indexOf(">") + 1, out.lastIndexOf("</script>"));
  assert.ok(!/[<>&]/.test(inner) && !inner.includes(sep[0]) && !inner.includes(sep[1]));
  assert.deepEqual(JSON.parse(inner), { a: "</script><script>alert(1)</script>", b: "x & y", c: sep });
});

test("fbc is built from a clean fbclid only", () => {
  assert.equal(buildFbc("AbC_-1", new Date(1700000000000)), "fb.1.1700000000000.AbC_-1");
  assert.equal(buildFbc("a b"), "");
  assert.equal(buildFbc("x".repeat(201)), "");
  assert.equal(buildFbc(""), "");
  assert.equal(buildFbc(null), "");
});

/* ---- consent ---- */

test("consent is read from one cookie: only 1 is yes, 0 is no, anything else is unanswered", () => {
  assert.equal(consentChoice(req(ACCEPT)), "accepted");
  assert.equal(consentGiven(req(ACCEPT)), true);
  assert.equal(consentChoice(req(DECLINE)), "declined");
  assert.equal(consentGiven(req(DECLINE)), false);
  assert.equal(consentChoice(req()), "unset");
  assert.equal(consentChoice(req("__Host-no_meta_consent=2")), "unset");
  assert.equal(consentChoice(req(`${ACCEPT}; ${ACCEPT}`)), "unset", "a name sent twice is refused");
  assert.equal(consentGiven(req(ACCEPT, "http://www.santetest.com/")), false, "under http the plain name is read, not the __Host- one");
  assert.equal(consentGiven(req("no_meta_consent=1", "http://www.santetest.com/")), true);
});

/* ---- the page pieces ---- */

const args = (request: Request, over = {}) => ({
  request, site: PIXEL_SITE, host: "demo.negosyotest.com", env, events: ["PageView" as const], ...over,
});

test("no Pixel ID: no notice, no block, no call", () => {
  for (const cookie of ["", ACCEPT, DECLINE]) {
    const m = metaPage({ ...args(req(cookie)), site: SITE });
    assert.equal(m.markup.value, "");
    assert.equal(m.send, null);
  }
  const odd = metaPage({ ...args(req(ACCEPT)), site: { ...SITE, meta_pixel_id: "12ab" } });
  assert.equal(odd.markup.value, "");
});

test("before an answer: the notice only, nothing of Meta, nothing sent", () => {
  const m = metaPage(args(req()));
  assert.equal(m.send, null);
  assert.ok(m.markup.value.includes(NOTICE_TEXT) && m.markup.value.includes(NOTICE_ACCEPT) && m.markup.value.includes(NOTICE_DECLINE));
  assert.ok(m.markup.value.includes('data-cookie="__Host-no_meta_consent"'));
  assert.ok(!m.markup.value.includes("no-meta\"") && !m.markup.value.includes("123456789012345"));
  assert.ok(!m.markup.value.includes("facebook"));
});

test("after Decline: nothing at all", () => {
  const m = metaPage(args(req(DECLINE)));
  assert.equal(m.markup.value, "");
  assert.equal(m.send, null);
});

test("after Accept: the data block with ids and data, the script, and one server call with the same ids", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(Response.json({ status: "queued" }));
  };
  const request = req(`${ACCEPT}; _fbp=${FBP}; _fbc=${FBC}`, "https://www.santetest.com/funnel/membership-pack/landing-page/?fbclid=zzz&x=1", {
    "user-agent": "Mozilla/5.0 test", "x-vercel-forwarded-for": "203.0.113.9", cookie: `${ACCEPT}; _fbp=${FBP}; _fbc=${FBC}`,
  });
  const m = metaPage({ ...args(request, { events: ["PageView", "ViewContent"], pack: PACK, fetchImpl }) });
  const raw = m.markup.value;
  assert.match(raw, /<script src="\/assets\/sante\/js\/meta-pixel\.js\?v=[0-9a-f]{8}"><\/script>$/);
  const block = JSON.parse(raw.slice(raw.indexOf(">") + 1, raw.indexOf("</script>")));
  assert.equal(block.pixel_id, "123456789012345");
  assert.equal(block.checkout, false);
  assert.equal(block.events.length, 2);
  assert.equal(block.events[0].name, "PageView");
  assert.match(block.events[0].id, /^pv_[0-9a-f]{16}$/);
  assert.deepEqual(block.events[0].data, {});
  assert.equal(block.events[1].name, "ViewContent");
  assert.match(block.events[1].id, /^vc_[0-9a-f]{16}$/);
  assert.deepEqual(block.events[1].data, { content_type: "product", content_ids: ["membership-pack"], value: 1488, currency: "PHP" });
  assert.ok(m.send);
  assert.equal(calls.length, 0, "nothing is sent until the route runs send() after the response");
  await m.send();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://api.test/storefront/v1/meta/events/");
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, `Bearer ${secret}`);
  assert.ok(calls[0].init.signal instanceof AbortSignal);
  const sent = JSON.parse(String(calls[0].init.body));
  assert.deepEqual(sent, {
    host: "demo.negosyotest.com",
    events: block.events.map((e: { name: string; id: string }) => ({ name: e.name, id: e.id })),
    url: "https://www.santetest.com/funnel/membership-pack/landing-page/",
    fbp: FBP, fbc: FBC, ip: "", user_agent: "Mozilla/5.0 test", consent: true,
  });
});

test("the server call carries no query string, builds fbc from fbclid, and the visitor ip only on Vercel", async () => {
  const request = req(ACCEPT, "https://www.santetest.com/?fbclid=AbC123&contact=sent", { "x-vercel-forwarded-for": "203.0.113.9" });
  const m = metaPage({ ...args(request), now: new Date(1700000000000), fetchImpl: () => Promise.resolve(Response.json({})) });
  assert.ok(m.send);
  const seen: string[] = [];
  await sendEvents({ a: 1 }, env, (url, init) => { seen.push(String(init.body)); return Promise.resolve(Response.json({})); });
  assert.deepEqual(seen, ['{"a":1}']);
  const withIp = metaPage({ ...args(request), now: new Date(1700000000000), fetchImpl: (_u, init) => { seen.push(String(init.body)); return Promise.resolve(Response.json({})); } });
  await withIp.send?.();
  const body = JSON.parse(seen[1]);
  assert.equal(body.url, "https://www.santetest.com/");
  assert.equal(body.fbc, "fb.1.1700000000000.AbC123");
  assert.equal(body.ip, "", "no VERCEL=1 here, so no header is believed");
});

test("the checkout page marks checkout so the Pixel's form reading stays off", () => {
  const m = metaPage(args(req(ACCEPT, URL_CHECKOUT), { events: ["PageView", "InitiateCheckout"], pack: PACK, checkout: true }));
  assert.ok(m.markup.value.includes('"checkout":true'));
  assert.ok(m.markup.value.includes('"name":"InitiateCheckout"'));
});

test("a failed or slow events call never throws and never leaks the secret or the body", async () => {
  const logs: string[] = [];
  const log = (r: string) => logs.push(r);
  await sendEvents({ fbp: FBP }, env, () => Promise.reject(new Error(`boom ${secret} ${FBP}`)), log);
  await sendEvents({}, env, () => Promise.resolve(new Response("x", { status: 500 })), log);
  await sendEvents({}, { ...env, secret: "short" }, () => Promise.reject(new Error("must not be called")), log);
  await sendEvents({}, env, () => Promise.resolve(Response.json({}, { status: 404 })), log);
  assert.deepEqual(logs, ["the API could not be reached in time", "the API answered 500"]);
  for (const line of logs) assert.ok(!line.includes(secret) && !line.includes(FBP));
});

/* ---- Site shape ---- */

test("a site payload without meta_pixel_id reads as an empty one; a wrong type is refused", async () => {
  const older: Record<string, unknown> = { ...SITE };
  delete older.meta_pixel_id;
  const quiet = () => {};
  const ok = (body: unknown) => () => Promise.resolve(Response.json(body));
  assert.equal((await fetchSite("a.test", env, ok(older), quiet))?.meta_pixel_id, "");
  assert.equal((await fetchSite("a.test", env, ok({ ...older, meta_pixel_id: "123456789" }), quiet))?.meta_pixel_id, "123456789");
  assert.equal(await fetchSite("a.test", env, ok({ ...older, meta_pixel_id: 5 }), quiet), null);
});

/* ---- the three views ---- */

test("home and landing render the tracking markup just before </body>, and omit it by default", () => {
  const tracking = html`<i id="t1"></i>`;
  const home = homeDocument({ ...homeModel(SITE, undefined, new Date("2026-11-11T10:00:00+08:00")), tracking }).value;
  assert.ok(/<i id="t1"><\/i>\s*<\/body>/.test(home));
  assert.ok(!homeDocument(homeModel(SITE)).value.includes("no-meta"));
  const landing = landingDocument({ ...packContext(SITE, PACK), tracking }).value;
  assert.ok(/<i id="t1"><\/i>\s*<\/body>/.test(landing));
  assert.ok(!landingDocument(packContext(SITE, PACK)).value.includes("t1"));
});

/* ---- the checkout ---- */

type Call = { path: string; body: Record<string, unknown> | FormData };
function fake(replies: Record<string, { status: number; body: unknown }[]>) {
  const calls: Call[] = [];
  const fetchImpl = (url: string, init: RequestInit) => {
    const route = url.replace("http://api.test/storefront/v1/", "").replace(/\/$/, "");
    calls.push({ path: route, body: init.body instanceof FormData ? init.body : JSON.parse(String(init.body)) });
    const next = (replies[route] ?? []).shift();
    if (!next) throw new Error(`unexpected call: ${route}`);
    return Promise.resolve(Response.json(next.body, { status: next.status }));
  };
  return { calls, fetchImpl };
}

const POSTED = {
  action: "place", submit_key: "k".repeat(16), account_id: "acct_1", sender_bank: "BDO", reference_number: "123",
  sender_first_name: "Juan", sender_last_name: "Cruz", sender_account_number: "999", amount_sent: "1,488.00", transferred_at: "2026-11-11T10:00",
};

function flowOf(f: ReturnType<typeof fake>, request: Request, site = PIXEL_SITE): Flow {
  return {
    site, pack: PACK, host: "demo.negosyotest.com", visitor_ip: "", token: "T".repeat(43), request,
    calls: { env, fetchImpl: f.fetchImpl, log: () => {} }, now: new Date(1700000000000),
  };
}

async function placeFormFor(request: Request, site = PIXEL_SITE): Promise<FormData> {
  const f = fake({ "checkout/place": [{ status: 200, body: { order_number: "PK-1", replay: false } }] });
  const r = await checkoutPost(flowOf(f, request, site), POSTED, new File([new Uint8Array(10)], "p.png"));
  assert.equal(r?.status, 303);
  return f.calls[0].body as FormData;
}

test("the place call carries the Meta fields only after Accept on a Pixel site", async () => {
  const request = req(`${ACCEPT}; _fbp=${FBP}; _fbc=${FBC}`, URL_CHECKOUT + "?x=1", { "user-agent": "UA/1" });
  const form = await placeFormFor(request);
  assert.equal(form.get("meta_consent"), "1");
  assert.equal(form.get("fbp"), FBP);
  assert.equal(form.get("fbc"), FBC);
  assert.equal(form.get("user_agent"), "UA/1");
  assert.equal(form.get("source_url"), URL_CHECKOUT);
});

test("the place call carries no Meta field before an answer, after Decline, or on a site with no Pixel", async () => {
  const names = ["meta_consent", "fbp", "fbc", "user_agent", "source_url"];
  for (const request of [
    req(`_fbp=${FBP}`, URL_CHECKOUT, { "user-agent": "UA/1" }),
    req(`${DECLINE}; _fbp=${FBP}`, URL_CHECKOUT, { "user-agent": "UA/1" }),
  ]) {
    const form = await placeFormFor(request);
    for (const n of names) assert.equal(form.get(n), null, n);
  }
  const noPixel = await placeFormFor(req(`${ACCEPT}; _fbp=${FBP}`, URL_CHECKOUT, { "user-agent": "UA/1" }), SITE);
  for (const n of names) assert.equal(noPixel.get(n), null, n);
  assert.deepEqual(placeFields(req(ACCEPT), SITE), {});
});

test("a pixel cookie of the wrong shape is dropped, not forwarded", () => {
  const f = placeFields(req(`${ACCEPT}; _fbp=evil<script>; _fbc=nope`, URL_CHECKOUT), PIXEL_SITE);
  assert.equal(f.meta_consent, "1");
  assert.equal(f.fbp, "");
  assert.equal(f.fbc, "");
});

test("the checkout GET shows the tracking markup the route gives it, and a post does not", async () => {
  const tracking = html`<i id="t2"></i>`;
  const f = fake({});
  const get = await checkoutGet({ ...flowOf(f, req("", URL_CHECKOUT)), token: "", tracking });
  assert.ok((await get.text()).includes('<i id="t2"></i>'));
  const f2 = fake({ "checkout/state": [{ status: 200, body: { needs_code: false, mobile: "09171234567", verified: false, expires_at: "x" } }] });
  const withToken = await checkoutGet({ ...flowOf(f2, req("", URL_CHECKOUT)), tracking });
  assert.ok((await withToken.text()).includes('<i id="t2"></i>'));
  const none = await checkoutGet({ ...flowOf(fake({}), req("", URL_CHECKOUT)), token: "" });
  assert.ok(!(await none.text()).includes("t2"));
});

/* ---- the home route, end to end ---- */

async function homeWith(site: unknown, cookie: string, path = "/"): Promise<{ page: string; events: { url: string; body: Record<string, unknown> }[] }> {
  const names = ["STOREFRONT_API_BASE", "STOREFRONT_SERVER_SECRET", "STOREFRONT_HOST_ALIASES", "VERCEL"];
  const before = { fetch: globalThis.fetch, env: names.map((n) => process.env[n]) };
  const events: { url: string; body: Record<string, unknown> }[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("http://api.test/storefront/v1/site/")) return Response.json(site);
    if (url === "http://api.test/storefront/v1/meta/events/") {
      events.push({ url, body: JSON.parse(String(init?.body)) });
      return Response.json({ status: "queued" });
    }
    return Response.json({}, { status: 404 });
  }) as typeof fetch;
  Object.assign(process.env, { STOREFRONT_API_BASE: "http://api.test", STOREFRONT_SERVER_SECRET: secret, STOREFRONT_HOST_ALIASES: "", VERCEL: "" });
  try {
    const { GET } = await import("../src/app/route.ts");
    const response = await GET(new Request(`https://www.santetest.com${path}`, { headers: { host: "www.santetest.com", ...(cookie ? { cookie } : {}) } }));
    const page = await response.text();
    await new Promise((resolve) => setTimeout(resolve, 20)); // the events call starts after the response
    return { page, events };
  } finally {
    globalThis.fetch = before.fetch;
    names.forEach((n, i) => { if (before.env[i] === undefined) delete process.env[n]; else process.env[n] = before.env[i]; });
  }
}

test("the home route: no Pixel ID shows nothing; a Pixel shows the notice first, the block after Accept, nothing after Decline", async () => {
  const none = await homeWith(SITE, ACCEPT);
  assert.ok(!none.page.includes("no-meta") && !none.page.includes("meta-pixel.js"));
  assert.equal(none.events.length, 0);

  const first = await homeWith(PIXEL_SITE, "");
  assert.ok(first.page.includes('id="no-meta-notice"') && !first.page.includes('id="no-meta">'));
  assert.equal(first.events.length, 0, "nothing is sent before Accept");

  const declined = await homeWith(PIXEL_SITE, DECLINE);
  assert.ok(!declined.page.includes("no-meta") && !declined.page.includes("meta-pixel.js"));
  assert.equal(declined.events.length, 0);

  const accepted = await homeWith(PIXEL_SITE, ACCEPT);
  assert.ok(accepted.page.includes('id="no-meta">') && accepted.page.includes("meta-pixel.js"));
  assert.equal(accepted.events.length, 1);
  const ids = [...accepted.page.matchAll(/"id":"(pv_[0-9a-f]{16})"/g)].map((m) => m[1]);
  assert.deepEqual((accepted.events[0].body.events as { id: string }[]).map((e) => e.id), ids);
  assert.equal(accepted.events[0].body.consent, true);
});

/* ---- Cookie settings: withdrawing consent ---- */

test("the notice carries the final wording", () => {
  assert.equal(NOTICE_TEXT, "We use Meta tools to measure visits and orders and improve our ads. Allow this?");
});

test("the Cookie settings link is in the store footer on a Pixel site and absent without one", () => {
  const link = `href="${COOKIE_SETTINGS_PATH}"`;
  const pixelHome = homeDocument(homeModel(PIXEL_SITE)).value;
  assert.ok(pixelHome.includes(link) && pixelHome.includes(">Cookie settings</a>"), "store footer");
  assert.ok(!homeDocument(homeModel(SITE)).value.includes("Cookie settings"));
  const withPolicies = { ...PIXEL_SITE, policy_links: [{ label: "Terms", path: "/terms/" }] };
  assert.ok(packFooter(chrome(withPolicies) as never).value.includes(link), "pack footer");
  assert.ok(packFooter(chrome(PIXEL_SITE) as never).value.includes(link), "pack footer with no policy links");
  assert.ok(!packFooter(chrome(SITE) as never).value.includes("Cookie settings"));
  assert.ok(!packFooter(chrome({ ...SITE, meta_pixel_id: "12ab" }) as never).value.includes("Cookie settings"));
  assert.ok(packContext(PIXEL_SITE, PACK).cookie_settings === true && packContext(SITE, PACK).cookie_settings === false);
});

test("?cookie-settings=1 reopens the notice after Accept or Decline, with no Meta script, no block and no server call", async () => {
  for (const cookie of [ACCEPT, DECLINE, ""]) {
    const m = metaPage(args(req(cookie, "https://www.santetest.com/?cookie-settings=1")));
    assert.equal(m.send, null);
    assert.ok(m.markup.value.includes('id="no-meta-notice"') && m.markup.value.includes(NOTICE_TEXT));
    assert.ok(!m.markup.value.includes('id="no-meta"') && !m.markup.value.includes("123456789012345"));
  }
  const noPixel = metaPage({ ...args(req(ACCEPT, "https://www.santetest.com/?cookie-settings=1")), site: SITE });
  assert.equal(noPixel.markup.value, "", "no Pixel: nothing to consent to, so no notice");
  const other = metaPage(args(req(DECLINE, "https://www.santetest.com/?cookie-settings=0")));
  assert.equal(other.markup.value, "");
  const home = await homeWith(PIXEL_SITE, ACCEPT, "/?cookie-settings=1");
  assert.ok(home.page.includes('id="no-meta-notice"') && !home.page.includes('id="no-meta">'));
  assert.equal(home.events.length, 0, "nothing is sent to Meta from the reopened page");
  assert.equal((await homeWith(PIXEL_SITE, ACCEPT)).events.length, 1, "the ordinary page still sends after Accept");
});

type Listener = (e: Record<string, unknown>) => void;
function runPixelScript(cookieIn: string, search: string) {
  const source = readFileSync(new URL("../public/assets/sante/js/meta-pixel.js", import.meta.url), "utf8");
  const state = {
    cookie: cookieIn, assigned: "", reloaded: 0, appended: 0, clicks: [] as ((e: unknown) => void)[],
    docListeners: {} as Record<string, Listener[]>, focused: "", prevented: 0, bodyOverflow: "", htmlOverflow: "",
  };
  type Mock = Record<string, unknown> & { focus: () => void };
  const mk = (name: string, extra: Record<string, unknown> = {}): Mock => {
    const el = {
      name, style: {} as Record<string, string>, listeners: {} as Record<string, Listener[]>,
      addEventListener: (t: string, fn: Listener) => { ((el.listeners as Record<string, Listener[]>)[t] ||= []).push(fn); },
      focus: () => { state.focused = name; active.el = el; },
      getAttribute: () => null, ...extra,
    } as Mock;
    return el;
  };
  const active: { el: Mock | null } = { el: null };
  const decline = mk("decline", { getAttribute: () => "0" });
  const accept = mk("accept", { getAttribute: () => "1" });
  const link = mk("link");
  const title = mk("title");
  const outside = mk("outside");
  const choiceButtons = [accept, decline];
  const controls = [link, decline, accept];
  const card = mk("card", { contains: (x: unknown) => x === title || controls.includes(x as never) || x === card });
  const noticeEl = mk("notice", {
    getAttribute: (n: string) => (n === "data-cookie" ? "__Host-no_meta_consent" : n === "data-max-age" ? "15552000" : null),
    querySelector: (q: string) => (q === "[role=dialog]" ? card : q === "#no-meta-title" ? title : null),
    querySelectorAll: (q: string) => (q === "button, a[href]" ? controls : choiceButtons),
  });
  for (const b of choiceButtons) {
    const orig = b.addEventListener as unknown as (t: string, fn: Listener) => void;
    b.addEventListener = (t: string, fn: Listener) => { orig(t, fn); if (t === "click") state.clicks.push(() => fn({ currentTarget: b })); };
  }
  const doc = {
    getElementById: (id: string) => (id === "no-meta-notice" ? noticeEl : null),
    createElement: () => ({}),
    head: { appendChild: () => { state.appended++; } },
    documentElement: { style: new Proxy({}, { set: (_t, _k, v) => { state.htmlOverflow = v; return true; } }) },
    body: { style: new Proxy({}, { set: (_t, _k, v) => { state.bodyOverflow = v; return true; } }) },
    addEventListener: (t: string, fn: Listener) => { (state.docListeners[t] ||= []).push(fn); },
    get activeElement() { return active.el; },
    set cookie(v: string) { state.cookie = v; },
    get cookie() { return state.cookie; },
  };
  const win: Record<string, unknown> = {
    document: doc,
    location: {
      protocol: "https:", pathname: "/", search, hash: "",
      reload: () => { state.reloaded++; }, assign: (u: string) => { state.assigned = u; },
    },
  };
  win.window = win;
  vm.runInNewContext(source, { ...win, parseInt, RegExp, String });
  const key = (k: string, shiftKey = false) => {
    const e = { key: k, shiftKey, preventDefault: () => { state.prevented++; } };
    for (const fn of state.docListeners.keydown ?? []) fn(e);
  };
  return { ...state, state, key, controls, title, outside, card, link, decline, accept, active,
    focusin: (target: Record<string, unknown>) => { for (const fn of state.docListeners.focusin ?? []) fn({ target }); },
    get cookie() { return state.cookie; }, get assigned() { return state.assigned; }, get reloaded() { return state.reloaded; },
    get appended() { return state.appended; }, clicks: state.clicks };
}

test("Decline after an earlier Accept rewrites the cookie to declined and loads a clean page, so nothing more goes to Meta", () => {
  const s = runPixelScript("__Host-no_meta_consent=1", "?cookie-settings=1");
  assert.equal(s.appended, 0, "the reopened page loads no Meta script");
  s.clicks[1]({}); // Decline
  assert.ok(s.cookie.startsWith("__Host-no_meta_consent=0; Path=/; Max-Age=15552000"), s.cookie);
  assert.equal(s.assigned, "/", "back to the page without the query");
  const after = metaPage(args(req(DECLINE)));
  assert.equal(after.markup.value, "");
  assert.equal(after.send, null);
});

test("Accept after Decline writes 1 and loads the clean page, which then starts the Pixel as the first Accept does", () => {
  const s = runPixelScript("__Host-no_meta_consent=0", "?a=1&cookie-settings=1");
  s.clicks[0]({}); // Accept
  assert.ok(s.cookie.startsWith("__Host-no_meta_consent=1; Path=/"), s.cookie);
  assert.equal(s.assigned, "/?a=1");
  assert.ok(metaPage(args(req(ACCEPT))).markup.value.includes('id="no-meta"'));
});

test("a first choice, with no cookie-settings query, reloads the page as before", () => {
  const s = runPixelScript("", "");
  s.clicks[1]({});
  assert.equal(s.reloaded, 1);
  assert.equal(s.assigned, "");
});

/* ---- the policy, exactly ---- */

type Rule = { source: string; headers: { key: string; value: string }[] };
const require = createRequire(import.meta.url);
const { pathToRegexp } = require("next/dist/compiled/path-to-regexp") as { pathToRegexp: (s: string) => RegExp };

test("the policy: the three Pixel pages widen script, img and connect by name; every other path keeps today's", async () => {
  const rules = (await nextConfig.headers!()) as Rule[];
  const policyFor = (path: string): string[] => {
    const hits = rules
      .filter((r) => r.headers.some((h) => h.key === "Content-Security-Policy"))
      .filter((r) => pathToRegexp(r.source).test(path))
      .map((r) => r.headers.find((h) => h.key === "Content-Security-Policy")!.value);
    return hits;
  };
  const strict = [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com", "img-src 'self' data: https://*.public.blob.vercel-storage.com", "connect-src 'self'",
    "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'",
  ];
  const pixel = [
    "default-src 'self'", "script-src 'self' https://connect.facebook.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "font-src https://fonts.gstatic.com",
    "img-src 'self' data: https://www.facebook.com https://*.public.blob.vercel-storage.com",
    "connect-src 'self' https://www.facebook.com https://connect.facebook.net",
    "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'",
  ];
  const wide = (p: string[]) => p.join("; ");
  for (const path of ["/", "/funnel/membership-pack/checkout/", "/funnel/membership-pack/checkout"]) {
    assert.deepEqual(policyFor(path), [wide(pixel)], path);
  }
  for (const path of ["/funnel/membership-pack/landing-page/", "/funnel/membership-pack/landing-page"]) {
    assert.deepEqual(policyFor(path), [wide([...pixel, "frame-src https://player.mediadelivery.net"])], path);
  }
  for (const path of [
    "/funnel/membership-pack/access/abc123", "/funnel/membership-pack/onboarding/", "/funnel/membership-pack/completed",
    "/funnel/membership-pack/checkout/check", "/funnel/membership-pack/checkout/qr/5", "/dashboard/", "/dashboard/orders",
    "/checkout", "/cart", "/products/", "/contact/", "/privacy-policy/", "/portal/",
  ]) {
    assert.deepEqual(policyFor(path), [wide(strict)], path);
  }
  for (const rule of rules) {
    for (const h of rule.headers) {
      if (h.key !== "Content-Security-Policy") continue;
      assert.ok(!/\*(?!\.public)/.test(h.value.replace("https://*.public.blob.vercel-storage.com", "")), "no wildcard but the media store");
      assert.ok(!h.value.includes("'unsafe-eval'"));
      assert.ok(!/script-src[^;]*unsafe-inline/.test(h.value));
    }
  }
});

test("the data block and the notice add no inline script: the page policy for scripts stays src-only", () => {
  const m = metaPage(args(req(ACCEPT)));
  const scripts = [...m.markup.value.matchAll(/<script\b([^>]*)>/g)].map((x) => x[1]);
  assert.equal(scripts.length, 2);
  for (const attrs of scripts) assert.ok(/type="application\/json"/.test(attrs) || /\ssrc="\/assets\/sante\/js\/meta-pixel\.js\?v=/.test(` ${attrs}`));
});

test("local media (dev only): the CSP gains the one loopback origin only when it is set and valid", async () => {
  const keep = process.env.STOREFRONT_LOCAL_MEDIA_ORIGIN;
  const imgSrc = async (tag: string) => {
    const cfg = (await import(`../next.config.ts?${tag}`)).default as typeof nextConfig;
    const rules = (await cfg.headers!()) as Rule[];
    return rules.flatMap((r) => r.headers).filter((h) => h.key === "Content-Security-Policy").map((h) => h.value.split("; ").find((d) => d.startsWith("img-src"))!);
  };
  try {
    delete process.env.STOREFRONT_LOCAL_MEDIA_ORIGIN;
    for (const d of await imgSrc("unset")) assert.ok(!/127\.0\.0\.1|localhost/.test(d), d);
    process.env.STOREFRONT_LOCAL_MEDIA_ORIGIN = "http://127.0.0.1:8141";
    const on = await imgSrc("on");
    assert.ok(on.length >= 4);
    for (const d of on) assert.ok(d.endsWith("https://*.public.blob.vercel-storage.com http://127.0.0.1:8141"), d);
    for (const [i, bad] of ["https://127.0.0.1:8141", "http://evil.test:8141", "http://127.0.0.1:8141/files", "*"].entries()) {
      process.env.STOREFRONT_LOCAL_MEDIA_ORIGIN = bad;
      for (const d of await imgSrc("bad" + i)) assert.ok(!d.includes(bad.replace(/^\*$/, "@@")) && !/127\.0\.0\.1|evil|\*(?!\.public)/.test(d.replace("https://*.public.blob.vercel-storage.com", "")), d);
    }
  } finally {
    if (keep === undefined) delete process.env.STOREFRONT_LOCAL_MEDIA_ORIGIN; else process.env.STOREFRONT_LOCAL_MEDIA_ORIGIN = keep;
  }
});

/* ---- The blocking popup (z8uq9mfh05) ---- */

test("the popup markup: dialog, labelled title, equal buttons, policy link, change and 180-day lines, no close control", () => {
  const raw = metaPage(args(req())).markup.value;
  assert.match(raw, /role="dialog" aria-modal="true" aria-labelledby="no-meta-title" tabindex="-1" style="outline:none;/);
  assert.match(raw, /<h2 id="no-meta-title" style=/);
  assert.ok(!/<h2[^>]*tabindex/.test(raw), "the title is never focusable");
  assert.ok(raw.includes("Cookies &amp; privacy"));
  assert.ok(raw.includes(NOTICE_TEXT));
  assert.match(raw, /<a href="\/privacy-policy\/"[^>]*>Privacy &amp; Cookies Policy<\/a>/);
  assert.equal(NOTICE_POLICY_LABEL, "Privacy & Cookies Policy");
  assert.equal(NOTICE_CHANGE, "You can change this anytime in Cookie settings at the bottom of the page.");
  assert.equal(NOTICE_REMEMBER, "We'll remember your choice for 180 days.");
  assert.ok(raw.includes("You can change this anytime in Cookie settings at the bottom of the page."));
  assert.ok(raw.includes("We&#x27;ll remember your choice for 180 days."));
  assert.equal(CONSENT_MAX_AGE, 180 * 24 * 3600);
  const styles = [...raw.matchAll(/<button type="button" data-meta-choice="([01])" style="([^"]*)">([^<]*)<\/button>/g)];
  assert.equal(styles.length, 2);
  assert.deepEqual(styles.map((m) => m[3]).sort(), ["Accept", "Decline"]);
  assert.equal(styles[0][2], styles[1][2], "Accept and Decline carry the same style");
  assert.ok(!/close|&times;|×|aria-label="Close/i.test(raw), "no close control");
  assert.ok(!/gold|#c9a|#d4af|navy/i.test(raw));
  assert.ok(!raw.includes("<style") && !/onclick=|onkeydown=/.test(raw), "no inline style element or handler (CSP)");
});

test("the popup reopens from ?cookie-settings=1 with the same dialog and nothing of Meta's", () => {
  const raw = metaPage(args(req(ACCEPT, "https://www.santetest.com/?cookie-settings=1"))).markup.value;
  assert.ok(raw.includes('role="dialog"') && raw.includes('aria-modal="true"'));
  assert.ok(!raw.includes("facebook") && !raw.includes('id="no-meta"') && !raw.includes("fbevents"));
});

test("the unanswered page has nothing of Meta's: no fbevents, no data block, no Pixel ID, no server call", () => {
  const m = metaPage(args(req()));
  assert.equal(m.send, null);
  assert.ok(!/fbevents|connect\.facebook|fbq|facebook/.test(m.markup.value));
  assert.ok(!m.markup.value.includes('type="application/json"'));
});

test("the popup script locks the page scroll, focuses the card (not the title) and ignores Esc", () => {
  const s = runPixelScript("", "");
  assert.equal(s.state.bodyOverflow, "hidden");
  assert.equal(s.state.htmlOverflow, "hidden");
  assert.equal(s.state.focused, "card", "first focus is the card, not the title or a button");
  s.key("Escape");
  assert.equal(s.state.prevented, 1);
  assert.equal(s.cookie, "", "Esc writes no choice");
  assert.equal(s.reloaded, 0);
  assert.equal(s.assigned, "");
});

test("the popup script traps Tab inside the card, both ways, and pulls stray focus back", () => {
  const s = runPixelScript("", "");
  s.accept.focus(); // last control
  s.key("Tab");
  assert.equal(s.state.focused, "link", "Tab on the last control wraps to the first");
  s.key("Tab", true);
  assert.equal(s.state.focused, "accept", "Shift+Tab on the first control wraps to the last");
  s.card.focus();
  s.key("Tab", true);
  assert.equal(s.state.focused, "accept", "Shift+Tab from the card goes to the last control");
  s.outside.focus();
  s.key("Tab");
  assert.equal(s.state.focused, "link", "Tab from outside the card enters it");
  s.outside.focus();
  s.focusin(s.outside);
  assert.equal(s.state.focused, "card", "focus that leaves the card returns to the card");
});

test("the popup script gives focused controls a light-blue ring and never gold", () => {
  const s = runPixelScript("", "");
  const ring = (s.accept as unknown as { listeners: Record<string, Listener[]>; style: Record<string, string> });
  for (const fn of ring.listeners.focus) fn({ currentTarget: s.accept });
  assert.equal(ring.style.boxShadow, "0 0 0 3px #6C8CFF");
  for (const fn of ring.listeners.blur) fn({ currentTarget: s.accept });
  assert.equal(ring.style.boxShadow, "");
});
