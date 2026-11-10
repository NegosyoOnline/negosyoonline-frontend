import test from "node:test";
import assert from "node:assert/strict";
import { load, answer } from "./load.mjs";

const CFG = { apiBase: "http://api.test/v1", siteUrl: "http://www.test", dashUrl: "http://dash.test" };

test("an API error is flattened to code, message and one string per field", async () => {
  const body = { error: { code: "invalid_request", message: "Some values are missing or invalid.",
    fields: { email: ["Enter a valid email address."] } } };
  const { window } = load(["api.js"], { config: CFG, fetch: answer(400, body) });
  const res = await window.NOApi.call("POST", "/auth/email-code/request/", { email: "x" });
  assert.equal(res.ok, false);
  assert.equal(res.data.code, "invalid_request");
  assert.equal(res.data.fields.email, "Enter a valid email address.");
});

test("a 204 resolves ok with an empty object", async () => {
  const { window } = load(["api.js"], { config: CFG, fetch: answer(204) });
  const res = await window.NOApi.call("POST", "/auth/email-code/request/", { email: "a@b.co" });
  assert.equal(res.ok, true);
  assert.deepEqual({ ...res.data }, {}); /* spread: the object comes from the script's own realm */
});

test("no Authorization header and no token helpers", async () => {
  const { window, calls } = load(["api.js"], { config: CFG, fetch: answer(200, {}) });
  await window.NOApi.call("POST", "/auth/email-code/verify/", { email: "a@b.co", code: "123456" }, false, true);
  assert.equal(calls[0].opts.credentials, "include");
  assert.equal(calls[0].opts.headers.Authorization, undefined);
  assert.equal(window.NOApi.getToken, undefined);
  assert.equal(window.NOApi.setToken, undefined);
});

test("the Google link carries accept_policies only when signing up", () => {
  const { window } = load(["api.js"], { config: CFG, fetch: answer(200, {}) });
  assert.equal(window.NOApi.googleStartUrl("signup"), "http://api.test/v1/auth/google/start/?accept_policies=true");
  assert.equal(window.NOApi.googleStartUrl("signin"), "http://api.test/v1/auth/google/start/");
});

test("each Google failure code has a message, and an unknown code gets the default", () => {
  const { window } = load(["api.js"], { config: CFG, fetch: answer(200, {}) });
  const m = window.NOApi.socialErrorMessage;
  assert.equal(m("google_state_invalid"), "That sign-in session expired. Please try again.");
  assert.equal(m("google_cancelled"), "Sign-in was cancelled. You can try again or use an email code.");
  assert.equal(m("google_failed"), "We could not complete that sign-in. Please try again.");
  assert.equal(m("policies_required"), "We could not find an account for that sign-in. Create your account to start your free trial.");
  assert.equal(m("account_closed"), "This account is not active. Please contact support.");
  assert.equal(m("google_email_unverified"), "We could not complete that sign-in. Please try again.");
  assert.equal(m("google_account_mismatch"), "An account with that email already exists. Sign in with an email code instead.");
  assert.equal(m("something_else"), "We could not complete that sign-in. Please try again.");
});

test("the Google button is drawn only when the environment switches it on", async () => {
  const box = { textContent: "x", children: [], appendChild(n) { this.children.push(n); } };
  const off = load(["api.js"], { config: CFG, fetch: answer(200, {}) });
  assert.equal(await off.window.NOApi.socialButtons(box, () => "signup"), 0);
  assert.equal(box.children.length, 0);
  assert.equal(off.calls.length, 0);
});
