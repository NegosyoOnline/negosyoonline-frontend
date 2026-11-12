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
};

test("no per-order, video or Auto Courier Tracking pricing on the public pages", () => {
  for (const [name, text] of Object.entries(pages)) {
    for (const re of [/1,000 Orders/i, /1,000 orders/i, /1,000 successful/i, /50 GB (of )?(Video|video)/, /PHP 5 per additional/i,
      /PHP 10 per/i, /Auto Courier Tracking is an optional add-on/i, /Auto Courier Tracking on the Annual Plan/i,
      /Auto Courier Tracking charge fails/i]) {
      assert.doesNotMatch(text, re, `${name} still matches ${re}`);
    }
  }
  for (const name of ["index.html", "assets/js/site.js"]) {
    assert.doesNotMatch(pages[name], /Auto Courier Tracking|PHP 399/i, name);
  }
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
