/* settings.js, the SMS Gateway card (ClickUp z8uq9mh7pq, plan 8.1): the five states, the off state, a server with no
   address, the one-time token screen (Copy, Done clears it), the code dialog's checks, and that the token is
   never written to any storage or sent anywhere. A fixed clock; no DOM library. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { open, settle, BASE } from "./page.mjs";

const IDS = ["boot", "v-main", "v-down", "retry", "o-load", "o-off", "o-down", "o-retry", "o-body", "o-msg", "o-cur", "o-name", "o-pid",
  "o-form", "o-site", "o-err", "o-save", "o-clear", "s-load", "s-off", "s-down", "s-retry", "s-body", "s-msg", "s-form", "s-stop", "s-stop-err",
  "s-platform", "s-platform-err", "s-site", "s-site-err", "s-bulk-field", "s-bulk", "s-bulk-err", "s-err", "s-when", "s-save",
  "g-chip", "g-load", "g-off", "g-down", "g-retry", "g-body", "g-msg", "g-note", "g-addr", "g-addr-copy", "g-name", "g-enabled", "g-poll", "g-poll-at", "g-incoming",
  "g-register", "g-rotate", "g-disable", "g-refresh",
  "m-gw", "m-gw-h", "m-gw-sub", "gw-x", "gw-name-field", "gw-name", "gw-code-field", "gw-code", "gw-ack-field", "gw-ack", "gw-err", "gw-go", "gw-cancel",
  "m-token", "tk-token", "tk-copy", "tk-copied", "tk-addr", "tk-addr-copy", "tk-done",
  "m-confirm", "m-confirm-h", "m-confirm-sub", "confirm-x", "confirm-err", "confirm-go", "confirm-cancel",
  "acct-row", "acct-ini", "acct-name", "acct-btn", "acct-menu", "menu-ini", "menu-name", "menu-email", "menu-theme", "menu-sun",
  "menu-moon", "menu-theme-label", "sign-out", "sign-out-0", "sign-out-2", "sign-out-err", "theme-toggle", "theme-toggle-2"];
const NOW = Date.parse("2026-11-20T10:00:00+08:00");
const ADDR = "https://gateway.example.test";
const TOKEN = "K7MX4QPA";
const ago = (s) => new Date(NOW - s * 1000).toISOString();
const DEV = (o = {}) => ({ name: "system", enabled: true, forwards_incoming: false, last_poll_at: null, app_version: null, battery: null, charging: null, connection: "waiting", ...o });
const get = (device, address = ADDR) => [200, { server_address: address, device }];
const KEYS = { get: "POST sms/device/get/", reg: "POST sms/device/register/", rot: "POST sms/device/rotate/", dis: "POST sms/device/disable/" };

class FixedDate extends Date {
  constructor(...a) { super(...(a.length ? a : [NOW])); }
  static now() { return NOW; }
}

async function page(table, extra = {}) {
  const stored = [];
  const store = { setItem: (k, v) => stored.push([k, v]), getItem: () => null, removeItem() {}, clear() {} };
  const writes = [];
  const navigator = extra.navigator === null ? undefined : { clipboard: { writeText: (t) => { writes.push(t); return Promise.resolve(); } } };
  const p = open(["hq.js", "shell.js", "finance-common.js", "settings.js"], { ids: IDS, pathname: "/settings/",
    globals: { Date: FixedDate, localStorage: store, sessionStorage: store, navigator },
    answers: (call) => {
      const key = call.method + " " + call.url.slice(BASE.length + 1);
      if (key === "GET me/") return [200, { email: "sample.staff@example.com", expires_at: "2026-11-20T21:01:00+08:00" }];
      if (key === "POST sante/owner/get/") return [200, { owner: null, candidates: [] }];
      if (key === "POST sms/policy/get/") return [200, { sending_stopped: false, platform_daily_limit: 10, site_daily_limit: 5, updated_at: null }];
      assert.ok(Object.prototype.hasOwnProperty.call(table, key), "unexpected call: " + key);
      const r = table[key];
      return typeof r === "function" ? r(call) : r;
    } });
  await settle();
  return { ...p, stored, writes, sent: (key) => p.calls.filter((c) => c.method + " " + c.url.slice(BASE.length + 1) === key) };
}
const text = (p, id) => p.node[id].textContent;
const click = async (p, id) => { p.node[id].fire("click"); await settle(); };
const everything = (p) => p.doc.body.all().map((n) => n.textContent + "|" + n.value + "|" + JSON.stringify(n.attrs)).join("\n");

test("no phone: grey chip, Register offered, nothing else", async () => {
  const p = await page({ [KEYS.get]: get(null) });
  assert.equal(text(p, "g-chip"), "No phone");
  assert.match(text(p, "g-note"), /No phone is registered for this server\./);
  assert.equal(text(p, "g-addr"), ADDR);
  assert.equal(p.node["g-addr-copy"].hidden, false);
  assert.deepEqual(["g-register", "g-rotate", "g-disable"].map((id) => p.node[id].hidden), [false, true, true]);
  assert.equal(p.node["g-body"].hidden, false);
});

test("waiting for phone: registered, never polled", async () => {
  const p = await page({ [KEYS.get]: get(DEV()) });
  assert.equal(text(p, "g-chip"), "Waiting for phone");
  assert.match(text(p, "g-note"), /Enter the token in the Android app/);
  assert.equal(text(p, "g-name"), "system");
  assert.equal(text(p, "g-enabled"), "Yes");
  assert.equal(text(p, "g-poll"), "Never");
  assert.equal(text(p, "g-incoming"), "Off");
  assert.deepEqual(["g-register", "g-rotate", "g-disable"].map((id) => p.node[id].hidden), [true, false, false]);
});

test("connected: green chip, relative poll, app version and battery", async () => {
  const p = await page({ [KEYS.get]: get(DEV({ connection: "connected", last_poll_at: ago(12), app_version: "1.4.0", battery: 81, charging: true, forwards_incoming: true })) });
  assert.equal(text(p, "g-chip"), "Connected");
  assert.match(p.node["g-chip"].getAttribute("class"), /chip-ok/);
  assert.match(text(p, "g-note"), /^Last poll just now, app version 1\.4\.0, battery 81% \(charging\)\.$/);
  assert.equal(text(p, "g-poll"), "just now");
  assert.equal(text(p, "g-poll-at"), "Nov 20, 2026, 9:59 AM");
  assert.equal(text(p, "g-incoming"), "On");
});

test("offline: amber chip and the refusal sentence", async () => {
  const p = await page({ [KEYS.get]: get(DEV({ connection: "offline", last_poll_at: ago(14 * 60) })) });
  assert.equal(text(p, "g-chip"), "Offline");
  assert.match(p.node["g-chip"].getAttribute("class"), /chip-warn/);
  assert.equal(text(p, "g-note"), "Last poll 14 minutes ago. Texts are being refused until the phone is back.");
});

test("a connection word this page does not know is worked out from the last poll", async () => {
  const a = await page({ [KEYS.get]: get(DEV({ connection: "?", last_poll_at: ago(30) })) });
  assert.equal(text(a, "g-chip"), "Connected");
  const b = await page({ [KEYS.get]: get(DEV({ connection: "?", last_poll_at: ago(300) })) });
  assert.equal(text(b, "g-chip"), "Offline");
});

test("disabled: grey chip, Add phone offered, Rotate and Disable are not", async () => {
  const p = await page({ [KEYS.get]: get(DEV({ enabled: false, connection: "disabled" })) });
  assert.equal(text(p, "g-chip"), "Disabled");
  assert.match(text(p, "g-note"), /Add a phone to replace it\./);
  assert.doesNotMatch(text(p, "g-note"), /does not re-enable/);
  assert.equal(text(p, "g-enabled"), "No");
  assert.deepEqual(["g-register", "g-rotate", "g-disable"].map((id) => p.node[id].hidden), [false, true, true]);
  assert.equal(text(p, "g-register"), "Add phone");
});

test("disabled without a server address: Add phone is not offered", async () => {
  const p = await page({ [KEYS.get]: get(DEV({ enabled: false, connection: "disabled" }), "") });
  assert.equal(p.node["g-register"].hidden, true);
});

test("Add phone (replace): name and code are required, then name, code and confirm are sent and the token screen opens", async () => {
  const p = await page({ [KEYS.get]: get(DEV({ enabled: false, connection: "disabled" })), [KEYS.reg]: [200, { token: TOKEN, server_address: ADDR, device: DEV({ name: "newphone" }) }] });
  await click(p, "g-register");
  assert.equal(p.node["m-gw"].hidden, false);
  assert.equal(text(p, "m-gw-h"), "Add phone");
  assert.match(text(p, "m-gw-sub"), /This replaces the disabled phone\. The old phone stays switched off\./);
  assert.equal(text(p, "gw-go"), "Add phone");
  assert.equal(p.node["gw-name-field"].hidden, false);
  assert.equal(p.node["gw-code-field"].hidden, false);
  assert.equal(p.node["gw-ack-field"].hidden, true);
  await click(p, "gw-go");
  assert.equal(text(p, "gw-err"), "Enter a name for the phone.");
  p.node["gw-name"].value = "newphone";
  await click(p, "gw-go");
  assert.equal(text(p, "gw-err"), "Enter the 6-digit code from your authenticator app.");
  assert.equal(p.sent(KEYS.reg).length, 0);
  p.node["gw-code"].value = "123456";
  await click(p, "gw-go");
  assert.deepEqual(p.sent(KEYS.reg)[0].body, { name: "newphone", code: "123456", confirm: true });
  assert.equal(p.node["m-gw"].hidden, true);
  assert.equal(p.node["m-token"].hidden, false);
  assert.equal(p.node["tk-token"].value, TOKEN);
  await click(p, "tk-done");
  assert.equal(text(p, "g-chip"), "Waiting for phone");
  assert.equal(p.node["g-register"].hidden, true);
});

test("Add phone (replace): a refused code is shown with the wait copy and the code field flagged", async () => {
  const p = await page({ [KEYS.get]: get(DEV({ enabled: false, connection: "disabled" })), [KEYS.reg]: [403, { error: { code: "reauth_failed", message: "Code refused.", fields: {} } }] });
  await click(p, "g-register");
  p.node["gw-name"].value = "newphone";
  p.node["gw-code"].value = "123456";
  await click(p, "gw-go");
  assert.match(text(p, "gw-err"), /wait for the next code/);
  assert.equal(p.node["gw-code"].getAttribute("aria-invalid"), "true");
  assert.equal(p.node["m-gw"].hidden, false);
});

test("404: switched off, no controls", async () => {
  const p = await page({ [KEYS.get]: [404, {}] });
  assert.equal(p.node["g-off"].hidden, false);
  assert.match(fs.readFileSync(new URL("../public/settings.html", import.meta.url), "utf8"), /id="g-off" hidden>SMS Gateway is switched off on this server\.</);
  assert.equal(p.node["g-body"].hidden, true);
  assert.equal(p.node["g-chip"].hidden, true);
});

test("a failed read shows the try-again line", async () => {
  const p = await page({ [KEYS.get]: [500, {}] });
  assert.equal(p.node["g-down"].hidden, false);
  assert.equal(p.node["g-body"].hidden, true);
});

test("no server address: Not configured, no Copy, no Register or Rotate", async () => {
  for (const device of [null, DEV()]) {
    const p = await page({ [KEYS.get]: get(device, "") });
    assert.equal(text(p, "g-addr"), "Not configured");
    assert.equal(p.node["g-addr-copy"].hidden, true);
    assert.equal(p.node["g-register"].hidden, true);
    assert.equal(p.node["g-rotate"].hidden, true);
    assert.match(text(p, "g-note"), /server address is not configured/);
  }
});

test("Copy on the card copies the server address", async () => {
  const p = await page({ [KEYS.get]: get(null) });
  await click(p, "g-addr-copy");
  assert.deepEqual(p.writes, [ADDR]);
});

test("Register: the name is required, then name and confirm are sent and the token screen opens", async () => {
  const p = await page({ [KEYS.get]: get(null), [KEYS.reg]: [200, { token: TOKEN, server_address: ADDR, device: DEV() }] });
  await click(p, "g-register");
  assert.equal(p.node["m-gw"].hidden, false);
  assert.equal(p.node["gw-code-field"].hidden, true);
  await click(p, "gw-go");
  assert.equal(text(p, "gw-err"), "Enter a name for the phone.");
  assert.equal(p.sent(KEYS.reg).length, 0);
  p.node["gw-name"].value = "  system ";
  await click(p, "gw-go");
  assert.deepEqual(p.sent(KEYS.reg)[0].body, { name: "system", confirm: true });
  assert.equal(p.node["m-gw"].hidden, true);
  assert.equal(p.node["m-token"].hidden, false);
  assert.equal(p.node["tk-token"].value, TOKEN);
  assert.equal(p.node["tk-token"].hasAttribute("readonly"), false, "set in the page markup, not by script");
  assert.equal(text(p, "tk-addr"), ADDR);
  await click(p, "tk-done");
  assert.equal(text(p, "g-chip"), "Waiting for phone");
});

test("the token screen: Copy copies the token, Escape does not close it, Done clears every trace", async () => {
  const p = await page({ [KEYS.get]: get(null), [KEYS.reg]: [200, { token: TOKEN, server_address: ADDR, device: DEV() }] });
  await click(p, "g-register");
  p.node["gw-name"].value = "system";
  await click(p, "gw-go");
  await click(p, "tk-copy");
  assert.deepEqual(p.writes, [TOKEN]);
  assert.equal(text(p, "tk-copy"), "Copied");
  p.doc.fire("keydown", { key: "Escape" });
  assert.equal(p.node["m-token"].hidden, false, "Escape never loses the one-time token");
  await click(p, "tk-addr-copy");
  assert.deepEqual(p.writes, [TOKEN, ADDR]);
  assert.ok(everything(p).includes(TOKEN));
  await click(p, "tk-done");
  assert.equal(p.node["m-token"].hidden, true);
  assert.equal(p.node["tk-token"].value, "");
  assert.ok(!everything(p).includes(TOKEN), "the token is gone from the page");
  await click(p, "tk-copy");
  assert.deepEqual(p.writes, [TOKEN, ADDR], "Copy after Done has nothing to copy");
  assert.equal(p.sent(KEYS.get).length, 1, "Done repaints from the answer");
});

test("the token is never written to storage, a URL, or a later request", async () => {
  const p = await page({ [KEYS.get]: get(null), [KEYS.reg]: [200, { token: TOKEN, server_address: ADDR, device: DEV() }] });
  await click(p, "g-register");
  p.node["gw-name"].value = "system";
  await click(p, "gw-go");
  await click(p, "tk-done");
  assert.deepEqual(p.stored, []);
  assert.equal(p.doc.cookie, "");
  assert.equal(p.location.assigned, null);
  assert.ok(!JSON.stringify(p.calls).includes(TOKEN));
  assert.ok(!p.location.pathname.includes(TOKEN));
});

test("Copy falls back to a hidden textarea where the clipboard API is missing", async () => {
  const p = await page({ [KEYS.get]: get(null), [KEYS.reg]: [200, { token: TOKEN, server_address: ADDR, device: DEV() }] }, { navigator: null });
  const copied = [];
  p.doc.execCommand = (c) => { copied.push([c, p.doc.selected && p.doc.selected.value !== undefined ? p.doc.selected.textContent : ""]); return true; };
  await click(p, "g-register");
  p.node["gw-name"].value = "system";
  await click(p, "gw-go");
  await click(p, "tk-copy");
  assert.deepEqual(copied, [["copy", TOKEN]]);
  assert.equal(text(p, "tk-copy"), "Copied");
  assert.ok(!p.doc.body.all((n) => n.tagName === "TEXTAREA").length, "the textarea is removed again");
});

test("a failed Copy says so and keeps the token for selecting", async () => {
  const p = await page({ [KEYS.get]: get(null), [KEYS.reg]: [200, { token: TOKEN, server_address: ADDR, device: DEV() }] }, { navigator: null });
  p.doc.execCommand = () => false;
  await click(p, "g-register");
  p.node["gw-name"].value = "system";
  await click(p, "gw-go");
  await click(p, "tk-copy");
  assert.match(text(p, "tk-copied"), /Copy did not work/);
  assert.equal(p.node["tk-token"].value, TOKEN);
});

const err = (code, message = "Backend words.", fields = {}) => ({ error: { code, message, fields } });
const reg = async (p, name = "system") => { await click(p, "g-register"); p.node["gw-name"].value = name; await click(p, "gw-go"); };

test("Register checks the name format in the page before sending", async () => {
  const p = await page({ [KEYS.get]: get(null) });
  for (const bad of ["Platform phone", "SYSTEM", "sys_tem", "a".repeat(61)]) {
    await reg(p, bad);
    assert.match(text(p, "gw-err"), /lower-case letters, numbers and hyphens/);
    assert.equal(p.node["gw-name"].getAttribute("aria-invalid"), "true");
    p.node["gw-name"].value = "";
  }
  assert.equal(p.sent(KEYS.reg).length, 0);
});

test("Register errors by code: invalid_name, name_taken", async () => {
  let reply = [400, err("invalid_name", "Bad name from backend.")];
  const p = await page({ [KEYS.get]: get(null), [KEYS.reg]: () => reply });
  await reg(p);
  assert.equal(text(p, "gw-err"), "Bad name from backend.");
  assert.equal(p.node["m-gw"].hidden, false);
  reply = [409, err("name_taken")];
  await click(p, "gw-go");
  assert.equal(text(p, "gw-err"), "That name is already in use.");
});

test("Rotate: 409 device_disabled says so and reloads", async () => {
  const p = await page({ [KEYS.get]: connected(), [KEYS.rot]: [409, err("device_disabled")] });
  await click(p, "g-rotate");
  p.node["gw-code"].value = "123456"; p.node["gw-ack"].checked = true;
  await click(p, "gw-go");
  assert.equal(text(p, "gw-err"), "This phone is disabled.");
  assert.equal(p.sent(KEYS.get).length, 2);
});

test("reauth_failed shows the backend message and the 30-second hint", async () => {
  const p = await page({ [KEYS.get]: connected(), [KEYS.dis]: [403, err("reauth_failed", "Code refused.")] });
  await click(p, "g-disable");
  p.node["gw-code"].value = "123456";
  await click(p, "gw-go");
  assert.equal(text(p, "gw-err"), "Code refused. If you just signed in, wait for the next code (about 30 seconds).");
  assert.equal(p.node["m-gw"].hidden, false);
});

test("a 401 is a session problem: sent to sign in, not called a wrong code", async () => {
  const p = await page({ [KEYS.get]: connected(), [KEYS.dis]: [401, err("unauthenticated")] });
  await click(p, "g-disable");
  p.node["gw-code"].value = "123456";
  await click(p, "gw-go");
  assert.equal(p.location.replaced, "/sign-in/");
  assert.doesNotMatch(text(p, "gw-err"), /code/i);
  const q = await page({ [KEYS.get]: connected(), [KEYS.rot]: [401, err("second_step_required")] });
  await click(q, "g-rotate");
  q.node["gw-code"].value = "123456"; q.node["gw-ack"].checked = true;
  await click(q, "gw-go");
  assert.equal(q.location.replaced, "/verify/");
});

test("Done repaints from the register response, with its own address and device", async () => {
  const p = await page({ [KEYS.get]: get(null), [KEYS.reg]: [200, { token: TOKEN, server_address: "https://other.example.test", device: DEV({ name: "system" }) }] });
  await reg(p);
  await click(p, "tk-done");
  assert.equal(p.sent(KEYS.get).length, 1, "no second read");
  assert.equal(text(p, "g-addr"), "https://other.example.test");
  assert.equal(text(p, "g-chip"), "Waiting for phone");
  assert.ok(!everything(p).includes(TOKEN));
});

test("Register answered 409 phone_exists reloads the card and says a phone exists", async () => {
  const p = await page({ [KEYS.get]: get(null), [KEYS.reg]: [409, err("phone_exists")] });
  await click(p, "g-register");
  p.node["gw-name"].value = "system";
  await click(p, "gw-go");
  assert.equal(text(p, "gw-err"), "A phone is already registered.");
  assert.equal(p.node["m-token"].hidden, true);
});

const connected = () => get(DEV({ connection: "connected", last_poll_at: ago(5) }));

test("Rotate: the code must be 6 digits and I understand ticked before anything is sent", async () => {
  const p = await page({ [KEYS.get]: connected(), [KEYS.rot]: [200, { token: TOKEN, server_address: ADDR, device: DEV() }] });
  await click(p, "g-rotate");
  assert.match(text(p, "m-gw-sub"), /The previous token stops working immediately/);
  assert.equal(p.node["gw-name-field"].hidden, true);
  assert.equal(p.node["gw-ack-field"].hidden, false);
  for (const bad of ["", "12345", "1234567", "12345a", "123 456"]) {
    p.node["gw-code"].value = bad;
    p.node["gw-ack"].checked = true;
    await click(p, "gw-go");
    assert.equal(text(p, "gw-err"), "Enter the 6-digit code from your authenticator app.", "code: " + JSON.stringify(bad));
    assert.equal(p.node["gw-code"].getAttribute("aria-invalid"), "true");
  }
  p.node["gw-code"].value = "123456";
  p.node["gw-ack"].checked = false;
  await click(p, "gw-go");
  assert.match(text(p, "gw-err"), /I understand/);
  assert.equal(p.sent(KEYS.rot).length, 0);
  p.node["gw-ack"].checked = true;
  await click(p, "gw-go");
  assert.deepEqual(p.sent(KEYS.rot)[0].body, { name: "system", code: "123456", confirm: true });
  assert.equal(p.node["m-token"].hidden, false);
  assert.equal(p.node["tk-token"].value, TOKEN);
  assert.equal(p.node["gw-code"].value, "", "the code is cleared");
});

test("Rotate with a refused code keeps the dialog open with one message", async () => {
  const p = await page({ [KEYS.get]: connected(), [KEYS.rot]: [403, { error: { code: "reauth_failed", message: "A message the page does not show." } }] });
  await click(p, "g-rotate");
  p.node["gw-code"].value = "123456";
  p.node["gw-ack"].checked = true;
  await click(p, "gw-go");
  assert.match(text(p, "gw-err"), /wait for the next code/);
  assert.equal(p.node["m-gw"].hidden, false);
  assert.equal(p.node["m-token"].hidden, true);
  assert.equal(p.node["gw-go"].disabled, false);
});

test("Disable: needs a 6-digit code, sends name, code and confirm, then reloads", async () => {
  let disabled = false;
  const p = await page({ [KEYS.get]: () => (disabled ? get(DEV({ enabled: false, connection: "disabled" })) : connected()),
    [KEYS.dis]: () => { disabled = true; return get(DEV({ enabled: false, connection: "disabled" })); } });
  await click(p, "g-disable");
  assert.match(text(p, "m-gw-sub"), /No texts will be sent until a phone is registered/);
  assert.equal(p.node["gw-ack-field"].hidden, true);
  p.node["gw-code"].value = "12";
  await click(p, "gw-go");
  assert.equal(p.sent(KEYS.dis).length, 0);
  p.node["gw-code"].value = "654321";
  await click(p, "gw-go");
  assert.deepEqual(p.sent(KEYS.dis)[0].body, { name: "system", code: "654321", confirm: true });
  assert.equal(p.node["m-gw"].hidden, true);
  assert.equal(text(p, "g-chip"), "Disabled");
  assert.equal(text(p, "g-msg"), "Phone disabled.");
  assert.equal(p.sent(KEYS.get).length, 1, "repainted from the disable answer, no second read");
});

test("Cancel in the dialog sends nothing and clears the code", async () => {
  const p = await page({ [KEYS.get]: connected() });
  await click(p, "g-disable");
  p.node["gw-code"].value = "123456";
  await click(p, "gw-cancel");
  assert.equal(p.node["m-gw"].hidden, true);
  assert.equal(p.node["gw-code"].value, "");
  assert.equal(p.calls.filter((c) => /device\/(register|rotate|disable)/.test(c.url)).length, 0);
});

test("a route that answers 404 while acting turns the card off", async () => {
  const p = await page({ [KEYS.get]: get(null), [KEYS.reg]: [404, {}] });
  await click(p, "g-register");
  p.node["gw-name"].value = "system";
  await click(p, "gw-go");
  assert.equal(p.node["g-off"].hidden, false);
  assert.equal(p.node["m-gw"].hidden, true);
});
