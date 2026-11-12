/* The Content-Security-Policy blocks plugin content (object, embed, applet) with object-src 'none'. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const config = fs.readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
const csp = config.slice(config.indexOf("const csp = ["), config.indexOf('].join("; ")'));

test("the CSP contains object-src 'none'", () => {
  assert.match(csp, /"object-src 'none'"/);
});

test("the CSP still contains default-src 'self' and script-src 'self'", () => {
  assert.match(csp, /"default-src 'self'"/);
  assert.match(csp, /"script-src 'self'"/);
});
