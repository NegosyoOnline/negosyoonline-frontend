import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { asset, ASSET_BASE, assetVersions } from "../src/lib/assets.ts";
import { homeDocument } from "../src/views/sante/home.ts";
import { homeModel } from "../src/views/sante/model.ts";
import { SITE } from "./site.ts";

const PUBLIC = path.join(import.meta.dirname, "..", "public");

test("every listed file exists, and its version is the start of its SHA-256", () => {
  const versions = assetVersions();
  assert.equal(Object.keys(versions).length, 87); // 80 + the seven "Watch Before You Buy" posters
  for (const [file, version] of Object.entries(versions)) {
    const bytes = readFileSync(path.join(PUBLIC, ASSET_BASE, file));
    assert.equal(version, createHash("sha256").update(bytes).digest("hex").slice(0, 8), file);
    assert.equal(asset(file), `/assets/sante/${file}?v=${version}`);
  }
});

test("an unlisted file is an error, not a silent link", () => {
  assert.throws(() => asset("img/nope.png"), /No such storefront asset/);
});

test("every file the home and its stylesheets name is in public/", () => {
  const page = homeDocument(homeModel(SITE)).value;
  const linked = [...page.matchAll(/(?:src|href)="(\/assets\/[^"?]+)\?v=[0-9a-f]{8}"/g)].map((m) => m[1]);
  assert.equal(new Set(linked).size, 20);
  for (const file of linked) assert.ok(existsSync(path.join(PUBLIC, file)), file);
  for (const sheet of ["pack-home.css", "pack-storefront.css"]) {
    const css = readFileSync(path.join(PUBLIC, ASSET_BASE, "css", sheet), "utf8");
    for (const match of css.matchAll(/url\(\s*['"]?(?!data:)([^'")]+)['"]?\s*\)/g)) {
      assert.ok(existsSync(path.join(PUBLIC, ASSET_BASE, "css", match[1])), `${sheet}: ${match[1]}`);
    }
  }
});
