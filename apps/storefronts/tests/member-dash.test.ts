import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { affiliatePage, homePage, mediaPage, purchasesPage, type Dash } from "../src/lib/dashboard-flow.ts";
import { ordersPage } from "../src/lib/orders-flow.ts";
import { trainingPage } from "../src/lib/training-flow.ts";
import { bellGet, bellRead, bellReadAll } from "../src/lib/bell-flow.ts";
import { initials } from "../src/views/sante/member.ts";
import { assetVersions } from "../src/lib/assets.ts";
import { SITE, FILLED } from "./site.ts";

const secret = randomBytes(24).toString("hex"); // throwaway, made for this run only
const env = { apiBase: "http://api.test", secret, hostAliases: {} } as unknown as import("../src/lib/env.ts").StorefrontEnv;
const TOKEN = "M".repeat(43);

type Reply = { status: number; body: unknown };
function fake(replies: Record<string, Reply[]>) {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const fetchImpl = (url: string, init: RequestInit) => {
    const route = url.replace("http://api.test/storefront/v1/", "").replace(/\/(\?.*)?$/, "");
    calls.push({ path: route, body: init.body === undefined ? {} : JSON.parse(String(init.body)) });
    const next = (replies[route] ?? []).shift();
    if (!next) throw new Error(`unexpected call: ${route}`);
    return Promise.resolve(Response.json(next.body, { status: next.status }));
  };
  return { calls, fetchImpl };
}
function dashOf(f: ReturnType<typeof fake>, over: Partial<Dash> = {}, token = TOKEN): Dash {
  const request = new Request("http://www.santetest.com/dashboard/");
  return {
    site: SITE, now: new Date("2026-11-14T00:00:00Z"), appUrl: "",
    call: { request, host: "demo.negosyotest.com", visitor_ip: "", member_token: token, binding: "", env },
    calls: { env, fetchImpl: f.fetchImpl, log: () => {} },
    ...over,
  };
}
const ok = (body: unknown): Reply => ({ status: 200, body });
const err = (status: number, code = "x"): Reply => ({ status, body: { error: { code, message: "x" } } });
const ME = ok({ member: { id: "m1", full_name: "Juan Dela Cruz", email: "j@example.test", mobile: "+639171234567", email_verified: true, mobile_verified: true } });
const FREE = ok({ pack: null, registration: null });
const LOCKED = ok({ pack: { order_number: "SP-1", payment_status: "rejected", payment_label: "Needs attention", method_label: "Bank transfer", price_centavos: 100, tone: "att", benefits_off: true, proofs: [],
  lock: { reason_label: "Amount does not match", other_text: "", resubmitted: false, accounts: [] } }, registration: null });
const BLOB = "https://abc123.public.blob.vercel-storage.com/member-notices/a.png";
const NOTICE = (over: Record<string, unknown> = {}) => ({ id: "n1", kind: "announcement", title: "Store <news>", body: "Open on Sunday.", image_url: null, starts_at: null, ends_at: null, ...over });

const home = async (replies: Record<string, Reply[]>, over: Partial<Dash> = {}) => homePage(dashOf(fake(replies), over));

/* ---- the menu and the name dropdown ---------------------------------------------------------------------------- */

test("the bar lists Dashboard, Training, Media Library, Affiliate Hub and Orders, then the bell and the name; My Orders and the old items are gone", async () => {
  const body = await (await home({ "member/me": [ME], "member/pack": [FREE], "member/notices": [ok({ notices: [] })] })).text();
  const nav = body.slice(body.indexOf('id="pdnLinks"'), body.indexOf("</ul>", body.indexOf('id="pdnLinks"')));
  const labels = [...nav.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map((m) => `${m[2]} ${m[1]}`);
  assert.deepEqual(labels, ["Dashboard /dashboard/", "Training /dashboard/training/", "Media Library /dashboard/media/", "Affiliate Hub /dashboard/affiliate/", "Orders /dashboard/orders/"]);
  assert.match(nav, /<a href="\/dashboard\/"[^>]*aria-current="page"/);
  assert.ok(body.indexOf("data-pdn-bell-btn") > body.indexOf('id="pdnLinks"') && body.indexOf("data-pdn-user-btn") > body.indexOf("data-pdn-bell-btn"));
  assert.doesNotMatch(body, /My Orders|class="pdn-who">Juan[^]*class="pdn-out"|<li><a href="\/dashboard\/account\//);
  assert.match(body, /id="pdnToggle"/); // the mobile drawer button
});

test("the name opens a dropdown: My Purchases, Account Settings, Help Center (the store's contact section), Theme and Logout", async () => {
  const body = await (await home({ "member/me": [ME], "member/pack": [FREE], "member/notices": [ok({ notices: [] })] })).text();
  const pop = body.slice(body.indexOf("data-pdn-user-pop"), body.indexOf("</nav>"));
  assert.match(pop, /<a href="\/dashboard\/purchases\/">[^]*?<span>My Purchases<\/span>/);
  assert.match(pop, /<a href="\/dashboard\/account\/">[^]*?<span>Account Settings<\/span>/);
  assert.match(pop, /<a href="\/#contact">[^]*?<span>Help Center<\/span>/);
  assert.match(pop, /data-pdn-theme[^>]*>[^]*>Light<\/span>[^]*>Dark<\/span>/);
  assert.match(pop, /<form method="post" action="\/dashboard\/sign-out\/" class="pdn-dd-out"><button type="submit" class="pdn-dd-logout">[^]*Logout<\/button><\/form>/);
  assert.match(body, /<span class="pdn-avatar" aria-hidden="true">JD<\/span><span class="pdn-who">Juan Dela Cruz<\/span>/);
  assert.match(body, /<script src="\/assets\/sante\/js\/pack-member-bar\.js\?v=[0-9a-f]{8}"><\/script>\n?<\/head>|pack-member-bar\.js/);
});

test("the initials avatar: two letters, one for a one-word name, a mark for none", () => {
  assert.equal(initials("juan dela cruz"), "JD");
  assert.equal(initials("Ana"), "A");
  assert.equal(initials("  "), "?");
});

test("the bar's files are listed assets, the script has no inline form, and the theme switch and boxed width are in them", async () => {
  assert.ok("css/pack-member-bar.css" in assetVersions() && "js/pack-member-bar.js" in assetVersions());
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("../public/assets/sante/css/pack-member-bar.css", import.meta.url), "utf8");
  const js = readFileSync(new URL("../public/assets/sante/js/pack-member-bar.js", import.meta.url), "utf8");
  assert.match(css, /max-width: 1240px/);
  assert.match(css, /padding: 24px 15px 40px/);
  assert.match(css, /html\[data-theme="dark"\]/);
  assert.match(js, /no-member-theme/);
  assert.match(js, /localStorage/);
  assert.match(js, /\/dashboard\/notifications\/read-all\//);
});

/* ---- the Home ---------------------------------------------------------------------------------------------------- */

test("the Home shows the Announcements & promos panel, escaped, with the kind, a picture from the media store and the dates", async () => {
  const body = await (await home({ "member/me": [ME], "member/pack": [FREE], "member/notices": [ok({ notices: [
    NOTICE({ image_url: BLOB }),
    NOTICE({ id: "n2", kind: "promo", title: "Promo", body: "", starts_at: "2026-11-14T00:00:00Z", ends_at: "2026-11-20T00:00:00Z", image_url: "https://evil.test/x.png" }),
  ] })] })).text();
  assert.match(body, /Announcements &amp; promos/);
  assert.match(body, /<span class="md-kind md-kind-announcement">Announcement<\/span>\s*<h3>Store &lt;news&gt;<\/h3>/);
  assert.match(body, /<span class="md-kind md-kind-promo">Promo<\/span>/);
  assert.ok(body.includes(`src="${BLOB}"`));
  assert.doesNotMatch(body, /evil\.test/);
  assert.match(body, /Nov 14, 2026 to Nov 20, 2026/);
  assert.match(body, /data-slot="next-live-training"/);
  assert.match(body, /data-slot="pick-up-where-you-left-off"/);
});

test("the panel is hidden when there are no notices, or the notices cannot be read; the order figures are gone", async () => {
  for (const notices of [ok({ notices: [] }), err(500), err(404)]) {
    const body = await (await home({ "member/me": [ME], "member/pack": [FREE], "member/notices": [notices] })).text();
    assert.doesNotMatch(body, /md-notices|Announcements/);
    assert.match(body, /<h1>Dashboard<\/h1>/);
    assert.match(body, /Signed in as <strong>Juan Dela Cruz<\/strong>/);
    assert.doesNotMatch(body, /acct-kpi|Total Spent|Order Monitoring|View all orders/);
  }
});

test("the Notices read sends host and member token only; a dead session goes to the store home", async () => {
  const f = fake({ "member/me": [ME], "member/pack": [FREE], "member/notices": [ok({ notices: [] })] });
  await homePage(dashOf(f));
  assert.deepEqual(f.calls.find((c) => c.path === "member/notices")!.body, { host: "demo.negosyotest.com", token: TOKEN });
  const dead = await homePage(dashOf(fake({ "member/me": [ME], "member/pack": [FREE], "member/notices": [err(401, "member_session_invalid")] })));
  assert.equal(dead.headers.get("location"), "/");
  assert.equal((await homePage(dashOf(fake({}), {}, ""))).headers.get("location"), "/");
});

test("a rejected order sends the Home to My Purchases", async () => {
  assert.equal((await home({ "member/me": [ME], "member/pack": [LOCKED] })).headers.get("location"), "/dashboard/purchases/");
});

/* ---- My Purchases ------------------------------------------------------------------------------------------------ */

test("My Purchases holds the Membership Pack payment card, and the rejected order's dialog, off the Home", async () => {
  const pack = { order_number: "SP-1001", payment_status: "pending_review", payment_label: "Under review", method_label: "Bank transfer", price_centavos: 148800, tone: "rev", benefits_off: true, lock: null, proofs: [] };
  const body = await (await purchasesPage(dashOf(fake({ "member/me": [ME], "member/pack": [ok({ pack, registration: null })] })))).text();
  assert.match(body, /<h1>My Purchases<\/h1>/);
  assert.match(body, /<title>My Purchases \| /);
  assert.match(body, /SP-1001/);
  assert.match(body, /Bank transfer · ₱1,488\.00/);
  const lock = await (await purchasesPage(dashOf(fake({ "member/me": [ME], "member/pack": [LOCKED] })))).text();
  assert.match(lock, /<dialog class="pk-dlg" id="pk-lock" open/);
  const gone = await (await home({ "member/me": [ME], "member/pack": [ok({ pack, registration: null })], "member/notices": [ok({ notices: [] })] })).text();
  assert.doesNotMatch(gone, /SP-1001|Membership Pack/);
});

test("My Purchases: a member with no pack sees the empty-state sentence, a member with a pack does not", async () => {
  const none = await (await purchasesPage(dashOf(fake({ "member/me": [ME], "member/pack": [FREE] })))).text();
  assert.match(none, /You have no Membership Pack purchase on this account yet\./);
  assert.match(none, /<section class="md-card"/);
  const pack = { order_number: "SP-1001", payment_status: "pending_review", payment_label: "Under review", method_label: "Bank transfer", price_centavos: 148800, tone: "rev", benefits_off: true, lock: null, proofs: [] };
  const has = await (await purchasesPage(dashOf(fake({ "member/me": [ME], "member/pack": [ok({ pack, registration: null })] })))).text();
  assert.doesNotMatch(has, /no Membership Pack purchase/);
  assert.match(has, /SP-1001/);
});

test("My Purchases: signed out goes to the store home, a dead session clears the cookie", async () => {
  assert.equal((await purchasesPage(dashOf(fake({}), {}, ""))).headers.get("location"), "/");
  const dead = await purchasesPage(dashOf(fake({ "member/me": [err(401, "member_session_invalid")] })));
  assert.equal(dead.headers.get("location"), "/");
});

/* ---- the placeholder pages --------------------------------------------------------------------------------------- */

test("Media Library is a plain placeholder", async () => {
  for (const [page, title] of [[mediaPage, "Media Library"]] as const) {
    const body = await (await page(dashOf(fake({ "member/me": [ME], "member/pack": [FREE] })))).text();
    assert.match(body, new RegExp(`<h1>${title}</h1>`));
    assert.match(body, /data-md-page="soon"/);
    assert.match(body, /This page is coming soon\./);
  }
});

test("Affiliate Hub says the orders are in the app, with the app link only when it is set, and shows no earnings or referral link (the Orders log is in orders.test.ts)", async () => {
  for (const [page, title] of [[affiliatePage, "Affiliate Hub"]] as const) {
    const withLink = await (await page(dashOf(fake({ "member/me": [ME], "member/pack": [FREE] }), { appUrl: "https://apps.example.test/sante" }))).text();
    assert.match(withLink, new RegExp(`<h1>${title}</h1>`));
    assert.match(withLink, /Your orders are placed and tracked in the Sant(é|&eacute;) Mobile App\./);
    assert.match(withLink, /<a href="https:\/\/apps\.example\.test\/sante"[^>]*>Open the Sant&eacute; Mobile App<\/a>/);
    const without = await (await page(dashOf(fake({ "member/me": [ME], "member/pack": [FREE] })))).text();
    assert.match(without, /placed and tracked in the Sant/);
    assert.doesNotMatch(without, /Open the Sant/);
    assert.doesNotMatch(withLink + without, /earnings|referral/i);
  }
});

test("a placeholder page goes to My Purchases while the order is rejected, and to the store home signed out", async () => {
  for (const page of [trainingPage, mediaPage, affiliatePage, ordersPage]) {
    assert.equal((await page(dashOf(fake({ "member/me": [ME], "member/pack": [LOCKED] })))).headers.get("location"), "/dashboard/purchases/");
    assert.equal((await page(dashOf(fake({}), {}, ""))).headers.get("location"), "/");
  }
});

/* ---- the bell's routes ------------------------------------------------------------------------------------------- */

const HOST = "www.santetest.com:3062";
type Seen = { url: string; body: string };
async function withDjango(routes: Record<string, Reply>, run: (seen: Seen[]) => Promise<void>): Promise<void> {
  const seen: Seen[] = [];
  const names = ["STOREFRONT_API_BASE", "STOREFRONT_SERVER_SECRET", "STOREFRONT_HOST_ALIASES", "VERCEL"];
  const before = { fetch: globalThis.fetch, error: console.error, env: names.map((n) => process.env[n]) };
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    seen.push({ url, body: String(init?.body ?? "") });
    if (url.startsWith("http://api.test/storefront/v1/site/")) return Response.json(FILLED);
    const route = url.replace("http://api.test/storefront/v1/", "").replace(/\/$/, "");
    const r = routes[route];
    return r ? Response.json(r.body, { status: r.status }) : Response.json({ error: {} }, { status: 404 });
  }) as typeof fetch;
  console.error = () => {};
  Object.assign(process.env, { STOREFRONT_API_BASE: "http://api.test", STOREFRONT_SERVER_SECRET: secret, STOREFRONT_HOST_ALIASES: "www.santetest.com=demo-store.negosyotest.com" });
  delete process.env.VERCEL;
  try { await run(seen); } finally {
    globalThis.fetch = before.fetch;
    console.error = before.error;
    names.forEach((n, i) => { if (before.env[i] === undefined) delete process.env[n]; else process.env[n] = before.env[i]; });
  }
}
const cookie = { cookie: `no_member=${TOKEN}` };
const req = (p: string, init: { method?: string; body?: string; headers?: Record<string, string> } = {}) =>
  new Request(`http://${HOST}${p}`, { method: init.method ?? "GET", body: init.body, headers: { host: HOST, ...init.headers } });
const postJson = (p: string, body: unknown, headers: Record<string, string> = { ...cookie, "sec-fetch-site": "same-origin", "content-type": "application/json" }) =>
  req(p, { method: "POST", body: JSON.stringify(body), headers });
const BELL = { notifications: [{ id: "k1", kind: "notice", title: "New promo", url: "/dashboard/", created_at: "2026-11-14T01:00:00Z", read_at: null }, { id: "k2", kind: "notice", title: "Old", url: "/dashboard/", created_at: "2026-11-13T01:00:00Z", read_at: "2026-11-13T02:00:00Z" }], unread_count: 1 };

test("GET /dashboard/notifications/ gives the list and the unread count as no-store JSON, calling Django with the cookie's token as data", async () => {
  await withDjango({ "member/notifications": ok(BELL) }, async (seen) => {
    const r = await bellGet(req("/dashboard/notifications/", { headers: cookie }));
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type") ?? "", /application\/json/);
    assert.equal(r.headers.get("cache-control"), "no-store");
    const body = await r.json() as { notifications: { id: string; read_at: string }[]; unread_count: number };
    assert.equal(body.unread_count, 1);
    assert.deepEqual(body.notifications.map((n) => n.id), ["k1", "k2"]);
    assert.equal(body.notifications[0].read_at, "");
    const call = seen.find((s) => s.url.endsWith("/member/notifications/"))!;
    assert.deepEqual(JSON.parse(call.body), { host: "demo-store.negosyotest.com", token: TOKEN });
    assert.ok(!JSON.stringify(body).includes(TOKEN));
  });
});

test("the bell's GET without a session is 401 with no call to Django; a dead session is 401; an API failure is 503", async () => {
  await withDjango({ "member/notifications": err(401, "member_session_invalid") }, async (seen) => {
    assert.equal((await bellGet(req("/dashboard/notifications/"))).status, 401);
    assert.equal(seen.filter((s) => s.url.includes("/member/")).length, 0);
    assert.equal((await bellGet(req("/dashboard/notifications/", { headers: cookie }))).status, 401);
  });
  await withDjango({ "member/notifications": err(500) }, async () => {
    assert.equal((await bellGet(req("/dashboard/notifications/", { headers: cookie }))).status, 503);
  });
});

test("POST read marks one notification read and answers the new count; a bad id is 404 before Django is called", async () => {
  await withDjango({ "member/notifications/k1/read": ok({ notification: BELL.notifications[0], unread_count: 0 }) }, async (seen) => {
    const r = await bellRead(postJson("/dashboard/notifications/read/", { id: "k1" }));
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { unread_count: 0 });
    const call = seen.find((s) => s.url.endsWith("/member/notifications/k1/read/"))!;
    assert.deepEqual(JSON.parse(call.body), { host: "demo-store.negosyotest.com", token: TOKEN });
    const before = seen.filter((s) => s.url.includes("/member/")).length;
    for (const id of ["../x", "", "a b", 5]) assert.equal((await bellRead(postJson("/dashboard/notifications/read/", { id }))).status, 404);
    assert.equal((await bellRead(req("/dashboard/notifications/read/", { method: "POST", body: "not json", headers: { ...cookie, "sec-fetch-site": "same-origin" } }))).status, 404);
    assert.equal(seen.filter((s) => s.url.includes("/member/")).length, before);
  });
});

test("another member's or a missing notification is 404 from Django and 404 here", async () => {
  await withDjango({ "member/notifications/other/read": err(404, "not_found") }, async () => {
    assert.equal((await bellRead(postJson("/dashboard/notifications/read/", { id: "other" }))).status, 404);
  });
});

test("POST read-all marks them all and answers the new count", async () => {
  await withDjango({ "member/notifications/read-all": ok({ marked: 1, unread_count: 0 }) }, async () => {
    const r = await bellReadAll(postJson("/dashboard/notifications/read-all/", {}));
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { unread_count: 0 });
  });
});

test("the bell's posts follow the Origin rule: another site or no origin is 403, and no session is 401", async () => {
  await withDjango({ "member/notifications/k1/read": ok({ unread_count: 0 }), "member/notifications/read-all": ok({ unread_count: 0 }) }, async (seen) => {
    const cross = { ...cookie, "sec-fetch-site": "cross-site", "content-type": "application/json" };
    assert.equal((await bellRead(postJson("/dashboard/notifications/read/", { id: "k1" }, cross))).status, 403);
    assert.equal((await bellReadAll(postJson("/dashboard/notifications/read-all/", {}, cross))).status, 403);
    assert.equal((await bellRead(postJson("/dashboard/notifications/read/", { id: "k1" }, { ...cookie, origin: "http://evil.test" }))).status, 403);
    assert.equal((await bellRead(postJson("/dashboard/notifications/read/", { id: "k1" }, { ...cookie }))).status, 403);
    assert.equal((await bellRead(postJson("/dashboard/notifications/read/", { id: "k1" }, { "sec-fetch-site": "same-origin" }))).status, 401);
    assert.equal(seen.filter((s) => s.url.includes("/member/")).length, 0);
  });
});
