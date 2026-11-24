/* Contacts (ClickUp z8uq9mj9rw, /contacts/, contacts.js): the store's own saved contacts and groups, kept for SMS and Bulk SMS.
   Adapted from the HQ Contacts pages (apps/hq/public/assets/js/contacts.js) for one site: list, one contact, groups and the two-step
   CSV upload, in the dash look. Owner routes under /sites/{id}/contacts/ (status/, list, {id}/, groups/, upload/check/, upload/save/).
   Every route answers 404 while the switch is off; then the Contacts links stay hidden (probe) and the page says nothing about the
   feature. The list shows masked mobiles; the full mobile is fetched only when the owner opens one contact (that read is audited).
   Nothing is stored in the browser; an uploaded file is read into memory, sent as text and dropped. Every API string reaches the
   page through textContent or D.el only. Plain ES5. NOContacts.util holds the pure helpers (tests/contacts.test.mjs). */
(function () {
  var D = window.NODash;
  var run = 0, S = null, closeDialog = null, searchTimer = null, req = 0;
  var MIN_Q = 2, MAX_FILE = 1048576, SHOW_REFUSED = 50;
  var DOWN = "We could not reach your contacts. Please try again.";

  function byId(id) { return document.getElementById(id); }
  function h(tag, cls, text) { return D.el(tag, cls ? { "class": cls } : {}, text); }
  function add(parent) { for (var i = 1; i < arguments.length; i++) { if (arguments[i]) parent.appendChild(arguments[i]); } return parent; }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  function say(text) { var l = byId("ct-live"); if (l) l.textContent = text; }
  function base() { return "/sites/" + S.site + "/contacts/"; }
  function btn(label, kind, fn) {
    var b = h("button", "no-btn " + (kind === "primary" ? "no-btn-primary" : "no-btn-ghost") + (kind === "danger" ? " ct-danger" : ""), label);
    b.setAttribute("type", "button");
    if (fn) b.addEventListener("click", function () { fn(b); });
    return b;
  }
  function busy(b, on) { if (!b) return; if (on) { b.setAttribute("aria-busy", "true"); b.disabled = true; } else { b.removeAttribute("aria-busy"); b.disabled = false; } }

  /* ---------- pure helpers ---------- */

  function nameOf(c) {
    var n = [c && c.first_name, c && c.last_name].map(function (x) { return typeof x === "string" ? x.trim() : ""; }).filter(Boolean).join(" ");
    return n || "No name";
  }
  /* "short" is one character: no request (the API wants 2). */
  function queryMode(raw) {
    var q = String(raw == null ? "" : raw).trim();
    if (!q) return { mode: "all", q: "" };
    return q.length < MIN_Q ? { mode: "short", q: q } : { mode: "search", q: q };
  }
  function listPath(site, o) {
    o = o || {};
    var p = [];
    if (o.group) p.push("group=" + encodeURIComponent(o.group));
    if (o.q) p.push("q=" + encodeURIComponent(o.q));
    if (o.cursor) p.push("cursor=" + encodeURIComponent(o.cursor));
    return "/sites/" + site + "/contacts/" + (p.length ? "?" + p.join("&") : "");
  }
  function groupsOf(c) { return c && Array.isArray(c.groups) ? c.groups.filter(function (g) { return g && typeof g === "object" && g.id != null; }) : []; }
  function groupIds(c) { return groupsOf(c).map(function (g) { return g.id; }); }
  function fieldMessage(res, name) {
    var f = res && res.data && res.data.fields;
    return f && typeof f[name] === "string" ? f[name] : "";
  }
  function msgOf(res, fallback) { var m = res && res.data && res.data.message; return typeof m === "string" && m ? m : fallback; }
  function codeOf(res) { return res && res.data && res.data.code; }
  /* The save body for a contact: names trimmed, the mobile as typed (the API judges it), groups as ids. */
  function contactBody(v) {
    var b = { first_name: String(v.first || "").trim(), last_name: String(v.last || "").trim(), mobile: String(v.mobile || "").trim(), groups: (v.groups || []).slice() };
    return b;
  }
  /* The API wants a first name on create, and on edit when the contact already has one (v.requireFirst). A contact with no name can be
     saved with none (number-only contacts come in through the CSV upload only). */
  /* The edit body: only what changed. A blank first name that was blank before is never sent (the API refuses a blank one). */
  function changedBody(c, v) {
    var full = contactBody(v), was = { first_name: String(c.first_name || "").trim(), last_name: String(c.last_name || "").trim(), mobile: String(c.mobile || "").trim() }, out = {};
    ["first_name", "last_name", "mobile"].forEach(function (k) { if (full[k] !== was[k]) out[k] = full[k]; });
    var a = groupIds(c).map(String).sort().join("\u0001"), b = full.groups.map(String).sort().join("\u0001");
    if (a !== b) out.groups = full.groups;
    return out;
  }
  function firstError(v) { return v.requireFirst && !String(v.first || "").trim() ? "Enter a first name" : ""; }
  function mobileError(v) { return String(v.mobile || "").trim() ? "" : "Enter a mobile number."; }
  function contactError(v) { return firstError(v) || mobileError(v); }
  function groupNameError(v) { var n = String(v || "").trim(); return n ? (n.length > 60 ? "Use 60 characters or fewer." : "") : "Enter a group name."; }
  function fileError(f) {
    if (!f) return "Choose a file.";
    if (f.size > MAX_FILE) return "The file is over 1 MB.";
    return "";
  }
  function uploadBody(text, group, expectedNew) {
    var b = { text: text };
    if (group) b.group = group;
    if (expectedNew !== undefined) b.expected_new = expectedNew;
    return b;
  }
  function num(v) { return typeof v === "number" && isFinite(v) ? v : 0; }
  function checkSummary(d) {
    d = d || {};
    return { news: num(d["new"]), already: num(d.already), refused: Array.isArray(d.refused) ? d.refused.filter(function (r) { return r && typeof r === "object"; }) : [] };
  }
  function countText(n) { return n + (n === 1 ? " contact" : " contacts"); }
  function whole(n) { try { return Number(n).toLocaleString("en-PH"); } catch (e) { return String(n); } }
  function statusOn(res) { return !!(res && res.ok && res.data && res.data.contacts === true); }

  /* ---------- the house dropdown (products.js combo, scoped to this view) ---------- */

  function combo(select, label, onPick) {
    var wrap = h("div", "ct-combo"), box = h("div", "ct-combo-box"), panel = h("div", "ct-combo-panel"), rows = [], active = -1;
    var input = D.el("input", { "class": "ct-combo-input", type: "text", role: "combobox", autocomplete: "off", spellcheck: "false", "aria-label": label, "aria-autocomplete": "list", "aria-expanded": "false", "aria-controls": select.id + "-list" });
    panel.setAttribute("id", select.id + "-list"); panel.setAttribute("role", "listbox");
    select.parentNode.insertBefore(wrap, select);
    select.classList.add("ct-combo-native"); select.setAttribute("tabindex", "-1"); select.setAttribute("aria-hidden", "true");
    add(wrap, select); add(box, input, h("span", "ct-combo-caret")); add(wrap, box, panel);
    function opts() { return Array.prototype.slice.call(select.children); }
    function chosen() {
      /* the empty option is only a placeholder: the box stays empty and shows that text greyed (Coach Ed, 2026-11-24 round 9) */
      var all = opts(), t = "";
      for (var i = 0; i < all.length; i++) if (all[i].value === select.value) { t = all[i].value === "" ? "" : all[i].textContent; break; }
      return t;
    }
    function isOpen() { return wrap.classList.contains("is-open"); }
    function mark(i) {
      active = i;
      rows.forEach(function (r, n) { r.classList.toggle("is-active", n === i); });
      if (i >= 0) input.setAttribute("aria-activedescendant", rows[i].id); else input.removeAttribute("aria-activedescendant");
    }
    function draw(q) {
      clear(panel); rows = [];
      opts().forEach(function (op) {
        if (q && op.textContent.toLowerCase().indexOf(q) < 0) return;
        var on = op.value === select.value;
        var row = h("div", "ct-combo-opt" + (on ? " is-selected" : ""), op.textContent);
        row.setAttribute("id", select.id + "-opt-" + rows.length); row.setAttribute("role", "option"); row.setAttribute("aria-selected", String(on));
        row.addEventListener("click", function () { select.value = op.value; input.value = chosen(); shut(); input.focus(); if (onPick) onPick(op.value); });
        rows.push(row); panel.appendChild(row);
      });
      if (!rows.length) panel.appendChild(h("div", "ct-combo-opt is-disabled", "No matches"));
      mark(-1);
    }
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
    input.addEventListener("input", function () { show(); draw(input.value.trim().toLowerCase()); });
    input.addEventListener("keydown", function (e) {
      if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && input.value !== "" && input.value === chosen()) input.value = "";
      if (e.key === "Tab") { shut(); return; }
      if (e.key === "Escape" && isOpen()) { e.preventDefault(); e.stopPropagation(); shut(); return; }
      if (e.key === "Enter") { e.preventDefault(); if (active >= 0) rows[active].fire ? rows[active].fire("click") : rows[active].click(); else show(); return; }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      if (!isOpen()) { show(); return; }
      var d = e.key === "ArrowDown" ? 1 : -1, n = rows.length;
      if (n) mark(active < 0 ? (d > 0 ? 0 : n - 1) : (active + d + n) % n);
    });
    if (select.firstChild && select.firstChild.value === "") input.setAttribute("placeholder", select.firstChild.textContent);
    input.value = chosen();
    return { sync: function () { input.value = chosen(); } };
  }
  /* A labelled house dropdown. options: [[value, text], ...]. */
  function dropdown(id, label, options, value, onChange) {
    var wrap = h("div", "ct-field ct-tool");
    var lab = D.el("label", { "for": id, "class": "ct-sr" }, label);
    var sel = D.el("select", { id: id, "class": "ct-input" });
    options.forEach(function (o) { var op = D.el("option", { value: o[0] }, o[1]); if (o[0] === value) op.selected = true; sel.appendChild(op); });
    sel.value = value;
    add(wrap, lab, sel);
    var c = combo(sel, label, onChange);
    return { wrap: wrap, sel: sel, sync: c.sync };
  }
  function groupOptions(first, list) {
    var o = [["", first]];
    (list || S.groups || []).forEach(function (g) { o.push([String(g.id), String(g.name)]); });
    return o;
  }

  /* ---------- dialogs ---------- */

  function dialog(id, opener, fill) {
    if (closeDialog) closeDialog(false);
    var slot = byId("ct-dialog-slot"), overlay = h("div", "ct-overlay"), dlg = h("div", "ct-dialog");
    dlg.setAttribute("role", "dialog"); dlg.setAttribute("aria-modal", "true"); dlg.setAttribute("aria-labelledby", "ct-h-" + id);
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); close(true); return; }
      if (e.key !== "Tab") return;
      var items = Array.prototype.filter.call(dlg.querySelectorAll("input, button, textarea"), function (n) { return !n.disabled && n.getAttribute("tabindex") !== "-1"; });
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1], now = document.activeElement;
      if (e.shiftKey && (now === first || items.indexOf(now) === -1)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (now === last || items.indexOf(now) === -1)) { e.preventDefault(); first.focus(); }
    }
    function close(returnFocus) {
      if (closeDialog !== close) return;
      closeDialog = null; document.removeEventListener("keydown", onKey); clear(slot);
      if (returnFocus && opener && opener.focus) opener.focus();
    }
    closeDialog = close;
    fill(dlg, close);
    add(slot, add(overlay, dlg));
    document.addEventListener("keydown", onKey);
    return close;
  }
  function title(text, id) { var t = h("h2", "ct-h2", text); t.setAttribute("id", "ct-h-" + id); return t; }
  function errBox() { var e = h("p", "ct-error"); e.setAttribute("role", "alert"); e.hidden = true; return e; }
  function showErr(box, text) { box.textContent = text; box.hidden = !text; }
  function field(labelText, input, hint, required) {
    var f = h("div", "ct-field"), lab = h("label", "ct-label", labelText);
    if (required) { var star = h("span", "ct-req", " *"); star.setAttribute("aria-hidden", "true"); lab.appendChild(star); input.setAttribute("aria-required", "true"); }
    lab.setAttribute("for", input.getAttribute("id"));
    add(f, lab, input);
    var err = errBox(); err.setAttribute("id", input.getAttribute("id") + "-err"); input.setAttribute("aria-describedby", err.getAttribute("id"));
    if (hint) add(f, h("p", "ct-meta", hint));
    add(f, err);
    f.err = err;
    return f;
  }
  function textInput(id, value, extra) {
    var a = { id: id, "class": "ct-input", type: "text", autocomplete: "off" };
    for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) a[k] = extra[k];
    var i = D.el("input", a); i.value = value || "";
    return i;
  }
  function bad(f, text, input) { showErr(f.err, text); if (text) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid"); }

  /* Confirm a delete. */
  function confirmDialog(opener, id, titleText, body, label, run_) {
    dialog(id, opener, function (dlg, close) {
      var err = errBox(), go = btn(label, "danger", null), cancel = btn("Cancel", "ghost", function () { close(true); });
      go.addEventListener("click", function () {
        showErr(err, ""); busy(go, true);
        run_(function (msg) { busy(go, false); showErr(err, msg); }, close);
      });
      add(dlg, title(titleText, id), h("p", "ct-lead", body), err, add(h("div", "ct-actions"), go, cancel));
      cancel.focus();
    });
  }

  /* ---------- the page ---------- */

  function show() {
    var mine = ++run, root = clear(byId("ct-root"));
    S = { site: null, tab: "list", status: null, groups: [], q: "", group: "", cursor: "", rows: [], next: null, total: 0, sel: null, full: null, editing: false, pane: "list", rowNodes: {} };
    root.setAttribute("aria-busy", "true");
    add(root, h("p", "ct-meta", "Loading your contacts…"));
    D.call("GET", "/sites/", null, true).then(function (res) {
      if (mine !== run || res.status === 401) return;
      var sites = res.ok ? D.sitesOf(res) : [];
      if (!res.ok) { failedPanel(); return; }
      if (!sites.length) { unavailable(); return; }
      S.site = D.siteFromQuery(sites.map(function (s) { return s.id; }));
      D.call("GET", base() + "status/", null, true).then(function (st) {
        if (mine !== run || !S || st.status === 401) return;
        if (st.status === 404 || (st.ok && st.data && st.data.contacts === false)) { unavailable(); return; }
        if (!st.ok) { failedPanel(); return; }
        S.status = st.data || {}; setNav(true);
        loadGroups(mine, function () { render(); });
      });
    });
  }
  function hide() {
    run++; S = null; say("");
    if (searchTimer) { clearTimeout(searchTimer); searchTimer = null; }
    if (closeDialog) closeDialog(false);
    var r = byId("ct-root"); if (r) clear(r);
  }
  function setNav(on) { Array.prototype.forEach.call(document.querySelectorAll("[data-contacts-nav]"), function (n) { n.hidden = !on; }); }
  /* The links stay hidden until the API answers 200 with contacts true. A 404 and every other answer leave them hidden. */
  function probe() {
    D.call("GET", "/sites/", null, true).then(function (res) {
      if (res.status === 401) return;
      var sites = res.ok ? D.sitesOf(res) : [];
      if (!sites.length) return;
      var site = D.siteFromQuery(sites.map(function (s) { return s.id; }));
      D.call("GET", "/sites/" + site + "/contacts/status/", null, true).then(function (r) { if (statusOn(r)) setNav(true); });
    });
  }
  function failedPanel() {
    var root = clear(byId("ct-root")); root.removeAttribute("aria-busy");
    var s = h("section", "ct-card"); s.setAttribute("role", "alert");
    add(s, h("h2", "ct-h2", "We couldn’t load your contacts"), h("p", "ct-lead", "Check your connection and try again. Nothing was changed."), btn("Try again", "ghost", show));
    root.appendChild(s);
  }
  function unavailable() {
    var root = clear(byId("ct-root")); root.removeAttribute("aria-busy");
    add(root, add(h("section", "ct-card"), h("h2", "ct-h2", "Contacts are not available"), h("p", "ct-lead", "They are not open for your store right now.")));
    setNav(false);
  }
  /* The Add contact popup, used by the Contacts page and by New SMS (inbox-sms.js): first name (required), last name, mobile and ONE optional group
     from the house dropdown. o: { site, groups (array; read from GET groups/ when missing), opener, done(row) }. Saves with POST /sites/{id}/contacts/
     { first_name, last_name, mobile, groups:[id] } and hands the saved row to done(). It draws into #ct-dialog-slot, which sits outside the Contacts
     view so it shows on any page. */
  function addDialog(o) {
    var site = o.site, path = "/sites/" + site + "/contacts/";
    function open(groups) {
      dialog("contact", o.opener, function (dlg, close) {
        var first = textInput("ct-first", ""), last = textInput("ct-last", ""), mobile = textInput("ct-mobile", "", { inputmode: "tel" });
        var fFirst = field("First name", first, null, true), fLast = field("Last name", last), fMobile = field("Contact number", mobile, "A Philippine mobile number. One contact per number.", true);
        var gd = dropdown("ct-agroup", "Group", groupOptions("No group", groups), "", null);
        var fGroup = h("div", "ct-field"), gl = h("span", "ct-label", "Group"); gl.setAttribute("aria-hidden", "true");
        add(fGroup, gl, gd.wrap); gd.wrap.style.margin = "0";
        var err = errBox(), save = btn("Add contact", "primary", null), cancel = btn("Cancel", "ghost", function () { close(true); });
        save.addEventListener("click", function () {
          showErr(err, ""); [[first, fFirst], [last, fLast], [mobile, fMobile]].forEach(function (p) { bad(p[1], "", p[0]); });
          var gid = gd.sel.value, g = groups.filter(function (x) { return String(x.id) === gid; })[0];
          var v = { requireFirst: true, first: first.value, last: last.value, mobile: mobile.value, groups: gid ? [g ? g.id : gid] : [] };
          var fe = firstError(v), me = mobileError(v);
          if (fe) bad(fFirst, fe, first);
          if (me) bad(fMobile, me, mobile);
          if (fe || me) { (fe ? first : mobile).focus(); return; }
          busy(save, true);
          D.call("POST", path, contactBody(v), true).then(function (res) {
            if (res.status === 401) return;
            busy(save, false);
            if (res.ok) { close(true); if (o.done) o.done(res.data || {}); return; }
            var shown = false;
            [["first_name", first, fFirst], ["last_name", last, fLast], ["mobile", mobile, fMobile]].forEach(function (p) { var t = fieldMessage(res, p[0]); if (t) { bad(p[2], t, p[1]); shown = true; } });
            var gm = fieldMessage(res, "groups"); if (gm) { showErr(err, gm); shown = true; }
            if (codeOf(res) === "already_exists") { bad(fMobile, "That number is already a contact.", mobile); mobile.focus(); return; }
            if (!shown) showErr(err, msgOf(res, DOWN));
          });
        });
        add(dlg, title("Add contact", "contact"), fFirst, fLast, fMobile, fGroup, err, add(h("div", "ct-actions"), save, cancel));
        first.focus();
      });
    }
    if (Array.isArray(o.groups)) { open(o.groups); return; }
    /* groups are optional: when they cannot be read the popup still opens, with no groups to pick */
    D.call("GET", path + "groups/", null, true).then(function (res) {
      if (res.status === 401) return;
      open(res.ok ? (Array.isArray(res.data) ? res.data : (res.data && Array.isArray(res.data.results) ? res.data.results : [])) : []);
    });
  }
  function loadGroups(mine, then) {
    D.call("GET", base() + "groups/", null, true).then(function (res) {
      if (mine !== run || !S || res.status === 401) return;
      if (res.status === 404) { unavailable(); return; }
      if (res.ok) S.groups = Array.isArray(res.data) ? res.data : (res.data && Array.isArray(res.data.results) ? res.data.results : []);
      if (then) then();
    });
  }
  function refreshStatus() {
    var mine = run;
    D.call("GET", base() + "status/", null, true).then(function (res) { if (mine === run && S && res.ok) { S.status = res.data || S.status; paintHead(); } });
  }

  var TABS = [["list", "Contacts"], ["upload", "Upload CSV"]];
  var SAMPLE = "/assets/samples/contacts-sample.csv";
  /* The page's tabs: the dash Settings menu (.set-tabs) with buttons for links, in a host at the top of the page beside the top-bar icons, the
     same markup and spacing as the Inbox and SMS Marketing tabs (inbox.js tabBar, #ib-tabs-host). The page has no visible title; its h1 is
     screen-reader only (index.html). Groups no longer have a tab: they are the left column of the Contacts tab. */
  function tabBar() {
    var bar = h("div", "set-tabs ct-tabs"), tabs = [];
    bar.setAttribute("role", "tablist"); bar.setAttribute("aria-label", "Contacts");
    TABS.forEach(function (t) {
      var b = h("button", "ct-tab" + (S.tab === t[0] ? " is-on" : ""), t[1]);
      b.setAttribute("type", "button"); b.setAttribute("role", "tab"); b.setAttribute("data-tab", t[0]); b.setAttribute("id", "ct-tab-" + t[0]);
      b.setAttribute("aria-selected", S.tab === t[0] ? "true" : "false");
      b.addEventListener("click", function () { switchTab(t[0]); });
      b.addEventListener("keydown", function (e) {
        var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0, i = tabs.indexOf(b);
        if (e.key === "Home") d = -i; else if (e.key === "End") d = tabs.length - 1 - i;
        if (!d) return;
        e.preventDefault();
        var to = tabs[(i + d + tabs.length) % tabs.length]; if (to) to.focus();
      });
      tabs.push(b); bar.appendChild(b);
    });
    return bar;
  }
  function render() {
    var root = clear(byId("ct-root")); root.removeAttribute("aria-busy");
    var host = h("div", "ct-tabs-host"); host.setAttribute("id", "ct-tabs-host");
    add(host, tabBar());
    var panel = h("div", "ct-panel"); panel.setAttribute("id", "ct-panel");
    add(root, host, panel);
    if (S.tab === "list") listPanel(panel); else uploadPanel(panel);
  }
  /* "N of 20,000 contacts saved": a small muted line at the foot of the groups column. */
  function savedText() {
    if (!S || !S.status) return "";
    var c = num(S.status.count), m = num(S.status.max);
    return m ? whole(c) + " of " + whole(m) + " contacts saved" : whole(c) + " contacts saved";
  }
  function savedNode() { var n = h("span", "ct-meta ct-saved", savedText()); n.setAttribute("id", "ct-saved"); return n; }
  function paintHead() { var n = byId("ct-saved"); if (n) n.textContent = savedText(); }
  function switchTab(t) {
    if (!S || S.tab === t) return;
    S.tab = t; S.upload = null; render();
  }

  /* ----- the contacts app: groups | A-Z list | detail ----- */

  /* The A-Z section for one contact: the first letter of the first name (else the last name), accents dropped; no name or a non-letter is "#". */
  function letterOf(c) {
    var s = String((c && c.first_name) || "").trim() || String((c && c.last_name) || "").trim();
    if (!s) return "#";
    var ch = s.charAt(0);
    try { ch = ch.normalize("NFD").charAt(0); } catch (e) { /* keep ch */ }
    ch = ch.toUpperCase();
    return ch >= "A" && ch <= "Z" ? ch : "#";
  }
  function sortKey(c) { return (String((c && c.first_name) || "").trim() + " " + String((c && c.last_name) || "").trim()).trim().toLowerCase(); }
  /* [[letter, [contacts...]], ...]: A-Z, "#" last; inside a letter by first then last name, case-insensitive. */
  function sections(rows) {
    var by = {};
    (rows || []).forEach(function (c) { var l = letterOf(c); (by[l] = by[l] || []).push(c); });
    return Object.keys(by).sort(function (a, b) { return a === "#" ? 1 : b === "#" ? -1 : a < b ? -1 : a > b ? 1 : 0; }).map(function (l) {
      by[l].sort(function (a, b) { var x = sortKey(a), y = sortKey(b); return x < y ? -1 : x > y ? 1 : 0; });
      return [l, by[l]];
    });
  }
  function initials(c) {
    var a = String((c && c.first_name) || "").trim().charAt(0), b = String((c && c.last_name) || "").trim().charAt(0);
    return (a + b).toUpperCase() || "#";
  }
  function setPane(p) { S.pane = p; var g = byId("ct-app"); if (g) g.setAttribute("data-pane", p); }
  function resetPaging() { S.cursor = ""; S.rows = []; S.next = null; }

  function listPanel(panel) {
    var app = h("div", "ct-app"); app.setAttribute("id", "ct-app"); app.setAttribute("data-pane", S.pane);
    var side = h("nav", "ct-col ct-col-groups"); side.setAttribute("aria-label", "Groups");
    add(side, h("div", "ct-side-list"), h("div", "ct-side-foot"));
    side.children[0].setAttribute("id", "ct-side"); side.children[1].setAttribute("id", "ct-side-foot");
    var mid = h("section", "ct-col ct-col-list"); mid.setAttribute("aria-label", "Contacts");
    var head = h("div", "ct-list-head");
    var back = btn("Groups", "ghost", function () { setPane("groups"); }); back.classList.add("ct-back"); back.setAttribute("aria-label", "Back to groups");
    var search = h("div", "ct-field ct-search"), lab = D.el("label", { "for": "ct-q", "class": "ct-sr" }, "Find a contact by name or number");
    var q = D.el("input", { id: "ct-q", "class": "ct-input", type: "search", autocomplete: "off", placeholder: "Search" });
    q.value = S.q;
    add(search, lab, q);
    var plus = btn("+", "primary", function (b) { openForm(null, b); }); plus.classList.add("ct-plus"); plus.setAttribute("aria-label", "Add contact");
    add(head, back, search, plus);
    var results = h("div", "ct-results"); results.setAttribute("id", "ct-results"); results.setAttribute("aria-label", "Contacts");
    add(mid, head, results);
    var det = h("section", "ct-col ct-col-detail"); det.setAttribute("id", "ct-detail"); det.setAttribute("aria-label", "Contact");
    add(app, side, mid, det);
    add(panel, app);
    q.addEventListener("input", function () {
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(function () { searchTimer = null; if (!S) return; S.q = q.value; resetPaging(); loadList(); }, 350);
    });
    q.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); if (searchTimer) clearTimeout(searchTimer); S.q = q.value; resetPaging(); loadList(); } });
    paintSide(); drawDetail();
    loadList();
  }

  /* left column: All Contacts, the groups with their counts, a way to add a group; rename and delete for the chosen group. */
  function paintSide() {
    var box = byId("ct-side"), foot = byId("ct-side-foot"); if (!box || !S) return;
    clear(box); clear(foot);
    var ul = h("ul", "ct-side-ul");
    function item(id, name, count) {
      var li = h("li", ""), b = h("button", "ct-side-btn" + (S.group === id ? " is-on" : ""));
      b.setAttribute("type", "button"); b.setAttribute("data-group", id);
      if (S.group === id) b.setAttribute("aria-current", "true");
      add(b, h("span", "ct-side-name", name), h("span", "ct-side-count", whole(count)));
      b.addEventListener("click", function () { pickGroup(id); });
      add(li, b); ul.appendChild(li);
    }
    item("", "All Contacts", S.status ? num(S.status.count) : 0);
    S.groups.forEach(function (g) { item(String(g.id), String(g.name), num(g.count)); });
    add(box, ul);
    var addG = btn("New group", "ghost", function (b) { groupDialog(b); }); addG.classList.add("ct-addgroup");
    add(foot, addG);
    var cur = currentGroup();
    if (cur) {
      var ren = btn("Rename", "ghost", function (b) { renameDialog(cur, b); }), del = btn("Delete", "ghost", function (b) { deleteGroup(cur, b); });
      ren.setAttribute("aria-label", "Rename " + cur.name); del.setAttribute("aria-label", "Delete " + cur.name);
      add(foot, add(h("div", "ct-row-actions"), ren, del));
    }
    add(foot, savedNode());
  }
  function currentGroup() { return S.group ? S.groups.filter(function (g) { return String(g.id) === S.group; })[0] || null : null; }
  function pickGroup(id) {
    if (!S) return;
    S.group = id; S.sel = null; S.editing = false; resetPaging();
    setPane("list"); paintSide(); drawDetail(); loadList();
  }

  function loadList(more) {
    var box = byId("ct-results"); if (!box || !S) return;
    var qm = queryMode(S.q), mine = run, my = ++req;
    if (!more) S.cursor = "";
    if (qm.mode === "short") { resetPaging(); drawResults({ hint: "Type at least " + MIN_Q + " characters to search." }); return; }
    box.setAttribute("aria-busy", "true");
    D.call("GET", listPath(S.site, { group: S.group, q: qm.q, cursor: S.cursor }), null, true).then(function (res) {
      if (mine !== run || !S || my !== req || res.status === 401) return;
      box.removeAttribute("aria-busy");
      if (res.status === 404) { unavailable(); return; }
      if (!res.ok) { drawResults({ error: msgOf(res, DOWN) }); return; }
      var d = res.data || {};
      S.rows = (more ? S.rows : []).concat(Array.isArray(d.results) ? d.results : []);
      S.next = d.next ? String(d.next) : null; S.total = num(d.count);
      drawResults({});
      if (S.sel && !S.rows.some(function (c) { return c.id === S.sel; }) && !S.next) { S.sel = null; S.editing = false; }
      drawDetail();
    });
  }
  function drawResults(o) {
    var box = byId("ct-results"); if (!box || !S) return;
    clear(box); S.rowNodes = {};
    if (o.hint) { add(box, h("p", "ct-note", o.hint)); return; }
    if (o.error) { var e = h("p", "ct-note ct-error", o.error); e.setAttribute("role", "alert"); add(box, e, btn("Try again", "ghost", function () { loadList(); })); return; }
    var rows = S.rows || [];
    if (!rows.length) {
      add(box, h("p", "ct-note", S.q.trim() || S.group ? "No contacts match." : "No contacts yet. Add one with +, or upload a CSV file."));
      say("No contacts");
      return;
    }
    sections(rows).forEach(function (sec) {
      var wrap = h("div", "ct-sec"), hd = h("h3", "ct-letter", sec[0]), ul = h("ul", "ct-list");
      sec[1].forEach(function (c) { ul.appendChild(rowOf(c)); });
      add(wrap, hd, ul); box.appendChild(wrap);
    });
    var foot = h("div", "ct-list-foot");
    add(foot, h("span", "ct-meta", countText(num(S.total)) + (S.q.trim() || S.group ? " match" : "")));
    if (S.next) add(foot, btn("Load more", "ghost", function () { S.cursor = S.next; loadList(true); }));
    box.appendChild(foot);
    say(countText(num(S.total)));
  }
  function rowOf(c) {
    var li = h("li", "ct-row"), b = h("button", "ct-row-btn" + (S.sel === c.id ? " is-on" : ""));
    b.setAttribute("type", "button"); b.setAttribute("data-id", String(c.id));
    if (S.sel === c.id) b.setAttribute("aria-current", "true");
    b.setAttribute("aria-label", "Open " + nameOf(c));
    add(b, h("span", "ct-name" + (nameOf(c) === "No name" ? " is-none" : ""), nameOf(c)), h("span", "ct-mobile ct-mono", typeof c.mobile_masked === "string" ? c.mobile_masked : ""));
    b.addEventListener("click", function () { selectContact(c); });
    add(li, b); S.rowNodes[c.id] = b;
    return li;
  }
  function selectContact(c) {
    if (!S) return;
    S.sel = c.id; S.editing = false; S.full = null;
    Object.keys(S.rowNodes || {}).forEach(function (id) { var on = id === String(c.id); S.rowNodes[id].classList.toggle("is-on", on); if (on) S.rowNodes[id].setAttribute("aria-current", "true"); else S.rowNodes[id].removeAttribute("aria-current"); });
    setPane("detail"); drawDetail();
  }
  function selected() { return S && S.sel ? (S.rows || []).filter(function (c) { return c.id === S.sel; })[0] || null : null; }

  /* right column: the chosen contact (masked number, groups) with Edit in place and Delete. */
  function drawDetail() {
    var box = byId("ct-detail"); if (!box || !S) return;
    clear(box);
    var c = selected();
    var back = btn("Contacts", "ghost", function () { setPane("list"); }); back.classList.add("ct-back"); back.setAttribute("aria-label", "Back to contacts");
    if (!c) { add(box, back, h("p", "ct-note ct-empty", "Select a contact to see the details.")); return; }
    if (S.editing && S.full) { editForm(box, back, S.full); return; }
    var top = h("div", "ct-d-top"), av = h("span", "ct-avatar", initials(c)); av.setAttribute("aria-hidden", "true");
    add(top, av, h("h2", "ct-d-name" + (nameOf(c) === "No name" ? " is-none" : ""), nameOf(c)));
    var fields = h("dl", "ct-d-fields");
    add(fields, add(h("div", "ct-d-field"), h("dt", "", "Contact number"), h("dd", "ct-mono", typeof c.mobile_masked === "string" ? c.mobile_masked : "")));
    var chips = h("span", "ct-chips");
    groupsOf(c).forEach(function (g) { chips.appendChild(h("span", "chip chip-neutral ct-chip", String(g.name))); });
    if (c.opted_out) chips.appendChild(h("span", "chip chip-warn ct-chip", "Opted out"));
    add(fields, add(h("div", "ct-d-field"), h("dt", "", "Groups"), add(h("dd", ""), groupsOf(c).length || c.opted_out ? chips : h("span", "ct-meta", "No groups"))));
    var edit = btn("Edit", "primary", function (b) { startEdit(c, b); });
    edit.setAttribute("aria-label", "Edit " + nameOf(c));
    var del = btn("Delete", "danger", function (b) { confirmDelete(c, b); }); del.setAttribute("aria-label", "Delete " + nameOf(c));
    add(box, back, top, fields, add(h("div", "ct-actions"), edit, del));
  }
  /* The full mobile comes only from the detail read, and only when the owner opens this one contact to edit it. */
  function startEdit(c, opener) {
    var mine = run;
    opener.disabled = true;
    D.call("GET", base() + encodeURIComponent(c.id) + "/", null, true).then(function (res) {
      opener.disabled = false;
      if (mine !== run || !S || res.status === 401) return;
      if (res.status === 404) { say("That contact is no longer available."); S.sel = null; resetPaging(); loadList(); return; }
      if (!res.ok) { say(msgOf(res, DOWN)); return; }
      S.full = res.data || c; S.editing = true; drawDetail();
      var f = byId("ct-first"); if (f && f.focus) f.focus();
    });
  }
  function editForm(box, back, c) {
    var requireFirst = !!String(c.first_name || "").trim();
    var first = textInput("ct-first", c.first_name), last = textInput("ct-last", c.last_name), mobile = textInput("ct-mobile", c.mobile, { inputmode: "tel" });
    var fFirst = field("First name", first, null, requireFirst), fLast = field("Last name", last), fMobile = field("Contact number", mobile, "A Philippine mobile number. One contact per number.");
    var fs = h("fieldset", "ct-checks"), lg = h("legend", "ct-label", "Groups"), have = groupIds(c).map(String), boxes = [];
    add(fs, lg);
    if (!S.groups.length) add(fs, h("p", "ct-meta", "No groups yet. Add one with New group."));
    S.groups.forEach(function (g, i) {
      var id = "ct-g-" + i, row = h("div", "ct-check"), cb = D.el("input", { type: "checkbox", id: id, value: String(g.id) });
      cb.checked = have.indexOf(String(g.id)) >= 0; boxes.push(cb);
      var lab = h("label", "ct-label", String(g.name)); lab.setAttribute("for", id);
      add(row, cb, lab); fs.appendChild(row);
    });
    var gerr = errBox(), err = errBox();
    var save = btn("Save contact", "primary", null), cancel = btn("Cancel", "ghost", function () { S.editing = false; S.full = null; drawDetail(); });
    save.addEventListener("click", function () {
      showErr(err, ""); showErr(gerr, ""); [[first, fFirst], [last, fLast], [mobile, fMobile]].forEach(function (p) { bad(p[1], "", p[0]); });
      var v = { requireFirst: requireFirst, first: first.value, last: last.value, mobile: mobile.value, groups: boxes.filter(function (b) { return b.checked; }).map(function (b) { return b.value; }) };
      var fe = firstError(v), me = mobileError(v);
      if (fe) bad(fFirst, fe, first);
      if (me) bad(fMobile, me, mobile);
      if (fe || me) { (fe ? first : mobile).focus(); return; }
      v.groups = v.groups.map(function (id) { var g = S.groups.filter(function (x) { return String(x.id) === id; })[0]; return g ? g.id : id; });
      var body = changedBody(c, v);
      if (!Object.keys(body).length) { S.editing = false; S.full = null; drawDetail(); return; }
      busy(save, true);
      var mine = run;
      D.call("PATCH", base() + encodeURIComponent(c.id) + "/", body, true).then(function (res) {
        if (res.status === 401 || mine !== run || !S) return;
        busy(save, false);
        if (res.ok) { S.editing = false; S.full = null; refreshAfterChange("Contact saved."); return; }
        if (res.status === 404) { say("That contact is no longer available."); S.sel = null; S.editing = false; refreshAfterChange(""); return; }
        var shown = false;
        [["first_name", first, fFirst], ["last_name", last, fLast], ["mobile", mobile, fMobile]].forEach(function (p) { var t = fieldMessage(res, p[0]); if (t) { bad(p[2], t, p[1]); shown = true; } });
        var gm = fieldMessage(res, "groups"); if (gm) { showErr(gerr, gm); shown = true; }
        if (codeOf(res) === "already_exists") { bad(fMobile, "That number is already a contact.", mobile); mobile.focus(); return; }
        if (!shown) showErr(err, msgOf(res, DOWN));
      });
    });
    add(box, back, h("h2", "ct-d-name", "Edit contact"), fFirst, fLast, fMobile, fs, gerr, err, add(h("div", "ct-actions"), save, cancel));
  }

  /* ----- add a contact (+) ----- */

  function openForm(c, opener) {
    addDialog({ site: S.site, groups: S.groups, opener: opener, done: function (row) { if (row && row.id) S.sel = row.id; refreshAfterChange("Contact added."); } });
  }
  function confirmDelete(c, opener) {
    confirmDialog(opener, "del", "Delete this contact?", nameOf(c) + " will be removed from your contacts and every group. This cannot be undone.", "Delete contact", function (fail, close) {
      var mine = run;
      D.call("DELETE", base() + encodeURIComponent(c.id) + "/", null, true).then(function (res) {
        if (res.status === 401 || mine !== run || !S) return;
        if (res.ok || res.status === 404) { close(false); S.sel = null; S.editing = false; setPane("list"); refreshAfterChange("Contact deleted."); return; }
        fail(msgOf(res, DOWN));
      });
    });
  }
  function refreshAfterChange(message) {
    if (!S) return;
    if (message) say(message);
    refreshStatus();
    var mine = run;
    resetPaging();
    loadGroups(mine, function () { if (S.tab === "list") { paintSide(); loadList(); } });
  }

  /* ----- groups (left column) ----- */

  function groupDialog(opener) {
    dialog("group", opener, function (dlg, close) {
      var input = textInput("ct-gname", "", { maxlength: "60" }), f = field("Group name", input);
      var err = errBox(), save = btn("Add group", "primary", null), cancel = btn("Cancel", "ghost", function () { close(true); });
      save.addEventListener("click", function () {
        showErr(err, ""); bad(f, "", input);
        var m = groupNameError(input.value);
        if (m) { bad(f, m, input); input.focus(); return; }
        busy(save, true);
        var mine = run;
        D.call("POST", base() + "groups/", { name: String(input.value).trim() }, true).then(function (res) {
          if (res.status === 401 || mine !== run || !S) return;
          busy(save, false);
          if (res.ok) { close(true); say("Group added."); loadGroups(mine, function () { paintSide(); }); return; }
          showErr(err, codeOf(res) === "already_exists" ? "A group with that name already exists." : (fieldMessage(res, "name") || msgOf(res, DOWN)));
        });
      });
      add(dlg, title("New group", "group"), f, err, add(h("div", "ct-actions"), save, cancel));
      input.focus();
    });
  }
  function renameDialog(g, opener) {
    dialog("rename", opener, function (dlg, close) {
      var input = textInput("ct-rename", g.name, { maxlength: "60" }), f = field("Group name", input);
      var err = errBox(), save = btn("Save name", "primary", null), cancel = btn("Cancel", "ghost", function () { close(true); });
      save.addEventListener("click", function () {
        showErr(err, ""); bad(f, "", input);
        var m = groupNameError(input.value);
        if (m) { bad(f, m, input); input.focus(); return; }
        busy(save, true);
        var mine = run;
        D.call("PATCH", base() + "groups/" + encodeURIComponent(g.id) + "/", { name: String(input.value).trim() }, true).then(function (res) {
          if (res.status === 401 || mine !== run || !S) return;
          busy(save, false);
          if (res.ok) { close(true); say("Group renamed."); loadGroups(mine, function () { paintSide(); loadList(); }); return; }
          if (res.status === 404) { close(false); loadGroups(mine, function () { paintSide(); }); return; }
          showErr(err, codeOf(res) === "already_exists" ? "A group with that name already exists." : (fieldMessage(res, "name") || msgOf(res, DOWN)));
        });
      });
      add(dlg, title("Rename group", "rename"), f, err, add(h("div", "ct-actions"), save, cancel));
      input.focus();
    });
  }
  function deleteGroup(g, opener) {
    confirmDialog(opener, "delgroup", "Delete this group?", "The group “" + g.name + "” will be removed. Its contacts stay in your contacts.", "Delete group", function (fail, close) {
      var mine = run;
      D.call("DELETE", base() + "groups/" + encodeURIComponent(g.id) + "/", null, true).then(function (res) {
        if (res.status === 401 || mine !== run || !S) return;
        if (res.ok || res.status === 404) {
          close(false); if (S.group === String(g.id)) { S.group = ""; S.sel = null; S.editing = false; resetPaging(); }
          say("Group deleted."); loadGroups(mine, function () { paintSide(); drawDetail(); loadList(); }); return;
        }
        fail(msgOf(res, DOWN));
      });
    });
  }

  /* ----- CSV upload: check, then save ----- */

  function uploadPanel(panel) {
    var U = S.upload = { text: "", group: "", checked: null, run: 0 };
    var form = h("form", "ct-card"); form.setAttribute("novalidate", "novalidate"); form.setAttribute("aria-label", "Upload contacts");
    add(form, h("h2", "ct-h2", "Upload a CSV file"), h("p", "ct-lead", "Choose a file or paste your list. Each line is first name, last name, mobile number; a line with only a mobile number is fine. A header row is fine. Not sure how to fill it in? Download the sample file. Up to 1 MB. Nothing is saved until you check it and confirm."));
    /* The native picker is hidden; its label is a dash secondary button, and the chosen name sits beside it. */
    var file = D.el("input", { id: "ct-file", "class": "ct-sr ct-file", type: "file", accept: ".csv,text/csv,text/plain" });
    var fFile = field("CSV file", file); /* field() puts the input in its box; it moves into the picker below, directly before its label */
    var pick = h("div", "ct-filepick"), pickBtn = h("label", "no-btn no-btn-ghost ct-filebtn", "Choose file"), pickName = h("span", "ct-meta ct-filename", "No file chosen");
    pickBtn.setAttribute("for", "ct-file");
    var sample = D.el("a", { "class": "ct-sample", href: SAMPLE, download: "contacts-sample.csv" }, "Download sample CSV");
    add(pick, file, pickBtn, pickName, sample);
    fFile.insertBefore(pick, fFile.err);
    var area = D.el("textarea", { id: "ct-paste", "class": "ct-input ct-area", rows: "6", spellcheck: "false", placeholder: "Maria,Santos,0917 123 4567" });
    var fPaste = field("Or paste the lines here", area);
    var grp = dropdown("ct-ugroup", "Add them to this group", groupOptions("No group"), "", function (v) { U.group = v; drop(); });
    var gLab = h("p", "ct-label", "Add them to this group");
    var err = errBox(), check = btn("Check", "primary", null);
    var out = h("div", "ct-check-out"); out.setAttribute("aria-live", "polite");
    function drop() { U.checked = null; clear(out); }
    file.addEventListener("change", function () {
      showErr(fFile.err, ""); drop();
      var f = file.files && file.files[0], m = f ? fileError(f) : "";
      pickName.textContent = f && f.name ? String(f.name) : "No file chosen";
      if (m) { showErr(fFile.err, m); return; }
      if (!f) return;
      var rd = typeof f.text === "function" ? f.text() : new Promise(function (ok, no) { var r = new FileReader(); r.onload = function () { ok(String(r.result)); }; r.onerror = no; r.readAsText(f); });
      rd.then(function (t) { area.value = t; }, function () { showErr(fFile.err, "We could not read that file."); });
    });
    area.addEventListener("input", function () { drop(); });
    form.addEventListener("submit", function (e) { e.preventDefault(); });
    check.addEventListener("click", function () {
      showErr(err, ""); showErr(fPaste.err, "");
      var text = String(area.value || "");
      if (!text.trim()) { showErr(fPaste.err, "Choose a file or paste some lines first."); area.focus(); return; }
      if (text.length > MAX_FILE) { showErr(fPaste.err, "That is over 1 MB."); return; }
      drop(); busy(check, true);
      var mine = run, group = grp.sel.value;
      D.call("POST", base() + "upload/check/", uploadBody(text, group), true).then(function (res) {
        if (res.status === 401 || mine !== run || !S || S.upload !== U) return;
        busy(check, false);
        if (res.status === 404) { showErr(err, "That group is no longer available."); return; }
        if (!res.ok) { showErr(err, msgOf(res, DOWN)); return; }
        U.text = text; U.group = group; U.checked = checkSummary(res.data);
        drawCheck(out, U, err);
      });
    });
    add(form, fFile, fPaste, add(h("div", "ct-field"), gLab, grp.wrap), err, add(h("div", "ct-actions"), check));
    add(panel, form, out);
  }
  function drawCheck(out, U, err) {
    clear(out);
    var c = U.checked, card = h("section", "ct-card");
    var facts = h("dl", "ct-facts");
    [["New contacts", c.news], ["Already in contacts", c.already], ["Refused lines", c.refused.length]].forEach(function (p) {
      add(facts, add(h("div", "ct-fact"), h("dt", "", p[0]), h("dd", "", whole(p[1]))));
    });
    add(card, h("h2", "ct-h2", "Check result"), facts);
    if (c.refused.length) {
      add(card, h("p", "ct-meta", "These lines will not be added:"));
      var ul = h("ul", "ct-list ct-refused");
      c.refused.slice(0, SHOW_REFUSED).forEach(function (r) {
        var li = h("li", "ct-row"), main = h("div", "ct-row-main");
        add(main, h("span", "ct-name ct-mono", "Line " + String(r.line)), h("span", "ct-meta", String(r.reason == null ? "" : r.reason)));
        add(li, main); ul.appendChild(li);
      });
      add(card, ul);
      if (c.refused.length > SHOW_REFUSED) add(card, h("p", "ct-meta", "And " + whole(c.refused.length - SHOW_REFUSED) + " more."));
    }
    var save = btn(c.news ? "Add " + countText(c.news) : "Nothing new to add", "primary", null);
    save.disabled = !c.news;
    var e2 = errBox();
    save.addEventListener("click", function () {
      showErr(e2, ""); busy(save, true);
      var mine = run;
      D.call("POST", base() + "upload/save/", uploadBody(U.text, U.group, c.news), true).then(function (res) {
        if (res.status === 401 || mine !== run || !S || S.upload !== U) return;
        if (res.ok) { var d = res.data || {}; doneCard(out, num(d.added != null ? d.added : d.created != null ? d.created : c.news)); say("Contacts added."); refreshStatus(); loadGroups(mine, null); return; }
        busy(save, false);
        if (codeOf(res) === "changed") { U.checked = null; clear(out); showErr(err, "The file or your list changed since it was checked. Check it again."); return; }
        showErr(e2, msgOf(res, DOWN));
      });
    });
    add(card, e2, add(h("div", "ct-actions"), save));
    out.appendChild(card);
  }
  function doneCard(out, n) {
    clear(out);
    add(out, add(h("section", "ct-card"), h("h2", "ct-h2", "Contacts added"), h("p", "ct-lead", whole(n) + (n === 1 ? " contact was" : " contacts were") + " saved."),
      btn("See your contacts", "primary", function () { switchTab("list"); })));
  }

  window.NOContacts = { show: show, hide: hide, probe: probe, addDialog: addDialog,
    util: { nameOf: nameOf, queryMode: queryMode, listPath: listPath, groupsOf: groupsOf, groupIds: groupIds, fieldMessage: fieldMessage, contactBody: contactBody,
      changedBody: changedBody, letterOf: letterOf, sections: sections, contactError: contactError, firstError: firstError, mobileError: mobileError, groupNameError: groupNameError, fileError: fileError, uploadBody: uploadBody, checkSummary: checkSummary, countText: countText, statusOn: statusOn } };
})();
