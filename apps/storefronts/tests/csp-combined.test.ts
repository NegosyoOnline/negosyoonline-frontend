import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import nextConfig from "../next.config.ts";

/* The Meta Pixel pages (home, landing, checkout, onboarding verify) and the Media Library each widen the policy on their own path;
   neither widening leaks onto the other, and neither path falls through to the default rule. */
type Rule = { source: string; headers: { key: string; value: string }[] };
const { pathToRegexp } = createRequire(import.meta.url)("next/dist/compiled/path-to-regexp") as { pathToRegexp: (s: string) => RegExp };
const VERIFY = "/funnel/membership-pack/onboarding/verify";

async function matching(path: string) {
  const rules = (await nextConfig.headers!()) as Rule[];
  return rules.filter((r) => r.headers.some((h) => h.key === "Content-Security-Policy")).filter((r) => pathToRegexp(r.source).test(path));
}
const cspOf = (r: Rule) => r.headers.find((h) => h.key === "Content-Security-Policy")!.value;

test("the onboarding verify page gets the Pixel policy (Pixel hosts, no media-src) and misses the default rule", async () => {
  for (const path of [`${VERIFY}/`, VERIFY]) {
    const hit = await matching(path);
    assert.equal(hit.length, 1, `${path}: one policy only`);
    assert.equal(hit[0].source.startsWith("/:path("), false, `${path}: not the default rule`);
    const csp = cspOf(hit[0]);
    assert.match(csp, /script-src 'self' https:\/\/connect\.facebook\.net(;|$)/);
    assert.match(csp, /img-src [^;]*https:\/\/www\.facebook\.com/);
    assert.match(csp, /connect-src 'self' https:\/\/www\.facebook\.com https:\/\/connect\.facebook\.net(;|$)/);
    assert.doesNotMatch(csp, /media-src/);
  }
});

test("the Media Library gets the media policy (media-src, no Pixel hosts) and misses the default rule", async () => {
  for (const path of ["/dashboard/media/", "/dashboard/media"]) {
    const hit = await matching(path);
    assert.equal(hit.length, 1, `${path}: one policy only`);
    assert.equal(hit[0].source.startsWith("/:path("), false, `${path}: not the default rule`);
    const csp = cspOf(hit[0]);
    assert.match(csp, /media-src https:\/\/\*\.public\.blob\.vercel-storage\.com(;|$)/);
    assert.doesNotMatch(csp, /facebook\.com/);
    assert.match(csp, /script-src 'self'(;|$)/);
  }
});

test("the default rule excludes the verify page and the Media Library but still covers their neighbours", async () => {
  const rules = (await nextConfig.headers!()) as Rule[];
  const def = rules.find((r) => r.source.startsWith("/:path("))!;
  const re = pathToRegexp(def.source);
  for (const path of [`${VERIFY}/`, VERIFY, "/dashboard/media/", "/dashboard/media", "/", "/funnel/membership-pack/checkout/", "/funnel/membership-pack/landing-page/", "/dashboard/training/lesson/1/"]) {
    assert.equal(re.test(path), false, path);
  }
  for (const path of [`${VERIFY}/x`, "/dashboard/media/x/", "/dashboard/", "/products/"]) {
    assert.equal(re.test(path), true, path);
  }
});
