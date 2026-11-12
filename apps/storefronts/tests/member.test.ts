import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  memberMe, memberSignInRequest, memberSignInResend, memberSignInAcceptEmail, memberSignInVerify, memberSignOut,
} from "../src/lib/django.ts";
import { GET as signInGet, POST as signInPost } from "../src/app/dashboard/sign-in/route.ts";
import { contactOf } from "../src/lib/member.ts";
import { GET as homeGet } from "../src/app/dashboard/route.ts";
import { POST as signOutPost, GET as signOutGet } from "../src/app/dashboard/sign-out/route.ts";
import { assetVersions } from "../src/lib/assets.ts";
import { chrome, homeDocument, nextKey, nextTarget, signInDocument, signInModel, SECTIONS, TEXT_ME_ENABLED } from "../src/views/sante/member.ts";
import { FILLED, SITE } from "./site.ts";

const secret = randomBytes(24).toString("hex"); // throwaway, made for this run only
const env = { apiBase: "http://api.test", secret };
const TOKEN = "T".repeat(43);
const BINDING = "B".repeat(43);
const MEMBER = { id: "mem_1", full_name: "Ana Reyes", email: "a@x.test", mobile: "+639171234567", email_verified: true, mobile_verified: true };

type Call = { url: string; init: RequestInit };
function fake(answer: () => Response) {
  const calls: Call[] = [];
  const logs: string[] = [];
  return { calls, logs, fetchImpl: (url: string, init: RequestInit) => { calls.push({ url, init }); return Promise.resolve(answer()); }, log: (r: string) => logs.push(r) };
}
const json = (status: number, body: unknown) => () => Response.json(body, { status });
const args = { host: "demo-store.negosyotest.com", visitor_ip: "", binding: BINDING };

/* --- the calls to Django ---------------------------------------------------------------------- */

test("each member call is one POST to its own route, with the credential and the data as JSON", async () => {
  const cases: [string, (f: ReturnType<typeof fake>) => Promise<unknown>, unknown][] = [
    ["signin/request", (f) => memberSignInRequest({ ...args, contact: "+639171234567" }, { env, fetchImpl: f.fetchImpl, log: f.log }), { step: "code", message: "m", offer_email: false }],
    ["signin/resend", (f) => memberSignInResend(args, { env, fetchImpl: f.fetchImpl, log: f.log }), { step: "code", message: "m", offer_email: false }],
    ["signin/accept-email", (f) => memberSignInAcceptEmail(args, { env, fetchImpl: f.fetchImpl, log: f.log }), { step: "code", message: "m", offer_email: false }],
    ["signin/verify", (f) => memberSignInVerify({ ...args, code: "123456" }, { env, fetchImpl: f.fetchImpl, log: f.log }), { token: TOKEN, member: MEMBER }],
    ["me", (f) => memberMe({ host: args.host, token: TOKEN }, { env, fetchImpl: f.fetchImpl, log: f.log }), { member: MEMBER }],
    ["signout", (f) => memberSignOut({ host: args.host, token: TOKEN }, { env, fetchImpl: f.fetchImpl, log: f.log }), { status: "signed_out" }],
  ];
  for (const [route, run, body] of cases) {
    const f = fake(json(200, body));
    const result = await run(f) as { state: string };
    assert.equal(result.state, "ok", route);
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].url, `http://api.test/storefront/v1/member/${route}/`);
    const init = f.calls[0].init;
    assert.equal(init.method, "POST");
    assert.equal((init.headers as Record<string, string>).Authorization, `Bearer ${secret}`);
    assert.equal(init.cache, "no-store");
    assert.equal(init.redirect, "error");
    assert.deepEqual(f.logs, []);
  }
});

test("verify hands back the token once, and the member", async () => {
  const f = fake(json(200, { token: TOKEN, member: MEMBER }));
  const r = await memberSignInVerify({ ...args, code: "123456" }, { env, fetchImpl: f.fetchImpl, log: f.log });
  assert.deepEqual(r, { state: "ok", token: TOKEN, member: MEMBER });
});

test("a refusal keeps Django's code, message and the first message of each field", async () => {
  const f = fake(json(400, { error: { code: "wrong_code", message: "That code did not work. Please try again.", fields: { code: ["That code did not work. Please try again."] } } }));
  const r = await memberSignInVerify({ ...args, code: "000000" }, { env, fetchImpl: f.fetchImpl, log: f.log });
  assert.deepEqual(r, { state: "refused", status: 400, code: "wrong_code", message: "That code did not work. Please try again.", fields: { code: "That code did not work. Please try again." } });
  assert.equal((await memberMe({ host: "h", token: "" }, { env, fetchImpl: fake(json(401, { error: { code: "member_session_invalid", message: "Not signed in." } })).fetchImpl })).state, "refused");
});

test("404 is unavailable; a bad shape, a 500, a missing secret and a network error all fail closed and say why", async () => {
  assert.deepEqual(await memberMe({ host: "h", token: TOKEN }, { env, fetchImpl: fake(json(404, { error: {} })).fetchImpl }), { state: "unavailable" });
  const shapes: [() => Response, string][] = [
    [json(200, { member: { id: 1 } }), "the API answer had the wrong shape"],
    [json(500, { error: {} }), "the API answered 500"],
    [() => new Response("<html>", { status: 200 }), "the API answered 200 without JSON"],
  ];
  for (const [answer, reason] of shapes) {
    const f = fake(answer);
    assert.deepEqual(await memberMe({ host: "h", token: TOKEN }, { env, fetchImpl: f.fetchImpl, log: f.log }), { state: "failed" });
    assert.deepEqual(f.logs, [reason]);
  }
  const f = fake(json(200, {}));
  assert.deepEqual(await memberMe({ host: "h", token: TOKEN }, { env: { apiBase: "x", secret: "short" }, fetchImpl: f.fetchImpl, log: f.log }), { state: "failed" });
  assert.equal(f.calls.length, 0);
  const lost = { fetchImpl: () => Promise.reject(new Error("down")), log: (r: string) => f.logs.push(r) };
  assert.deepEqual(await memberMe({ host: "h", token: TOKEN }, { env, ...lost }), { state: "failed" });
  assert.ok(f.logs.some((l) => l === "the API could not be reached"));
  assert.ok(f.logs.every((l) => !l.includes(secret) && !l.includes(TOKEN)));
});

/* --- the routes ------------------------------------------------------------------------------- */

type Route = { member: () => Response; signin: (body: URLSearchParams) => Response };
async function withDjango(
  routes: Record<string, () => Response>,
  run: (seen: Call[]) => Promise<void>,
): Promise<void> {
  const seen: Call[] = [];
  const names = ["STOREFRONT_API_BASE", "STOREFRONT_SERVER_SECRET", "STOREFRONT_HOST_ALIASES", "VERCEL"];
  const before = { fetch: globalThis.fetch, error: console.error, env: names.map((n) => process.env[n]) };
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    seen.push({ url, init: init ?? {} });
    if (url.startsWith("http://api.test/storefront/v1/site/")) return Response.json(FILLED);
    const route = url.replace("http://api.test/storefront/v1/member/", "").replace(/\/$/, "");
    return (routes[route] ?? json(404, { error: {} }))();
  }) as typeof fetch;
  console.error = () => {};
  Object.assign(process.env, { STOREFRONT_API_BASE: "http://api.test", STOREFRONT_SERVER_SECRET: secret, STOREFRONT_HOST_ALIASES: "www.santetest.com=demo-store.negosyotest.com", VERCEL: "" });
  try { await run(seen); } finally {
    globalThis.fetch = before.fetch;
    console.error = before.error;
    names.forEach((n, i) => { if (before.env[i] === undefined) delete process.env[n]; else process.env[n] = before.env[i]; });
  }
}
void (null as unknown as Route);

const HOST = "www.santetest.com:3062";
const get = (p: string, cookie = "") => new Request(`http://${HOST}${p}`, { headers: { host: HOST, ...(cookie ? { cookie } : {}) } });
function post(p: string, fields: Record<string, string>, extra: Record<string, string> = {}, cookie = ""): Request {
  return new Request(`http://${HOST}${p}`, { method: "POST", body: new URLSearchParams(fields).toString(),
    headers: { host: HOST, "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": "same-origin", ...(cookie ? { cookie } : {}), ...extra } });
}
const answer = { step: "code", message: "If this matches a member of this store, we sent a code.", offer_email: false };
const unauth = json(401, { error: { code: "member_session_invalid", message: "Not signed in." } });
const setCookies = (r: Response) => r.headers.getSetCookie();

test("GET sign-in: a signed-out visitor gets the number box, no-store, no script of its own, and any old binding is cleared", async () => {
  await withDjango({ me: unauth }, async (seen) => {
    const r = await signInGet(get("/dashboard/sign-in/", `no_member_pre=${BINDING}`));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("cache-control"), "no-store");
    const page = await r.text();
    assert.match(page, /<h1>Member Login<\/h1>/);
    assert.match(page, /For Sant&eacute; members only\./);
    assert.match(page, /name="action" value="request"/);
    assert.ok(setCookies(r).some((c) => c.startsWith("no_member_pre=; ") && c.includes("Max-Age=0")));
    assert.equal(seen.filter((s) => s.url.endsWith("/me/")).length, 1);
  });
});

test("GET sign-in?next=orders: Track Your Orders wording", async () => {
  await withDjango({ me: unauth }, async () => {
    const page = await (await signInGet(get("/dashboard/sign-in/?next=orders"))).text();
    assert.match(page, /<h1>Track Your Orders<\/h1>/);
    assert.match(page, /name="next" value="orders"/);
    assert.match(page, /<title>Track Your Orders \| Nena&#x27;s Wellness &amp; Barley<\/title>/);
  });
});

test("GET sign-in: a signed-in member goes to the dashboard; members switched off is the neutral 404", async () => {
  await withDjango({ me: json(200, { member: MEMBER }) }, async () => {
    const r = await signInGet(get("/dashboard/sign-in/", `no_member=${TOKEN}`));
    assert.equal(r.status, 303);
    assert.equal(r.headers.get("location"), "/dashboard/");
  });
  await withDjango({}, async () => {
    const r = await signInGet(get("/dashboard/sign-in/"));
    assert.equal(r.status, 404);
    assert.doesNotMatch(await r.text(), /Member Login/);
  });
});

test("POST request: +63 number goes to Django with a new binding; the code step and its cookie come back", async () => {
  await withDjango({ "signin/request": json(200, answer) }, async (seen) => {
    const r = await signInPost(post("/dashboard/sign-in/", { action: "request", contact: "917 123 4567" }));
    assert.equal(r.status, 200);
    const body = JSON.parse(seen.find((s) => s.url.endsWith("signin/request/"))!.init.body as string);
    assert.equal(body.contact, "+639171234567");
    assert.equal(body.host, "demo-store.negosyotest.com");
    assert.match(body.binding, /^[A-Za-z0-9_-]{43}$/);
    const page = await r.text();
    assert.match(page, /<h1>Enter your OTP<\/h1>/);
    assert.match(page, /If this matches a member of this store, we sent a code\./);
    assert.equal((page.match(/class="otp-box[ "]/g) ?? []).length, 6);
    const cookie = setCookies(r).find((c) => c.startsWith("no_member_pre="))!;
    assert.ok(cookie.includes(`no_member_pre=${body.binding}`));
    assert.ok(cookie.includes("Max-Age=600") && cookie.includes("HttpOnly") && cookie.includes("SameSite=Lax"));
    assert.ok(!page.includes(body.binding), "the binding never reaches the page");
  });
});

test("POST request: a number Django refuses shows its message under the field, and keeps the number step", async () => {
  const refused = json(400, { error: { code: "invalid_request", message: "x", fields: { contact: ["Enter a valid Philippine mobile number."] } } });
  await withDjango({ "signin/request": refused }, async () => {
    const r = await signInPost(post("/dashboard/sign-in/", { action: "request", contact: "123" }));
    assert.equal(r.status, 200);
    const page = await r.text();
    assert.match(page, /<h1>Member Login<\/h1>/);
    assert.match(page, /<p class="err" id="contact-msg">Enter a valid Philippine mobile number\.<\/p>/);
  });
});

test("POST request: too many attempts answers 429 with Django's words", async () => {
  await withDjango({ "signin/request": json(429, { error: { code: "rate_limited", message: "Too many attempts. Please wait and try again." } }) }, async () => {
    const r = await signInPost(post("/dashboard/sign-in/", { action: "request", contact: "917 123 4567" }));
    assert.equal(r.status, 429);
    assert.match(await r.text(), /<div class="note bad" role="alert">Too many attempts\. Please wait and try again\.<\/div>/);
  });
});

test("POST verify: a good code sets the session cookie (30 days), clears the binding, and goes to the dashboard", async () => {
  await withDjango({ "signin/verify": json(200, { token: TOKEN, member: MEMBER }) }, async (seen) => {
    const r = await signInPost(post("/dashboard/sign-in/", { action: "verify", code: "123456" }, {}, `no_member_pre=${BINDING}`));
    assert.equal(r.status, 303);
    assert.equal(r.headers.get("location"), "/dashboard/");
    const cookies = setCookies(r);
    assert.ok(cookies.includes(`no_member=${TOKEN}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax`));
    assert.ok(cookies.some((c) => c.startsWith("no_member_pre=;")));
    const body = JSON.parse(seen.find((s) => s.url.endsWith("signin/verify/"))!.init.body as string);
    assert.deepEqual(body, { host: "demo-store.negosyotest.com", visitor_ip: "", binding: BINDING, code: "123456" });
  });
});

test("POST verify with next=orders: lands on My Orders", async () => {
  await withDjango({ "signin/verify": json(200, { token: TOKEN, member: MEMBER }) }, async () => {
    const r = await signInPost(post("/dashboard/sign-in/", { action: "verify", code: "123456", next: "orders" }, {}, `no_member_pre=${BINDING}`));
    assert.equal(r.headers.get("location"), "/dashboard/orders/");
  });
});

test("POST verify: a wrong code shows the error under the boxes; an expired one offers a new code", async () => {
  const wrong = json(400, { error: { code: "wrong_code", message: "That code did not work. Please try again.", fields: { code: ["That code did not work. Please try again."] } } });
  await withDjango({ "signin/verify": wrong }, async () => {
    const page = await (await signInPost(post("/dashboard/sign-in/", { action: "verify", code: "1" }, {}, `no_member_pre=${BINDING}`))).text();
    assert.match(page, /<p class="pp-mb-error" role="alert">That code did not work\. Please try again\.<\/p>/);
    assert.match(page, /otp-box is-invalid/);
  });
  const expired = json(400, { error: { code: "code_expired", message: "This code has expired. Request a new one.", fields: { code: ["This code has expired. Request a new one."] } } });
  await withDjango({ "signin/verify": expired }, async () => {
    const page = await (await signInPost(post("/dashboard/sign-in/", { action: "verify", code: "1" }, {}, `no_member_pre=${BINDING}`))).text();
    assert.match(page, /This code is no longer valid\. Ask for a new code\./);
    assert.match(page, /name="action" value="resend">Send a new code</);
  });
});

test("POST verify without a binding cookie is an expired code, and Django is not asked", async () => {
  await withDjango({}, async (seen) => {
    const page = await (await signInPost(post("/dashboard/sign-in/", { action: "verify", code: "123456" }))).text();
    assert.match(page, /This code is no longer valid\./);
    assert.equal(seen.filter((s) => s.url.includes("/member/")).length, 0);
  });
});

test("POST email and resend go to their own routes with the binding from the cookie", async () => {
  await withDjango({ "signin/accept-email": json(200, answer), "signin/resend": json(200, answer) }, async (seen) => {
    const e = await signInPost(post("/dashboard/sign-in/", { action: "email" }, {}, `no_member_pre=${BINDING}`));
    const page = await e.text();
    assert.match(page, /Email me the code<b data-pp-count-label> \(60s\)<\/b>/);
    assert.match(page, /disabled data-pp-count="60"/);
    await signInPost(post("/dashboard/sign-in/", { action: "resend" }, {}, `no_member_pre=${BINDING}`));
    const bodies = seen.filter((s) => s.url.includes("/member/")).map((s) => JSON.parse(s.init.body as string).binding);
    assert.deepEqual(bodies, [BINDING, BINDING]);
  });
});

test("POST restart goes back to the number box and clears the binding", async () => {
  await withDjango({}, async () => {
    const r = await signInPost(post("/dashboard/sign-in/", { action: "restart" }, {}, `no_member_pre=${BINDING}`));
    assert.match(await r.text(), /<h1>Member Login<\/h1>/);
    assert.ok(setCookies(r).some((c) => c.startsWith("no_member_pre=;")));
  });
});

test("POST from another site, or with no origin signal, is refused before anything is read", async () => {
  await withDjango({}, async (seen) => {
    for (const headers of [{ "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "", origin: "http://evil.test" }] as Record<string, string>[]) {
      const req = post("/dashboard/sign-in/", { action: "request", contact: "917 123 4567" }, headers);
      if (!headers["sec-fetch-site"]) req.headers.delete("sec-fetch-site");
      assert.equal((await signInPost(req)).status, 403);
    }
    const bare = post("/dashboard/sign-in/", { action: "request" });
    bare.headers.delete("sec-fetch-site");
    assert.equal((await signInPost(bare)).status, 403);
    assert.equal(seen.filter((s) => s.url.includes("/member/")).length, 0);
  });
});

test("the text action is a 404 while the Text me button is off", async () => {
  assert.equal(TEXT_ME_ENABLED, false);
  await withDjango({}, async () => {
    assert.equal((await signInPost(post("/dashboard/sign-in/", { action: "text" }, {}, `no_member_pre=${BINDING}`))).status, 404);
    assert.equal((await signInPost(post("/dashboard/sign-in/", { action: "nope" }))).status, 404);
  });
});

test("an unknown host gets the neutral 404 on every member route", async () => {
  await withDjango({}, async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => Response.json({ error: {} }, { status: 404 })) as typeof fetch;
    try {
      assert.equal((await signInGet(get("/dashboard/sign-in/"))).status, 404);
      assert.equal((await homeGet(get("/dashboard/"))).status, 404);
      assert.equal((await signOutPost(post("/dashboard/sign-out/", {}))).status, 404);
    } finally { globalThis.fetch = orig; }
  });
});

test("dashboard home: signed in shows the hero with the member's name; no cookie and a dead session go to the store home", async () => {
  await withDjango({ me: json(200, { member: MEMBER }), pack: json(200, { pack: null, registration: null }) }, async () => {
    const r = await homeGet(get("/dashboard/", `no_member=${TOKEN}`));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("cache-control"), "no-store");
    const page = await r.text();
    assert.match(page, /<h1>Dashboard<\/h1>/);
    assert.match(page, /Signed in as <strong>Ana Reyes<\/strong>/);
    assert.match(page, /<form method="post" action="\/dashboard\/sign-out\/" class="pdn-out">/);
    assert.match(page, /href="\/dashboard\/orders\/"/);
    assert.doesNotMatch(page, /Commission|acct-kpi/);
  });
  await withDjango({ me: unauth }, async (seen) => {
    const none = await homeGet(get("/dashboard/"));
    assert.equal(none.status, 303);
    assert.equal(none.headers.get("location"), "/");
    assert.equal(seen.filter((s) => s.url.includes("/member/")).length, 0);
    const dead = await homeGet(get("/dashboard/", `no_member=${TOKEN}`));
    assert.equal(dead.headers.get("location"), "/");
    assert.ok(setCookies(dead).some((c) => c.startsWith("no_member=;")));
  });
});

test("sign-out: POST only; Django is told, both cookies go, and the visitor lands on the store home", async () => {
  await withDjango({ signout: json(200, { status: "signed_out" }) }, async (seen) => {
    const r = await signOutPost(post("/dashboard/sign-out/", {}, {}, `no_member=${TOKEN}; no_member_pre=${BINDING}`));
    assert.equal(r.status, 303);
    assert.equal(r.headers.get("location"), "/");
    const cookies = setCookies(r);
    assert.ok(cookies.some((c) => c.startsWith("no_member=;")) && cookies.some((c) => c.startsWith("no_member_pre=;")));
    assert.equal(JSON.parse(seen.find((s) => s.url.endsWith("signout/"))!.init.body as string).token, TOKEN);
    assert.equal((await signOutGet()).status, 404);
    const forged = post("/dashboard/sign-out/", {}, { "sec-fetch-site": "cross-site" }, `no_member=${TOKEN}`);
    assert.equal((await signOutPost(forged)).status, 403);
  });
});

/* --- the pages -------------------------------------------------------------------------------- */

test("no member page carries an inline script, and every script and style it names is a listed asset", () => {
  const v = chrome(FILLED);
  const pages = [
    signInDocument(v, signInModel()).value,
    signInDocument(v, signInModel({ step: "code", message: "m", sms_in: 60 })).value,
    homeDocument(v, "Ana Reyes").value,
  ];
  const listed = new Set(Object.keys(assetVersions()));
  for (const page of pages) {
    for (const m of page.matchAll(/<script\b([^>]*)>/g)) assert.match(m[1], /\bsrc="\/assets\/sante\/js\/[^"]+\?v=[0-9a-f]{8}"/);
    assert.doesNotMatch(page, /<script(?![^>]*\bsrc=)[^>]*>/, "a script without a file");
    assert.doesNotMatch(page, /\son[a-z]+=/i, "an inline handler");
    for (const m of page.matchAll(/\/assets\/sante\/([^"?]+)\?v=/g)) assert.ok(listed.has(m[1]), m[1]);
  }
});

test("the shell links the TWCinc stylesheets and scripts by their approved files", () => {
  const signedOut = signInDocument(chrome(SITE), signInModel()).value;
  for (const f of ["css/pack-landing.min.css", "css/pack-footer.min.css", "css/pack-registration.css", "css/pack-dashboard-shell.css", "css/pack-dashboard.css", "css/pack-focus.css",
    "js/pack-phone.js", "js/pack-otp.js", "js/pack-busy.js", "js/pack-code-timer.js", "js/pack-nav-toggle.js"]) {
    assert.ok(signedOut.includes(`/assets/sante/${f}?v=`), f);
  }
  assert.doesNotMatch(signedOut, /pack-basket/);
});

test("the sign-in page keeps TWCinc's wording and its hooks", () => {
  const v = chrome(SITE);
  const code = signInDocument(v, signInModel({ step: "code", message: "If this matches a member of this store, we sent a code." })).value;
  for (const text of ["Enter your OTP", "Didn&rsquo;t receive the OTP?", "Email me the code", "&larr; Use a different number", "Log in to My Account",
    'data-pp-otp', 'autocomplete="one-time-code"', 'aria-label="Digit 6 of 6"']) assert.ok(code.includes(text), text);
  assert.doesNotMatch(code, /Text me the code/);
  const offer = signInDocument(v, signInModel({ step: "code", offer_email: true })).value;
  assert.match(offer, /Text messages are unavailable right now\. We can email your code instead\./);
  assert.match(offer, />Email me a code</);
  const paused = signInDocument(v, signInModel({ error_code: "sms_paused", error_message: "Please try again shortly.", hint: "If you have verified your email, you can sign in with it instead." })).value;
  assert.match(paused, /<b>Please try again shortly\.<\/b><br>If you have verified your email/);
  const contact = signInDocument(v, signInModel()).value;
  for (const text of ["Mobile Number", "+63", "9XX XXX XXXX", "Send Verification Code", "data-pp-phone"]) assert.ok(contact.includes(text), text);
});

test("the menu shows only the built sections, and the footer follows TWCinc's pack footer", () => {
  assert.deepEqual(SECTIONS.filter((s) => s.built).map((s) => s.label), ["Dashboard", "My Orders", "Account"]);
  assert.equal(nextKey("orders"), "orders");
  assert.equal(nextKey("javascript:x"), "");
  assert.equal(nextKey("__proto__"), "");
  assert.equal(nextTarget("orders"), "/dashboard/orders/");
  const page = homeDocument(chrome({ ...FILLED, business: { ...FILLED.business, contact_mobile: "+639171234567" } }), "Ana").value;
  assert.match(page, /<footer class="footer">/);
  assert.match(page, /Registered business<\/span>Nena Santos Trading/);
  assert.match(page, /href="mailto:hello@demo-store\.example\.test"/);
  assert.match(page, /\+63 917 123 4567<\/a>/);
  assert.match(page, /Products are for general wellness support only\./);
});

test("the number typed is read as pack-phone.js reads it", () => {
  assert.equal(contactOf("917 123 4567"), "+639171234567");
  assert.equal(contactOf("0917 123 4567"), "+639171234567");
  assert.equal(contactOf("+63 917 123 4567"), "+639171234567");
  assert.equal(contactOf("639171234567"), "+639171234567");
  assert.equal(contactOf(""), "");
  assert.equal(contactOf("ana@example.test"), "ana@example.test");
});

test("the copied TWCinc files are byte for byte the originals", () => {
  const twc = "/Users/edgeronilla/Dev/twcinc/app/negosyoonline_sante_pack/static/sante_pack";
  const here = path.join(import.meta.dirname, "..", "public", "assets", "sante");
  for (const f of Object.keys(assetVersions()).filter((n) => /pack-(landing|footer|registration|dashboard|phone|otp|busy|code-timer)/.test(n))) {
    let original: Buffer;
    try { original = readFileSync(path.join(twc, f)); } catch { continue; } // the TWCinc checkout is on Coach Ed's machine only
    assert.ok(readFileSync(path.join(here, f)).equals(original), f);
  }
});

test("the focus rule: light blue on inputs, never gold, no ring on headings, loaded after the TWCinc sheets", () => {
  const css = readFileSync(path.join(import.meta.dirname, "..", "public", "assets", "sante", "css", "pack-focus.css"), "utf8");
  assert.match(css, /border-color: #6C8CFF; box-shadow: 0 0 0 1px #6C8CFF/);
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ""), /gold|#(?:d4af37|c9a|ffd7|f5b|e6b)/i);
  const page = signInDocument(chrome(SITE), signInModel()).value;
  assert.ok(page.indexOf("pack-focus.css") > page.indexOf("pack-dashboard.css"));
});

test("isSignedIn: true only for a live session; a missing cookie, a 401 and a failure read as signed out", async () => {
  const { isSignedIn } = await import("../src/lib/member.ts");
  const env = { apiBase: "http://api.test", secret: "s".repeat(40) } as never;
  const req = (cookie?: string) => new Request("http://www.santetest.com/", { headers: cookie ? { cookie, host: "www.santetest.com" } : { host: "www.santetest.com" } });
  const member = { id: "m1", full_name: "Ben", email: "", mobile: "", email_verified: true, mobile_verified: true };
  const ok = (async () => new Response(JSON.stringify({ member }), { status: 200, headers: { "content-type": "application/json" } })) as never;
  const denied = (async () => new Response(JSON.stringify({ detail: "no" }), { status: 401, headers: { "content-type": "application/json" } })) as never;
  const boom = (async () => { throw new Error("down"); }) as never;
  assert.equal(await isSignedIn(req(), { env, fetchImpl: ok }), false);
  assert.equal(await isSignedIn(req("no_member=tokentokentokentoken"), { env, fetchImpl: ok }), true);
  assert.equal(await isSignedIn(req("no_member=tokentokentokentoken"), { env, fetchImpl: denied }), false);
  assert.equal(await isSignedIn(req("no_member=tokentokentokentoken"), { env, fetchImpl: boom }), false);
});
