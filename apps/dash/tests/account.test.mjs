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

/* ---- Code steps (ClickUp z8uq9md33v): its own block ---- */
test("the email and the mobile code step are both laid out like the site's code step", () => {
  const src = fs.readFileSync(new URL("../public/assets/js/account.js", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("../public/assets/css/dash.css", import.meta.url), "utf8");
  const between = (from, to) => src.slice(src.indexOf(from), src.indexOf(to));
  const parts = between("function codeStepParts(", "/* ---- email change");
  const email = between("function emailStep2(", "function cooldownRefused(");
  const mobile = between("function mobileStep2(", "/* ---- connect and disconnect");
  for (const text of ['"Didn\\u2019t arrive? "', '"You can resend in "', '"Resend the code"', '"A new code is on its way."']) assert.ok(parts.includes(text), text);
  for (const step of [email, mobile]) {
    assert.ok(step.includes('f.classList.add("acct-code-step")'));
    assert.ok(step.includes("parts.cooldown()") && step.includes("f.appendChild(parts.back)"));
  }
  /* resend is each step's own start call again, inside the /account/ routes */
  assert.ok(email.includes("wait: 60,") && email.includes('send: function () { return D.call("POST", "/account/email/start/", emailStartBody(email), true); }') && email.includes('"Use a different email"'));
  assert.ok(mobile.includes("wait: 30,") && mobile.includes('send: function () { return D.call("POST", "/account/mobile/start/", { mobile: number }, true); }') && mobile.includes('"Use a different number"'));
  /* the approved wording is kept */
  assert.ok(email.includes('". Enter it to confirm this address."') && email.includes('"You cannot change your email again for 24 hours."'));
  assert.ok(email.includes('"Confirm email"') && email.includes("email_change_cooldown") && email.includes("email_taken"));
  assert.ok(mobile.includes('. Enter it to confirm this number."') && mobile.includes('"After you confirm, we send a notice to your email."') && mobile.includes('"Confirm mobile"'));
  assert.ok(src.includes('input.setAttribute("autocomplete", "one-time-code")'), "one-time-code autofill is kept");
  assert.ok(css.includes("body.dash-app .acct-otp { position: relative; box-sizing: border-box; width: 100%; max-width: 400px; margin: 8px auto 0; }"));
  assert.ok(css.includes("height: 56px; min-width: 0;") && css.includes("font-size: 1.35rem; font-weight: 600; font-variant-numeric: tabular-nums; }"));
});

/* Email change hardening (ClickUp z8uq9m8htt): the step-up is read from the account answer, never assumed. */
test("the email change asks for the current mailbox's code only when the read says so", () => {
  const src = fs.readFileSync(new URL("../public/assets/js/account.js", import.meta.url), "utf8");
  const open = src.slice(src.indexOf("function openEmail("), src.indexOf("function emailStepUp("));
  assert.ok(open.includes("email_change_step_up === true") && open.includes("emailStep1(body"), "off: the old first step");
  assert.ok(src.includes('D.call("POST", "/account/email/step-up/", null, true)'));
  assert.ok(src.includes("body.step_up_code = S.stepCode"), "the code rides on the start call");
  assert.ok(src.includes('"step_up_required"'), "a refused code sends the person back to the code step");
  assert.ok(src.includes('S.stepCode = ""'), "the code is dropped after use");
});

test("the dead verify-email and social flows are gone", () => {
  const app = fs.readFileSync(new URL("../public/assets/js/app.js", import.meta.url), "utf8");
  for (const gone of ["verifyGate", "resend-verification", "socialButtons", "/auth/social", "verify-email", "social-complete"]) assert.ok(!app.includes(gone), gone);
  for (const file of ["verify-email.html", "social-complete.html", "assets/js/verify.js", "assets/js/social-complete.js"]) {
    assert.ok(!fs.existsSync(new URL("../public/" + file, import.meta.url)), file);
  }
});

/* ---- Change email and Edit name: errors announced, nothing blank sent (ClickUp z8uq9men7r, L2 and L4) ---- */
test("the change-email code must be exactly six digits before it is sent", () => {
  assert.equal(U.codeComplete("123456"), true);
  assert.equal(U.codeComplete(" 123456 "), true);
  for (const v of ["", "   ", "12345", "1234567", "12a456", null, undefined]) assert.equal(U.codeComplete(v), false, String(v));
});

test("field errors are announced, the email box is capped at 254, and a blank name or short code is stopped before the request", () => {
  const src = fs.readFileSync(new URL("../public/assets/js/account.js", import.meta.url), "utf8");
  const between = (from, to) => src.slice(src.indexOf(from), src.indexOf(to));
  assert.ok(src.includes('id: o.id + "-err", role: "alert"'), "every field error, #acct-email-code-err included, is role=alert");
  assert.ok(src.includes('input.setAttribute("maxlength", "254")'), "the new-email field is capped at 254");
  const email = between("function emailStep2(", "function cooldownRefused(");
  assert.ok(email.indexOf("codeComplete(code.input.value)") > 0 && email.indexOf("codeComplete(code.input.value)") < email.indexOf('"/account/email/confirm/"'), "the code is checked before the confirm request");
  const name = between("function editName(", "/* ---- sign out other devices");
  assert.ok(name.indexOf("NAME_BLANK") > 0 && name.indexOf("NAME_BLANK") < name.indexOf('D.call("PATCH"'), "a blank name is stopped before the PATCH");
});
