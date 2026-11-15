/* The member Media Library (ClickUp z8uq9mezdk): the page, its filters, "Load 12 more", the escaping, the file-address rule and
   the video-preview policy. The Django answers are faked with the backend's shapes (apps/media_library/api.py). */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { mediaPage } from "../src/lib/media-flow.ts";
import { clock, filtersOf, hrefFor } from "../src/views/sante/media.ts";
import nextConfig from "../next.config.ts";
import { SITE } from "./site.ts";

const secret = randomBytes(24).toString("hex"); // throwaway, made for this run only
const env = { apiBase: "http://api.test", secret, hostAliases: {} } as unknown as import("../src/lib/env.ts").StorefrontEnv;
const TOKEN = "M".repeat(43);

type Reply = { status: number; body: unknown };
function fake(replies: Record<string, Reply[]>) {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const fetchImpl = (url: string, init: RequestInit) => {
    const route = url.replace("http://api.test/storefront/v1/", "").replace(/\/(\?.*)?$/, "");
    calls.push({ path: route, body: init.body === undefined ? {} : JSON.parse(String(init.body)) });
    const next = (replies[route] ?? []).shift();
    if (!next) throw new Error(`unexpected call: ${route}`);
    return Promise.resolve(Response.json(next.body, { status: next.status }));
  };
  return { calls, fetchImpl };
}
function dashOf(f: ReturnType<typeof fake>, query = "", token = TOKEN) {
  const request = new Request(`http://www.santetest.com/dashboard/media/${query}`);
  return {
    site: SITE, now: new Date("2026-11-14T00:00:00Z"), appUrl: "",
    call: { request, host: "demo.negosyotest.com", visitor_ip: "", member_token: token, binding: "", env },
    calls: { env, fetchImpl: f.fetchImpl, log: () => {} },
  };
}
const ok = (body: unknown): Reply => ({ status: 200, body });
const err = (status: number, code = "x"): Reply => ({ status, body: { error: { code, message: "x" } } });
const ME = ok({ member: { id: "m1", full_name: "Juan Dela Cruz", email: "j@example.test", mobile: "+639171234567", email_verified: true, mobile_verified: true } });
const FREE = ok({ pack: null, registration: null });
const LOCKED = ok({ pack: { order_number: "SP-1", payment_status: "rejected", payment_label: "Needs attention", method_label: "Bank transfer", price_centavos: 100, tone: "att", benefits_off: true, proofs: [],
  lock: { reason_label: "Amount does not match", other_text: "", resubmitted: false, accounts: [] } }, registration: null });
const BLOB = "https://abc123.public.blob.vercel-storage.com/media-library";

const A = (id: string, over: Record<string, unknown> = {}) => ({
  id, title: `Asset ${id}`, asset_type: "image", category: "promo", category_label: "Product Promo", product_category: "barley", product_category_label: "Barley",
  crop_ratio: "4:5", caption: `Caption ${id}`, file_url: `${BLOB}/${id}/a.jpg`, thumb_url: `${BLOB}/${id}/a.jpg`, poster_url: null, width: 800, height: 1000, file_size: 1000,
  duration_seconds: 0, published_at: "2026-11-13T00:00:00Z", is_new: false, ...over,
});
const OPTIONS = {
  type: [{ value: "image", label: "Image", count: 14 }, { value: "video", label: "Video", count: 1 }],
  category: [{ value: "promo", label: "Product Promo", count: 10 }, { value: "ad", label: "Ad Creative", count: 3 }, { value: "page", label: "Page Post", count: 2 }],
  product_category: [{ value: "barley", label: "Barley", count: 8 }, { value: "drinks", label: "Drinks", count: 2 }],
};
const PAGE = (items: unknown[], over: Record<string, unknown> = {}) => ok({ items, count: items.length, offset: 0, limit: 12, next_offset: null, options: OPTIONS, ...over });
const base = (media: Reply[]) => ({ "member/me": [ME], "member/pack": [FREE], "member/media": media });
const text = (r: Response) => r.text();

test("the page lists the assets with Copy caption and Download, the filter rail with counts, search and sort, and no Source filter", async () => {
  const f = fake(base([PAGE([A("a1"), A("v1", { asset_type: "video", file_url: `${BLOB}/v1/x.mp4`, thumb_url: `${BLOB}/v1/p.jpg`, poster_url: `${BLOB}/v1/p.jpg`, duration_seconds: 65, is_new: true, crop_ratio: "9:16" })])]));
  const r = await mediaPage(dashOf(f));
  assert.equal(r.status, 200);
  const body = await text(r);
  assert.match(body, /<h1>Media Library<\/h1>/);
  assert.match(body, /data-md-page="media"/);
  assert.match(body, /class="pd md-plain tr-page ml-page"/);
  assert.match(body, /<header class="tr-ph"><h1>Media Library<\/h1>/);
  for (const label of ["Type", "Category", "Product"]) assert.match(body, new RegExp(`<legend>${label}</legend>`));
  assert.doesNotMatch(body, /Source/);
  assert.match(body, /<span>Barley<\/span><em>8<\/em>/);
  assert.match(body, /name="search"/);
  assert.match(body, /<option value="oldest">Oldest<\/option>/);
  assert.match(body, /2 items/);
  assert.equal((body.match(/class="tr-card ml-card"/g) ?? []).length, 2);
  assert.match(body, /data-ml-copy data-caption="Caption a1">Copy caption<\/button>/);
  assert.match(body, /href="https:\/\/abc123\.public\.blob\.vercel-storage\.com\/media-library\/a1\/a\.jpg\?download=1"/);
  assert.match(body, /1:05/);
  assert.match(body, /ml-play/);
  assert.match(body, /ml-r916/);
  assert.match(body, /js\/pack-media\.js\?v=[0-9a-f]{8}/);
  assert.match(body, /css\/pack-media\.css\?v=[0-9a-f]{8}/);
  assert.doesNotMatch(body, /<script(?![^>]*\ssrc=)/);
  assert.deepEqual(f.calls.filter((c) => c.path === "member/media").map((c) => c.body), [{ host: "demo.negosyotest.com", token: TOKEN, sort: "newest", offset: 0 }]);
});

test("Django text is escaped, a file outside the media store is neither shown nor linked, and the calls carry no private address", async () => {
  const f = fake(base([PAGE([A("a1", { title: "<script>x</script>", caption: "\"><img src=x onerror=y>", file_url: "https://evil.example.test/a.jpg", thumb_url: "https://evil.example.test/a.jpg", category_label: "<b>Promo</b>" })])]));
  const body = await text(await mediaPage(dashOf(f)));
  assert.doesNotMatch(body, /<script>x/);
  assert.match(body, /&lt;script&gt;x&lt;\/script&gt;/);
  assert.doesNotMatch(body, /<img src=x/);
  assert.doesNotMatch(body, /evil\.example\.test/);
  assert.doesNotMatch(body, /data-ml-open/);
  assert.doesNotMatch(body, /Download/);
});

test("the filters in the address are cleaned, sent to Django, and shown selected; an unknown value becomes All", async () => {
  const f = fake(base([PAGE([A("a1")])]));
  const body = await text(await mediaPage(dashOf(f, "?type=video&category=bogus&product_category=drinks&sort=oldest&search=%20barley%20%20promo%20")));
  assert.deepEqual(f.calls.find((c) => c.path === "member/media")!.body, { host: "demo.negosyotest.com", token: TOKEN, type: "video", product_category: "drinks", search: "barley promo", sort: "oldest", offset: 0 });
  assert.match(body, /name="type" value="video" checked/);
  assert.match(body, /name="category" value="" checked/);
  assert.match(body, /<option value="oldest" selected>/);
  assert.match(body, /value="barley promo"/);
  assert.match(body, /Clear filters/);
  assert.deepEqual(filtersOf(new URLSearchParams("search=" + "x".repeat(300))).search.length, 100);
  assert.equal(hrefFor({ type: "image", category: "", product_category: "", search: "a b", sort: "newest" }, 24), "/dashboard/media/?type=image&search=a+b&shown=24");
});

test("Load 12 more: a link with a larger shown; shown=24 reads two pages and lists both; the fragment reads one page at the offset", async () => {
  const first = Array.from({ length: 12 }, (_, i) => A(`a${i}`));
  const second = Array.from({ length: 12 }, (_, i) => A(`b${i}`));
  const one = fake(base([PAGE(first, { count: 30, next_offset: 12 })]));
  const body = await text(await mediaPage(dashOf(one)));
  assert.match(body, /Showing 12 of 30 items/);
  assert.match(body, /<a class="tr-btn tr-btn-go ml-btn ml-btn-go ml-more" href="\/dashboard\/media\/\?shown=24" data-ml-more data-next="12">Load 12 more<\/a>/);

  const two = fake(base([PAGE(first, { count: 30, next_offset: 12 }), PAGE(second, { count: 30, offset: 12, next_offset: 24 })]));
  const body2 = await text(await mediaPage(dashOf(two, "?shown=24")));
  assert.equal((body2.match(/class="tr-card ml-card"/g) ?? []).length, 24);
  assert.deepEqual(two.calls.filter((c) => c.path === "member/media").map((c) => c.body.offset).sort(), [0, 12]);
  assert.match(body2, /shown=36/);

  const frag = fake(base([PAGE(second, { count: 30, offset: 12, next_offset: 24 })]));
  const piece = await text(await mediaPage(dashOf(frag, "?fragment=1&offset=12")));
  assert.match(piece, /^<div data-ml-frag data-shown="24" data-count="30"/);
  assert.equal(frag.calls.find((c) => c.path === "member/media")!.body.offset, 12);
  assert.doesNotMatch(piece, /<html/);

  const last = fake(base([PAGE(first.slice(0, 6), { count: 30, offset: 24, next_offset: null })]));
  assert.doesNotMatch(await text(await mediaPage(dashOf(last, "?fragment=1&offset=24"))), /data-ml-more/);
});

test("empty states: no media at all, and no match for a filter", async () => {
  const none = { type: [], category: [], product_category: [] };
  const a = await text(await mediaPage(dashOf(fake(base([PAGE([], { options: none })])))));
  assert.match(a, /No media yet\./);
  const b = await text(await mediaPage(dashOf(fake(base([PAGE([])])), "?type=video")));
  assert.match(b, /No media matches these filters\./);
});

test("signed out, a dead session, a rejected order, an unavailable site and a failed read", async () => {
  assert.equal((await mediaPage(dashOf(fake({}), "", ""))).headers.get("location"), "/");
  assert.equal((await mediaPage(dashOf(fake({ "member/me": [err(401, "member_session_invalid")] })))).headers.get("location"), "/");
  assert.equal((await mediaPage(dashOf(fake({ "member/me": [ME], "member/pack": [LOCKED] })))).headers.get("location"), "/dashboard/purchases/");
  assert.equal((await mediaPage(dashOf(fake(base([err(404)]))))).status, 404);
  assert.equal((await mediaPage(dashOf(fake(base([err(401, "member_session_invalid")]))))).headers.get("location"), "/");
  const down = await mediaPage(dashOf(fake(base([{ status: 500, body: {} }]))));
  assert.notEqual(down.status, 200);
  const odd = await mediaPage(dashOf(fake(base([ok({ items: "x" })]))));
  assert.notEqual(odd.status, 200);
});

test("an asset the page cannot draw is left out", async () => {
  const body = await text(await mediaPage(dashOf(fake(base([PAGE([A("a1"), { id: "", title: "x" }, { id: "z", title: "z", asset_type: "pdf" }])])))));
  assert.equal((body.match(/class="tr-card ml-card"/g) ?? []).length, 1);
});

test("clock writes minutes and seconds", () => {
  assert.equal(clock(0), "");
  assert.equal(clock(65), "1:05");
  assert.equal(clock(600), "10:00");
});

test("only the Media Library page may load a video, from the media store only; every other path keeps the strict policy", async () => {
  type Rule = { source: string; headers: { key: string; value: string }[] };
  const { pathToRegexp } = createRequire(import.meta.url)("next/dist/compiled/path-to-regexp") as { pathToRegexp: (s: string) => RegExp };
  const rules = (await nextConfig.headers!()) as Rule[];
  const policyFor = (path: string) => rules.filter((r) => r.headers.some((h) => h.key === "Content-Security-Policy")).filter((r) => pathToRegexp(r.source).test(path))
    .map((r) => r.headers.find((h) => h.key === "Content-Security-Policy")!.value);
  for (const path of ["/dashboard/media/", "/dashboard/media"]) {
    const hit = policyFor(path);
    assert.equal(hit.length, 1, path);
    assert.match(hit[0], /media-src https:\/\/\*\.public\.blob\.vercel-storage\.com(;|$)/, path);
    assert.match(hit[0], /script-src 'self'(;|$)/);
    assert.match(hit[0], /connect-src 'self'(;|$)/);
  }
  for (const path of ["/dashboard/", "/dashboard/training/", "/dashboard/media/x/", "/products/"]) {
    const hit = policyFor(path);
    assert.equal(hit.length, 1, path);
    assert.doesNotMatch(hit[0], /media-src/, path);
  }
});

test("the preview dialog is centred and capped to the viewport so it fits a phone", () => {
  const css = readFileSync(new URL("../public/assets/sante/css/pack-media.css", import.meta.url), "utf8");
  const rule = /^\.ml-dialog \{([^}]*)\}/m.exec(css)?.[1] ?? "";
  assert.match(rule, /margin:\s*auto/);
  assert.match(rule, /width:\s*min\(920px,\s*calc\(100vw - 32px\)\)/);
  assert.match(rule, /max-height:\s*calc\(100dvh - 32px\)/);
});

test("on a phone the Filters drawer and its scrim sit above the sticky site header (z-index 100)", () => {
  const css = readFileSync(new URL("../public/assets/sante/css/pack-media.css", import.meta.url), "utf8");
  const shell = readFileSync(new URL("../public/assets/sante/css/pack-dashboard-shell.css", import.meta.url), "utf8");
  const header = Number(/position: sticky; top: 0; z-index: (\d+)/.exec(shell)?.[1]);
  const mobile = css.slice(css.indexOf("@media (max-width: 819px)"));
  const rail = Number(/\.ml-rail \{[^}]*position: fixed; z-index: (\d+)/.exec(mobile)?.[1]);
  const scrim = Number(/\.ml-scrim \{[^}]*z-index: (\d+)/.exec(css)?.[1]);
  assert.ok(header >= 100);
  assert.ok(scrim > header, "the scrim covers the header");
  assert.ok(rail > scrim, "the drawer is over the scrim");
});
