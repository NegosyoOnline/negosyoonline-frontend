/* The staff app reads one address and holds no secret (design 21.2). Its CSP allows script, styles and the
   font from itself only, and calls to that one address only (design 21.1). */
import test from "node:test";
import assert from "node:assert/strict";
import { readEnv, buildCsp, configScript } from "../src/lib/hq-env.mjs";

test("with no variable set the address is the staging staff API host", () => {
  const env = readEnv({});
  assert.equal(env.staffApi, "https://hq-api-staging.negosyonline.com/staff/v1");
  assert.equal(env.staffApiOrigin, "https://hq-api-staging.negosyonline.com");
});

test("a set address is used, trimmed, without its trailing slash", () => {
  const env = readEnv({ HQ_STAFF_API_BASE: " http://ggwp.negosyotest.com:8000/staff/v1/ " });
  assert.equal(env.staffApi, "http://ggwp.negosyotest.com:8000/staff/v1");
  assert.equal(env.staffApiOrigin, "http://ggwp.negosyotest.com:8000");
});

test("a production build with no variable stops; with one set it uses it", () => {
  assert.throws(() => readEnv({ VERCEL_ENV: "production" }), /HQ_STAFF_API_BASE/);
  assert.throws(() => readEnv({ VERCEL_ENV: "production", HQ_STAFF_API_BASE: "  " }));
  const env = readEnv({ VERCEL_ENV: "production", HQ_STAFF_API_BASE: "https://hq-api.negosyonline.com/staff/v1/" });
  assert.equal(env.staffApi, "https://hq-api.negosyonline.com/staff/v1");
  assert.equal(readEnv({ VERCEL_ENV: "preview" }).staffApiOrigin, "https://hq-api-staging.negosyonline.com");
});

test("the CSP connect-src follows the default address", () => {
  const csp = buildCsp(readEnv({}).staffApiOrigin);
  assert.ok(csp.includes("connect-src https://hq-api-staging.negosyonline.com https://vercel.com;"));
});

test("a value that is not an address stops the build", () => {
  assert.throws(() => readEnv({ HQ_STAFF_API_BASE: "hq-staging" }));
});

test("the CSP names the staff address and nothing from a third host", () => {
  const csp = buildCsp("https://hq-api-staging.negosyonline.com");
  assert.deepEqual(csp.split("; "), [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self'",
    "img-src 'self' blob:",
    "connect-src https://hq-api-staging.negosyonline.com https://vercel.com",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ]);
  assert.equal(csp.includes("unsafe-inline"), false);
  assert.equal(csp.includes("fonts.g"), false);
});

test("the configuration script holds the one address and nothing else", () => {
  const script = configScript({ HQ_STAFF_API_BASE: "http://ggwp.negosyotest.com:8000/staff/v1" });
  const window = {};
  new Function("window", script)(window);
  assert.deepEqual(window.NO_HQ_CONFIG, { staffApi: "http://ggwp.negosyotest.com:8000/staff/v1" });
});
