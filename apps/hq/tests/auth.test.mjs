/* auth.js: the sign-in, code and second-step views, the recovery form and the "Sign-in paused" notice
   (design 22.3). The page shows what the backend's answer leads to and checks no code itself. */
import test from "node:test";
import assert from "node:assert/strict";
import { open, settle, BASE, refused } from "./page.mjs";

const VIEWS = ["sign-in", "code", "verify", "paused", "down"];
const IDS = ["boot", ...VIEWS.map((v) => "v-" + v), "email", "email-err", "code", "code-err", "code-sent",
  "code-notice", "second", "second-err", "second-label", "second-lead", "second-switch", "theme-toggle"];
const SIGNED_OUT = [401, refused("unauthenticated")];
const HALFWAY = [401, refused("second_step_required")];
const SIGNED_IN = [200, { email: "sample.staff@example.com", expires_at: "2026-11-11T21:01:00+08:00" }];

/* table: "METHOD path" to a list of answers, used in order; the last one repeats. */
async function page(pathname, table) {
  const p = open(["hq.js", "auth.js"], { ids: IDS, pathname, answers: (call) => {
    const list = table[call.method + " " + call.url.slice(BASE.length + 1)];
    assert.ok(list, "unexpected call: " + call.method + " " + call.url);
    return list.length > 1 ? list.shift() : list[0];
  } });
  await settle();
  p.shown = () => VIEWS.filter((v) => !p.node["v-" + v].hidden);
  p.submit = async (view, field, value) => {
    p.node[field].value = value;
    const event = p.node["v-" + view].fire("submit");
    assert.equal(event.prevented, true, "the browser must not send the form itself");
    await settle();
  };
  p.posts = () => p.calls.filter((c) => c.method === "POST");
  return p;
}

test("a signed-out person sees the email form, and the page asked only me/", async () => {
  const p = await page("/sign-in/", { "GET me/": [SIGNED_OUT] });
  assert.deepEqual(p.shown(), ["sign-in"]);
  assert.equal(p.node.boot.hidden, true);
  assert.deepEqual(p.calls.map((c) => c.method + " " + c.url), ["GET " + BASE + "/me/"]);
  assert.equal(p.calls[0].credentials, "include");
});

test("a person who passed the first step is taken to the second, whatever address they opened", async () => {
  const p = await page("/sign-in/", { "GET me/": [HALFWAY] });
  assert.deepEqual(p.shown(), ["verify"]);
  assert.equal(p.location.pathname, "/verify/");
});

test("a signed-out person who opens the second step is taken to the email form", async () => {
  const p = await page("/verify/", { "GET me/": [SIGNED_OUT] });
  assert.deepEqual(p.shown(), ["sign-in"]);
  assert.equal(p.location.pathname, "/sign-in/");
});

test("a signed-in person is sent to the console", async () => {
  const p = await page("/sign-in/", { "GET me/": [SIGNED_IN] });
  assert.equal(p.location.replaced, "/");
  assert.deepEqual(p.shown(), []);
});

test("no answer, a refused origin and a server error all show the same plain state", async () => {
  for (const reply of ["offline", [403, refused("origin_not_allowed")], [500, refused("server_error")], [404]]) {
    const p = await page("/sign-in/", { "GET me/": [reply] });
    assert.deepEqual(p.shown(), ["down"]);
  }
});

test("the email form sends the address, then shows the code form with the address from memory", async () => {
  const p = await page("/sign-in/", { "GET me/": [SIGNED_OUT], "POST sign-in/": [[204]] });
  await p.submit("sign-in", "email", "  Sample.Staff@example.com ");
  assert.deepEqual(p.posts()[0].body, { email: "Sample.Staff@example.com" });
  assert.deepEqual(p.shown(), ["code"]);
  assert.equal(p.location.pathname, "/code/");
  assert.equal(p.node["code-sent"].textContent, "Code sent to Sample.Staff@example.com.");
  assert.equal(p.node["code-notice"].hidden, false);
});

test("after a reload on /code/ the page does not know the address", async () => {
  const p = await page("/code/", { "GET me/": [SIGNED_OUT] });
  assert.deepEqual(p.shown(), ["code"]);
  assert.equal(p.node["code-sent"].textContent, "Code sent to your email.");
  assert.equal(p.node["code-notice"].hidden, true);
});

test("an empty address is not sent, and a refused one shows the Django page's words", async () => {
  const p = await page("/sign-in/", { "GET me/": [SIGNED_OUT], "POST sign-in/": [[400, refused("invalid_email")]] });
  await p.submit("sign-in", "email", "   ");
  assert.equal(p.posts().length, 0);
  assert.equal(p.node["email-err"].textContent, "Enter an email address.");
  await p.submit("sign-in", "email", "not-an-address");
  assert.equal(p.posts().length, 1);
  assert.deepEqual(p.shown(), ["sign-in"]);
  assert.equal(p.node["email-err"].hidden, false);
  assert.equal(p.node.email.getAttribute("aria-invalid"), "true");
});

test("a code that is not six digits is not sent; a wrong one says so without a reason", async () => {
  const p = await page("/code/", { "GET me/": [SIGNED_OUT], "POST sign-in/code/": [[400, refused("invalid_code")]] });
  await p.submit("code", "code", "12 34");
  assert.equal(p.posts().length, 0);
  await p.submit("code", "code", "123 456");
  assert.deepEqual(p.posts()[0].body, { code: "123456" });
  assert.deepEqual(p.shown(), ["code"]);
  assert.equal(p.node["code-err"].textContent, "That code did not work. Check it, or get a new code.");
});

test("a right code shows the second step", async () => {
  const p = await page("/code/", { "GET me/": [SIGNED_OUT], "POST sign-in/code/": [[204]] });
  await p.submit("code", "code", "123456");
  assert.deepEqual(p.shown(), ["verify"]);
  assert.equal(p.location.pathname, "/verify/");
  assert.equal(p.node["second-label"].textContent, "Authenticator code");
});

test("a right second step asks me/ again and follows it", async () => {
  const p = await page("/verify/", { "GET me/": [HALFWAY, SIGNED_IN], "POST sign-in/verify/": [[204]] });
  await p.submit("verify", "second", "654321");
  assert.deepEqual(p.posts()[0].body, { code: "654321" });
  assert.equal(p.location.replaced, "/");
});

test("a wrong second step says so; the fifth shows the paused notice; a lost session returns to the start", async () => {
  const wrong = await page("/verify/", { "GET me/": [HALFWAY], "POST sign-in/verify/": [[400, refused("invalid_code")]] });
  await wrong.submit("verify", "second", "000000");
  assert.deepEqual(wrong.shown(), ["verify"]);
  assert.equal(wrong.node["second-err"].textContent, "That code did not work. Try again.");

  const paused = await page("/verify/", { "GET me/": [HALFWAY], "POST sign-in/verify/": [[403, refused("sign_in_paused")]] });
  await paused.submit("verify", "second", "000000");
  assert.deepEqual(paused.shown(), ["paused"]);

  const lost = await page("/verify/", { "GET me/": [HALFWAY], "POST sign-in/verify/": [[401, refused("unauthenticated")]] });
  await lost.submit("verify", "second", "000000");
  assert.deepEqual(lost.shown(), ["sign-in"]);
});

test("the recovery form sends its code to the same route", async () => {
  const p = await page("/verify/", { "GET me/": [HALFWAY, SIGNED_IN], "POST sign-in/verify/": [[204]] });
  const click = p.node["second-switch"].fire("click");
  assert.equal(click.prevented, true);
  assert.equal(p.node["second-label"].textContent, "Recovery code");
  assert.equal(p.node["second-lead"].textContent, "Enter one of your 10 recovery codes. Each code works once.");
  assert.equal(p.node["second-switch"].textContent, "Use your authenticator app instead");
  assert.equal(p.node.second.getAttribute("maxlength"), "12");
  await p.submit("verify", "second", " ABCD-EFGH ");
  assert.deepEqual(p.posts()[0].body, { code: "ABCD-EFGH" });
  assert.equal(p.posts()[0].url, BASE + "/sign-in/verify/");
});

test("someone already signed in who sends a form is taken where me/ says", async () => {
  const p = await page("/sign-in/", { "GET me/": [SIGNED_OUT, SIGNED_IN], "POST sign-in/": [[409, refused("already_signed_in")]] });
  await p.submit("sign-in", "email", "a@b.co");
  assert.equal(p.location.replaced, "/");
});

test("the back button asks the backend again", async () => {
  const p = await page("/sign-in/", { "GET me/": [SIGNED_OUT, HALFWAY] });
  p.heard.popstate();
  await settle();
  assert.deepEqual(p.shown(), ["verify"]);
});
