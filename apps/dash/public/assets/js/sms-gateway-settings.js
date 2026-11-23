/* SMS Gateway settings (ClickUp z8uq9mhk1k, /settings/sms-gateway/, sms-gateway-settings.js): the store's own Android phone.
   Reads GET /sites/{id}/sms-gateway/ and writes POST .../register/, .../rotate/ (a step-up code) and .../disable/. The API
   answers 404 while the line is not open for this store (the switches are off, billing is not serving, HQ disabled the line, or
   it is not a Santé site); then the tab stays hidden (probe) and the page says nothing about the feature. The phone's token comes
   back once, in the register and rotate answers: it is shown on the one-time screen, held in this script's memory only while that
   screen is open, and cleared when the screen closes or the page is left. It is never put in storage, an address, a title or a
   log. The server address shown next to it is the one the API sends, never a constant of this page. Every API string reaches the page
   through textContent or D.el only. Plain ES5. NOSmsGateway.util holds the pure helpers (tests/sms-gateway-settings.test.mjs). */
(function () {
  var D = window.NODash;
  var run = 0, S = null, closeDialog = null, tokenValue = "", tokenOpen = false, copyTimer = null;
  var CODE_RE = /^\d{6}$/;
  var STATES = {
    no_phone: ["neutral", "No phone", "No phone is paired yet."],
    waiting: ["info", "Waiting for phone", "Enter the token in the Android app. This turns to Connected after its first check-in."],
    connected: ["ok", "Connected", ""],
    offline: ["warn", "Offline", ""],
    disabled: ["neutral", "Disabled", "This phone is switched off. Pair a new phone to use the line again."]
  };

  function byId(id) { return document.getElementById(id); }
  function h(tag, cls, text) { return D.el(tag, cls ? { "class": cls } : {}, text); }
  function add(parent) { for (var i = 1; i < arguments.length; i++) { if (arguments[i]) parent.appendChild(arguments[i]); } return parent; }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  function say(text) { var l = byId("sg-live"); if (l) l.textContent = text; }
  function msgOf(res, fallback) { var m = res && res.data && res.data.message; return typeof m === "string" && m ? m : fallback; }
  function codeOf(res) { return res && res.data && res.data.code; }
  function base() { return "/sites/" + S.site + "/sms-gateway/"; }
  function btn(label, kind, fn) {
    var b = h("button", "no-btn " + (kind === "primary" ? "no-btn-primary" : "no-btn-ghost") + (kind === "danger" ? " sg-danger" : ""), label);
    b.setAttribute("type", "button");
    if (fn) b.addEventListener("click", function () { fn(b); });
    return b;
  }
  function busy(b, on) { if (!b) return; if (on) { b.setAttribute("aria-busy", "true"); b.disabled = true; } else { b.removeAttribute("aria-busy"); b.disabled = false; } }
  function block(b) { b.className += " sg-block"; return b; }

  /* ---------- pure helpers ---------- */

  function ago(iso, now) {
    var t = iso ? new Date(iso).getTime() : NaN;
    if (isNaN(t)) return "";
    var s = Math.max(0, Math.round((now.getTime() - t) / 1000));
    if (s < 60) return s + (s === 1 ? " second ago" : " seconds ago");
    var m = Math.floor(s / 60);
    if (m < 60) return m + (m === 1 ? " minute ago" : " minutes ago");
    var hr = Math.floor(m / 60);
    if (hr < 48) return hr + (hr === 1 ? " hour ago" : " hours ago");
    return Math.floor(hr / 24) + " days ago";
  }
  /* The state the card shows. A missing device is no_phone. */
  function stateOf(device) {
    if (!device || typeof device !== "object") return "no_phone";
    var c = device.connection;
    if (Object.prototype.hasOwnProperty.call(STATES, c)) return c;
    return device.enabled === false ? "disabled" : "no_phone";
  }
  /* The address worth showing: an origin the API sent, or empty. */
  function addressOf(data) {
    var a = data && typeof data.server_address === "string" ? data.server_address.trim() : "";
    return /^https?:\/\/[^\s]+$/.test(a) ? a : "";
  }
  function codeError(v) { return CODE_RE.test(String(v || "").trim()) ? "" : "Enter the 6-digit code."; }
  /* The channels a step-up code can go to: those the account page names, else email. */
  function channelsOf(account) {
    var list = account && Array.isArray(account.step_up_channels) ? account.step_up_channels.filter(function (c) { return c === "email" || c === "mobile"; }) : [];
    return list.length ? list : ["email"];
  }
  function maskedEmail(email) {
    var m = /^([^@]{1,})@(.+)$/.exec(String(email || ""));
    return m ? m[1].charAt(0) + "••••@" + m[2] : "your email";
  }
  function channelText(channel, account) {
    var mobile = account && account.mobile && typeof account.mobile.mobile_masked === "string" ? account.mobile.mobile_masked : "";
    return channel === "mobile" ? (mobile || "your mobile") : maskedEmail(account && account.email);
  }
  var REFUSED = {
    phone_exists: "Your store already has a phone.",
    phone_disabled: "This phone is switched off. Pair a new phone instead.",
    no_phone: "No phone is paired yet.",
    rate_limited: "Too many tries. Wait a little and try again."
  };
  function refusedText(res, fallback) {
    var c = codeOf(res);
    return Object.prototype.hasOwnProperty.call(REFUSED, c) ? REFUSED[c] : fallback;
  }

  /* The dialog shell: focus stays inside, Escape and Cancel close it, a click on the backdrop does nothing. */
  function dialog(id, titleText, opener, fill, modal) {
    if (closeDialog) closeDialog(false);
    var slot = byId("sg-dialog-slot"), overlay = h("div", "sg-overlay"), dlg = h("div", "sg-dialog");
    dlg.setAttribute("role", "dialog"); dlg.setAttribute("aria-modal", "true"); dlg.setAttribute("aria-labelledby", "sg-h-" + id);
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); if (!modal) close(true); return; }
      if (e.key !== "Tab") return;
      var items = Array.prototype.filter.call(dlg.querySelectorAll("input, button, textarea"), function (n) { return !n.disabled; });
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
    fill(dlg, close, titleText);
    add(slot, add(overlay, dlg));
    document.addEventListener("keydown", onKey);
    return close;
  }
  function title(text, id) { var t = h("h2", "sg-h2", text); t.setAttribute("id", "sg-h-" + id); return t; }
  function errBox() { var e = h("p", "sg-error"); e.setAttribute("role", "alert"); e.hidden = true; return e; }
  function showErr(box, text) { box.textContent = text; box.hidden = !text; }
  function focusFirst() { var g = byId("sg-dialog-slot").querySelector("button, input"); if (g && g.focus) g.focus(); }

  /* The one-time token screen. */
  function copyText(text, button, done) {
    if (navigator.clipboard) { navigator.clipboard.writeText(text).then(done, function () {}); return; }
    var area = D.el("textarea", { readonly: "readonly", "aria-hidden": "true", "class": "sg-hidden-copy" }, text);
    document.body.appendChild(area); area.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    document.body.removeChild(area); if (button && button.focus) button.focus();
    if (ok) done();
  }
  function flash(b, label) {
    b.textContent = "Copied"; say(label);
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(function () { b.textContent = "Copy"; }, 2500);
  }
  function showToken(value, address, opener) {
    tokenValue = value; tokenOpen = true;
    dialog("token", "Your phone’s token", opener, function (dlg, close, titleText) {
      var lead = h("p", "sg-lead", "Shown once. We keep only a one-way hash. If you lose it, rotate the token."), field = h("div", "sg-field");
      var lab = h("label", "sg-label", "Token"), input = D.el("input", { id: "sg-token", "class": "sg-input sg-mono", type: "text", readonly: "readonly", autocomplete: "off", spellcheck: "false" });
      input.value = tokenValue; lab.setAttribute("for", "sg-token");
      input.addEventListener("focus", function () { if (input.select) input.select(); });
      var row = h("div", "sg-copyrow"), copy = btn("Copy", "ghost", function (b) { copyText(tokenValue, b, function () { flash(b, "Token copied."); }); });
      copy.setAttribute("id", "sg-token-copy");
      add(field, lab, input); add(row, copy);
      var steps = h("section", "sg-steps"), ol = h("ol", "sg-list"), li2 = h("li", "", "Enter the server address: ");
      if (address) {
        var ac = btn("Copy", "ghost", function (b) { copyText(address, b, function () { flash(b, "Server address copied."); }); });
        ac.className += " sg-small";
        add(li2, h("strong", "sg-mono", address), ac);
      } else add(li2, h("strong", "", "Server address is not set. Do not enter a token yet."));
      add(ol, h("li", "", "Open the NegosyoOnline Gateway app, then Settings."), li2, h("li", "", "Type or paste the token."),
        h("li", "", "Save, then switch the gateway on."), h("li", "", "Come back here. The status turns Connected within a minute."));
      add(steps, h("h3", "sg-h3", "Set up the Android app"), ol);
      var done = block(btn("Done", "primary", function () { endToken(close); }));
      done.setAttribute("id", "sg-token-done");
      add(dlg, title(titleText, "token"), lead, field, row, steps, done);
    }, true);
    var f = byId("sg-token-copy"); if (f && f.focus) f.focus();
    say("Your phone’s token is on screen. It is shown once.");
  }
  function endToken(close) {
    var box = byId("sg-token"); if (box) box.value = "";
    tokenValue = ""; tokenOpen = false;
    if (copyTimer) { clearTimeout(copyTimer); copyTimer = null; }
    close(false);
    say("");
    if (S) read(run, null);
  }

  function show() {
    var mine = ++run, root = clear(byId("sg-root")); S = { site: null, data: null };
    root.setAttribute("aria-busy", "true");
    add(root, h("p", "sg-meta", "Loading your SMS gateway…"));
    D.call("GET", "/sites/", null, true).then(function (res) {
      if (mine !== run || res.status === 401) return;
      var sites = res.ok ? D.sitesOf(res) : [];
      if (!res.ok) { failedPanel(); return; }
      if (!sites.length) { unavailable(); return; }
      S.site = D.siteFromQuery(sites.map(function (s) { return s.id; }));
      read(mine, null);
    });
  }
  function hide() {
    run++; S = null; say("");
    var tb = byId("sg-token"); if (tb) tb.value = "";
    tokenValue = ""; tokenOpen = false;
    if (closeDialog) closeDialog(false);
    var r = byId("sg-root"); if (r) clear(r);
  }
  function read(mine, then) {
    D.call("GET", base(), null, true).then(function (res) {
      if (mine !== run || !S || res.status === 401) return;
      if (res.status === 404) { unavailable(); return; }
      if (!res.ok) { failedPanel(); return; }
      S.data = res.data || {}; render(); setNav(true);
      if (then) then();
    });
  }
  function setNav(on) { Array.prototype.forEach.call(document.querySelectorAll("[data-sms-gateway-nav]"), function (n) { n.hidden = !on; }); }
  /* The tab stays hidden until the API answers 200 for this store. Any other answer, a 404 above all, leaves it hidden. */
  function probe() {
    D.call("GET", "/sites/", null, true).then(function (res) {
      if (res.status === 401) return;
      var sites = res.ok ? D.sitesOf(res) : [];
      if (!sites.length) return;
      var site = D.siteFromQuery(sites.map(function (s) { return s.id; }));
      D.call("GET", "/sites/" + site + "/sms-gateway/", null, true).then(function (r) { if (r.ok) setNav(true); });
    });
  }

  function card(id, titleText, chip) {
    var s = h("section", "sg-card"); s.setAttribute("aria-labelledby", "sg-h2-" + id);
    var t = h("h2", "sg-h2", titleText); t.setAttribute("id", "sg-h2-" + id);
    add(s, add(h("div", "sg-head"), t, chip ? h("span", "chip chip-" + chip[0], chip[1]) : null));
    return s;
  }
  function failedPanel() {
    var root = clear(byId("sg-root")); root.removeAttribute("aria-busy");
    var s = card("err", "We couldn’t load your SMS gateway");
    s.setAttribute("role", "alert");
    add(s, h("p", "sg-lead", "Check your connection and try again. Nothing was changed."), btn("Try again", "ghost", show));
    root.appendChild(s);
    setNav(false);
  }
  function unavailable() {
    var root = clear(byId("sg-root")); root.removeAttribute("aria-busy");
    root.appendChild(add(card("off", "SMS Gateway is not available"), h("p", "sg-lead", "It is not open for your store right now.")));
    setNav(false);
  }

  function fact(dl, label, value, mono) {
    if (!value) return;
    add(dl, add(h("div", "sg-fact"), h("dt", "", label), h("dd", mono ? "sg-mono" : "", value)));
  }
  function render() {
    var root = clear(byId("sg-root")), d = S.data, device = d.device && typeof d.device === "object" ? d.device : null, key = stateOf(device), st = STATES[key];
    root.removeAttribute("aria-busy");
    var address = addressOf(d), s = card("phone", "Your store’s phone", [st[0], st[1]]), when = device ? ago(device.last_poll_at, new Date()) : "";
    add(s, h("p", "sg-lead", "Your store’s texts go out from your own Android phone and SIM, through your own carrier. Install the NegosyoOnline Gateway app, pair it here, and keep it on and online."));
    if (key === "connected") add(s, h("p", "sg-meta", "Last check-in " + (when || "just now") + "."));
    else if (key === "offline") add(s, h("p", "sg-meta", (when ? "Last check-in " + when + ". " : "") + "Your store’s texts are refused until your phone is back."));
    else if (st[2]) add(s, h("p", "sg-meta", st[2]));
    var dl = h("dl", "sg-facts");
    fact(dl, "Server address", address, true);
    if (device && key !== "no_phone" && key !== "disabled") {
      fact(dl, "App version", typeof device.app_version === "string" ? device.app_version : "");
      if (typeof device.battery === "number") fact(dl, "Battery", device.battery + "%" + (device.charging === true ? ", charging" : ""));
    }
    if (dl.firstChild) s.appendChild(dl);
    if (!address) add(s, h("p", "sg-warn", "Server address is not set. Do not enter a token yet."));
    var actions = h("div", "sg-actions");
    if (key === "no_phone" || key === "disabled") add(actions, btn("Pair my phone", "primary", function (b) { openRegister(b); }));
    else add(actions, btn("Rotate token", "ghost", function (b) { openRotate(b); }), btn("Disable phone", "danger", function (b) { openDisable(b); }));
    add(actions, btn("Refresh", "ghost", function (b) { busy(b, true); read(run, null); }));
    s.appendChild(actions);
    root.appendChild(s);
  }

  function openRegister(opener) {
    dialog("register", "Pair my phone?", opener, function (dlg, shut, titleText) {
      var err = errBox(), go = block(btn("Pair phone", "primary", null)), cancel = block(btn("Cancel", "ghost", function () { shut(true); }));
      go.addEventListener("click", function () {
        showErr(err, ""); busy(go, true);
        var mine = run;
        D.call("POST", base() + "register/", null, true).then(function (res) {
          if (res.status === 401 || mine !== run || !S) return;
          busy(go, false);
          if (res.ok && res.data && typeof res.data.token === "string" && res.data.token) { var a = addressOf(res.data); shut(false); showToken(res.data.token, a, opener); return; }
          if (res.status === 404) { shut(false); unavailable(); return; }
          if (codeOf(res) === "phone_exists") { shut(false); read(mine, null); return; }
          showErr(err, refusedText(res, "We could not pair the phone. Please try again."));
        });
      });
      add(dlg, title(titleText, "register"), h("p", "sg-lead", "We make a token for your phone. You enter it in the Android app. It is shown once."), err, go, cancel);
    }, false);
    focusFirst();
  }

  function openDisable(opener) {
    dialog("disable", "Disable phone?", opener, function (dlg, shut, titleText) {
      var err = errBox(), go = block(btn("Disable phone", "danger", null)), cancel = block(btn("Cancel", "ghost", function () { shut(true); }));
      go.addEventListener("click", function () {
        showErr(err, ""); busy(go, true);
        var mine = run;
        D.call("POST", base() + "disable/", null, true).then(function (res) {
          if (res.status === 401 || mine !== run || !S) return;
          busy(go, false);
          if (res.ok) { shut(false); read(mine, function () { say("Phone disabled."); D.toast("Phone disabled", "Your store’s texts no longer go out from this phone."); }); return; }
          if (res.status === 404) { shut(false); unavailable(); return; }
          showErr(err, refusedText(res, "We could not disable the phone. Please try again."));
        });
      });
      add(dlg, title(titleText, "disable"), h("p", "sg-lead", "Your store’s texts stop going out from this phone, and its token stops working. You can pair a new phone later."), err, go, cancel);
    }, false);
    focusFirst();
  }

  /* Rotate: first a code to your email or mobile, then the code, a tick and Rotate. */
  function openRotate(opener) {
    dialog("rotate", "Rotate token?", opener, function (dlg, shut, titleText) {
      var step = { channel: "email", account: null };
      function stepA() {
        clear(dlg);
        var err = errBox(), send = block(btn("Send code", "primary", null)), cancel = block(btn("Cancel", "ghost", function () { shut(true); }));
        var channels = channelsOf(step.account), lead = h("p", "sg-lead");
        add(dlg, title(titleText, "rotate"));
        if (channels.length > 1) {
          lead.textContent = "To keep your account safe, we first send a 6-digit code. Where should we send it?";
          var group = h("div", "sg-radios"); group.setAttribute("role", "radiogroup"); group.setAttribute("aria-label", "Send the code to");
          channels.forEach(function (c, i) {
            var row = h("div", "sg-radio"), id = "sg-ch-" + c, r = D.el("input", { type: "radio", name: "sg-channel", id: id, value: c });
            if (c === step.channel || (i === 0 && channels.indexOf(step.channel) === -1)) { r.checked = true; step.channel = c; }
            r.addEventListener("change", function () { step.channel = c; });
            var lab = D.el("label", { "for": id }, c === "mobile" ? "Text my mobile " : "Email me ");
            add(lab, h("strong", "", channelText(c, step.account)));
            add(row, r, lab); group.appendChild(row);
          });
          add(dlg, lead, group);
        } else {
          step.channel = channels[0];
          add(lead, document.createTextNode("To keep your account safe, we first send a 6-digit code to "), h("strong", "", channelText(step.channel, step.account)), document.createTextNode("."));
          add(dlg, lead);
        }
        send.addEventListener("click", function () {
          showErr(err, ""); busy(send, true);
          var mine = run;
          D.call("POST", "/account/step-up/", { channel: step.channel, purpose: "sms_line_rotate" }, true).then(function (res) {
            if (res.status === 401 || mine !== run || !S) return;
            busy(send, false);
            if (res.ok) { stepB(); return; }
            if (res.status === 404) { showErr(err, "We cannot send a code right now. Please try again later."); return; }
            showErr(err, res.status === 429 ? "Too many codes asked for. Wait a little and try again." : msgOf(res, "We could not send the code. Please try again."));
          });
        });
        add(dlg, err, send, cancel);
        send.focus();
      }
      function stepB() {
        clear(dlg);
        var lead = h("p", "sg-lead", "The previous token stops working immediately. Your phone will not send until you enter the new one."), meta = h("p", "sg-meta");
        add(meta, document.createTextNode(step.channel === "mobile" ? "We texted a 6-digit code to " : "We sent a 6-digit code to "), h("strong", "", channelText(step.channel, step.account)), document.createTextNode("."));
        var field = h("div", "sg-field"), lab = h("label", "sg-label", "Code");
        var input = D.el("input", { id: "sg-code", "class": "sg-input sg-mono", type: "text", inputmode: "numeric", maxlength: "6", autocomplete: "one-time-code", pattern: "[0-9]*" });
        lab.setAttribute("for", "sg-code");
        input.addEventListener("input", function () { var v = String(input.value || "").replace(/\D/g, "").slice(0, 6); if (v !== input.value) input.value = v; });
        var ack = h("div", "sg-check"), box = D.el("input", { type: "checkbox", id: "sg-ack" }), al = h("label", "sg-label", "I understand");
        al.setAttribute("for", "sg-ack");
        add(ack, box, al);
        var err = errBox(), go = block(btn("Rotate token", "primary", null)), again = block(btn("Send a new code", "ghost", function () { stepA(); })), cancel = block(btn("Cancel", "ghost", function () { shut(true); }));
        go.addEventListener("click", function () {
          showErr(err, ""); input.removeAttribute("aria-invalid");
          var bad = codeError(input.value);
          if (bad) { showErr(err, bad); input.setAttribute("aria-invalid", "true"); input.focus(); return; }
          if (!box.checked) { showErr(err, "Tick “I understand” to rotate the token."); return; }
          busy(go, true);
          var mine = run;
          D.call("POST", base() + "rotate/", { step_up_code: String(input.value).trim() }, true).then(function (res) {
            if (res.status === 401 || mine !== run || !S) return;
            busy(go, false); input.value = "";
            if (res.ok && res.data && typeof res.data.token === "string" && res.data.token) { var a = addressOf(res.data); shut(false); showToken(res.data.token, a, opener); return; }
            if (res.status === 404) { shut(false); unavailable(); return; }
            if (codeOf(res) === "step_up_required") { showErr(err, "That code is wrong or has expired. Ask for a new one."); input.setAttribute("aria-invalid", "true"); return; }
            if (codeOf(res) === "phone_disabled" || codeOf(res) === "no_phone") { shut(false); read(mine, null); return; }
            showErr(err, refusedText(res, "We could not rotate the token. Please try again."));
          });
        });
        add(dlg, title(titleText, "rotate"), lead, meta, add(field, lab, input), ack, err, go, again, cancel);
        input.focus();
      }
      add(dlg, title(titleText, "rotate"), h("p", "sg-meta", "One moment…"));
      D.call("GET", "/account/", null, true).then(function (res) {
        if (!S || closeDialog !== shut) return;
        if (res.ok) step.account = res.data;
        stepA();
      });
    }, false);
  }

  window.NOSmsGateway = { show: show, hide: hide, probe: probe,
    util: { ago: ago, stateOf: stateOf, addressOf: addressOf, codeError: codeError, channelsOf: channelsOf, maskedEmail: maskedEmail, channelText: channelText, refusedText: refusedText, STATES: STATES } };
})();
