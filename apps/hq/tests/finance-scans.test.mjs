/* finance-invoices.js, the scan of the paper invoice: upload, view, verify and reject (Billing HQ-F2, ClickUp
   z8uq9memvq, plan sections 4.4 and 6). The file has no address: it is read through NOHq.file, held in the tab's
   memory, shown from an object address and released. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { settle, refused } from "./page.mjs";
import { SCAN, UPLOAD, VERIFY, REJECT, DETAIL, invoice, scan, detail, opened, text } from "./finance-invoices-page.mjs";

const PNG = { type: "image/png", size: 3 };
const recorded = (scans = []) => detail({ status: "recorded", invoices: [invoice({ scans })] });
const uploaded = (extra = {}) => detail({ status: "uploaded", invoices: [invoice({ status: "uploaded", scans: [scan(extra)] })] });
const go = async (p, id = "sc-up") => { p.node[id].fire("click"); await settle(); };
const withFile = (p, file) => { p.node["sc-file"].files = [file]; };

test("a recorded invoice shows the upload box and reads no scan", async () => {
  const p = await opened(recorded());
  assert.equal(p.node["sc-card"].hidden, false);
  assert.equal(p.node["sc-upload"].hidden, false);
  assert.equal(p.node["sc-up-row"].hidden, false);
  assert.equal(p.node["sc-check"].hidden, true);
  assert.equal(p.sent(SCAN).length, 0);
  assert.equal(p.made.length, 0);
});

test("Upload builds a multipart form with the invoice and the scan, and no hand-set Content-Type", async () => {
  const file = new Blob(["%PDF-1.4 sample"], { type: "application/pdf" });
  const p = await opened(recorded(), { [UPLOAD]: [201, scan()] });
  withFile(p, file);
  await go(p);
  const call = p.sent(UPLOAD)[0];
  assert.equal(call.method, "POST");
  assert.equal(call.credentials, "include");
  assert.equal(call.headers, undefined, "the browser writes the content type with the boundary");
  assert.ok(call.body instanceof FormData);
  assert.deepEqual([...call.body.keys()].sort(), ["invoice", "scan"]);
  assert.equal(call.body.get("invoice"), "inv_one");
  assert.equal(call.body.get("scan").size, file.size);
  assert.equal(text(p, "s-msg"), "Uploaded. The scan now waits for verification.");
  assert.equal(p.sent(DETAIL).length, 2, "the sale is read again");
});

test("the courtesy check refuses no file, a wrong type and a file over 8 MB without calling", async () => {
  const p = await opened(recorded());
  await go(p);
  assert.equal(text(p, "up-err"), "Choose a file first.");
  withFile(p, { type: "text/plain", size: 10 });
  await go(p);
  assert.equal(text(p, "up-err"), "Use a JPEG, PNG or PDF file.");
  withFile(p, { type: "image/png", size: 8 * 1024 * 1024 + 1 });
  await go(p);
  assert.equal(text(p, "up-err"), "The file is over 8 MB.");
  withFile(p, { type: "image/jpeg", size: 8 * 1024 * 1024 });
  assert.equal(p.sent(UPLOAD).length, 0);
});

test("the upload's refusals are worded", async () => {
  const cases = [
    [[409, refused("duplicate_scan")], "This file is already attached to an invoice."],
    [[409, refused("not_recorded")], "This invoice is not waiting for a scan.", "s-msg"],
    [[503, refused("scan_store_unavailable")], "The scan could not be stored. Try again in a moment."],
    [[400, { error: { code: "invalid_request", message: "x", fields: { scan: ["The file is too large."] } } }], "Use a JPEG, PNG or PDF file, up to 8 MB."],
    [[500], "That did not go through. Check the sale before trying again."],
    ["offline", "That did not go through. Check the sale before trying again."],
  ];
  for (const [reply, words, where = "up-err"] of cases) {
    const p = await opened(recorded(), { [UPLOAD]: reply });
    withFile(p, new Blob(["x"], { type: "image/png" }));
    await go(p);
    assert.equal(text(p, where), words, words);
    assert.doesNotMatch(text(p, where), /A message the page does not show/);
  }
});

test("an upload for a sale that is gone returns to the queue", async () => {
  const p = await opened(recorded(), { [UPLOAD]: [404, refused("not_found")] });
  withFile(p, new Blob(["x"], { type: "image/png" }));
  await go(p);
  assert.deepEqual(p.shown(), ["v-queue"]);
});

test("an uploaded image is read through NOHq.file, held, shown from an object address and released on close", async () => {
  const p = await opened(uploaded(), { [SCAN]: [200, PNG] });
  assert.deepEqual(p.sent(SCAN).map((c) => c.body), [{ scan: "sc_one" }]);
  assert.equal(p.node["sc-upload"].hidden, true);
  assert.equal(p.node["sc-check"].hidden, false);
  assert.equal(p.node["sc-img"].hidden, false);
  assert.equal(p.node["sc-img"].getAttribute("src"), "blob:held/1");
  assert.equal(p.node["sc-file-tile"].hidden, true);
  assert.equal(p.node["sc-preview"].getAttribute("href"), "blob:held/1");
  assert.equal(p.node["sc-preview"].hidden, false);
  assert.equal(p.freed.length, 0);
  p.node["s-back"].fire("click");
  await settle();
  assert.deepEqual(p.freed, ["blob:held/1"]);
  assert.equal(p.node["sc-img"].hasAttribute("src"), false);
});

test("a PDF is a file tile with a Preview, never drawn in the page, and any other type is never shown", async () => {
  const pdf = await opened(uploaded({ content_type: "application/pdf" }), { [SCAN]: [200, { type: "application/pdf", size: 3 }] });
  assert.equal(pdf.node["sc-file-tile"].hidden, false);
  assert.equal(pdf.node["sc-img"].hidden, true);
  assert.equal(pdf.node["sc-preview"].getAttribute("href"), "blob:held/1");
  const odd = await opened(uploaded(), { [SCAN]: [200, { type: "text/html", size: 3 }] });
  assert.equal(odd.node["sc-img"].hidden, true);
  assert.equal(odd.node["sc-file-tile"].hidden, true);
  assert.equal(odd.node["sc-preview"].hidden, true);
  assert.equal(odd.node["sc-err"].hidden, false);
  assert.equal(odd.made.length, 0);
});

test("a scan that cannot be read says so and Try again reads it again", async () => {
  let n = 0;
  const p = await opened(uploaded(), { [SCAN]: () => (++n === 1 ? [503, refused("scan_store_unavailable")] : [200, PNG]) });
  assert.equal(p.node["sc-err"].hidden, false);
  p.node["sc-retry"].fire("click");
  await settle();
  assert.equal(p.node["sc-err"].hidden, true);
  assert.equal(p.node["sc-img"].hidden, false);
  assert.equal(p.sent(SCAN).length, 2);
});

test("the invoice values sit beside the scan, and the Subscriber still sees the pending line", async () => {
  const p = await opened(uploaded(), { [SCAN]: [200, PNG] });
  assert.deepEqual(p.node["sc-kv"].children.map((d) => [d.children[0].textContent, d.children[1].textContent]),
    [["Serial", "SAMPLE-A0012"], ["Issue date", "Nov 10, 2026"], ["Amount due", "PHP 2,499.00"], ["Buyer", "Sample Buyer Name"]]);
  assert.equal(text(p, "s-status"), "Awaiting verification");
  assert.equal(text(p, "s-sees"), "Payment received, invoice copy pending.");
  assert.equal(text(p, "m-verify-sub"), "SAMPLE-A0012 · Nov 10, 2026 · PHP 2,499.00");
});

test("Verify opens a confirmation with no tick boxes and sends only the scan", async () => {
  let done = false;
  const p = await opened(uploaded(), { [SCAN]: [200, PNG], [VERIFY]: () => { done = true; return [200, scan({ status: "verified" })]; },
    [DETAIL]: () => [200, done ? detail({ status: "verified", invoices: [invoice({ status: "verified", scans: [scan({ status: "verified" })] })] }) : uploaded()] });
  p.node["sc-verify"].fire("click");
  assert.equal(p.node["m-verify"].hidden, false);
  assert.equal(p.doc.activeElement, p.node["verify-cancel"], "Cancel takes the focus, so Enter does not verify by accident");
  assert.equal(p.node["verify-form"].all((n) => n.tagName === "INPUT").length, 0);
  p.node["verify-form"].fire("submit");
  await settle();
  assert.deepEqual(p.sent(VERIFY)[0].body, { scan: "sc_one" });
  assert.equal(p.node["m-verify"].hidden, true);
  assert.equal(text(p, "s-msg"), "Scan verified.");
  assert.equal(text(p, "s-status"), "Verified");
  assert.equal(p.node["sc-check"].hidden, true, "no verify or reject after verifying");
  assert.equal(p.node["sc-done"].hidden, false);
  assert.equal(p.node["sc-up-row"].hidden, true, "no replace after verify");
  assert.equal(text(p, "s-sees"), "The Subscriber can open this copy.");
});

test("Reject needs one of the four reasons, sends the scan and the reason and no note, and the invoice goes back to awaiting upload", async () => {
  let done = false;
  const after = detail({ status: "recorded", invoices: [invoice({ scans: [scan({ status: "rejected", reject_reason: "unreadable" })] })] });
  const p = await opened(uploaded(), { [SCAN]: [200, PNG], [REJECT]: () => { done = true; return [200, scan({ status: "rejected", reject_reason: "unreadable" })]; },
    [DETAIL]: () => [200, done ? after : uploaded()] });
  p.node["sc-reject"].fire("click");
  assert.equal(p.node["m-reject"].hidden, false);
  p.node["reject-form"].fire("submit");
  await settle();
  assert.equal(text(p, "reject-e"), "Choose a reason.");
  assert.equal(p.sent(REJECT).length, 0);
  p.node["reject-f"].value = "unreadable";
  p.node["reject-form"].fire("submit");
  await settle();
  assert.deepEqual(p.sent(REJECT)[0].body, { scan: "sc_one", reason: "unreadable" });
  assert.equal(p.node["m-reject"].hidden, true);
  assert.equal(text(p, "s-msg"), "Scan rejected. The invoice is back to awaiting upload.");
  assert.equal(text(p, "s-status"), "Scan rejected");
  assert.equal(text(p, "s-rejected"), "The last file was rejected: the file cannot be read. Upload a new file.");
  assert.equal(p.node["sc-upload"].hidden, false, "a new file can be uploaded");
  assert.equal(p.node["sc-img"].hidden, true, "a rejected scan is not shown again");
  assert.equal(p.node["sc-check"].hidden, true);
});

test("the reason list offers exactly the four reasons the backend knows", async () => {
  const html = fs.readFileSync(new URL("../public/finance-invoices.html", import.meta.url), "utf8");
  const list = /<select[^>]*id="reject-f"[^>]*>(.*?)<\/select>/.exec(html)[1];
  assert.deepEqual([...list.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]), ["", "unreadable", "wrong_invoice", "amount_mismatch", "other"]);
  assert.doesNotMatch(html, /id="reject-note"|<textarea[^>]*id="reject/, "the route takes no note");
});

test("a decision on a scan that is no longer waiting is worded and the sale is read again", async () => {
  for (const [route, button, form] of [[VERIFY, "sc-verify", "verify-form"], [REJECT, "sc-reject", "reject-form"]]) {
    const p = await opened(uploaded(), { [SCAN]: [200, PNG], [route]: [409, refused("not_uploaded")] });
    p.node[button].fire("click");
    p.node["reject-f"].value = "other";
    p.node[form].fire("submit");
    await settle();
    const e = route === VERIFY ? "verify-e" : "reject-e";
    assert.equal(text(p, e), "This scan is not waiting for a decision.");
    assert.equal(p.sent(DETAIL).length, 2);
  }
});

test("a decision that fails is worded and a missing scan returns to the queue", async () => {
  const bad = await opened(uploaded(), { [SCAN]: [200, PNG], [VERIFY]: [500] });
  bad.node["sc-verify"].fire("click"); bad.node["verify-form"].fire("submit"); await settle();
  assert.match(text(bad, "verify-e"), /did not go through/);
  const gone = await opened(uploaded(), { [SCAN]: [200, PNG], [REJECT]: [404, refused("not_found")] });
  gone.node["sc-reject"].fire("click"); gone.node["reject-f"].value = "other"; gone.node["reject-form"].fire("submit"); await settle();
  assert.deepEqual(gone.shown(), ["v-queue"]);
});

test("a verified sale reads its scan once for viewing and offers no replace or remove", async () => {
  const live = detail({ status: "verified", invoices: [invoice({ status: "verified", scans: [scan({ status: "verified" })] })] });
  const p = await opened(live, { [SCAN]: [200, PNG] });
  assert.equal(p.sent(SCAN).length, 1);
  assert.equal(p.node["sc-img"].hidden, false);
  assert.equal(p.node["sc-done"].hidden, false);
  assert.equal(p.node["sc-upload"].hidden, true);
  assert.equal(p.node["sc-up-row"].hidden, true);
  assert.equal(p.node["sc-check"].hidden, true, "no verify or reject once verified");
});

test("an earlier rejected scan never hides the current one: the latest live scan is the one read", async () => {
  const live = detail({ status: "uploaded", invoices: [invoice({ status: "uploaded", scans: [scan({ scan: "sc_old", status: "rejected", reject_reason: "other" }), scan({ scan: "sc_new" })] })] });
  const p = await opened(live, { [SCAN]: [200, PNG] });
  assert.deepEqual(p.sent(SCAN).map((c) => c.body), [{ scan: "sc_new" }]);
});
