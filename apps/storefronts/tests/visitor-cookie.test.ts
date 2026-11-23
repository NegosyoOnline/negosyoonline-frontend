/* The consent-gated visitor cookie (ClickUp z8uq9mg7h3): set by the visit route after Accept, cleared on every Meta page
   response that is not Accept, and sent with the Meta page events only with consent and a well-shaped value. */
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { POST as visitPost } from "../src/app/funnel/membership-pack/visit/route.ts";
import { CONSENT_MAX_AGE, metaPage, visitorRef } from "../src/lib/meta.ts";
import { SITE } from "./site.ts";

const secret = randomBytes(24).toString("hex"); // throwaway, made for this run only
const env = { apiBase: "http://api.test", secret };
const PIXEL_SITE = { ...SITE, meta_pixel_id: "123456789012345" };
const REF = "AbCdEf0123456789_-xyzQ"; // 22 chars, the shape token_urlsafe(16) makes
const ACCEPT = "__Host-no_meta_consent=1";
const DECLINE = "__Host-no_meta_consent=0";
const VID = `__Host-no_vid=${REF}`;
const HTTPS = "https://www.santetest.com/";

function req(cookie = "", url = HTTPS): Request {
  return new Request(url, { headers: cookie ? { cookie } : {} });
}

function visit(body: unknown, cookie: string, https = true): Request {
  const headers: Record<string, string> = { host: "www.santetest.com", "content-type": "application/json", "sec-fetch-site": "same-origin" };
  if (cookie) headers.cookie = cookie;
  if (https) headers["x-forwarded-proto"] = "https";
  return new Request("http://www.santetest.com/funnel/membership-pack/visit/", { method: "POST", body: JSON.stringify(body), headers });
}

async function withDjango(run: () => Promise<void>): Promise<void> {
  const names = ["STOREFRONT_API_BASE", "STOREFRONT_SERVER_SECRET", "STOREFRONT_HOST_ALIASES", "VERCEL"];
  const before = { fetch: globalThis.fetch, error: console.error, env: names.map((name) => process.env[name]) };
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/storefront/v1/site/")) return Response.json(SITE);
    if (url.endsWith("/visit/")) return Response.json({ ref: REF });
    return Response.json({ ok: true });
  }) as typeof fetch;
  console.error = () => {};
  Object.assign(process.env, { STOREFRONT_API_BASE: "http://api.test", STOREFRONT_SERVER_SECRET: secret,
    STOREFRONT_HOST_ALIASES: "www.santetest.com=demo.negosyotest.com", VERCEL: "" });
  try {
    await run();
  } finally {
    globalThis.fetch = before.fetch;
    console.error = before.error;
    names.forEach((name, i) => {
      if (before.env[i] === undefined) delete process.env[name];
      else process.env[name] = before.env[i];
    });
  }
}

/* ---- set ---- */

test("begin, event and contact set no_vid after Accept: HttpOnly, Lax, Path=/, 180 days, Secure and __Host- on https", async () => {
  await withDjango(async () => {
    const answers = [
      await visitPost(visit({ op: "begin", ref: "" }, ACCEPT)),
      await visitPost(visit({ op: "event", ref: REF, event: "start" }, ACCEPT)),
      await visitPost(visit({ op: "contact", ref: REF, full_name: "Ana", mobile: "9171234567", email: "a@b.test" }, ACCEPT)),
    ];
    for (const answer of answers) {
      assert.equal(answer.status, 200);
      const cookie = answer.headers.get("set-cookie") ?? "";
      assert.ok(cookie.startsWith(`__Host-no_vid=${REF};`), cookie);
      for (const part of ["Path=/", `Max-Age=${CONSENT_MAX_AGE}`, "HttpOnly", "SameSite=Lax", "Secure"]) assert.ok(cookie.includes(part), `${part} in ${cookie}`);
      assert.ok(!cookie.includes("Domain"));
    }
    assert.equal(CONSENT_MAX_AGE, 15552000);
  });
});

test("over plain http the cookie has the plain name and no Secure flag", async () => {
  await withDjango(async () => {
    const cookie = (await visitPost(visit({ op: "begin", ref: "" }, "no_meta_consent=1", false))).headers.get("set-cookie") ?? "";
    assert.ok(cookie.startsWith(`no_vid=${REF};`) && cookie.includes("HttpOnly") && !cookie.includes("Secure"), cookie);
  });
});

test("no cookie without Accept: not before an answer, not after Decline, not for an odd consent value", async () => {
  await withDjango(async () => {
    for (const cookie of ["", DECLINE, "__Host-no_meta_consent=2"]) {
      const answer = await visitPost(visit({ op: "begin", ref: "" }, cookie));
      assert.equal(answer.status, 200);
      assert.equal(answer.headers.get("set-cookie"), null, cookie);
    }
  });
});

test("an ill-shaped ref is never set", async () => {
  await withDjango(async () => {
    for (const ref of ["short", "x".repeat(33), "has space 1234567890ab", "semi;colon12345678901"]) {
      const answer = await visitPost(visit({ op: "event", ref, event: "start" }, ACCEPT));
      assert.equal(answer.headers.get("set-cookie"), null, ref);
    }
  });
});

/* ---- clear ---- */

test("a Meta page clears no_vid after Decline, with no answer, and when the settings are reopened; not while accepted", () => {
  const args = (request: Request) => ({ request, site: PIXEL_SITE, host: "demo.negosyotest.com", env, events: ["PageView" as const] });
  for (const cookie of [`${DECLINE}; ${VID}`, VID, `${ACCEPT}; ${VID}`]) {
    const reopen = cookie.startsWith(ACCEPT);
    const request = req(cookie, reopen ? `${HTTPS}?cookie-settings=1` : HTTPS);
    const set = metaPage(args(request)).finish(new Response("")).headers.get("set-cookie") ?? "";
    assert.ok(set.startsWith("__Host-no_vid=;") && set.includes("Max-Age=0") && set.includes("HttpOnly") && set.includes("Secure"), `${cookie} -> ${set}`);
  }
  const kept = metaPage(args(req(`${ACCEPT}; ${VID}`))).finish(new Response("")).headers.getSetCookie();
  assert.ok(kept.every((c) => c.startsWith("_fbp=")), "accepted: no_vid kept (only Meta's _fbp is set, META-DEDUP F1)");
  assert.equal(metaPage(args(req(`${ACCEPT}; ${VID}; _fbp=fb.1.1700000000000.1234567890`))).finish(new Response("")).headers.get("set-cookie"), null, "accepted: kept");
  assert.equal(metaPage(args(req(DECLINE))).finish(new Response("")).headers.get("set-cookie"), null, "nothing to clear: no header");
  const noPixel = metaPage({ ...args(req(`${DECLINE}; ${VID}`)), site: SITE });
  assert.ok((noPixel.finish(new Response("")).headers.get("set-cookie") ?? "").includes("Max-Age=0"), "a site with no Pixel clears it too");
});

/* ---- send ---- */

async function sentBody(cookie: string, url = HTTPS): Promise<Record<string, unknown>> {
  let body: Record<string, unknown> = {};
  const fetchImpl = (_u: string, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    return Promise.resolve(Response.json({}));
  };
  const m = metaPage({ request: req(cookie, url), site: PIXEL_SITE, host: "demo.negosyotest.com", env, events: ["PageView"], fetchImpl });
  assert.ok(m.send);
  await m.send();
  return body;
}

test("the page events carry visitor_ref only with Accept and a well-shaped cookie", async () => {
  assert.equal((await sentBody(`${ACCEPT}; ${VID}`)).visitor_ref, REF);
  assert.ok(!("visitor_ref" in (await sentBody(ACCEPT))), "no cookie");
  for (const bad of ["short", "x".repeat(33), "bad%20value1234567890"]) {
    assert.ok(!("visitor_ref" in (await sentBody(`${ACCEPT}; __Host-no_vid=${bad}`))), bad);
  }
  assert.ok(!("visitor_ref" in (await sentBody(`${ACCEPT}; ${VID}; ${VID}`))), "a name that arrives twice is refused");
  assert.ok(!("visitor_ref" in (await sentBody(`${ACCEPT}; no_vid=${REF}`))), "the plain name is not read on https");
});

test("without Accept the ref is never read, whatever the cookie", () => {
  for (const cookie of [VID, `${DECLINE}; ${VID}`]) {
    assert.equal(visitorRef(req(cookie)), "");
    assert.equal(metaPage({ request: req(cookie), site: PIXEL_SITE, host: "h", env, events: ["PageView"] }).send, null);
  }
  assert.equal(visitorRef(req(`${ACCEPT}; ${VID}`)), REF);
});
