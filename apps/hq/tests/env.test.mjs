/* The staff app reads one address and holds no secret (design 21.2). Its CSP allows script, styles and the
   font from itself only, and calls to that one address only (design 21.1). */
import test from "node:test";
import assert from "node:assert/strict";
import { readEnv, buildCsp, configScript } from "../src/lib/hq-env.mjs";

test("with no variable set the address is the staging hq host", () => {
  const env = readEnv({});
  assert.equal(env.staffApi, "https://hq-staging.negosyonline.com/staff/v1");
  assert.equal(env.staffApiOrigin, "https://hq-staging.negosyonline.com");
});

test("a set address is used, trimmed, without its trailing slash", () => {
  const env = readEnv({ HQ_STAFF_API_BASE: " http://ggwp.negosyotest.com:8000/staff/v1/ " });
  assert.equal(env.staffApi, "http://ggwp.negosyotest.com:8000/staff/v1");
  assert.equal(env.staffApiOrigin, "http://ggwp.negosyotest.com:8000");
});

test("a value that is not an address stops the build", () => {
  assert.throws(() => readEnv({ HQ_STAFF_API_BASE: "hq-staging" }));
});

test("the CSP names the staff address and nothing from a third host", () => {
  const csp = buildCsp("https://hq-staging.negosyonline.com");
  assert.deepEqual(csp.split("; "), [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self'",
    "img-src 'self'",
    "connect-src https://hq-staging.negosyonline.com",
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
