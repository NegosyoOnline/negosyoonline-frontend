/* Products (/products/, ClickUp z8uq9mek5w, CAT-1): the shared Santé catalog.
   The catalog owner's store lists, adds and edits products, uploads one image each and reads a product's history; every other
   Santé store sees the same list read-only. Reads and writes GET and POST /sites/{id}/catalog/products/, PATCH .../{product}/,
   POST and DELETE .../{product}/image/ and GET .../{product}/revisions/. The server decides who may write (can_edit), prices
   and conflicts; the browser only shows them. Money is whole centavos; the earnings rate (the members discount) is sent as
   fixed text such as "0.4000". Plain ES5; API strings reach the page through textContent or D.el only; no storage key.
   NOProducts.util holds the pure helpers (tests/products.test.mjs). */
(function () {
  var D = window.NODash;
  var token = 0;
  var CATEGORIES = [["barley", "Barley"], ["drinks", "Specialty Drinks"], ["essentials", "Essentials"], ["beauty", "Beauty"]];
  var PRODUCT_RE = /^prod_[0-9A-Za-z]+$/;
  var IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
  var IMAGE_MAX = 2 * 1024 * 1024;
  var S = null; /* the screen's state: site, can_edit, products, mode, editing, history */

  var MSG = {
    stale: "This product was changed since you loaded it.",
    readOnly: "Only the catalog owner site can change the shared catalog.",
    billingOnly: "Products can't be changed while your subscription is limited to Billing. Open Billing to continue your plan.",
    imageStore: "Product images can't be stored yet: the image store is not set up.",
    imageNotSaved: "The image could not be stored. Try again.",
    network: "We could not reach the server. Please check your connection and try again.",
    generic: "We couldn’t save. Check your connection and try again.",
    invalid: "Some values are missing or invalid. Check the fields marked below."
  };

  /* ---------- pure helpers ---------- */

  /* "1,400" or "450.50" in pesos to whole centavos, or null. At most two decimals; never a float. */
  function pesosToCentavos(text) {
    var t = String(text == null ? "" : text).replace(/[₱,\s]/g, "");
    var m = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(t);
    if (!m) return null;
    var c = parseInt(m[1], 10) * 100 + (m[2] ? parseInt((m[2] + "0").slice(0, 2), 10) : 0);
    return c > 0 ? c : null;
  }
  function pad(n, w) { var s = String(n); while (s.length < w) s = "0" + s; return s; }
  function group(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  /* 140000 -> "₱1,400.00" */
  function formatPeso(centavos) {
    if (typeof centavos !== "number" || centavos !== Math.floor(centavos) || centavos < 0) return "";
    return "₱" + group(Math.floor(centavos / 100)) + "." + pad(centavos % 100, 2);
  }
  /* 140000 -> "1400", 45050 -> "450.50": the value that goes back into the price field. */
  function centavosToField(centavos) {
    if (typeof centavos !== "number") return "";
    var w = Math.floor(centavos / 100), c = centavos % 100;
    return c ? w + "." + pad(c, 2) : String(w);
  }
  /* "40" -> "0.4000", "12.5" -> "0.1250"; null unless the percent is from 10 to 50 with at most two decimals. */
  function percentToRate(text) {
    var m = /^(\d{1,2})(?:\.(\d{1,2}))?$/.exec(String(text == null ? "" : text).replace(/[%\s]/g, ""));
    if (!m) return null;
    var tt = parseInt(m[1], 10) * 100 + (m[2] ? parseInt((m[2] + "0").slice(0, 2), 10) : 0); /* hundredths of a percent */
    if (tt < 1000 || tt > 5000) return null;
    return "0." + pad(tt, 4);
  }
  /* "0.4000" -> "40", "0.1250" -> "12.5" */
  function rateToPercent(rate) {
    var m = /^(\d)\.(\d{1,4})$/.exec(String(rate == null ? "" : rate));
    if (!m) return "";
    var tt = parseInt(m[1], 10) * 10000 + parseInt((m[2] + "0000").slice(0, 4), 10);
    var whole = Math.floor(tt / 100), frac = tt % 100;
    return frac ? whole + "." + pad(frac, 2).replace(/0$/, "") : String(whole);
  }
  /* The members price, as the server computes it: SRP less (SRP x rate) rounded half up to the centavo. */
  function membersPrice(srpCentavos, rate) {
    var m = /^(\d)\.(\d{1,4})$/.exec(String(rate == null ? "" : rate));
    if (typeof srpCentavos !== "number" || !m) return null;
    var r = parseInt(m[1], 10) * 10000 + parseInt((m[2] + "0000").slice(0, 4), 10);
    return srpCentavos - Math.floor((srpCentavos * r + 5000) / 10000);
  }
  function categoryLabel(key) {
    for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i][0] === key) return CATEGORIES[i][1];
    return "";
  }
  /* The sentence and field messages for a failed call. kind tells the screen what else to offer. */
  function describeError(res) {
    var d = (res && res.data) || {}, code = d.code, status = res && res.status, fields = d.fields || {};
    if (status === 409 && code === "stale_revision") return { kind: "stale", message: MSG.stale, fields: {} };
    if (status === 409 && code === "code_taken") return { kind: "field", message: "", fields: { code: fields.code || "That product code is already in the catalog." } };
    if (status === 403 && code === "catalog_read_only") return { kind: "readonly", message: MSG.readOnly, fields: {} };
    if (status === 403 && code === "billing_only") return { kind: "billing", message: MSG.billingOnly, fields: {} };
    if (status === 503 && code === "image_store_not_configured") return { kind: "image", message: MSG.imageStore, fields: {} };
    if (status === 502 && code === "image_not_saved") return { kind: "image", message: MSG.imageNotSaved, fields: {} };
    if (status === 404) return { kind: "missing", message: "This product or store is no longer available.", fields: {} };
    var has = Object.keys(fields).length > 0;
    if (status === 400 || has) return { kind: "fields", message: typeof d.message === "string" && d.message ? d.message : MSG.invalid, fields: fields };
    return { kind: "other", message: typeof d.message === "string" && d.message ? d.message : MSG.generic, fields: {} };
  }
  var LABELS = { name: "Name", short_description: "Short description", long_description: "Long description", category: "Category",
    image_url: "Image", weight_kg: "Weight", srp_centavos: "Price (SRP)", earnings_rate: "Members rate", volume_slot: "Volume slot",
    shipping_qty: "Shipping quantity", length_cm: "Length", width_cm: "Width", height_cm: "Height", is_active: "Visibility" };
  var ORDER = ["name", "short_description", "long_description", "category", "image_url", "srp_centavos", "earnings_rate", "is_active",
    "weight_kg", "volume_slot", "shipping_qty", "length_cm", "width_cm", "height_cm"];
  /* What a revision changed against the one before it, as short phrases. No writer is named. */
  function changes(row, before) {
    if (!before) return ["Product added"];
    var out = [];
    ORDER.forEach(function (k) {
      if (row[k] === before[k]) return;
      var label = LABELS[k];
      if (k === "srp_centavos") out.push(label + " " + formatPeso(before[k]) + " to " + formatPeso(row[k]));
      else if (k === "earnings_rate") out.push(label + " " + rateToPercent(before[k]) + "% to " + rateToPercent(row[k]) + "%");
      else if (k === "is_active") out.push(row[k] ? "Shown in shops" : "Hidden from shops");
      else if (k === "category") out.push(label + " " + (categoryLabel(row[k]) || "none"));
      else out.push(label + " changed");
    });
    return out.length ? out : ["Saved with no changes"];
  }
  function stamp(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
    } catch (e) { return D.date(iso); }
  }
  function safeImage(url) { return typeof url === "string" && /^https?:\/\//.test(url) ? url : ""; }

  /* ---------- small DOM helpers ---------- */

  function h(tag, cls, text) { return D.el(tag, cls ? { "class": cls } : {}, text); }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
  function root() { return document.getElementById("pr-root"); }
  function pane() { return (S && S.innerRoot) || root(); }
  function say(text) { var n = document.getElementById("pr-live"); if (n) n.textContent = text; }
  function button(text, cls, onClick) {
    var b = D.el("button", { type: "button", "class": "no-btn " + cls }, text);
    if (onClick) b.addEventListener("click", onClick);
    return b;
  }
  function failBox(text, retry) {
    var box = D.el("div", { "class": "pr-fail", role: "alert" });
    box.appendChild(h("p", "pr-error", text));
    if (retry) box.appendChild(button("Try again", "no-btn-ghost", retry));
    return box;
  }
  function productPath(p) { return "/sites/" + S.site + "/catalog/products/" + (p ? p.id + "/" : ""); }
  function findProduct(id) {
    for (var i = 0; i < S.products.length; i++) if (S.products[i].id === id) return S.products[i];
    return null;
  }
  function replaceProduct(p) {
    for (var i = 0; i < S.products.length; i++) if (S.products[i].id === p.id) { S.products[i] = p; return; }
    S.products.push(p);
  }

  /* ---------- list ---------- */

  function chip(text, cls) { return h("span", "chip " + cls, text); }

  function newView() { return { q: "", status: "all", cat: "all", page: 1, menu: null }; }

  /* A shipping or catalog gap: what the shop and shipping need before a product is complete. Labels, once each, in this order. */
  function gaps(p) {
    var out = [];
    function add(l) { if (out.indexOf(l) < 0) out.push(l); }
    if (!p.image_url) add("Photo");
    if (!p.category) add("Category");
    if (!p.short_description || !p.long_description) add("Description");
    if (p.length_cm == null || p.width_cm == null || p.height_cm == null) add("Packed size");
    if (p.volume_slot == null || p.shipping_qty == null) add("Shipping details");
    return out;
  }
  /* Tile counts. They never sum: a live product can also be incomplete. Incomplete is the owner's only (ownerView). */
  function counts(products, ownerView) {
    var c = { all: products.length, live: 0, hidden: 0, incomplete: 0 };
    products.forEach(function (p) {
      if (p.is_active) c.live++; else c.hidden++;
      if (ownerView && gaps(p).length) c.incomplete++;
    });
    return c;
  }
  /* The rows the toolbar selects: search on name or code (case-insensitive), the status, the category. */
  function filterProducts(products, f, ownerView) {
    var q = String((f && f.q) || "").trim().toLowerCase(), st = (f && f.status) || "all", cat = (f && f.cat) || "all";
    return products.filter(function (p) {
      if (q && String(p.name || "").toLowerCase().indexOf(q) < 0 && String(p.code || "").toLowerCase().indexOf(q) < 0) return false;
      if (cat !== "all" && p.category !== cat) return false;
      if (st === "live" && !p.is_active) return false;
      if (st === "hidden" && p.is_active) return false;
      if (st === "incomplete" && !(ownerView && gaps(p).length)) return false;
      return true;
    });
  }
  /* One CSV cell. A cell that starts = + - @ (or a tab or return) gets a leading apostrophe so a spreadsheet never runs it. */
  function csvCell(v) {
    var s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function pesoPlain(c) { return typeof c === "number" && c >= 0 ? Math.floor(c / 100) + "." + pad(c % 100, 2) : ""; }
  /* The file for the rows now on screen. The earnings rate is never in it; the owner file adds Incomplete and its gaps. */
  function csvText(rows, ownerView) {
    var head = ["Code", "Name", "Category", "SRP", "Members price", "Storefront"];
    if (ownerView) head.push("Incomplete", "Missing");
    var lines = [head.map(csvCell).join(",")];
    rows.forEach(function (p) {
      var g = ownerView ? gaps(p) : [];
      var cells = [p.code, p.name, categoryLabel(p.category), pesoPlain(p.srp_centavos), pesoPlain(p.unit_members_price_centavos), p.is_active ? "Live" : "Hidden"];
      if (ownerView) cells.push(g.length ? "Yes" : "No", g.join("; "));
      lines.push(cells.map(csvCell).join(","));
    });
    return lines.join("\r\n") + "\r\n";
  }
  function downloadCsv(text) {
    try {
      var blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = D.el("a", { href: url, download: "products.csv" });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      return true;
    } catch (e) { return false; }
  }

  var PAGE = 20;
  /* value, label, hint under the count, accent kind. The select shows "All status" for the first. */
  var STATUS_OWNER = [["all", "All", "reset filters", "all"], ["live", "Live", "on storefront", "ok"], ["hidden", "Hidden", "not in shops", "dr"], ["incomplete", "Incomplete", "missing details", "inc"]];
  var STATUS_VIEW = [["all", "All", "reset filters", "all"], ["live", "Live", "on storefront", "ok"]];
  function statuses() { return S.canEdit ? STATUS_OWNER : STATUS_VIEW; }

  /* A header tile: label, big value, note (the Inventory page's order). */
  function tile(count, label, note, cls) {
    var t = h("div", "pr-tile " + (cls || ""));
    t.appendChild(h("p", "pr-tile-label", label));
    t.appendChild(h("p", "pr-tile-num", String(count)));
    if (note) t.appendChild(h("p", "pr-tile-sub", note));
    return t;
  }
  function badge(text, kind, title) {
    var b = h("span", "pr-badge pr-b-" + kind, text);
    if (title) b.setAttribute("title", title);
    return b;
  }
  /* Move one id up (delta -1) or down (+1) in a list of ids; a new array, the same list when it cannot move. */
  function moveId(ids, id, delta) {
    var i = ids.indexOf(id), j = i + delta, out = ids.slice();
    if (i < 0 || j < 0 || j >= ids.length) return out;
    out[i] = out[j]; out[j] = id;
    return out;
  }

  function toggleActive(p) {
    D.call("PATCH", productPath(p), { revision: p.revision, is_active: !p.is_active }, true).then(function (res) {
      if (!S || S.mode !== "list") return;
      if (res.ok && res.data && res.data.id === p.id) {
        replaceProduct(res.data);
        D.toast(res.data.is_active ? "Shown in shops" : "Hidden from shops", res.data.name);
        refreshList();
        return;
      }
      var e = describeError(res);
      D.toast("Not saved", e.kind === "stale" ? MSG.stale + " Reloading the list." : e.message || MSG.generic, "error");
      if (e.kind === "stale") loadList();
    });
  }

  function thumb(p) {
    var pic = h("div", "pr-thumb"), src = safeImage(p.image_url);
    if (src) pic.appendChild(D.el("img", { src: src, alt: "", loading: "lazy" }));
    else pic.appendChild(h("span", "pr-thumb-none", String(p.code || "").slice(0, 3).toUpperCase()));
    return pic;
  }

  function manageMenu(p) {
    var wrap = h("div", "pr-menuwrap"), open = S.view.menu === p.id;
    var b = D.el("button", { type: "button", "class": "pr-manage" }, "Manage ");
    b.appendChild(h("span", "pr-arrow", "▾"));
    b.addEventListener("click", function () {
      S.view.menu = open ? null : p.id;
      refreshList();
      var first = !open && S.listBox && S.listBox.querySelector(".pr-menu-item");
      if (first && first.focus) first.focus({ preventScroll: true });
    });
    b.setAttribute("aria-haspopup", "true");
    b.setAttribute("aria-expanded", open ? "true" : "false");
    b.setAttribute("aria-label", "Manage " + p.name);
    wrap.appendChild(b);
    if (open) {
      var m = h("div", "pr-menu");
      m.setAttribute("role", "menu");
      m.setAttribute("aria-label", "Manage " + p.name);
      var item = function (text, cls, fn) {
        var it = D.el("button", { type: "button", "class": "pr-menu-item " + cls }, text);
        it.addEventListener("click", fn);
        it.setAttribute("role", "menuitem");
        return it;
      };
      m.appendChild(item("Edit details", "pr-edit", function () { S.view.menu = null; openForm(p); }));
      m.appendChild(h("div", "pr-menu-sep"));
      m.appendChild(item("History", "pr-hist", function () { S.view.menu = null; openHistory(p); }));
      m.appendChild(h("div", "pr-menu-sep"));
      m.appendChild(item(p.is_active ? "Hide from shops" : "Show in shops", "pr-toggle", function () { S.view.menu = null; toggleActive(p); }));
      m.addEventListener("keydown", function (ev) { if (ev && ev.key === "Escape") { S.view.menu = null; refreshList(); var mb = S.listBox && S.listBox.querySelector(".pr-manage"); if (mb && mb.focus) mb.focus(); } });
      wrap.appendChild(m);
    }
    return wrap;
  }

  function rowFor(p) {
    var tr = D.el("tr", { "class": "pr-row" + (p.is_active ? "" : " pr-row-off") });
    var c1 = D.el("td", { "class": "pr-c-product" });
    var box = h("div", "pr-prod");
    box.appendChild(thumb(p));
    var txt = h("div", "pr-prod-text");
    txt.appendChild(h("p", "pr-name", p.name));
    txt.appendChild(h("p", "pr-code", p.code));
    if (categoryLabel(p.category)) txt.appendChild(h("span", "pr-cat", categoryLabel(p.category)));
    box.appendChild(txt);
    c1.appendChild(box);
    tr.appendChild(c1);
    var c2 = D.el("td", { "class": "pr-c-price", "data-label": "Price" });
    var a = h("p", "pr-price"); a.appendChild(h("span", "pr-price-k", "SRP ")); a.appendChild(h("span", "pr-price-v", formatPeso(p.srp_centavos))); c2.appendChild(a);
    var b = h("p", "pr-price"); b.appendChild(h("span", "pr-price-k", "Members ")); b.appendChild(h("span", "pr-price-v", formatPeso(p.unit_members_price_centavos))); c2.appendChild(b);
    tr.appendChild(c2);
    var c3 = D.el("td", { "class": "pr-c-store", "data-label": "Storefront" });
    c3.appendChild(badge(p.is_active ? "Live" : "Hidden", p.is_active ? "ok" : "dr"));
    if (S.canEdit) {
      var g = gaps(p);
      if (g.length) {
        /* Orthogonal to Live or Hidden: a live row with gaps shows both badges. */
        var gb = badge("Incomplete", "inc pr-gap", "Missing: " + g.join(", "));
        c3.appendChild(gb);
        c3.appendChild(h("span", "pr-gap-list", "Missing: " + g.join(", ")));
      }
    }
    tr.appendChild(c3);
    if (S.canEdit) {
      var c4 = D.el("td", { "class": "pr-c-manage" });
      c4.appendChild(manageMenu(p));
      tr.appendChild(c4);
    }
    return tr;
  }

  function pageOf(rows) {
    var pages = Math.max(1, Math.ceil(rows.length / PAGE));
    if (S.view.page > pages) S.view.page = pages;
    if (S.view.page < 1) S.view.page = 1;
    return { pages: pages, slice: rows.slice((S.view.page - 1) * PAGE, S.view.page * PAGE) };
  }

  /* Redraw only the status strip and the results, so the search box keeps its focus while typing. */
  function refreshList() {
    var box = S.listBox, view = S.view;
    if (!box) return;
    var c = counts(S.products, S.canEdit);
    /* The masthead tiles read the same counts as the strip, so they are redrawn with it on every change. */
    if (S.kpisBox) {
      clear(S.kpisBox);
      S.kpisBox.appendChild(tile(c.all, "Products in catalog", "in the shared catalog", "pr-hero-headline"));
      var small = h("div", "pr-hero-tiles");
      small.appendChild(tile(c.live, "Live on storefront", "shown in shops", "pr-hero-kpi"));
      if (S.canEdit) {
        small.appendChild(tile(c.hidden, "Hidden", "not in shops", "pr-hero-kpi"));
        var fix = tile(c.incomplete, "Needs a fix", "missing details", "pr-hero-kpi is-action" + (c.incomplete ? " has-work" : ""));
        if (c.incomplete) fix.firstChild.appendChild(h("span", "pr-hero-dot"));
        small.appendChild(fix);
      }
      S.kpisBox.appendChild(small);
    }
    clear(S.stripBox);
    statuses().forEach(function (s) {
      var b = D.el("button", { type: "button", "class": "pr-stat pr-cell-" + s[3] + (view.status === s[0] ? " pr-stat-on" : "") });
      b.addEventListener("click", function () {
        view.status = s[0]; view.page = 1; view.menu = null;
        if (S.statusSel) S.statusSel.value = s[0];
        refreshList();
      });
      b.appendChild(h("span", "pr-stat-num", String(c[s[0]])));
      b.appendChild(h("span", "pr-stat-label", s[1]));
      b.appendChild(h("span", "pr-stat-hint", s[2]));
      b.setAttribute("aria-pressed", view.status === s[0] ? "true" : "false");
      S.stripBox.appendChild(b);
    });
    clear(S.resultBox);
    var rows = filterProducts(S.products, view, S.canEdit);
    var pg = pageOf(rows);
    var card = h("div", "pr-tablecard");
    var table = D.el("table", { "class": "pr-table" });
    table.appendChild(D.el("caption", { "class": "pr-sr" }, "Products"));
    var head = D.el("tr");
    var cols = [["Product", "pr-c-product"], ["Price", "pr-c-price"], ["Storefront", "pr-c-store"]].concat(S.canEdit ? [["Action", "pr-c-manage"]] : []);
    cols.forEach(function (hd) { head.appendChild(D.el("th", { scope: "col", "class": hd[1] }, hd[0])); });
    var thead = D.el("thead"); thead.appendChild(head); table.appendChild(thead);
    var tbody = D.el("tbody");
    if (rows.length) {
      pg.slice.forEach(function (p) { tbody.appendChild(rowFor(p)); });
    } else {
      var er = D.el("tr", { "class": "pr-empty-row" });
      var ec = D.el("td", { "class": "pr-empty-state", colspan: String(cols.length) });
      if (!S.products.length) {
        ec.appendChild(h("span", "pr-empty-title", S.canEdit ? "No products yet — add your first product to get started." : "No products yet."));
      } else {
        ec.appendChild(h("span", "pr-empty-title", "No products match these filters."));
        ec.appendChild(button("Clear filters", "no-btn-ghost pr-clear", function () {
          view.q = ""; view.status = "all"; view.cat = "all"; view.page = 1;
          if (S.searchIn) S.searchIn.value = ""; if (S.statusSel) S.statusSel.value = "all"; if (S.catSel) S.catSel.value = "all";
          refreshList();
        }));
      }
      er.appendChild(ec); tbody.appendChild(er);
    }
    table.appendChild(tbody);
    card.appendChild(table);
    if (rows.length && pg.pages > 1) {
      var nav = h("div", "pr-pagination");
      nav.appendChild(h("div", "pr-page", "Page " + view.page + " of " + pg.pages));
      var links = h("div", "pr-pagination-links");
      var prev = button("← Previous", "no-btn-ghost pr-prev", function () { view.page--; view.menu = null; refreshList(); });
      var next = button("Next →", "no-btn-ghost pr-next", function () { view.page++; view.menu = null; refreshList(); });
      if (view.page <= 1) prev.disabled = true;
      if (view.page >= pg.pages) next.disabled = true;
      links.appendChild(prev); links.appendChild(next);
      nav.appendChild(links);
      card.appendChild(nav);
    }
    S.resultBox.appendChild(card);
    say(rows.length ? rows.length + (rows.length === 1 ? " product shown." : " products shown.") : S.products.length ? "No products match." : "");
    placeMenu();
  }

  /* The open Manage menu is a fixed popover (it would be clipped inside the rounded table card): put it under its button,
     right-aligned, or above it when there is no room below. */
  function placeMenu() {
    var box = S && S.listBox, menu = box && box.querySelector(".pr-menu");
    if (!menu) return;
    var btn = menu.parentNode && menu.parentNode.querySelector(".pr-manage");
    if (!btn || !btn.getBoundingClientRect || !menu.offsetWidth) return;
    var r = btn.getBoundingClientRect(), mw = menu.offsetWidth, mh = menu.offsetHeight;
    var top = r.bottom + 6;
    if (top + mh > window.innerHeight - 8 && r.top - mh - 6 > 8) top = r.top - mh - 6;
    var left = r.right - mw;
    if (left < 8) left = 8;
    menu.style.top = Math.round(top) + "px";
    menu.style.left = Math.round(left) + "px";
  }
  /* A scroll or a resize closes an open menu, as the Inventory page does. */
  function closeMenuOnMove() {
    if (!S || S.mode !== "list" || !S.view || !S.view.menu) return;
    S.view.menu = null;
    refreshList();
  }

  function select(id, label, opts, value, onChange) {
    var wrap = h("div", "pr-tool");
    wrap.appendChild(D.el("label", { "for": id, "class": "pr-sr" }, label));
    var sel = D.el("select", { id: id, "class": "pr-input pr-select" });
    opts.forEach(function (o) { var op = D.el("option", { value: o[0] }, o[1]); if (o[0] === value) op.selected = true; sel.appendChild(op); });
    sel.value = value;
    sel.addEventListener("change", function () { onChange(sel.value); });
    wrap.appendChild(sel);
    return { wrap: wrap, sel: sel };
  }

  function listView() {
    stopDrag();
    S.arrange = null;
    S.mode = "list";
    if (!S.view) S.view = newView();
    S.view.menu = null;
    var view = S.view;
    var r = clear(pane());
    r.removeAttribute("aria-busy");
    var c = counts(S.products, S.canEdit);

    /* Masthead: the store, the page, and the catalog numbers (the Inventory page's blue hero). */
    var name = S.siteName || "Santé store";
    var hero = h("section", "pr-hero");
    hero.setAttribute("aria-label", "Catalog summary");
    var hid = h("div", "pr-hero-id");
    hid.appendChild(h("div", "pr-hero-logo", name.charAt(0).toUpperCase()));
    var main = h("div", "pr-hero-id-main");
    main.appendChild(h("p", "pr-hero-eyebrow", "Santé store · " + name));
    main.appendChild(h("p", "pr-hero-title", "The shared Santé catalog"));
    main.appendChild(h("p", "pr-hero-sub", "One product list for every Santé store, with prices and storefront status"));
    hid.appendChild(main);
    hero.appendChild(hid);
    S.kpisBox = h("div", "pr-hero-kpis");
    hero.appendChild(S.kpisBox);
    r.appendChild(hero);

    if (!S.canEdit) r.appendChild(h("p", "pr-note", "Santé products are managed centrally, so this list is read-only for your store."));

    S.stripBox = h("div", "pr-strip");
    S.stripBox.setAttribute("role", "group");
    S.stripBox.setAttribute("aria-label", "Filter by status");
    r.appendChild(S.stripBox);

    var bar = h("div", "pr-toolbar");
    var form = h("div", "pr-search-form");
    form.setAttribute("role", "search");
    var sw = h("div", "pr-tool pr-tool-search");
    sw.appendChild(D.el("label", { "for": "pr-search", "class": "pr-sr" }, "Search product name or code"));
    var q = D.el("input", { id: "pr-search", type: "search", "class": "pr-input pr-search-input", placeholder: "Search product name or code", autocomplete: "off" });
    q.value = view.q;
    q.addEventListener("input", function () { view.q = q.value; view.page = 1; view.menu = null; refreshList(); });
    sw.appendChild(q);
    form.appendChild(sw);
    var statusOpts = statuses().map(function (s, i) { return [s[0], i ? s[1] : "All status"]; });
    var st = select("pr-status", "Status", statusOpts, view.status, function (v) { view.status = v; view.page = 1; view.menu = null; refreshList(); });
    form.appendChild(st.wrap);
    var ct = select("pr-category", "Category", [["all", "All categories"]].concat(CATEGORIES), view.cat, function (v) { view.cat = v; view.page = 1; view.menu = null; refreshList(); });
    form.appendChild(ct.wrap);
    form.appendChild(button("Search", "no-btn-ghost pr-search-btn", function () { view.q = q.value; view.page = 1; view.menu = null; refreshList(); }));
    bar.appendChild(form);
    if (S.canEdit) bar.appendChild(button("⇅ Arrange", "no-btn-ghost pr-arrange", function () { arrangeView(); }));
    bar.appendChild(button("Export CSV", "no-btn-ghost pr-export", function () {
      var rows = filterProducts(S.products, view, S.canEdit);
      if (!rows.length) { D.toast("Nothing to export", "No products match the filters.", "error"); return; }
      if (downloadCsv(csvText(rows, S.canEdit))) D.toast("CSV downloaded", rows.length === 1 ? "1 product" : rows.length + " products");
      else D.toast("Could not export", "Try again.", "error");
    }));
    if (S.canEdit) bar.appendChild(button("＋ Add product", "no-btn-primary pr-add", function () { openForm(null); }));
    r.appendChild(bar);

    S.listBox = r; S.searchIn = q; S.statusSel = st.sel; S.catSel = ct.sel;
    S.resultBox = h("div", "pr-results");
    r.appendChild(S.resultBox);
    refreshList();
  }

  /* ---------- arrange (owner only) ---------- */

  /* The storefront order: every product, hidden ones too, top to bottom. A drag by the grip (mouse or touch) or the arrow keys on the
     grip moves a row; each drop saves the whole order at once (POST .../catalog/products/order/ {product_ids}), one request at a time,
     the last order wins. A failed save leaves the order on screen and says it is unsaved. */
  var AR_IDLE = "Changes save automatically";

  function arrangeView() {
    if (!S.canEdit) return;
    S.mode = "arrange";
    ++token;
    var r = clear(pane());
    r.removeAttribute("aria-busy");
    var A = { ids: S.products.map(function (p) { return p.id; }), inFlight: false, queued: false, drag: null, timer: null };
    A.saved = A.ids.join(",");
    S.arrange = A;

    var card = h("section", "pr-ar");
    card.setAttribute("aria-label", "Arrange storefront order");
    var head = h("div", "pr-ar-head");
    var hid = h("div", "pr-ar-headtext");
    var title = D.el("h2", { "class": "pr-ar-title", tabindex: "-1" }, "Arrange storefront order");
    hid.appendChild(title);
    hid.appendChild(h("p", "pr-ar-sub", "Customers see these top-to-bottom. Drag the handle to rearrange, or focus it and press the up and down arrow keys. Changes save automatically. " + A.ids.length + (A.ids.length === 1 ? " product." : " products.")));
    hid.appendChild(h("p", "pr-ar-note", "Hidden products are arranged too; they take their place once they are shown in shops."));
    head.appendChild(hid);
    head.appendChild(button("← Back to Products", "no-btn-ghost pr-ar-back", function () { stopDrag(); token++; loadList(); }));
    card.appendChild(head);

    var bar = h("div", "pr-ar-actions");
    var status = h("span", "pr-ar-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.setAttribute("data-state", "idle");
    status.appendChild(h("span", "pr-ar-dot"));
    var statusText = h("span", "pr-ar-status-text", AR_IDLE);
    status.appendChild(statusText);
    bar.appendChild(status);
    var reload = button("Reload products", "no-btn-ghost pr-ar-reload", function () { stopDrag(); token++; loadList(); });
    reload.hidden = true;
    bar.appendChild(reload);
    card.appendChild(bar);

    var cols = h("div", "pr-ar-cols");
    ["", "", "", "Product", "Storefront", "Price"].forEach(function (t, i) { cols.appendChild(h("span", i === 5 ? "pr-ar-col-price" : i === 4 ? "pr-ar-col-store" : "", t)); });
    card.appendChild(cols);

    var list = D.el("ol", { "class": "pr-ar-list" });
    card.appendChild(list);
    r.appendChild(card);

    function setStatus(state, text) {
      clearTimeout(A.timer);
      status.setAttribute("data-state", state);
      statusText.textContent = text;
      reload.hidden = state !== "error";
      if (state === "saved") A.timer = setTimeout(function () { setStatus("idle", AR_IDLE); }, 2600);
    }
    function renumber() {
      var rows = list.children, n = rows.length;
      for (var i = 0; i < n; i++) {
        var pos = rows[i].querySelector(".pr-ar-pos"), grip = rows[i].querySelector(".pr-ar-grip");
        if (pos) pos.textContent = (i + 1) + ".";
        if (grip) grip.setAttribute("aria-label", "Move " + (rows[i].getAttribute("data-name") || "product") + ", position " + (i + 1) + " of " + n + ". Press the up or down arrow key to move it.");
      }
    }
    function orderFromList() {
      var out = [], rows = list.children;
      for (var i = 0; i < rows.length; i++) out.push(rows[i].getAttribute("data-id"));
      return out;
    }
    function save() {
      var order = A.ids.slice(), key = order.join(",");
      if (key === A.saved) { if (status.getAttribute("data-state") === "error") setStatus("idle", AR_IDLE); return; }
      if (A.inFlight) { A.queued = true; return; }
      A.inFlight = true;
      setStatus("saving", "Saving…");
      D.call("POST", productPath() + "order/", { product_ids: order }, true).then(function (res) {
        A.inFlight = false;
        if (res.status === 401) return;
        if (res.ok && res.data && Array.isArray(res.data.products)) {
          A.saved = key;
          S.products = res.data.products;
          if (S.arrange === A) setStatus("saved", "Saved — shops now show this order");
        } else if (S.arrange === A) {
          var e = describeError(res);
          var text = e.kind === "readonly" || e.kind === "billing" ? e.message
            : e.kind === "fields" ? "The product list changed. Reload the products and arrange them again."
            : e.message || MSG.generic;
          setStatus("error", "Not saved. " + text);
          D.toast("Order not saved", text, "error");
        }
        if (A.queued) { A.queued = false; if (S.arrange === A) save(); }
      });
    }
    function drawRows(focusId) {
      clear(list);
      A.ids.forEach(function (id, i) {
        var p = findProduct(id);
        if (!p) return;
        var li = D.el("li", { "class": "pr-ar-row" });
        li.setAttribute("data-id", id);
        li.setAttribute("data-name", p.name);
        var grip = D.el("button", { type: "button", "class": "pr-ar-grip" }, "⠿");
        grip.addEventListener("keydown", function (ev) {
          var d = ev && ev.key === "ArrowUp" ? -1 : ev && ev.key === "ArrowDown" ? 1 : 0;
          if (!d) return;
          if (ev.preventDefault) ev.preventDefault();
          var next = moveId(A.ids, id, d);
          if (next.join(",") === A.ids.join(",")) return;
          A.ids = next;
          drawRows(id);
          say(p.name + " moved to position " + (A.ids.indexOf(id) + 1) + " of " + A.ids.length + ".");
          save();
        });
        li.appendChild(grip);
        li.appendChild(h("span", "pr-ar-pos", (i + 1) + "."));
        li.appendChild(thumb(p));
        var nm = h("span", "pr-ar-name", p.name);
        li.appendChild(nm);
        li.appendChild(h("span", "pr-ar-store", "")).appendChild(badge(p.is_active ? "Live" : "Hidden", p.is_active ? "ok" : "dr"));
        li.appendChild(h("span", "pr-ar-price", formatPeso(p.srp_centavos)));
        list.appendChild(li);
      });
      renumber();
      if (focusId) {
        var g = list.querySelector(".pr-ar-row[data-id]");
        var rows = list.children;
        for (var i = 0; i < rows.length; i++) if (rows[i].getAttribute("data-id") === focusId) { g = rows[i].querySelector(".pr-ar-grip"); break; }
        if (g && g.focus) g.focus();
      }
    }

    /* Pointer drag, from the grip only (so the rest of the row still scrolls on a phone). */
    function moveDrag(e) {
      if (!A.drag) return;
      var rows = list.children, before = null;
      for (var i = 0; i < rows.length; i++) {
        if (rows[i] === A.drag) continue;
        var b = rows[i].getBoundingClientRect();
        if (e.clientY < b.top + b.height / 2) { before = rows[i]; break; }
      }
      if (before) list.insertBefore(A.drag, before); else list.appendChild(A.drag);
      renumber();
    }
    function endDrag() {
      if (!A.drag) return;
      A.drag.classList.remove("pr-ar-drag");
      A.drag = null;
      window.removeEventListener("pointermove", moveDrag);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
      A.ids = orderFromList();
      save();
    }
    A.stop = function () {
      if (!A.drag) return;
      A.drag.classList.remove("pr-ar-drag"); A.drag = null;
      window.removeEventListener("pointermove", moveDrag);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };
    list.addEventListener("pointerdown", function (e) {
      var grip = e.target && e.target.closest && e.target.closest(".pr-ar-grip");
      if (!grip || A.drag) return;
      A.drag = grip.closest(".pr-ar-row");
      A.drag.classList.add("pr-ar-drag");
      if (grip.setPointerCapture) { try { grip.setPointerCapture(e.pointerId); } catch (x) { /* a synthetic pointer */ } }
      window.addEventListener("pointermove", moveDrag);
      window.addEventListener("pointerup", endDrag);
      window.addEventListener("pointercancel", endDrag);
      if (e.preventDefault) e.preventDefault();
    });

    drawRows();
    title.focus();
    say("Arrange storefront order. " + A.ids.length + " products.");
  }
  function stopDrag() { if (S && S.arrange && S.arrange.stop) S.arrange.stop(); }

  function loadList(focusId) {
    var mine = ++token;
    var r = clear(pane());
    r.setAttribute("aria-busy", "true");
    r.appendChild(h("p", "pr-meta", "Loading products…"));
    D.call("GET", productPath(), null, true).then(function (res) {
      if (mine !== token || res.status === 401) return;
      var d = res.data;
      if (!res.ok || !d || !Array.isArray(d.products)) {
        var e = describeError(res);
        r.removeAttribute("aria-busy");
        clear(r).appendChild(failBox(res.status === 404 ? "Products are not available for this store yet." : res.status === 403 && e.kind === "billing" ? e.message : "We couldn’t load your products. Try again.", function () { loadList(); }));
        return;
      }
      S.canEdit = d.can_edit === true;
      S.products = d.products;
      listView();
      if (focusId) { var f = r.querySelector(".pr-manage"); if (f && f.focus) f.focus(); }
    });
  }

  /* ---------- form ---------- */

  var SHIPPING = [["weight_kg", "Weight (kg)", "0.00"], ["volume_slot", "Volume slot", ""], ["shipping_qty", "Shipping quantity", ""],
    ["length_cm", "Length (cm)", ""], ["width_cm", "Width (cm)", ""], ["height_cm", "Height (cm)", ""]];

  function openForm(p) {
    S.mode = "form";
    S.editing = p;
    var mine = ++token;
    var r = clear(pane());
    r.removeAttribute("aria-busy");
    var fields = {}, errs = {};
    var f = D.el("form", { "class": "pr-form", novalidate: "" });

    var head = h("div", "pr-formhead");
    var back = button("Back to products", "no-btn-ghost", function () { token++; loadList(); });
    head.appendChild(back);
    var title = D.el("h2", { "class": "pr-formtitle", tabindex: "-1" }, p ? "Edit product" : "Add product");
    head.appendChild(title);
    f.appendChild(head);

    var top = D.el("div", { "class": "pr-topmsg", role: "alert" });
    top.hidden = true;
    f.appendChild(top);

    function row(name, label, control, hint) {
      var wrap = h("div", "pr-field");
      var lab = D.el("label", { "for": "pr-f-" + name }, label);
      wrap.appendChild(lab);
      control.setAttribute("id", "pr-f-" + name);
      fields[name] = control;
      wrap.appendChild(control);
      if (hint) { wrap.appendChild(h("p", "pr-hint", hint)); }
      var err = D.el("p", { "class": "pr-ferr", id: "pr-e-" + name });
      err.hidden = true;
      errs[name] = err;
      control.setAttribute("aria-describedby", "pr-e-" + name);
      wrap.appendChild(err);
      return wrap;
    }
    function input(type, value, extra) {
      var i = D.el("input", Object.assign({ type: type, "class": "pr-input", autocomplete: "off" }, extra || {}));
      i.value = value == null ? "" : value;
      return i;
    }

    var v = p || {};
    var code = input("text", v.code || "", { maxlength: "64" });
    if (p) { code.readOnly = true; code.setAttribute("aria-readonly", "true"); }
    f.appendChild(row("code", "Product code", code, p ? "The code can't be changed." : "Letters, digits, dots, hyphens or underscores. It is made upper-case."));
    f.appendChild(row("name", "Name", input("text", v.name || "", { maxlength: "120" })));
    var cat = D.el("select", { "class": "pr-input" });
    cat.appendChild(D.el("option", { value: "" }, "No category"));
    CATEGORIES.forEach(function (c) { cat.appendChild(D.el("option", { value: c[0] }, c[1])); });
    cat.value = v.category || "";
    f.appendChild(row("category", "Category", cat));
    var sd = D.el("textarea", { "class": "pr-input pr-area", rows: "3", maxlength: "500" }); sd.value = v.short_description || "";
    f.appendChild(row("short_description", "Short description", sd));
    var ld = D.el("textarea", { "class": "pr-input pr-area pr-area-long", rows: "8", maxlength: "20000" }); ld.value = v.long_description || "";
    f.appendChild(row("long_description", "Long description", ld));

    var price = h("div", "pr-pair");
    price.appendChild(row("srp_centavos", "SRP (₱)", input("text", p ? centavosToField(p.srp_centavos) : "", { inputmode: "decimal" })));
    price.appendChild(row("earnings_rate", "Members discount (%)", input("text", p ? rateToPercent(p.earnings_rate) : "40", { inputmode: "decimal" }), "Between 10 and 50."));
    f.appendChild(price);
    var preview = D.el("p", { "class": "pr-preview", "aria-live": "polite" });
    f.appendChild(preview);
    function refresh() {
      var c = pesosToCentavos(fields.srp_centavos.value), rate = percentToRate(fields.earnings_rate.value);
      var m = c != null && rate ? membersPrice(c, rate) : null;
      preview.textContent = m != null ? "Members price " + formatPeso(m) : "Members price shows once the SRP and discount are valid.";
    }
    fields.srp_centavos.addEventListener("input", refresh);
    fields.earnings_rate.addEventListener("input", refresh);
    refresh();

    var show = D.el("input", { type: "checkbox", id: "pr-f-is_active" });
    show.checked = p ? p.is_active === true : true;
    fields.is_active = show;
    var showRow = h("div", "pr-check");
    var showLab = D.el("label", { "for": "pr-f-is_active" });
    showLab.appendChild(show);
    showLab.appendChild(h("span", "", "Show in shops"));
    showRow.appendChild(showLab);
    showRow.appendChild(h("p", "pr-hint", "Turn this off for a product that is out of stock. A hidden product is neither listed nor orderable."));
    f.appendChild(showRow);

    var det = D.el("details", { "class": "pr-details" });
    det.appendChild(h("summary", "", "Shipping details"));
    var grid = h("div", "pr-dgrid");
    SHIPPING.forEach(function (s) {
      var val = v[s[0]];
      grid.appendChild(row(s[0], s[1], input("text", val == null ? (s[0] === "weight_kg" && !p ? "0.00" : "") : String(val), { inputmode: "decimal" })));
    });
    det.appendChild(grid);
    det.appendChild(h("p", "pr-hint", "Optional for launch. Length, width and height go together."));
    f.appendChild(det);

    var imgBlock = h("fieldset", "pr-image");
    imgBlock.appendChild(h("legend", "", "Image"));
    var imgBody = h("div", "pr-image-body");
    imgBlock.appendChild(imgBody);
    var imgErr = D.el("p", { "class": "pr-ferr", id: "pr-e-image", role: "alert" });
    imgErr.hidden = true;
    imgBlock.appendChild(imgErr);
    f.appendChild(imgBlock);

    var actions = h("div", "pr-actions pr-formactions");
    var save = D.el("button", { type: "submit", "class": "no-btn no-btn-primary" }, p ? "Save changes" : "Add product");
    actions.appendChild(save);
    actions.appendChild(button("Cancel", "no-btn-ghost", function () { token++; loadList(); }));
    f.appendChild(actions);
    r.appendChild(f);

    function fieldError(name, text) {
      var e = errs[name], c = fields[name];
      if (!e) return;
      e.textContent = text || ""; e.hidden = !text;
      if (c) { if (text) c.setAttribute("aria-invalid", "true"); else c.removeAttribute("aria-invalid"); }
    }
    function clearErrors() {
      Object.keys(errs).forEach(function (k) { fieldError(k, ""); });
      top.hidden = true; clear(top);
      imgErr.hidden = true; imgErr.textContent = "";
    }
    function topMessage(text, reload) {
      clear(top); top.hidden = !text;
      if (!text) return;
      top.appendChild(h("p", "pr-error", text));
      if (reload) top.appendChild(button("Reload", "no-btn-ghost", reloadProduct));
      say(text);
    }
    function busy(on) {
      save.disabled = on;
      save.textContent = on ? "Saving…" : (S.editing ? "Save changes" : "Add product");
      if (on) f.setAttribute("aria-busy", "true"); else f.removeAttribute("aria-busy");
    }
    /* Fresh values for this product from the server: the one reaction to a stale revision. */
    function reloadProduct() {
      var id = S.editing && S.editing.id;
      D.call("GET", productPath(), null, true).then(function (res) {
        if (mine !== token || res.status === 401) return;
        if (!res.ok || !res.data || !Array.isArray(res.data.products)) { topMessage("We couldn’t reload the product. Try again.", true); return; }
        S.canEdit = res.data.can_edit === true; S.products = res.data.products;
        var fresh = findProduct(id);
        if (fresh) openForm(fresh); else loadList();
      });
    }
    function applyFailure(res) {
      var e = describeError(res);
      if (e.kind === "image") { imgErr.textContent = e.message; imgErr.hidden = false; say(e.message); return; }
      var shown = false;
      Object.keys(e.fields).forEach(function (k) {
        if (errs[k]) { fieldError(k, e.fields[k]); shown = true; }
        else if (k === "file" || k === "revision") { imgErr.textContent = e.fields[k]; imgErr.hidden = false; shown = true; }
      });
      if (e.kind === "fields" && shown) { topMessage(MSG.invalid); var first = f.querySelector("[aria-invalid='true']"); if (first && first.focus) first.focus(); return; }
      topMessage(e.message, e.kind === "stale");
    }

    /* ----- image ----- */
    function drawImage() {
      clear(imgBody);
      var cur = S.editing;
      if (!cur) { imgBody.appendChild(h("p", "pr-hint", "Save the product first, then add its image.")); return; }
      var wrap = h("div", "pr-image-row"), pic = h("div", "pr-pic pr-pic-sm"), src = safeImage(cur.image_url);
      if (src) pic.appendChild(D.el("img", { src: src, alt: "Current image of " + cur.name }));
      else pic.appendChild(h("span", "pr-pic-none", "No image"));
      wrap.appendChild(pic);
      var side = h("div", "pr-image-side");
      var file = D.el("input", { type: "file", id: "pr-f-image", accept: IMAGE_TYPES.join(","), "class": "pr-file" });
      var pickBtn = button(src ? "Replace image" : "Upload image", "no-btn-ghost", function () { file.click(); });
      side.appendChild(pickBtn); side.appendChild(file);
      if (src) side.appendChild(button("Remove image", "no-btn-ghost", removeImage));
      side.appendChild(h("p", "pr-hint", "JPEG, PNG or WebP, up to 2 MB."));
      wrap.appendChild(side);
      imgBody.appendChild(wrap);
      file.addEventListener("change", function () {
        var one = file.files && file.files[0];
        if (!one) return;
        imgErr.hidden = true;
        if (IMAGE_TYPES.indexOf(one.type) < 0) { imgErr.textContent = "Upload a JPEG, PNG or WebP image."; imgErr.hidden = false; file.value = ""; return; }
        if (one.size > IMAGE_MAX) { imgErr.textContent = "The image is too large. The limit is 2 MB."; imgErr.hidden = false; file.value = ""; return; }
        var form = new FormData();
        form.append("file", one);
        form.append("revision", String(S.editing.revision));
        imageCall("POST", productPath(S.editing) + "image/", form);
      });
    }
    function removeImage() { imageCall("DELETE", productPath(S.editing) + "image/?revision=" + encodeURIComponent(S.editing.revision), null); }
    function imageCall(method, path, form) {
      clearErrors();
      imgBody.setAttribute("aria-busy", "true");
      var req = form ? D.send(method, path, form) : D.call(method, path, null, true);
      req.then(function (res) {
        if (mine !== token || res.status === 401) return;
        imgBody.removeAttribute("aria-busy");
        if (res.ok && res.data && res.data.id) {
          S.editing = res.data; replaceProduct(res.data);
          drawImage(); say("Image saved."); D.toast("Saved", "The product image is updated.");
          return;
        }
        applyFailure(res); drawImage();
      });
    }
    drawImage();

    /* ----- submit ----- */
    function read(name) { return fields[name].value.trim(); }
    function gather() {
      var out = {}, bad = {};
      var name = read("name");
      if (!name) bad.name = "Enter a name."; else out.name = name;
      var c = pesosToCentavos(read("srp_centavos"));
      if (c == null) bad.srp_centavos = "Enter an SRP above ₱0, with up to two decimals."; else out.srp_centavos = c;
      var rate = percentToRate(read("earnings_rate"));
      if (!rate) bad.earnings_rate = "Enter a discount from 10 to 50."; else out.earnings_rate = rate;
      out.category = fields.category.value;
      out.short_description = fields.short_description.value.trim();
      out.long_description = fields.long_description.value.trim();
      out.is_active = fields.is_active.checked;
      SHIPPING.forEach(function (s) {
        var k = s[0], t = read(k);
        if (t === "") {
          if (p && p[k] != null) bad[k] = "Enter a value. A saved value can't be left blank.";
          else if (k === "weight_kg" && !p) out[k] = "0.00";
          return;
        }
        if (k === "shipping_qty") {
          if (!/^[1-9]\d{0,8}$/.test(t)) { bad[k] = "Enter a whole number of 1 or more."; return; }
          out[k] = parseInt(t, 10);
        } else out[k] = t;
      });
      return { out: out, bad: bad };
    }
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      clearErrors();
      var g = gather();
      if (!p) {
        var cd = read("code").toUpperCase();
        if (!cd) g.bad.code = "Enter a product code."; else g.out.code = cd;
      }
      var keys = Object.keys(g.bad);
      if (keys.length) {
        keys.forEach(function (k) { fieldError(k, g.bad[k]); });
        topMessage(MSG.invalid);
        var el = fields[keys[0]]; if (el && el.focus) el.focus();
        return;
      }
      busy(true);
      if (!p) createProduct(g.out); else updateProduct(g.out);
    });
    function done(product, msg) {
      busy(false);
      replaceProduct(product);
      D.toast("Saved", msg);
      token++;
      loadList(product.id);
    }
    function createProduct(out) {
      var wantActive = out.is_active;
      delete out.is_active; /* a new product is created active; hiding is a second step */
      D.call("POST", productPath(), out, true).then(function (res) {
        if (mine !== token || res.status === 401) return;
        if (!(res.ok && res.data && res.data.id)) { busy(false); applyFailure(res); return; }
        var created = res.data;
        if (wantActive) { done(created, "The product is added."); return; }
        D.call("PATCH", productPath(created), { revision: created.revision, is_active: false }, true).then(function (r2) {
          if (mine !== token || r2.status === 401) return;
          if (r2.ok && r2.data && r2.data.id) { done(r2.data, "The product is added and hidden."); return; }
          busy(false);
          S.products.push(created);
          S.editing = created; /* the product exists: carry on editing it instead of creating it twice */
          openForm(created);
          var again = document.getElementById("pr-f-is_active"); if (again) again.checked = false;
          var msg = describeError(r2).message;
          var t = pane().querySelector(".pr-topmsg");
          if (t) { t.hidden = false; clear(t); t.appendChild(h("p", "pr-error", "The product was added, but we couldn’t hide it. " + msg)); }
        });
      });
    }
    function updateProduct(out) {
      var body = { revision: p.revision }, n = 0;
      Object.keys(out).forEach(function (k) {
        var was = p[k];
        if (k === "shipping_qty") { if (was === out[k]) return; }
        else if (k === "is_active" || k === "srp_centavos") { if (was === out[k]) return; }
        else if (String(was == null ? "" : was) === String(out[k])) return;
        body[k] = out[k]; n++;
      });
      if (!n) { busy(false); topMessage("There are no changes to save."); return; }
      body.revision = S.editing.revision;
      D.call("PATCH", productPath(p), body, true).then(function (res) {
        if (mine !== token || res.status === 401) return;
        if (res.ok && res.data && res.data.id) { done(res.data, "Your changes are saved."); return; }
        busy(false); applyFailure(res);
      });
    }
    title.focus();
  }

  /* ---------- history ---------- */

  function openHistory(p) {
    S.mode = "history";
    var mine = ++token;
    var r = clear(pane());
    r.setAttribute("aria-busy", "true");
    var head = h("div", "pr-formhead");
    head.appendChild(button("Back to products", "no-btn-ghost", function () { token++; loadList(); }));
    var title = D.el("h2", { "class": "pr-formtitle", tabindex: "-1" }, "History of " + p.name);
    head.appendChild(title);
    r.appendChild(head);
    var body = h("div", "pr-hist");
    body.appendChild(h("p", "pr-meta", "Loading history…"));
    r.appendChild(body);
    title.focus();
    if (!PRODUCT_RE.test(p.id)) { clear(body).appendChild(failBox("We couldn’t load the history.")); r.removeAttribute("aria-busy"); return; }
    D.call("GET", productPath(p) + "revisions/", null, true).then(function (res) {
      if (mine !== token || res.status === 401) return;
      r.removeAttribute("aria-busy");
      var rows = res.data && res.data.revisions;
      clear(body);
      if (!res.ok || !Array.isArray(rows)) { body.appendChild(failBox("We couldn’t load the history. Try again.", function () { openHistory(p); })); return; }
      var list = D.el("ol", { "class": "pr-histlist" });
      rows.forEach(function (rev, i) {
        var li = h("li", "pr-histitem");
        var top = h("p", "pr-histtop");
        top.appendChild(h("span", "pr-histwhen", stamp(rev.changed_at)));
        top.appendChild(chip(rev.source === "seed" ? "Seed" : "Owner", "chip-neutral"));
        li.appendChild(top);
        changes(rev, rows[i + 1]).forEach(function (c) { li.appendChild(h("p", "pr-histchange", c)); });
        list.appendChild(li);
      });
      body.appendChild(list);
    });
  }

  /* ---------- site choice ---------- */

  function start() {
    var mine = ++token;
    S = { site: null, canEdit: false, products: [], mode: "list", editing: null, innerRoot: null };
    var r = clear(root());
    r.setAttribute("aria-busy", "true");
    r.appendChild(h("p", "pr-meta", "Loading your stores…"));
    D.call("GET", "/sites/", null, true).then(function (res) {
      if (mine !== token || res.status === 401) return;
      var sites = D.sitesOf(res).filter(function (s) { return s && s.template === "sante"; });
      if (!res.ok) { r.removeAttribute("aria-busy"); clear(r).appendChild(failBox("We couldn’t load your stores. Try again.", start)); return; }
      if (!sites.length) {
        r.removeAttribute("aria-busy");
        clear(r).appendChild(h("p", "pr-meta", "Products are available for Santé stores. Create your Santé store to see them here."));
        return;
      }
      var ids = sites.map(function (s) { return s.id; });
      S.site = D.siteFromQuery(ids);
      function nameOf(id) {
        for (var i = 0; i < sites.length; i++) if (sites[i].id === id) return sites[i].display_name || sites[i].subdomain || "Santé store";
        return "Santé store";
      }
      S.siteName = nameOf(S.site);
      clear(r);
      if (sites.length > 1) {
        var wrap = h("div", "pr-pick"), lab = D.el("label", { "for": "pr-site", "class": "pr-pick-label" }, "Store");
        var sel = D.el("select", { id: "pr-site", "class": "pr-input" });
        sites.forEach(function (s) {
          var o = D.el("option", { value: String(s.id) }, s.display_name || s.subdomain || "Store");
          if (s.id === S.site) o.selected = true;
          sel.appendChild(o);
        });
        sel.addEventListener("change", function () {
          if (ids.indexOf(sel.value) < 0) return;
          S.site = sel.value;
          S.siteName = nameOf(S.site);
          S.view = newView();
          loadInto(inner);
        });
        wrap.appendChild(lab); wrap.appendChild(sel);
        r.appendChild(wrap);
      }
      var inner = h("div", "pr-inner");
      r.appendChild(inner);
      r.removeAttribute("aria-busy");
      loadInto(inner);
    });
  }
  /* The list is drawn into #pr-root by listView(); with several stores the chooser sits above and the root is the inner box. */
  function loadInto(inner) {
    S.innerRoot = inner;
    loadList();
  }

  /* A click outside an open Manage menu closes it. */
  function outside(ev) {
    var t = ev && ev.target;
    if (!S || S.mode !== "list" || !S.view || !S.view.menu) return;
    if (t && t.closest && t.closest(".pr-menuwrap")) return;
    S.view.menu = null;
    refreshList();
  }

  window.NOProducts = {
    util: { pesosToCentavos: pesosToCentavos, formatPeso: formatPeso, centavosToField: centavosToField, percentToRate: percentToRate,
      rateToPercent: rateToPercent, membersPrice: membersPrice, describeError: describeError, changes: changes, categoryLabel: categoryLabel,
      gaps: gaps, counts: counts, filterProducts: filterProducts, csvCell: csvCell, csvText: csvText, moveId: moveId },
    show: function () {
      document.addEventListener("click", outside);
      window.addEventListener("scroll", closeMenuOnMove, true);
      window.addEventListener("resize", closeMenuOnMove);
      start();
    },
    hide: function () {
      token++; say(""); stopDrag();
      document.removeEventListener("click", outside);
      window.removeEventListener("scroll", closeMenuOnMove, true);
      window.removeEventListener("resize", closeMenuOnMove);
    }
  };
})();
