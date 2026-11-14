/* Products (/products/, ClickUp z8uq9mek5w, CAT-1): the shared Santé catalog.
   The catalog owner's store lists, adds and edits products in a tabbed editor (Details, Description; TWCinc's product editor),
   uploads up to five photos each and reads a product's history; every other Santé store sees the same list read-only. Reads and
   writes GET and POST /sites/{id}/catalog/products/, PATCH .../{product}/, POST and DELETE .../{product}/image/?slot=N,
   GET .../{product}/revisions/ and POST .../catalog/shipping-preview/ (the fee box, read-only). The server decides who may write (can_edit), prices
   and conflicts; the browser only shows them. Money is whole centavos; the earnings rate (the members discount) is sent as
   fixed text such as "0.4000". Plain ES5; API strings reach the page through textContent or D.el only; no storage key.
   NOProducts.util holds the pure helpers (tests/products.test.mjs). */
(function () {
  var D = window.NODash;
  var token = 0;
  var CATEGORIES = [["barley", "Barley"], ["drinks", "Specialty Drinks"], ["essentials", "Essentials"], ["beauty", "Beauty"]];
  var PRODUCT_RE = /^prod_[0-9A-Za-z]+$/;
  var IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
  var IMAGE_MAX = 2 * 1024 * 1024; /* what the API stores: the cropped photo is checked against it */
  var IMAGE_ORIGINAL_MAX = 10 * 1024 * 1024; /* every photo is cropped first, so the original may be larger than the stored photo */
  var SEARCH_DELAY = 250; /* ms after the last keystroke before the table filters */
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
    features: "Features", specifications: "Specifications", advantages: "Advantages", benefits: "Benefits",
    image_url: "Photo 1", weight_kg: "Weight", srp_centavos: "Price (SRP)", earnings_rate: "Members rate", volume_slot: "Volume slot",
    shipping_qty: "Shipping quantity", length_cm: "Length", width_cm: "Width", height_cm: "Height", is_active: "Visibility" };
  var ORDER = ["name", "short_description", "long_description", "features", "specifications", "advantages", "benefits", "category", "image_url", "srp_centavos", "earnings_rate", "is_active",
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
    for (var i = 1; i < 5; i++) {
      var now = Array.isArray(row.image_urls) ? row.image_urls[i] : null, was = Array.isArray(before.image_urls) ? before.image_urls[i] : null;
      if ((now || null) !== (was || null)) out.push("Photo " + (i + 1) + " changed");
    }
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
    if (p.weight_kg == null || p.shipping_qty == null) add("Shipping details");
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
        if (S.statusSel) { S.statusSel.value = s[0]; syncCombo(S.statusSel); }
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
          clearTimeout(S.searchTimer);
          view.q = ""; view.status = "all"; view.cat = "all"; view.page = 1;
          if (S.searchIn) S.searchIn.value = "";
          if (S.statusSel) { S.statusSel.value = "all"; syncCombo(S.statusSel); }
          if (S.catSel) { S.catSel.value = "all"; syncCombo(S.catSel); }
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

  /* The house dropdown, mirrored from payments.js combo() (the pm-combo on Payments settings): the same box, panel below it
     and typing filter, in the dash colours and with textContent only. The native select stays in the page, hidden, with its
     id and as the source of truth, so the form code and the tests read and set it unchanged. Differences from payments.js:
     every option is listed, the empty one too ("No category", "All status"), so a chosen value can be un-picked; the box shows
     the chosen option's text; and select.prSync() redraws the box after the code sets select.value. */
  function combo(select, label, o) {
    o = o || {};
    var wrap = h("div", "pr-combo"), box = h("div", "pr-combo-box"), panel = h("div", "pr-combo-panel"), rows = [], active = -1;
    var input = D.el("input", { "class": "pr-combo-input", type: "text", role: "combobox", autocomplete: "off", spellcheck: "false", "aria-label": label, "aria-autocomplete": "list", "aria-expanded": "false", "aria-controls": select.id + "-list" });
    if (o.describedby) input.setAttribute("aria-describedby", o.describedby);
    panel.setAttribute("id", select.id + "-list"); panel.setAttribute("role", "listbox");
    select.parentNode.insertBefore(wrap, select);
    select.classList.add("pr-combo-native"); select.setAttribute("tabindex", "-1"); select.setAttribute("aria-hidden", "true");
    wrap.appendChild(select); box.appendChild(input); box.appendChild(h("span", "pr-combo-caret")); wrap.appendChild(box); wrap.appendChild(panel);
    function opts() { return Array.prototype.slice.call(select.children); }
    /* With o.blankEmpty the empty option is not typed into the box: the box stays empty and shows that option's text as its
       placeholder, so there is nothing to delete before choosing; the full list still opens (draw("") lists every option). */
    function chosen() {
      var all = opts(), t = all.length ? all[0].textContent : "";
      for (var i = 0; i < all.length; i++) if (all[i].value === select.value) { t = all[i].textContent; if (o.blankEmpty && all[i].value === "") t = ""; break; }
      if (o.blankEmpty && all.length && all[0].value === "" && !all.some(function (x) { return x.value === select.value; })) t = "";
      return t;
    }
    function isOpen() { return wrap.classList.contains("is-open"); }
    function mark(i) {
      active = i;
      rows.forEach(function (r, n) { r.classList.toggle("is-active", n === i); });
      if (i >= 0) input.setAttribute("aria-activedescendant", rows[i].id); else input.removeAttribute("aria-activedescendant");
    }
    function announce() {
      if (typeof Event === "function" && select.dispatchEvent) select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    function draw(q) {
      clear(panel); rows = [];
      opts().forEach(function (op) {
        if (q && op.textContent.toLowerCase().indexOf(q) < 0) return;
        var on = op.value === select.value;
        var row = h("div", "pr-combo-opt" + (on ? " is-selected" : ""), op.textContent);
        row.setAttribute("id", select.id + "-opt-" + rows.length); row.setAttribute("role", "option"); row.setAttribute("aria-selected", String(on));
        row.addEventListener("click", function () { select.value = op.value; input.value = chosen(); announce(); shut(); });
        rows.push(row); panel.appendChild(row);
      });
      if (!rows.length) panel.appendChild(h("div", "pr-combo-opt is-disabled", "No matches"));
      mark(-1);
    }
    /* Fixed, so the page's scrolling cannot clip it; opens upward only when there is no room below. */
    function place() {
      if (!box.getBoundingClientRect) return;
      var r = box.getBoundingClientRect(), below = window.innerHeight - r.bottom, up = below < 160 && r.top > below;
      panel.style.left = r.left + "px"; panel.style.width = r.width + "px";
      panel.style.maxHeight = Math.max(120, Math.min(320, (up ? r.top : below) - 16)) + "px";
      panel.style.top = up ? "auto" : (r.bottom + 6) + "px";
      panel.style.bottom = up ? (window.innerHeight - r.top + 6) + "px" : "auto";
    }
    function onScroll(e) { if (!panel.contains || !panel.contains(e.target)) shut(); }
    function onDoc(e) { if (!wrap.contains || !wrap.contains(e.target)) shut(); }
    function show() {
      if (isOpen()) return;
      wrap.classList.add("is-open"); input.setAttribute("aria-expanded", "true");
      draw(""); place();
      window.addEventListener("resize", place); document.addEventListener("scroll", onScroll, true); document.addEventListener("click", onDoc);
    }
    function shut() {
      wrap.classList.remove("is-open"); input.setAttribute("aria-expanded", "false"); input.value = chosen(); mark(-1);
      window.removeEventListener("resize", place); document.removeEventListener("scroll", onScroll, true); document.removeEventListener("click", onDoc);
    }
    box.addEventListener("click", function () { show(); input.focus(); });
    select.addEventListener("focus", function () { input.focus(); }); /* a label click or a server error lands on the native select */
    select.addEventListener("change", function () { input.value = chosen(); });
    select.prSync = function () { input.value = chosen(); };
    input.addEventListener("focus", function () { if (input.select) input.select(); });
    input.addEventListener("input", function () { show(); draw(input.value.trim().toLowerCase()); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Tab") { shut(); return; }
      if (e.key === "Escape" && isOpen()) { e.preventDefault(); e.stopPropagation(); shut(); return; } /* the popup stays open */
      if (e.key === "Enter") { e.preventDefault(); if (active >= 0) rows[active].fire ? rows[active].fire("click") : rows[active].click(); else show(); return; }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      if (!isOpen()) { show(); return; }
      var d = e.key === "ArrowDown" ? 1 : -1, n = rows.length;
      if (n) mark(active < 0 ? (d > 0 ? 0 : n - 1) : (active + d + n) % n);
    });
    if (o.blankEmpty && select.firstChild && select.firstChild.value === "") input.setAttribute("placeholder", select.firstChild.textContent);
    input.value = chosen();
  }
  /* Redraw a combo's box after the code set its select's value (a tile click, Clear filters). */
  function syncCombo(sel) { if (sel && sel.prSync) sel.prSync(); }

  function select(id, label, opts, value, onChange) {
    var wrap = h("div", "pr-tool");
    wrap.appendChild(D.el("label", { "for": id, "class": "pr-sr" }, label));
    var sel = D.el("select", { id: id, "class": "pr-input pr-select" });
    opts.forEach(function (o) { var op = D.el("option", { value: o[0] }, o[1]); if (o[0] === value) op.selected = true; sel.appendChild(op); });
    sel.value = value;
    sel.addEventListener("change", function () { onChange(sel.value); });
    wrap.appendChild(sel);
    combo(sel, label);
    return { wrap: wrap, sel: sel };
  }

  function listView() {
    stopDrag();
    if (S.searchTimer) clearTimeout(S.searchTimer);
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
    /* The dash quick-links search box: the magnifier inside, a light-blue border on focus. No button: the table filters a moment
       after the last keystroke, and at once on Enter. */
    var qbox = h("div", "pr-qs");
    var mag = icon("M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-3.5-3.5");
    qbox.appendChild(mag);
    var q = D.el("input", { id: "pr-search", type: "text", "class": "pr-qs-input pr-search-input", placeholder: "Search product name or code", autocomplete: "off", spellcheck: "false", enterkeyhint: "search" });
    q.value = view.q;
    function applySearch() { clearTimeout(S.searchTimer); view.q = q.value; view.page = 1; view.menu = null; refreshList(); }
    q.addEventListener("input", function () { clearTimeout(S.searchTimer); S.searchTimer = setTimeout(applySearch, SEARCH_DELAY); });
    q.addEventListener("keydown", function (e) { if (e && e.key === "Enter") { if (e.preventDefault) e.preventDefault(); applySearch(); } });
    qbox.appendChild(q);
    sw.appendChild(qbox);
    form.appendChild(sw);
    var statusOpts = statuses().map(function (s, i) { return [s[0], i ? s[1] : "All status"]; });
    var st = select("pr-status", "Status", statusOpts, view.status, function (v) { view.status = v; view.page = 1; view.menu = null; refreshList(); });
    form.appendChild(st.wrap);
    var ct = select("pr-category", "Category", [["all", "All categories"]].concat(CATEGORIES), view.cat, function (v) { view.cat = v; view.page = 1; view.menu = null; refreshList(); });
    form.appendChild(ct.wrap);
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

  var SLOTS = 5;
  /* The shipping inputs, in the order the Shipping card shows them. Volume slot is not on the form: the API derives and stores it. */
  var SHIPPING = [["length_cm", "Length (cm)"], ["width_cm", "Width (cm)"], ["height_cm", "Height (cm)"], ["weight_kg", "Actual weight (kg)"],
    ["shipping_qty", "Units per shipping box"]];
  /* The Description tab: key, label, hint and the longest text the API takes. */
  var TEXTS = [["short_description", "Short description", 500, 3], ["long_description", "Long description", 20000, 8], ["features", "Features", 5000, 6],
    ["specifications", "Specifications", 5000, 6], ["advantages", "Advantages", 5000, 6], ["benefits", "Benefits", 5000, 6]];
  var FEE_NOTE = "Estimated courier charge for one unit. The amount charged at checkout can differ, because it uses the buyer’s exact address and the order total, so treat this as a floor.";

  /* The five photo addresses, slot 1 first, "" where empty. An older API without image_urls gives the one image_url as slot 1. */
  function imageUrls(p) {
    var list = p && Array.isArray(p.image_urls) ? p.image_urls : [], out = [];
    for (var i = 0; i < SLOTS; i++) out.push(safeImage(list[i]) || (i === 0 && !list.length ? safeImage(p && p.image_url) : ""));
    return out;
  }
  /* The shipping preview's body from the typed values, or why it cannot be asked yet: the three sizes go together, then the weight. */
  function previewBody(v) {
    var dec = /^\d{1,4}(?:\.\d{1,2})?$/;
    function pos(t) { return dec.test(t) && parseFloat(t) > 0; }
    var sizes = ["length_cm", "width_cm", "height_cm"].filter(function (k) { return pos(String(v[k] || "").trim()); });
    if (sizes.length < 3) return { body: null, why: "sizes" };
    if (!pos(String(v.weight_kg || "").trim())) return { body: null, why: "weight" };
    var q = String(v.shipping_qty || "").trim();
    return { body: { weight_kg: String(v.weight_kg).trim(), length_cm: String(v.length_cm).trim(), width_cm: String(v.width_cm).trim(),
      height_cm: String(v.height_cm).trim(), shipping_qty: /^[1-9]\d{0,8}$/.test(q) ? parseInt(q, 10) : null }, why: "" };
  }
  /* The preview's answer as tiles ([figure, label]) and a footnote. Without a peso figure the reason is the note. */
  function feeModel(d) {
    d = d || {};
    var tiles = [];
    if (typeof d.ncr_centavos === "number") {
      tiles.push([formatPeso(d.ncr_centavos), "To NCR"]);
      if (typeof d.mindanao_centavos === "number") tiles.push([formatPeso(d.mindanao_centavos), "To Mindanao"]);
      if (typeof d.billable_kg === "string" && d.billable_kg) tiles.push([d.billable_kg + " kg", "Billed at"]);
      return { tiles: tiles, reason: typeof d.reason === "string" ? d.reason : "", note: FEE_NOTE };
    }
    return { tiles: tiles, reason: "", note: typeof d.reason === "string" && d.reason ? d.reason : "The estimate is not available for this package." };
  }

  /* The tabbed editor, for Add and for Edit: TWCinc's merchants/product_form.html (the review-off tabbed editor) and its mpf- styles.
     Tabs (a bar at the top of the column, like the Settings menu): Details, Description (off on Add), Media Library (disabled). Details has
     the Identity, Photos, Pricing and Shipping cards and a save bar at the bottom of the form; Description has its own form. Each tab saves on its own and the editor stays open; Add becomes Edit
     after its first Details save. Only our catalog's fields are in it. */
  var ICON = {
    id: "M4 6h16v12H4zM8 10h4M8 14h8M15 10h2",
    text: "M4 6h16M4 10h16M4 14h10M4 18h12",
    photo: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01",
    price: "M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L3 13V4h9l8.6 8.6a2 2 0 010 2.8zM8 8h.01",
    back: "M19 12H5M12 5l-7 7 7 7",
    ship: "M3 7h11v9H3zM14 10h4l3 3v3h-7zM7 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM17 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"
  };
  function icon(d) {
    var NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg"), path = document.createElementNS(NS, "path");
    svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("width", "18"); svg.setAttribute("height", "18"); svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor"); svg.setAttribute("stroke-width", "2"); svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round"); svg.setAttribute("aria-hidden", "true"); svg.setAttribute("focusable", "false");
    path.setAttribute("d", d); svg.appendChild(path);
    return svg;
  }
  /* A card: icon chip, h3 and hint in the head (the title is not focusable), the fields in the body. */
  function card(title, hint, ico, id) {
    var sec = D.el("section", { "class": "pr-card", id: id });
    var head = h("div", "pr-card-head"), chip = h("span", "pr-card-ico"), txt = h("div", "pr-card-head-text");
    chip.appendChild(icon(ico));
    txt.appendChild(h("h3", "", title)); txt.appendChild(h("p", "pr-card-hint", hint));
    head.appendChild(chip); head.appendChild(txt);
    var body = h("div", "pr-card-body");
    sec.appendChild(head); sec.appendChild(body);
    return { sec: sec, body: body, head: head };
  }
  function pairOf(cls) { return h("div", cls); }

  function openForm(p, notice, tabName) {
    S.mode = "form";
    S.editing = p || null;
    var adding = !p;
    var mine = ++token;
    var r = clear(pane());
    r.removeAttribute("aria-busy");
    var fields = {}, errs = {}, pending = [null, null, null, null, null]; /* pending: the cropped photos an Add form uploads after the product exists */
    var tab = tabName === "description" && !adding ? "description" : "details";
    var previewTimer = null, previewSeq = 0, imgBusyOn = false, slotTiles = [];
    var f = h("div", "pr-form pr-tabbed");

    function leave() { dropPhotos(); clearTimeout(previewTimer); token++; loadList(); }
    /* No visible title: a screen-reader heading takes the focus when the editor opens. */
    var title = D.el("h2", { "class": "pr-formtitle pr-sr", tabindex: "-1" }, adding ? "Add a product" : "Edit product");
    f.appendChild(title);

    var top = D.el("div", { "class": "pr-topmsg", role: "alert" });
    top.hidden = true;

    function row(name, label, control, hint, node) {
      var wrap = h("div", "pr-field");
      var lab = D.el("label", { "for": "pr-f-" + name }, label);
      wrap.appendChild(lab);
      control.setAttribute("id", "pr-f-" + name);
      fields[name] = control;
      wrap.appendChild(node || control);
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
    /* A prefix box ("₱", "%") joined to the input; the label still points at the input. */
    function group(prefix, ctl) {
      var g = h("div", "pr-ig");
      g.appendChild(h("span", "pr-ig-pre", prefix));
      g.appendChild(ctl);
      return g;
    }
    function read(name) { return fields[name].value.trim(); }

    /* ----- tabs ----- */
    var tabs = D.el("div", { "class": "set-tabs pr-tabs", role: "tablist", "aria-label": "Product sections" });
    var tabBtns = {}, panels = {};
    var keys = adding ? ["details"] : ["details", "description"];
    function tabButton(key, label) {
      var b = D.el("button", { type: "button", "class": "pr-tab", role: "tab", id: "pr-tab-" + key, "aria-controls": "pr-panel-" + key }, label);
      b.addEventListener("click", function () { selectTab(key, false); });
      b.addEventListener("keydown", function (e) {
        var d = e && e.key === "ArrowRight" ? 1 : e && e.key === "ArrowLeft" ? -1 : 0;
        if (!d || adding) return;
        if (e.preventDefault) e.preventDefault();
        selectTab(key === "details" ? "description" : "details", true);
      });
      tabBtns[key] = b; tabs.appendChild(b);
    }
    tabButton("details", "Details");
    if (adding) {
      /* Off until the first Details save creates the product. */
      var descOff = D.el("button", { type: "button", "class": "pr-tab pr-tab-off", role: "tab", id: "pr-tab-description", "aria-disabled": "true", tabindex: "-1", title: "Save the Details first" }, "Description");
      descOff.disabled = true;
      tabs.appendChild(descOff);
    } else tabButton("description", "Description");
    var media = D.el("button", { type: "button", "class": "pr-tab pr-tab-off", role: "tab", id: "pr-tab-media", "aria-disabled": "true", tabindex: "-1" }, "Media Library ");
    media.disabled = true;
    media.appendChild(h("span", "pr-soon", "Coming soon"));
    tabs.appendChild(media);
    r.appendChild(tabs);
    var back = D.el("a", { "class": "pr-backlink", href: "/products/" });
    back.appendChild(icon(ICON.back));
    back.appendChild(h("span", "", "Back to products"));
    back.addEventListener("click", function (e) { if (e && e.preventDefault) e.preventDefault(); leave(); });
    f.appendChild(back);
    f.appendChild(top);
    function selectTab(key, focus) {
      tab = key;
      keys.forEach(function (k) {
        var on = k === key;
        tabBtns[k].classList.toggle("is-active", on);
        tabBtns[k].setAttribute("aria-selected", on ? "true" : "false");
        tabBtns[k].setAttribute("tabindex", on ? "0" : "-1");
        panels[k].hidden = !on;
      });
      if (focus && tabBtns[key].focus) tabBtns[key].focus();
    }

    /* ----- Details tab ----- */
    var df = D.el("form", { "class": "pr-tabform", novalidate: "" });
    var v = p || {};
    var code = input("text", v.code || "", { maxlength: "64" });
    if (p) { code.readOnly = true; code.setAttribute("aria-readonly", "true"); }
    var codeRow = row("code", "Product code (SKU)", code, p ? "Fixed after the product is created." : "");
    var nameRow = row("name", "Product name", input("text", v.name || "", { maxlength: "120" }));
    var cat = D.el("select", { "class": "pr-input" });
    cat.appendChild(D.el("option", { value: "" }, "No category"));
    CATEGORIES.forEach(function (c) { cat.appendChild(D.el("option", { value: c[0] }, c[1])); });
    cat.value = v.category || "";
    var catRow = row("category", "Category", cat);
    combo(cat, "Category", { describedby: "pr-e-category", blankEmpty: true });
    var show = D.el("input", { type: "checkbox", id: "pr-f-is_active" });
    show.checked = p ? p.is_active === true : true;
    fields.is_active = show;
    var showLab = D.el("label", { "for": "pr-f-is_active" });
    showLab.appendChild(show);
    showLab.appendChild(h("span", "", "Show in shops"));
    var showRow = h("div", "pr-check");
    showRow.appendChild(showLab);
    showRow.appendChild(h("p", "pr-hint", "Turn this off to keep the product out of the shops. You can change it later from the Products list."));

    var c1 = card("Identity", "How your product is catalogued. The product code must be unique in the catalog.", ICON.id, "pr-s-identity");
    /* A two-column grid, filled row by row: name | code, then category | Show in shops (level with Category). On a phone the one column
       keeps that order: name, code, category, show in shops. */
    var r1 = pairOf("pr-pair pr-identity");
    r1.appendChild(nameRow); r1.appendChild(codeRow); r1.appendChild(catRow); r1.appendChild(showRow);
    c1.body.appendChild(r1);

    /* Photos */
    var c2 = card("Photos", "Up to 5 photos · JPG, PNG or WebP · up to 2 MB each after cropping. Slot 1 is the main photo shoppers see first. Every photo is cropped to a square (1:1) when you pick it.", ICON.photo, "pr-s-photos");
    var slotsBox = h("div", "pr-imgrow");
    var imgErr = D.el("p", { "class": "pr-ferr", id: "pr-e-image", role: "alert" });
    imgErr.hidden = true;
    c2.body.appendChild(slotsBox);
    if (adding) c2.body.appendChild(h("p", "pr-hint pr-photo-note", "Photos you pick are uploaded when you save the Details."));
    c2.body.appendChild(imgErr);

    /* Pricing */
    var c3 = card("Pricing", "You set the selling price (SRP) and the members discount. Members see their price below.", ICON.price, "pr-s-pricing");
    var srpIn = input("text", p ? centavosToField(p.srp_centavos) : "", { inputmode: "decimal", placeholder: "0.00" });
    var srpRow = row("srp_centavos", "Selling price (SRP, ₱)", srpIn, "", group("₱", srpIn));
    var rateIn = input("text", p ? rateToPercent(p.earnings_rate) : "", { inputmode: "decimal", placeholder: "40" });
    var rateRow = row("earnings_rate", "Members discount (%)", rateIn, "Between 10 and 50.", group("%", rateIn));
    var r3 = pairOf("pr-pair"); r3.appendChild(srpRow); r3.appendChild(rateRow);
    var calc = D.el("div", { "class": "pr-pcalc", "aria-live": "polite" });
    calc.appendChild(h("div", "pr-pcalc-t", "Members price per sale"));
    function calcLine(id, label, cls) {
      var ln = h("div", "pr-pline" + (cls ? " " + cls : ""));
      ln.appendChild(h("span", "pr-pline-k", label));
      var val = D.el("b", { id: id }, "—");
      ln.appendChild(val); calc.appendChild(ln);
      return { label: ln.firstChild, val: val };
    }
    var lSrp = calcLine("pr-c-srp", "Selling price (SRP)");
    var lDisc = calcLine("pr-c-disc", "Members discount");
    var lMem = calcLine("pr-c-mem", "Members price", "total");
    var preview = lMem.val; /* the members price line is the live preview */
    function refresh() {
      var c = pesosToCentavos(fields.srp_centavos.value), rate = percentToRate(fields.earnings_rate.value);
      var m = c != null && rate ? membersPrice(c, rate) : null;
      lSrp.val.textContent = c != null ? formatPeso(c) : "—";
      lDisc.label.textContent = "Members discount" + (rate ? " · " + rateToPercent(rate) + "%" : "");
      lDisc.val.textContent = m != null ? "−" + formatPeso(c - m) : "—";
      lMem.val.textContent = m != null ? formatPeso(m) : "—";
    }
    fields.srp_centavos.addEventListener("input", refresh);
    fields.earnings_rate.addEventListener("input", refresh);
    refresh();
    c3.body.appendChild(r3); c3.body.appendChild(calc);

    /* Shipping + Packaging & fee */
    var c5 = card("Shipping", "Measure the product boxed, exactly as it leaves your hands. These numbers set the courier fee. Optional for launch; length, width and height go together.", ICON.ship, "pr-s-shipping");
    var shipRows = {};
    SHIPPING.forEach(function (s) {
      var val = v[s[0]];
      shipRows[s[0]] = row(s[0], s[1], input("text", val == null ? (s[0] === "weight_kg" && !p ? "0.00" : "") : String(val), { inputmode: "decimal" }));
    });
    /* Length, Width, Height, Actual weight and Units per shipping box in one row on a wide screen; the row wraps on a phone. */
    var r5 = pairOf("pr-five"); ["length_cm", "width_cm", "height_cm", "weight_kg", "shipping_qty"].forEach(function (k) { r5.appendChild(shipRows[k]); });
    var pv = D.el("div", { "class": "pr-pv", id: "pr-pkg-preview", "aria-live": "polite" });
    pv.appendChild(h("div", "pr-pv-cap", "Packaging & fee"));
    var pvBody = h("div", "pr-pv-body");
    pv.appendChild(pvBody);
    c5.body.appendChild(r5); c5.body.appendChild(pv);

    function drawPreview(m) {
      clear(pvBody);
      if (m.why) {
        pvBody.appendChild(h("span", "pr-pv-chip", "Awaiting measurements"));
        pvBody.appendChild(h("p", "pr-pv-line", m.why === "sizes" ? "Enter all three measurements" : "Enter the weight (kg)"));
        return;
      }
      if (m.wait) { pvBody.appendChild(h("p", "pr-pv-note", "Working out the fee…")); return; }
      if (m.error) { pvBody.appendChild(h("p", "pr-pv-note", m.error === true ? "The fee estimate is not available right now." : m.error)); return; }
      var fm = feeModel(m.data);
      if (fm.tiles.length) {
        var fees = h("div", "pr-pv-fees");
        fm.tiles.forEach(function (t) { var tl = h("div", "pr-fee"); tl.appendChild(h("b", "", t[0])); tl.appendChild(h("span", "", t[1])); fees.appendChild(tl); });
        pvBody.appendChild(fees);
      }
      if (fm.reason) pvBody.appendChild(h("p", "pr-pv-line pr-pv-reason", fm.reason));
      pvBody.appendChild(h("div", "pr-pv-foot", fm.note));
    }
    /* Asked a moment after the last keystroke; an answer that is no longer the latest is dropped. */
    function schedulePreview(now) {
      clearTimeout(previewTimer);
      var seq = ++previewSeq, vals = {};
      ["length_cm", "width_cm", "height_cm", "weight_kg", "shipping_qty"].forEach(function (k) { vals[k] = fields[k].value; });
      var st = previewBody(vals);
      if (!st.body) { drawPreview({ why: st.why }); return; }
      drawPreview({ wait: true });
      previewTimer = setTimeout(function () {
        D.call("POST", "/sites/" + S.site + "/catalog/shipping-preview/", st.body, true).then(function (res) {
          if (mine !== token || seq !== previewSeq || res.status === 401) return;
          var fe = res.ok ? null : describeError(res);
          var first = fe && fe.kind === "fields" ? Object.keys(fe.fields)[0] : "";
          drawPreview(res.ok && res.data ? { data: res.data } : { error: first ? String(fe.fields[first]) : true });
        });
      }, now ? 0 : 300);
    }
    ["length_cm", "width_cm", "height_cm", "weight_kg", "shipping_qty"].forEach(function (k) {
      fields[k].addEventListener("input", function () { schedulePreview(false); });
    });

    var saveDetails = D.el("button", { type: "submit", "class": "no-btn no-btn-primary" }, "Save Details");
    var bar = h("div", "pr-abar");
    bar.appendChild(h("span", "pr-abar-note", "Changes are saved and applied immediately."));
    bar.appendChild(h("span", "pr-abar-sp"));
    bar.appendChild(saveDetails);
    [c1, c2, c3, c5].forEach(function (c) { df.appendChild(c.sec); });
    df.appendChild(bar);
    panels.details = h("section", "pr-tabpanel");
    panels.details.setAttribute("role", "tabpanel"); panels.details.setAttribute("id", "pr-panel-details"); panels.details.setAttribute("aria-labelledby", "pr-tab-details");
    panels.details.appendChild(df);
    f.appendChild(panels.details);

    /* ----- Description tab ----- */
    panels.description = h("section", "pr-tabpanel");
    panels.description.setAttribute("role", "tabpanel"); panels.description.setAttribute("id", "pr-panel-description"); panels.description.setAttribute("aria-labelledby", "pr-tab-description");
    var saveDesc = D.el("button", { type: "submit", "class": "no-btn no-btn-primary" }, "Save Description");
    var descForm = null;
    if (!adding) {
      descForm = D.el("form", { "class": "pr-tabform", novalidate: "" });
      var c6 = card("Description", "What shoppers read on the product page. Leave a box empty to show nothing for it.", ICON.text, "pr-s-description");
      var textRows = {};
      TEXTS.forEach(function (t) {
        var ta = D.el("textarea", { "class": "pr-input pr-area" + (t[0] === "long_description" ? " pr-area-long" : ""), rows: String(t[3]), maxlength: String(t[2]) });
        ta.value = v[t[0]] || "";
        textRows[t[0]] = row(t[0], t[1], ta);
      });
      c6.body.appendChild(textRows.short_description); c6.body.appendChild(textRows.long_description);
      var d1 = pairOf("pr-pair"); d1.appendChild(textRows.features); d1.appendChild(textRows.specifications);
      var d2 = pairOf("pr-pair"); d2.appendChild(textRows.advantages); d2.appendChild(textRows.benefits);
      c6.body.appendChild(d1); c6.body.appendChild(d2);
      var bar2 = h("div", "pr-abar");
      bar2.appendChild(h("span", "pr-abar-note", "Changes are saved and applied immediately."));
      bar2.appendChild(h("span", "pr-abar-sp"));
      bar2.appendChild(saveDesc);
      descForm.appendChild(c6.sec); descForm.appendChild(bar2);
      panels.description.appendChild(descForm);
    }
    if (!adding) f.appendChild(panels.description);
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
    function busy(on, which) {
      saveDetails.disabled = on; saveDesc.disabled = on;
      saveDetails.textContent = on && which === "details" ? "Saving…" : "Save Details";
      saveDesc.textContent = on && which === "description" ? "Saving…" : "Save Description";
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
        if (fresh) openForm(fresh, null, tab); else loadList();
      });
    }
    function applyFailure(res) {
      var e = describeError(res);
      if (e.kind === "image") { imgErr.textContent = e.message; imgErr.hidden = false; say(e.message); return; }
      var shown = false;
      Object.keys(e.fields).forEach(function (k) {
        if (errs[k]) { fieldError(k, e.fields[k]); shown = true; }
        else if (k === "file" || k === "revision" || k === "slot") { imgErr.textContent = e.fields[k]; imgErr.hidden = false; shown = true; }
      });
      if (e.kind === "fields" && shown) { topMessage(MSG.invalid); var first = f.querySelector("[aria-invalid='true']"); if (first && first.focus) first.focus(); return; }
      topMessage(e.message, e.kind === "stale");
    }

    /* ----- photos: five slots. Edit uploads at once; Add keeps the cropped photos and uploads them after the product is created ----- */
    function dropPhotos() {
      pending.forEach(function (x) { if (x && x.url && window.URL && URL.revokeObjectURL) URL.revokeObjectURL(x.url); });
      pending = [null, null, null, null, null];
    }
    function dropPhoto(i) {
      var x = pending[i];
      if (x && x.url && window.URL && URL.revokeObjectURL) URL.revokeObjectURL(x.url);
      pending[i] = null;
    }
    function focusSlot(i) { var t = slotTiles[i]; if (t && t.focus) t.focus(); }
    function drawSlots() {
      clear(slotsBox); slotTiles = [];
      var urls = adding ? [] : imageUrls(S.editing);
      for (var i = 0; i < SLOTS; i++) (function (i) {
        var has = adding ? !!pending[i] : !!urls[i];
        var slot = h("div", "pr-islot" + (has ? " filled" : ""));
        slot.setAttribute("data-slot", String(i + 1));
        if (i === 0) slot.appendChild(h("span", "pr-main", "MAIN"));
        var file = D.el("input", { type: "file", id: "pr-f-image-" + (i + 1), accept: IMAGE_TYPES.join(","), "class": "pr-file", tabindex: "-1", "aria-hidden": "true" });
        var tile = D.el("button", { type: "button", "class": "pr-islot-btn", "aria-label": (has ? "Change photo " : "Add photo ") + (i + 1) });
        if (adding && pending[i] && pending[i].url) tile.appendChild(D.el("img", { "class": "pr-islot-img", src: pending[i].url, alt: "Photo " + (i + 1) + " to add" }));
        else if (adding && pending[i]) tile.appendChild(h("span", "pr-islot-text", "Photo ready"));
        else if (urls[i]) tile.appendChild(D.el("img", { "class": "pr-islot-img", src: urls[i], alt: "Photo " + (i + 1) + (S.editing ? " of " + S.editing.name : "") }));
        else { tile.appendChild(h("span", "pr-islot-plus", "+")); tile.appendChild(h("span", "pr-islot-text", "Add photo")); }
        tile.addEventListener("click", function () { if (!imgBusyOn) file.click(); });
        slot.appendChild(tile); slot.appendChild(file);
        if (has) {
          var x = D.el("button", { type: "button", "class": "pr-islot-x", "aria-label": "Remove photo " + (i + 1) }, "×");
          x.addEventListener("click", function () {
            if (imgBusyOn) return;
            if (adding) { dropPhoto(i); drawSlots(); focusSlot(i); say("Photo " + (i + 1) + " removed."); }
            else removeImage(i);
          });
          slot.appendChild(x);
        }
        file.addEventListener("change", function () {
          var one = file.files && file.files[0];
          if (!one) return;
          imgErr.hidden = true; imgErr.textContent = "";
          function refuse(text) { imgErr.textContent = text; imgErr.hidden = false; file.value = ""; say(text); }
          if (IMAGE_TYPES.indexOf(one.type) < 0) { refuse("Upload a JPEG, PNG or WebP image."); return; }
          if (one.size > IMAGE_ORIGINAL_MAX) { refuse("The photo is too large. The limit is 10 MB."); return; }
          cropPhoto(i, one, refuse, function () { file.value = ""; });
        });
        slotTiles.push(tile);
        slotsBox.appendChild(slot);
      })(i);
    }
    /* A cropped photo is ready for slot i: Add keeps it; Edit uploads it now. */
    function keepPhoto(i, blob, name) {
      if (adding) {
        dropPhoto(i);
        pending[i] = { blob: blob, name: name, url: window.URL && URL.createObjectURL ? URL.createObjectURL(blob) : "" };
        drawSlots(); focusSlot(i);
        say("Photo " + (i + 1) + " ready.");
        return;
      }
      var form = new FormData();
      form.append("file", blob, name);
      form.append("revision", String(S.editing.revision));
      imageCall(i, "POST", productPath(S.editing) + "image/?slot=" + (i + 1), form);
    }
    function removeImage(i) { imageCall(i, "DELETE", productPath(S.editing) + "image/?slot=" + (i + 1) + "&revision=" + encodeURIComponent(S.editing.revision), null); }
    function imageCall(i, method, path, form) {
      clearErrors();
      imgBusyOn = true;
      slotsBox.setAttribute("aria-busy", "true");
      var req = form ? D.send(method, path, form) : D.call(method, path, null, true);
      req.then(function (res) {
        if (mine !== token || res.status === 401) return;
        imgBusyOn = false;
        slotsBox.removeAttribute("aria-busy");
        if (res.ok && res.data && res.data.id) {
          S.editing = res.data; replaceProduct(res.data);
          drawSlots(); focusSlot(i);
          say(method === "POST" ? "Photo " + (i + 1) + " saved." : "Photo " + (i + 1) + " removed.");
          D.toast("Saved", method === "POST" ? "Photo " + (i + 1) + " is updated." : "Photo " + (i + 1) + " is removed.");
          return;
        }
        applyFailure(res); drawSlots();
      });
    }
    /* The square crop (Cropper.js, aspect ratio 1, view mode 2, as on Payments settings). The 2 MB limit is checked on the cropped
       output: PNG first, then a JPEG when the PNG is over. A browser without the cropper keeps the original if it is within 2 MB. */
    function cropPhoto(i, file, refuse, reset) {
      if (!(window.Cropper && window.URL && URL.createObjectURL)) {
        if (file.size > IMAGE_MAX) { refuse("The photo is too large to store without cropping. The limit is 2 MB."); return; }
        keepPhoto(i, file, file.name || "product"); reset(); return;
      }
      var url = URL.createObjectURL(file), cropper = null;
      var ov = D.el("div", { "class": "pr-crop", role: "dialog", "aria-modal": "true", "aria-label": "Crop photo " + (i + 1) });
      var boxEl = h("div", "pr-crop-box");
      var img = D.el("img", { "class": "pr-crop-img", alt: "The photo to crop" });
      var stage = h("div", "pr-crop-stage"); stage.appendChild(img);
      var use = button("Use this crop", "no-btn-primary pr-crop-use", function () { apply(); });
      var cancel = button("Cancel", "no-btn-ghost pr-crop-cancel", function () { close(); });
      var acts = h("div", "pr-actions pr-crop-actions"); acts.appendChild(cancel); acts.appendChild(use);
      boxEl.appendChild(h("p", "pr-crop-lead", "Drag the square over the part of the photo you want to keep."));
      boxEl.appendChild(stage); boxEl.appendChild(acts);
      ov.appendChild(boxEl);
      function close() {
        if (cropper) { cropper.destroy(); cropper = null; }
        URL.revokeObjectURL(url); ov.remove(); reset();
        focusSlot(i);
      }
      function apply() {
        if (!cropper) return;
        use.disabled = true;
        var canvas = cropper.getCroppedCanvas({ maxWidth: 1000, maxHeight: 1000, fillColor: "#fff" });
        function done(blob, name) { close(); if (blob) keepPhoto(i, blob, name); else refuse("That photo could not be cropped. Choose a different one."); }
        canvas.toBlob(function (png) {
          if (png && png.size <= IMAGE_MAX) { done(png, "product.png"); return; }
          canvas.toBlob(function (jpg) {
            if (jpg && jpg.size <= IMAGE_MAX) { done(jpg, "product.jpg"); return; }
            close(); refuse("The cropped photo is still over 2 MB. Choose a smaller photo.");
          }, "image/jpeg", 0.85);
        }, "image/png");
      }
      ov.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.stopPropagation(); close(); } });
      img.addEventListener("load", function () { cropper = new window.Cropper(img, { aspectRatio: 1, viewMode: 2, autoCropArea: 0.9, background: false, responsive: true }); });
      img.addEventListener("error", function () { close(); refuse("That image could not be read. Choose a different JPEG, PNG or WebP image."); });
      img.setAttribute("src", url);
      r.appendChild(ov);
      use.focus();
    }
    drawSlots();
    schedulePreview(true);

    /* ----- Details submit ----- */
    function gatherDetails() {
      var out = {}, bad = {}, cur = S.editing;
      var name = read("name");
      if (!name) bad.name = "Enter a name."; else out.name = name;
      var c = pesosToCentavos(read("srp_centavos"));
      if (c == null) bad.srp_centavos = "Enter an SRP above ₱0, with up to two decimals."; else out.srp_centavos = c;
      var rate = percentToRate(read("earnings_rate"));
      if (!rate) bad.earnings_rate = "Enter a discount from 10 to 50."; else out.earnings_rate = rate;
      out.category = fields.category.value;
      out.is_active = fields.is_active.checked;
      SHIPPING.forEach(function (s) {
        var k = s[0], t = read(k);
        if (t === "") {
          if (cur && cur[k] != null) bad[k] = "Enter a value. A saved value can't be left blank.";
          else if (k === "weight_kg" && !cur) out[k] = "0.00";
          return;
        }
        if (k === "shipping_qty") {
          if (!/^[1-9]\d{0,8}$/.test(t)) { bad[k] = "Enter a whole number of 1 or more."; return; }
          out[k] = parseInt(t, 10);
        } else out[k] = t;
      });
      return { out: out, bad: bad };
    }
    df.addEventListener("submit", function (e) {
      e.preventDefault();
      clearErrors();
      var g = gatherDetails();
      if (adding) {
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
      busy(true, "details");
      if (adding) createProduct(g.out); else updateProduct(g.out, "details");
    });
    if (descForm) descForm.addEventListener("submit", function (e) {
      e.preventDefault();
      clearErrors();
      var out = {};
      TEXTS.forEach(function (t) { out[t[0]] = fields[t[0]].value.trim(); });
      busy(true, "description");
      updateProduct(out, "description");
    });

    /* Create, then the photos (each with the new revision), then hide when Show in shops is off. The create call takes neither, so
       each is its own call. A step that fails does not undo the product: it is kept and its edit form opens with what happened, so
       nothing is created twice. Add then becomes Edit. */
    function createProduct(out) {
      var wantActive = out.is_active;
      delete out.is_active;
      D.call("POST", productPath(), out, true).then(function (res) {
        if (mine !== token || res.status === 401) return;
        if (!(res.ok && res.data && res.data.id)) { busy(false); applyFailure(res); return; }
        var cur = res.data, problems = [], hideFailed = false;
        function stepPhoto(i) {
          if (i >= SLOTS) return Promise.resolve();
          if (!pending[i]) return stepPhoto(i + 1);
          var form = new FormData();
          form.append("file", pending[i].blob, pending[i].name);
          form.append("revision", String(cur.revision));
          return D.send("POST", productPath(cur) + "image/?slot=" + (i + 1), form).then(function (r1) {
            if (r1.status !== 401) {
              if (r1.ok && r1.data && r1.data.id) cur = r1.data;
              else problems.push("Photo " + (i + 1) + " couldn’t be saved. " + describeError(r1).message + " Add it again here.");
            }
            return stepPhoto(i + 1);
          });
        }
        function stepHide() {
          if (wantActive) return Promise.resolve();
          return D.call("PATCH", productPath(cur), { revision: cur.revision, is_active: false }, true).then(function (r2) {
            if (r2.status === 401) return;
            if (r2.ok && r2.data && r2.data.id) cur = r2.data;
            else { hideFailed = true; problems.push("It couldn’t be hidden. " + describeError(r2).message + " Turn off Show in shops and save."); }
          });
        }
        stepPhoto(0).then(stepHide).then(function () {
          if (mine !== token) return;
          busy(false);
          dropPhotos();
          replaceProduct(cur);
          if (!problems.length) openForm(cur, { ok: wantActive ? "The product is added." : "The product is added and hidden." });
          else openForm(cur, { text: "The product was added, but not everything was saved. " + problems.join(" "), showOff: hideFailed });
        });
      });
    }
    /* Edit: only the fields that changed go, with the latest revision. The editor stays open. */
    function updateProduct(out, which) {
      var cur = S.editing, body = { revision: cur.revision }, n = 0;
      Object.keys(out).forEach(function (k) {
        var was = cur[k];
        if (k === "shipping_qty") { if (was === out[k]) return; }
        else if (k === "is_active" || k === "srp_centavos") { if (was === out[k]) return; }
        else if (String(was == null ? "" : was) === String(out[k])) return;
        body[k] = out[k]; n++;
      });
      if (!n) { busy(false); topMessage("There are no changes to save."); return; }
      D.call("PATCH", productPath(cur), body, true).then(function (res) {
        if (mine !== token || res.status === 401) return;
        busy(false);
        if (res.ok && res.data && res.data.id) {
          S.editing = res.data; replaceProduct(res.data);
          D.toast("Saved", which === "description" ? "The description is saved." : "Your changes are saved.");
          say("Saved.");
          return;
        }
        applyFailure(res);
      });
    }

    selectTab(tab, false);
    if (notice) {
      if (notice.text) topMessage(notice.text);
      if (notice.ok) { D.toast("Saved", notice.ok); say(notice.ok); }
      if (notice.showOff) show.checked = false;
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
      gaps: gaps, counts: counts, filterProducts: filterProducts, csvCell: csvCell, csvText: csvText, moveId: moveId,
      imageUrls: imageUrls, previewBody: previewBody, feeModel: feeModel },
    show: function () {
      document.addEventListener("click", outside);
      window.addEventListener("scroll", closeMenuOnMove, true);
      window.addEventListener("resize", closeMenuOnMove);
      start();
    },
    hide: function () {
      token++; say(""); stopDrag();
      if (S && S.searchTimer) clearTimeout(S.searchTimer);
      document.removeEventListener("click", outside);
      window.removeEventListener("scroll", closeMenuOnMove, true);
      window.removeEventListener("resize", closeMenuOnMove);
    }
  };
})();
