/* The Strict-Transport-Security header is max-age only; includeSubDomains and preload stay deferred (CLAUDE.md). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const config = fs.readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");

test("Strict-Transport-Security is exactly max-age=63072000", () => {
  const values = [...config.matchAll(/key: "Strict-Transport-Security", value: "([^"]*)"/g)].map((m) => m[1]);
  assert.ok(values.length >= 1);
  for (const value of values) assert.equal(value, "max-age=63072000");
});

test("Strict-Transport-Security has no includeSubDomains and no preload", () => {
  assert.doesNotMatch(config, /includeSubDomains/i);
  assert.doesNotMatch(config, /preload/i);
});
