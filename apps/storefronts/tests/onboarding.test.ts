import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  accessGet, accessPost, addressPost, completedGet, completedPost, detailsPost, emailVerify, mobileSend, mobileVerify,
  onboardingGo, onboardingPage, zipLookup, type ObFlow,
} from "../src/lib/onboarding-flow.ts";
import type { Pack } from "../src/lib/django.ts";
import { mobileDisplay } from "../src/views/sante/pack-onboarding.ts";
import { SITE, FILLED } from "./site.ts";

const secret = randomBytes(24).toString("hex"); // throwaway, made for this run only
const env = { apiBase: "http://api.test", secret };
const PACK: Pack = {
  price_centavos: 148800, currency: "PHP", available: true,
  agreement: { id: 7, label: "v1.0", effective_date: "2026-11-03" }, payment_accounts: [],
};
const TOKEN = "T".repeat(43);

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
function flowOf(f: ReturnType<typeof fake>, over: Partial<ObFlow> = {}): ObFlow {
  return {
    site: SITE, pack: PACK, host: "demo.negosyotest.com", visitor_ip: "", token: TOKEN,
    request: new Request("http://www.santetest.com/funnel/membership-pack/onboarding/verify/"),
    calls: { env, fetchImpl: f.fetchImpl, log: () => {} }, now: new Date("2026-11-12T00:00:00Z"), ...over,
  };
}
const ok = (body: unknown): Reply => ({ status: 200, body });
const err = (status: number, code: string, message: string, fields?: Record<string, string[]>): Reply => ({ status, body: { error: { code, message, ...(fields ? { fields } : {}) } } });

function state(over: Record<string, unknown> = {}) {
  return {
    step: "verify", order_number: "SP-1001", buyer_first_name: "Juan", mobile_masked: "+63 917 *** 4567",
    mobile: { pending: true, code_sent_to: "", resend_in: 0, attempts_left: 5 },
    email: { verified: false, email: "j@example.test", masked: "j***@example.test", code_sent: false, resend_in: 0, attempts_left: 5 },
    address: { country: "Philippines", receiver_name: "Juan Dela Cruz", receiver_mobile: "+639171234567" },
    details_erased: false, registration_held: null, expires_at: "2026-11-12T02:00:00Z", ...over,
  };
}
const cookies = (r: Response) => r.headers.getSetCookie().join("\n");
const text = (r: Response) => r.text();

test("no checkout cookie goes to sign-in", async () => {
  const f = fake({});
  const r = await onboardingGo(flowOf(f, { token: "" }));
  assert.equal(r?.status, 303);
  assert.equal(r?.headers.get("location"), "/dashboard/sign-in/");
  assert.equal(f.calls.length, 0);
});

test("a closed or old token clears the cookie and goes to sign-in; a stale one shows the contacts-replaced page", async () => {
  const f = fake({ "onboarding/state": [err(409, "checkout_closed", "Not signed in."), err(409, "checkout_stale", "This checkout has expired. Please start again.")] });
  const closed = await onboardingPage(flowOf(f), "verify");
  assert.equal(closed?.headers.get("location"), "/dashboard/sign-in/");
  assert.match(cookies(closed!), /no_checkout=; .*Max-Age=0/);
  const stale = await onboardingPage(flowOf(f), "verify");
  assert.equal(stale?.status, 200);
  const body = await text(stale!);
  assert.match(body, /The store updated your contact details, so this page has closed\./);
  assert.match(cookies(stale!), /Max-Age=0/);
});

test("a step whose earlier step is open goes back to it; a finished onboarding goes to Completed", async () => {
  const f = fake({ "onboarding/state": [ok(state()), ok(state({ step: "done" }))] });
  const early = await onboardingPage(flowOf(f), "details");
  assert.equal(early?.headers.get("location"), "/funnel/membership-pack/onboarding/verify/");
  const done = await onboardingPage(flowOf(f), "verify");
  assert.equal(done?.headers.get("location"), "/funnel/membership-pack/completed/");
});

test("the verify page: Send Code first, then the six boxes, and the cookie slides", async () => {
  const f = fake({ "onboarding/state": [ok(state()), ok(state({ mobile: { pending: true, code_sent_to: "+639171234567", resend_in: 42, attempts_left: 5 } }))] });
  const first = await onboardingPage(flowOf(f), "verify");
  const a = await text(first!);
  assert.match(a, /Verify Your Mobile Number/);
  assert.match(a, /We will text a 6-digit code to <strong>\+63 917 \*\*\* 4567<\/strong>\./);
  assert.match(a, /Send Code/);
  assert.match(a, /Mobile number incorrect\?/);
  assert.match(cookies(first!), /no_checkout=T{43}; Path=\/; Max-Age=7200; HttpOnly; SameSite=Lax/);
  const second = await text((await onboardingPage(flowOf(f), "verify"))!);
  assert.match(second, /Enter the 6-digit code sent to/);
  assert.equal((second.match(/class="otp-box[ "]/g) ?? []).length, 6);
  assert.match(second, /data-pp-resend="42"/);
  assert.match(second, /Resend OTP <span data-pp-resend-timer>\(42s\)<\/span>/);
});

test("the email code step shows after the mobile is verified", async () => {
  const f = fake({ "onboarding/state": [ok(state({ mobile: { pending: false, code_sent_to: "", resend_in: 0, attempts_left: 5 } }))] });
  const body = await text((await onboardingPage(flowOf(f), "verify"))!);
  assert.match(body, /Verify Your Email/);
  assert.match(body, /Mobile number verified/);
  assert.match(body, /We will email a 6-digit code to <strong>j\*\*\*@example.test<\/strong>\./);
});

test("a wrong code puts the page back with the attempts left; the code is never echoed", async () => {
  const f = fake({
    "onboarding/mobile/verify": [err(422, "invalid_code", "Incorrect code.", { code: ["Incorrect code."] })],
    "onboarding/state": [ok(state({ mobile: { pending: true, code_sent_to: "+639171234567", resend_in: 0, attempts_left: 1 } }))],
  });
  const r = await mobileVerify(flowOf(f), { code: "123456" });
  assert.equal(r?.status, 200);
  const body = await text(r!);
  assert.match(body, /Incorrect code\. You have 1 attempt left\./);
  assert.doesNotMatch(body, /123456/);
  assert.equal(f.calls[0].body.code, "123456");
});

test("five wrong codes lock the boxes", async () => {
  const f = fake({
    "onboarding/mobile/verify": [err(422, "code_burned", "Too many attempts.", { code: ["Too many attempts."] })],
    "onboarding/state": [ok(state({ mobile: { pending: true, code_sent_to: "+639171234567", resend_in: 0, attempts_left: 0 } }))],
  });
  const body = await text((await mobileVerify(flowOf(f), { code: "000000" }))!);
  assert.match(body, /Too many attempts\. Send a new code\./);
  assert.match(body, /otp-box[^>]* disabled/);
});

test("a step that worked goes on to the next page; a 429 keeps its status", async () => {
  const f = fake({
    "onboarding/mobile/send": [ok(state()), err(429, "rate_limited", "Too many requests.")],
    "onboarding/state": [ok(state())],
    "onboarding/email/verify": [ok(state({ step: "address", mobile: { pending: false }, email: { verified: true } }))],
  });
  const same = await mobileSend(flowOf(f), {});
  assert.equal(same?.headers.get("location"), "/funnel/membership-pack/onboarding/verify/");
  const limited = await mobileSend(flowOf(f), {});
  assert.equal(limited?.status, 429);
  const next = await emailVerify(flowOf(f), { code: "654321" });
  assert.equal(next?.headers.get("location"), "/funnel/membership-pack/onboarding/address/");
});

test("the address page carries the cascade, the data files and its words; no inline script", async () => {
  const f = fake({ "onboarding/state": [ok(state({ step: "address", mobile: { pending: false }, email: { verified: true } }))] });
  const body = await text((await onboardingPage(flowOf(f), "address"))!);
  for (const word of ["Step 2 of 3", "Delivery address", "Tell us who receives your Membership Pack and where to deliver it.", "Receiver Name *", "Receiver Mobile *", "City / Municipality *", "Landmark *", "Save and continue"]) assert.ok(body.includes(word), word);
  assert.match(body, /data-ph-provinces="\/assets\/sante\/data\/provinces\.json\?v=[0-9a-f]{8}"/);
  assert.match(body, /data-zip-url="\/funnel\/membership-pack\/onboarding\/zip\/"/);
  assert.match(body, /value="917 123 4567"/);
  assert.match(body, /pack-address\.js/);
  assert.doesNotMatch(body, /<script(?![^>]*\bsrc=)(?![^>]*application\/json)[^>]*>/);
});

test("an address post sends the names the service takes, the mobile as 09...; a refusal shows where", async () => {
  const f = fake({
    "onboarding/state": [ok(state({ step: "address" })), ok(state({ step: "address" }))],
    "onboarding/address": [err(422, "invalid_address", "Check the address.", { line: ["Enter the house number and street."] }), ok(state({ step: "details" }))],
  });
  const bad = await addressPost(flowOf(f), { receiver_name: "Ana", receiver_mobile: "917 123 4567", line: "", province: "METRO MANILA", city: "QUEZON CITY", barangay: "A", landmark: "near", postal_code: "" });
  assert.equal(bad?.status, 200);
  assert.match(await text(bad!), /Enter the house number and street\./);
  const sent = f.calls.find((c) => c.path === "onboarding/address")!.body;
  assert.equal(sent.receiver_mobile, "09171234567");
  assert.equal(sent.token, TOKEN);
});

test("the details page asks only for the date of birth, the names and the terms, with the gate's rules in JSON", async () => {
  const f = fake({ "onboarding/state": [ok(state({ step: "details", mobile: { pending: false }, email: { verified: true } }))] });
  const body = await text((await onboardingPage(flowOf(f), "details"))!);
  for (const word of ["Step 3 of 3", "Your Santé account details", "Preferred Santé username", "Secondary Santé Username", "Submit my details", "8 to 20 letters or numbers. No spaces or symbols."]) assert.ok(body.includes(word), word);
  assert.match(body, /<script type="application\/json" id="pp-details-gate">\{[^<]*"reserved":\["admin"/);
  assert.match(body, /<option value="2008">2008<\/option>/);
  assert.doesNotMatch(body, /<option value="2009">/);
  assert.match(body, /data-file="\/funnel\/membership-pack\/membership-terms\.pdf\?v=7"/);
});

test("a details post sends digits only and the terms as a boolean", async () => {
  const f = fake({ "onboarding/state": [ok(state({ step: "details" }))], "onboarding/details": [ok(state({ step: "done" }))] });
  const r = await detailsPost(flowOf(f), { dob_year: "1990", dob_month: "2", dob_day: "x²", desired_username: "juan12345", alternate_username: "juan54321", terms: "1" });
  assert.equal(r?.headers.get("location"), "/funnel/membership-pack/completed/");
  const sent = f.calls.find((c) => c.path === "onboarding/details")!.body;
  assert.deepEqual([sent.dob_year, sent.dob_month, sent.dob_day, sent.terms], ["1990", "2", "", true]);
});

test("Completed: the page signs nobody in; only the POST sets the member cookie and clears the checkout cookie", async () => {
  const f = fake({
    "onboarding/state": [ok(state({ step: "done" })), ok(state({ step: "verify" }))],
    "onboarding/completed": [ok({ result: "issued", session_token: "S".repeat(43) }), ok({ result: "spent", session_token: "" }), ok({ result: "open", session_token: "" }), ok({ result: "stale", session_token: "" })],
  });
  const page = await completedGet(flowOf(f));
  const body = await text(page!);
  assert.match(body, /Your onboarding is complete/);
  assert.match(body, /Go to my dashboard/);
  assert.doesNotMatch(cookies(page!), /no_member/);
  assert.equal((await completedGet(flowOf(f)))?.headers.get("location"), "/funnel/membership-pack/onboarding/");
  const issued = await completedPost(flowOf(f));
  assert.equal(issued?.headers.get("location"), "/dashboard/");
  assert.match(cookies(issued!), /no_member=S{43}; Path=\/; Max-Age=2592000; HttpOnly; SameSite=Lax/);
  assert.match(cookies(issued!), /no_checkout=; .*Max-Age=0/);
  const spent = await completedPost(flowOf(f));
  assert.equal(spent?.headers.get("location"), "/dashboard/");
  assert.doesNotMatch(cookies(spent!), /no_member=S/);
  assert.equal((await completedPost(flowOf(f)))?.headers.get("location"), "/funnel/membership-pack/onboarding/");
  assert.match(await text((await completedPost(flowOf(f)))!), /The store updated your contact details/);
});

test("Completed with a held registration shows its label and line, and the Order Summary says transfer", async () => {
  const f = fake({ "onboarding/state": [ok(state({ step: "done", registration_held: { label: "Cancelled", line: "The store cancelled this registration." } }))] });
  const body = await text((await completedGet(flowOf(f)))!);
  assert.match(body, /<h1>Cancelled<\/h1>/);
  assert.match(body, /The store cancelled this registration\./);
  assert.doesNotMatch(body, /What happens next/);
  assert.match(body, /Bank or e-wallet transfer/);
  assert.match(body, /<dd>₱1,488\.00<\/dd>/);
});

test("the access page: open, spent, renewable, and the redeem POST starts a fresh checkout cookie", async () => {
  const f = fake({
    "access/read": [ok({ link_open: true, renewable: true }), ok({ link_open: false, renewable: true }), ok({ link_open: false, renewable: false })],
    "access/redeem": [ok({ redeemed: true, token: "R".repeat(43), expires_at: "2026-11-12T02:00:00Z" })],
    "access/renew": [ok({ sent: true, link_open: false, renewable: true })],
  });
  const open = await accessGet(flowOf(f), "link12345");
  assert.match(await text(open!), /Tap the button to confirm your mobile number and continue your order\./);
  assert.equal(open?.headers.get("referrer-policy"), "no-referrer");
  assert.match(await text((await accessGet(flowOf(f), "link12345"))!), /Each link works once and lasts 7 days\. We can email you a new one\./);
  assert.match(await text((await accessGet(flowOf(f), "link12345"))!), /This link is no longer needed/);
  const redeemed = await accessPost(flowOf(f), "link12345", { action: "continue" });
  assert.equal(redeemed?.headers.get("location"), "/funnel/membership-pack/onboarding/");
  assert.match(cookies(redeemed!), /no_checkout=R{43}; Path=\/; Max-Age=7200/);
  const renewed = await accessPost(flowOf(f), "link12345", { action: "renew" });
  assert.match(await text(renewed!), /Check your email for a new secure link\./);
});

test("an unknown access link is the neutral 404 answer (null)", async () => {
  const f = fake({ "access/read": [{ status: 404, body: { error: { code: "not_found", message: "" } } }] });
  assert.equal(await accessGet(flowOf(f), "nolink123"), null);
});

test("the ZIP lookup answers the shape pack-address.js reads", async () => {
  const f = fake({ "address/zip": [ok({ ok: true, zip_code: "1100", zip_precision: "barangay", error_field: "", error_message: "" })] });
  const r = await zipLookup(flowOf(f), new URLSearchParams("province=A&city=B&barangay=C"));
  assert.deepEqual(await r.json(), { success: true, zip: "1100", zip_precision: "barangay" });
  assert.equal((await zipLookup(flowOf(f), new URLSearchParams("province=A"))).status, 400);
});

test("help shows the store's own contact, never TWC's", async () => {
  const f = fake({ "onboarding/state": [ok(state())] });
  const body = await text((await onboardingPage(flowOf(f, { site: FILLED }), "verify"))!);
  assert.match(body, /hello@demo-store\.example\.test/);
  assert.match(body, /include your order number <strong>SP-1001<\/strong>/);
});

test("the mobile box shows the ten digits after +63", () => {
  assert.equal(mobileDisplay("+639171234567"), "917 123 4567");
  assert.equal(mobileDisplay("09171234567"), "917 123 4567");
  assert.equal(mobileDisplay(""), "");
});
