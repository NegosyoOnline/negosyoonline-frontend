/* The buyer portal (ClickUp z8uq9menxk, backend contract z8uq9menvu): route list, neutral answers, and only the contract's fields. */
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { GET as portalGet, POST as portalPost } from "../src/app/portal/route.ts";
import { GET as ordersGet, POST as ordersPost } from "../src/app/portal/orders/route.ts";
import { GET as proofGet } from "../src/app/portal/proof/[id]/route.ts";
import { GET as signOutGet, POST as signOutPost } from "../src/app/portal/sign-out/route.ts";
import { GET as dashGet } from "../src/app/dashboard/route.ts";
import { GET as dashOrdersGet } from "../src/app/dashboard/orders/route.ts";
import { GET as dashSignInGet, POST as dashSignInPost } from "../src/app/dashboard/sign-in/route.ts";
import { POST as dashSignOutPost } from "../src/app/dashboard/sign-out/route.ts";
import { GET as dashProofGet } from "../src/app/dashboard/pack/proof/[id]/route.ts";
import { FILLED } from "./site.ts";

const secret = randomBytes(24).toString("hex"); // throwaway, made for this run only
const TOKEN = "T".repeat(43);
const BINDING = "B".repeat(43);
const HOST = "www.santetest.com:3062";
const API_HOST = "demo-store.negosyotest.com";

/* ---- the fixed route list ------------------------------------------------------------------------------------- */

function routeFiles(dir: string, base = dir): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) found.push(...routeFiles(full, base));
    else found.push(path.relative(base, full));
  }
  return found.sort();
}

test("the portal route list is fixed: /portal/, orders, proof, sign-out, and nothing else", () => {
  assert.deepEqual(routeFiles(path.join(import.meta.dirname, "../src/app/portal")), [
    "orders/route.ts", "proof/[id]/route.ts", "route.ts", "sign-out/route.ts",
  ]);
});

test("every portal route answers only its own methods; the rest are the neutral 404", async () => {
  const allowed: [string, Record<string, unknown>][] = [
    ["portal", { GET: portalGet, POST: portalPost }], ["orders", { GET: ordersGet }], ["proof", { GET: proofGet }], ["sign-out", { POST: signOutPost }],
  ];
  const mods = [
    await import("../src/app/portal/route.ts"), await import("../src/app/portal/orders/route.ts"),
    await import("../src/app/portal/proof/[id]/route.ts"), await import("../src/app/portal/sign-out/route.ts"),
  ] as Record<string, unknown>[];
  mods.forEach((mod, i) => {
    const methods = Object.keys(mod).filter((k) => /^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)$/.test(k)).sort();
    const want = [...Object.keys(allowed[i][1]), "PUT", "PATCH", "DELETE", "OPTIONS", ...(allowed[i][1].GET ? [] : ["GET"]), ...(allowed[i][1].POST ? [] : ["POST"])].sort();
    assert.deepEqual(methods, want, allowed[i][0]);
  });
});

/* ---- a fake Django -------------------------------------------------------------------------------------------- */

type Call = { url: string; init: RequestInit };
const json = (status: number, body: unknown) => () => Response.json(body, { status });
const unauth = json(401, { error: { code: "member_session_invalid", message: "Not signed in." } });
const missing = json(404, { error: { code: "not_found", message: "Not found." } });

async function withDjango(
  portal: Record<string, () => Response>,
  run: (seen: Call[]) => Promise<void>,
  opts: { served?: boolean } = {},
): Promise<void> {
  const seen: Call[] = [];
  const names = ["STOREFRONT_API_BASE", "STOREFRONT_SERVER_SECRET", "STOREFRONT_HOST_ALIASES", "VERCEL"];
  const before = { fetch: globalThis.fetch, error: console.error, env: names.map((n) => process.env[n]) };
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    seen.push({ url, init: init ?? {} });
    if (url.startsWith("http://api.test/storefront/v1/site/")) return opts.served ? Response.json(FILLED) : Response.json({ error: {} }, { status: 404 });
    if (url.startsWith("http://api.test/storefront/v1/member/") || url.startsWith("http://api.test/storefront/v1/pack/")) {
      return opts.served ? (portal["member"] ?? missing)() : missing();
    }
    const route = url.replace("http://api.test/storefront/v1/portal/", "").replace(/\/$/, "");
    return (portal[route] ?? missing)();
  }) as typeof fetch;
  console.error = () => {};
  Object.assign(process.env, { STOREFRONT_API_BASE: "http://api.test", STOREFRONT_SERVER_SECRET: secret, STOREFRONT_HOST_ALIASES: `www.santetest.com=${API_HOST}`, VERCEL: "" });
  try { await run(seen); } finally {
    globalThis.fetch = before.fetch;
    console.error = before.error;
    names.forEach((n, i) => { if (before.env[i] === undefined) delete process.env[n]; else process.env[n] = before.env[i]; });
  }
}

const get = (p: string, cookie = "") => new Request(`http://${HOST}${p}`, { headers: { host: HOST, ...(cookie ? { cookie } : {}) } });
function post(p: string, fields: Record<string, string>, cookie = "", extra: Record<string, string> = {}): Request {
  return new Request(`http://${HOST}${p}`, { method: "POST", body: new URLSearchParams(fields).toString(),
    headers: { host: HOST, "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": "same-origin", ...(cookie ? { cookie } : {}), ...extra } });
}
const setCookies = (r: Response) => r.headers.getSetCookie();
const bodyOf = (call: Call) => JSON.parse(call.init.body as string);
const NOT_FOUND = /Page not found\./;

const OPEN = json(200, { display_name: "Nena's Wellness & Barley", accent_color: "#0a7d3c", closes_at: "2026-12-30T15:00:00+08:00", banner: "This store is not taking orders." });
const ME = json(200, { first_name: "Ana" });
const ANSWER = json(200, { step: "code", message: "If this matches a member of this store, we sent a code.", offer_email: false });

const CARD = {
  id: "ord_1", order_number: "SP-1001", created_at: "2026-10-01T02:00:00+00:00", total_centavos: 148800, total_text: "1,488.00",
  payment_method_label: "Bank or e-wallet transfer", payment_status: "verified", payment_label: "Verified", verified_at: "2026-10-02",
  steps: [
    { num: 1, label: "Order Placed", status: "done", date: "2026-10-01" }, { num: 2, label: "Payment Verified", status: "done", date: "2026-10-02" },
    { num: 3, label: "Shipped", status: "done", date: "2026-10-04" }, { num: 4, label: "Delivered", status: "current", date: null },
  ],
  courier: "J&T", tracking: "JT-0002B", shipped_on: "2026-10-04", delivered_on: null,
  proofs: [{ id: "prf_1", seq: 1, submitted_at: "2026-10-01T03:00:00+00:00", amount_sent_centavos: 148800, reference_number: "REF123", content_type: "image/png" }],
  registration: { label: "Registered", line: "Your Santé membership is active." },
};

/* ---- /dashboard/* on an unserved site is still neutral ------------------------------------------------------------ */

test("/dashboard/* on an unserved site still answers the neutral 404 and never reaches a portal route", async () => {
  await withDjango({ site: OPEN, orders: json(200, { cards: [CARD], closes_at: null, banner: "x" }), me: ME }, async (seen) => {
    const cookie = `no_member=${TOKEN}`;
    const answers = [
      await dashGet(get("/dashboard/", cookie)),
      await dashOrdersGet(get("/dashboard/orders/", cookie)),
      await dashSignInGet(get("/dashboard/sign-in/", cookie)),
      await dashSignInPost(post("/dashboard/sign-in/", { action: "request", contact: "a@x.test" })),
      await dashSignOutPost(post("/dashboard/sign-out/", {}, cookie)),
      await dashProofGet(get("/dashboard/pack/proof/prf_1/", cookie), { params: Promise.resolve({ id: "prf_1" }) }),
    ];
    for (const r of answers) {
      assert.equal(r.status, 404);
      assert.match(await r.text(), NOT_FOUND);
    }
    assert.ok(seen.every((s) => !s.url.includes("/portal/")), "no dashboard page asks the portal");
  });
});

/* ---- a served site's /portal/ is neutral (the API answers 404) ------------------------------------------------------- */

test("a served site's /portal/*: portal/site answers 404, every portal route is the neutral 404 and nothing else is called", async () => {
  await withDjango({ site: missing, orders: json(200, { cards: [CARD], closes_at: null, banner: "x" }), me: ME }, async (seen) => {
    const cookie = `no_member=${TOKEN}`;
    const answers = [
      await portalGet(get("/portal/", cookie)),
      await portalPost(post("/portal/", { action: "request", contact: "a@x.test" })),
      await ordersGet(get("/portal/orders/", cookie)),
      await proofGet(get("/portal/proof/prf_1/", cookie), { params: Promise.resolve({ id: "prf_1" }) }),
      await signOutPost(post("/portal/sign-out/", {}, cookie)),
    ];
    for (const r of answers) {
      assert.equal(r.status, 404);
      assert.match(await r.text(), NOT_FOUND);
    }
    assert.ok(seen.every((s) => s.url === "http://api.test/storefront/v1/portal/site/"), "only portal/site is asked");
    assert.equal(seen.length, answers.length);
    assert.deepEqual(bodyOf(seen[0]), { host: API_HOST });
  });
});

test("the portal never calls siteFor (no /storefront/v1/site/ call) and sends the server credential", async () => {
  await withDjango({ site: OPEN, me: unauth }, async (seen) => {
    await portalGet(get("/portal/", `no_member=${TOKEN}`));
    assert.ok(seen.every((s) => !s.url.startsWith("http://api.test/storefront/v1/site/")));
    assert.equal((seen[0].init.headers as Record<string, string>).Authorization, `Bearer ${secret}`);
    assert.equal(seen[0].init.method, "POST");
  });
});

test("other portal answers fail closed: an unreadable site answer, an error status and a down API are all neutral", async () => {
  for (const answer of [json(200, { display_name: 1 }), json(500, {}), () => new Response("<html>", { status: 200 })]) {
    await withDjango({ site: answer }, async () => {
      const r = await portalGet(get("/portal/"));
      assert.equal(r.status, 404);
      assert.match(await r.text(), NOT_FOUND);
    });
  }
});

/* ---- sign-in -------------------------------------------------------------------------------------------------- */

test("GET /portal/ signed out: the dashboard's sign-in card on the portal shell, with the banner and no dashboard link", async () => {
  await withDjango({ site: OPEN, me: unauth }, async () => {
    const r = await portalGet(get("/portal/", `no_member=${TOKEN}; no_member_pre=${BINDING}`));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("cache-control"), "no-store");
    const page = await r.text();
    assert.match(page, /<h1>Track Your Orders<\/h1>/);
    assert.match(page, /name="action" value="request"/);
    assert.match(page, /This store is not taking orders\./);
    assert.match(page, /pack-focus\.css/);
    assert.doesNotMatch(page, /\/dashboard\//);
    assert.doesNotMatch(page, /<footer|footer-/);
    assert.doesNotMatch(page, /<script>/);
    assert.ok(setCookies(r).some((c) => c.startsWith("no_member=; ") && c.includes("Max-Age=0")));
    assert.ok(setCookies(r).some((c) => c.startsWith("no_member_pre=; ") && c.includes("Max-Age=0")));
  });
});

test("GET /portal/ signed in goes to the orders", async () => {
  await withDjango({ site: OPEN, me: ME }, async () => {
    const r = await portalGet(get("/portal/", `no_member=${TOKEN}`));
    assert.equal(r.status, 303);
    assert.equal(r.headers.get("location"), "/portal/orders/");
  });
});

test("GET /portal/ with a session of a member who is not a paid buyer (me 404) is neutral", async () => {
  await withDjango({ site: OPEN, me: missing }, async () => {
    const r = await portalGet(get("/portal/", `no_member=${TOKEN}`));
    assert.equal(r.status, 404);
  });
});

test("POST request goes to portal/signin/request with a new binding and the +63 number; the code step and its cookie come back", async () => {
  await withDjango({ site: OPEN, "signin/request": ANSWER }, async (seen) => {
    const r = await portalPost(post("/portal/", { action: "request", contact: "917 123 4567" }));
    assert.equal(r.status, 200);
    const sent = bodyOf(seen.find((s) => s.url.endsWith("portal/signin/request/"))!);
    assert.equal(sent.contact, "+639171234567");
    assert.equal(sent.host, API_HOST);
    assert.match(sent.binding, /^[A-Za-z0-9_-]{43}$/);
    const page = await r.text();
    assert.equal((page.match(/class="otp-box[ "]/g) ?? []).length, 6);
    assert.ok(!page.includes(sent.binding));
    assert.ok(setCookies(r).find((c) => c.startsWith("no_member_pre="))!.includes(`no_member_pre=${sent.binding}`));
  });
});

test("POST resend and email use their own portal routes", async () => {
  await withDjango({ site: OPEN, "signin/resend": ANSWER, "signin/accept-email": ANSWER }, async (seen) => {
    await portalPost(post("/portal/", { action: "resend" }, `no_member_pre=${BINDING}`));
    await portalPost(post("/portal/", { action: "email" }, `no_member_pre=${BINDING}`));
    assert.ok(seen.some((s) => s.url.endsWith("portal/signin/resend/")));
    assert.ok(seen.some((s) => s.url.endsWith("portal/signin/accept-email/")));
  });
});

test("POST verify: a good code sets the session cookie and goes to the orders; a wrong code shows Django's words", async () => {
  await withDjango({ site: OPEN, "signin/verify": json(200, { token: TOKEN }) }, async (seen) => {
    const r = await portalPost(post("/portal/", { action: "verify", code: "123456" }, `no_member_pre=${BINDING}`));
    assert.equal(r.status, 303);
    assert.equal(r.headers.get("location"), "/portal/orders/");
    const cookie = setCookies(r).find((c) => c.startsWith("no_member="))!;
    assert.ok(cookie.includes(`no_member=${TOKEN}`) && cookie.includes("HttpOnly") && cookie.includes("SameSite=Lax"));
    assert.deepEqual(bodyOf(seen.find((s) => s.url.endsWith("signin/verify/"))!).code, "123456");
  });
  await withDjango({ site: OPEN, "signin/verify": json(400, { error: { code: "wrong_code", message: "That code did not work. Please try again.", fields: { code: ["That code did not work. Please try again."] } } }) }, async () => {
    const r = await portalPost(post("/portal/", { action: "verify", code: "000000" }, `no_member_pre=${BINDING}`));
    assert.equal(r.status, 200);
    assert.match(await r.text(), /That code did not work/);
  });
});

test("POST from another site is refused, an unknown action is neutral", async () => {
  await withDjango({ site: OPEN }, async () => {
    const r = await portalPost(post("/portal/", { action: "request", contact: "a@x.test" }, "", { "sec-fetch-site": "cross-site" }));
    assert.equal(r.status, 403);
    assert.equal((await portalPost(post("/portal/", { action: "nope" }))).status, 404);
  });
});

/* ---- the orders: only the contract's fields ------------------------------------------------------------------------ */

const FORBIDDEN = {
  delivery_address: { line: "SECRET-STREET 9" }, receiver_mobile: "+639990001111", date_of_birth: "1990-01-01", email: "secret@buyer.test",
  desired_username: "secretuser", sante_member_id: "SM-99999", full_name: "Secret Fullname", billing_state: "suspended",
};

test("the orders page draws the contract's fields and no field the API adds", async () => {
  const dirty = { ...CARD, ...FORBIDDEN, registration: { ...CARD.registration, sante_member_id: "SM-99999" }, proofs: [{ ...CARD.proofs[0], file_key: "private/key/abc" }] };
  await withDjango({ site: OPEN, orders: json(200, { cards: [dirty], closes_at: "2026-12-30T15:00:00+08:00", banner: "This store stopped taking orders on November 1, 2026. You can view your order here until 3:00 PM Philippine time on December 30, 2026. After that this page closes.", billing_reason: "suspended" }) }, async (seen) => {
    const r = await ordersGet(get("/portal/orders/", `no_member=${TOKEN}`));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("cache-control"), "no-store");
    const page = await r.text();
    for (const want of [/SP-1001/, /Placed Oct 1, 2026/, /&#8369;1,488\.00/, /Bank or e-wallet transfer &middot; Verified/, /Order Placed/, /Payment Verified/, /Shipped/, /Delivered/,
      /Shipping via <strong>J&amp;T<\/strong>/, /Tracking# JT-0002B/, /Registered/, /Your Santé membership is active\./, /href="\/portal\/proof\/prf_1\/"/, /REF123/,
      /This store stopped taking orders on November 1, 2026\./, /After that this page closes\./, /action="\/portal\/sign-out\/"/]) {
      assert.match(page, want);
    }
    for (const never of [/SECRET-STREET/, /\+639990001111/, /1990-01-01/, /secret@buyer\.test/, /secretuser/, /SM-99999/, /Secret Fullname/, /suspended/, /private\/key/, /<script/, /\/dashboard\//, /<footer/, /\bform\b[^>]*action="\/portal\/(?!sign-out)/]) {
      assert.doesNotMatch(page, never);
    }
    const asked = bodyOf(seen.find((s) => s.url.endsWith("portal/orders/"))!);
    assert.deepEqual(asked, { host: API_HOST, token: TOKEN });
  });
});

test("the orders page is read-only: the only form is Logout, and no card has an input", async () => {
  await withDjango({ site: OPEN, orders: json(200, { cards: [CARD], closes_at: null, banner: "This store is not taking orders." }) }, async () => {
    const page = await (await ordersGet(get("/portal/orders/", `no_member=${TOKEN}`))).text();
    assert.equal((page.match(/<form/g) ?? []).length, 1);
    assert.doesNotMatch(page, /<input|<textarea|<select|type="file"/);
    assert.match(page, /This store is not taking orders\./);
  });
});

test("the orders page without a session goes to /portal/; a gone session clears the cookie; a refusal or a bad shape is neutral", async () => {
  await withDjango({ site: OPEN }, async () => {
    const r = await ordersGet(get("/portal/orders/"));
    assert.equal(r.status, 303);
    assert.equal(r.headers.get("location"), "/portal/");
  });
  await withDjango({ site: OPEN, orders: unauth }, async () => {
    const r = await ordersGet(get("/portal/orders/", `no_member=${TOKEN}`));
    assert.equal(r.status, 303);
    assert.equal(r.headers.get("location"), "/portal/");
    assert.ok(setCookies(r).some((c) => c.startsWith("no_member=; ") && c.includes("Max-Age=0")));
  });
  await withDjango({ site: OPEN, orders: missing }, async () => {
    assert.equal((await ordersGet(get("/portal/orders/", `no_member=${TOKEN}`))).status, 404);
  });
  await withDjango({ site: OPEN, orders: json(200, { cards: [{ id: 1 }], closes_at: null, banner: "" }) }, async () => {
    assert.equal((await ordersGet(get("/portal/orders/", `no_member=${TOKEN}`))).status, 404);
  });
});

test("the portal's own states render with an escaped store name and a safe accent colour", async () => {
  await withDjango({ site: json(200, { display_name: "<b>X</b>", accent_color: "red;}</style><script>", closes_at: null, banner: "<i>b</i>" }), me: unauth }, async () => {
    const page = await (await portalGet(get("/portal/"))).text();
    assert.doesNotMatch(page, /<b>X<\/b>|<script>|<i>b<\/i>/);
    assert.match(page, /&lt;b&gt;X&lt;\/b&gt;/);
  });
});

/* ---- proof ----------------------------------------------------------------------------------------------------- */

test("the proof is streamed from this host with private headers; a bad id, no session, a refusal or a wrong type is neutral", async () => {
  const png = new Uint8Array([137, 80, 78, 71]);
  await withDjango({ site: OPEN, proof: () => new Response(png, { status: 200, headers: { "content-type": "image/png" } }) }, async (seen) => {
    const r = await proofGet(get("/portal/proof/prf_1/", `no_member=${TOKEN}`), { params: Promise.resolve({ id: "prf_1" }) });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "image/png");
    assert.equal(r.headers.get("cache-control"), "private, no-store");
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    assert.deepEqual(new Uint8Array(await r.arrayBuffer()), png);
    assert.deepEqual(bodyOf(seen.find((s) => s.url.endsWith("portal/proof/"))!), { host: API_HOST, token: TOKEN, proof_id: "prf_1" });
  });
  const id = (v: string) => ({ params: Promise.resolve({ id: v }) });
  await withDjango({ site: OPEN, proof: () => new Response("x", { status: 200, headers: { "content-type": "text/html" } }) }, async () => {
    assert.equal((await proofGet(get("/portal/proof/prf_1/", `no_member=${TOKEN}`), id("prf_1"))).status, 404);
    assert.equal((await proofGet(get("/portal/proof/a b/", `no_member=${TOKEN}`), id("a b"))).status, 404);
    assert.equal((await proofGet(get("/portal/proof/prf_1/"), id("prf_1"))).status, 404);
  });
  await withDjango({ site: OPEN, proof: missing }, async () => {
    assert.equal((await proofGet(get("/portal/proof/prf_1/", `no_member=${TOKEN}`), id("prf_1"))).status, 404);
  });
});

/* ---- sign-out ----------------------------------------------------------------------------------------------------- */

test("POST sign-out ends the session at Django, clears the cookies and goes to /portal/; GET is neutral", async () => {
  await withDjango({ site: OPEN, signout: json(200, { status: "signed_out" }) }, async (seen) => {
    const r = await signOutPost(post("/portal/sign-out/", {}, `no_member=${TOKEN}; no_member_pre=${BINDING}`));
    assert.equal(r.status, 303);
    assert.equal(r.headers.get("location"), "/portal/");
    assert.ok(setCookies(r).some((c) => c.startsWith("no_member=; ") && c.includes("Max-Age=0")));
    assert.deepEqual(bodyOf(seen.find((s) => s.url.endsWith("portal/signout/"))!), { host: API_HOST, token: TOKEN });
    assert.equal(signOutGet().status, 404);
    assert.equal(ordersPost().status, 404);
  });
});
