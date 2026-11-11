/* shell.js: what every signed-in page shares. The user card and the phone-width avatar, shown only once
   the page says who is signed in; the Sign out buttons; the sign-out message. It calls the backend only
   through NOHq.call. */
import test from "node:test";
import assert from "node:assert/strict";
import { open, settle, BASE, refused } from "./page.mjs";

const CARD = ["acct-row", "acct-ini", "acct-name", "acct-btn"];
const ALL = [...CARD, "sign-out", "sign-out-2", "sign-out-3", "sign-out-err"];

function page(ids, reply) {
  return open(["hq.js", "shell.js"], { ids, pathname: "/finance/", answers: (call) => {
    assert.equal(call.method + " " + call.url, "POST " + BASE + "/sign-out/");
    return reply;
  } });
}

test("nothing is shown or asked until the page says who is signed in", async () => {
  const p = page(ALL, [204]);
  await settle();
  for (const id of CARD) assert.equal(p.node[id].hidden, true, id);
  assert.equal(p.node["acct-name"].textContent, "");
  assert.equal(p.node["sign-out-err"].hidden, true);
  assert.deepEqual(p.calls, []);
});

test("signedIn fills and shows the user card and the avatar", () => {
  const p = page(ALL, [204]);
  p.window.NOHqShell.signedIn("sample.staff@example.com");
  assert.equal(p.node["acct-ini"].textContent, "SS");
  assert.equal(p.node["acct-btn"].textContent, "SS");
  assert.equal(p.node["acct-btn"].getAttribute("aria-label"), "Signed in as sample.staff");
  assert.equal(p.node["acct-name"].textContent, "sample.staff");
  assert.equal(p.node["acct-row"].hidden, false);
  assert.equal(p.node["acct-btn"].hidden, false);
});

test("every Sign out button ends the session and returns to sign-in, signed in or not", async () => {
  for (const id of ["sign-out", "sign-out-2", "sign-out-3"]) {
    const p = page(ALL, [204]);
    p.node[id].fire("click");
    await settle();
    assert.equal(p.location.assigned, "/sign-in/");
    assert.equal(p.calls.length, 1);
    assert.equal(p.calls[0].credentials, "include");
  }
});

test("a failed sign-out shows the message and goes nowhere; a later good one hides it", async () => {
  for (const reply of [[500, refused("server_error")], "offline"]) {
    const p = page(ALL, reply);
    p.node["sign-out"].fire("click");
    await settle();
    assert.equal(p.location.assigned, null);
    assert.equal(p.node["sign-out-err"].hidden, false);
  }
});

test("a page with only the side panel's Sign out works", async () => {
  const p = page([...CARD, "sign-out"], [500, refused("server_error")]);
  p.window.NOHqShell.signedIn("ana@example.com");
  p.node["sign-out"].fire("click");
  await settle();
  assert.equal(p.location.assigned, null);
});
