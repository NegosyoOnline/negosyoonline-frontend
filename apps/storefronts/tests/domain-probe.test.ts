import test from "node:test";
import assert from "node:assert/strict";
import { fetchDomainProbe } from "../src/lib/django.ts";
import { GET, POST } from "../src/app/.well-known/negosyoonline-probe/route.ts";

const ENV = { apiBase: "http://api.test", secret: "s".repeat(40) };
const NONCE = "abcdefghijklmnopqrstuv"; // 22 characters, as token_urlsafe(16)
const none = () => {};

type Call = { url: string; init: RequestInit };
function stub(answer: () => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchImpl = (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(answer());
  };
  return { calls, fetchImpl };
}

test("fetchDomainProbe sends the host with the server credential, uncached, and returns only the id", async () => {
  const { calls, fetchImpl } = stub(() => Response.json({ site: "site_abc", extra: "x" }));
  assert.equal(await fetchDomainProbe("www.shop.example.test", ENV, fetchImpl, none), "site_abc");
  assert.equal(calls[0].url, "http://api.test/storefront/v1/domain-probe/?host=www.shop.example.test");
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, `Bearer ${ENV.secret}`);
  assert.equal(calls[0].init.cache, "no-store");
  assert.equal(calls[0].init.redirect, "error");
});

test("fetchDomainProbe fails closed: 404 (quiet), other status, a throw, bad JSON, wrong shape, no host, short secret", async () => {
  const logs: string[] = [];
  const log = (r: string) => logs.push(r);
  assert.equal(await fetchDomainProbe("h.test", ENV, stub(() => new Response("{}", { status: 404 })).fetchImpl, log), null);
  assert.equal(logs.length, 0);
  assert.equal(await fetchDomainProbe("h.test", ENV, stub(() => new Response("{}", { status: 500 })).fetchImpl, log), null);
  assert.equal(await fetchDomainProbe("h.test", ENV, (() => Promise.reject(new Error("down"))) as never, log), null);
  assert.equal(await fetchDomainProbe("h.test", ENV, stub(() => new Response("nope", { status: 200 })).fetchImpl, log), null);
  assert.equal(await fetchDomainProbe("h.test", ENV, stub(() => Response.json({ site: 5 })).fetchImpl, log), null);
  assert.equal(await fetchDomainProbe("h.test", ENV, stub(() => Response.json({ site: "" })).fetchImpl, log), null);
  assert.equal(await fetchDomainProbe("", ENV, stub(() => Response.json({ site: "a" })).fetchImpl, log), null);
  assert.equal(await fetchDomainProbe("h.test", { ...ENV, secret: "short" }, stub(() => Response.json({ site: "a" })).fetchImpl, log), null);
  assert.equal(logs.length, 6);
  for (const line of logs) {
    assert.ok(!line.includes(ENV.secret));
    assert.ok(!line.includes("h.test"));
  }
});

async function withApi<T>(answer: () => Response | Promise<Response>, run: (calls: Call[]) => Promise<T>): Promise<T> {
  const prev = globalThis.fetch;
  const saved = { base: process.env.STOREFRONT_API_BASE, secret: process.env.STOREFRONT_SERVER_SECRET, alias: process.env.STOREFRONT_HOST_ALIASES };
  process.env.STOREFRONT_API_BASE = ENV.apiBase;
  process.env.STOREFRONT_SERVER_SECRET = ENV.secret;
  delete process.env.STOREFRONT_HOST_ALIASES;
  const { calls, fetchImpl } = stub(answer);
  globalThis.fetch = ((url: string, init: RequestInit) => fetchImpl(url, init)) as never;
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = prev;
    for (const [key, value] of [["STOREFRONT_API_BASE", saved.base], ["STOREFRONT_SERVER_SECRET", saved.secret], ["STOREFRONT_HOST_ALIASES", saved.alias]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const probe = (query: string, host = "www.shop.example.test") =>
  new Request(`https://${host}/.well-known/negosyoonline-probe${query}`, { headers: { host } });

test("the route answers {site, n} for a host Django knows, uncached, with nothing else", async () => {
  await withApi(() => Response.json({ site: "site_abc" }), async (calls) => {
    const response = await GET(probe(`?n=${NONCE}`));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("set-cookie"), null);
    assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
    assert.deepEqual(await response.json(), { site: "site_abc", n: NONCE });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://api.test/storefront/v1/domain-probe/?host=www.shop.example.test");
  });
});

test("the route answers the neutral 404 for a host Django does not know, and the API's own answer never reaches the body", async () => {
  await withApi(() => new Response(JSON.stringify({ error: { code: "not_found", secret: "x" } }), { status: 404 }), async () => {
    const response = await GET(probe(`?n=${NONCE}`));
    assert.equal(response.status, 404);
    const text = await response.text();
    assert.match(text, /Page not found\./);
    assert.ok(!text.includes("not_found"));
    assert.ok(!text.includes(NONCE));
  });
});

test("no nonce or a nonce of the wrong shape is the neutral 404 and Django is not asked", async () => {
  await withApi(() => Response.json({ site: "site_abc" }), async (calls) => {
    for (const query of ["", "?n=", "?n=short", `?n=${"a".repeat(65)}`, "?n=<script>alert(1)</script>xx", `?n=${NONCE}%20x`, "?n=abcdefghijklmnop%0Aqrs"]) {
      assert.equal((await GET(probe(query))).status, 404, query);
    }
    assert.equal(calls.length, 0);
  });
});

test("the API down or answering an error is the neutral 404, and any other method is too", async () => {
  await withApi(() => new Response("boom", { status: 500 }), async () => {
    assert.equal((await GET(probe(`?n=${NONCE}`))).status, 404);
  });
  const prev = globalThis.fetch;
  globalThis.fetch = (() => Promise.reject(new Error("down"))) as never;
  const quiet = console.error;
  console.error = () => {};
  try {
    process.env.STOREFRONT_SERVER_SECRET = ENV.secret;
    assert.equal((await GET(probe(`?n=${NONCE}`))).status, 404);
  } finally {
    console.error = quiet;
    globalThis.fetch = prev;
    delete process.env.STOREFRONT_SERVER_SECRET;
  }
  assert.equal((await POST()).status, 404);
});
