/* Meta Pixel settings (/settings/meta-pixel/, ClickUp z8uq9md3n5, plan section 9): the owner's Pixel ID, the Conversions API access
   token and a test event code. Reads GET /sites/{id}/meta/ and writes PUT (pixel_id, test_event_code, access_token), DELETE .../meta/token/
   and POST .../meta/test/. The access token is write-only: the API never returns it, the box is emptied as soon as it is sent, and
   nothing is stored in the browser. Every status comes from the API; API strings reach the page through textContent or D.el only.
   While the API answers 404 (the META_EVENTS_ENABLED switch is off, or not a Santé site) the page says the Meta Pixel is not available
   yet and the Meta Pixel tab stays hidden (probe). Plain ES5. NOMetaPixel.util holds the pure helpers (tests/meta-pixel.test.mjs). */
(function () {
  var D = window.NODash;
  var token = 0, S = null;
  var PIXEL_RE = /^[0-9]{8,20}$/, CODE_RE = /^[A-Za-z0-9]{1,32}$/, TOKEN_RE = /^\S{40,800}$/;

  function byId(id) { return document.getElementById(id); }
  function h(tag, cls, text) { return D.el(tag, cls ? { "class": cls } : {}, text); }
  function add(parent) { for (var i = 1; i < arguments.length; i++) { if (arguments[i]) parent.appendChild(arguments[i]); } return parent; }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  function say(text) { var l = byId("mp-live"); if (l) l.textContent = text; }
  function msgOf(res, fallback) { var m = res && res.data && res.data.message; return typeof m === "string" && m ? m : fallback; }
  function base() { return "/sites/" + S.site + "/meta/"; }
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
  /* The one line the test block shows for each outcome code the API can answer (never Meta's own message). */
  var TEST_TEXT = {
    ok: "Meta accepted the test event. Look for it under Test events in Events Manager.",
    bad_token: "Meta did not accept the access token.",
    bad_pixel: "Meta could not find this Pixel ID.",
    rate_limited: "Meta is busy right now. Wait a moment and test again.",
    meta_down: "Meta did not answer. Try again in a moment.",
    token_unreadable: "The saved token could not be read. Remove it and save it again."
  };
  function testText(code) { return Object.prototype.hasOwnProperty.call(TEST_TEXT, code) ? TEST_TEXT[code] : "The test did not pass."; }
  /* What the list of last events says for each delivery outcome the API can answer. */
  var EVENT_TEXT = {
    queued: "Waiting to be sent",
    sent: "Sent",
    retrying: "Sending again",
    failed: "Not accepted",
    expired: "Too old to send",
    skipped_no_client_data: "Skipped, no visitor details",
    skipped_bot: "Skipped, looks like a bot"
  };
  function eventText(code) { return Object.prototype.hasOwnProperty.call(EVENT_TEXT, code) ? EVENT_TEXT[code] : "Unknown"; }
  /* [chip colour, chip text] for the card's status. */
  function chipOf(conn) {
    if (conn.pixel_id && conn.token_set) return ["ok", "Connected"];
    if (conn.pixel_id) return ["neutral", "Pixel only"];
    return ["neutral", "Not connected"];
  }
  function pixelError(v) {
    v = v.trim();
    if (!v) return "";
    return PIXEL_RE.test(v) ? "" : "A Pixel ID is 8 to 20 digits.";
  }
  function codeError(v) {
    v = v.trim();
    if (!v) return "";
    return CODE_RE.test(v) ? "" : "A test event code is letters and digits only.";
  }
  function tokenError(v) {
    v = v.trim();
    if (!v) return "Paste the access token from Events Manager.";
    return TOKEN_RE.test(v) ? "" : "That token does not look right. Copy it again from Events Manager.";
  }
  var CODE_TIP = "From the Test events tab in Events Manager. The connection test sends one event with this code, so it never touches your live numbers.";
  /* The test needs all three saved. */
  function canTest(conn) { return !!(conn.pixel_id && conn.token_set && conn.test_event_code); }

  /* ---------- load ---------- */

  function show() {
    var mine = ++token, root = clear(byId("mp-root")); S = { site: null, conn: null, replacing: false };
    root.setAttribute("aria-busy", "true");
    add(root, h("p", "pm-meta", "Loading your Meta Pixel settings…"));
    D.call("GET", "/sites/", null, true).then(function (res) {
      if (mine !== token || res.status === 401) return;
      var sites = res.ok ? D.sitesOf(res) : [];
      if (!res.ok) { failedPanel(); return; }
      if (!sites.length) { unavailable(); return; }
      S.site = D.siteFromQuery(sites.map(function (s) { return s.id; }));
      read(mine);
    });
  }
  function hide() { token++; S = null; say(""); var r = byId("mp-root"); if (r) clear(r); }
  function read(mine, then) {
    D.call("GET", base(), null, true).then(function (res) {
      if (mine !== token || !S || res.status === 401) return;
      if (res.status === 404) { unavailable(); return; }
      if (!res.ok) { failedPanel(res.status === 403 ? msgOf(res, "") : ""); return; }
      S.conn = res.data; S.replacing = false; render(); setNav(true);
      if (then) then();
    });
  }
  function setNav(on) { Array.prototype.forEach.call(document.querySelectorAll("[data-meta-nav]"), function (n) { n.hidden = !on; }); }
  /* The tab stays hidden until the API shows the Meta Pixel is open for this site (a 404 means the switch is off). */
  function probe() {
    D.call("GET", "/sites/", null, true).then(function (res) {
      if (res.status === 401) return;
      var sites = res.ok ? D.sitesOf(res) : [];
      if (!sites.length) return;
      var site = D.siteFromQuery(sites.map(function (s) { return s.id; }));
      D.call("GET", "/sites/" + site + "/meta/", null, true).then(function (r) { if (r.ok) setNav(true); });
    });
  }

  function card(id, title, chip) {
    var s = h("section", "pm-card"); s.setAttribute("aria-labelledby", "pm-h-" + id);
    var t = h("h2", "pm-h2", title); t.setAttribute("id", "pm-h-" + id);
    add(s, add(h("div", "pm-head"), t, chip ? h("span", "chip chip-" + chip[0], chip[1]) : null));
    return s;
  }
  function failedPanel(extra) {
    var root = clear(byId("mp-root")); root.removeAttribute("aria-busy");
    var s = card("err", "We couldn’t load your Meta Pixel settings");
    s.setAttribute("role", "alert");
    add(s, h("p", "pm-lead", extra || "Check your connection and try again. Nothing was changed."), btn("Try again", "ghost", show));
    root.appendChild(s);
    setNav(false);
  }
  function unavailable() {
    var root = clear(byId("mp-root")); root.removeAttribute("aria-busy");
    root.appendChild(add(card("off", "The Meta Pixel is not available yet"), h("p", "pm-lead", "It is not open for this site right now. Nothing is wrong with your account.")));
    setNav(false);
  }

  /* ---------- render ---------- */

  /* One labelled field. `secret` wraps the box in the .pm-secret holder. The field's error line is kept on the input (pmErr). */
  function field(id, label, input, hint, secret, tipText) {
    var w = h("div", "pm-field"), lab = h("label", "pm-label", label), err = h("p", "pm-error"), box = input, head = lab;
    if (tipText) { /* the "?" sits beside the label, not inside it */
      var q = h("button", "bl-tip", "?");
      q.setAttribute("type", "button"); q.setAttribute("aria-label", "About " + label.toLowerCase() + ": " + tipText); q.setAttribute("data-tip", tipText);
      head = add(h("div", "pm-label-row"), lab, q);
    }
    lab.setAttribute("for", id); input.setAttribute("id", id); err.setAttribute("id", id + "-err"); err.hidden = true;
    input.pmErr = err;
    var tip = hint ? h("p", "pm-hint", hint) : null;
    if (tip) { tip.setAttribute("id", id + "-hint"); input.setAttribute("aria-describedby", id + "-hint"); input.setAttribute("data-hint", id + "-hint"); }
    if (secret) { box = h("div", "pm-secret"); box.appendChild(input); }
    return add(w, head, box, tip, err);
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
      var box = byId("mp-" + k);
      if (box) { var m = fields[k]; markBad(box, String(m instanceof Array ? m[0] : m)); if (!first) first = box; }
    });
    if (first) first.focus();
    return !!first;
  }

  function render() {
    var root = clear(byId("mp-root")); root.removeAttribute("aria-busy");
    var c = S.conn, saved = !!c.token_set, tokenBox = !saved || S.replacing;
    var s = card("conn", "Meta Pixel and Conversions API", chipOf(c));
    add(s, h("p", "pm-lead", "Add your Pixel ID to measure visits to your store in Meta. Add an access token to also send the same events from our server."));
    var pixel = input("text", "pixel_id", { inputmode: "numeric", maxlength: "20" });
    if (c.pixel_id) pixel.value = c.pixel_id; else pixel.setAttribute("placeholder", "For example 123456789012345");
    var code = input("text", "test_event_code", { maxlength: "32" });
    if (c.test_event_code) code.value = c.test_event_code; else code.setAttribute("placeholder", "For example TEST12345");
    var codeField = field("mp-test_event_code", "Test event code", code, null, false, CODE_TIP);
    add(s, add(h("div", "pm-row"), field("mp-pixel_id", "Pixel ID", pixel), codeField));
    var tk = null;
    if (tokenBox) {
      tk = input("password", "access_token", { maxlength: "800", placeholder: saved ? "Paste a new token from Events Manager" : "Paste the token from Events Manager" });
      s.appendChild(field("mp-access_token", saved ? "New access token" : "Access token", tk, saved ? null : "We keep the token safe and never show it again after you save.", true));
    } else {
      var row = h("div", "pm-field"), lab2 = h("span", "pm-label", "Access token"); lab2.setAttribute("id", "mp-tk-l");
      var box = h("div", "mk-saved"); box.setAttribute("aria-labelledby", "mp-tk-l");
      var txt = h("span", "mk-saved-text"); add(txt, lockIcon(), document.createTextNode("Saved"));
      var replace = btn("Replace", "ghost", function () { S.replacing = true; render(); var t = byId("mp-access_token"); if (t) t.focus(); });
      var remove = btn("Remove", "danger", removeToken);
      replace.classList.add("mk-small"); remove.classList.add("mk-small");
      add(box, txt, add(h("span", "mk-saved-actions"), replace, remove));
      add(row, lab2, box, h("p", "pm-hint", "The token is never shown again. To change it, replace it."));
      s.appendChild(row);
    }
    if (c.last_test) {
      var good = c.last_test.outcome === "ok", when = whenText(c.last_test.at, new Date());
      var t = h("div", "mk-test " + (good ? "mk-test-ok" : "mk-test-bad")); t.setAttribute("role", good ? "status" : "alert");
      add(t, h("span", "chip " + (good ? "chip-ok" : "chip-danger"), good ? "Test passed" : "Test failed"), h("span", "", testText(c.last_test.outcome) + (when ? " Last checked " + when + "." : "")));
      s.appendChild(t);
    }
    var actions = h("div", "pm-actions"), testBtn = btn("Test connection", "ghost", test);
    if (!canTest(c)) testBtn.disabled = true;
    add(actions, btn("Save", "primary", function (b) { save(b, pixel, code, tk); }), testBtn);
    if (S.replacing) add(actions, btn("Cancel", "ghost", function () { S.replacing = false; render(); }));
    s.appendChild(actions);
    add(root, s, eventsCard(c.events || []));
  }
  function eventsCard(events) {
    var s = card("events", "Last events"), now = new Date();
    if (!events.length) return add(s, h("p", "pm-meta", "No events yet. They appear here once visitors use your store."));
    var ul = h("ul", "mp-events");
    events.forEach(function (e) {
      var li = h("li", "mp-event");
      add(li, h("span", "mp-event-name", String(e.event_name)), h("span", "chip chip-" + (e.outcome === "sent" ? "ok" : e.outcome === "failed" ? "danger" : "neutral"), eventText(e.outcome)));
      if (e.is_test) add(li, h("span", "chip chip-neutral", "Test"));
      add(li, h("span", "mp-event-id", String(e.event_id)), h("span", "mp-event-when", whenText(e.created_at, now)));
      ul.appendChild(li);
    });
    return add(s, ul);
  }

  /* ---------- actions ---------- */

  function save(b, pixel, code, tk) {
    var mine = token, bad = false, body = {};
    var pe = pixelError(pixel.value), ce = codeError(code.value);
    if (pe) { markBad(pixel, pe); bad = true; } else { markOk(pixel); body.pixel_id = pixel.value.trim(); }
    if (ce) { markBad(code, ce); bad = true; } else { markOk(code); body.test_event_code = code.value.trim(); }
    if (tk && tk.value.trim()) {
      var te = tokenError(tk.value);
      if (te) { markBad(tk, te); bad = true; } else { markOk(tk); body.access_token = tk.value.trim(); }
    }
    if (bad) { (pe ? pixel : ce ? code : tk).focus(); return; }
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
      D.toast("Saved", "Your Meta Pixel settings were saved."); say("Saved.");
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
  function removeToken(b) {
    if (b.getAttribute("data-confirm") !== "true") { b.setAttribute("data-confirm", "true"); b.textContent = "Confirm remove"; return; }
    var mine = token; busy(b, true);
    D.call("DELETE", base() + "token/", null, true).then(function (res) {
      if (res.status === 401 || mine !== token || !S) return;
      busy(b, false);
      if (!res.ok) { D.toast("That did not work", msgOf(res, "We could not remove the token. Please try again."), "error"); return; }
      S.conn = res.data; S.replacing = false; render(); D.toast("Removed", "Your access token was removed."); say("Token removed.");
    });
  }

  window.NOMetaPixel = { show: show, hide: hide, probe: probe, util: { whenText: whenText, testText: testText, eventText: eventText, chipOf: chipOf, pixelError: pixelError, codeError: codeError, tokenError: tokenError, canTest: canTest } };
})();
