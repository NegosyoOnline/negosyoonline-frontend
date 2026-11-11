import test from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, html, htmlResponse, Markup, safe } from "../src/lib/html.ts";
import { neutralDocument, neutralNotFound } from "../src/views/neutral.ts";
import { placeholderDocument } from "../src/views/placeholder.ts";

test("every interpolated value is escaped", () => {
  const name = `<script>alert("x")</script> & 'co'`;
  assert.equal(
    html`<p title="${name}">${name}</p>`.value,
    `<p title="&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#x27;co&#x27;">` +
      `&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#x27;co&#x27;</p>`,
  );
  assert.equal(escapeHtml("a&amp;b"), "a&amp;amp;b");
});

test("markup passes through, by nesting or when marked safe", () => {
  const inner = html`<b>${"a<b"}</b>`;
  assert.ok(inner instanceof Markup);
  assert.equal(html`<p>${inner}${safe("<i>x</i>")}</p>`.value, "<p><b>a&lt;b</b><i>x</i></p>");
});

test("lists are joined, each item escaped; nothing prints for null, undefined and booleans", () => {
  const items = ["a", "<b>", html`<i>c</i>`];
  assert.equal(html`<ul>${items.map((item) => html`<li>${item}</li>`)}</ul>`.value,
    "<ul><li>a</li><li>&lt;b&gt;</li><li><i>c</i></li></ul>");
  assert.equal(html`[${null}${undefined}${false}${true}${0}${""}]`.value, "[0]");
  assert.equal(html`${["<", [">", safe("<br>")]]}`.value, "&lt;&gt;<br>");
});

test("a string that looks like markup is still escaped", () => {
  const fake = { value: "<b>x</b>", toString: () => "<b>x</b>" } as unknown as string;
  assert.equal(html`${fake}`.value, "&lt;b&gt;x&lt;/b&gt;");
});

test("a page answer is never stored and never indexed", async () => {
  const response = htmlResponse(html`<p>hi</p>`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-robots-tag"), "noindex");
  assert.equal(await response.text(), "<p>hi</p>");
});

test("the neutral 404 names no site and carries no script", async () => {
  const response = neutralNotFound();
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-robots-tag"), "noindex");
  const body = await response.text();
  assert.equal(body, neutralDocument("Page not found.").value);
  assert.match(body, /^<!doctype html>\n<html lang="en">/);
  assert.match(body, /<title>Page not found\.<\/title>/);
  assert.match(body, /<p>Page not found\.<\/p>/);
  assert.doesNotMatch(body, /<script|<link|<img|style=|negosyo|sant[eé]/i);
});

test("the placeholder shows the store name, escaped, and nothing else", () => {
  const body = placeholderDocument(`Ana's <Store> & Co`).value;
  assert.match(body, /<title>Ana&#x27;s &lt;Store&gt; &amp; Co<\/title>/);
  assert.match(body, /<h1>Ana&#x27;s &lt;Store&gt; &amp; Co<\/h1>/);
  assert.doesNotMatch(body, /<script|<link|<img/i);
});
