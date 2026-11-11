import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { sendContact, type ContactMessage } from "../src/lib/django.ts";
import { visitorIp } from "../src/lib/visitor.ts";
import { homeDocument } from "../src/views/sante/home.ts";
import {
  CONTACT_FAILED_NOTE, CONTACT_LIMITED_NOTE, homeModel, invalidContactForm, sentContactForm,
} from "../src/views/sante/model.ts";
import { POST as contactPost, GET as contactGet } from "../src/app/contact/route.ts";
import { GET as homeGet } from "../src/app/route.ts";
import { FILLED } from "./site.ts";

const secret = randomBytes(24).toString("hex"); // throwaway, made for this run only
const env = { apiBase: "http://api.test", secret };
const MESSAGE: ContactMessage = { host: "demo-store.negosyotest.com", visitor_ip: "203.0.113.7", name: "Ana Reyes",
  email: "ana@example.test", subject: "Hello", message: "A private question", website: "" };

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
const refused = (fields: unknown) => json(400, { error: { code: "invalid_request", message: "x", fields } });

/* --- the call to Django --------------------------------------------------------------------- */

test("sent: one POST to the contact call, with the credential and the form as JSON, never cached", async () => {
  const f = fake(json(200, { status: "sent" }));
  assert.deepEqual(await sendContact(MESSAGE, env, f.fetchImpl, f.log), { state: "sent" });
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, "http://api.test/storefront/v1/contact/");
  const init = f.calls[0].init;
  assert.equal(init.method, "POST");
  const headers = init.headers as Record<string, string>;
  assert.equal(headers.Authorization, `Bearer ${secret}`);
  assert.equal(headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(init.body as string), MESSAGE);
  assert.equal(init.cache, "no-store");
  assert.equal(init.redirect, "error");
  assert.ok(init.signal instanceof AbortSignal);
  assert.deepEqual(f.logs, []);
});

test("the hidden field goes on as posted: the API decides what a filled one means", async () => {
  const f = fake(json(200, { status: "sent" }));
  await sendContact({ ...MESSAGE, website: "http://spam.example" }, env, f.fetchImpl, f.log);
  assert.equal(JSON.parse(f.calls[0].init.body as string).website, "http://spam.example");
});

test("fields refused: the first text of each named field, and nothing else", async () => {
  const f = fake(refused({ name: ["Please enter your name."], email: ["Please enter a valid email address.", "second"],
    message: ["Please enter a message."], subject: ["not a slot"], host: ["x"] }));
  assert.deepEqual(await sendContact(MESSAGE, env, f.fetchImpl, f.log), { state: "invalid", errors: {
    name: "Please enter your name.", email: "Please enter a valid email address.", message: "Please enter a message." } });
  assert.deepEqual(f.logs, []);
});

test("a 400 that names no field the form has is a failure", async () => {
  for (const fields of [undefined, {}, { subject: ["x"] }, { name: "text" }, { name: [] }, { name: [5] }, []]) {
    const f = fake(refused(fields));
    assert.deepEqual(await sendContact(MESSAGE, env, f.fetchImpl, f.log), { state: "failed" }, JSON.stringify(fields));
    assert.deepEqual(f.logs, ["the API refused the form without naming a field"]);
  }
});

test("over the limit is its own answer, and is not logged", async () => {
  const f = fake(json(429, { error: { code: "rate_limited", message: "x" } }));
  assert.deepEqual(await sendContact(MESSAGE, env, f.fetchImpl, f.log), { state: "limited" });
  assert.deepEqual(f.logs, []);
  const bare = fake(() => new Response(null, { status: 429 }));
  assert.deepEqual(await sendContact(MESSAGE, env, bare.fetchImpl, bare.log), { state: "limited" });
});

test("not served and no contact email are failures, and are not logged", async () => {
  for (const status of [404, 409]) {
    const f = fake(json(status, { error: { code: "x", message: "x" } }));
    assert.deepEqual(await sendContact(MESSAGE, env, f.fetchImpl, f.log), { state: "failed" }, String(status));
    assert.deepEqual(f.logs, []);
  }
});

test("any other status is a failure, logged by status only", async () => {
  for (const status of [401, 403, 500, 502, 503, 201, 204, 301]) {
    const f = fake(() => new Response(null, { status }));
    assert.deepEqual(await sendContact(MESSAGE, env, f.fetchImpl, f.log), { state: "failed" }, String(status));
    assert.deepEqual(f.logs, [`the API answered ${status}`]);
  }
});

test("a 200 that does not say sent is a failure", async () => {
  for (const body of [null, {}, { status: "queued" }, { status: true }, "sent", ["sent"]]) {
    const f = fake(json(200, body));
    assert.deepEqual(await sendContact(MESSAGE, env, f.fetchImpl, f.log), { state: "failed" }, JSON.stringify(body));
    assert.deepEqual(f.logs, ["the API answer was not a sent message"]);
  }
  const notJson = fake(() => new Response("<html>", { status: 200 }));
  assert.deepEqual(await sendContact(MESSAGE, env, notJson.fetchImpl, notJson.log), { state: "failed" });
  assert.deepEqual(notJson.logs, ["the API answer was not JSON"]);
});

test("the API down, or slow, is a failure", async () => {
  const down = fake(() => { throw new TypeError("fetch failed"); });
  assert.deepEqual(await sendContact(MESSAGE, env, down.fetchImpl, down.log), { state: "failed" });
  assert.deepEqual(down.logs, ["the API could not be reached"]);
  const slow = fake(() => { throw new DOMException("timed out", "TimeoutError"); });
  assert.deepEqual(await sendContact(MESSAGE, env, slow.fetchImpl, slow.log), { state: "failed" });
  assert.deepEqual(slow.logs, ["the API did not answer in time"]);
});

test("no secret, a short secret or no host: Django is not called", async () => {
  for (const short of ["", "x".repeat(31)]) {
    const f = fake(json(200, { status: "sent" }));
    assert.deepEqual(await sendContact(MESSAGE, { ...env, secret: short }, f.fetchImpl, f.log), { state: "failed" });
    assert.equal(f.calls.length, 0);
    assert.deepEqual(f.logs, ["STOREFRONT_SERVER_SECRET is not set"]);
  }
  const f = fake(json(200, { status: "sent" }));
  assert.deepEqual(await sendContact({ ...MESSAGE, host: "" }, env, f.fetchImpl, f.log), { state: "failed" });
  assert.equal(f.calls.length, 0);
});

test("nothing the visitor typed, their address, the secret or the URL is ever in a log line", async () => {
  const answers = [json(500, {}), json(200, {}), refused({}), () => { throw new Error(`boom ${secret}`); },
    () => new Response(`${secret} ${MESSAGE.message}`, { status: 200 }),
    json(400, { error: { fields: { other: [MESSAGE.message] } } })];
  for (const answer of answers) {
    const f = fake(answer);
    await sendContact(MESSAGE, env, f.fetchImpl, f.log);
    assert.equal(f.logs.length, 1);
    for (const word of [secret, "api.test", "negosyotest", MESSAGE.visitor_ip, MESSAGE.name, MESSAGE.email,
      MESSAGE.subject, MESSAGE.message]) assert.ok(!f.logs[0].includes(word), `${f.logs[0]} / ${word}`);
  }
});

/* --- the visitor's address ------------------------------------------------------------------ */

test("the visitor address: Vercel's own header, on Vercel only", () => {
  const vercel = { VERCEL: "1" };
  const h = (init: Record<string, string>) => new Headers(init);
  assert.equal(visitorIp(h({ "x-vercel-forwarded-for": "203.0.113.7" }), vercel), "203.0.113.7");
  assert.equal(visitorIp(h({ "x-vercel-forwarded-for": " 2001:db8::1 , 10.0.0.1" }), vercel), "2001:db8::1");
  // what a visitor can type is not believed: x-forwarded-for and x-real-ip are never read
  assert.equal(visitorIp(h({ "x-forwarded-for": "198.51.100.9", "x-real-ip": "198.51.100.9" }), vercel), "");
  for (const bad of ["", "unknown", "203.0.113.7:443", "203.0.113", "<script>", "a".repeat(500)]) {
    assert.equal(visitorIp(h({ "x-vercel-forwarded-for": bad }), vercel), "", bad);
  }
  // off Vercel the same header is only what the client sent
  for (const source of [{}, { VERCEL: "" }, { VERCEL: "0" }, { VERCEL: "true" }]) {
    assert.equal(visitorIp(h({ "x-vercel-forwarded-for": "203.0.113.7" }), source), "");
  }
});

/* --- what the form shows --------------------------------------------------------------------- */

const NOW = new Date("2026-11-11T10:00:00+08:00");

test("fields refused: each error in its own slot, the typed values kept and escaped, no note", () => {
  const posted = new URLSearchParams({ name: "", email: " Not-An-Email ", subject: `"s" & <b>`, message: "" });
  const form = invalidContactForm(posted, { name: "Please enter your name.",
    email: "Please enter a valid email address.", message: "Please enter a message." });
  const page = homeDocument(homeModel(FILLED, form, NOW)).value;
  assert.equal(page.match(/<div class="sf-contact-error">/g)?.length, 3);
  assert.match(page, /<div class="sf-contact-error">Please enter your name\.<\/div>/);
  assert.match(page, /<div class="sf-contact-error">Please enter a valid email address\.<\/div>/);
  assert.match(page, /<div class="sf-contact-error">Please enter a message\.<\/div>/);
  assert.match(page, /name="email" value="not-an-email"/);
  assert.match(page, /name="subject" value="&quot;s&quot; &amp; &lt;b&gt;"/);
  assert.doesNotMatch(page, /class="sf-contact-status"/);
});

test("sent: the approved thank-you line, the form empty, no note and no error", () => {
  const page = homeDocument(homeModel(FILLED, sentContactForm(), NOW)).value;
  assert.match(page, /<p class="sf-contact-status" role="status" style="color: var\(--green\);">Thanks! Your message has been sent &mdash; we'll get back to you shortly\.<\/p>/);
  assert.equal(page.match(/class="sf-contact-status"/g)?.length, 1);
  assert.match(page, /<input type="text" name="name" value="" placeholder="Your Name"/);
  assert.match(page, /<textarea name="message"[^>]*><\/textarea>/);
  assert.doesNotMatch(page, /class="sf-contact-error"|#d33d44/);
});

/* --- the routes, with Django faked ---------------------------------------------------------- */

type Seen = { url: string; init?: RequestInit };

async function withDjango(
  contact: () => Response,
  run: (seen: Seen[]) => Promise<void>,
  vars: Record<string, string> = {},
): Promise<void> {
  const seen: Seen[] = [];
  const names = ["STOREFRONT_API_BASE", "STOREFRONT_SERVER_SECRET", "STOREFRONT_HOST_ALIASES", "VERCEL"];
  const before = { fetch: globalThis.fetch, error: console.error, env: names.map((name) => process.env[name]) };
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    seen.push({ url, init });
    if (url.startsWith("http://api.test/storefront/v1/site/")) {
      return new URL(url).searchParams.get("host") === "demo-store.negosyotest.com"
        ? Response.json(FILLED) : Response.json({ error: {} }, { status: 404 });
    }
    return contact();
  }) as typeof fetch;
  console.error = () => {};
  Object.assign(process.env, { STOREFRONT_API_BASE: "http://api.test", STOREFRONT_SERVER_SECRET: secret,
    STOREFRONT_HOST_ALIASES: "www.santetest.com=demo-store.negosyotest.com", VERCEL: "", ...vars });
  try {
    await run(seen);
  } finally {
    globalThis.fetch = before.fetch;
    console.error = before.error;
    names.forEach((name, i) => {
      if (before.env[i] === undefined) delete process.env[name];
      else process.env[name] = before.env[i];
    });
  }
}

const FORM = { name: "Ana Reyes", email: "ana@example.test", subject: "Hello", message: "A question", website: "" };

function post(fields: Record<string, string> = FORM, host = "www.santetest.com:3062",
  headers: Record<string, string> = {}): Request {
  return new Request(`http://${host}/contact/`, { method: "POST", body: new URLSearchParams(fields).toString(),
    headers: { host, "content-type": "application/x-www-form-urlencoded", ...headers } });
}

test("a sent post: the form goes to Django once, then a redirect to the home's thank-you line", async () => {
  await withDjango(json(200, { status: "sent" }), async (seen) => {
    const answer = await contactPost(post());
    assert.equal(answer.status, 303);
    assert.equal(answer.headers.get("location"), "/?contact=sent#contact-form");
    assert.equal(answer.headers.get("cache-control"), "no-store");
    assert.equal(await answer.text(), "");
    const calls = seen.filter((call) => call.url === "http://api.test/storefront/v1/contact/");
    assert.equal(calls.length, 1);
    assert.deepEqual(JSON.parse(calls[0].init?.body as string),
      { host: "demo-store.negosyotest.com", visitor_ip: "", ...FORM }); // the aliased host; no address off Vercel
  });
});

test("the post passes the hidden field unchanged and the form's values as typed", async () => {
  await withDjango(json(200, { status: "sent" }), async (seen) => {
    await contactPost(post({ ...FORM, name: "  Ana  ", website: "filled by a robot" }));
    const body = JSON.parse(seen.at(-1)?.init?.body as string);
    assert.equal(body.website, "filled by a robot");
    assert.equal(body.name, "  Ana  ");
  });
});

test("on Vercel the post carries the platform's address for the visitor, not one the visitor typed", async () => {
  const headers = { "x-vercel-forwarded-for": "203.0.113.7", "x-forwarded-for": "198.51.100.9" };
  await withDjango(json(200, { status: "sent" }), async (seen) => {
    await contactPost(post(FORM, "www.santetest.com", headers));
    assert.equal(JSON.parse(seen.at(-1)?.init?.body as string).visitor_ip, "203.0.113.7");
  }, { VERCEL: "1" });
  await withDjango(json(200, { status: "sent" }), async (seen) => {
    await contactPost(post(FORM, "www.santetest.com", headers));
    assert.equal(JSON.parse(seen.at(-1)?.init?.body as string).visitor_ip, "");
  });
});

test("fields refused: the home again, 400, with the errors and the typed values", async () => {
  const answer400 = refused({ email: ["Please enter a valid email address."] });
  await withDjango(answer400, async () => {
    const answer = await contactPost(post({ ...FORM, email: "nope" }));
    assert.equal(answer.status, 400);
    assert.equal(answer.headers.get("cache-control"), "no-store");
    const page = await answer.text();
    assert.match(page, /<div class="sf-contact-error">Please enter a valid email address\.<\/div>/);
    assert.match(page, /name="name" value="Ana Reyes"/);
    assert.match(page, /name="email" value="nope"/);
    assert.match(page, />A question<\/textarea>/);
    assert.doesNotMatch(page, /class="sf-contact-status"/);
  });
});

test("every other answer: the home again with the could-not-send note and the typed values", async () => {
  const answers = [json(409, { error: { code: "no_contact_email" } }),
    json(503, { error: { code: "email_not_sent" } }), json(401, {}), json(404, {}), json(500, {}),
    () => { throw new TypeError("fetch failed"); }, () => { throw new DOMException("timed out", "TimeoutError"); }];
  for (const contact of answers) {
    await withDjango(contact as () => Response, async () => {
      const answer = await contactPost(post());
      assert.equal(answer.status, 200);
      const page = await answer.text();
      assert.ok(page.includes(`<p class="sf-contact-status" role="status" style="color: #d33d44;">${CONTACT_FAILED_NOTE}</p>`));
      assert.match(page, /name="name" value="Ana Reyes"/);
      assert.match(page, />A question<\/textarea>/);
      assert.doesNotMatch(page, /Thanks! Your message has been sent|class="sf-contact-error"/);
    });
  }
});

test("over the limit: the home again, 429, with the approved too-many-messages line and the typed values", async () => {
  await withDjango(json(429, { error: { code: "rate_limited" } }), async () => {
    const answer = await contactPost(post());
    assert.equal(answer.status, 429);
    assert.equal(answer.headers.get("cache-control"), "no-store");
    const page = await answer.text();
    assert.equal(CONTACT_LIMITED_NOTE, "Too many messages from this connection. Please try again later.");
    assert.ok(page.includes(`<p class="sf-contact-status" role="status" style="color: #d33d44;">${CONTACT_LIMITED_NOTE}</p>`));
    assert.equal(page.match(/class="sf-contact-status"/g)?.length, 1);
    assert.match(page, /name="name" value="Ana Reyes"/);
    assert.match(page, /name="subject" value="Hello"/);
    assert.match(page, />A question<\/textarea>/);
    assert.doesNotMatch(page, /We could not send|Thanks! Your message has been sent|class="sf-contact-error"/);
  });
});

test("a host that is not served: the neutral 404, and the contact call is never made", async () => {
  await withDjango(json(200, { status: "sent" }), async (seen) => {
    const answer = await contactPost(post(FORM, "unknown.negosyotest.com"));
    assert.equal(answer.status, 404);
    assert.ok(seen.every((call) => !call.url.includes("/contact/")));
    assert.equal((await contactGet()).status, 404);
  });
});

test("the home: the thank-you line only when asked with ?contact=sent", async () => {
  await withDjango(json(500, {}), async (seen) => {
    const get = (path: string) => homeGet(new Request(`http://www.santetest.com${path}`, { headers: { host: "www.santetest.com" } }));
    const sent = await (await get("/?contact=sent")).text();
    assert.match(sent, /Thanks! Your message has been sent &mdash;/);
    for (const path of ["/", "/?contact=failed", "/?contact=", "/?sent=1"]) {
      assert.doesNotMatch(await (await get(path)).text(), /class="sf-contact-status"/, path);
    }
    assert.ok(seen.every((call) => !call.url.includes("/contact/"))); // a GET never sends anything
  });
});
