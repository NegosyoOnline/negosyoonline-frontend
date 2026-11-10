import test from "node:test";
import assert from "node:assert/strict";
import { load, answer } from "./load.mjs";

const CFG = { apiBase: "http://api.test/v1", siteUrl: "http://www.test" };
/* Objects made by the scripts come from their own realm, so they are compared as JSON. */
const plain = (v) => JSON.parse(JSON.stringify(v));

test("every call sends the cookie and no Authorization header", async () => {
  const { window, calls } = load(["app.js"], { config: CFG, fetch: answer(200, {}) });
  await window.NODash.call("GET", "/me/", null, true);
  assert.equal(calls[0].url, "http://api.test/v1/me/");
  assert.equal(calls[0].opts.credentials, "include");
  assert.equal((calls[0].opts.headers || {}).Authorization, undefined);
  assert.equal((calls[0].opts.headers || {})["Content-Type"], undefined);
});

test("a body is sent as JSON", async () => {
  const { window, calls } = load(["app.js"], { config: CFG, fetch: answer(200, {}) });
  await window.NODash.call("PATCH", "/sites/site_x/", { contact_email: "a@b.co" }, true);
  assert.equal(calls[0].opts.headers["Content-Type"], "application/json");
  assert.equal(calls[0].opts.body, '{"contact_email":"a@b.co"}');
});

test("a multipart send carries the cookie and no Authorization header", async () => {
  const { window, calls } = load(["app.js"], { config: CFG, fetch: answer(200, {}) });
  await window.NODash.send("POST", "/upload/", "form");
  assert.equal(calls[0].opts.credentials, "include");
  assert.equal(calls[0].opts.headers, undefined);
});

test("a 401 leaves for the public site's sign-in popup", async () => {
  const body = { error: { code: "unauthenticated", message: "Sign in to continue." } };
  const { window, location } = load(["app.js"], { config: CFG, fetch: answer(401, body) });
  const res = await window.NODash.call("GET", "/me/", null, true);
  assert.equal(res.status, 401);
  assert.equal(location.replaced, "http://www.test/?signin=1");
});

test("nothing is stored: there are no token helpers", () => {
  const { window } = load(["app.js"], { config: CFG, fetch: answer(200, {}) });
  assert.equal(window.NODash.getToken, undefined);
  assert.equal(window.NODash.setToken, undefined);
});

test("errors are flattened with one string per field", async () => {
  const body = { error: { code: "subdomain_taken", message: "That name is already taken. Please choose another.",
    fields: { subdomain: ["That name is already taken. Please choose another."] } } };
  const { window } = load(["app.js"], { config: CFG, fetch: answer(409, body) });
  const res = await window.NODash.call("POST", "/sites/", {}, true);
  assert.equal(res.data.code, "subdomain_taken");
  assert.equal(res.data.fields.subdomain, "That name is already taken. Please choose another.");
});

test("the site list and the ?site= choice use opaque ids", () => {
  const { window } = load(["app.js"], { config: CFG, fetch: answer(200, {}) });
  const D = window.NODash, a = "site_0123456789abcdefghjk", b = "site_zzzzzzzzzzzzzzzzzzzz";
  assert.deepEqual(plain(D.sitesOf({ ok: true, data: { items: [{ id: a }], next_cursor: null } })), [{ id: a }]);
  assert.deepEqual(plain(D.sitesOf({ ok: false, data: {} })), []);
  assert.equal(D.siteFromQuery([a, b], "?site=" + b), b);
  assert.equal(D.siteFromQuery([a, b], "?site=7"), a);
  assert.equal(D.siteFromQuery([a], "?site=" + b), a);
  assert.equal(D.siteFromQuery([a, b], ""), a);
});

test("/me/ is adapted to the keys the screens read", () => {
  const { window } = load(["app.js"], { config: CFG, fetch: answer(200, {}) });
  const v = window.NODash.accountView({ account: { id: "acc_1", email: "ana@example.com", name: "Ana Maria Cruz",
    email_verified: true, created_at: "2026-11-10T08:00:00+08:00" } });
  assert.equal(v.first_name, "Ana");
  assert.equal(v.last_name, "Maria Cruz");
  assert.equal(v.name, "Ana Maria Cruz");
  assert.equal(v.email_verified, true);
  assert.equal(window.NODash.accountView({ account: { email: "x@y.co", name: "" } }).first_name, "");
});

test("initials are the first letters of the first and last word, else the email's first letter", () => {
  const { window } = load(["app.js"], { config: CFG, fetch: answer(200, {}) });
  const D = window.NODash, view = (name, email) => D.accountView({ account: { name, email } });
  assert.equal(D.initials(view("Ana Maria Cruz", "x@y.co")), "AC");
  assert.equal(D.initials(view("Ana", "x@y.co")), "A");
  assert.equal(D.initials(view("", "x@y.co")), "X");
});
