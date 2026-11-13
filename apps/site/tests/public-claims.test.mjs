/* G1 public claims correction (z8uq9m7ydn): claims the product does not deliver at launch stay out of the public pages. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(`../public/${p}`, import.meta.url), "utf8");
const pages = {
  "index.html": read("index.html"),
  "assets/js/site.js": read("assets/js/site.js"),
  "terms.html": read("terms.html"),
  "cancellation-refund.html": read("cancellation-refund.html"),
  "referral-terms.html": read("referral-terms.html"),
};

test("no per-order, video or Auto Courier Tracking pricing on the public pages", () => {
  for (const [name, text] of Object.entries(pages)) {
    for (const re of [/1,000 Orders/i, /1,000 orders/i, /1,000 successful/i, /50 GB (of )?(Video|video)/, /PHP 5 per additional/i,
      /PHP 10 per/i, /Auto Courier Tracking/i, /PHP 399/]) {
      assert.doesNotMatch(text, re, `${name} still matches ${re}`);
    }
  }
});

test("removed FAQs and inventory/logistics/Help Center wording are gone", () => {
  const js = pages["assets/js/site.js"];
  assert.doesNotMatch(js, /delivery fails or an order is returned|Will I be notified when I get an order|more than 1,000 orders/);
  assert.doesNotMatch(js, /inventory management|logistics management tools|and deliveries/i);
  assert.doesNotMatch(pages["index.html"], /Delivery tools|Dashboard and Help Center|Product and inventory management|Products and inventory/);
  assert.doesNotMatch(pages["terms.html"], /approved add-on usage|inventory and product management/);
  assert.doesNotMatch(pages["terms.html"], /add usage or add-ons/);
});

test("home page: storage-only usage, new comparison total, no removed rows", () => {
  const html = pages["index.html"];
  assert.match(html, /PHP 199,800/);
  assert.doesNotMatch(html, /PHP 280,800/);
  assert.match(html, /5 GB<\/b>/);
  assert.doesNotMatch(html, /dtab-inventory|dpanel-inventory|Logistics management tools|Logistics Tools|SMS Order Notifications/);
  assert.match(pages["assets/js/site.js"], /Is there a limit on orders\?/);
});

test("comparison table rows add up to the stated total", () => {
  const html = pages["index.html"];
  const table = html.slice(html.indexOf('aria-label="Cost to build each NegosyoOnline feature'));
  const body = table.slice(0, table.indexOf("</table>"));
  const rows = [...body.matchAll(/<td>PHP ([\d,]+)<small>\d+ hours/g)].map((m) => Number(m[1].replace(/,/g, "")));
  assert.equal(rows.reduce((a, b) => a + b, 0), 199800);
});

test("contact page has no message form and no script for it", () => {
  const html = read("contact.html");
  assert.doesNotMatch(html, /contact-form|contact\.js|Send a Message/);
  assert.match(html, /support@negosyoonline\.com/);
  assert.match(html, /\+63 917 309 8619/);
  assert.equal(fs.existsSync(new URL("../public/assets/js/contact.js", import.meta.url)), false);
});

test("G1e: no COD, Xendit, J&T, Track Order, bulk import, staff roles or discounts claims on any public page or the FAQ", () => {
  const files = fs.readdirSync(new URL("../public/", import.meta.url)).filter((f) => f.endsWith(".html"));
  const all = { ...pages };
  for (const f of files) all[f] = read(f);
  for (const [name, text] of Object.entries(all)) {
    for (const re of [/cash on delivery/i, /Xendit/i, /J&(amp;)?T/, /Track Order/i, /in bulk/i, /their own roles/i, /discounts/i]) {
      assert.doesNotMatch(text, re, `${name} still matches ${re}`);
    }
  }
  const js = pages["assets/js/site.js"];
  assert.match(js, /Customers pay by bank or e-wallet transfer to your own account/);
  assert.match(js, /customers can browse and pay comfortably/);
  assert.match(pages["index.html"], /pay by bank and e-wallet transfer with proof of payment/);
});

test("G1f: no Customers and reports card or sales reports claim, FAQ tab is Payments", () => {
  for (const name of ["index.html", "assets/js/site.js"]) {
    for (const re of [/Customers and reports/, /sales reports/i, /Payments and shipping/]) {
      assert.doesNotMatch(pages[name], re, `${name} still matches ${re}`);
    }
  }
  const m = pages["assets/js/site.js"].match(/window\.NO_FAQ_CATS = \[([^\]]*)\]/);
  assert.ok(m, "NO_FAQ_CATS not found");
  assert.ok(m[1].split(",").map((s) => s.trim().replace(/"/g, "")).includes("Payments"));
  assert.equal((pages["index.html"].match(/class="rd-pcard"/g) || []).length, 4);
});

test("G1b: Santé site is what is available now, Shop is planned", () => {
  const html = pages["index.html"];
  const cards = html.match(/<div class="card[^"]*">.*?<\/div>/g) || [];
  const shop = cards.find((c) => c.includes("<h3>NegosyoOnline Shop</h3>"));
  assert.ok(shop, "Shop card missing");
  assert.match(shop, /Planned/);
  assert.doesNotMatch(shop, /Available Now/);
  const sante = cards.find((c) => c.includes("<h3>NegosyoOnline for Santé distributors</h3>"));
  assert.ok(sante, "Santé card missing");
  assert.match(sante, /Available Now/);
  assert.doesNotMatch(html, /currently includes NegosyoOnline Shop/);
  assert.doesNotMatch(html, /starts with the all-in-one Shop/);
  assert.doesNotMatch(html, /run by real business owners|id="real-stores"/);
  assert.doesNotMatch(pages["assets/js/site.js"], /NegosyoOnline Shop is currently available/);
});

test("Terms and Cancellation no longer tell every Subscriber to add a payment method (z8uq9mek5u)", () => {
  for (const name of ["terms.html", "cancellation-refund.html"]) {
    assert.doesNotMatch(pages[name], /add a payment method for that website/, name);
    assert.doesNotMatch(pages[name], /add a valid payment method/, name);
  }
});

test("no usage charge at launch (z8uq9memdk): usage-charge wording is gone from the public pages", () => {
  for (const [name, text] of Object.entries(pages)) {
    assert.doesNotMatch(text, /PHP 30\b/, `${name} still has PHP 30`);
    assert.doesNotMatch(text, /added to your next monthly bill/i, `${name} still has the next-monthly-bill line`);
    assert.doesNotMatch(text, /Final usage settlement/i, `${name} still has Final usage settlement`);
    assert.doesNotMatch(text, /usage-only/i, `${name} still has usage-only`);
  }
  assert.match(pages["terms.html"], /No usage charge applies at this time\./);
  assert.match(pages["index.html"], /No usage charge at this time/);
});
