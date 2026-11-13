import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { accountPage, changeGet, changePost, verifyEmailGet, verifyEmailPost } from "../src/lib/account-flow.ts";
import type { Dash } from "../src/lib/dashboard-flow.ts";
import { SITE } from "./site.ts";

const secret = randomBytes(24).toString("hex"); // throwaway, made for this run only
const env = { apiBase: "http://api.test", secret, hostAliases: {} } as unknown as import("../src/lib/env.ts").StorefrontEnv;

type Reply = { status: number; body: unknown };
function fake(replies: Record<string, Reply[]>) {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const fetchImpl = (url: string, init: RequestInit) => {
    const route = url.replace("http://api.test/storefront/v1/", "").replace(/\/$/, "");
    calls.push({ path: route, body: JSON.parse(String(init.body)) });
    const next = (replies[route] ?? []).shift();
    if (!next) throw new Error(`unexpected call: ${route}`);
    return Promise.resolve(Response.json(next.body, { status: next.status }));
  };
  return { calls, fetchImpl };
}
const dashOf = (f: ReturnType<typeof fake>): Dash => ({
  site: SITE, now: new Date("2026-11-12T00:00:00Z"),
  call: { request: new Request("http://www.santetest.com/dashboard/account/"), host: "demo.negosyotest.com", visitor_ip: "", member_token: "M".repeat(43), binding: "", env },
  calls: { env, fetchImpl: f.fetchImpl, log: () => {} },
});
const ok = (body: unknown): Reply => ({ status: 200, body });
const err = (status: number, code: string, message: string, fields?: Record<string, string[]>): Reply => ({ status, body: { error: { code, message, ...(fields ? { fields } : {}) } } });
const ME = ok({ member: { id: "m1", full_name: "Juan Dela Cruz", email: "j@example.test", mobile: "+639171234567", email_verified: false, mobile_verified: true } });
const NOT_LOCKED = ok({ pack: null, registration: null });
const ACCOUNT = { member_name: "Juan", mobile_masked: "+63 917 *** 4567", mobile_state: "verified", email_masked: "j***@example.test", email_state: "unverified", default_channel: "sms", hold_banner: "" };

test("the Account page: states, the links, the hold banner, and the nav with Account current", async () => {
  const f = fake({ "member/me": [ME], "member/pack": [NOT_LOCKED], "member/account": [ok({ ...ACCOUNT, hold_banner: "Your registration is on hold." })] });
  const r = await accountPage(dashOf(f));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  const b = await r.text();
  assert.match(b, /<div class="note warn" role="status"><b>Your registration is on hold\.<\/b><\/div>/);
  assert.match(b, /<h1>Account and security<\/h1>/);
  assert.match(b, /Mobile<small>\+63 917 \*\*\* 4567<\/small><\/div><span class="badge ok">Verified<\/span>/);
  assert.match(b, /Email<small>j\*\*\*@example\.test<\/small><\/div><span class="badge pend">Not verified<\/span>/);
  assert.match(b, /Sign-in codes go to<small>Your mobile<\/small>/);
  assert.match(b, /href="\/dashboard\/account\/verify-email\/">Verify email<\/a> &middot; <a class="lnk" href="\/dashboard\/account\/change-mobile\/">Change mobile/);
  assert.doesNotMatch(b, /\/dashboard\/address\//);
  assert.doesNotMatch(b, /<script>/);
});

test("a verified email hides the Verify email link and sends codes to the email", async () => {
  const f = fake({ "member/me": [ME], "member/pack": [NOT_LOCKED], "member/account": [ok({ ...ACCOUNT, email_state: "verified", default_channel: "email" })] });
  const b = await (await accountPage(dashOf(f))).text();
  assert.doesNotMatch(b, /Verify email<\/a>/);
  assert.match(b, /Sign-in codes go to<small>Your email<\/small>/);
});

test("no session goes to the store home; a dead one clears the cookie; a locked order goes to Home", async () => {
  const none = dashOf(fake({}));
  none.call.member_token = "";
  assert.equal((await accountPage(none)).headers.get("location"), "/");
  const dead = await accountPage(dashOf(fake({ "member/me": [err(401, "unauthorized", "x")] })));
  assert.equal(dead.headers.get("location"), "/");
  assert.match(dead.headers.getSetCookie().join("\n"), /no_member=;/);
  const lock = ok({ pack: { order_number: "SP-1", payment_status: "rejected", payment_label: "Rejected", method_label: "Bank transfer", price_centavos: 100, tone: "bad", benefits_off: true, lock: { reason_label: "x", other_text: "", resubmitted: false, accounts: [] }, proofs: [] }, registration: null });
  const locked = await accountPage(dashOf(fake({ "member/me": [ME], "member/pack": [lock] })));
  assert.equal(locked.headers.get("location"), "/dashboard/");
});

test("verify email: send step, code step with its error under the field, done with the backend's message", async () => {
  const f = fake({
    "member/me": [ME, ME, ME], "member/pack": [NOT_LOCKED, NOT_LOCKED, NOT_LOCKED],
    "member/account/verify-email": [ok({ step: "send", email_masked: "j***@example.test", message: "" }), ok({ step: "code", email_masked: "j***@example.test", message: "" })],
    "member/account/verify-email/send": [ok({ step: "code", email_masked: "j***@example.test", message: "" })],
    "member/account/verify-email/verify": [err(422, "invalid_code", "That code is not right.", { code: ["That code is not right."] })],
  });
  const d = dashOf(f);
  let b = await (await verifyEmailGet(d)).text();
  assert.match(b, /<h1>Verify your email<\/h1>[\s\S]*We will send a code to j\*\*\*@example\.test\./);
  b = await (await verifyEmailPost(d, { action: "send" })).text();
  assert.match(b, /<h1>Enter your code<\/h1>/);
  assert.match(b, /Send a new code/);
  const bad = await verifyEmailPost(d, { action: "verify", code: " 000000 " });
  assert.equal(bad.status, 400);
  const html = await bad.text();
  assert.match(html, /<p class="err" id="code-msg" role="alert">That code is not right\.<\/p>/);
  assert.doesNotMatch(html, /note bad/); // a field message goes under its field, not in an alert
  assert.deepEqual(f.calls.find((c) => c.path.endsWith("/verify"))!.body, { host: "demo.negosyotest.com", visitor_ip: "", token: "M".repeat(43), code: "000000" });
  const g = fake({
    "member/me": [ME], "member/pack": [NOT_LOCKED],
    "member/account/verify-email/verify": [ok({ step: "done", email_masked: "j***@example.test", message: "Your email is verified." })],
  });
  const done = await (await verifyEmailPost(dashOf(g), { action: "verify", code: "123456" })).text();
  assert.match(done, /<b>Your email is verified\.<\/b> Sign-in codes now go to your email\./);
});

test("an unknown action is the neutral 404 and asks the backend nothing", async () => {
  const f = fake({ "member/me": [ME], "member/pack": [NOT_LOCKED] });
  assert.equal((await verifyEmailPost(dashOf(f), { action: "drop" })).status, 404);
  const g = fake({ "member/me": [ME], "member/pack": [NOT_LOCKED] });
  assert.equal((await changePost(dashOf(g), "mobile", { action: "drop" })).status, 404);
});

test("change mobile: step 1 to 3 pages follow the backend step", async () => {
  const S = (step: string, over = {}) => ok({ field: "mobile", current_masked: "+63 917 *** 4567", proof_channel: "sms", proof_masked: "+63 917 *** 4567", step, ...over });
  const f = fake({
    "member/me": [ME, ME, ME], "member/pack": [NOT_LOCKED, NOT_LOCKED, NOT_LOCKED],
    "member/account/change/mobile": [S("current"), S("current_code"), S("replacement")],
  });
  const d = dashOf(f);
  let b = await (await changeGet(d, "mobile")).text();
  assert.match(b, /<p class="step">Step 1 of 3<\/p>[\s\S]*<h1>Confirm your current mobile<\/h1>[\s\S]*We will text a code to \+63 917 \*\*\* 4567\./);
  f.calls.length = 0;
  b = await (await changeGet(d, "mobile")).text();
  assert.match(b, /We sent a code to \+63 917 \*\*\* 4567\./);
  assert.match(b, /name="action" value="verify_current"/);
  b = await (await changeGet(d, "mobile")).text();
  assert.match(b, /<p class="step">Step 2 of 3<\/p>[\s\S]*Enter your new mobile/);
  assert.match(b, /type="tel" inputmode="numeric" placeholder="09XX XXX XXXX"/);
});

test("change email by SMS proof says it is to confirm it is you; an SMS pause is a warning with Try again", async () => {
  const S = ok({ field: "email", current_masked: "j***@example.test", proof_channel: "sms", proof_masked: "+63 917 *** 4567", step: "current" });
  const f = fake({
    "member/me": [ME, ME], "member/pack": [NOT_LOCKED, NOT_LOCKED],
    "member/account/change/email": [S, S],
    "member/account/change/email/act": [err(503, "sms_paused", "Texts are paused right now.")],
  });
  const d = dashOf(f);
  assert.match(await (await changeGet(d, "email")).text(), /<h1>Confirm your mobile<\/h1>[\s\S]*to confirm it is you\./);
  const r = await changePost(d, "email", { action: "send_current" });
  const b = await r.text();
  assert.match(b, /<div class="note warn" role="alert"><b>Texts are paused right now\.<\/b><\/div>/);
  assert.match(b, />Try again<\/button>/);
});

test("the replacement confirmed ends every session: shown signed out, the cookie cleared, sign-in link", async () => {
  const f = fake({
    "member/me": [ME], "member/pack": [NOT_LOCKED],
    "member/account/change/mobile/act": [ok({ state: "done", changed: true })],
  });
  const r = await changePost(dashOf(f), "mobile", { action: "verify_replacement", code: "123456" });
  assert.equal(r.status, 200);
  assert.match(r.headers.getSetCookie().join("\n"), /no_member=;/);
  const b = await r.text();
  assert.match(b, /<h1>Your mobile number was changed<\/h1>/);
  assert.match(b, /signed out on all devices\. Sign in again with your new number\./);
  assert.match(b, /href="\/dashboard\/sign-in\/">Sign in again<\/a>/);
  assert.doesNotMatch(b, /pdn-out/); // no signed-in menu
  assert.deepEqual(f.calls.find((c) => c.path.endsWith("/act"))!.body.action, "verify_replacement");
});

test("change step 1 (confirm code): a wrong code is announced and focus goes to the code field, for email and mobile", async () => {
  for (const field of ["email", "mobile"] as const) {
    const S = ok({ field, current_masked: "x***", proof_channel: "sms", proof_masked: "+63 917 *** 4567", step: "current_code" });
    const f = fake({
      "member/me": [ME], "member/pack": [NOT_LOCKED], [`member/account/change/${field}`]: [S],
      [`member/account/change/${field}/act`]: [err(400, "wrong_code", "That code did not work. Please try again.", { code: ["That code did not work. Please try again."] })],
    });
    const b = await (await changePost(dashOf(f), field, { action: "verify_current", code: "000000" })).text();
    assert.match(b, /<p class="err" id="code-msg" role="alert">That code did not work\. Please try again\.<\/p>/);
    assert.match(b, /<input id="code"[^>]* autofocus aria-invalid="true" aria-describedby="code-msg">/);
  }
});

test("change step 1: an empty submit gets a visible, announced message, with no call to the API", async () => {
  for (const field of ["email", "mobile"] as const) {
    const S = ok({ field, current_masked: "x***", proof_channel: "sms", proof_masked: "+63 917 *** 4567", step: "current_code" });
    const f = fake({ "member/me": [ME], "member/pack": [NOT_LOCKED], [`member/account/change/${field}`]: [S] });
    const b = await (await changePost(dashOf(f), field, { action: "verify_current", code: "  " })).text();
    assert.match(b, /<p class="err" id="code-msg" role="alert">Enter the 6-digit code we sent you\.<\/p>/);
    assert.match(b, / autofocus aria-invalid="true"/);
    assert.match(b, /<form method="post" action="[^"]+" novalidate>\s*<input type="hidden" name="action" value="verify_current">/);
    assert.ok(!f.calls.some((c) => c.path.endsWith("/act")));
  }
});

test("change step 2 (new value): a refused value is announced and focus goes to the new-value field, for email and mobile", async () => {
  for (const field of ["email", "mobile"] as const) {
    const msg = field === "mobile" ? "Enter a valid Philippine mobile number." : "Enter a valid email address.";
    const S = ok({ field, current_masked: "x***", proof_channel: "sms", proof_masked: "+63 917 *** 4567", step: "replacement" });
    const f = fake({
      "member/me": [ME], "member/pack": [NOT_LOCKED], [`member/account/change/${field}`]: [S],
      [`member/account/change/${field}/act`]: [err(400, "invalid", msg, { new_value: [msg] })],
    });
    const b = await (await changePost(dashOf(f), field, { action: "send_replacement", new_value: "12345" })).text();
    assert.match(b, /<p class="err" id="new-msg" role="alert">Enter a valid [^<]+<\/p>/);
    assert.match(b, /<input id="new_value"[^>]* required autofocus aria-invalid="true" aria-describedby="new-msg">/);
    assert.equal((b.match(/role="alert"/g) ?? []).length, 1);
  }
});
