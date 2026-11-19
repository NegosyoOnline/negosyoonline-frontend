import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { chatPoll, chatSend, type ChatPoll, type ChatSend } from "../src/lib/django.ts";
import { openedAt } from "../src/lib/chat-flow.ts";
import { CHAT, CHAT_MAX_AGE, cookieName } from "../src/lib/cookies.ts";
import { POST as sendPost, GET as sendGet } from "../src/app/chat/send/route.ts";
import { POST as pollPost, GET as pollGet } from "../src/app/chat/poll/route.ts";
import { homeDocument } from "../src/views/sante/home.ts";
import { homeModel } from "../src/views/sante/model.ts";
import { FILLED } from "./site.ts";

const secret = randomBytes(24).toString("hex"); // throwaway, made for this run only
const env = { apiBase: "http://api.test", secret };
const VISITOR = "V".repeat(43); // the shape Django makes: token_urlsafe(32)
const SEND: ChatSend = { host: "demo-store.negosyotest.com", visitor_ip: "203.0.113.7", visitor_secret: "", name: "Ana Reyes",
  email: "ana@example.test", text: "A private question", website: "", opened_at: "2026-11-16T08:00:00.000Z", after_id: 0 };
const POLL: ChatPoll = { host: "demo-store.negosyotest.com", visitor_ip: "", visitor_secret: VISITOR, after_id: 0 };

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
const ANSWER = { state: "open", visitor_secret: "", messages: [{ id: 7, text: "Hello!", at: "2026-11-16T08:05:00Z" }], notice: "" };

/* --- the call to Django --------------------------------------------------------------------- */

test("send: one POST to the chat send call with the credential and exactly the fields Django accepts", async () => {
  const f = fake(json(200, ANSWER));
  const result = await chatSend(SEND, env, f.fetchImpl, f.log);
  assert.deepEqual(result, { state: "ok", chat: { state: "open", visitor_secret: "", messages: ANSWER.messages } });
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, "http://api.test/storefront/v1/chat/send/");
  const headers = f.calls[0].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, `Bearer ${secret}`);
  assert.equal(headers["Content-Type"], "application/json");
  assert.deepEqual(Object.keys(JSON.parse(f.calls[0].init.body as string)).sort(),
    ["after_id", "email", "host", "name", "opened_at", "text", "visitor_ip", "visitor_secret", "website"]);
  assert.equal(f.calls[0].init.cache, "no-store");
  assert.equal(f.calls[0].init.redirect, "error");
  assert.deepEqual(f.logs, []);
});

test("poll: its own address, the visitor's secret as data, never cached", async () => {
  const f = fake(json(200, { ...ANSWER, state: "none", messages: [] }));
  const result = await chatPoll(POLL, env, f.fetchImpl, f.log);
  assert.equal(result.state, "ok");
  assert.equal(f.calls[0].url, "http://api.test/storefront/v1/chat/poll/");
  assert.deepEqual(JSON.parse(f.calls[0].init.body as string), POLL);
});

test("the hidden field goes on as posted: the API decides what a filled one means", async () => {
  const f = fake(json(200, ANSWER));
  await chatSend({ ...SEND, website: "http://spam.example" }, env, f.fetchImpl, f.log);
  assert.equal(JSON.parse(f.calls[0].init.body as string).website, "http://spam.example");
});

test("404 is unavailable (chat off, or a host that is not served); 422 and 429 are refusals; anything else failed", async () => {
  assert.deepEqual(await chatPoll(POLL, env, fake(json(404, {})).fetchImpl, () => {}), { state: "unavailable" });
  const refused = await chatSend(SEND, env, fake(json(422, { error: { code: "invalid_request", message: "x", fields: { text: ["Please keep a message to 2 links or fewer."] } } })).fetchImpl, () => {});
  assert.equal(refused.state, "refused");
  assert.equal(refused.state === "refused" && refused.fields.text, "Please keep a message to 2 links or fewer.");
  const limited = await chatSend(SEND, env, fake(json(429, { error: { code: "rate_limited" } })).fetchImpl, () => {});
  assert.equal(limited.state === "refused" && limited.status, 429);
  for (const answer of [json(500, {}), json(200, {}), json(200, { ...ANSWER, state: "weird" }), json(200, { ...ANSWER, messages: [{ id: "x" }] }),
    () => { throw new TypeError("fetch failed"); }, () => { throw new DOMException("timed out", "TimeoutError"); }]) {
    assert.deepEqual(await chatSend(SEND, env, fake(answer as () => Response).fetchImpl, () => {}), { state: "failed" });
  }
});

test("no secret, a short secret or no host: Django is not called", async () => {
  for (const short of ["", "x".repeat(31)]) {
    const f = fake(json(200, ANSWER));
    assert.deepEqual(await chatPoll(POLL, { ...env, secret: short }, f.fetchImpl, f.log), { state: "failed" });
    assert.equal(f.calls.length, 0);
    assert.deepEqual(f.logs, ["STOREFRONT_SERVER_SECRET is not set"]);
  }
  const f = fake(json(200, ANSWER));
  assert.deepEqual(await chatSend({ ...SEND, host: "" }, env, f.fetchImpl, f.log), { state: "failed" });
  assert.equal(f.calls.length, 0);
});

test("nothing the visitor typed, their secret, their address or the URL is ever in a log line", async () => {
  const answers = [json(500, {}), json(200, {}), json(422, { error: {} }), () => { throw new Error(`boom ${secret} ${VISITOR}`); },
    () => new Response(`${secret} ${SEND.text}`, { status: 200 })];
  for (const answer of answers) {
    const f = fake(answer as () => Response);
    await chatSend({ ...SEND, visitor_secret: VISITOR }, env, f.fetchImpl, f.log);
    for (const line of f.logs) {
      for (const word of [secret, VISITOR, "api.test", "negosyotest", SEND.visitor_ip, SEND.name, SEND.email, SEND.text]) {
        assert.ok(!line.includes(word), `${line} / ${word}`);
      }
    }
  }
});

/* --- the routes, with Django faked ---------------------------------------------------------- */

type Seen = { url: string; init?: RequestInit };

async function withDjango(chat: () => Response, run: (seen: Seen[]) => Promise<void>, vars: Record<string, string> = {}): Promise<void> {
  const seen: Seen[] = [];
  const names = ["STOREFRONT_API_BASE", "STOREFRONT_SERVER_SECRET", "STOREFRONT_HOST_ALIASES", "VERCEL"];
  const before = { fetch: globalThis.fetch, error: console.error, env: names.map((name) => process.env[name]) };
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(input), init });
    return chat();
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

function post(route: "send" | "poll", body: unknown, opts: { host?: string; cookie?: string; headers?: Record<string, string>; https?: boolean } = {}): Request {
  const host = opts.host ?? "www.santetest.com:3062";
  const headers: Record<string, string> = { host, "content-type": "application/json", "sec-fetch-site": "same-origin", ...opts.headers };
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.https) headers["x-forwarded-proto"] = "https";
  return new Request(`http://www.santetest.com:3062/chat/${route}/`, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers });
}

const WRITE = { text: "A private question", name: "Ana", email: "ana@example.test", website: "", opened_at: "2026-11-16T08:00:00Z", after_id: 0 };
const chatCalls = (seen: Seen[]) => seen.filter((c) => c.url.includes("/storefront/v1/chat/"));

test("the first message: Django gets the host (aliased), the fields and no secret; the new secret is set in an HttpOnly Lax host cookie for 30 days", async () => {
  await withDjango(json(200, { ...ANSWER, visitor_secret: VISITOR, messages: [] }), async (seen) => {
    const answer = await sendPost(post("send", WRITE, { https: true }));
    assert.equal(answer.status, 200);
    assert.equal(answer.headers.get("cache-control"), "no-store");
    const body = await answer.json();
    assert.deepEqual(body, { ok: true, state: "open", available: true, messages: [] });
    assert.ok(!JSON.stringify(body).includes(VISITOR), "the secret never goes to the page");
    const sent = JSON.parse(chatCalls(seen)[0].init?.body as string);
    assert.equal(sent.host, "demo-store.negosyotest.com");
    assert.equal(sent.visitor_secret, "");
    assert.equal(sent.visitor_ip, ""); // off Vercel
    assert.equal(sent.text, WRITE.text);
    const cookie = answer.headers.get("set-cookie") ?? "";
    assert.ok(cookie.startsWith(`__Host-no_chat=${VISITOR};`), cookie);
    for (const part of ["Path=/", `Max-Age=${CHAT_MAX_AGE}`, "HttpOnly", "SameSite=Lax", "Secure"]) assert.ok(cookie.includes(part), `${part} in ${cookie}`);
    assert.ok(!/Domain=/i.test(cookie), "host only");
    assert.equal(CHAT_MAX_AGE, 30 * 24 * 3600);
  });
});

test("over plain http (a local run) the cookie has the plain name and no Secure flag, and is still HttpOnly and Lax", async () => {
  await withDjango(json(200, { ...ANSWER, visitor_secret: VISITOR, messages: [] }), async () => {
    const cookie = (await sendPost(post("send", WRITE))).headers.get("set-cookie") ?? "";
    assert.ok(cookie.startsWith(`no_chat=${VISITOR};`), cookie);
    assert.ok(cookie.includes("HttpOnly") && cookie.includes("SameSite=Lax") && !cookie.includes("Secure"));
    assert.equal(cookieName(CHAT, false), "no_chat");
    assert.equal(cookieName(CHAT, true), "__Host-no_chat");
  });
});

test("a later message sends the cookie's secret to Django, and sets the cookie again so idle runs from the last use", async () => {
  await withDjango(json(200, ANSWER), async (seen) => {
    const answer = await sendPost(post("send", WRITE, { cookie: `no_chat=${VISITOR}` }));
    assert.equal(JSON.parse(chatCalls(seen)[0].init?.body as string).visitor_secret, VISITOR);
    assert.ok((answer.headers.get("set-cookie") ?? "").startsWith(`no_chat=${VISITOR};`));
  });
});

test("on Vercel the message carries the platform's address, not one the visitor typed", async () => {
  const headers = { "x-vercel-forwarded-for": "203.0.113.7", "x-forwarded-for": "198.51.100.9" };
  await withDjango(json(200, ANSWER), async (seen) => {
    await sendPost(post("send", WRITE, { headers }));
    assert.equal(JSON.parse(chatCalls(seen)[0].init?.body as string).visitor_ip, "203.0.113.7");
  }, { VERCEL: "1" });
});

test("the site comes from the host only: a body naming a site, a host or a secret is not passed on", async () => {
  await withDjango(json(200, ANSWER), async (seen) => {
    await sendPost(post("send", { ...WRITE, site_id: "site_other", host: "other.negosyotest.com", visitor_secret: "B".repeat(43) }));
    const sent = JSON.parse(chatCalls(seen)[0].init?.body as string);
    assert.equal(sent.host, "demo-store.negosyotest.com");
    assert.equal(sent.visitor_secret, "");
    assert.ok(!("site_id" in sent));
  });
});

test("the hidden field is passed through as posted", async () => {
  await withDjango(json(200, { ...ANSWER, state: "open", messages: [] }), async (seen) => {
    await sendPost(post("send", { ...WRITE, website: "filled by a robot" }));
    assert.equal(JSON.parse(chatCalls(seen)[0].init?.body as string).website, "filled by a robot");
  });
});

test("a time that is not a time, or in the future, is not trusted", () => {
  const now = new Date("2026-11-16T08:00:00Z");
  assert.equal(openedAt("2026-11-16T07:59:00Z", now), "2026-11-16T07:59:00.000Z");
  assert.equal(openedAt("2030-01-01T00:00:00Z", now), "2026-11-16T08:00:00.000Z");
  for (const bad of [undefined, null, 5, "", "soon", "x".repeat(100)]) assert.equal(openedAt(bad, now), null);
});

test("a wrong or stale secret gets the empty answer and the cookie is cleared; no conversation is revealed", async () => {
  await withDjango(json(200, { state: "none", visitor_secret: "", messages: [], notice: "" }), async () => {
    const answer = await pollPost(post("poll", { after_id: 0 }, { cookie: `no_chat=${"W".repeat(43)}` }));
    assert.deepEqual(await answer.json(), { ok: true, state: "none", available: true, messages: [] });
    const cookie = answer.headers.get("set-cookie") ?? "";
    assert.ok(cookie.includes("Max-Age=0"), cookie);
  });
});

test("a cookie of the wrong shape counts as no cookie: Django gets an empty secret", async () => {
  await withDjango(json(200, { state: "none", visitor_secret: "", messages: [], notice: "" }), async (seen) => {
    await pollPost(post("poll", { after_id: 0 }, { cookie: "no_chat=short" }));
    await pollPost(post("poll", { after_id: 0 }, { cookie: `no_chat=${VISITOR}; no_chat=${"B".repeat(43)}` }));
    for (const call of chatCalls(seen)) assert.equal(JSON.parse(call.init?.body as string).visitor_secret, "");
  });
});

test("poll: the store's replies come through, and the cookie is renewed", async () => {
  await withDjango(json(200, ANSWER), async (seen) => {
    const answer = await pollPost(post("poll", { after_id: 3 }, { cookie: `no_chat=${VISITOR}` }));
    assert.deepEqual(await answer.json(), { ok: true, state: "open", available: true, messages: ANSWER.messages });
    assert.equal(JSON.parse(chatCalls(seen)[0].init?.body as string).after_id, 3);
    assert.ok((answer.headers.get("set-cookie") ?? "").includes(`=${VISITOR};`));
  });
});

test("paused: a visitor who never wrote is told the chat is not available (no launcher); one with a conversation gets the paused panel", async () => {
  const paused = json(200, { state: "paused", visitor_secret: "", messages: [], notice: "Chat is not available right now. Please use the contact form instead." });
  await withDjango(paused, async () => {
    const stranger = await (await pollPost(post("poll", { after_id: 0 }))).json();
    assert.equal(stranger.available, false);
    const known = await (await pollPost(post("poll", { after_id: 0 }, { cookie: `no_chat=${VISITOR}` }))).json();
    assert.deepEqual(known, { ok: true, state: "paused", available: true, messages: [] });
  });
});

test("chat switched off (Django 404) or a host that is not served: the neutral 404 for both calls", async () => {
  await withDjango(json(404, { error: { code: "not_found" } }), async () => {
    for (const answer of [await pollPost(post("poll", { after_id: 0 })), await sendPost(post("send", WRITE))]) {
      assert.equal(answer.status, 404);
      assert.ok(!(answer.headers.get("set-cookie") ?? ""));
      assert.match(await answer.text(), /Page not found\./);
    }
  });
});

test("refusals become the widget's fixed kinds and never carry Django's words", async () => {
  const cases: [Response, number, string][] = [
    [Response.json({ error: { code: "rate_limited", message: "secret words" } }, { status: 429 }), 429, "limited"],
    [Response.json({ error: { code: "invalid_request", message: "m", fields: { text: ["Please keep a message to 2 links or fewer."] } } }, { status: 422 }), 422, "links"],
    [Response.json({ error: { code: "invalid_request", message: "m", fields: { email: ["Please enter a valid email address."] } } }, { status: 422 }), 422, "email"],
    [Response.json({ error: { code: "invalid_request", message: "m", fields: { text: ["Please write a message."] } } }, { status: 422 }), 422, "empty"],
    [Response.json({ error: { code: "too_fast", message: "Please wait a moment and try again." } }, { status: 422 }), 422, "too_fast"],
    [Response.json({}, { status: 500 }), 503, "failed"],
  ];
  for (const [response, status, kind] of cases) {
    await withDjango(() => response.clone(), async () => {
      const answer = await sendPost(post("send", WRITE, { cookie: `no_chat=${VISITOR}` }));
      assert.equal(answer.status, status, kind);
      assert.deepEqual(await answer.json(), { ok: false, error: kind });
      assert.ok(!(answer.headers.get("set-cookie") ?? ""), "a refused message sets no cookie");
    });
  }
});

test("Django unreachable: a failed answer, not a crash", async () => {
  await withDjango(() => { throw new TypeError("fetch failed"); }, async () => {
    const answer = await pollPost(post("poll", { after_id: 0 }));
    assert.equal(answer.status, 503);
    assert.deepEqual(await answer.json(), { ok: false, error: "failed" });
  });
});

test("only a same-origin JSON post gets an answer; every other method or shape is the neutral 404 and Django is not called", async () => {
  await withDjango(json(200, ANSWER), async (seen) => {
    const cross = post("send", WRITE, { headers: { "sec-fetch-site": "cross-site" } });
    const foreign = post("send", WRITE, { headers: { "sec-fetch-site": "", origin: "https://evil.example" } });
    const noProof = new Request("http://www.santetest.com:3062/chat/send/", { method: "POST", body: JSON.stringify(WRITE),
      headers: { host: "www.santetest.com:3062", "content-type": "application/json" } });
    const form = new Request("http://www.santetest.com:3062/chat/send/", { method: "POST", body: "text=hi",
      headers: { host: "www.santetest.com:3062", "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": "same-origin" } });
    const badHost = post("send", WRITE, { host: "bad host" });
    for (const request of [cross, foreign, noProof, form, badHost, post("send", "{not json"), post("send", "[1]"), post("poll", "null")]) {
      const route = request.url.includes("/poll/") ? pollPost : sendPost;
      assert.equal((await route(request)).status, 404);
    }
    assert.equal((await sendGet()).status, 404);
    assert.equal((await pollGet()).status, 404);
    assert.equal(chatCalls(seen).length, 0);
  });
});

test("a message body over the limit is not read", async () => {
  await withDjango(json(200, ANSWER), async (seen) => {
    const big = post("send", { ...WRITE, text: "x".repeat(20000) });
    assert.equal((await sendPost(big)).status, 404);
    assert.equal(chatCalls(seen).length, 0);
  });
});

/* --- the page's script and styles ------------------------------------------------------------ */

const ASSETS = path.join(import.meta.dirname, "..", "public", "assets", "sante");
const widget = createRequire(import.meta.url)(path.join(ASSETS, "js", "chat-widget.js")) as {
  pollDelay(ms: number): number; errorKind(status: number, body: unknown): string; emailOk(v: string): boolean;
  mergeReplies(log: { items: { who: string; id: number; text: string; at: string }[]; last: number }, replies: unknown[]): boolean;
  readLog(storage: unknown, now?: number): { items: unknown[]; last: number }; writeLog(storage: unknown, log: unknown, now?: number): void;
  migrateLog(local: unknown, session: unknown): void; LOG_TTL_MS: number;
  readProbe(storage: unknown, host: string, now: number): { available: boolean; state: string } | null;
  writeProbe(storage: unknown, host: string, now: number, available: boolean, state: string): void; PROBE_KEY: string;
  start(doc: unknown, win: unknown): void;
  TEXT: Record<string, unknown>; ERRORS: Record<string, string>; LOG_KEY: string;
};

test("polling: every 20 s, every 60 s after 10 minutes idle, never after 30 minutes idle", () => {
  const min = 60000;
  assert.equal(widget.pollDelay(0), 20000);
  assert.equal(widget.pollDelay(10 * min - 1), 20000);
  assert.equal(widget.pollDelay(10 * min), 60000);
  assert.equal(widget.pollDelay(30 * min - 1), 60000);
  assert.equal(widget.pollDelay(30 * min), 0);
});

test("the three fixed error texts, and a kind for each answer", () => {
  assert.equal(widget.ERRORS.failed, "We could not send your message. Please try again in a moment.");
  assert.equal(widget.ERRORS.limited, "You have sent several messages in a short time. Please wait a few minutes and try again.");
  assert.equal(widget.ERRORS.links, "Please remove some of the links and try again.");
  assert.equal(widget.errorKind(429, { ok: false, error: "limited" }), "limited");
  assert.equal(widget.errorKind(429, null), "limited");
  assert.equal(widget.errorKind(422, { error: "links" }), "links");
  assert.equal(widget.errorKind(422, { error: "email" }), "email");
  assert.equal(widget.errorKind(422, { error: "too_fast" }), "failed");
  assert.equal(widget.errorKind(0, null), "failed");
  assert.equal(widget.errorKind(503, { error: "failed" }), "failed");
});

test("an email is one address or nothing", () => {
  for (const ok of ["", "  ", "ana@example.test"]) assert.equal(widget.emailOk(ok), true, ok);
  for (const bad of ["ana", "ana@", "a b@c.d", "@x.test"]) assert.equal(widget.emailOk(bad), false, bad);
});

test("the store's replies are added once by id, in time order; the highest id is remembered", () => {
  const log = { items: [{ who: "me", id: 0, text: "Hi", at: "2026-11-16T08:00:00Z" }], last: 0 };
  assert.equal(widget.mergeReplies(log, [{ id: 4, text: "Hello", at: "2026-11-16T08:05:00Z" }, { id: 4, text: "Hello", at: "2026-11-16T08:05:00Z" }, { id: "x" }, null]), true);
  assert.equal(widget.mergeReplies(log, [{ id: 4, text: "Hello", at: "2026-11-16T08:05:00Z" }]), false);
  assert.deepEqual(log.items.map((m) => m.text), ["Hi", "Hello"]);
  assert.equal(log.last, 4);
});

test("the kept conversation survives a blocked or broken browser store", () => {
  const stored = new Map<string, string>();
  const storage = { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => void stored.set(k, v), removeItem: (k: string) => void stored.delete(k) };
  const log = { items: [{ who: "me", id: 0, text: "Hi", at: "2026-11-16T08:00:00Z" }], last: 0 };
  widget.writeLog(storage, log);
  assert.deepEqual(widget.readLog(storage), log);
  widget.writeLog(storage, { items: [], last: 0 });
  assert.equal(stored.size, 0);
  stored.set(widget.LOG_KEY, "{not json");
  assert.deepEqual(widget.readLog(storage), { items: [], last: 0 });
  stored.set(widget.LOG_KEY, JSON.stringify({ items: [{ who: "x", text: "no", at: "" }, { who: "store", id: 1, text: "ok", at: "t" }], last: 1 }));
  assert.equal(widget.readLog(storage).items.length, 1);
  const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
  assert.deepEqual(widget.readLog(blocked), { items: [], last: 0 });
  assert.doesNotThrow(() => widget.writeLog(blocked, log));
});

test("the script never builds markup from text and never turns text into a link; no placeholder tag is shown", () => {
  const code = readFileSync(path.join(ASSETS, "js", "chat-widget.js"), "utf8");
  assert.doesNotMatch(code, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function|createContextualFragment/);
  assert.doesNotMatch(code, /"[^"\n]*(?:placeholder|\(D6\))[^"\n]*"/i); // no tag in any string the page can show
  assert.doesNotMatch(code, /XMLHttpRequest|api\.negosyo|\/storefront\/v1/); // the browser calls this site's three chat routes only
  assert.deepEqual([...code.matchAll(/post\("([^"]+)"/g)].map((m) => m[1]).sort(), ["/chat/contact/", "/chat/poll/", "/chat/send/"]);
});

test("the reply-time line is a fixed sentence with no number; the launcher reads Chat with us; the paused text points to the contact form", () => {
  assert.ok(!/\d/.test(String(widget.TEXT.status)), String(widget.TEXT.status));
  assert.equal(widget.TEXT.launcher, "Chat with us");
  assert.equal(widget.TEXT.pausedBefore + String(widget.TEXT.pausedLink) + widget.TEXT.pausedAfter, "Chat is not available right now. Please use the contact form.");
});

test("the styles: light blue focus, no gold, dark follows the page theme, a full-screen sheet and an icon-only launcher under 641 px", () => {
  const css = readFileSync(path.join(ASSETS, "css", "chat-widget.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /\.sw-input:focus[^{]*\{[^}]*#6C8CFF/);
  assert.doesNotMatch(css, /gold|#C9A646|#D9B93F|#8A6513/i);
  assert.match(css, /html\[data-theme="dark"\] \.sw-root/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.sw-panel \{ inset: 0;/);
  assert.match(css, /@media \(max-width: 640px\) \{ \.sw-launcher \{[^}]*width: 56px[^}]*\} \.sw-launcher \.sw-lab \{ display: none; \}/);
  assert.match(css, /\.sw-launcher \{[^}]*box-sizing: border-box; border: 2px solid #FFFFFF;[^}]*box-shadow: 0 0 0 1px rgba\(0,0,0,\.12\)/);
  assert.match(css, /html\[data-theme="dark"\] \.sw-launcher \{[^}]*border: 2px solid #FFFFFF/);
});

test("the home links the widget's stylesheet and script, with the store name as an escaped data attribute", () => {
  const page = homeDocument(homeModel({ ...FILLED, display_name: 'Nena "<b>" Shop' })).value;
  assert.match(page, /<link rel="stylesheet" href="\/assets\/sante\/css\/chat-widget\.css\?v=[0-9a-f]{8}">/);
  assert.match(page, /<script src="\/assets\/sante\/js\/chat-widget\.js\?v=[0-9a-f]{8}" data-chat-widget data-store="Nena &quot;&lt;b&gt;&quot; Shop"><\/script>/);
});

const memory = () => {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

test("the availability answer is remembered for 60 s per host, and only for that host", () => {
  const st = memory(), t = 1_000_000;
  assert.equal(widget.readProbe(st, "a.test", t), null);
  widget.writeProbe(st, "a.test", t, true, "open");
  assert.deepEqual(widget.readProbe(st, "a.test", t + 59_999), { available: true, state: "open" });
  assert.equal(widget.readProbe(st, "a.test", t + 60_000), null, "after 60 s it asks again");
  assert.equal(widget.readProbe(st, "b.test", t + 1), null, "another host does not use it");
  assert.equal(widget.readProbe(st, "a.test", t - 1), null, "a time in the future is not trusted");
  widget.writeProbe(st, "a.test", t, false, "none");
  assert.deepEqual(widget.readProbe(st, "a.test", t + 1), { available: false, state: "none" });
  st.m.set(widget.PROBE_KEY, "{not json");
  assert.equal(widget.readProbe(st, "a.test", t), null);
  const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.equal(widget.readProbe(blocked, "a.test", t), null);
  assert.doesNotThrow(() => widget.writeProbe(blocked, "a.test", t, true, "none"));
});

/* A bare page for the script: just enough document and window to run start() and count the polls. */
function page(session: ReturnType<typeof memory>, answer: { status: number; body: unknown }, local: ReturnType<typeof memory> = memory()) {
  const calls: string[] = [];
  const el = (): Record<string, unknown> => ({ classList: { add() {} }, appendChild() {}, setAttribute() {}, addEventListener() {}, style: {} });
  const doc = { currentScript: null, querySelector: () => null, createElement: el, createElementNS: el, body: el(), documentElement: el(), addEventListener() {}, hidden: false };
  const win = { sessionStorage: session, localStorage: local, location: { host: "demo.test" }, setTimeout, clearTimeout, AbortController,
    fetch: (url: string) => { calls.push(url); return Promise.resolve({ status: answer.status, json: () => Promise.resolve(answer.body) }); } };
  return { calls, doc, win };
}
const tick = () => new Promise((r) => setTimeout(r, 5));

test("browsing several pages costs one probe poll a minute: the second page reads the remembered answer, and chat that is off is remembered too", async () => {
  const session = memory();
  const first = page(session, { status: 200, body: { ok: true, state: "none", available: true, messages: [] } });
  widget.start(first.doc, first.win);
  await tick();
  assert.deepEqual(first.calls, ["/chat/poll/"]);
  const second = page(session, { status: 200, body: { ok: true, state: "none", available: true, messages: [] } });
  widget.start(second.doc, second.win);
  await tick();
  assert.deepEqual(second.calls, [], "no poll on the next page within the minute");
  const off = memory(), a = page(off, { status: 404, body: null });
  widget.start(a.doc, a.win);
  await tick();
  const b = page(off, { status: 404, body: null });
  widget.start(b.doc, b.win);
  await tick();
  assert.deepEqual([a.calls.length, b.calls.length], [1, 0], "a 404 is remembered");
  const down = memory(), c = page(down, { status: 503, body: { ok: false, error: "failed" } });
  widget.start(c.doc, c.win);
  await tick();
  const d = page(down, { status: 503, body: { ok: false, error: "failed" } });
  widget.start(d.doc, d.win);
  await tick();
  assert.equal(d.calls.length, 1, "a failure is not remembered");
});

test("the conversation is in localStorage and the probe stays in sessionStorage", async () => {
  const code = readFileSync(path.join(ASSETS, "js", "chat-widget.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(code, /win\.localStorage/);
  assert.match(code, /readProbe\(session,/);
  const session = memory(), local = memory();
  const p = page(session, { status: 200, body: { ok: true, state: "none", available: true, messages: [] } }, local);
  widget.start(p.doc, p.win);
  await tick();
  assert.ok(session.m.has(widget.PROBE_KEY), "probe in sessionStorage");
  assert.ok(!local.m.has(widget.PROBE_KEY), "probe not in localStorage");
});

test("a kept conversation is dropped 30 days after its last write, not before", () => {
  const st = memory(), t = 5_000_000_000, log = { items: [{ who: "me", id: 0, text: "Hi", at: "2026-11-16T08:00:00Z" }], last: 0 };
  assert.equal(widget.LOG_TTL_MS, 30 * 24 * 3600 * 1000);
  widget.writeLog(st, log, t);
  assert.equal(JSON.parse(st.m.get(widget.LOG_KEY)!).saved_at, t);
  assert.deepEqual(widget.readLog(st, t + widget.LOG_TTL_MS), log, "still there on day 30");
  assert.deepEqual(widget.readLog(st, t + widget.LOG_TTL_MS + 1), { items: [], last: 0 }, "gone after 30 days");
  assert.ok(!st.m.has(widget.LOG_KEY), "and removed");
});

test("a log an older version kept in sessionStorage moves to localStorage once", () => {
  const raw = JSON.stringify({ items: [{ who: "me", id: 0, text: "Hi", at: "2026-11-16T08:00:00Z" }], last: 0 });
  const session = memory(), local = memory();
  session.m.set(widget.LOG_KEY, raw);
  widget.migrateLog(local, session);
  assert.equal(widget.readLog(local, Date.now()).items.length, 1);
  assert.ok(!session.m.has(widget.LOG_KEY), "old copy removed");
  const s2 = memory(), l2 = memory();
  s2.m.set(widget.LOG_KEY, raw);
  l2.m.set(widget.LOG_KEY, JSON.stringify({ items: [{ who: "me", id: 0, text: "New", at: "2026-11-16T09:00:00Z" }], last: 0, saved_at: Date.now() }));
  widget.migrateLog(l2, s2);
  assert.equal((widget.readLog(l2, Date.now()).items[0] as { text: string }).text, "New", "localStorage log wins");
  assert.ok(!s2.m.has(widget.LOG_KEY));
});
