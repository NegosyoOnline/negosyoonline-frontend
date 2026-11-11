import test from "node:test";
import assert from "node:assert/strict";
import {
  CHECKOUT, CHECKOUT_MAX_AGE, MEMBER, MEMBER_MAX_AGE, MEMBER_PRE, MEMBER_PRE_MAX_AGE, clearCookie, cookieName, isSecure,
  newToken, readCookie, readMemberCookie, sameOriginPost, setCookie,
} from "../src/lib/cookies.ts";

const TOKEN = "A".repeat(43);
const req = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers });

test("names and lifetimes are TWCinc's", () => {
  assert.equal(cookieName(MEMBER, true), "__Host-no_member");
  assert.equal(cookieName(MEMBER_PRE, true), "__Host-no_member_pre");
  assert.equal(cookieName(CHECKOUT, true), "__Host-no_checkout");
  assert.equal(cookieName(MEMBER, false), "no_member");
  assert.equal(MEMBER_MAX_AGE, 30 * 24 * 3600);
  assert.equal(MEMBER_PRE_MAX_AGE, 600);
  assert.equal(CHECKOUT_MAX_AGE, 7200);
});

test("https is read from x-forwarded-proto, then from the url", () => {
  assert.equal(isSecure(req("http://a.test/", { "x-forwarded-proto": "https" })), true);
  assert.equal(isSecure(req("https://a.test/")), true);
  assert.equal(isSecure(req("http://a.test/")), false);
});

test("a cookie is read by its exact name, once", () => {
  assert.equal(readCookie(`no_member=${TOKEN}; other=1`, "no_member"), TOKEN);
  assert.equal(readCookie(`xno_member=${TOKEN}`, "no_member"), "");
  assert.equal(readCookie(`no_member=${TOKEN}; no_member=${"B".repeat(43)}`, "no_member"), "", "a duplicate is refused");
  assert.equal(readCookie(`NO_MEMBER=${TOKEN}`, "no_member"), "");
  assert.equal(readCookie(null, "no_member"), "");
});

test("a value of the wrong shape reads as none", () => {
  assert.equal(readCookie("no_member=short", "no_member"), "");
  assert.equal(readCookie(`no_member=${"A".repeat(201)}`, "no_member"), "");
  assert.equal(readCookie(`no_member=${"A".repeat(20)}"; x`, "no_member"), "");
});

test("on https only the __Host- name counts; a plain one a sibling host set is ignored", () => {
  const r = req("https://a.test/", { cookie: `no_member=${TOKEN}` });
  assert.equal(readMemberCookie(r, MEMBER), "");
  assert.equal(readMemberCookie(req("https://a.test/", { cookie: `__Host-no_member=${TOKEN}` }), MEMBER), TOKEN);
  assert.equal(readMemberCookie(req("http://a.test/", { cookie: `no_member=${TOKEN}` }), MEMBER), TOKEN);
});

test("a minted cookie is host-only, HttpOnly, SameSite=Lax, Path=/, and Secure on https", () => {
  const https = new Response(null);
  setCookie(https, req("https://a.test/"), MEMBER, TOKEN, MEMBER_MAX_AGE);
  const header = https.headers.get("set-cookie")!;
  assert.equal(header, `__Host-no_member=${TOKEN}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax; Secure`);
  assert.ok(!/domain/i.test(header));
  const http = new Response(null);
  setCookie(http, req("http://a.test/"), MEMBER_PRE, TOKEN, MEMBER_PRE_MAX_AGE);
  assert.equal(http.headers.get("set-cookie"), `no_member_pre=${TOKEN}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax`);
  const gone = new Response(null);
  clearCookie(gone, req("https://a.test/"), MEMBER);
  assert.equal(gone.headers.get("set-cookie"), "__Host-no_member=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure");
});

test("a new token has the shape Django accepts, and is never the same twice", () => {
  const a = newToken();
  assert.match(a, /^[A-Za-z0-9_-]{16,200}$/);
  assert.notEqual(a, newToken());
});

test("a post is accepted only from the same host", () => {
  const h = (headers: Record<string, string>) => req("http://a.test/", headers);
  assert.equal(sameOriginPost(h({ "sec-fetch-site": "same-origin" }), "a.test"), true);
  assert.equal(sameOriginPost(h({ "sec-fetch-site": "cross-site" }), "a.test"), false);
  assert.equal(sameOriginPost(h({ "sec-fetch-site": "same-site" }), "a.test"), false);
  assert.equal(sameOriginPost(h({ origin: "http://a.test" }), "a.test"), true);
  assert.equal(sameOriginPost(h({ origin: "http://evil.test" }), "a.test"), false);
  assert.equal(sameOriginPost(h({ origin: "null" }), "a.test"), false);
  assert.equal(sameOriginPost(h({}), "a.test"), false, "neither header: refused");
  assert.equal(sameOriginPost(h({ "sec-fetch-site": "same-origin", origin: "http://evil.test" }), "a.test"), false);
});
