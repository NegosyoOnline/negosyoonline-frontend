import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { fetchSite } from "../src/lib/django.ts";
import { storefrontEnv } from "../src/lib/env.ts";
import { SITE } from "./site.ts";

const secret = randomBytes(24).toString("hex"); // throwaway, made for this run only
const env = { apiBase: "http://api.test", secret };

type Call = { url: string; init: RequestInit };

function fake(answer: () => Response | Promise<Response>) {
  const calls: Call[] = [];
  const logs: string[] = [];
  const fetchImpl = (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve().then(answer);
  };
  return { calls, logs, fetchImpl, log: (reason: string) => logs.push(reason) };
}

const json = (status: number, body: unknown) => () => Response.json(body, { status });

test("a served site: one call, with the credential, the host as a query value, never cached", async () => {
  const f = fake(json(200, SITE));
  const site = await fetchSite("demo-store.negosyotest.com:3002", env, f.fetchImpl, f.log);
  assert.deepEqual(site, SITE);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, "http://api.test/storefront/v1/site/?host=demo-store.negosyotest.com%3A3002");
  const headers = f.calls[0].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, `Bearer ${secret}`);
  assert.equal(f.calls[0].init.cache, "no-store");
  assert.equal(f.calls[0].init.redirect, "error");
  assert.ok(f.calls[0].init.signal instanceof AbortSignal);
  assert.deepEqual(f.logs, []);
});

test("the host cannot add a second query value", async () => {
  const f = fake(json(200, SITE));
  await fetchSite("a.test&host=b.test#x", env, f.fetchImpl, f.log);
  assert.equal(new URL(f.calls[0].url).searchParams.getAll("host").length, 1);
  assert.equal(new URL(f.calls[0].url).searchParams.get("host"), "a.test&host=b.test#x");
});

test("a site that is not served is null, and is not logged", async () => {
  const f = fake(json(404, { error: { code: "not_found", message: "Not found." } }));
  assert.equal(await fetchSite("unknown.negosyotest.com", env, f.fetchImpl, f.log), null);
  assert.deepEqual(f.logs, []);
});

test("any other status is null, logged by status only", async () => {
  for (const status of [401, 403, 429, 500, 502, 204, 301]) {
    const f = fake(() => new Response(null, { status }));
    assert.equal(await fetchSite("a.negosyotest.com", env, f.fetchImpl, f.log), null, String(status));
    assert.deepEqual(f.logs, [`the API answered ${status}`]);
  }
});

test("the API down, or slow, is null", async () => {
  const down = fake(() => { throw new TypeError("fetch failed"); });
  assert.equal(await fetchSite("a.negosyotest.com", env, down.fetchImpl, down.log), null);
  assert.deepEqual(down.logs, ["the API could not be reached"]);
  const slow = fake(() => { throw new DOMException("timed out", "TimeoutError"); });
  assert.equal(await fetchSite("a.negosyotest.com", env, slow.fetchImpl, slow.log), null);
  assert.deepEqual(slow.logs, ["the API did not answer in time"]);
});

test("an answer of the wrong shape is null", async () => {
  const wrong: unknown[] = [
    null, [], "x", {},
    { ...SITE, template: "basic" },
    { ...SITE, display_name: 5 },
    { ...SITE, business: null },
    { ...SITE, business: { ...SITE.business, has_seal: "no" } },
    { ...SITE, distributor: { name: "x" } },
    { ...SITE, policy_links: [{ label: "Terms" }] },
    { ...SITE, free_shipping_banner: undefined },
  ];
  for (const body of wrong) {
    const f = fake(json(200, body));
    assert.equal(await fetchSite("a.negosyotest.com", env, f.fetchImpl, f.log), null, JSON.stringify(body));
    assert.deepEqual(f.logs, ["the API answer was not a Santé site"]);
  }
  const notJson = fake(() => new Response("<html>", { status: 200 }));
  assert.equal(await fetchSite("a.negosyotest.com", env, notJson.fetchImpl, notJson.log), null);
  assert.deepEqual(notJson.logs, ["the API answer was not JSON"]);
});

test("policy links, when present, are kept", async () => {
  const withLinks = { ...SITE, policy_links: [{ label: "Terms", path: "/terms/" }] };
  const f = fake(json(200, withLinks));
  assert.deepEqual(await fetchSite("a.negosyotest.com", env, f.fetchImpl, f.log), withLinks);
});

test("no secret, a short secret or no host: Django is not called", async () => {
  for (const short of ["", "x".repeat(31)]) {
    const f = fake(json(200, SITE));
    assert.equal(await fetchSite("a.negosyotest.com", { ...env, secret: short }, f.fetchImpl, f.log), null);
    assert.equal(f.calls.length, 0);
    assert.deepEqual(f.logs, ["STOREFRONT_SERVER_SECRET is not set"]);
  }
  const f = fake(json(200, SITE));
  assert.equal(await fetchSite("", env, f.fetchImpl, f.log), null);
  assert.equal(f.calls.length, 0);
});

test("the secret and the URL are never in a log line", async () => {
  const answers = [json(500, {}), json(200, {}), () => { throw new Error(`boom ${secret}`); },
    () => new Response(secret, { status: 200 })];
  for (const answer of answers) {
    const f = fake(answer);
    await fetchSite("a.negosyotest.com", env, f.fetchImpl, f.log);
    assert.equal(f.logs.length, 1);
    assert.ok(!f.logs[0].includes(secret) && !f.logs[0].includes("api.test") && !f.logs[0].includes("negosyotest"));
  }
});

test("the environment: staging by default, trailing slashes dropped, no secret by default", () => {
  assert.deepEqual(storefrontEnv({}), {
    apiBase: "https://api-staging.negosyonline.com", secret: "", hostAliases: "" });
  assert.deepEqual(
    storefrontEnv({ STOREFRONT_API_BASE: " http://127.0.0.1:8032// ", STOREFRONT_SERVER_SECRET: ` ${secret}\n`,
      STOREFRONT_HOST_ALIASES: "a.test=b.test" }),
    { apiBase: "http://127.0.0.1:8032", secret, hostAliases: "a.test=b.test" });
});
