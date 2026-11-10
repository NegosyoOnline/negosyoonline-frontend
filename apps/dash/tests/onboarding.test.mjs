import test from "node:test";
import assert from "node:assert/strict";
import { load, answer } from "./load.mjs";

/* The stubbed fetch answers 401 to the /me/ read dashboard.js makes when it loads, so the page never starts
   and only the exported helpers are exercised. */
const { window } = load(["app.js", "dashboard.js"], { config: { apiBase: "http://api.test/v1", siteUrl: "http://www.test" },
  fetch: answer(401, { error: { code: "unauthenticated", message: "Sign in to continue." } }) });
const U = window.NOOnboarding.util, ID = "site_0123456789abcdefghjk";
const ok = (data) => ({ ok: true, status: 200, data });
/* Objects made by the scripts come from their own realm, so they are compared as JSON. */
const plain = (v) => JSON.parse(JSON.stringify(v));

test("setup states route with a string site id", () => {
  assert.equal(U.setupView(ok({ state: "not_started" })), "not_started");
  assert.equal(U.setupView(ok({ state: "in_progress", first_site: { id: ID } })), "step3");
  assert.equal(U.setupView(ok({ state: "in_progress", minimum_completed_at: "2026-11-10T08:00:00+08:00", first_site: { id: ID } })), "complete");
  assert.equal(U.setupView(ok({ state: "minimum_complete" })), "complete");
  assert.equal(U.setupView(ok({ state: "blocked", blocked_reason: "first_site_removed" })), "b3");
  assert.equal(U.setupView(ok({ state: "blocked", blocked_reason: "owner_email_unverified" })), "today");
});

test("step 2 opens from the setup answer alone", () => {
  assert.equal(U.step2Slot({ can_create_site: true }), "step2");
  assert.equal(U.step2Slot({ can_create_site: false }), "reread");
  assert.equal(U.suffixOf({ site_host_suffix: "negosyotest.com" }), ".negosyotest.com");
});

test("the create body is Sante and exactly three keys", () => {
  assert.deepEqual(plain(U.createBody(" Ana's Store ", " Anas-Store ")), { template: "sante", subdomain: "anas-store", display_name: "Ana's Store" });
});

test("create outcomes follow the new codes", () => {
  assert.equal(U.createOutcome({ status: 201, data: { id: ID, subdomain: "anas-store" } }).kind, "created");
  assert.equal(U.createOutcome({ status: 409, data: { code: "subdomain_taken", fields: { subdomain: "Taken." } } }).text, "Taken.");
  assert.equal(U.createOutcome({ status: 400, data: { code: "subdomain_reserved", fields: { subdomain: "Reserved." } } }).field, "subdomain");
  assert.equal(U.createOutcome({ status: 409, data: { code: "site_limit_reached" } }).kind, "already");
  assert.equal(U.createOutcome({ status: 409, data: { code: "first_site_removed" } }).kind, "reread");
  assert.equal(U.createOutcome({ status: 409, data: { code: "subscription_inactive", message: "x" } }).kind, "alert");
  assert.equal(U.createOutcome({ status: 403, data: { code: "email_not_verified", message: "Confirm your email to continue." } }).text, "Confirm your email to continue.");
});

test("a refused save shows field errors, and a missing site re-reads the setup", () => {
  assert.equal(U.saveOutcome({ status: 200, data: {} }).kind, "saved");
  assert.equal(U.saveOutcome({ status: 400, data: { code: "invalid_request", fields: { contact_mobile: "Enter a valid Philippine mobile number." } } }).kind, "fields");
  assert.equal(U.saveOutcome({ status: 404, data: { code: "not_found" } }).kind, "reread");
  assert.equal(U.saveOutcome({ status: 403, data: { code: "billing_only", message: "No." } }).kind, "alert");
});

test("step 3 is prefilled from top-level site keys", () => {
  assert.deepEqual(plain(U.prefill({ business_name: "Ana Trading", contact_email: "a@b.co", contact_mobile: "+639171234567" }, { display_name: "Ana's Store", subdomain: "anas-store" })),
    { business_name: "Ana Trading", contact_email: "a@b.co", contact_mobile: "+639171234567" });
});

test("a live site counts as the second step done", () => {
  assert.equal(U.countOf({ first_site: { id: ID, deleted: false } }), 2);
  assert.equal(U.countOf({ first_site: null }), 1);
});
