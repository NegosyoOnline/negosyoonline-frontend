import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { assetVersions } from "../src/lib/assets.ts";
import { homeDocument } from "../src/views/sante/home.ts";
import {
  CONTACT_FAILED_NOTE, failedContactForm, formatMobile, homeModel, initials, type ContactForm,
} from "../src/views/sante/model.ts";
import { FILLED, SITE } from "./site.ts";

const NOW = new Date("2026-11-11T10:00:00+08:00");
const render = (site = SITE, cf?: ContactForm) => homeDocument(homeModel(site, cf, NOW)).value;

test("the page is one whole document with the store name in the title and the footer", () => {
  const page = render(FILLED);
  assert.ok(page.startsWith("<!DOCTYPE html>\n<html lang=\"en\">"));
  assert.ok(page.trimEnd().endsWith("</body>\n</html>"));
  assert.match(page, /<title>Nena&#x27;s Wellness &amp; Barley \| Premium Wellness<\/title>/);
  assert.match(page, /&#169; 2026 Nena&#x27;s Wellness &amp; Barley\. All rights reserved\./);
});

test("no inline script, handler or frame; nothing loaded from another origin but the font", () => {
  const page = render(FILLED);
  assert.deepEqual(page.match(/<script[^>]*>/g), [
    `<script src="/assets/sante/js/pack-home.js?v=db367a6b">`,
    `<script src="/assets/sante/js/pack-store.js?v=3caf40e6">`,
    `<script src="/assets/sante/js/contact-form.js?v=${assetVersions()["js/contact-form.js"]}">`,
    `<script src="/assets/sante/js/chat-widget.js?v=${assetVersions()["js/chat-widget.js"]}" data-chat-widget data-store="Nena&#x27;s Wellness &amp; Barley">`,
  ]);
  assert.equal(page.match(/<script[^>]*><\/script>/g)?.length, 4); // each one empty: a link, never code
  assert.doesNotMatch(page, /<style|<iframe|\son[a-z]+\s*=|javascript:/i);
  const loaded = [...page.matchAll(/<(?:link|img|script)[^>]*(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
  for (const url of loaded) {
    assert.ok(url.startsWith("/assets/sante/") || url.startsWith("data:") ||
      url.startsWith("https://fonts.googleapis.com") || url.startsWith("https://fonts.gstatic.com"), url);
  }
});

test("no TWC address, and no template tag left behind", () => {
  for (const page of [render(), render(FILLED)]) {
    assert.doesNotMatch(page, /technowealthcreators|twcako|twcinc|sante-support@/i);
    assert.doesNotMatch(page, /\{%|%\}|\{\{|\}\}|\$\{|csrfmiddlewaretoken|undefined|\[object/);
  }
});

test("the approved links to pages of later slices are kept as they are", () => {
  const page = render();
  const count = (needle: string) => page.split(needle).length - 1;
  assert.equal(count('href="/products/"'), 10); // 9 on the page (the footer's four categories now carry ?category=) and one in the empty basket
  assert.equal(count('href="/cart/"'), 1);
  assert.equal(count('href="/checkout/"'), 1);
  assert.equal(count('href="/dashboard/sign-in/?next=orders"'), 2);
  assert.equal(count('href="/funnel/membership-pack/landing-page/"'), 0); // the footer no longer links the Membership Package
});

test("the basket is empty: badge hidden, empty note shown, totals hidden, checkout disabled", () => {
  const page = render();
  assert.match(page, /<span class="nav-cart-count" data-cart-count hidden>0<\/span>/);
  assert.match(page, /<span data-sf-drawer-count>0 items<\/span>/);
  assert.match(page, /<div class="sf-drawer-empty" id="sfDrawerEmpty">\s*<p>Your basket is empty\.<\/p>/);
  assert.match(page, /<div class="sf-drawer-subtotal" id="sfDrawerSubtotalRow" hidden>/);
  assert.match(page, /class="btn-cart sf-drawer-checkout disabled" id="sfDrawerCheckout"/);
  assert.doesNotMatch(page, /sf-drawer-item"|sf-quote-error/);
});

test("no free shipping banner unless the answer says so", () => {
  assert.doesNotMatch(render(), /sf-announce/);
  assert.match(render({ ...SITE, free_shipping_banner: true }), /<body>\n<a class="sf-skip" href="#main-content">Skip to content<\/a>\n<div class="sf-announce">/);
});

test("the distributor card: name, initials in place of a photo, mobile and Call now", () => {
  const page = render(FILLED);
  assert.match(page, /<div class="dist-photo" aria-hidden="true">NS<\/div>/);
  assert.match(page, /<div class="dist-name">Nena Santos<\/div>/);
  assert.match(page, /<a class="dist-phone" href="tel:\+639171234567"><svg[^>]*>.*?<\/svg>\+63 917 123 4567<\/a>/);
  assert.match(page, /<a class="dist-call" href="tel:\+639171234567" aria-label="Call Nena Santos">Call now<\/a>/);
});

test("the distributor card without a usable mobile: no phone line and no Call now", () => {
  const page = render();
  assert.match(page, /<div class="dist-name">Demo Store<\/div>/);
  assert.match(page, /<div class="dist-photo" aria-hidden="true">DS<\/div>/);
  assert.doesNotMatch(page, /class="dist-phone"|class="dist-call"|href="tel:/);
  const odd = render({ ...SITE, distributor: { name: "Ana", mobile: "09171234567", has_photo: false } });
  assert.doesNotMatch(odd, /class="dist-phone"|class="dist-call"|href="tel:/);
});

test("a photo flag is not acted on; the seal shows through /business-seal/ only when uploaded", () => {
  const page = render({ ...FILLED, distributor: { ...FILLED.distributor, has_photo: true },
    business: { ...FILLED.business, has_seal: true } });
  assert.doesNotMatch(page, /distributor-photo/);
  assert.match(page, /<img class="footer-seal" src="\/business-seal\/"/);
  assert.doesNotMatch(render(FILLED), /business-seal|footer-seal/);
});

test("Email Us shows the store's own email, and is absent when there is none", () => {
  const page = render(FILLED);
  assert.match(page, />Email Us<\/div>\s*<a href="mailto:hello@demo-store\.example\.test"[^>]*>hello@demo-store\.example\.test<\/a>/);
  const none = render();
  assert.doesNotMatch(none, /Email Us|mailto:/);
  assert.match(none, />Office Location<\/div>/);
  assert.match(none, /Follow Our Journey/);
});

test("socials: the fixed Santé Facebook link always; Instagram and TikTok only when set and https", () => {
  const facebook = /href="https:\/\/www\.facebook\.com\/SanteOrganicBarleyShopOfficial"/;
  const filled = render(FILLED);
  assert.match(filled, facebook);
  assert.match(filled, /<a href="https:\/\/instagram\.com\/demostore" target="_blank" rel="noopener noreferrer" aria-label="Follow us on Instagram"/);
  assert.match(filled, /<a href="https:\/\/tiktok\.com\/@demostore" target="_blank" rel="noopener noreferrer" aria-label="Follow us on TikTok"/);
  const contactSection = filled.slice(filled.indexOf('id="contact"'), filled.indexOf("<!-- FOOTER -->"));
  assert.doesNotMatch(contactSection, /facebook\.com\/demostore/, "the contact section keeps the fixed Santé link; the store's own page is in the footer");
  assert.doesNotMatch(render(), /Follow us on Instagram|Follow us on TikTok/);
  const bad = render({ ...SITE, instagram_url: "javascript:alert(1)", tiktok_url: "http://tiktok.com/@x" });
  assert.doesNotMatch(bad, /Follow us on Instagram|Follow us on TikTok|javascript:/);
});

test("the registration card: each line only when filled, the whole card absent when none is", () => {
  const all = render(FILLED);
  assert.match(all, /<span>Registered business<\/span>Nena Santos Trading<\/div>/);
  assert.match(all, /<span>DTI registration no\.<\/span>1234567<\/div>/);
  assert.match(all, /<span>BIR tax ID no\. \(TIN\)<\/span>123-456-789-00000<\/div>/);
  const one = render({ ...SITE, business: { ...SITE.business, tin: "111-222-333-00000" } });
  assert.match(one, /<div class="footer-registration">/);
  assert.doesNotMatch(one, /Registered business|DTI registration no\./);
  assert.doesNotMatch(render(), /<div class="footer-registration">|footer-reg-list/);
});

test("policy links: none now; listed when the answer has them, local paths only", () => {
  const page = render({ ...SITE, policy_links: [{ label: "Terms & Conditions", path: "/terms/" },
    { label: "Elsewhere", path: "https://example.com/" }, { label: "Odd", path: "//example.com/" }] });
  assert.match(page, /<li><a href="\/terms\/">Terms &amp; Conditions<\/a><\/li>/);
  assert.doesNotMatch(page, /Elsewhere|Odd|example\.com/);
});

test("the contact form as first shown: posts to /contact/ and returns to its own card, empty, no note", () => {
  const page = render();
  assert.match(page, /<form method="post" action="\/contact\/#contact-form" novalidate /);
  assert.equal(page.split('id="contact-form"').length - 1, 1); // the place the answer scrolls to, once on the page
  assert.match(page, /<div class="contact-form-wrap" id="contact-form" style="/);
  assert.match(page, /<input type="text" name="name" value="" placeholder="Your Name"/);
  assert.match(page, /<textarea name="message"[^>]*><\/textarea>/);
  assert.match(page, /<input type="text" name="website" tabindex="-1" autocomplete="off">/);
  assert.doesNotMatch(page, /class="sf-contact-status"|class="sf-contact-error"|#d33d44/);
});

test("after a post: the approved failure note, the typed values kept and escaped", () => {
  const posted = new URLSearchParams({ name: ` Ana\r\n<b>Reyes</b> `, email: " ANA@Example.Test ",
    subject: `"quoted" & more`, message: `  Hello </textarea><script>alert(1)</script>\nline two  ` });
  const page = render(FILLED, failedContactForm(posted));
  assert.match(page, /<p class="sf-contact-status" role="status" style="color: #d33d44;">We could not send your message\. Please try again in a moment\.<\/p>/);
  assert.match(page, /name="name" value="Ana  &lt;b&gt;Reyes&lt;\/b&gt;"/);
  assert.match(page, /name="email" value="ana@example\.test"/);
  assert.match(page, /name="subject" value="&quot;quoted&quot; &amp; more"/);
  assert.match(page, />Hello &lt;\/textarea&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;\nline two<\/textarea>/);
  assert.doesNotMatch(page, /Thanks! Your message has been sent/);
  assert.equal(page.match(/<script/g)?.length, 4); // the three of the page and the chat widget's own
});

test("posted values are cut to the form's limits, and a missing field is empty", () => {
  const form = failedContactForm(new URLSearchParams({ name: "n".repeat(500), email: "e".repeat(500),
    subject: "s".repeat(500), message: "m".repeat(9000) }));
  assert.deepEqual([form.values.name.length, form.values.email.length, form.values.subject.length,
    form.values.message.length], [120, 254, 200, 4000]);
  assert.equal(form.note, CONTACT_FAILED_NOTE);
  assert.deepEqual(failedContactForm(new URLSearchParams()).values, { name: "", email: "", subject: "", message: "" });
});

test("the template's field-error and sent states still render for the task that builds sending", () => {
  const cf: ContactForm = { values: { name: "", email: "x", subject: "", message: "" },
    errors: { name: "Please enter your name.", email: "Please enter a valid email address." }, sent: false, note: "" };
  const page = render(SITE, cf);
  assert.match(page, /<div class="sf-contact-error">Please enter your name\.<\/div>/);
  assert.match(page, /<div class="sf-contact-error">Please enter a valid email address\.<\/div>/);
  assert.match(page, /<textarea[^>]*border: 1\.5px solid var\(--border\);/);
  assert.match(render(SITE, { ...cf, errors: {}, sent: true }), /Thanks! Your message has been sent &mdash;/);
});

test("Subject Topic is required: its error sits under it in its own block, with the red border", () => {
  const field = /<div>\s*<input type="text" name="subject" value="" placeholder="Subject Topic" aria-label="Subject Topic" maxlength="200" style="width: 100%; padding: 14px 16px; border: 1\.5px solid ([^;]+);[^>]*>\s*(<div class="sf-contact-error">([^<]*)<\/div>)?\s*<\/div>/;
  const cf: ContactForm = { values: { name: "Ana", email: "ana@example.test", subject: "", message: "Hi" },
    errors: { subject: "Please enter a subject." }, sent: false, note: "" };
  const refused = field.exec(render(SITE, cf));
  assert.equal(refused?.[1], "#d33d44");
  assert.equal(refused?.[3], "Please enter a subject.");
  assert.equal(render(SITE, cf).match(/class="sf-contact-error"/g)?.length, 1);
  const first = field.exec(render());
  assert.equal(first?.[1], "var(--border)");
  assert.equal(first?.[2], undefined);
});

test("initials, the mobile display and the footer year follow the approved rules", () => {
  assert.equal(initials("Ana Reyes"), "AR");
  assert.equal(initials("  ana maria  de los reyes "), "AR");
  assert.equal(initials("Ana"), "A");
  assert.equal(initials(""), "?");
  assert.equal(formatMobile("+639171234567"), "+63 917 123 4567");
  for (const bad of ["", "09171234567", "+63917123456", "+638171234567"]) assert.equal(formatMobile(bad), "", bad);
  const newYear = homeDocument(homeModel(SITE, undefined, new Date("2026-12-31T17:00:00Z"))).value;
  assert.match(newYear, /&#169; 2027 Demo Store\./);
});

test("the header CTA reads Login to a visitor and Dashboard (to /dashboard/) to a signed-in member", () => {
  const out = homeDocument(homeModel(SITE, undefined, NOW)).value;
  assert.match(out, /<a href="\/dashboard\/sign-in\/" class="nav-cta">Login<\/a>/);
  assert.doesNotMatch(out, />Dashboard<\/a>/);
  const inn = homeDocument(homeModel(SITE, undefined, NOW, true)).value;
  assert.match(inn, /<a href="\/dashboard\/" class="nav-cta">Dashboard<\/a>/);
  assert.doesNotMatch(inn, /class="nav-cta">Login/);
  assert.equal(inn.match(/class="nav-cta"/g)?.length, 1); // the one CTA serves desktop and the phone bar; the menu list has no second one
});

const footerOf = (page: string) => page.slice(page.indexOf("<!-- FOOTER -->"), page.indexOf("</footer>"));
const colTitles = (f: string) => [...f.matchAll(/class="footer-col-title">([^<]+)</g)].map((m) => m[1]);

test("footer: brand, then Company, Shop, Legal; no Support column, no Our Story, no FAQs, no Membership Package", () => {
  const f = footerOf(render({ ...FILLED, policy_links: [{ label: "Terms", path: "/terms/" }] }));
  assert.deepEqual(colTitles(f), ["Company", "Shop", "Legal"]);
  assert.match(f, /footer-logo/);
  assert.doesNotMatch(f, /Support|Our Story|FAQs|Membership Package|membership-pack/);
  const company = f.slice(f.indexOf(">Company<"), f.indexOf(">Shop<"));
  assert.deepEqual([...company.matchAll(/<li><a href="([^"]+)"[^>]*>(?:<svg[\s\S]*?<\/svg>)?([^<]*)/g)].slice(0, 2).map((m) => [m[1], m[2]]),
    [["/#about", "About Santé"], ["/#contact", "Contact Us"]].map(([a, b]) => [a, b.replace("é", "&eacute;")]));
  const shop = f.slice(f.indexOf(">Shop<"), f.indexOf(">Legal<"));
  assert.deepEqual([...shop.matchAll(/<a href="([^"]+)">([^<]+)</g)].map((m) => [m[1], m[2]]), [
    ["/products/", "All Products"], ["/products/?category=barley", "Sant&eacute; Barley"], ["/products/?category=drinks", "Sant&eacute; Special Drinks"],
    ["/products/?category=essentials", "Sant&eacute; Essentials"], ["/products/?category=beauty", "Sant&eacute; Beauty"]]);
});

test("footer Company contact lines: the store owner's email, mobile and Facebook; each only when set", () => {
  const f = footerOf(render(FILLED));
  assert.match(f, /<a href="mailto:hello@demo-store\.example\.test"><svg[\s\S]*?<\/svg><span>hello@demo-store\.example\.test<\/span><\/a>/);
  assert.match(f, /<a href="tel:09171234567"><svg[\s\S]*?<\/svg><span>09171234567<\/span><\/a>/, "a mobile that is not in +63 form is shown as stored");
  assert.match(f, /<a href="https:\/\/facebook\.com\/demostore" target="_blank" rel="noopener noreferrer"><svg[\s\S]*?<\/svg><span>facebook\.com\/demostore<\/span><\/a>/);
  const pretty = footerOf(render({ ...FILLED, business: { ...FILLED.business, contact_mobile: "+639171234567" } }));
  assert.match(pretty, /<a href="tel:\+639171234567">[\s\S]*?<span>\+63 917 123 4567<\/span>/);
  const none = footerOf(render(SITE));
  assert.doesNotMatch(none, /footer-contact|mailto:|tel:|facebook/);
  const onlyMail = footerOf(render({ ...SITE, business: { ...SITE.business, contact_email: "a@b.test" } }));
  assert.match(onlyMail, /mailto:a@b\.test/);
  assert.doesNotMatch(onlyMail, /tel:|facebook/);
  const badFb = footerOf(render({ ...SITE, facebook_url: "http://facebook.com/x" }));
  assert.doesNotMatch(badFb, /facebook/, "only an https page is linked");
});

test("footer Legal column, the registration block, the copyright and the disclaimer are as they were", () => {
  const f = footerOf(render({ ...FILLED, policy_links: [{ label: "Terms", path: "/terms/" }], business: { ...FILLED.business, has_seal: true } }));
  assert.match(f, /<div class="footer-col-title">Legal<\/div>\s*<ul class="footer-links">\s*<li><a href="\/terms\/">Terms<\/a><\/li>/);
  assert.match(f, /<div class="footer-registration">/);
  assert.match(f, /class="footer-seal" src="\/business-seal\/"/);
  assert.match(f, /All rights reserved\./);
  assert.match(f, /Products are for general wellness support only/);
});

test("footer: the whole Legal column, heading included, is hidden when there are no policy links; nothing else changes", () => {
  const none = footerOf(render({ ...FILLED, policy_links: [] }));
  assert.deepEqual(colTitles(none), ["Company", "Shop"]);
  assert.doesNotMatch(none, />Legal</);
  assert.match(none, /footer-logo/);
  assert.match(none, /All rights reserved\./);
  assert.deepEqual(colTitles(footerOf(render({ ...FILLED, policy_links: [{ label: "Terms", path: "/terms/" }] }))), ["Company", "Shop", "Legal"]);
  /* the Cookie settings control (a Pixel site) is a legal control: it keeps the column even with no policy page */
  const px = footerOf(render({ ...FILLED, policy_links: [], meta_pixel_id: "123456789012345" } as never));
  assert.deepEqual(colTitles(px), ["Company", "Shop", "Legal"]);
  assert.match(px, /Cookie settings/);
});

test("footer CSS: four columns on desktop, and the brand column takes a row of its own on narrower screens", () => {
  const css = readFileSync(path.join(import.meta.dirname, "..", "public", "assets", "sante", "css", "pack-home.css"), "utf8");
  assert.match(css, /\.footer-top \{\s*display: grid;\s*grid-template-columns: 2fr 1fr 1fr 1fr;/);
  assert.match(css, /\.footer-top > :first-child \{ grid-column: 1 \/ -1; \}/);
  assert.match(css, /\.footer-contact a \{ display: flex; align-items: center; gap: 10px; \}/);
});
