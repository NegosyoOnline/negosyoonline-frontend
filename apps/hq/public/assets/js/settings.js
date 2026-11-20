/* The Settings page (ClickUp z8uq9mek62): three cards. Santé catalog owner (who the Santé catalog belongs to),
   SMS settings (the stop switch and the two daily limits) and SMS Gateway (the platform phone, ClickUp z8uq9mh7pq;
   its token is shown once and never stored). Every change goes through a confirm dialog. The page
   decides nothing: the backend does, and a 404 means the feature is switched off on this server, so the card
   shows that and no controls. Nothing is stored in the browser. */
(function () {
  var H = window.NOHq, F = window.NOFin, $ = function (id) { return document.getElementById(id); };
  var MAX = 2147483647;
  var LOST = "That did not go through. Check the page before trying again.";
  var DIGITS = /^\d{1,10}$/;
  var known = false, busy = false, tokenOpen = false, gwRun = 0, gwNow = null, gwMode = "", token = "", afterToken = null, pendingAction = null, ownerRun = 0, smsRun = 0, ownerNow = null, smsNow = null, names = {};
  /* Escape closes nothing while a call is on its way or the one-time token is on screen. */
  var dlg = F.dialogs(function () { return busy || tokenOpen; });

  function show(view) { ["boot", "v-main", "v-down"].forEach(function (id) { $(id).hidden = id !== view; }); }
  /* One card shows one of: loading, off, down, body. */
  function card(p, state) {
    [["load", "load"], ["off", "off"], ["down", "down"], ["body", "body"]].forEach(function (s) { $(p + "-" + s[0]).hidden = state !== s[1]; });
  }
  /* The first message under a field's refusal, or "". */
  function first(fields, key) {
    var v = fields && fields[key];
    return Array.isArray(v) && typeof v[0] === "string" ? v[0] : typeof v === "string" ? v : "";
  }
  /* A whole number from 0 to 2147483647, typed as digits, or null. */
  function whole(text) {
    var t = String(text == null ? "" : text).trim(), n;
    if (!DIGITS.test(t)) return null;
    n = Number(t);
    return n <= MAX ? n : null;
  }

  /* ---- the confirm dialog ---- */

  function ask(opener, title, sub, go, run) {
    $("m-confirm-h").textContent = title;
    $("m-confirm-sub").textContent = sub;
    $("confirm-go").textContent = go;
    F.say("confirm-err", "");
    pendingAction = run;
    dlg.open("m-confirm", opener, $("confirm-cancel"));
  }
  function lock(on) {
    busy = on;
    ["confirm-go", "confirm-x", "confirm-cancel"].forEach(function (id) { $(id).disabled = on; });
  }
  ["confirm-x", "confirm-cancel"].forEach(function (id) {
    $(id).addEventListener("click", function () { if (!busy) { pendingAction = null; dlg.close(true); } });
  });
  $("confirm-go").addEventListener("click", function () {
    if (busy || !pendingAction) return;
    lock(true);
    pendingAction().then(function (done) {
      lock(false);
      if (done) { pendingAction = null; dlg.close(false); }
    });
  });

  /* ---- Santé catalog owner ---- */

  function paintOwner(d) {
    var cands = Array.isArray(d.candidates) ? d.candidates.filter(function (c) { return c && typeof c.id === "string" && typeof c.name === "string"; }) : [];
    var owner = d.owner && typeof d.owner.id === "string" ? d.owner : null, sel = $("o-site"), o;
    ownerNow = owner;
    names = {};
    $("o-name").textContent = owner ? owner.name : "No catalog owner";
    $("o-pid").textContent = owner ? owner.id : "";
    $("o-pid").hidden = !owner;
    sel.textContent = "";
    o = F.el("option", "", "Choose a site");
    o.setAttribute("value", "");
    sel.appendChild(o);
    cands.forEach(function (c) {
      var opt = F.el("option", "", c.name);
      opt.setAttribute("value", c.id);
      sel.appendChild(opt);
      names[c.id] = c.name;
    });
    sel.value = owner && cands.some(function (c) { return c.id === owner.id; }) ? owner.id : "";
    $("o-clear").disabled = !owner;
    F.say("o-err", "");
    sel.removeAttribute("aria-invalid");
  }

  function loadOwner(message) {
    var run = ++ownerRun;
    card("o", "load");
    return H.call("POST", "sante/owner/get/", {}).then(function (res) {
      if (run !== ownerRun) return;
      if (F.left(res)) return;
      if (res.status === 404) { card("o", "off"); return; }
      if (!res.ok) { card("o", "down"); return; }
      paintOwner(res.data);
      F.say("o-msg", message || "");
      card("o", "body");
    });
  }

  /* Sends the owner change from the dialog. Resolves true when the dialog may close. */
  function sendOwner(site, message) {
    return H.call("POST", "sante/owner/set/", { site: site }).then(function (res) {
      if (F.left(res)) return true;
      if (res.ok) { paintOwner(res.data); F.say("o-msg", message); return true; }
      if (res.status === 404) { card("o", "off"); return true; }
      if (res.status === 400 && res.code === "invalid_request") {
        var m = first(res.fields, "site") || "Check the site and try again.";
        F.say("o-err", m);
        $("o-site").setAttribute("aria-invalid", "true");
        return true;
      }
      F.say("confirm-err", LOST);
      return false;
    });
  }

  $("o-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy) return;
    var site = $("o-site").value, name;
    F.say("o-msg", "");
    $("o-site").removeAttribute("aria-invalid");
    if (!site) { F.say("o-err", "Choose a site."); $("o-site").setAttribute("aria-invalid", "true"); return; }
    F.say("o-err", "");
    name = Object.prototype.hasOwnProperty.call(names, site) ? names[site] : "this site";
    ask($("o-save"), "Change the catalog owner?", "The Santé catalog will belong to " + name + ".", "Save owner",
      function () { return sendOwner(site, "Catalog owner saved."); });
  });
  $("o-clear").addEventListener("click", function () {
    if (busy || !ownerNow) return;
    F.say("o-msg", "");
    F.say("o-err", "");
    ask($("o-clear"), "Clear the catalog owner?", "The Santé catalog will have no owner.", "Clear owner",
      function () { return sendOwner(null, "Catalog owner cleared."); });
  });
  $("o-retry").addEventListener("click", function () { loadOwner(""); });

  /* ---- SMS settings ---- */

  var SMS_FIELDS = [["platform_daily_limit", "s-platform", "s-platform-err"], ["site_daily_limit", "s-site", "s-site-err"],
    ["sending_stopped", "s-stop", "s-stop-err"]];
  function clearSmsErrors() {
    SMS_FIELDS.forEach(function (f) { F.say(f[2], ""); $(f[1]).removeAttribute("aria-invalid"); });
    F.say("s-err", "");
  }
  function paintSms(d) {
    smsNow = d;
    $("s-stop").checked = d.sending_stopped === true;
    $("s-platform").value = typeof d.platform_daily_limit === "number" ? String(d.platform_daily_limit) : "";
    $("s-site").value = typeof d.site_daily_limit === "number" ? String(d.site_daily_limit) : "";
    var when = F.stamp(d.updated_at);
    F.say("s-when", when ? "Last changed " + when + "." : "");
    clearSmsErrors();
  }
  function loadSms(message) {
    var run = ++smsRun;
    card("s", "load");
    return H.call("POST", "sms/policy/get/", {}).then(function (res) {
      if (run !== smsRun) return;
      if (F.left(res)) return;
      if (res.status === 404) { card("s", "off"); return; }
      if (!res.ok) { card("s", "down"); return; }
      paintSms(res.data);
      F.say("s-msg", message || "");
      card("s", "body");
    });
  }
  function sendSms(body) {
    return H.call("POST", "sms/policy/set/", body).then(function (res) {
      if (F.left(res)) return true;
      if (res.ok) { paintSms(res.data); F.say("s-msg", "SMS settings saved."); return true; }
      if (res.status === 404) { card("s", "off"); return true; }
      if (res.status === 400 && res.code === "invalid_request") {
        var any = false;
        SMS_FIELDS.forEach(function (f) {
          var m = first(res.fields, f[0]);
          if (m) { any = true; F.say(f[2], m); $(f[1]).setAttribute("aria-invalid", "true"); }
        });
        if (!any) F.say("s-err", "Check the values and try again.");
        return true;
      }
      F.say("confirm-err", LOST);
      return false;
    });
  }
  $("s-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy) return;
    var p = whole($("s-platform").value), s = whole($("s-site").value), stopped = $("s-stop").checked, bad = false;
    F.say("s-msg", "");
    clearSmsErrors();
    if (p === null) { bad = true; F.say("s-platform-err", "Enter a whole number from 0 to " + MAX + "."); $("s-platform").setAttribute("aria-invalid", "true"); }
    if (s === null) { bad = true; F.say("s-site-err", "Enter a whole number from 0 to " + MAX + "."); $("s-site").setAttribute("aria-invalid", "true"); }
    if (bad) return;
    var body = { sending_stopped: stopped, platform_daily_limit: p, site_daily_limit: s };
    if (stopped && !(smsNow && smsNow.sending_stopped === true)) {
      ask($("s-save"), "Stop all SMS sending?", "No SMS will be sent from the platform until sending is turned back on.", "Stop sending",
        function () { return sendSms(body); });
    } else {
      ask($("s-save"), "Save SMS settings?", "The new settings apply to all SMS sending.", "Save settings", function () { return sendSms(body); });
    }
  });
  $("s-retry").addEventListener("click", function () { loadSms(""); });

  /* ---- SMS Gateway: the platform phone ---- */

  var GW_STATES = {
    none: ["No phone", "chip-neutral", "No phone is registered for this server."],
    waiting: ["Waiting for phone", "chip-info", "Enter the token in the Android app. This turns to Connected after its first poll."],
    connected: ["Connected", "chip-ok", ""],
    offline: ["Offline", "chip-warn", ""],
    disabled: ["Disabled", "chip-neutral", "This phone is switched off and refused. Add a phone to replace it."]
  };
  var CONN = { connected: "connected", offline: "offline", waiting: "waiting", waiting_for_phone: "waiting", no_phone: "none", disabled: "disabled" };
  var CODE6 = /^\d{6}$/, NAME_OK = /^[a-z0-9-]{1,60}$/;
  var NAME_HELP = "Use 1 to 60 lower-case letters, numbers and hyphens, e.g. system.";
  var CODE_WAIT = " If you just signed in, wait for the next code (about 30 seconds).";
  var CODE_REFUSED = "That code was not accepted. Use the current code from your authenticator app.";

  function ago(iso) {
    var ms = Date.now() - new Date(iso).getTime(), n, u;
    if (isNaN(ms)) return "";
    ms = Math.max(0, ms);
    if (ms < 60000) return "just now";
    if (ms < 3600000) { n = Math.floor(ms / 60000); u = "minute"; }
    else if (ms < 86400000) { n = Math.floor(ms / 3600000); u = "hour"; }
    else { n = Math.floor(ms / 86400000); u = "day"; }
    return n + " " + u + (n === 1 ? "" : "s") + " ago";
  }
  /* The server's own word for the connection when this page knows it, else worked out from the last poll. */
  function gwState(dev) {
    var c, t;
    if (!dev) return "none";
    if (dev.enabled !== true) return "disabled";
    c = typeof dev.connection === "string" && Object.prototype.hasOwnProperty.call(CONN, dev.connection) ? CONN[dev.connection] : "";
    if (c) return c;
    t = typeof dev.last_poll_at === "string" ? new Date(dev.last_poll_at).getTime() : NaN;
    if (isNaN(t)) return "waiting";
    return Date.now() - t <= 60000 ? "connected" : "offline";
  }
  function gwAddr() { return gwNow && typeof gwNow.server_address === "string" ? gwNow.server_address.trim() : ""; }

  /* Copies text: the clipboard API where the browser offers it (https or localhost), else a hidden textarea. */
  function copyText(text, done, failed) {
    if (typeof navigator !== "undefined" && navigator && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(done, failed);
      return;
    }
    var area = F.el("textarea", "", text), ok = false;
    area.setAttribute("readonly", "readonly");
    area.setAttribute("aria-hidden", "true");
    area.setAttribute("style", "position:fixed;opacity:0");
    document.body.appendChild(area);
    area.select();
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    document.body.removeChild(area);
    if (ok) done(); else failed();
  }

  function paintGw(d) {
    var dev = d && d.device && typeof d.device === "object" ? d.device : null, st = gwState(dev), meta = GW_STATES[st], addr, note, poll, bits = [];
    gwNow = { server_address: d && typeof d.server_address === "string" ? d.server_address : "", device: dev };
    addr = gwAddr();
    $("g-chip").textContent = meta[0];
    $("g-chip").setAttribute("class", "chip " + meta[1]);
    $("g-chip").hidden = false;
    $("g-addr").textContent = addr || "Not configured";
    $("g-addr-copy").hidden = !addr;
    $("g-addr-copy").textContent = "Copy";
    $("g-name").textContent = dev && typeof dev.name === "string" && dev.name ? dev.name : "-";
    $("g-enabled").textContent = dev ? (dev.enabled === true ? "Yes" : "No") : "-";
    poll = dev && typeof dev.last_poll_at === "string" ? dev.last_poll_at : "";
    $("g-poll").textContent = poll && ago(poll) ? ago(poll) : dev ? "Never" : "-";
    $("g-poll-at").textContent = poll && ago(poll) ? F.stamp(poll) : "";
    $("g-incoming").textContent = dev ? (dev.forwards_incoming === true ? "On" : "Off") : "-";
    note = meta[2];
    if (dev && typeof dev.app_version === "string" && dev.app_version) bits.push("app version " + dev.app_version);
    if (dev && typeof dev.battery === "number") bits.push("battery " + Math.round(dev.battery) + "%" + (dev.charging === true ? " (charging)" : ""));
    if (st === "connected") note = (ago(poll) === "just now" ? "Last poll just now" : "Last poll " + ago(poll)) + (bits.length ? ", " + bits.join(", ") : "") + ".";
    if (st === "offline") note = "Last poll " + ago(poll) + ". Texts are being refused until the phone is back.";
    if (!addr) note += (note ? " " : "") + "The server address is not configured, so a token cannot be used yet.";
    $("g-note").textContent = note;
    /* A token is useless without an address, so Register and Rotate are not offered without one. */
    $("g-register").textContent = dev ? "Add phone" : "Register phone";
    $("g-register").hidden = (!!dev && dev.enabled === true) || !addr;
    $("g-rotate").hidden = !dev || dev.enabled !== true || !addr;
    $("g-disable").hidden = !dev || dev.enabled !== true;
  }
  function loadGw(message) {
    var run = ++gwRun;
    card("g", "load");
    $("g-chip").hidden = true;
    return H.call("POST", "sms/device/get/", {}).then(function (res) {
      if (run !== gwRun) return;
      if (F.left(res)) return;
      if (res.status === 404) { card("g", "off"); return; }
      if (!res.ok) { card("g", "down"); return; }
      paintGw(res.data);
      F.say("g-msg", message || "");
      card("g", "body");
    });
  }

  /* The dialog for register, rotate and disable. mode: "register" | "rotate" | "disable". */
  function gwLock(on) {
    busy = on;
    ["gw-go", "gw-x", "gw-cancel"].forEach(function (id) { $(id).disabled = on; });
  }
  function openGw(mode, opener) {
    var t = { register: ["Register phone", "This server has no platform phone yet. Name this one.", "Register phone"],
      rotate: ["Rotate token?", "The previous token stops working immediately. The phone will not send until you enter the new one.", "Rotate"],
      replace: ["Add phone", "This replaces the disabled phone. The old phone stays switched off. Enter a current code to confirm.", "Add phone"],
      disable: ["Disable phone?", "No texts will be sent until a phone is registered. Enter a current code to confirm.", "Disable phone"] }[mode];
    gwMode = mode;
    $("m-gw-h").textContent = t[0];
    $("m-gw-sub").textContent = t[1];
    $("gw-go").textContent = t[2];
    $("gw-name-field").hidden = mode !== "register" && mode !== "replace";
    $("gw-code-field").hidden = mode === "register";
    $("gw-ack-field").hidden = mode !== "rotate";
    $("gw-name").value = "";
    $("gw-code").value = "";
    $("gw-ack").checked = false;
    ["gw-name", "gw-code"].forEach(function (id) { $(id).removeAttribute("aria-invalid"); });
    F.say("gw-err", "");
    dlg.open("m-gw", opener, mode === "register" || mode === "replace" ? $("gw-name") : $("gw-code"));
  }
  function closeGw(refocus) {
    $("gw-code").value = "";
    gwMode = "";
    dlg.close(refocus);
  }

  function showToken(value) {
    var addr = gwAddr();
    token = value;
    tokenOpen = true;
    $("tk-token").value = value;
    F.say("tk-copied", "");
    $("tk-copy").textContent = "Copy";
    $("tk-addr").textContent = addr || "Not configured";
    $("tk-addr-copy").hidden = !addr;
    $("tk-addr-copy").textContent = "Copy";
    dlg.open("m-token", null, $("tk-copy"));
  }
  /* Done: the token leaves the field and this script's memory, then the card reads the phone again. */
  function endToken() {
    $("tk-token").value = "";
    token = "";
    tokenOpen = false;
    F.say("tk-copied", "");
    dlg.close(false);
    $("g-refresh").focus();
    if (afterToken) { paintGw(afterToken); afterToken = null; card("g", "body"); return Promise.resolve(); }
    return loadGw("");
  }
  $("tk-done").addEventListener("click", endToken);
  $("tk-copy").addEventListener("click", function () {
    if (!token) return;
    copyText(token, function () { $("tk-copy").textContent = "Copied"; F.say("tk-copied", "Token copied."); },
      function () { F.say("tk-copied", "Copy did not work. Select the token and copy it."); });
  });
  $("tk-addr-copy").addEventListener("click", function () {
    var addr = gwAddr();
    if (!addr) return;
    copyText(addr, function () { $("tk-addr-copy").textContent = "Copied"; F.say("tk-copied", "Server address copied."); },
      function () { F.say("tk-copied", "Copy did not work. Select the address and copy it."); });
  });
  $("g-addr-copy").addEventListener("click", function () {
    var addr = gwAddr();
    if (!addr) return;
    copyText(addr, function () { $("g-addr-copy").textContent = "Copied"; }, function () { F.say("g-msg", "Copy did not work. Select the address and copy it."); });
  });

  /* Sends the dialog's call. Resolves true when the dialog may close. The token is read from the answer once, handed
     to the one-time screen and dropped from the answer before anything is painted. */
  function sendGw(mode, body) {
    var route = { register: "sms/device/register/", replace: "sms/device/register/", rotate: "sms/device/rotate/", disable: "sms/device/disable/" }[mode];
    return H.call("POST", route, body).then(function (res) {
      var t;
      if (F.left(res)) return true;
      if (res.status === 404) { card("g", "off"); return true; }
      if (res.ok) {
        t = res.data && typeof res.data.token === "string" ? res.data.token : "";
        if (res.data) delete res.data.token;
        if (mode === "disable") {
          closeGw(false);
          if (res.data && res.data.device !== undefined) { paintGw(res.data); F.say("g-msg", "Phone disabled."); card("g", "body"); }
          else loadGw("Phone disabled.");
          return false;
        }
        if (!t) { closeGw(false); loadGw("The phone was changed but no token came back. Rotate to get one."); return false; }
        closeGw(false);
        afterToken = { server_address: typeof res.data.server_address === "string" ? res.data.server_address : gwNow ? gwNow.server_address : "",
          device: res.data.device && typeof res.data.device === "object" ? res.data.device : null };
        gwNow = afterToken;
        showToken(t);
        return false;
      }
      if (res.status === 409 && res.code === "phone_exists") { F.say("gw-err", "A phone is already registered."); loadGw(""); return false; }
      if (res.status === 409 && res.code === "name_taken") { F.say("gw-err", "That name is already in use."); $("gw-name").setAttribute("aria-invalid", "true"); return false; }
      if (res.status === 409 && res.code === "device_disabled") { F.say("gw-err", "This phone is disabled."); loadGw(""); return false; }
      if (res.code === "invalid_name" || (mode === "register" && res.status === 400) || (mode === "replace" && res.status === 400 && first(res.fields, "name"))) {
        F.say("gw-err", first(res.fields, "name") || res.message || NAME_HELP);
        $("gw-name").setAttribute("aria-invalid", "true");
        return false;
      }
      if (res.status === 403 && res.code === "reauth_failed") {
        F.say("gw-err", (res.message || CODE_REFUSED) + CODE_WAIT);
        $("gw-code").setAttribute("aria-invalid", "true");
        return false;
      }
      if (mode !== "register" && (res.status === 400 || res.status === 403)) { F.say("gw-err", CODE_REFUSED + CODE_WAIT); $("gw-code").setAttribute("aria-invalid", "true"); return false; }
      F.say("gw-err", LOST);
      return false;
    });
  }
  function submitGw() {
    var name, code, body, dev;
    if (busy || !gwMode) return;
    F.say("gw-err", "");
    ["gw-name", "gw-code"].forEach(function (id) { $(id).removeAttribute("aria-invalid"); });
    if (gwMode === "register" || gwMode === "replace") {
      name = $("gw-name").value.trim();
      if (!name) { F.say("gw-err", "Enter a name for the phone."); $("gw-name").setAttribute("aria-invalid", "true"); return; }
      if (!NAME_OK.test(name)) { F.say("gw-err", NAME_HELP); $("gw-name").setAttribute("aria-invalid", "true"); return; }
      body = { name: name, confirm: true };
      if (gwMode === "replace") {
        code = $("gw-code").value.trim();
        if (!CODE6.test(code)) { F.say("gw-err", "Enter the 6-digit code from your authenticator app."); $("gw-code").setAttribute("aria-invalid", "true"); return; }
        body.code = code;
      }
    } else {
      dev = gwNow && gwNow.device;
      code = $("gw-code").value.trim();
      if (!CODE6.test(code)) { F.say("gw-err", "Enter the 6-digit code from your authenticator app."); $("gw-code").setAttribute("aria-invalid", "true"); return; }
      if (gwMode === "rotate" && !$("gw-ack").checked) { F.say("gw-err", "Tick \"I understand\" to rotate the token."); return; }
      if (!dev) { F.say("gw-err", LOST); return; }
      body = { name: dev.name, code: code, confirm: true };
    }
    gwLock(true);
    sendGw(gwMode, body).then(function (done) { gwLock(false); if (done) closeGw(false); });
  }
  $("gw-go").addEventListener("click", submitGw);
  ["gw-x", "gw-cancel"].forEach(function (id) { $(id).addEventListener("click", function () { if (!busy) closeGw(true); }); });
  $("g-register").addEventListener("click", function () { if (!busy) openGw(gwNow && gwNow.device ? "replace" : "register", $("g-register")); });
  $("g-rotate").addEventListener("click", function () { if (!busy) openGw("rotate", $("g-rotate")); });
  $("g-disable").addEventListener("click", function () { if (!busy) openGw("disable", $("g-disable")); });
  $("g-refresh").addEventListener("click", function () { loadGw(""); });
  $("g-retry").addEventListener("click", function () { loadGw(""); });

  /* Who is signed in comes from me/, the staff route that answers it. */
  function start() {
    show("boot");
    if (known) { show("v-main"); loadOwner(""); loadSms(""); loadGw(""); return; }
    H.call("GET", "me/").then(function (res) {
      if (F.left(res)) return;
      if (!res.ok) { show("v-down"); return; }
      known = true;
      window.NOHqShell.signedIn(res.data.email);
      show("v-main");
      loadOwner("");
      loadSms("");
      loadGw("");
    });
  }
  $("retry").addEventListener("click", start);
  start();
})();
