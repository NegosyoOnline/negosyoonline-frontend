/* Purchase on the onboarding verify page (ClickUp z8uq9mfh12): one event, only on the first answer, with consent and a Pixel. */
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import {
  accessGet, addressPost, completedGet, onboardingGo, onboardingPage, type ObFlow,
} from "../src/lib/onboarding-flow.ts";
import type { Pack } from "../src/lib/django.ts";
import { onboardingPurchase } from "../src/lib/meta.ts";
import { SITE } from "./site.ts";

const secret = randomBytes(24).toString("hex"); // throwaway, made for this run only
const env = { apiBase: "http://api.test", secret };
const PIXEL_SITE = { ...SITE, meta_pixel_id: "123456789012345" }; // a made-up number, not a real Pixel
const PACK: Pack = {
  price_centavos: 148800, currency: "PHP", available: true,
  agreement: { id: 7, label: "v1.0", effective_date: "2026-11-03" }, payment_accounts: [],
};
const TOKEN = "T".repeat(43);
const VERIFY = "https://www.santetest.com/funnel/membership-pack/onboarding/verify/";
const ACCEPT = "__Host-no_meta_consent=1";
const DECLINE = "__Host-no_meta_consent=0";
const FIRST = {
  status: "queued", event_id: "pur_pko_abc123", first: true, value: 1488, currency: "PHP", content_ids: ["membership-pack"],
};

const state = () => ({
  step: "verify", order_number: "SP-1001", buyer_first_name: "Juan", mobile_masked: "+63 917 *** 4567",
  mobile: { pending: true, code_sent_to: "", resend_in: 0, attempts_left: 5 },
  email: { verified: false, email: "j@example.test", masked: "j***@example.test", code_sent: false, resend_in: 0, attempts_left: 5 },
  address: { country: "Philippines", receiver_name: "Juan Dela Cruz", receiver_mobile: "+639171234567" },
  details_erased: false, registration_held: null, expires_at: "2026-11-12T02:00:00Z",
});

type Answer = { status: number; body: unknown } | "throw" | "slow";
function fake(purchase: Answer, st: Record<string, unknown> = state()) {
  const calls: { path: string; body: Record<string, unknown>; init: RequestInit }[] = [];
  const fetchImpl = (url: string, init: RequestInit) => {
    const path = url.replace("http://api.test/storefront/v1/", "").replace(/\/$/, "");
    calls.push({ path, body: JSON.parse(String(init.body)), init });
    if (path === "onboarding/state") return Promise.resolve(Response.json(st));
    if (path === "meta/purchase") {
      if (purchase === "throw") return Promise.reject(new Error("down"));
      if (purchase === "slow") return Promise.reject(Object.assign(new Error("t"), { name: "TimeoutError" }));
      return Promise.resolve(Response.json(purchase.body, { status: purchase.status }));
    }
    throw new Error(`unexpected call: ${path}`);
  };
  return { calls, fetchImpl };
}
function flowOf(f: ReturnType<typeof fake>, cookie: string, site = PIXEL_SITE, url = VERIFY): ObFlow {
  return {
    site, pack: PACK, host: "demo.negosyotest.com", visitor_ip: "203.0.113.9", token: TOKEN,
    request: new Request(url, { headers: cookie ? { cookie } : {} }),
    calls: { env, fetchImpl: f.fetchImpl, log: () => {} }, now: new Date("2026-11-12T00:00:00Z"),
  };
}
const page = async (r: Response | null) => (await r!.text());
const purchaseCalls = (f: ReturnType<typeof fake>) => f.calls.filter((c) => c.path === "meta/purchase");

test("the first answer puts one Purchase on the verify page, with Django's id and the order's value", async () => {
  const f = fake({ status: 200, body: FIRST });
  const html = await page(await onboardingPage(flowOf(f, ACCEPT), "verify"));
  assert.equal(purchaseCalls(f).length, 1);
  const call = purchaseCalls(f)[0];
  assert.deepEqual(call.body, { host: "demo.negosyotest.com", visitor_ip: "203.0.113.9", token: TOKEN, consent: true });
  assert.ok(call.init.signal, "a 2 second timeout is set");
  const block = html.match(/<script type="application\/json" id="no-meta">(.*?)<\/script>/);
  assert.ok(block, "the data block is on the page");
  const data = JSON.parse(block![1]);
  assert.deepEqual(data, {
    pixel_id: "123456789012345", checkout: true,
    events: [{ name: "Purchase", id: "pur_pko_abc123", data: { value: 1488, currency: "PHP", content_ids: ["membership-pack"] } }],
  });
  assert.match(html, /<script src="\/assets\/sante\/js\/meta-pixel\.js\?v=[0-9a-f]{8}"><\/script>/);
  assert.ok(!html.includes('id="no-meta-notice"'), "the notice never shows here");
  assert.equal((html.match(/id="no-meta"/g) ?? []).length, 1);
});

test("a repeat visit (first: false) carries nothing of Meta's", async () => {
  const f = fake({ status: 200, body: { ...FIRST, first: false, status: "ignored" } });
  const html = await page(await onboardingPage(flowOf(f, ACCEPT), "verify"));
  assert.ok(!html.includes("no-meta") && !html.includes("meta-pixel.js"));
});

test("without Accept, or after Decline, or with no Pixel, Django is not even asked and the page is clean", async () => {
  for (const [cookie, site] of [["", PIXEL_SITE], [DECLINE, PIXEL_SITE], ["__Host-no_meta_consent=2", PIXEL_SITE], [ACCEPT, SITE]] as const) {
    const f = fake({ status: 200, body: FIRST });
    const html = await page(await onboardingPage(flowOf(f, cookie, site), "verify"));
    assert.equal(purchaseCalls(f).length, 0, `${cookie} ${site.meta_pixel_id}`);
    assert.ok(!html.includes("no-meta") && !html.includes("meta-pixel.js") && !html.includes("facebook"));
  }
});

test("a refused, failed, slow, odd or 404 answer leaves the page whole and clean", async () => {
  const answers: Answer[] = [
    { status: 409, body: { error: { code: "checkout_closed", message: "x" } } },
    { status: 404, body: { error: { code: "not_found", message: "Not found." } } },
    { status: 500, body: {} },
    "throw", "slow",
    { status: 200, body: { ...FIRST, event_id: "pv_pko_abc" } },
    { status: 200, body: { ...FIRST, event_id: 'pur_x"><script>' } },
    { status: 200, body: { ...FIRST, value: "1488" } },
    { status: 200, body: { ...FIRST, currency: "php" } },
    { status: 200, body: { ...FIRST, content_ids: [] } },
    { status: 200, body: { ...FIRST, first: "true" } },
    { status: 200, body: "nope" },
  ];
  for (const answer of answers) {
    const f = fake(answer);
    const r = await onboardingPage(flowOf(f, ACCEPT), "verify");
    assert.equal(r!.status, 200, JSON.stringify(answer));
    const html = await page(r);
    assert.match(html, /Verify Your Mobile Number/);
    assert.ok(!html.includes("no-meta") && !html.includes("meta-pixel.js"), JSON.stringify(answer));
  }
});

test("onboardingPurchase needs the server secret and a checkout cookie", async () => {
  const f = fake({ status: 200, body: FIRST });
  const base = { request: new Request(VERIFY, { headers: { cookie: ACCEPT } }), site: PIXEL_SITE, host: "h", token: TOKEN, visitorIp: "", env, fetchImpl: f.fetchImpl, log: () => {} };
  assert.equal((await onboardingPurchase({ ...base, token: "" })).value, "");
  assert.equal((await onboardingPurchase({ ...base, env: { apiBase: "http://api.test", secret: "short" } })).value, "");
  assert.equal(f.calls.length, 0);
  assert.ok((await onboardingPurchase(base)).value.includes("Purchase"));
});

test("no other onboarding step, access page or completed page asks Django or carries anything of Meta's", async () => {
  const addressState = { ...state(), step: "address", mobile: { pending: false, code_sent_to: "", resend_in: 0, attempts_left: 5 }, email: { verified: true, email: "j@example.test", masked: "j***", code_sent: false, resend_in: 0, attempts_left: 5 } };
  const f = fake({ status: 200, body: FIRST }, addressState);
  const pages: (Response | null)[] = [
    await onboardingPage(flowOf(f, ACCEPT, PIXEL_SITE, "https://www.santetest.com/funnel/membership-pack/onboarding/address/"), "address"),
    await onboardingPage(flowOf(f, ACCEPT, PIXEL_SITE, "https://www.santetest.com/funnel/membership-pack/onboarding/details/"), "details"),
    await onboardingGo(flowOf(f, ACCEPT)),
    await completedGet(flowOf(f, ACCEPT, PIXEL_SITE, "https://www.santetest.com/funnel/membership-pack/onboarding/completed/")),
    await accessGet(flowOf(f, ACCEPT, PIXEL_SITE, "https://www.santetest.com/funnel/membership-pack/access/abc/"), "abc"),
  ];
  for (const r of pages) {
    const html = r ? await r.text() : "";
    assert.ok(!html.includes("no-meta") && !html.includes("meta-pixel.js"));
  }
  assert.equal(purchaseCalls(f).length, 0);
});

test("a step's post that re-renders the verify page never carries Meta", async () => {
  const f = fake({ status: 200, body: FIRST });
  const r = await addressPost(flowOf(f, ACCEPT), { receiver_name: "" });
  const html = r ? await r.text() : "";
  assert.ok(!html.includes("no-meta"));
  assert.equal(purchaseCalls(f).length, 0);
});

/* ---- js/meta-pixel.js: the allow-list ---- */

function runPixel(events: unknown[]) {
  const source = readFileSync(new URL("../public/assets/sante/js/meta-pixel.js", import.meta.url), "utf8");
  const block = { textContent: JSON.stringify({ pixel_id: "123456789012345", checkout: true, events }) };
  const doc = {
    getElementById: (id: string) => (id === "no-meta" ? block : null),
    createElement: () => ({}),
    head: { appendChild: () => {} },
  };
  const win: Record<string, unknown> = { document: doc, location: { protocol: "https:", search: "" } };
  win.window = win;
  vm.runInNewContext(source, { ...win, parseInt, RegExp, String });
  const fbq = win.fbq as unknown as { queue: ArrayLike<unknown>[] };
  return Array.from(fbq.queue).map((a) => Array.from(a));
}

test("the Pixel script accepts Purchase with its eventID, keeps autoConfig off, and still refuses other names", () => {
  const data = { value: 1488, currency: "PHP", content_ids: ["membership-pack"] };
  const queue = runPixel([
    { name: "Purchase", id: "pur_pko_abc123", data },
    { name: "Lead", id: "ld_1" },
    { name: "AddPaymentInfo", id: "api_pko_abc123" },
  ]);
  assert.deepEqual(queue[0], ["set", "autoConfig", false, "123456789012345"]);
  assert.deepEqual(queue[1], ["init", "123456789012345"]);
  assert.equal(queue.length, 3, "Lead and AddPaymentInfo are not tracked");
  assert.equal(queue[2][0], "track");
  assert.equal(queue[2][1], "Purchase");
  assert.deepEqual(JSON.parse(JSON.stringify(queue[2][2])), data);
  assert.deepEqual(JSON.parse(JSON.stringify(queue[2][3])), { eventID: "pur_pko_abc123" });
});
