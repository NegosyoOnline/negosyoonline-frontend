import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { homePage, type Dash } from "../src/lib/dashboard-flow.ts";
import { trainingHome, trainingMobileApp, trainingProducts, trainingWaysToEarn } from "../src/lib/training-flow.ts";
import { NOTICES, noticesFor, previewFixtureOn, videoUrl, MOBILE_APP_VIDEO_URL, TRAINING_MODULES } from "../src/lib/training-content.ts";
import { SECTIONS } from "../src/views/sante/member.ts";
import { mobileAppPage, noticesPanel, waysToEarnPage } from "../src/views/sante/training.ts";
import { SITE } from "./site.ts";

const secret = randomBytes(24).toString("hex");
const env = { apiBase: "http://api.test", secret, hostAliases: {} } as unknown as import("../src/lib/env.ts").StorefrontEnv;
type Reply = { status: number; body: unknown };
function fake(replies: Record<string, Reply[]>) {
  const hosts: string[] = [];
  const fetchImpl = (url: string) => {
    const u = new URL(url);
    const route = u.pathname.replace("/storefront/v1/", "").replace(/\/$/, "");
    hosts.push(`${route}@${u.searchParams.get("host") ?? ""}`);
    const next = (replies[route] ?? []).shift();
    if (!next) throw new Error(`unexpected call: ${route}`);
    return Promise.resolve(Response.json(next.body, { status: next.status }));
  };
  return { fetchImpl, hosts };
}
function dashOf(f: ReturnType<typeof fake>, token = "M".repeat(43), host = "demo.negosyotest.com"): Dash {
  const request = new Request("http://www.santetest.com/dashboard/training/");
  return { site: SITE, now: new Date("2026-11-12T00:00:00Z"), call: { request, host, visitor_ip: "", member_token: token, binding: "", env }, calls: { env, fetchImpl: f.fetchImpl as never, log: () => {} } };
}
const ME = { status: 200, body: { member: { id: "m1", full_name: "Juan Dela Cruz", email: "j@example.test", mobile: "+639171234567", email_verified: true, mobile_verified: true } } };
const PACK = { status: 200, body: { pack: null, registration: null } };
const signedIn = () => ({ "member/me": [ME], "member/pack": [PACK] });
const PRODUCT = { id: "p1", code: "BAR1", name: "Santé Barley", short_description: "Barley grass drink.", srp_centavos: 148800, unit_members_price_centavos: 99900, revision: 1, category: "barley", long_description: "", image_url: "" };

test("signed in, Training and its three module pages open, with no price, cart or order button", async () => {
  for (const [run, text] of [[trainingHome, /Product Trainings/], [trainingMobileApp, /Video coming soon/], [trainingWaysToEarn, /promise of income/]] as const) {
    const r = await run(dashOf(fake(signedIn())));
    assert.equal(r.status, 200);
    const body = await r.text();
    assert.match(body, text);
    assert.match(body, /aria-current="page"/);
    assert.doesNotMatch(body, /₱|\/cart\/|Add to|Order now|Buy|Shop now/);
  }
  const f = fake({ ...signedIn(), "catalog/products": [{ status: 200, body: { products: [PRODUCT] } }] });
  const page = await (await trainingProducts(dashOf(f))).text();
  const body = page.slice(page.indexOf('<main'), page.indexOf("</main>"));
  assert.match(body, /Santé Barley/);
  assert.match(body, /Barley grass drink/);
  assert.doesNotMatch(body, /1,488|998|₱|\/cart\/|<form|Add to|Order|Buy/);
  assert.deepEqual(f.hosts.filter((h) => h.startsWith("catalog")), ["catalog/products@demo.negosyotest.com"]);
});

test("the index shows exactly the three modules, and the menu has Training between My Orders and Account", async () => {
  assert.equal(TRAINING_MODULES.length, 3);
  const body = await (await trainingHome(dashOf(fake(signedIn())))).text();
  assert.equal((body.match(/class="tr-card"/g) ?? []).length, 3);
  const keys = SECTIONS.filter((s) => s.built).map((s) => s.key);
  assert.deepEqual(keys, ["home", "orders", "training", "account"]);
  assert.match(body, /<li><a href="\/dashboard\/training\/" aria-current="page">Training<\/a><\/li>/);
});

test("signed out, every Training page goes to the store home", async () => {
  for (const run of [trainingHome, trainingMobileApp, trainingProducts, trainingWaysToEarn]) {
    const r = await run(dashOf(fake({}), ""));
    assert.equal(r.status, 303);
    assert.equal(new URL(r.headers.get("location") ?? "", "http://x").pathname, "/");
  }
});

test("site isolation: a session the API refuses for this host clears the cookie and goes home, and shows no Training", async () => {
  const f = fake({ "member/me": [{ status: 401, body: { error: { code: "unauthenticated", message: "no" } } }] });
  const r = await trainingHome(dashOf(f, "O".repeat(43), "other.negosyotest.com"));
  assert.equal(r.status, 303);
  assert.match(r.headers.getSetCookie().join("\n"), /no_member=;|Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  assert.deepEqual(f.hosts, ["member/me@"]); // the host rides in the body; nothing else was read
});

test("a locked dashboard sends Training back to Home", async () => {
  const lock = { reason_label: "x", other_text: "", resubmitted: false, accounts: [] };
  const f = fake({ "member/me": [ME], "member/pack": [{ status: 200, body: { pack: { order_number: "SP-1", payment_status: "rejected", payment_label: "r", method_label: "b", price_centavos: 1, tone: "rej", benefits_off: true, lock, proofs: [] }, registration: null } }] });
  const r = await trainingHome(dashOf(f));
  assert.equal(r.status, 303);
  assert.equal(new URL(r.headers.get("location") ?? "", "http://x").pathname, "/dashboard/");
});

test("the shipped notices list is empty, so the Home has no panel; the fixture shows one announcement and one promo only when switched on", async () => {
  assert.deepEqual(NOTICES.sante, []);
  assert.equal(MOBILE_APP_VIDEO_URL, "");
  assert.equal(noticesFor("sante", {}).length, 0);
  assert.equal(noticesFor("sante", { TRAINING_PREVIEW_FIXTURE: "0" }).length, 0);
  assert.equal(noticesFor("sante", { TRAINING_PREVIEW_FIXTURE: "1", NODE_ENV: "production" }).length, 0);
  assert.equal(previewFixtureOn({ TRAINING_PREVIEW_FIXTURE: "1", NODE_ENV: "production" }), false);
  const on = noticesFor("sante", { TRAINING_PREVIEW_FIXTURE: "1", NODE_ENV: "development" });
  assert.deepEqual(on.map((n) => n.kind), ["announcement", "promo"]);
  const panel = noticesPanel(on).toString();
  assert.match(panel, /Announcement/);
  assert.match(panel, /Promo/);
  assert.equal(noticesPanel([]).toString(), "");
  const f = fake({ "member/me": [ME], "member/pack": [PACK], "member/home": [{ status: 404, body: {} }] });
  const home = await (await homePage(dashOf(f))).text();
  assert.doesNotMatch(home, /nt-panel"/);
});

test("the Mobile App page links a video only when the address is https; Ways to Earn links the terms only when set", () => {
  assert.equal(videoUrl(""), "");
  assert.equal(videoUrl("http://x.test/v"), "");
  assert.equal(videoUrl("javascript:alert(1)"), "");
  assert.match(mobileAppPage("Juan", videoUrl("https://video.example.test/v")).toString(), /href="https:\/\/video\.example\.test\/v"/);
  assert.doesNotMatch(waysToEarnPage("Juan", "").toString(), /<a class="tr-btn"|terms/i);
  assert.match(waysToEarnPage("Juan", "https://x.example.test/terms").toString(), /Referral Program Terms<\/a>/);
  assert.doesNotMatch(waysToEarnPage("Juan").toString().replace(/<style>[^]*?<\/style>/, ""), /₱|\d+%/);
});
