/* console.js: the admin console (design 22.3). It shows the person's own sign-in events from the backend
   and writes nothing. It has no card, link or menu item for the Django Admin (R27). */
import test from "node:test";
import assert from "node:assert/strict";
import { open, settle, BASE, refused } from "./page.mjs";

const IDS = ["boot", "v-console", "v-down", "who-h", "times", "events", "events-empty", "acct-ini", "acct-name",
  "acct-btn", "sign-out", "sign-out-2", "sign-out-err", "theme-toggle", "theme-toggle-2"];
const CONSOLE = { email: "sample.staff@example.com", verified_at: "2026-11-11T09:02:00+08:00",
  expires_at: "2026-11-11T21:01:00+08:00", events: [
    { action: "admin_sign_in_ok", surface: "hq", step: "totp", at: "2026-11-11T09:02:00+08:00" },
    { action: "admin_sign_in_failed", surface: "hq", step: "recovery", at: "2026-11-11T09:01:00+08:00" },
    { action: "admin_sign_out", surface: "hq", step: null, at: "2026-11-10T18:40:00+08:00" },
    { action: "admin_locked", surface: "hq", step: "totp", at: "2026-11-09T14:22:00+08:00" },
    { action: "something_new", surface: "hq", step: null, at: "2026-11-09T14:00:00+08:00" },
  ] };

async function page(table) {
  const p = open(["hq.js", "console.js"], { ids: IDS, pathname: "/", answers: (call) => {
    const reply = table[call.method + " " + call.url.slice(BASE.length + 1)];
    assert.ok(reply, "unexpected call: " + call.method + " " + call.url);
    return reply;
  } });
  await settle();
  return p;
}

test("the console shows who is signed in, the two times and their events", async () => {
  const p = await page({ "GET console/": [200, CONSOLE] });
  assert.equal(p.node["v-console"].hidden, false);
  assert.equal(p.node.boot.hidden, true);
  assert.equal(p.node["who-h"].textContent, "Signed in as sample.staff@example.com");
  assert.equal(p.node.times.textContent, "Verified at 11 Nov 2026, 9:02 AM. Session ends 11 Nov 2026, 9:01 PM.");
  assert.equal(p.node["acct-ini"].textContent, "SS");
  assert.equal(p.node["acct-name"].textContent, "sample.staff");
  const rows = p.node.events.children.map((li) => li.textContent);
  assert.deepEqual(rows, [
    "Signed inAdmin console · authenticator code11 Nov 2026, 9:02 AM",
    "Wrong codeAdmin console · recovery code11 Nov 2026, 9:01 AM",
    "Signed outAdmin console10 Nov 2026, 6:40 PM",
    "Sign-in pausedAdmin console · authenticator code9 Nov 2026, 2:22 PM",
  ]);
  assert.equal(p.node["events-empty"].hidden, true);
  assert.deepEqual(p.calls.map((c) => c.method + " " + c.url), ["GET " + BASE + "/console/"]);
});

test("no events shows the Django page's words", async () => {
  const p = await page({ "GET console/": [200, { ...CONSOLE, events: [] }] });
  assert.equal(p.node["events-empty"].hidden, false);
  assert.equal(p.node.events.hidden, true);
});

test("a person who is not signed in is sent where the answer says, and sees nothing", async () => {
  const out = await page({ "GET console/": [401, refused("unauthenticated")] });
  assert.equal(out.location.replaced, "/sign-in/");
  assert.equal(out.node["v-console"].hidden, true);
  const half = await page({ "GET console/": [401, refused("second_step_required")] });
  assert.equal(half.location.replaced, "/verify/");
});

test("no answer shows the plain state and goes nowhere", async () => {
  const p = await page({ "GET console/": "offline" });
  assert.equal(p.node["v-down"].hidden, false);
  assert.equal(p.location.replaced, null);
});

test("either Sign out button ends the session and returns to sign-in; a failed one says so", async () => {
  for (const id of ["sign-out", "sign-out-2"]) {
    const p = await page({ "GET console/": [200, CONSOLE], "POST sign-out/": [204] });
    p.node[id].fire("click");
    await settle();
    assert.equal(p.location.assigned, "/sign-in/");
  }
  const failed = await page({ "GET console/": [200, CONSOLE], "POST sign-out/": [500, refused("server_error")] });
  failed.node["sign-out"].fire("click");
  await settle();
  assert.equal(failed.location.assigned, null);
  assert.equal(failed.node["sign-out-err"].hidden, false);
});
