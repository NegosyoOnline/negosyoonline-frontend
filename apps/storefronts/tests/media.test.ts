/* The member Media Library (ClickUp z8uq9mezdk): the page, its filters, "Load 12 more", the escaping, the file-address rule and
   the video-preview policy. The Django answers are faked with the backend's shapes (apps/media_library/api.py). */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { mediaPage } from "../src/lib/media-flow.ts";
import { MAX_SHOWN, PAGE_SIZE, clock, fileLine, filtersOf, hrefFor, sizeText } from "../src/views/sante/media.ts";
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
  assert.match(body, /<header class="tr-ph ml-head"><p class="ml-eyebrow">Promotion materials<\/p><h1>Media Library<\/h1><p>Ready-to-post photos and videos for promoting Santé\.<\/p>/);
  assert.match(body, /data-md-page="media"/);
  assert.match(body, /class="pd md-plain tr-page ml-page"/);
  assert.match(body, /<div class="ml-rail-head"><h2>Filters<\/h2>/);
  for (const label of ["Type", "Category", "Product"]) assert.match(body, new RegExp(`<legend>${label}</legend>`));
  assert.doesNotMatch(body, /Source/);
  for (const t of ["All types", "Images", "Videos", "All categories"]) assert.match(body, new RegExp(`<span>${t}</span>`));
  assert.match(body, /<label class="ml-chip"><input type="radio" name="type" value="" checked><svg[^>]*>.*?<\/svg><span>All types<\/span><\/label>/);
  assert.match(body, /<span>Barley<\/span><em>8<\/em>/);
  assert.match(body, /&times; Clear all filters<\/a>/);
  assert.match(body, /name="search"[^>]*placeholder="Search materials/);
  assert.match(body, /<option value="newest" selected>Newest first<\/option>/);
  assert.match(body, /<option value="oldest">Oldest first<\/option>/);
  assert.match(body, /<b>2<\/b> assets/);
  assert.equal((body.match(/class="ml-card"/g) ?? []).length, 2);
  assert.match(body, /<p class="ml-cat">Product Promo<\/p>\s*<h3 class="ml-name">Asset a1<\/h3>/);
  assert.match(body, /<p class="ml-meta">JPG · Image · 800 × 1000 \(4:5\) · 1 KB<\/p>/);
  assert.match(body, /<p class="ml-meta">MP4 · Video · 1:05 · 1 KB<\/p>/);
  assert.match(body, /data-ml-copy data-caption="Caption a1"><svg[^>]*>.*?<\/svg><span class="ml-act-t"><span class="ml-t-copy">Copy caption<\/span><span class="ml-t-ok" aria-hidden="true">Copied<\/span><span class="ml-t-fail" aria-hidden="true">Copy failed<\/span><\/span><\/button>/);
  assert.match(body, /<a class="ml-act ml-act-go" href="https:\/\/abc123\.public\.blob\.vercel-storage\.com\/media-library\/a1\/a\.jpg\?download=1"[^>]*><svg[^>]*>.*?<\/svg><span class="ml-act-t">Download<\/span>/);
  assert.match(body, /<span class="ml-len">1:05<\/span>/);
  assert.match(body, /ml-play/);
  assert.doesNotMatch(body, /ml-r(45|11|916|169)/);
  assert.doesNotMatch(body, /<h3[^>]*(tabindex|href)/);
  assert.match(body, /<select name="sort" aria-label="Sort" data-pk-select data-pk-select-nofilter>/);
  assert.match(body, /js\/pack-select\.js\?v=[0-9a-f]{8}/);
  assert.match(body, /css\/pack-select\.css\?v=[0-9a-f]{8}/);
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
  assert.doesNotMatch(body, /class="ml-act ml-act-go" href/);
});

test("the filters in the address are cleaned, sent to Django, and shown selected; an unknown value becomes All", async () => {
  const f = fake(base([PAGE([A("a1")])]));
  const body = await text(await mediaPage(dashOf(f, "?type=video&category=bogus&product_category=drinks&sort=oldest&search=%20barley%20%20promo%20")));
  assert.deepEqual(f.calls.find((c) => c.path === "member/media")!.body, { host: "demo.negosyotest.com", token: TOKEN, type: "video", product_category: "drinks", search: "barley promo", sort: "oldest", offset: 0 });
  assert.match(body, /name="type" value="video" checked/);
  assert.match(body, /name="category" value="" checked/);
  assert.match(body, /<option value="oldest" selected>/);
  assert.match(body, /value="barley promo"/);
  assert.match(body, /Clear all filters/);
  assert.deepEqual(filtersOf(new URLSearchParams("search=" + "x".repeat(300))).search.length, 100);
  assert.equal(hrefFor({ type: "image", category: "", product_category: "", search: "a b", sort: "newest" }, 24), "/dashboard/media/?type=image&search=a+b&shown=24");
});

test("Load 12 more: a link with a larger shown; shown=24 reads two pages and lists both; the fragment reads one page at the offset", async () => {
  const first = Array.from({ length: 12 }, (_, i) => A(`a${i}`));
  const second = Array.from({ length: 12 }, (_, i) => A(`b${i}`));
  const one = fake(base([PAGE(first, { count: 30, next_offset: 12 })]));
  const body = await text(await mediaPage(dashOf(one)));
  assert.match(body, /<b>30<\/b> assets/);
  assert.match(body, /<a class="tr-btn tr-btn-go ml-btn ml-btn-go ml-more" href="\/dashboard\/media\/\?shown=24" data-ml-more data-next="12">Load 12 more<\/a>/);

  const two = fake(base([PAGE(first, { count: 30, next_offset: 12 }), PAGE(second, { count: 30, offset: 12, next_offset: 24 })]));
  const body2 = await text(await mediaPage(dashOf(two, "?shown=24")));
  assert.equal((body2.match(/class="ml-card"/g) ?? []).length, 24);
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
  assert.equal((body.match(/class="ml-card"/g) ?? []).length, 1);
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

test("the preview popup is TWCinc's layout: media left, details right, caption box, Copy and Download, no Schedule post", async () => {
  const f = fake(base([PAGE([A("a1", { crop_ratio: "4:5", width: 1080, height: 1350, file_size: 315 * 1024, category_label: "Page Post", published_at: "2026-07-31T01:00:00Z" })])]));
  const body = await text(await mediaPage(dashOf(f)));
  assert.match(body, /data-cat="Page Post" data-date="Jul 31, 2026" data-format="JPG \u00b7 Image" data-dims="1080 \u00d7 1350 \(4:5\)" data-size="315 KB" data-download="[^"]*\?download=1"/);
  const dialog = /<dialog[\s\S]*<\/dialog>/.exec(body)?.[0] ?? "";
  for (const hook of ["data-ml-stage", "data-ml-dialog-cat", "data-ml-dialog-title", "data-ml-dialog-pub", "data-ml-dialog-meta", "Ready-made caption", "data-ml-dialog-copy", "data-ml-dialog-dl", "data-ml-dialog-close"]) assert.ok(dialog.includes(hook), hook);
  assert.doesNotMatch(body, /Schedule post|Coming soon/i);
});

test("the preview popup CSS: two panes, scrolling caption, pinned actions, round close, stacked under 800px, no Schedule", () => {
  const css = readFileSync(new URL("../public/assets/sante/css/pack-media.css", import.meta.url), "utf8");
  assert.match(css, /\.ml-dialog\[open\] \{[^}]*display: grid; grid-template-columns:/);
  assert.match(/^\.ml-dialog \{([^}]*)\}/m.exec(css)?.[1] ?? "", /max-height:\s*calc\(100dvh - 32px\)/);
  assert.match(/^\.ml-m-txt \{([^}]*)\}/m.exec(css)?.[1] ?? "", /overflow-y: auto/);
  assert.match(/^\.ml-m-acts \{([^}]*)\}/m.exec(css)?.[1] ?? "", /margin-top: auto/);
  assert.match(/^\.ml-m-close \{([^}]*)\}/m.exec(css)?.[1] ?? "", /border-radius: 50%/);
  assert.match(css, /@media \(max-width: 800px\) \{[^@]*\.ml-dialog\[open\] \{ display: block; \}/);
  assert.match(css, /\.ml-m-close:focus-visible \{ outline: 2px solid #6C8CFF/);
});

test("Copy caption and Copied share one grid cell, so the button keeps its size", () => {
  const css = readFileSync(new URL("../public/assets/sante/css/pack-media.css", import.meta.url), "utf8");
  assert.match(css, /\.ml-act-t \{ display: inline-grid;/);
  assert.match(css, /\.ml-act-t > span \{ grid-area: 1 \/ 1; \}/);
  assert.match(css, /\.ml-t-ok, \.ml-t-fail \{ visibility: hidden; \}/);
  const js = readFileSync(new URL("../public/assets/sante/js/pack-media.js", import.meta.url), "utf8");
  assert.doesNotMatch(js, /textContent = ok \?/);
  assert.match(js, /setAttribute\("data-state"/);
});

test("the member shell is half as wide at the sides as TWCinc's 1240px box, for the bar and the content", () => {
  const css = readFileSync(new URL("../public/assets/sante/css/pack-member-bar.css", import.meta.url), "utf8");
  assert.match(css, /^\.pdn-inner \{ max-width: min\(1600px, calc\(50vw \+ 620px\)\); \}/m);
  assert.match(css, /^\.e4 \.shell \{ max-width: min\(1600px, calc\(50vw \+ 620px\)\);/m);
  assert.match(css, /^\.tr-page \{ max-width: none;/m);
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

test("file lines and sizes", () => {
  const a = { asset_type: "image", file_url: `${BLOB}/x/a.jpg?x=1`, width: 1080, height: 1350, crop_ratio: "4:5", file_size: 315 * 1024, duration_seconds: 0 } as unknown as import("../src/lib/media-api.ts").MediaAsset;
  assert.equal(fileLine(a), "JPG · Image · 1080 × 1350 (4:5) · 315 KB");
  const v = { ...a, asset_type: "video", file_url: `${BLOB}/x/v.mp4`, duration_seconds: 39, file_size: Math.round(3.2 * 1024 * 1024) } as typeof a;
  assert.equal(fileLine(v), "MP4 · Video · 0:39 · 3.2 MB");
  assert.equal(sizeText(0), "");
});

test("the Media Library CSS: equal 1:1 media box, 4 columns, green band, focus light blue, no gold ring or focus", () => {
  const css = readFileSync(new URL("../public/assets/sante/css/pack-media.css", import.meta.url), "utf8");
  assert.match(/^\.ml-thumb \{([^}]*)\}/m.exec(css)?.[1] ?? "", /aspect-ratio:\s*1 \/ 1/);
  assert.match(css, /\.ml-grid \{[^}]*repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.ml-rail-head \{[^}]*background: #03572d/);
  assert.match(css, /\.ml-clear \{[^}]*border: 1px dashed/);
  assert.doesNotMatch(css, /201,\s*162,\s*39|#C9A227/i);
  for (const m of css.matchAll(/[^{}]*:focus[^{}]*\{([^}]*)\}/g)) assert.doesNotMatch(m[1], /#E4C96A|#8A6513|gold/i);
  assert.doesNotMatch(css, /\.ml-name:focus/);
});

test("batches are whole rows of the 4-column grid, and the no-script Load link stays in the markup", async () => {
  assert.equal(PAGE_SIZE % 4, 0);
  assert.equal(MAX_SHOWN % 4, 0);
  const first = Array.from({ length: 12 }, (_, i) => A(`a${i}`));
  const body = await text(await mediaPage(dashOf(fake(base([PAGE(first, { count: 30, next_offset: 12 })])))));
  assert.match(body, /data-ml-more-slot><p class="ml-more-row" data-ml-more-row><a [^>]*data-ml-more /);
});
test("the toolbar: search, sort and count share one height and fill; the fields are bare, in light and dark", () => {
  const css = readFileSync(new URL("../public/assets/sante/css/pack-media.css", import.meta.url), "utf8");
  assert.match(css, /\.ml-search, \.ml-sort, \.ml-count \{[^}]*height: 44px[^}]*border-radius: 999px/);
  const bare = /\.ml-page \.ml-search input, \.ml-page \.ml-sort select \{([^}]*)\}/.exec(css)?.[1] ?? "";
  for (const d of [/appearance: none/, /background: transparent/, /border: 0/, /box-shadow: none/]) assert.match(bare, d);
  assert.match(css, /html\[data-theme="dark"\] \.e4 \.ml-page \.ml-search input, html\[data-theme="dark"\] \.e4 \.ml-page \.ml-sort select \{[^}]*background: transparent/);
  assert.match(css, /-webkit-autofill/);
});
test("the sort is the approved pk-select in the pill, in light and dark, with the panel dark-readable and unclipped (position: fixed)", () => {
  const read = (f: string) => readFileSync(new URL(`../public/assets/sante/css/${f}`, import.meta.url), "utf8");
  const media = read("pack-media.css");
  const shell = read("pack-member-bar.css");
  assert.match(media, /\.e4 \.ml-sort \.pk-select-input \{[^}]*font: 600 16px/);
  assert.match(media, /\.ml-page \.ml-sort select, \.e4 \.ml-sort \.pk-select-input \{ font-size: 15px; \}/);
  assert.match(media, /html\[data-theme="dark"\] \.e4 \.ml-sort \.pk-select-input \{ color: #E6EDE9/);
  assert.match(shell, /html\[data-theme="dark"\] \.e4 \.pk-select-panel \{ background: #1B2620/);
  assert.match(shell, /html\[data-theme="dark"\] \.e4 \.pk-select-opt \{ color: #E6EDE9/);
  const js = readFileSync(new URL("../public/assets/sante/js/pack-select.js", import.meta.url), "utf8");
  assert.match(js, /hasAttribute\("data-pk-select-nofilter"\)/);
  assert.match(js, /input\.readOnly = true; input\.setAttribute\("inputmode", "none"\)/);
  assert.match(js, /if \(nofilter && !select\.disabled\)[\s\S]*ArrowDown[\s\S]*ArrowUp[\s\S]*"Enter"/);
  assert.match(js, /if \(!nofilter\) input\.select\(\)/);
  assert.match(shell, /\.e4 \.pk-select-caret \{ width: 14px; height: 14px; background: url\("data:image\/svg\+xml[^}]*stroke='%235B6B63'/);
  assert.match(shell, /html\[data-theme="dark"\] \.e4 \.pk-select-caret \{ background: url\("data:image\/svg\+xml[^}]*stroke='%23A9B8B0'/);
  assert.match(shell, /html\[data-theme="dark"\] \.e4 \.pk-select-input \{ background: transparent; border: 0; box-shadow: none; color: #E6EDE9/);
  assert.match(shell, /\.e4 \.pk-select-label, html\[data-theme="dark"\] \.e4 \.pk-select-label \{ display: none; background: transparent; \}/);
  assert.match(shell, /\.e4 \.pk-select-caret::before \{ display: none; \}/);
  assert.doesNotMatch(shell, /\.pk-select-opt\.is-active \{ box-shadow/);
  assert.match(shell, /\.e4 \.pk-select-box:focus-within, \.e4 \.pk-select\.is-open \.pk-select-box,\nhtml\[data-theme="dark"\] \.e4 \.pk-select-box:focus-within, html\[data-theme="dark"\] \.e4 \.pk-select\.is-open \.pk-select-box \{ border-color: #6C8CFF; box-shadow: none; \}/);
  assert.match(shell, /\.e4 \.pk-select-opt\.is-selected \{ background: rgba\(108,140,255,\.16\); color: #173DB8; font-weight: 600; \}/);
  assert.match(shell, /html\[data-theme="dark"\] \.e4 \.pk-select-opt\.is-selected \{ background: rgba\(157,180,255,\.20\); color: #9DB4FF; font-weight: 600; \}/);
  assert.match(media, /html\[data-theme="dark"\] \.ml-sort:focus-within[^{]*\{ border-color: #6C8CFF/);
  // Fix 9: the pk-select box fills the pill (so pack-select.js opens the panel at the pill's left edge, full width, 6px below), and the rows are 44px as in Orders.
  assert.match(media, /\.ml-sort \{ flex: 0 0 auto; position: relative; cursor: pointer; padding: 0; gap: 0; \}/);
  assert.match(media, /\.ml-sort > svg \{ position: absolute; left: 13px;/);
  assert.match(media, /\.ml-sort \.pk-select \{ display: block; align-self: stretch; margin: -1px; \}/);
  assert.match(media, /\.e4 \.ml-sort \.pk-select-box, [^{]*\{ height: 100%; min-height: 0; padding: 0 14px 0 37px;/);
  assert.doesNotMatch(media, /\.ml-sort \.pk-select-panel/);
  assert.match(media, /\.e4 \.ml-sort \.pk-select-opt \{ line-height: 24px; \}/);
  assert.match(read("pack-select.css"), /\.pk-select-panel\{display:none;position:fixed/);
});
test("dark mode: the preview tile values are light, and the grid steps down 4 / 3 / 2 / 1", () => {
  const css = readFileSync(new URL("../public/assets/sante/css/pack-media.css", import.meta.url), "utf8");
  assert.match(css, /html\[data-theme="dark"\] \.e4 \.ml-m-meta \.ml-m-v \{ color: #E6EDE9/);
  assert.match(css, /max-width: 1179px\) \{ \.ml-grid \{ grid-template-columns: repeat\(3,/);
  assert.match(css, /max-width: 639px\) \{ \.ml-grid \{ grid-template-columns: repeat\(2,/);
  assert.match(css, /max-width: 420px\) \{ \.ml-grid \{ grid-template-columns: minmax\(0, 1fr\)/);
});
test("infinite scroll: an observer on a sentinel ahead of the edge, a live status with Try again, and the link hidden only when it runs", () => {
  const css = readFileSync(new URL("../public/assets/sante/css/pack-media.css", import.meta.url), "utf8");
  const js = readFileSync(new URL("../public/assets/sante/js/pack-media.js", import.meta.url), "utf8");
  assert.match(js, /new IntersectionObserver\(/);
  assert.match(js, /rootMargin: "0px 0px 600px 0px"/);
  assert.match(js, /aria-live", "polite"/);
  assert.match(js, /data-ml-retry/);
  assert.match(js, /observer\.disconnect\(\)/);
  assert.match(js, /"IntersectionObserver" in window/);
  assert.match(css, /\.ml-auto \.ml-more-row \{ display: none; \}/);
});
test("toolbar alignment: the count has no stray margin (the .pd p rule), and on a phone search is its own row above Filters, sort and count", () => {
  const css = readFileSync(new URL("../public/assets/sante/css/pack-media.css", import.meta.url), "utf8");
  assert.match(css, /\.ml-tools \.ml-count \{ margin: 0; align-self: center;/);
  assert.match(css, /\.ml-search \{ flex: 1 1 100%; order: -1; \}/);
});
test("text sizes match the owner dashboard (apps/dash dash.css): body 16, labels and chips 14, h1 26 / 34, inputs and buttons 16", () => {
  const read = (f: string) => readFileSync(new URL(`../public/assets/sante/css/${f}`, import.meta.url), "utf8");
  const media = read("pack-media.css");
  const rule = (sel: string) => (new RegExp(`^${sel.replace(/[.[\]]/g, "\\$&")} \\{([^}]*)\\}`, "m").exec(media)?.[1] ?? "");
  const px = (sel: string) => Number(/font(?:-size)?:[^;]*?(\d+(?:\.\d+)?)px/.exec(rule(sel))?.[1]);
  for (const s of [".ml-cat", ".ml-meta", ".ml-new", ".ml-len", ".ml-chip em", ".ml-m-k", ".ml-m-pub", ".ml-m-cat"]) assert.ok(px(s) >= 14, `${s} ${px(s)}`);
  for (const s of [".ml-clear", ".ml-status", ".ml-m-meta .ml-m-v", ".ml-m-txt", ".ml-m-acts .ml-act"]) assert.ok(px(s) >= 16, `${s} ${px(s)}`);
  assert.ok(px(".ml-name") >= 17);
  assert.match(media, /\.ml-search, \.ml-sort, \.ml-count \{[^}]*height: 44px/);
  assert.match(media, /\.ml-page \.ml-search input \{[^}]*font: 500 16px/);
  assert.match(media, /\.ml-grid \{ display: grid; grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(media, /min-height: 44px/);
  assert.match(media, /@media \(min-width: 900px\) \{ \.ml-head h1 \{ font-size: 34px;/);
  // The shared member sheets have no text under 14px (the bell count, avatar and progress ring inside fixed circles excepted).
  const bar = read("pack-member-bar.css");
  const small = [...bar.matchAll(/^(.*?)(?:font-size: *|font: *\d+ )(\d+(?:\.\d+)?)px/gm)].filter((m) => Number(m[2]) < 14 && !/pdn-badge|pdn-avatar|tr-ring|tr-cal/.test(m[1]));
  assert.deepEqual(small.map((m) => m[0].slice(0, 60)), []);
  // pack-dashboard.css is a byte-for-byte TWCinc original: its text under 14px is raised by selector in the member-only sheet.
  const dash = read("pack-dashboard.css");
  const override = /\n([^{}]*)\{ font-size: 14px; \}\n$/.exec(bar)?.[1] ?? "";
  const raised = override.replace(/\/\*[\s\S]*?\*\//g, "").split(",").map((x) => x.trim());
  const needed = [...dash.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => Number(/font-size: *(\d+(?:\.\d+)?)px/.exec(m[2])?.[1]) < 14 && !m[1].trim().startsWith("@")).map((m) => m[1].replace(/\/\*[\s\S]*?\*\//g, "").trim());
  assert.ok(needed.length > 30);
  assert.deepEqual(needed.filter((x) => !raised.includes(x)), []);
  assert.match(bar, /\.pdn-links a \{ font-size: 15px; \}/);
  assert.match(bar, /\.pdn-who \{ font-size: 15px; \}/);
});
test("the Orders form selects are pk-select without the typing filter", async () => {
  const src = readFileSync(new URL("../src/views/sante/member-orders.ts", import.meta.url), "utf8");
  assert.match(src, /name="\$\{name\}" data-pk-select data-pk-select-nofilter required/);
});
