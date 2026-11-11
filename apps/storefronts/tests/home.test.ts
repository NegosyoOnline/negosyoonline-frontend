import test from "node:test";
import assert from "node:assert/strict";
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
    `<script src="/assets/sante/js/pack-store.js?v=6cc4f761">`,
  ]);
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
  assert.equal(count('href="/products/"'), 14); // 13 on the page and one in the empty basket
  assert.equal(count('href="/cart/"'), 1);
  assert.equal(count('href="/checkout/"'), 1);
  assert.equal(count('href="/dashboard/sign-in/?next=orders"'), 2);
  assert.equal(count('href="/funnel/membership-pack/landing-page/"'), 1); // the footer link, the template's only one
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
  assert.match(render({ ...SITE, free_shipping_banner: true }), /<body>\n<div class="sf-announce">/);
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

test("a photo or seal flag from the API is not acted on in this slice", () => {
  const page = render({ ...FILLED, distributor: { ...FILLED.distributor, has_photo: true },
    business: { ...FILLED.business, has_seal: true } });
  assert.doesNotMatch(page, /distributor-photo|business-seal|footer-seal/);
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
  assert.doesNotMatch(filled, /facebook\.com\/demostore/);
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

test("the contact form as first shown: posts to /contact/, empty, no note", () => {
  const page = render();
  assert.match(page, /<form method="post" action="\/contact\/" novalidate /);
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
  assert.equal(page.match(/<script/g)?.length, 2);
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
