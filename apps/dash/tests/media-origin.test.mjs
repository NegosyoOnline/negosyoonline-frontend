/* The dash CSP image host comes from SITE_MEDIA_ORIGIN; unset keeps the staging store (production notes, ClickUp z8uq9mhbeq). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { readMediaOrigin, DEFAULT_MEDIA_ORIGIN } from "../src/lib/site-env.ts";

test("unset or blank keeps the staging store", () => {
  assert.equal(DEFAULT_MEDIA_ORIGIN, "https://pemdcws76uzmwk7c.public.blob.vercel-storage.com");
  assert.equal(readMediaOrigin(undefined), DEFAULT_MEDIA_ORIGIN);
  assert.equal(readMediaOrigin("  "), DEFAULT_MEDIA_ORIGIN);
});

test("a production store origin is accepted, trimmed, without a trailing slash", () => {
  assert.equal(readMediaOrigin(" https://prodstore1.public.blob.vercel-storage.com/ "), "https://prodstore1.public.blob.vercel-storage.com");
});

test("anything that is not a bare public Blob https origin fails", () => {
  for (const bad of ["http://a.public.blob.vercel-storage.com", "https://evil.example.com", "https://a.public.blob.vercel-storage.com/x", "https://a.public.blob.vercel-storage.com.evil.com", "https://*.public.blob.vercel-storage.com", "a.public.blob.vercel-storage.com"]) {
    assert.throws(() => readMediaOrigin(bad), /SITE_MEDIA_ORIGIN/, bad);
  }
});

test("next.config.ts uses the configured origin and keeps no hard-coded store", () => {
  const config = fs.readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
  assert.match(config, /mediaOrigin \} from "\.\/src\/lib\/site-env"/);
  assert.doesNotMatch(config, /public\.blob\.vercel-storage\.com/);
});
