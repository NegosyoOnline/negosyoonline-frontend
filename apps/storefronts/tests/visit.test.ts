/* The Membership Pack page visitor (ClickUp z8uq9mfw14): the three API calls, the scripts and the landing tag. */
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { visitBegin, visitContact, visitEvent } from "../src/lib/pack-api.ts";
import { landingDocument } from "../src/views/sante/pack-landing.ts";
import { packContext } from "../src/views/sante/pack-page.ts";
import { SITE } from "./site.ts";

const JS = path.join(import.meta.dirname, "..", "public", "assets", "sante", "js");
const env = { apiBase: "http://api.test", secret: randomBytes(24).toString("hex") };
const base = { host: "demo.negosyotest.com", visitor_ip: "203.0.113.5" };

function calls(answer: unknown, status = 200) {
  const seen: { url: string; body: Record<string, unknown> }[] = [];
  const fetchImpl = ((url: string, init: RequestInit) => {
    seen.push({ url, body: JSON.parse(String(init.body)) });
    return Promise.resolve(Response.json(answer, { status }));
  }) as unknown as typeof fetch;
  return { seen, c: { env, fetchImpl, log: () => {} } };
}

test("visitBegin, visitEvent and visitContact post to their Django routes and read the answers", async () => {
  const a = calls({ ref: "abc" });
  assert.deepEqual(await visitBegin({ ...base, ref: "" }, a.c), { state: "ok", ref: "abc" });
  assert.equal(a.seen[0].url, "http://api.test/storefront/v1/visit/");
  const b = calls({ ok: true });
  assert.equal((await visitEvent({ ...base, ref: "abc", event: "percent", percent: 90 }, b.c)).state, "ok");
  assert.equal(b.seen[0].url, "http://api.test/storefront/v1/visit/event/");
  assert.equal(b.seen[0].body.percent, 90);
  const d = calls({ ok: true });
  await visitContact({ ...base, ref: "abc", full_name: "Ana", mobile: "0917", email: "a@b.test" }, d.c);
  assert.equal(d.seen[0].url, "http://api.test/storefront/v1/visit/contact/");
  assert.equal((await visitBegin({ ...base, ref: "" }, calls({ nope: 1 }).c)).state, "failed");
  assert.equal((await visitEvent({ ...base, ref: "x", event: "start" }, calls({}, 404).c)).state, "unavailable");
  assert.equal((await visitEvent({ ...base, ref: "x", event: "start" }, calls({ error: { code: "rate_limited", message: "m" } }, 429).c)).state, "refused");
});

test("the landing page carries the one visitor script, and no Meta or third-party call is made from it", () => {
  const page = landingDocument(packContext(SITE, { price_centavos: 148800, currency: "PHP", available: true, agreement: null, payment_accounts: [] } as never, new Date())).value;
  assert.equal([...page.matchAll(/src="\/assets\/sante\/js\/pack-visit\.js\?v=[0-9a-f]{8}"/g)].length, 1);
  const visit = readFileSync(path.join(JS, "pack-visit.js"), "utf8");
  assert.ok(visit.includes("/funnel/membership-pack/visit/") && visit.includes("localStorage") && !/document\.cookie|fbq|facebook/.test(visit));
  assert.ok(visit.includes('iframe[src*="mediadelivery.net"]'), "the video is found by its address, not its place");
  for (const m of ["25", "50", "75", "90", "100"]) assert.ok(visit.includes(m));
});

test("the checkout script saves the contact on blur, sends the ref with the order and uses no cookie", () => {
  const js = readFileSync(path.join(JS, "pack-checkout.js"), "utf8");
  assert.ok(js.includes('op:"contact"') && js.includes('addEventListener("blur",save)') && js.includes('name="visitor_ref"'));
  assert.ok(!/document\.cookie/.test(js));
});

/* Run the visitor script against a fake Player.js: only time watched with sound counts (the hero autoplays muted and loops). */
function runVisitScript(opts: { muted: () => boolean | "throw" }) {
  const events: unknown[] = [];
  const handlers: Record<string, (d?: unknown) => void> = {};
  let now = 1_000_000;
  const player = {
    on: (n: string, f: (d?: unknown) => void) => { handlers[n] = f; },
    getDuration: (cb: (d: number) => void) => cb(100),
    getPaused: (cb: (p: boolean) => void) => cb(false),
    getMuted: (cb: (m: boolean) => void) => { const m = opts.muted(); if (m === "throw") throw new Error("no"); cb(m); },
  };
  const doc = {
    querySelector: () => ({}),
    head: { appendChild: (s: { onload: () => void }) => s.onload() },
    createElement: () => ({}),
  };
  const win = { localStorage: { getItem: () => "ref1", setItem: () => {} }, playerjs: { Player: function () { return player; } } };
  const fetchStub = (_u: string, init: { body: string }) => {
    const b = JSON.parse(init.body);
    if (b.op === "event") events.push(b.event === "start" ? "start" : b.percent);
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ref: "ref1" }) });
  };
  const code = readFileSync(path.join(JS, "pack-visit.js"), "utf8");
  new Function("window", "document", "fetch", "playerjs", "setTimeout", "Date", code)(
    win, doc, fetchStub, win.playerjs, () => 0, { now: () => now });
  return {
    events,
    tick: (seconds: number) => { now += 1100; handlers.timeupdate?.({ seconds, duration: 100 }); },
    ready: () => handlers.ready?.(),
    ended: () => handlers.ended?.(),
  };
}

test("the visit script counts only time watched with sound, and survives the loop wrapping round", () => {
  let muted = true;
  const v = runVisitScript({ muted: () => muted });
  v.ready();
  for (let s = 0; s <= 100; s += 5) v.tick(s % 100);
  assert.deepEqual(v.events, [], "a muted autoplay loop sends nothing");
  muted = false;
  for (let s = 1; s <= 30; s += 1) v.tick(s);
  assert.deepEqual(v.events, ["start", 25]);
  muted = true;
  for (let s = 31; s <= 95; s += 2) v.tick(s);
  assert.deepEqual(v.events, ["start", 25], "muted seconds never count");
  v.tick(2); v.tick(3);
  assert.deepEqual(v.events, ["start", 25], "the wrap-around resets and re-sends nothing");
  muted = false;
  for (let s = 4; s <= 51; s += 1) v.tick(s);
  assert.deepEqual(v.events, ["start", 25, 50]);
  v.ended();
  assert.equal(v.events.at(-1), 100);
});

test("the visit script sends nothing when the player cannot say whether it is muted", () => {
  const v = runVisitScript({ muted: () => "throw" });
  v.ready();
  for (let s = 0; s <= 100; s += 1) v.tick(s);
  v.ended();
  assert.deepEqual(v.events, []);
});
