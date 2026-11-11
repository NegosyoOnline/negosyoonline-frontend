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
