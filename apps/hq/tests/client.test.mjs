/* hq.js: the one way the staff app calls the backend. The hq cookie rides every call and the page never
   sees it; the page holds no token (R26). */
import test from "node:test";
import assert from "node:assert/strict";
import { open, BASE, refused } from "./page.mjs";

const client = (reply) => open(["hq.js"], { answers: () => reply }).window.NOHq;

test("a read carries the cookie, no Authorization header and no content type", async () => {
  const page = open(["hq.js"], { answers: () => [200, { email: "a@b.co" }] });
  const res = await page.window.NOHq.call("GET", "me/");
  assert.equal(page.calls[0].url, BASE + "/me/");
  assert.equal(page.calls[0].method, "GET");
  assert.equal(page.calls[0].credentials, "include");
  assert.equal(page.calls[0].headers, undefined);
  assert.equal(res.ok, true);
  assert.equal(res.data.email, "a@b.co");
});

test("a body is sent as JSON with the one header the backend's preflight allows", async () => {
  const page = open(["hq.js"], { answers: () => [204] });
  await page.window.NOHq.call("POST", "sign-in/", { email: "a@b.co" });
  assert.deepEqual(Object.keys(page.calls[0].headers), ["Content-Type"]);
  assert.equal(page.calls[0].headers["Content-Type"], "application/json");
  assert.deepEqual(page.calls[0].body, { email: "a@b.co" });
});

test("a 204 is success and no body is read", async () => {
  const res = await client([204]).call("POST", "sign-out/");
  assert.equal(res.ok, true);
  assert.equal(res.status, 204);
  assert.equal(res.code, "");
});

test("a refusal gives its status and code, and never its body as data", async () => {
  const res = await client([403, refused("sign_in_paused")]).call("POST", "sign-in/verify/", { code: "1" });
  assert.equal(res.ok, false);
  assert.equal(res.status, 403);
  assert.equal(res.code, "sign_in_paused");
  assert.equal(JSON.stringify(res.data), "{}");
});

test("no answer, and an answer that is not JSON, are told apart from a refusal", async () => {
  const none = await client("offline").call("GET", "me/");
  assert.equal(none.status, 0);
  assert.equal(none.ok, false);
  const html = await client([404]).call("GET", "me/");
  assert.equal(html.status, 404);
  assert.equal(html.code, "");
});

test("where the backend's answer sends a person", () => {
  const H = client([204]);
  assert.equal(H.placeFor({ ok: true, status: 200, code: "" }), "console");
  assert.equal(H.placeFor({ ok: false, status: 401, code: "second_step_required" }), "verify");
  assert.equal(H.placeFor({ ok: false, status: 401, code: "unauthenticated" }), "sign-in");
  for (const res of [{ ok: false, status: 0, code: "" }, { ok: false, status: 403, code: "origin_not_allowed" },
    { ok: false, status: 404, code: "" }, { ok: false, status: 500, code: "server_error" },
    { ok: false, status: 401, code: "" }]) {
    assert.equal(H.placeFor(res), "down");
  }
});

test("a time is shown in Manila, in the Django pages' form", () => {
  const H = client([204]);
  assert.equal(H.when("2026-11-11T09:02:00+08:00"), "11 Nov 2026, 9:02 AM");
  assert.equal(H.when("2026-11-11T13:01:00+00:00"), "11 Nov 2026, 9:01 PM");
  assert.equal(H.when(""), "");
  assert.equal(H.when("not a time"), "");
});

test("the name and initials come from the address", () => {
  const H = client([204]);
  assert.equal(JSON.stringify(H.who("sample.staff@example.com")), JSON.stringify({ name: "sample.staff", initials: "SS" }));
  assert.equal(H.who("ana@example.com").initials, "A");
  assert.equal(H.who("").initials, "");
});

test("there is no token helper", () => {
  const H = client([204]);
  assert.equal(H.getToken, undefined);
  assert.equal(H.setToken, undefined);
});

test("a private file is asked for with a JSON body and the cookie, and comes back as the file itself", async () => {
  const held = { type: "image/png", size: 3 };
  const page = open(["hq.js"], { answers: () => [200, held] });
  const res = await page.window.NOHq.file("finance/payments/proof/", { payment: "btp_one" });
  assert.equal(page.calls[0].url, BASE + "/finance/payments/proof/");
  assert.equal(page.calls[0].method, "POST");
  assert.equal(page.calls[0].credentials, "include");
  assert.deepEqual(Object.keys(page.calls[0].headers), ["Content-Type"]);
  assert.deepEqual(page.calls[0].body, { payment: "btp_one" });
  assert.equal(JSON.stringify(res), JSON.stringify({ ok: true, status: 200, code: "", blob: held }));
});

test("a refused or unanswered file gives its status and code, and no file", async () => {
  const no = await client([404, refused("not_found")]).file("finance/payments/proof/", { payment: "btp_x" });
  assert.equal(JSON.stringify(no), JSON.stringify({ ok: false, status: 404, code: "not_found", blob: null }));
  const none = await client("offline").file("finance/payments/proof/", { payment: "btp_x" });
  assert.equal(JSON.stringify(none), JSON.stringify({ ok: false, status: 0, code: "", blob: null }));
  const page = await client([500]).file("finance/payments/proof/");
  assert.equal(JSON.stringify(page), JSON.stringify({ ok: false, status: 500, code: "", blob: null }));
});

test("a refusal also carries the backend's message and field messages as text (plan 7, section 5.1)", async () => {
  const body = { error: { code: "invalid_request", message: "Some values are missing or invalid.", fields: { mobile: ["Enter a valid Philippine mobile number."], contact: "cont_x", odd: 5 } } };
  const res = await client([400, body]).call("POST", "contacts/add/", {});
  assert.equal(res.message, "Some values are missing or invalid.");
  assert.deepEqual(JSON.parse(JSON.stringify(res.fields)), body.error.fields);
  assert.equal(JSON.stringify(res.data), "{}");
  const none = await client([404]).call("POST", "contacts/add/", {});
  assert.equal(none.message, "");
  assert.deepEqual(JSON.parse(JSON.stringify(none.fields)), {});
  const ok = await client([200, { a: 1 }]).call("POST", "contacts/status/");
  assert.equal(ok.message, "");
});
