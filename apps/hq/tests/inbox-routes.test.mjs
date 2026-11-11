/* The Inbox addresses: seven paths rewritten to two files, the old file names redirected, and no address built
   from a number, a name, a text or an id. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const config = fs.readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");

test("next.config.ts rewrites the seven Inbox paths to the right file", () => {
  assert.match(config, /source: "\/inbox\/sms\/", destination: "\/inbox\.html"/);
  assert.match(config, /source: "\/inbox\/sms\/new\/", destination: "\/inbox\.html"/);
  assert.match(config, /const inboxPlatforms = \["messenger", "instagram", "tiktok", "email", "webchat"\]/);
  assert.match(config, /source: `\/inbox\/\$\{name\}\/`, destination: "\/inbox-platform\.html"/);
  assert.doesNotMatch(config, /inbox\/sms\/c\/|:id|:path\*"[^}]*inbox/);
});

test("/inbox/ and the file names redirect to the SMS list", () => {
  for (const source of ["/inbox/", "/inbox.html", "/inbox-platform.html"]) {
    assert.match(config, new RegExp(`source: "${source.replace(/[./]/g, "\\$&")}", destination: "/inbox/sms/", permanent: false`), source);
  }
});

test("no served page or script builds an address from a value", () => {
  for (const f of ["inbox.js", "inbox-platform.js", "menu.js"]) {
    const js = fs.readFileSync(new URL("../public/assets/js/" + f, import.meta.url), "utf8");
    /* menu.js hands wake() two literal addresses; its assign takes that argument and nothing computed. */
    for (const m of js.matchAll(/location\.(assign|replace)\(([^)]*)\)/g)) assert.match(m[2], f === "menu.js" ? /^to$/ : /^"[^"+]*"$/, f + ": " + m[0]);
    if (f === "menu.js") for (const m of js.matchAll(/wake\("[^"]+", [^,]+, ([^)]*)\)/g)) assert.match(m[1], /^"[^"+]*"$/, m[0]);
    assert.doesNotMatch(js, /location\.href\s*=|window\.open|location\.search|location\.hash\s*=(?!=)/, f);
  }
});
