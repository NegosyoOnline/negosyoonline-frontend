/* Inbox settings (/settings/inbox/, ClickUp z8uq9md3n6, G2 Unified Inbox, frontend F1): the owner's Pancake connection, to the
   approved mockups a1 (not connected), a2 (connected) and a3 (token not accepted). Reads GET /sites/{id}/inquiries/connection/
   and writes PUT (page_id, access_token), DELETE (disconnect) and POST .../connection/test/. The page token is write-only:
   the API never returns it, the box is emptied as soon as it is sent, and nothing is stored in the browser. Every status
   comes from the API; API strings reach the page through textContent or D.el only. While the API answers 404 (the
   INQUIRIES_ENABLED switch is off, or not a Santé site) the page says the inbox is not available yet and the Inbox links
   stay hidden. Plain ES5. NOInboxSettings.util holds the pure helpers (tests/inbox.test.mjs).

   G3 PR3 (ClickUp z8uq9mfj12, mockup d6) adds two cards above the Pancake one, from GET/PUT .../inquiries/channels/: "Inbox channels"
   (the website chat switch, the "Pause for" house dropdown with Pause chat, the status line and Resume chat) and "Email" (the
   contact-form switch, only when the API says contact_inbox_available, and the one "coming soon" line for direct email). Fields the
   API does not send yet (email_enabled, contact_inbox_available) hide their part; a 404 on the channels route hides both cards. */
(function () {
  var D = window.NODash;
  var token = 0, S = null;
  var DAY = 86400000;
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
  /* "Pause for" choices and the time each one means (Coach Ed's routine decision, ClickUp comment 1100430000530396): 1 hour, 4 hours,
     the next day 08:00 Manila time, and the longest the API accepts (90 days, less ten minutes so a clock a little ahead is still inside). */
  var PAUSES = [["", "Pause for"], ["1h", "1 hour"], ["4h", "4 hours"], ["tomorrow", "Until tomorrow"], ["manual", "Until I turn it back on"]];
  function pauseUntil(choice, now) {
    if (choice === "1h") return new Date(now.getTime() + 3600000).toISOString();
    if (choice === "4h") return new Date(now.getTime() + 4 * 3600000).toISOString();
    if (choice === "manual") return new Date(now.getTime() + 90 * DAY - 10 * 60000).toISOString();
    if (choice === "tomorrow") {
      var key = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(now).split("-");
      /* 08:00 in Manila (UTC+8, no daylight saving) is 00:00 UTC of the same calendar day. */
      return new Date(Date.UTC(Number(key[0]), Number(key[1]) - 1, Number(key[2]) + 1, 0, 0, 0)).toISOString();
    }
    return "";
  }
  /* The chat's status line from the API's paused_until: [chip colour, text]. */
  function chatStatus(ch, now) {
    var until = ch && ch.paused_until ? new Date(ch.paused_until) : null;
    if (until && !isNaN(until.getTime()) && until.getTime() > now.getTime()) return ["warn", "Website chat is paused until " + whenText(ch.paused_until, now) + "."];
    return ["ok", "Website chat is on. Visitors can write to you."];
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
    var mine = ++token, root = clear(byId("ibs-root")); S = { site: null, conn: null, replacing: false, ch: null, pause: "" };
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
      S.conn = res.data; S.replacing = false; setNav(true);
      D.call("GET", chBase(), null, true).then(function (r2) {
        if (mine !== token || !S || r2.status === 401) return;
        S.ch = r2.ok && r2.data && typeof r2.data === "object" ? r2.data : null; /* a 404 or a failure: the two channel cards stay away */
        render();
        if (then) then();
      });
    });
  }
  function chBase() { return "/sites/" + S.site + "/inquiries/channels/"; }
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
    if (S.ch) add(root, channelsCard(), emailCard());
    add(root, s, howCard());
  }

  /* ---------- the channel cards (d6) ---------- */

  /* An on/off switch: a button with role switch, a track and the word On or Off. */
  function swtch(id, labelId, on, fn) {
    var b = h("button", "mk-sw"); b.setAttribute("type", "button"); b.setAttribute("id", id); b.setAttribute("role", "switch");
    b.setAttribute("aria-checked", on ? "true" : "false"); b.setAttribute("aria-labelledby", labelId);
    var track = h("span", "mk-sw-track"); track.setAttribute("aria-hidden", "true");
    add(b, track, h("span", "mk-sw-t", on ? "On" : "Off"));
    b.addEventListener("click", function () { fn(b, !on); });
    return b;
  }
  function line(title, titleId, desc, control) {
    var row = h("div", "mk-line"), t = h("div", "mk-line-t"), b = h("b", "", title);
    if (titleId) b.setAttribute("id", titleId);
    add(t, b, h("span", "", desc));
    return add(row, t, control);
  }
  function channelsCard() {
    var ch = S.ch, on = ch.webchat_enabled === true, now = new Date();
    var s = card("ch", "Inbox channels");
    add(s, h("p", "pm-lead", "Choose which channels reach your Inbox. Facebook Messenger through Pancake is set up in its own card on this page."));
    var h3 = h("h3", "pm-h2", "Website chat"); h3.setAttribute("style", "font-size:17px");
    add(s, h3, line("Show the chat on your website", "ibs-sw-chat-l", "Visitors can write to you from the chat button on your store. Chat stays off until it is switched on here.",
      swtch("ibs-sw-chat", "ibs-sw-chat-l", on, function (b, next) { putChannels(b, { webchat_enabled: next }, next ? "Website chat is on." : "Website chat is off.", "ibs-sw-chat"); })));
    if (!on) return s;
    var controls = h("div", ""); controls.setAttribute("id", "ibs-chat-controls");
    var field = h("div", "pm-field"); field.setAttribute("style", "margin-top:12px");
    var vis = h("span", "pm-label", "Pause chat until"); vis.setAttribute("id", "ibs-pause-l");
    var lab = h("label", "bl-sr", "Pause for"); lab.setAttribute("for", "ibs-pause");
    var row = h("div", "mk-pause"), cell = h("div", "");
    var sel = D.el("select", { "class": "ib-input", id: "ibs-pause" });
    PAUSES.forEach(function (p) { sel.appendChild(D.el("option", { value: p[0] }, p[1])); });
    sel.value = S.pause;
    var go = btn("Pause chat", "primary", function (b) {
      var until = pauseUntil(sel.value, new Date()); if (!until) return;
      S.pause = "";
      putChannels(b, { paused_until: until }, "Website chat is paused.", "ibs-pause");
    });
    go.setAttribute("id", "ibs-pause-btn"); go.disabled = !sel.value;
    sel.addEventListener("change", function () { S.pause = sel.value; go.disabled = !sel.value; });
    add(cell, sel); add(row, cell, go);
    add(field, vis, lab, row, h("p", "pm-hint", "While chat is paused, visitors see that chat is not available and are pointed to your contact form."));
    var status = chatStatus(ch, now), st = h("div", "mk-status"); st.setAttribute("role", "status"); st.setAttribute("aria-live", "polite");
    var chip = h("span", "chip chip-" + status[0], status[1]); chip.setAttribute("id", "ibs-pause-status");
    st.appendChild(chip);
    if (status[0] === "warn") {
      var resume = btn("Resume chat", "ghost", function (b) { putChannels(b, { paused_until: null }, "Website chat is back on.", "ibs-sw-chat"); });
      resume.classList.add("mk-small"); resume.setAttribute("id", "ibs-resume"); st.appendChild(resume);
    }
    add(controls, field, st); s.appendChild(controls);
    if (window.NOInbox && window.NOInbox.combo) window.NOInbox.combo(sel, "Pause for", { blankEmpty: true });
    return s;
  }
  function emailCard() {
    var ch = S.ch, s = card("em", "Email");
    if (ch.contact_inbox_available === true) {
      add(s, line("Contact form messages appear in your Inbox", "ibs-sw-form-l", "Messages sent from the contact form on your store show as email conversations. The email to your contact address is still sent as before.",
        swtch("ibs-sw-form", "ibs-sw-form-l", ch.email_enabled === true, function (b, next) { putChannels(b, { email_enabled: next }, next ? "Contact form messages now appear in your Inbox." : "Contact form messages no longer appear in your Inbox.", "ibs-sw-form"); })));
    }
    var soon = line("Receiving email directly", "", "Customers writing to a store address will reach your Inbox.", h("span", "chip chip-neutral", "Coming soon"));
    add(s, soon);
    if (ch.contact_inbox_available === true) add(s, h("p", "pm-hint", "Receiving email directly: coming soon."));
    return s;
  }
  /* One write to the channels route; the answer is the new state. Focus returns to the control that was used. */
  function putChannels(b, body, said, focusId) {
    var mine = token; busy(b, true);
    D.call("PUT", chBase(), body, true).then(function (res) {
      if (res.status === 401 || mine !== token || !S) return;
      if (!res.ok) {
        busy(b, false);
        if (res.status === 404) { S.ch = null; render(); return; }
        var f = res.data && res.data.fields, first = f ? f[Object.keys(f)[0]] : null;
        D.toast("That did not work", msgOf(res, Array.isArray(first) && typeof first[0] === "string" ? first[0] : "We could not save. Please try again."), "error");
        return;
      }
      var merged = {}; Object.keys(S.ch).forEach(function (k) { merged[k] = S.ch[k]; }); Object.keys(res.data || {}).forEach(function (k) { merged[k] = res.data[k]; }); S.ch = merged;
      render(); say(said);
      var again = byId(focusId); if (again && again.focus) again.focus();
    });
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

  window.NOInboxSettings = { show: show, hide: hide, util: { whenText: whenText, testText: testText, chipOf: chipOf, pageError: pageError, tokenError: tokenError, pauseUntil: pauseUntil, chatStatus: chatStatus } };
})();
