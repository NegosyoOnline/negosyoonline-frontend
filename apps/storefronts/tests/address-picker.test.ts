/* The delivery address picker (ClickUp z8uq9mkmwb): the server's markup (src/views/sante/address-picker.ts) and the picker's own
   logic (public/assets/sante/js/pack-address.js), which the script exposes as window.PPAddress. The script is run here with no page,
   so only its pure parts (region mapping, the cascade model, restore, clear, the ZIP states) are tested; the panel itself is drawn
   by the script and looked at in a browser. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { addressPicker, pickerData } from "../src/views/sante/address-picker.ts";

const SANTE = path.join(import.meta.dirname, "..", "public", "assets", "sante");
const json = <T>(file: string): T => JSON.parse(readFileSync(path.join(SANTE, "data", file), "utf8")) as T;

type Prov = { name: string; prov_code: string; reg_code: string };
type City = { name: string; prov_code: string; mun_code: string };
type Brgy = { name: string; mun_code: string; brgy_code: string };
const PROVINCES = json<Prov[]>("provinces.json");
const CITIES = json<City[]>("city-mun.json");
const BRGYS = json<Brgy[]>("barangays.json");

/* eslint-disable @typescript-eslint/no-explicit-any */
function load(): any {
  const sandbox: any = { document: { querySelectorAll: () => [] } };
  sandbox.window = sandbox;
  vm.runInNewContext(readFileSync(path.join(SANTE, "js", "pack-address.js"), "utf8"), sandbox);
  return sandbox.PPAddress;
}
const PP = load();
const plain = (v: unknown) => JSON.parse(JSON.stringify(v));
const model = () => PP.createModel(PROVINCES, CITIES, BRGYS);
const find = <T extends { name: string }>(list: T[], name: string): T => list.find((x) => x.name === name)!;

/* ---- the region tab ---- */

test("five regions, each province in exactly one, from reg_code (Metro Manila 13; North Luzon 01 02 03 14; South Luzon 04 05 17; Visayas 06 07 08; Mindanao 09 10 11 12 15 16)", () => {
  assert.deepEqual(plain(PP.REGIONS.map((r: any) => [r.name, r.codes])), [
    ["Metro Manila", ["13"]], ["North Luzon", ["01", "02", "03", "14"]], ["South Luzon", ["04", "05", "17"]],
    ["Visayas", ["06", "07", "08"]], ["Mindanao", ["09", "10", "11", "12", "15", "16"]],
  ]);
  for (const p of PROVINCES) assert.ok(PP.regionOf(p.reg_code), `${p.name} (${p.reg_code}) has a region`);
  const total = PP.REGIONS.reduce((n: number, r: any) => n + PP.provincesOf(r, PROVINCES).length, 0);
  assert.equal(total, PROVINCES.length);
  const of = (name: string) => PP.regionOf(find(PROVINCES, name).reg_code).name;
  assert.equal(of("METRO MANILA"), "Metro Manila");
  assert.equal(of("PANGASINAN"), "North Luzon");
  assert.equal(of("ABRA"), "North Luzon");
  assert.equal(of("CAVITE"), "South Luzon");
  assert.equal(of("PALAWAN"), "South Luzon");
  assert.equal(of("CEBU"), "Visayas");
  assert.equal(of("DAVAO DEL SUR"), "Mindanao");
  assert.equal(of("SULU"), "Mindanao");
  assert.equal(PP.regionOf("99"), null);
});

/* ---- the cascade ---- */

test("each pick advances to the next tab and narrows the next list; the posted values are the dataset's names and barangay_code", () => {
  const m = model();
  assert.equal(m.items("region").length, 5);
  assert.equal(m.nextTab(), "region");
  assert.equal(m.reachable("province"), false);
  const mindanao = m.items("region").find((r: any) => r.name === "Mindanao");
  assert.deepEqual(plain(m.pick("region", mindanao)), { next: "province", reset: true });
  assert.ok(m.items("province").length > 10 && m.items("province").every((p: Prov) => ["09", "10", "11", "12", "15", "16"].includes(p.reg_code)));
  const dds = find(PROVINCES, "DAVAO DEL SUR");
  assert.equal(m.pick("province", m.items("province").find((p: Prov) => p.name === dds.name)).next, "city");
  assert.ok(m.items("city").every((c: City) => c.prov_code === dds.prov_code));
  assert.equal(m.pick("city", m.items("city").find((c: City) => c.name === "DAVAO CITY")).next, "barangay");
  assert.ok(m.items("barangay").every((b: Brgy) => b.mun_code === "P9:DAVAO CITY"));
  assert.equal(m.complete(), false);
  assert.equal(m.pick("barangay", m.items("barangay").find((b: Brgy) => b.name === "CATALUNAN GRANDE")).next, "");
  assert.equal(m.complete(), true);
  assert.equal(m.path(), "Mindanao, Davao Del Sur, Davao City, Catalunan Grande");
  assert.deepEqual(plain(m.values()), { province: "DAVAO DEL SUR", city: "DAVAO CITY", barangay: "CATALUNAN GRANDE", barangay_code: "DAVAO-DEL-SUR::DAVAO-CITY::CATALUNAN GRANDE" });
});

test("a region with one province (Metro Manila) picks it and goes straight to City; the path does not say it twice", () => {
  const m = model();
  const r = m.pick("region", m.items("region").find((x: any) => x.name === "Metro Manila"));
  assert.equal(r.next, "city");
  assert.equal(m.values().province, "METRO MANILA");
  assert.equal(m.path(), "Metro Manila");
  const city = m.items("city")[0];
  m.pick("city", city);
  assert.equal(m.path(), `Metro Manila, ${PP.titleCase(city.name)}`);
});

test("going back and picking the same item keeps what is below it; a different one resets it and the ZIP", () => {
  const m = model();
  m.restore({ province: "DAVAO DEL SUR", city: "DAVAO CITY", barangay: "AGDAO" });
  assert.equal(m.complete(), true);
  const sameProv = m.items("province").find((p: Prov) => p.name === "DAVAO DEL SUR");
  assert.deepEqual(plain(m.pick("province", sameProv)), { next: "city", reset: false });
  assert.equal(m.complete(), true);
  const sameCity = m.items("city").find((c: City) => c.name === "DAVAO CITY");
  assert.equal(m.pick("city", sameCity).reset, false);
  assert.equal(m.brgy.name, "AGDAO");
  const otherCity = m.items("city").find((c: City) => c.name === "DIGOS CITY");
  assert.equal(m.pick("city", otherCity).reset, true);
  assert.equal(m.brgy, null);
  assert.equal(m.values().barangay, "");
  const davao = m.items("province").find((p: Prov) => p.name === "DAVAO DEL NORTE");
  assert.equal(m.pick("province", davao).reset, true);
  assert.equal(m.city, null);
  assert.equal(m.values().city, "");
  const other = m.items("region").find((r: any) => r.name === "Visayas");
  assert.equal(m.pick("region", other).reset, true);
  assert.equal(m.prov, null);
  assert.equal(m.path(), "Visayas");
});

test("clear resets the whole path and what the form posts", () => {
  const m = model();
  m.restore({ province: "METRO MANILA", city: "QUEZON CITY", barangay: "BAGUMBAYAN" });
  m.clear();
  assert.equal(m.path(), "");
  assert.deepEqual(plain(m.values()), { province: "", city: "", barangay: "", barangay_code: "" });
  assert.equal(m.nextTab(), "region");
  assert.equal(m.reachable("province"), false);
  assert.equal(m.complete(), false);
});

/* ---- re-render restore (the server draws the posted names back into the three inputs) ---- */

test("restore finds the dataset's names, a hand-written name and the region; what it cannot find stays empty with what is above it kept", () => {
  const m = model();
  const city = CITIES.find((c) => c.name === "QUEZON CITY");
  assert.ok(city);
  const brgy = BRGYS.find((b) => b.mun_code === city!.mun_code)!;
  m.restore({ province: "METRO MANILA", city: "QUEZON CITY", barangay: brgy.name });
  assert.equal(m.complete(), true);
  assert.equal(m.region.name, "Metro Manila");
  assert.equal(m.values().barangay_code, brgy.brgy_code);
  m.restore({ province: "Camarines Sur", city: "Naga", barangay: "nothing like this" });
  assert.equal(m.prov.name, "CAMARINES SUR");
  assert.equal(m.region.name, "South Luzon");
  assert.equal(m.city.name, "NAGA CITY");
  assert.equal(m.brgy, null);
  assert.equal(m.complete(), false);
  m.restore({ province: "", city: "Makati", barangay: "Poblacion" });
  assert.equal(m.prov, null);
  assert.equal(m.city, null, "a city with no province is not looked up");
  assert.equal(m.path(), "");
});

// Every city and barangay in the data is reachable through its province's list (the cascade never loses one).
test("the lists hold every city of a province and every barangay of a city", () => {
  const m = model();
  for (const p of PROVINCES) {
    m.restore({ province: p.name, city: "", barangay: "" });
    assert.equal(m.items("city").length, CITIES.filter((c) => c.prov_code === p.prov_code).length, p.name);
  }
  m.restore({ province: "CEBU", city: "CEBU CITY", barangay: "" });
  assert.equal(m.items("barangay").length, BRGYS.filter((b) => b.mun_code === m.city.mun_code).length);
});

/* ---- search, names, ZIP ---- */

test("search lists names that start with the text first, then names that contain it; no text keeps the list", () => {
  const items = [{ name: "SAN JOSE" }, { name: "JOSE ABAD" }, { name: "SANTA CRUZ" }, { name: "SAN ANTONIO" }];
  assert.deepEqual(plain(PP.filterItems(items, "jose")).map((i: any) => i.name), ["JOSE ABAD", "SAN JOSE"]);
  assert.deepEqual(plain(PP.filterItems(items, " san ")).map((i: any) => i.name), ["SAN JOSE", "SANTA CRUZ", "SAN ANTONIO"]);
  assert.equal(PP.filterItems(items, "").length, 4);
  assert.equal(PP.filterItems(items, "zzz").length, 0);
});

test("names are shown in title case, and the posted value stays the dataset's name", () => {
  assert.equal(PP.titleCase("DAVAO DEL SUR"), "Davao Del Sur");
  assert.equal(PP.titleCase("BARANGAY 12 (POB.)"), "Barangay 12 (Pob.)");
  assert.equal(PP.titleCase("SAN JOSE-ABAD"), "San Jose-Abad");
  assert.equal(PP.titleCase("BARANGAY II"), "Barangay II");
});

test("ZIP states: authoritative is filled and read-only; any other answer is a suggestion, filled and editable; no answer is empty and editable", () => {
  const ok = (zip_precision: string, zip = "1110") => PP.zipState({ success: true, zip, zip_precision }, "");
  for (const precision of ["barangay", "city_unique"]) {
    assert.deepEqual(plain(ok(precision)), { kind: "authoritative", value: "1110", readOnly: true, hint: "" }, precision);
    assert.equal(PP.zipState({ success: true, zip: "1110", zip_precision: precision }, "9999").value, "1110", "a typed value never overrides an authoritative answer");
  }
  const city = ok("city_approx", "1200");
  assert.deepEqual(plain({ k: city.kind, v: city.value, r: city.readOnly }), { k: "suggested", v: "1200", r: false });
  assert.match(city.hint, /^This is the city ZIP code\. Correct it if your barangay uses a different one\.$/);
  assert.equal(PP.zipState({ success: true, zip: "1200", zip_precision: "city_approx" }, "1201").value, "1201", "a typed value is kept over a suggestion");
  for (const none of [{ success: true, zip: null, zip_precision: null }, { success: false }, {}, null]) {
    const st = PP.zipState(none, "");
    assert.deepEqual(plain({ k: st.kind, v: st.value, r: st.readOnly }), { k: "missing", v: "", r: false });
    assert.equal(st.hint, "We couldn't find the ZIP code for this barangay. Please type it.");
  }
  assert.equal(PP.zipState({ success: true, zip: null }, "1234").value, "1234", "no answer keeps what was typed");
});

/* ---- the server's markup: the posted names stay, and a no-JS form still posts ---- */

const base = {
  style: "ob" as const, zipName: "postal_code" as const,
  ids: { province: "p-prov", city: "p-city", barangay: "p-brgy", zip: "p-zip" },
  values: { province: "METRO MANILA", city: "QUEZON CITY", barangay: "BAGUMBAYAN", zip: "1110" },
  errors: {},
};

test("the picker draws the three inputs under their old names with their values, the ZIP beside them, and no select", () => {
  const out = addressPicker({ ...base, barangayCode: true }).value;
  assert.match(out, /data-pp-pick-mount/);
  assert.match(out, /<input type="text" id="p-prov" class="inp" name="province"[^>]*value="METRO MANILA">/);
  assert.match(out, /<input type="text" id="p-city" class="inp" name="city"[^>]*value="QUEZON CITY">/);
  assert.match(out, /<input type="text" id="p-brgy" class="inp" name="barangay"[^>]*value="BAGUMBAYAN">/);
  assert.match(out, /name="postal_code" inputmode="numeric" maxlength="4"[^>]*value="1110"/);
  assert.match(out, /<input type="hidden" name="barangay_code" value="">/);
  assert.doesNotMatch(out, /<select/);
  assert.ok(out.indexOf("data-pp-pick-mount") < out.indexOf("data-pp-zip-field"));
  assert.doesNotMatch(addressPicker(base).value, /barangay_code/);
});

test("the checkout style uses its own classes and the ZIP name zip; a value is escaped", () => {
  const out = addressPicker({ ...base, style: "sf", zipName: "zip", values: { ...base.values, city: 'A"<b>' }, zipAutocomplete: "off" }).value;
  assert.match(out, /class="sf-field"/);
  assert.match(out, /name="zip" inputmode="numeric" maxlength="4" autocomplete="off"/);
  assert.match(out, /value="A&quot;&lt;b&gt;"/);
  assert.doesNotMatch(out, /name="postal_code"/);
});

test("the server's errors stay on the page, by field, for the script and for no script", () => {
  const out = addressPicker({ ...base, errors: { province: "Enter the province.", barangay: "Enter the barangay.", postal_code: "Enter a 4-digit ZIP code." } }).value;
  assert.match(out, /<p class="err" id="p-prov-msg">Enter the province\.<\/p>/);
  assert.match(out, /<p class="err" id="p-brgy-msg">Enter the barangay\.<\/p>/);
  assert.doesNotMatch(out, /id="p-city-msg"/);
  assert.match(out, /name="province"[^>]*aria-invalid="true" aria-describedby="p-prov-msg"/);
  assert.match(out, /class="inp bad" name="postal_code"/);
  assert.match(out, /<p class="err">Enter a 4-digit ZIP code\.<\/p>/);
});

test("the holder carries the data files and the ZIP route", () => {
  const out = pickerData("/checkout/zip/").value;
  assert.match(out, /^data-pp-address data-ph-provinces="\/assets\/sante\/data\/provinces\.json\?v=[0-9a-f]{8}" data-ph-cities="[^"]*city-mun\.json[^"]*" data-ph-barangays="[^"]*barangays\.json[^"]*" data-zip-url="\/checkout\/zip\/"$/);
});
