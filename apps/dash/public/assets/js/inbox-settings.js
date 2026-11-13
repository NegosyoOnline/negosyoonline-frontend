/* Inbox settings (/settings/inbox/, ClickUp z8uq9md3n6, G2 Unified Inbox, frontend F1): the owner's Pancake connection, to the
   approved mockups a1 (not connected), a2 (connected) and a3 (token not accepted). Reads GET /sites/{id}/inquiries/connection/
   and writes PUT (page_id, access_token), DELETE (disconnect) and POST .../connection/test/. The page token is write-only:
   the API never returns it, the box is emptied as soon as it is sent, and nothing is stored in the browser. Every status
   comes from the API; API strings reach the page through textContent or D.el only. While the API answers 404 (the
   INQUIRIES_ENABLED switch is off, or not a Santé site) the page says the inbox is not available yet and the Inbox links
   stay hidden. Plain ES5. NOInboxSettings.util holds the pure helpers (tests/inbox.test.mjs). */
(function () {
  var D = window.NODash;
  var token = 0, S = null;
  var PAGE_RE = /^[A-Za-z0-9_]{3,64}$/, TOKEN_RE = /^\S{20,1500}$/;

  function byId(id) { return document.getElementById(id); }
  function h(tag, cls, text) { return D.el(tag, cls ? { "class": cls } : {}, text); }
  function add(parent) { for (var i = 1; i < arguments.length; i++) { if (arguments[i]) parent.appendChild(arguments[i]); } return parent; }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  function say(text) { var l = byId("ibs-live"); if (l) l.textContent = text; }
  function msgOf(res, fallback) { var m = res && res.data && res.data.message; return typeof m === "string" && m ? m : fallback; }
  function base() { return "/sites/" + S.site + "/inquiries/connection/"; }
  function btn(label, kind, fn) {
    var b = h("button", "no-btn " + (kind === "primary" ? "no-btn-primary" : "no-btn-ghost") + (kind === "danger" ? " pm-danger" : ""), label);
    b.setAttribute("type", "button");
    if (fn) b.addEventListener("click", function () { fn(b); });
    return b;
  }
  function busy(b, on) { if (!b) return; if (on) { b.setAttribute("aria-busy", "true"); b.disabled = true; } else { b.removeAttribute("aria-busy"); b.disabled = false; } }
  function lockIcon() {
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    [["viewBox", "0 0 24 24"], ["fill", "none"], ["stroke", "currentColor"], ["stroke-width", "2"], ["stroke-linecap", "round"], ["stroke-linejoin", "round"], ["aria-hidden", "true"], ["focusable", "false"]].forEach(function (kv) { s.setAttribute(kv[0], kv[1]); });
    var r = document.createElementNS("http://www.w3.org/2000/svg", "rect"), p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    r.setAttribute("x", "5"); r.setAttribute("y", "11"); r.setAttribute("width", "14"); r.setAttribute("height", "9"); r.setAttribute("rx", "2");
    p.setAttribute("d", "M8 11V8a4 4 0 0 1 8 0v3");
    s.appendChild(r); s.appendChild(p);
    return s;
  }

  /* ---------- pure helpers ---------- */

  function whenText(iso, now) {
    var d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return "";
    var tz = "Asia/Manila", key = function (x) { return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(x); };
    var clock = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(d);
    var rel = key(d) === key(now) ? "today" : key(d) === key(new Date(now.getTime() - 86400000)) ? "yesterday" : null;
    if (!rel) {
      var sameYear = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric" }).format(d) === new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric" }).format(now);
      rel = new Intl.DateTimeFormat("en-US", sameYear ? { timeZone: tz, month: "short", day: "numeric" } : { timeZone: tz, month: "short", day: "numeric", year: "numeric" }).format(d);
    }
    return rel + ", " + clock;
  }
  /* The one line the test block shows for each outcome code the API can answer. */
  var TEST_TEXT = {
    ok: "Pancake answered for this page.",
    invalid_credentials: "Pancake did not accept the saved token.",
    expired_credentials: "Pancake did not accept the saved token.",
    forbidden_page: "The saved token cannot reach this page.",
    not_found: "Pancake could not find this page.",
    rate_limited: "Pancake is busy right now. Wait a moment and test again.",
    provider_down: "Pancake did not answer. Try again in a moment.",
    bad_response: "Pancake sent an answer we could not read.",
    not_configured: "Save a page ID and a token first."
  };
  function testText(code) { return Object.prototype.hasOwnProperty.call(TEST_TEXT, code) ? TEST_TEXT[code] : "The test did not pass."; }
  /* [chip colour, chip text] for the card's status. */
  function chipOf(conn) {
    if (conn.status === "invalid") return ["danger", "Token not accepted"];
    if (conn.token_set && conn.status === "active") return ["ok", "Connected"];
    return ["neutral", "Not connected"];
  }
  function pageError(v) {
    v = v.trim();
    if (!v) return "Enter your Pancake page ID.";
    return PAGE_RE.test(v) ? "" : "That page ID does not look right. Use letters, digits and underscores only.";
  }
  function tokenError(v) {
    v = v.trim();
    if (!v) return "Paste the token from Pancake.";
    return TOKEN_RE.test(v) ? "" : "That token does not look right. Copy it again from Pancake.";
  }

  /* ---------- load ---------- */

  function show() {
    var mine = ++token, root = clear(byId("ibs-root")); S = { site: null, conn: null, replacing: false };
    root.setAttribute("aria-busy", "true");
    add(root, h("p", "pm-meta", "Loading your inbox settings…"));
    D.call("GET", "/sites/", null, true).then(function (res) {
      if (mine !== token || res.status === 401) return;
      var sites = res.ok ? D.sitesOf(res) : [];
      if (!res.ok) { failedPanel(); return; }
      if (!sites.length) { unavailable(); return; }
      S.site = D.siteFromQuery(sites.map(function (s) { return s.id; }));
      read(mine);
    });
  }
  function hide() { token++; S = null; say(""); var r = byId("ibs-root"); if (r) clear(r); }
  function read(mine, then) {
    D.call("GET", base(), null, true).then(function (res) {
      if (mine !== token || !S || res.status === 401) return;
      if (res.status === 404) { unavailable(); return; }
      if (!res.ok) { failedPanel(res.status === 403 ? msgOf(res, "") : ""); return; }
      S.conn = res.data; S.replacing = false; render(); setNav(true);
      if (then) then();
    });
  }
  function setNav(on) { Array.prototype.forEach.call(document.querySelectorAll("[data-inbox-nav]"), function (n) { n.hidden = !on; }); }

  function card(id, title, chip) {
    var s = h("section", "pm-card"); s.setAttribute("aria-labelledby", "pm-h-" + id);
    var t = h("h2", "pm-h2", title); t.setAttribute("id", "pm-h-" + id);
    add(s, add(h("div", "pm-head"), t, chip ? h("span", "chip chip-" + chip[0], chip[1]) : null));
    return s;
  }
  function failedPanel(extra) {
    var root = clear(byId("ibs-root")); root.removeAttribute("aria-busy");
    var s = card("err", "We couldn’t load your inbox settings");
    s.setAttribute("role", "alert");
    add(s, h("p", "pm-lead", extra || "Check your connection and try again. Nothing was changed."), btn("Try again", "ghost", show));
    root.appendChild(s);
    setNav(false);
  }
  function unavailable() {
    var root = clear(byId("ibs-root")); root.removeAttribute("aria-busy");
    root.appendChild(add(card("off", "The inbox is not available yet"), h("p", "pm-lead", "It is not open for this site right now. Nothing is wrong with your account.")));
    setNav(false);
  }

  /* ---------- render ---------- */

  /* One labelled field. `secret` wraps the box in the .pm-secret holder. The field's error line is kept on the input (pmErr). */
  function field(id, label, input, hint, secret) {
    var w = h("div", "pm-field"), lab = h("label", "pm-label", label), err = h("p", "pm-error"), box = input;
    lab.setAttribute("for", id); input.setAttribute("id", id); err.setAttribute("id", id + "-err"); err.hidden = true;
    input.pmErr = err;
    var tip = hint ? h("p", "pm-hint", hint) : null;
    if (tip) { tip.setAttribute("id", id + "-hint"); input.setAttribute("aria-describedby", id + "-hint"); input.setAttribute("data-hint", id + "-hint"); }
    if (secret) { box = h("div", "pm-secret"); box.appendChild(input); }
    return add(w, lab, box, tip, err);
  }
  function markBad(input, text) {
    var err = input.pmErr; if (!err) return;
    err.textContent = text; err.hidden = false;
    input.classList.add("pm-invalid"); input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-describedby", (input.getAttribute("data-hint") ? input.getAttribute("data-hint") + " " : "") + err.id);
  }
  function markOk(input) {
    var err = input.pmErr;
    if (err) { err.hidden = true; err.textContent = ""; }
    input.classList.remove("pm-invalid"); input.removeAttribute("aria-invalid");
    if (input.getAttribute("data-hint")) input.setAttribute("aria-describedby", input.getAttribute("data-hint")); else input.removeAttribute("aria-describedby");
  }
  function input(type, name, extra) {
    var attrs = { "class": "pm-input", type: type, name: name, autocomplete: "off", spellcheck: "false" };
    Object.keys(extra || {}).forEach(function (k) { attrs[k] = extra[k]; });
    return D.el("input", attrs);
  }
  /* The server names a field in `fields`; show it and focus the first one that has a box on the page. */
  function showFields(fields) {
    var first = null;
    Object.keys(fields || {}).forEach(function (k) {
      var box = byId("ibs-" + k);
      if (box) { markBad(box, String(fields[k])); if (!first) first = box; }
    });
    if (first) first.focus();
    return !!first;
  }

  function render() {
    var root = clear(byId("ibs-root")); root.removeAttribute("aria-busy");
    var c = S.conn, invalid = c.status === "invalid", saved = !!c.token_set, tokenBox = !saved || invalid || S.replacing;
    var s = card("conn", "Facebook Messenger through Pancake", chipOf(c));
    add(s, h("p", "pm-lead", "Connect your Facebook page to read your customers' Messenger messages and reply to them here, in your dashboard."));
    if (invalid) add(s, h("p", "pm-warn", "Your inbox is paused. Messages cannot be read or sent until the token is replaced."));
    var page = input("text", "page_id", { inputmode: "numeric", maxlength: "64" });
    if (saved || c.page_id) page.value = c.page_id || ""; else page.setAttribute("placeholder", "For example 104829384756123");
    add(s, field("ibs-page_id", "Pancake page ID", page));
    var tk = null;
    if (tokenBox) {
      tk = input("password", "access_token", { maxlength: "1500", placeholder: saved ? "Paste a new token from Pancake" : "Paste the token from Pancake" });
      s.appendChild(field("ibs-access_token", saved ? "New page token" : "Page token", tk, saved ? null : "We keep the token safe and never show it again after you save.", true));
      if (invalid) markBad(tk, "The saved token no longer works. Paste a new one to reconnect.");
    } else {
      var row = h("div", "pm-field"), lab2 = h("span", "pm-label", "Page token"); lab2.setAttribute("id", "ibs-tk-l");
      var box = h("div", "mk-saved"); box.setAttribute("aria-labelledby", "ibs-tk-l");
      var txt = h("span", "mk-saved-text"); add(txt, lockIcon(), document.createTextNode("Token saved"));
      var replace = btn("Replace token", "ghost", function () { S.replacing = true; render(); var t = byId("ibs-access_token"); if (t) t.focus(); });
      replace.classList.add("mk-small");
      add(box, txt, replace);
      add(row, lab2, box, h("p", "pm-hint", "The token is never shown again. To change it, replace it."));
      s.appendChild(row);
    }
    if (c.last_test && saved) {
      var good = c.last_test.outcome === "ok", when = whenText(c.last_test.at, new Date());
      var t = h("div", "mk-test " + (good ? "mk-test-ok" : "mk-test-bad")); t.setAttribute("role", good ? "status" : "alert");
      add(t, h("span", "chip " + (good ? "chip-ok" : "chip-danger"), good ? "Test passed" : "Test failed"), h("span", "", testText(c.last_test.outcome) + (when ? " Last checked " + when + "." : "")));
      s.appendChild(t);
    }
    var actions = h("div", "pm-actions");
    if (!saved) {
      /* a1: nothing saved yet. Test needs a saved token, so it waits. */
      var wait = btn("Test connection", "ghost"); wait.disabled = true;
      add(actions, btn("Save and connect", "primary", function (b) { save(b, page, tk); }), wait);
    } else if (invalid) {
      /* a3: the saved token stopped working. */
      add(actions, btn("Save new token", "primary", function (b) { save(b, page, tk); }), btn("Test connection", "ghost", test), btn("Disconnect", "danger", disconnect));
    } else if (S.replacing) {
      add(actions, btn("Save new token", "primary", function (b) { save(b, page, tk); }), btn("Cancel", "ghost", function () { S.replacing = false; render(); }));
    } else {
      /* a2: connected. A saved page ID that was edited can be saved on its own; the button shows only then. */
      var only = btn("Save page ID", "ghost", function (b) { save(b, page, null); });
      only.hidden = true;
      page.addEventListener("input", function () { only.hidden = page.value.trim() === (c.page_id || ""); });
      add(actions, btn("Test connection", "primary", test), only, btn("Disconnect", "danger", disconnect));
    }
    s.appendChild(actions);
    add(root, s, howCard());
  }
  function howCard() {
    var s = card("how", "How the inbox works"), ul = h("ul", "mk-list");
    ["You need a Pancake account with your Facebook page added.",
      "The inbox shows your Messenger conversations. Press Refresh to see new messages.",
      "Customers can be answered for a limited time after their last message. After that, reply in Pancake."].forEach(function (t) { ul.appendChild(h("li", "", t)); });
    return add(s, ul);
  }

  /* ---------- actions ---------- */

  function save(b, page, tk) {
    var mine = token, bad = false, body = {};
    var pe = pageError(page.value);
    if (pe) { markBad(page, pe); bad = true; } else { markOk(page); body.page_id = page.value.trim(); }
    if (tk) {
      var te = tokenError(tk.value);
      if (te) { markBad(tk, te); bad = true; } else { markOk(tk); body.access_token = tk.value.trim(); }
    }
    if (bad) { (page.getAttribute("aria-invalid") === "true" ? page : tk).focus(); return; }
    busy(b, true);
    D.call("PUT", base(), body, true).then(function (res) {
      if (res.status === 401) return;
      if (tk) tk.value = ""; /* the token is gone from the page as soon as it was sent */
      if (mine !== token || !S) return;
      busy(b, false);
      if (!res.ok) {
        if (res.status === 404) { unavailable(); return; }
        if (!showFields(res.data && res.data.fields)) D.toast("That did not work", msgOf(res, "We could not save. Please try again."), "error");
        return;
      }
      S.conn = res.data; S.replacing = false; render();
      D.toast("Saved", body.access_token ? "Your Pancake connection was saved." : "Your page ID was saved."); say("Saved.");
    });
  }
  function test(b) {
    var mine = token; busy(b, true);
    D.call("POST", base() + "test/", null, true).then(function (res) {
      if (res.status === 401 || mine !== token || !S) return;
      if (res.status === 404) { unavailable(); return; }
      if (!res.ok) { busy(b, false); D.toast("That did not work", msgOf(res, "We could not run the test. Please try again."), "error"); return; }
      var outcome = res.data && res.data.outcome;
      read(mine, function () { say(outcome === "ok" ? "Test passed." : "Test failed."); });
    });
  }
  function disconnect(b) {
    if (b.getAttribute("data-confirm") !== "true") { b.setAttribute("data-confirm", "true"); b.textContent = "Confirm disconnect"; return; }
    var mine = token; busy(b, true);
    D.call("DELETE", base(), null, true).then(function (res) {
      if (res.status === 401 || mine !== token || !S) return;
      busy(b, false);
      if (!res.ok) { D.toast("That did not work", msgOf(res, "We could not disconnect. Please try again."), "error"); return; }
      S.conn = res.data; S.replacing = false; render(); D.toast("Disconnected", "Your Pancake token was removed."); say("Disconnected.");
    });
  }

  window.NOInboxSettings = { show: show, hide: hide, util: { whenText: whenText, testText: testText, chipOf: chipOf, pageError: pageError, tokenError: tokenError } };
})();
