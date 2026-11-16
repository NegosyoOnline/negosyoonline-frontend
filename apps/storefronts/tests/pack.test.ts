import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fetchPack, type Pack } from "../src/lib/django.ts";
import { landingDocument } from "../src/views/sante/pack-landing.ts";
import { MSG_AGREEMENT_UNAVAILABLE, MSG_NOT_AVAILABLE, VIDEO_EMBED_URL, packContext, pesos } from "../src/views/sante/pack-page.ts";
import { FILLED, SITE } from "./site.ts";

const secret = randomBytes(24).toString("hex"); // throwaway, made for this run only
const env = { apiBase: "http://api.test", secret };
const PUBLIC = path.join(import.meta.dirname, "..", "public");

const ACCOUNT = { id: "acct_1", kind: "bank", account_type: "bank", provider_name: "BDO", account_name: "Demo", account_number: "1", account_number_last4: "0001", has_qr: false };
const PACK: Pack = {
  price_centavos: 148800, currency: "PHP", available: true,
  agreement: { id: 1, label: "v1.0", effective_date: "2026-11-01" }, payment_accounts: [ACCOUNT],
};

function fake(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const logs: string[] = [];
  const fetchImpl = (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(Response.json(body, { status }));
  };
  return { calls, logs, fetchImpl, log: (reason: string) => logs.push(reason) };
}

test("the pack read: one call with the credential and the host, never cached", async () => {
  const f = fake(200, PACK);
  assert.deepEqual(await fetchPack("demo.negosyotest.com:3002", env, f.fetchImpl, f.log), PACK);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, "http://api.test/storefront/v1/pack/?host=demo.negosyotest.com%3A3002");
  const init = f.calls[0].init;
  assert.deepEqual(init.headers, { Authorization: `Bearer ${secret}`, Accept: "application/json" });
  assert.equal(init.cache, "no-store");
});

test("the pack read fails closed: 404 quietly, anything odd with a reason, no secret and no host never call", async () => {
  const quiet = fake(404, { error: { code: "not_found" } });
  assert.equal(await fetchPack("a.test", env, quiet.fetchImpl, quiet.log), null);
  assert.deepEqual(quiet.logs, []);
  for (const [status, body] of [[500, {}], [200, { price_centavos: "1" }], [200, { ...PACK, price_centavos: -1 }], [200, { ...PACK, payment_accounts: [1] }]] as const) {
    const f = fake(status, body);
    assert.equal(await fetchPack("a.test", env, f.fetchImpl, f.log), null, `${status} ${JSON.stringify(body)}`);
    assert.equal(f.logs.length, 1);
  }
  const none = fake(200, PACK);
  assert.equal(await fetchPack("a.test", { apiBase: "http://api.test", secret: "short" }, none.fetchImpl, none.log), null);
  assert.equal(await fetchPack("", env, none.fetchImpl, none.log), null);
  assert.equal(none.calls.length, 0);
});

test("the price as the pages show it", () => {
  assert.equal(pesos(148800), "₱1,488.00");
  assert.equal(pesos(5), "₱0.05");
  assert.equal(pesos(100000000), "₱1,000,000.00");
});

test("the order button follows the pack, and the message says why it is off", () => {
  assert.equal(packContext(SITE, PACK).cta, true);
  assert.equal(packContext(SITE, PACK).message, "");
  const noAccount = packContext(SITE, { ...PACK, available: false, payment_accounts: [] });
  assert.deepEqual([noAccount.cta, noAccount.message], [false, MSG_NOT_AVAILABLE]);
  const noAgreement = packContext(SITE, { ...PACK, available: false, agreement: null });
  assert.deepEqual([noAgreement.cta, noAgreement.message], [false, MSG_AGREEMENT_UNAVAILABLE]);
  assert.equal(MSG_NOT_AVAILABLE, "Membership Pack checkout is not available yet.");
  assert.equal(MSG_AGREEMENT_UNAVAILABLE, "Membership checkout is not available right now. Please check back soon.");
});

const page = (pack: Pack, site = SITE) => landingDocument(packContext(site, pack)).value;

test("the landing page, order button on: the price, the checkout link, the TWCinc wording", () => {
  const doc = page(PACK);
  assert.match(doc, /<title>Membership Pack \| Demo Store<\/title>/);
  assert.match(doc, /Get 2 boxes of Santé Barley Powder from Demo Store for <strong class="font-bold">only ₱1,488\.00<\/strong>/);
  assert.equal((doc.match(/href="\/funnel\/membership-pack\/checkout\/"/g) ?? []).length, 7); // TWCinc's landing: the hero button and six _cta includes (the phone bar among them)
  assert.match(doc, /Free Shipping Nationwide/);
  assert.doesNotMatch(doc, /Prepaid only\. Cash on delivery/);
  assert.doesNotMatch(doc, /You review and agree to the Santé Membership Terms when you complete/);
  assert.match(doc, /Frequently Asked Questions/);
  assert.match(doc, /data-pp-sticky/);
  assert.doesNotMatch(doc, /role="status"/);
  assert.doesNotMatch(doc, /\{%|\{\{|undefined|\[object/);
});

test("the landing hero holds the video, the From Nature card is gone, the button is centred", () => {
  const doc = page(PACK);
  const iframes = doc.match(/<iframe\b[^>]*>/g) ?? [];
  assert.equal(iframes.length, 1);
  assert.equal(iframes[0], `<iframe class="absolute inset-0 h-full w-full" style="border:0" referrerpolicy="strict-origin-when-cross-origin" src="${VIDEO_EMBED_URL.replaceAll("&", "&amp;")}" allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture;fullscreen;" allowfullscreen="true" title="Santé Membership Pack video">`);
  const hero = doc.slice(doc.indexOf('<section class="pp-hero'), doc.indexOf("</section>", doc.indexOf('<section class="pp-hero')));
  assert.ok(hero.includes(iframes[0]));
  assert.ok(hero.indexOf("pp-hero-video") > hero.indexOf("data-pp-hero-cta") && hero.indexOf("pp-hero-video") < hero.indexOf("pp-hero-photo")); // phone: text and button, video, photo
  assert.doesNotMatch(doc, /From Nature to a Healthier You|Pure\. Natural\. Trusted\./);
  assert.match(hero, /<div class="pp-hero-cta [^"]*text-center">\s*<div class="flex flex-col items-center tab:inline-flex">\s*<a href="\/funnel\/membership-pack\/checkout\/" data-pp-hero-cta[^>]*>Get 2 Boxes &amp; Unlock My Discount<svg/);
  assert.match(hero, /Free Shipping Nationwide/);
  assert.ok(hero.indexOf("pp-hero-cta ") > hero.indexOf("<ul") && hero.indexOf("pp-hero-cta ") < hero.indexOf("pp-hero-video")); // the button row follows the icon row (outside the copy column) and precedes the video
  assert.ok(hero.indexOf("pp-hero-cta ") > hero.indexOf("</ul>"));
  const LABEL = "Get 2 Boxes &amp; Unlock My Discount";
  assert.equal((doc.match(/Get the Membership Pack/g) ?? []).length, 0); // every order button carries the new label
  assert.equal((doc.match(new RegExp(LABEL, "g")) ?? []).length, 7); // the hero button and the six _cta includes (the phone bar among them)
  assert.match(hero, /data-pp-hero-cta class="[^"]*\bbg-accent-400 text-primary-950 shadow-\[var\(--shadow-cta\)\] hover:bg-accent-300\b/); // the hero button keeps the gold look
  assert.doesNotMatch(doc, /pp-hero-cta-green/);
  // fix round 4: the certifications sit in the hero copy column, the five benefit icons are gone, three items sit under the button
  for (const f of ["biogro-certified-organic.png", "halal-idcp.png", "superbrands-philippines-choice.png"]) {
    assert.equal((doc.match(new RegExp(`img/certifications/${f}`, "g")) ?? []).length, 1, f);
    assert.ok(hero.includes(`img/certifications/${f}`), f);
  }
  for (const cap of ["BioGro NZ Certified Organic", "Halal &mdash; IDCP Philippines", "Superbrands Philippines&rsquo; Choice"]) assert.ok(hero.includes(cap), cap);
  for (const gone of ["One qualifying purchase", "Lifetime membership<", "No renewal fees", "No monthly quotas", "No maintenance purchases"]) assert.ok(!hero.includes(gone), gone);
  assert.doesNotMatch(doc, /Certifications carried by/);
  const orderCtas = doc.match(/<a href="\/funnel\/membership-pack\/checkout\/"[^>]*>/g) ?? [];
  assert.equal(orderCtas.length, 7);
  for (const a of orderCtas) { assert.doesNotMatch(a, /bg-primary-/); assert.match(a, /\bbg-accent-[45]00\b/); assert.match(a, /text-primary-950/); } // all gold, none green
  assert.ok(hero.indexOf("pp-hero-certs") < hero.indexOf("pp-hero-cta ")); // phone order: copy with the certifications, the button row, the video, the photo
  const trust = hero.slice(hero.indexOf("pp-hero-trust"), hero.indexOf("</ul>", hero.indexOf("pp-hero-trust")));
  for (const label of ["Free Shipping Nationwide", "One-Time Purchase", "Lifetime Membership"]) assert.ok(trust.includes(label), label);
});

test("the landing page carries the Watch Before You Buy reel carousel before the bundle", () => {
  const doc = page(PACK);
  const reels = doc.indexOf('<section id="reels"');
  assert.ok(reels > 0);
  assert.ok(doc.indexOf("Recognized as the Philippines") < reels && reels < doc.indexOf('<section id="the-bundle"'));
  assert.match(doc, /<h2>Watch Before You Buy<\/h2>/);
  const section = doc.slice(reels, doc.indexOf("</section>", reels));
  assert.equal((section.match(/data-reel-card/g) ?? []).length, 6);
  const guids = [...section.matchAll(/embed\/744094\/([0-9a-f-]{36})\?/g)].map((m) => m[1]);
  assert.deepEqual(guids, ["d49a0f2e-1122-4c79-b1af-50797c81cd27", "d7e40dca-b2bf-4301-9051-7865ad6352f1", "41271ba0-6628-4655-8ff8-b5d5f02ea17b", "d9de4a51-3484-443a-a624-9bb9520b4a42", "54990aa4-775d-48c1-b85b-bfb50c63f85a", "ffba1527-534e-4c5a-83b0-3ef28f86e5d8"]);
  for (const gone of ["9466115c", "8218fd28", "53d83f5a", "bfa29211", "b9617923", "39f71444"]) assert.ok(!section.includes(gone), gone);
  for (const n of ["d49a0f2e", "d7e40dca", "41271ba0", "d9de4a51", "54990aa4", "1"]) assert.ok(section.includes(`/assets/sante/img/reels/reel-${n}.jpg?v=`), n);
  for (const n of [2, 3, 4, 5, 6, 7]) assert.ok(!section.includes(`reel-${n}.jpg`), String(n));
  assert.match(section, /<p data-reel-caption class="pp-reels-title"><\/p>/); // the first reel has no title
  assert.equal((section.match(/data-reel-title=""/g) ?? []).length, 5);
  assert.match(section, /data-reel-title="Open, mix, enjoy"/);
  assert.ok(section.lastIndexOf("ffba1527") > section.lastIndexOf("54990aa4")); // Open, mix, enjoy last
  assert.ok(section.includes('aria-label="Play video 1 with sound"') && section.includes('aria-label="Play video 6 with sound: Open, mix, enjoy"'));
  assert.match(section, /<span data-reel-count>1<\/span> \/ 6/);
  assert.match(section, /data-reel-prev/);
  assert.match(section, /data-reel-next/);
  assert.match(section, /role="region" aria-roledescription="carousel"/);
});

test("the landing page, order button off: only the message, no link, no phone bar", () => {
  const doc = page({ ...PACK, available: false, payment_accounts: [] });
  assert.match(doc, /<div role="status" data-pp-hero-cta[^>]*>\s*<p class="text-base leading-7 font-bold text-ink-900">Membership Pack checkout is not available yet\.<\/p>/);
  assert.doesNotMatch(doc, /membership-pack\/checkout\//);
  assert.doesNotMatch(doc, /data-pp-sticky/);
  assert.doesNotMatch(doc, /Get the Membership Pack|Unlock My Discount/);
});

test("the landing page never carries an inline script and never a per-order billing word", () => {
  const doc = page(PACK, FILLED);
  for (const tag of doc.match(/<script\b[^>]*>/g) ?? []) assert.match(tag, /^<script src="\/assets\/sante\/js\/[^"]+\?v=[0-9a-f]{8}">$/);
  assert.doesNotMatch(doc, /\son[a-z]+=/i);
  assert.doesNotMatch(doc, /per[- ]order|commission fee|transaction fee/i);
});

test("the landing page links only files that exist, and its stylesheets' own files too", () => {
  const doc = page(PACK, FILLED);
  const linked = new Set([...doc.matchAll(/(?:src|href)="(\/assets\/[^"?]+)\?v=[0-9a-f]{8}"/g)].map((m) => m[1]));
  assert.ok(linked.size >= 15);
  for (const file of linked) assert.ok(existsSync(path.join(PUBLIC, file)), file);
});

test("the site's own details reach the footer, escaped", () => {
  const doc = landingDocument(packContext({ ...FILLED, display_name: "A & <B>" }, PACK)).value;
  assert.match(doc, /<title>Membership Pack \| A &amp; &lt;B&gt;<\/title>/);
  assert.doesNotMatch(doc, /<B>/);
  assert.match(doc, /Nena Santos Trading/);
});

test("the landing script is the one the page links, and holds the three behaviours", () => {
  const js = readFileSync(path.join(PUBLIC, "assets/sante/js/pack-landing.js"), "utf8");
  for (const hook of ["[data-gallery]", "[data-selfcheck]", "[data-pp-sticky]"]) assert.ok(js.includes(hook), hook);
  assert.ok(page(PACK).includes("/assets/sante/js/pack-landing.js?v="));
});

test("the 40% member savings badge is one real element on the video, and the hero photo no longer carries it", () => {
  const doc = page(PACK);
  assert.equal((doc.match(/class="pp-hero-badge-top">Unlock</g) ?? []).length, 1);
  assert.equal((doc.match(/pp-hero-badge-pct">40%</g) ?? []).length, 1);
  assert.match(doc, /<div class="pp-hero-badge" role="img" aria-label="Unlock 40% member savings">/);
  assert.match(doc, /Member<br>Savings/);
  assert.doesNotMatch(doc, /member savings\. With stevia/i); // the photo's alt no longer repeats the badge
  const hero = doc.slice(doc.indexOf('<section class="pp-hero'), doc.indexOf("</section>", doc.indexOf('<section class="pp-hero')));
  assert.ok(hero.indexOf('class="pp-hero-video"') < hero.indexOf("pp-hero-badge"));
  assert.ok(hero.indexOf("pp-hero-badge") < hero.indexOf("pp-hero-photo")); // inside the video block
  assert.ok(hero.includes("img/hero-nz-tall-2000.webp") && hero.includes("img/hero-nz-tall-1400.webp"));
  assert.doesNotMatch(hero, /40pct/);
  for (const w of ["1400", "2000"]) assert.ok(existsSync(path.join("public/assets/sante/img", `hero-nz-tall-${w}.webp`)));
});

test("the phone hero order is set by CSS under 40rem: label, headline, video, line, button, certifications", () => {
  const css = readFileSync("public/assets/sante/css/pack-focus.css", "utf8");
  const phone = css.slice(css.indexOf("@media (max-width: 39.99rem) {\n  .pp-hero {"));
  assert.match(phone, /\.pp-hero-body, \.pp-hero-copy \{ display: contents; \}/);
  const order = (cls: string) => Number(phone.match(new RegExp(`\\.${cls} \\{[^}]*order: (\\d)`))?.[1]);
  const seq = ["pp-hero-label", "pp-hero-h1", "pp-hero-video", "pp-hero-lede", "pp-hero-cta", "pp-hero-certs"].map(order);
  assert.deepEqual(seq, [1, 2, 3, 4, 5, 6]);
  assert.match(phone, /\.pp-hero-photo \{ display: none;/); // round 6: the photo block is gone on a phone
  const hero = page(PACK);
  assert.match(hero, /<picture><source media="\(max-width: 39\.99rem\)" srcset="data:image\/gif;base64,[^"]+"><img src="[^"]*hero-nz-tall-2000\.webp[^"]*" srcset="[^"]*1400w[^"]*2000w"[^>]*fetchpriority="high"[^>]*><\/picture>/);
  assert.match(hero, /<span aria-hidden="true" class="pp-hero-blur hidden desk:block"><picture><source media="\(max-width: 63\.99rem\)" srcset="data:image\/gif;base64,[^"]+"><img [^>]*loading="lazy"><\/picture><\/span>/);
  const doc = page(PACK);
  for (const cls of ["pp-hero-label", "pp-hero-h1", "pp-hero-lede", "pp-hero-certs", "pp-hero-cta", "pp-hero-video", "pp-hero-photo"]) assert.equal((doc.match(new RegExp(`class="${cls}[ "]`, "g")) ?? []).length, 1, cls);
  assert.equal((doc.match(/<iframe\b/g) ?? []).length, 1); // one player, no duplicated markup
});

test("the landing page carries We are the Barley Authority between the IQVIA strip and the reels, as four ARIA tabs", () => {
  const doc = page(PACK);
  const iqvia = doc.indexOf("Recognized as the Philippines");
  const about = doc.indexOf('<section id="about"');
  const reels = doc.indexOf('<section id="reels"');
  assert.ok(iqvia > 0 && iqvia < about && about < reels);
  const section = doc.slice(about, doc.indexOf("</section>", about));
  assert.match(section, /<h2>We are the <span>Barley Authority<\/span><\/h2>/);
  assert.equal((doc.match(/We are the <span>/g) ?? []).length, 1);
  assert.match(section, /<div role="tablist"/);
  const tabs = section.match(/<button [^>]*role="tab"[^>]*>[^<]*/g) ?? [];
  assert.equal(tabs.length, 4);
  assert.deepEqual(tabs.map((t) => t.replace(/^[^>]*>/, "")), ["Our Story", "Trusted Since 2007", "Biogro New Zealand", "Global Standard"]);
  assert.match(tabs[0], /aria-selected="true"[^>]*tabindex="0"/);
  for (const t of tabs.slice(1)) assert.match(t, /aria-selected="false"[^>]*tabindex="-1"/);
  const panels = section.match(/<div id="tab-[a-z-]+" role="tabpanel"[^>]*>/g) ?? [];
  assert.equal(panels.length, 4);
  assert.ok(!/hidden/.test(panels[0]));
  for (const p of panels.slice(1)) assert.match(p, / hidden /);
  for (const id of ["tab-our-story", "tab-trusted", "tab-biogro", "tab-global"]) {
    assert.match(section, new RegExp(`aria-controls="${id}"`));
    assert.match(section, new RegExp(`id="${id}" role="tabpanel" aria-labelledby="${id}-tab"`));
  }
  assert.match(section, /More Than a Wellness Brand/);
  assert.match(section, /Global Standard, Local Impact/);
  assert.match(section, /Santé International was built on one simple idea/);
  for (const n of [1, 2, 3, 4]) assert.ok(section.includes(`/assets/sante/img/about/about-${n}.webp?v=`), String(n));
  assert.ok(existsSync(path.join("public/assets/sante/img/about", "about-bg.webp")));
});

test("round 7: the hero video has a white frame and a green play button (a real button, a sibling of the one iframe)", () => {
  const doc = page(PACK);
  assert.equal((doc.match(/<iframe\b/g) ?? []).length, 1);
  const hero = doc.slice(doc.indexOf('<section class="pp-hero'), doc.indexOf("</section>", doc.indexOf('<section class="pp-hero')));
  const video = hero.slice(hero.indexOf('<div class="pp-hero-video">'), hero.indexOf("pp-hero-badge"));
  assert.match(video, /<iframe [^>]*title="Santé Membership Pack video"><\/iframe>\s*<button type="button" data-hero-play class="pp-reel-play pp-hero-play" aria-label="Play video with sound">/);
  assert.equal((video.match(/aria-label="Play video with sound"/g) ?? []).length, 1);
  assert.ok(video.includes("pp-reel-icon") && video.includes("pp-reel-tri")); // the reel's green icon and white triangle
  const css = readFileSync("public/assets/sante/css/pack-focus.css", "utf8");
  assert.match(css, /\.pp-hero-video-frame \{[^}]*box-shadow: 0 0 0 5px #fff/);
  assert.match(css, /\.pp-hero-video-frame \{ position: absolute; pointer-events: auto;[^}]*box-shadow: 0 0 0 5px #fff/);
  const js = readFileSync("public/assets/sante/js/pack-landing.js", "utf8");
  for (const m of ["setCurrentTime", "unmute", "setVolume", "play"]) assert.ok(js.includes(`"${m}"`), m);
  assert.match(js, /e\.origin!==origin/);
});

test("every order button carries the heartbeat: double-beat keyframes, paused on hover and focus, none under reduced motion", () => {
  const doc = page(PACK);
  const buttons = doc.match(/<a href="[^"]*" [^>]*data-pp-beat/g) ?? [];
  assert.equal(buttons.length, 7); // hero, five in-page, the phone order bar
  assert.equal((doc.match(/Get 2 Boxes &amp; Unlock My Discount/g) ?? []).length, 7);
  const css = readFileSync(path.join(import.meta.dirname, "../public/assets/sante/css/pack-focus.css"), "utf8");
  const keyframes = css.slice(css.indexOf("@keyframes pp-heartbeat"), css.indexOf("[data-pp-beat] {"));
  assert.deepEqual([...keyframes.matchAll(/transform: scale\(([\d.]+)\)/g)].map((m) => m[1]), ["1", "1.06", "1", "1.04", "1"]);
  assert.match(css, /\[data-pp-beat\] \{ animation: pp-heartbeat 1\.8s ease-in-out infinite; \}/);
  assert.match(css, /\[data-pp-beat\]:hover, \[data-pp-beat\]:focus-visible \{ animation: none; \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \[data-pp-beat\] \{ animation: none; \} \}/);
});
