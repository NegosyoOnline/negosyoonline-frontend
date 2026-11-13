/* The Settings page (ClickUp z8uq9mek62): two cards. Santé catalog owner (who the Santé catalog belongs to) and
   SMS settings (the stop switch and the two daily limits). Every change goes through a confirm dialog. The page
   decides nothing: the backend does, and a 404 means the feature is switched off on this server, so the card
   shows that and no controls. Nothing is stored in the browser. */
(function () {
  var H = window.NOHq, F = window.NOFin, $ = function (id) { return document.getElementById(id); };
  var MAX = 2147483647;
  var LOST = "That did not go through. Check the page before trying again.";
  var DIGITS = /^\d{1,10}$/;
  var known = false, busy = false, pendingAction = null, ownerRun = 0, smsRun = 0, ownerNow = null, smsNow = null, names = {};
  var dlg = F.dialogs(function () { return busy; });

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

  /* Who is signed in comes from me/, the staff route that answers it. */
  function start() {
    show("boot");
    if (known) { show("v-main"); loadOwner(""); loadSms(""); return; }
    H.call("GET", "me/").then(function (res) {
      if (F.left(res)) return;
      if (!res.ok) { show("v-down"); return; }
      known = true;
      window.NOHqShell.signedIn(res.data.email);
      show("v-main");
      loadOwner("");
      loadSms("");
    });
  }
  $("retry").addEventListener("click", start);
  start();
})();
