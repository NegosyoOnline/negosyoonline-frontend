import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { load, answer } from "./load.mjs";

/* account.js makes no request when it loads; only its exported helpers are exercised here. */
const { window } = load(["app.js", "account.js"], { config: { apiBase: "http://api.test/v1", siteUrl: "http://www.test" },
  fetch: answer(401, { error: { code: "unauthenticated", message: "Sign in to continue." } }) });
const U = window.NOAccount.util;
const plain = (v) => JSON.parse(JSON.stringify(v));
const READ = { id: "acc_1", email: "ana@example.com", name: "Ana Maria Cruz", writes_open: true, signed_in_count: 2,
  email_changed_at: null, email_change_available_at: null, mobile: null,
  providers: [{ provider: "facebook", connected: false }, { provider: "google", connected: true }],
  devices: [{ name: "Chrome on Mac", current: true, signed_in_at: "2026-11-10T08:00:00Z", last_used_at: "2026-11-10T09:00:00Z", ip: "203.0.113.x" }] };

test("the API's one name becomes the two boxes, and everything else is kept", () => {
  const a = U.view(READ);
  assert.equal(a.first_name, "Ana");
  assert.equal(a.last_name, "Maria Cruz");
  assert.equal(a.writes_open, true);
  assert.equal(a.signed_in_count, 2);
  assert.deepEqual(plain(a.providers), READ.providers);
  assert.deepEqual(plain(a.devices), READ.devices);
  assert.equal(READ.first_name, undefined, "the API answer is not changed");
});

test("no name, one word and a missing answer are handled", () => {
  assert.deepEqual([U.view({ name: "" }).first_name, U.view({ name: "" }).last_name], ["", ""]);
  assert.deepEqual([U.view({ name: " Ana " }).first_name, U.view({ name: " Ana " }).last_name], ["Ana", ""]);
  assert.deepEqual([U.view(null).first_name, U.view(undefined).last_name], ["", ""]);
});

test("saving a name sends one name key, trimmed and joined", () => {
  assert.deepEqual(plain(U.nameBody(" Ana ", " Maria Cruz ")), { name: "Ana Maria Cruz" });
  assert.deepEqual(plain(U.nameBody("Ana", "")), { name: "Ana" });
  assert.deepEqual(plain(U.nameBody("", "")), { name: "" });
  const again = U.view(U.nameBody("Ana", "Maria Cruz"));
  assert.equal((again.first_name + " " + again.last_name).trim(), "Ana Maria Cruz");
});

test("confirming an email sends the email and the code in the body", () => {
  assert.deepEqual(plain(U.emailConfirmBody("new@example.com", "123456")), { email: "new@example.com", code: "123456" });
});

test("a connect leaves only for the provider's own address", () => {
  const ok = (url) => ({ ok: true, status: 200, data: { url } });
  assert.equal(U.providerUrl("google", ok("https://accounts.google.com/o/oauth2/v2/auth?state=s")), "https://accounts.google.com/o/oauth2/v2/auth?state=s");
  assert.equal(U.providerUrl("facebook", ok("https://www.facebook.com/dialog/oauth?state=s")), "https://www.facebook.com/dialog/oauth?state=s");
  assert.equal(U.providerUrl("google", ok("https://www.facebook.com/dialog/oauth")), "");
  assert.equal(U.providerUrl("google", ok("https://accounts.google.com.evil.test/")), "");
  assert.equal(U.providerUrl("google", ok("javascript:alert(1)")), "");
  assert.equal(U.providerUrl("google", ok(undefined)), "");
  assert.equal(U.providerUrl("google", { ok: false, status: 409, data: { code: "already_connected", url: "https://accounts.google.com/" } }), "");
  assert.equal(U.providerUrl("twitter", ok("https://accounts.google.com/")), "");
});

test("a provider return is shown only as far as the read confirms it", () => {
  const a = U.view(READ);
  assert.equal(U.returnLine({ provider: "google", result: "connected" }, a).ok, true);
  assert.equal(U.returnLine({ provider: "facebook", result: "connected" }, a), null, "the read says Facebook is not connected");
  assert.equal(U.returnLine({ provider: "facebook", result: "in_use" }, a).ok, false);
  for (const slug of ["cancelled", "failed", "invalid_state", "not_configured", "already_connected"]) {
    const line = U.returnLine({ provider: "facebook", result: slug }, a);
    assert.equal(line.ok, false, slug);
    assert.equal(line.text, "Facebook was not connected. Please try again.");
  }
  assert.equal(U.returnLine({ provider: "facebook", result: "<script>" }, a), null);
  assert.equal(U.returnLine({ provider: "twitter", result: "connected" }, a), null);
  assert.equal(U.returnLine(null, a), null);
});

test("account security notices are promised by email only, never to a mobile number", () => {
  const src = fs.readFileSync(new URL("../public/assets/js/account.js", import.meta.url), "utf8");
  assert.ok(src.includes('"Sign-in, email, mobile and connected account changes. Sent to your email."'));
  assert.ok(src.includes("Changing your mobile sends a notice to your email."));
  assert.ok(src.includes('"After you confirm, we send a notice to your email."'));
  assert.ok(!/old number/i.test(src), "no notice is promised to the old number");
  assert.ok(!/Sent to your email and mobile/i.test(src), "alerts are not promised to the mobile");
});

/* Phase 7 B2 (ClickUp z8uq9machp): Account Settings is Account-owned. Every request in account.js is written as
   D.call or D.send with the path as a string that starts the second argument, so the source is the full list. */
test("the page calls only /account/ and /me/ routes", () => {
  const src = fs.readFileSync(new URL("../public/assets/js/account.js", import.meta.url), "utf8");
  const calls = [...src.matchAll(/\bD\.(?:call|send)\(\s*"([A-Z]+)"\s*,\s*([^,]+),/g)].map((m) => [m[1], m[2].trim()]);
  assert.ok(calls.length >= 10, "the request list was read");
  assert.equal(calls.length, (src.match(/\bD\.(?:call|send)\(/g) || []).length, "every request was read");
  for (const [method, first] of calls) {
    assert.match(first, /^"\/(account|me)\/[a-z\/-]*"$/, method + " " + first);
  }
  assert.ok(calls.some(([m, p]) => m === "GET" && p === '"/account/"'), "the page loads from GET /account/");
  assert.ok(!/\bfetch\(|XMLHttpRequest|sendBeacon/.test(src), "no request is made any other way");
  assert.ok(!/["'`]\/sites\//.test(src), "no site route, as a request or as a link");
  assert.ok(!/siteFromQuery|sitesOf|\?site=/.test(src), "the page reads no selected site");
});
