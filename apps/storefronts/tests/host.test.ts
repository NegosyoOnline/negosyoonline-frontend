import test from "node:test";
import assert from "node:assert/strict";
import { cleanHost, lookupHost, parseAliases } from "../src/lib/host.ts";

test("a host is lowercased and keeps its port", () => {
  assert.equal(cleanHost("Demo-Store.NegosyoTest.com:3002"), "demo-store.negosyotest.com:3002");
  assert.equal(cleanHost(" demo-store.negosyotest.com "), "demo-store.negosyotest.com");
});

test("anything that is not a plain host name is nothing to look up", () => {
  for (const bad of [null, undefined, "", "a b.com", "a/b.com", "a.com/path", "a.com?x=1", "a@b.com",
    "a.com:port", "a.com:123456", "-a.com", "a..com", "a.com\r\nX: y", "[::1]:3002", "x".repeat(300)]) {
    assert.equal(cleanHost(bad), "", String(bad));
  }
});

test("aliases map a host, with or without a port, to another host", () => {
  const aliases = parseAliases("www.santetest.com=demo-store.negosyotest.com, Other.test:3002=b.negosyotest.com");
  assert.equal(lookupHost("www.santetest.com:3002", aliases), "demo-store.negosyotest.com");
  assert.equal(lookupHost("WWW.santetest.com", aliases), "demo-store.negosyotest.com");
  assert.equal(lookupHost("other.test", aliases), "b.negosyotest.com");
});

test("a host with no alias is looked up as it came", () => {
  const aliases = parseAliases("www.santetest.com=demo-store.negosyotest.com");
  assert.equal(lookupHost("shop.negosyotest.com:3002", aliases), "shop.negosyotest.com:3002");
  assert.equal(lookupHost("bad host", aliases), "");
});

test("no aliases when the variable is unset, and a malformed pair is dropped", () => {
  assert.equal(parseAliases(undefined).size, 0);
  assert.equal(parseAliases("").size, 0);
  const aliases = parseAliases("a.test,b.test=,=c.test,d.test=e.test=f.test,g.test=bad host,ok.test=fine.test");
  assert.deepEqual([...aliases], [["ok.test", "fine.test"]]);
});
