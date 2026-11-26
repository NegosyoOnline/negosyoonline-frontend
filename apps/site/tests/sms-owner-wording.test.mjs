/* DOC-1 (z8uq9mhk1h): Privacy and Terms wording for stores texting their own customers. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(`../public/${p}`, import.meta.url), "utf8");
const privacy = read("privacy.html"), terms = read("terms.html");
const has = (text, s) => assert.ok(text.includes(s), `missing: ${s}`);

test("Privacy carries November 26, 2026 and Terms November 24, 2026", () => {
  has(privacy, "Effective Date: November 26, 2026<br>");
  has(terms, "Effective Date: November 24, 2026<br>");
});

test("Privacy covers store texts, the paired-phone carrier, retention and STOP", () => {
  has(privacy, "A reply to a store’s text is kept in that store’s Inbox, not ours (section 5).");
  has(privacy, "security notices, and texts a Subscriber writes to its own customers from its store’s Inbox.");
  has(privacy, "it can text its own members from its Inbox. The texts");
  has(privacy, "The texts come from NegosyoOnline’s mobile number, or from the store’s own paired phone, and start with the store’s name. Texts a store sends from its own paired phone travel through that store’s mobile carrier.");
  has(privacy, "If you reply STOP, that store can no longer text you. Sign-in codes you ask for still arrive.");
  has(privacy, "(sign-in codes, order-status texts, and texts a store sends its customers from its Inbox)");
  has(privacy, "a STOP sent to a store stops that store’s texts.");
  has(privacy, "Text-message (SMS) conversations in a store’s Inbox: 180 days after the conversation’s last message, then deleted.");
});

test("Terms puts the paired phone and SIM on the Subscriber", () => {
  has(terms, "The Subscriber is responsible for the phone and SIM it pairs.");
});

test("neither page forces a Reply STOP footer on store texts", () => {
  assert.ok(!privacy.includes("Reply STOP to stop"));
  assert.ok(!terms.includes("Reply STOP to stop"));
});

test("neither page mentions promotions for store texts or promo consent", () => {
  for (const t of [privacy, terms]) {
    assert.ok(!t.includes("promotional text"));
    assert.ok(!t.includes("including promotions"));
  }
  assert.ok(!privacy.includes("agreed to receive"));
  assert.ok(!terms.includes("agreed to receive"));
});
