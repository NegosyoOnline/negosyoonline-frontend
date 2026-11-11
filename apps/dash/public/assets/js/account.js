/* Account Settings (NegosyoOnline Onboarding Phase 4, ClickUp z8uq9mach9): the /account/ page.
   dashboard.js route() calls window.NOAccount.show() when the Account view is entered (spec D15); this file makes no
   request at boot or on another route. GET /account/ picks the page: writes_open true draws the scope notice and five
   cards; a 404 or writes_open false puts back today's read-only panel unchanged (S11, the node renderAccountPanel drew);
   anything else draws the load error (S10). The API keeps one name; U.view splits it into the two boxes the page shows
   and U.nameBody joins them again on save, the same rule app.js accountView uses for /me/. Plain ES5. API strings reach the page through D.el, textContent or
   input.value only; nothing is stored; an email or a code only travels in a JSON body, never a URL, a toast or a log.
   Revision 3 (spec 5.15): the Sign-in and security card lists the signed-in devices behind a collapsed disclosure with a
   full-width Sign out other devices button; the second card connects and disconnects Facebook and Google (a credentialed
   start that answers with the provider's address, then the provider in this tab); a return from the provider is read once from the address fragment, removed at
   once, and shown only as far as the read confirms it. */
(function () {
  var D = window.NODash, $ = function (id) { return document.getElementById(id); };
  var BUSINESS_SETTINGS_PATH = "/settings/business/"; /* spec D2: the one target of every Business Settings link (repointed by Phase 5) */
  var BILLING_PATH = "/settings/billing/";
  var SUPPORT_EMAIL = "support@negosyoonline.com";
  var NOTICES = [
    ["Security alerts", "Sign-in, email, mobile and connected account changes. Sent to your email."],
    ["Payment and billing notices", "Trial end, payment problems, cancellation and reactivation."],
    ["Statements and receipts", "Each statement and receipt is emailed to you."],
    ["Site status", "When a site is suspended, cancelled or removed."]
  ];
  var S = { s11: null, data: null, seq: 0, dlg: null, devices: false, ret: null, result: null }; /* memory only, never stored */
  var SEC_NOTE = "Changing your email signs you out on every other device, sends a notice to your old address and pauses further email changes for 24 hours. Changing your mobile sends a notice to your email.";
  var LABEL = { facebook: "Facebook", google: "Google" };
  var ACTION_ID = { facebook: "acct-fb-action", google: "acct-google-action" };
  var PROVIDER_URL = { facebook: "https://www.facebook.com/", google: "https://accounts.google.com/" }; /* the only places a connect may leave for */
  var RETURN_FAIL = ["cancelled", "failed", "invalid_state", "not_configured", "already_connected"]; /* spec 5.11 slugs other than connected and in_use (ruling F10 = B: no link_window_closed) */

  /* ---- the API's shapes (pure; tested in tests/account.test.mjs) ---- */
  /* The account as the page reads it: the API's one name becomes first_name (the first word) and last_name (the rest). */
  function view(data) {
    var a = {}, parts = String((data && data.name) || "").trim().split(/\s+/).filter(Boolean);
    Object.keys(data || {}).forEach(function (k) { a[k] = data[k]; });
    a.first_name = parts[0] || "";
    a.last_name = parts.slice(1).join(" ");
    return a;
  }
  function nameBody(first, last) { return { name: [first, last].map(function (v) { return String(v || "").trim(); }).filter(Boolean).join(" ") }; }
  function emailConfirmBody(email, code) { return { email: email, code: String(code || "") }; }
  /* The provider's own address from a connect start, or "" when the answer is anything else. */
  function providerUrl(name, res) {
    var u = res && res.ok && res.data ? res.data.url : null;
    return typeof u === "string" && PROVIDER_URL.hasOwnProperty(name) && u.indexOf(PROVIDER_URL[name]) === 0 ? u : "";
  }

  /* ---- helpers ---- */
  function messageOf(res, fallback) { var m = res && res.data && res.data.message; return typeof m === "string" && m ? m : fallback; }
  function codeOf(res) { return res && res.data && typeof res.data.code === "string" ? res.data.code : ""; }
  function fieldMsg(res, key) {
    var f = res && res.data && res.data.fields, m = f && f[key];
    return typeof m === "string" && m ? m : messageOf(res, "That did not work. Please try again.");
  }
  function txt(text) { return D.el("span", {}, text); }
  function chip(kind, text) { return D.el("span", { "class": "chip chip-" + kind }, text); }
  function btn(text, primary, onClick, id) {
    var b = D.el("button", { type: "button", "class": primary ? "no-btn no-btn-primary" : "no-btn no-btn-ghost" }, text);
    if (id) b.setAttribute("id", id);
    if (onClick) b.addEventListener("click", function () { onClick(b); });
    return b;
  }
  function submitBtn(text) { return D.el("button", { type: "submit", "class": "no-btn no-btn-primary" }, text); }
  /* "Nov 7, 2026 at 3:42 PM" in Philippine time (D.date has no time; app.js stays unchanged). */
  function phTime(iso) {
    var d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return "";
    try {
      var day = d.toLocaleDateString("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });
      var time = d.toLocaleTimeString("en-US", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit", hour12: true });
      return (day + " at " + time).replace(/\s+/g, " ");
    } catch (e) { return ""; }
  }
  /* Spec D7: the server mask +63917***4567 shows as +63 917 ••• 4567; anything else as received. */
  function mobileShown(masked) {
    var m = /^\+63(\d{3})\*\*\*(\d{4})$/.exec(masked || "");
    return m ? "+63 " + m[1] + " ••• " + m[2] : (masked || "");
  }
  function hasMobile(a) { var m = (a && a.mobile) || {}; return !!(m.verified && m.mobile_masked); }
  /* The first id that exists gets focus, else the page heading: a redraw never leaves focus on a removed node (P-08). */
  function focusTo(ids) {
    for (var i = 0; i < ids.length; i++) { var t = $(ids[i]); if (t) { t.focus(); return; } }
    var h = $("h-account");
    if (h) h.focus();
  }

  /* ---- the read and the page states (S9, S10, S11, S1) ---- */
  function load(focusId) {
    var body = $("acct-body");
    if (!body) return;
    if (!S.s11 && body.firstChild) S.s11 = body.firstChild; /* today's panel from renderAccountPanel, kept as is for S11 */
    var my = ++S.seq;
    skeleton(body);
    D.call("GET", "/account/", null, true).then(function (res) {
      if (my !== S.seq || res.status === 401) return; /* a newer read owns the page, or app.js is already signing out */
      var ret = S.ret; S.ret = null; /* a provider return is shown on this read's draw only (spec 5.15) */
      if (res.status === 404 || (res.ok && !(res.data && res.data.writes_open === true))) { drawS11(body); if (focusId) focusTo([]); return; }
      if (!res.ok || !res.data) { drawError(body); if (focusId) focusTo([]); return; }
      S.data = view(res.data);
      S.result = returnLine(ret, S.data);
      draw(S.result ? "acct-con-result" : focusId);
    });
  }
  function skeleton(body) {
    body.textContent = "";
    var sk = D.el("div", { "class": "skel", "aria-busy": "true" });
    sk.appendChild(D.el("span", { "class": "sr-only" }, "Loading your account"));
    for (var i = 0; i < 3; i++) sk.appendChild(D.el("div", { "class": "skel-block acct-skel-card", "aria-hidden": "true" }));
    body.appendChild(sk);
  }
  function drawS11(body) { body.textContent = ""; if (S.s11) body.appendChild(S.s11); }
  function drawError(body) {
    body.textContent = "";
    var box = D.el("div", { "class": "err-box", role: "alert" });
    box.appendChild(D.el("h2", {}, "We could not load your account"));
    box.appendChild(D.el("p", {}, "Check your connection and try again. Nothing was changed."));
    var again = D.el("button", { type: "button", "class": "no-btn no-btn-primary" }, "Try again");
    again.addEventListener("click", function () { load(); });
    box.appendChild(again);
    body.appendChild(box);
  }
  function draw(focusId) {
    var body = $("acct-body"), a = S.data;
    if (!body || !a) return;
    body.textContent = "";
    /* Visual revision 1: two columns above 760px, one below. The DOM is already in reading order (Profile, Connected accounts, Sign-in and
       security, Your data and subscription, Notifications), so the stacked page and the Tab order match the wide grid with no CSS reordering. */
    var wrap = D.el("div", { "class": "stack acct-page" }), grid = D.el("div", { "class": "acct-grid" });
    [profileCard(a), connectedCard(a), securityCard(a), dataCard(), notificationsCard()].forEach(function (n) { grid.appendChild(n); });
    wrap.appendChild(scopeNotice());
    wrap.appendChild(grid);
    body.appendChild(wrap);
    S.result = null; /* the next redraw that is not a return clears the line */
    if (focusId) focusTo([focusId, "acct-email-change"]);
  }
  function card(id, title, sub) {
    var c = D.el("section", { "class": "dash-card acct-card", "aria-labelledby": id });
    c.appendChild(D.el("h2", { id: id }, title));
    if (sub) c.appendChild(D.el("p", { "class": "dash-copy" }, sub));
    return c;
  }
  function row(label, values, action, id) {
    var r = D.el("div", id ? { "class": "acct-set-row", id: id } : { "class": "acct-set-row" });
    r.appendChild(D.el("div", { "class": "acct-set-label" }, label));
    var v = D.el("div", { "class": "acct-set-value" });
    values.forEach(function (n) { v.appendChild(n); });
    r.appendChild(v);
    var act = D.el("div", { "class": "acct-set-action" });
    if (action) act.appendChild(action);
    r.appendChild(act);
    return r;
  }
  function scopeNotice() {
    var p = D.el("p", { "class": "dash-card acct-scope" });
    p.appendChild(D.el("strong", {}, "These settings apply to your whole Account, not the site you are viewing."));
    p.appendChild(D.el("br", {}));
    p.appendChild(txt("Business name, public email and mobile, address and site name are in "));
    p.appendChild(D.el("a", { "class": "acct-link", href: BUSINESS_SETTINGS_PATH }, "Settings › Business Settings"));
    p.appendChild(txt(". Payment method and invoices are in "));
    p.appendChild(D.el("a", { "class": "acct-link", href: BILLING_PATH }, "Billing"));
    p.appendChild(txt("."));
    return p;
  }
  function profileCard(a) {
    var c = card("h-acct-prof", "Profile", "Only you, the Account owner, can change these.");
    var name = ((a.first_name || "") + " " + (a.last_name || "")).trim();
    c.appendChild(row("Name", [txt(name || "Not provided")], btn("Edit", false, editName, "acct-name-edit"), "acct-row-name"));
    var change = btn("Change email", false, openEmail, "acct-email-change"), values = [txt(a.email || ""), chip("ok", "Verified")];
    if (a.email_change_available_at) { /* S6: the 24-hour cooldown runs; the button stays, disabled, and says why */
      values.push(chip("warn", "Changed recently"));
      var why = (a.email_changed_at ? "You changed your email on " + phTime(a.email_changed_at) + ". " : "") +
        "For your security you can change it again after " + phTime(a.email_change_available_at) + ".";
      values.push(D.el("span", { "class": "acct-cool", id: "acct-cool", tabindex: "-1" }, why));
      change.disabled = true;
      change.setAttribute("aria-describedby", "acct-cool");
    }
    c.appendChild(row("Email", values, change, "acct-row-email"));
    var has = hasMobile(a);
    c.appendChild(row("Mobile", has ? [txt(mobileShown(a.mobile.mobile_masked)), chip("ok", "Verified")] : [txt("No mobile added")],
      btn(has ? "Change mobile" : "Add mobile", false, openMobile, "acct-mobile-change"), "acct-row-mobile"));
    return c;
  }
  /* Revision 3 (R3-2): title and divider, the ruled note, the collapsible device list, then the full-width button. */
  function securityCard(a) {
    var c = card("h-acct-sec", "Sign-in and security", "");
    c.appendChild(D.el("p", { "class": "dash-copy" }, SEC_NOTE));
    var n = a.signed_in_count > 0 ? a.signed_in_count : 1;
    c.appendChild(devicesDisclosure(a, n));
    if (n > 1) {
      var out = D.el("button", { type: "button", "class": "no-btn no-btn-ghost acct-full", id: "acct-signout-others" }, "Sign out other devices");
      out.addEventListener("click", function () { openSignOut(out); });
      c.appendChild(out);
    }
    return c;
  }
  /* K22: a native button (Enter and Space) over a panel that carries hidden while closed, collapsed on every entry, kept on redraw. */
  function devicesDisclosure(a, n) {
    var wrap = D.el("div", { "class": "acct-disc-wrap" });
    var t = D.el("button", { type: "button", "class": "acct-disc", id: "acct-devices-toggle", "aria-controls": "acct-devices-panel" });
    t.appendChild(D.el("span", { "class": "acct-disc-label" }, "Where you are signed in"));
    t.appendChild(D.el("span", { "class": "acct-disc-meta" }, n > 1 ? n + " devices, including this one" : "This device only"));
    t.appendChild(D.el("span", { "class": "acct-disc-chev", "aria-hidden": "true" }));
    var panel = D.el("div", { id: "acct-devices-panel", "class": "acct-disc-panel", role: "group", "aria-labelledby": "acct-devices-toggle" });
    var list = (Array.isArray(a.devices) ? a.devices : []).filter(function (d) { return d && typeof d === "object"; });
    if (!list.length) panel.appendChild(D.el("p", { "class": "acct-dev-empty" }, "Device details are not available right now."));
    else {
      var ul = D.el("ul", { "class": "acct-devices" });
      list.forEach(function (d) { ul.appendChild(deviceItem(d)); });
      panel.appendChild(ul);
      if (n === 1) panel.appendChild(D.el("p", { "class": "acct-dev-empty" }, "No other devices are signed in."));
    }
    function set(open) {
      S.devices = open;
      t.setAttribute("aria-expanded", open ? "true" : "false");
      t.classList.toggle("acct-disc-open", open);
      if (open) panel.removeAttribute("hidden"); else panel.setAttribute("hidden", "");
    }
    t.addEventListener("click", function () { set(!S.devices); });
    set(S.devices);
    wrap.appendChild(t);
    wrap.appendChild(panel);
    return wrap;
  }
  /* K23: text only; a line the server has no value for is left out (the name is the only "Unknown" text). */
  function deviceItem(d) {
    var li = D.el("li", { "class": "acct-device" }), head = D.el("div", { "class": "acct-device-name" });
    head.appendChild(txt(typeof d.name === "string" && d.name ? d.name : "Unknown device"));
    if (d.current === true) head.appendChild(chip("info", "This device"));
    li.appendChild(head);
    var signed = phTime(d.signed_in_at), used = phTime(d.last_used_at);
    if (signed) li.appendChild(D.el("div", { "class": "acct-device-line" }, "Signed in " + signed));
    if (used) li.appendChild(D.el("div", { "class": "acct-device-line" }, "Last used " + used));
    if (typeof d.ip === "string" && d.ip) li.appendChild(D.el("div", { "class": "acct-device-line" }, "IP address " + d.ip));
    return li;
  }
  /* Revision 3 (R3-4, R3-5): the second card connects and disconnects Facebook and Google, in the read's order. */
  function connectedCard(a) {
    var c = card("h-acct-con", "Connected accounts", "NegosyoOnline has no password. Connect Facebook or Google to sign in with one tap. You can always sign in with a code sent to your email.");
    (Array.isArray(a.providers) ? a.providers : []).forEach(function (p) {
      var name = p && p.provider;
      if (!LABEL.hasOwnProperty(name)) return;
      var id = ACTION_ID[name], values, action;
      if (p.connected === true) {
        values = [txt(typeof p.email === "string" && p.email ? p.email : "Connected account"), chip("ok", "Connected")];
        action = btn("Disconnect", false, function (b) { openDisconnect(b, p); }, id);
      } else { /* ruling F10 = B: Connect is never drawn disabled (design K25); connect_available is not read */
        values = [txt("Not connected"), chip("neutral", "Off")];
        action = btn("Connect", false, function (b) { openConnect(b, p); }, id);
      }
      c.appendChild(row(LABEL[name], values, action, "acct-row-" + name));
    });
    if (S.result) c.appendChild(S.result.ok
      ? D.el("p", { "class": "dash-copy acct-con-result", id: "acct-con-result", role: "status", tabindex: "-1" }, S.result.text)
      : D.el("p", { "class": "err-box acct-con-result", id: "acct-con-result", role: "alert", tabindex: "-1" }, S.result.text));
    var line = D.el("p", { "class": "dash-copy acct-note" });
    line.appendChild(txt("Lost access to your email? Our team can restore your account after checking your mobile. Contact support: "));
    line.appendChild(D.el("strong", {}, SUPPORT_EMAIL));
    c.appendChild(line);
    return c;
  }
  /* Spec 5.15, D32: read the provider return once, drop it from the address bar at once; trust it only as far as the read confirms. */
  function takeReturn() {
    var q = {};
    String(location.hash || "").replace(/^#/, "").split("&").forEach(function (kv) {
      var i = kv.indexOf("=");
      if (i > 0) q[kv.slice(0, i)] = kv.slice(i + 1);
    });
    if (!q.connect || !q.result) return null;
    try { history.replaceState(null, "", "/account/"); } catch (e) { /* ignore */ }
    return { provider: q.connect, result: q.result };
  }
  function returnLine(ret, a) {
    if (!ret || !LABEL.hasOwnProperty(ret.provider)) return null;
    var label = LABEL[ret.provider];
    var p = (Array.isArray(a.providers) ? a.providers : []).filter(function (x) { return x && x.provider === ret.provider; })[0];
    if (ret.result === "connected") return p && p.connected === true ? { ok: true, text: label + " is now connected. You can use it to sign in next time." } : null;
    if (ret.result === "in_use") return { ok: false, text: "This " + label + " account is already connected to a different NegosyoOnline account, so it was not connected here. Use a different " + label + " account, or sign in to that other account and disconnect it there." };
    return RETURN_FAIL.indexOf(ret.result) >= 0 ? { ok: false, text: label + " was not connected. Please try again." } : null;
  }
  function notificationsCard() {
    var c = card("h-acct-not", "Notifications", "These notices keep your account safe and your billing clear, so they cannot be turned off. There are no optional emails to manage.");
    c.classList.add("acct-card-wide"); /* full width below the grid */
    var ul = D.el("ul", { "class": "acct-notices" });
    NOTICES.forEach(function (n) {
      var li = D.el("li", {}), t = D.el("div", { "class": "acct-notice-txt" });
      t.appendChild(D.el("strong", {}, n[0]));
      t.appendChild(D.el("span", {}, n[1]));
      li.appendChild(t);
      li.appendChild(chip("neutral", "Always on"));
      ul.appendChild(li);
    });
    c.appendChild(ul);
    return c;
  }
  function dataCard() {
    var c = card("h-acct-dat", "Your data and subscription", "These open the process that owns them.");
    c.appendChild(row("Export your data", [txt("Ask our team for a copy of your account data.")],
      D.el("a", { "class": "no-btn no-btn-ghost", href: "mailto:" + SUPPORT_EMAIL }, "Email support")));
    c.appendChild(row("Cancel a subscription", [txt("Each site is cancelled from its own Billing page.")],
      D.el("a", { "class": "no-btn no-btn-ghost", href: BILLING_PATH }, "Go to Billing")));
    return c;
  }

  /* ---- fields and inline errors (label above, red border and the message under the field, never toast-only) ---- */
  function field(o) {
    var box = D.el("div", { "class": "ob-field" });
    box.appendChild(D.el("label", { "class": "ob-label", "for": o.id }, o.label));
    var input = D.el("input", { id: o.id, name: o.name, "class": "ob-input" }), hint = null;
    input.value = o.value || "";
    if (o.kind === "code") { /* revision 1: the six boxes are the entry; this ONE input sits over them, so there is no second "Code" field */
      box.firstChild.setAttribute("class", "sr-only");
      input.setAttribute("class", "acct-otp-input");
      input.setAttribute("type", "text");
      input.setAttribute("inputmode", "numeric"); input.setAttribute("autocomplete", "one-time-code"); input.setAttribute("maxlength", "6");
      input.setAttribute("pattern", "[0-9]*");
      var otp = D.el("div", { "class": "acct-otp" }), boxes = D.el("div", { "class": "acct-code-boxes", "aria-hidden": "true" });
      for (var i = 0; i < 6; i++) boxes.appendChild(D.el("span", { "class": "acct-code-box" }));
      var mirror = function () { /* numerals only, six at most; each one shows in its own box and the next empty box is the active one */
        var nums = String(input.value || "").replace(/\D/g, "").slice(0, 6);
        if (nums !== input.value) input.value = nums;
        Array.prototype.forEach.call(boxes.children, function (b, n) {
          b.textContent = nums.charAt(n);
          b.classList.toggle("acct-code-box-on", n === Math.min(nums.length, 5));
        });
        if (input.setSelectionRange) { try { input.setSelectionRange(nums.length, nums.length); } catch (e) {} }
      };
      input.addEventListener("input", mirror);
      input.addEventListener("paste", function (e) { /* a pasted code with spaces or a dash still fills the boxes */
        var cb = e.clipboardData, text = cb && cb.getData ? cb.getData("text") : "";
        if (!text) return;
        e.preventDefault();
        input.value = String(text).replace(/\D/g, "").slice(0, 6);
        mirror();
      });
      otp.appendChild(boxes);
      otp.appendChild(input);
      box.appendChild(otp);
      mirror();
    } else if (o.kind === "email" || o.kind === "phone") {
      var g = window.NOContact.group(o.kind, input, o.id);
      if (o.kind === "email") input.setAttribute("autocomplete", "email");
      box.appendChild(g.group);
      if (g.hint) { box.appendChild(g.hint); hint = g.hint.id; input.setAttribute("aria-describedby", hint); }
    } else {
      input.setAttribute("type", "text");
      input.setAttribute("maxlength", "80"); if (o.auto) input.setAttribute("autocomplete", o.auto);
      box.appendChild(input);
    }
    if (o.readonly) input.setAttribute("readonly", "");
    var err = D.el("p", { "class": "ob-err", id: o.id + "-err" });
    err.hidden = true;
    box.appendChild(err);
    return { box: box, input: input, err: err, hint: hint };
  }
  function setErrors(fields, map) {
    var first = null;
    Object.keys(fields).forEach(function (k) {
      var f = fields[k], msg = map && typeof map[k] === "string" ? map[k] : "", group = f.input.parentNode;
      f.err.textContent = msg;
      f.err.hidden = !msg;
      var described = [f.hint, msg ? f.err.id : null].filter(Boolean).join(" ");
      if (described) f.input.setAttribute("aria-describedby", described); else f.input.removeAttribute("aria-describedby");
      var flag = f.input.classList.contains("acct-otp-input") ? "acct-otp-err" : "ob-invalid", host = flag === "ob-invalid" ? f.input : group; /* the code boxes carry the red border */
      if (msg) { f.input.setAttribute("aria-invalid", "true"); host.classList.add(flag); }
      else { f.input.removeAttribute("aria-invalid"); host.classList.remove(flag); }
      if (group && group.classList && group.classList.contains("ct-group")) { if (msg) group.classList.add("ct-group-err"); else group.classList.remove("ct-group-err"); }
      if (msg && !first) first = f.input;
    });
    if (first) { first.focus(); if (first.select && first.classList.contains("acct-otp-input")) first.select(); } /* a wrong code stays selected: typing replaces it */
    return first;
  }

  /* ---- closable dialog (design K13): inert siblings, scroll lock, Tab cycles inside, Escape closes, no backdrop close ---- */
  function openDialog(opener, title) {
    closeDialog();
    var saved = [];
    Array.prototype.forEach.call(document.body.children, function (c) {
      saved.push([c, c.hasAttribute("inert"), c.getAttribute("aria-hidden")]);
      c.setAttribute("inert", ""); c.setAttribute("aria-hidden", "true");
    });
    var root = D.el("div", { id: "acct-dlg-root", "class": "acct-overlay" });
    var dlg = D.el("div", { id: "acct-dlg", "class": "acct-dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "acct-dlg-h" });
    var head = D.el("div", { "class": "acct-dlg-head" });
    head.appendChild(D.el("h2", { id: "acct-dlg-h", tabindex: "-1" }, title));
    var x = D.el("button", { type: "button", "class": "acct-dlg-x", "aria-label": "Close" }, "\u00d7"); /* revision 4: the only way out besides Escape, top right */
    x.addEventListener("click", cancelDialog);
    head.appendChild(x);
    var body = D.el("div", { id: "acct-dlg-body", "class": "acct-dlg-body" });
    dlg.appendChild(head);
    dlg.appendChild(body);
    root.appendChild(dlg);
    document.body.appendChild(root);
    document.body.classList.add("acct-lock");
    S.dlg = { root: root, dlg: dlg, saved: saved, opener: opener, x: x, onClose: null };
    document.addEventListener("keydown", dlgKey);
    return body;
  }
  function closeDialog() { /* true when a dialog was open */
    var d = S.dlg;
    if (!d) return false;
    S.dlg = null;
    clearInterval(S.resendTimer); /* the mobile code step's resend countdown ends with its dialog */
    document.removeEventListener("keydown", dlgKey);
    d.root.remove();
    d.saved.forEach(function (s) {
      if (!s[1]) s[0].removeAttribute("inert");
      if (s[2] === null) s[0].removeAttribute("aria-hidden"); else s[0].setAttribute("aria-hidden", s[2]);
    });
    document.body.classList.remove("acct-lock");
    return true;
  }
  function cancelDialog() {
    var d = S.dlg, o = d && d.opener;
    if (d && d.onClose) { d.onClose(); return; }
    closeDialog();
    if (o && o.focus) o.focus();
  }
  function focusables() {
    var d = S.dlg && S.dlg.dlg;
    function shown(n) { for (; n && n !== d; n = n.parentNode) if (n.hidden) return false; return true; }
    return d ? Array.prototype.filter.call(d.querySelectorAll("a[href], button, input, select, textarea"), function (n) {
      return !n.disabled && shown(n) && n.getAttribute("tabindex") !== "-1";
    }) : [];
  }
  function dlgKey(e) {
    if (!S.dlg) return;
    if (e.key === "Escape") { e.preventDefault(); cancelDialog(); return; }
    if (e.key !== "Tab") return;
    var items = focusables(), now = document.activeElement;
    if (!items.length) { e.preventDefault(); $("acct-dlg-h").focus(); return; }
    var first = items[0], last = items[items.length - 1], inside = items.indexOf(now) >= 0;
    if (e.shiftKey && (now === first || !inside)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (now === last || !inside)) { e.preventDefault(); first.focus(); }
  }
  function dlgForm(onSubmit) { /* Enter in a field submits the primary action */
    var f = D.el("form", { "class": "acct-dlg-form", novalidate: "" });
    f.addEventListener("submit", function (e) { e.preventDefault(); onSubmit(); });
    return f;
  }
  function footer(parent, buttons) {
    var foot = D.el("div", { "class": "acct-dlg-foot" });
    buttons.forEach(function (b) { foot.appendChild(b); });
    parent.appendChild(foot);
  }
  function note(text) { return D.el("p", { "class": "dash-copy acct-dlg-note" }, text); }

  /* ---- code steps (ClickUp z8uq9md33v): both are laid out like the public site's sign-in code step: centred, the
     larger boxes, a resend line, the button, a quiet way back. Resend is the step's own start call again; `refused`
     handles the answers that leave the step and returns true, anything else shows under the boxes. ---- */
  function clock(left) { var s = left % 60; return Math.floor(left / 60) + ":" + (s < 10 ? "0" : "") + s; }
  function codeStepParts(o) {
    var code = o.code, status = D.el("p", { "class": "acct-code-hint", role: "status" });
    var count = D.el("span", {}, ""), wait = D.el("span", {});
    wait.appendChild(txt("You can resend in ")); wait.appendChild(count); wait.appendChild(txt("."));
    var resend = D.el("button", { type: "button", "class": "acct-code-resend" }, "Resend the code");
    var hint = D.el("p", { "class": "acct-code-hint" }, "Didn\u2019t arrive? ");
    hint.appendChild(wait); hint.appendChild(resend);
    var back = D.el("button", { type: "button", "class": "acct-code-back" }, o.backText);
    function cooldown() {
      var left = o.wait;
      clearInterval(S.resendTimer);
      resend.hidden = true; wait.hidden = false; count.textContent = clock(left);
      S.resendTimer = setInterval(function () {
        left -= 1;
        if (left <= 0) { clearInterval(S.resendTimer); wait.hidden = true; resend.hidden = false; }
        else count.textContent = clock(left);
      }, 1000);
    }
    resend.addEventListener("click", function () {
      setErrors(o.fields, null);
      status.textContent = "";
      resend.disabled = true;
      D.call("POST", o.path, o.payload, true).then(function (res) {
        resend.disabled = false;
        if (res.ok) {
          status.textContent = "A new code is on its way.";
          code.input.value = ""; code.input.dispatchEvent(new Event("input")); code.input.focus();
          cooldown(); return;
        }
        if (res.status === 404) { closeDialog(); load("h-account"); return; }
        if (o.refused && o.refused(res)) return;
        code.err.textContent = fieldMsg(res, o.errKey); code.err.hidden = false; /* not a wrong code: the boxes stay as they are */
      });
    });
    back.addEventListener("click", o.goBack);
    return { status: status, hint: hint, back: back, cooldown: cooldown };
  }

  /* ---- email change (S3, S4, S5, S7; spec D5, D10) ---- */
  function openEmail(opener) { emailStep1(openDialog(opener, "Change your email"), "", ""); }
  function emailStep1(body, value, error) {
    body.textContent = "";
    clearInterval(S.resendTimer);
    var em = field({ id: "acct-new-email", name: "email", label: "New email", kind: "email", value: value });
    var fields = { email: em }, send = submitBtn("Send code");
    var f = dlgForm(function () {
      var email = (em.input.value || "").trim();
      setErrors(fields, null);
      send.disabled = true;
      D.call("POST", "/account/email/start/", { email: email }, true).then(function (res) {
        send.disabled = false;
        if (res.ok) { emailStep2(body, email); return; }
        if (res.status === 404) { closeDialog(); load("h-account"); return; }
        if (codeOf(res) === "email_change_cooldown") { cooldownRefused(body, email, res); return; }
        setErrors(fields, { email: fieldMsg(res, "email") });
      });
    });
    f.appendChild(em.box);
    f.appendChild(note("We send a 6-digit code to the new address. Nothing changes until you enter it. After the change you cannot change your email again for 24 hours."));
    footer(f, [send]);
    body.appendChild(f);
    if (!(error && setErrors(fields, { email: error }))) em.input.focus();
  }
  function emailStep2(body, email) {
    body.textContent = "";
    var a = S.data || {}, code = field({ id: "acct-email-code", name: "code", label: "Code", kind: "code" });
    var fields = { code: code }, confirm = submitBtn("Confirm email");
    var lead = D.el("p", { "class": "dash-copy" });
    lead.appendChild(txt("We sent a 6-digit code to "));
    lead.appendChild(D.el("strong", {}, email));
    lead.appendChild(txt(". Enter it to confirm this address."));
    var on = function (name) { return (a.providers || []).some(function (p) { return p && p.provider === name && p.connected === true; }); };
    var kept = (on("facebook") ? "Your Facebook sign-in stays connected. " : "") + (on("google") ? "Your Google sign-in stays connected. " : "");
    var parts = codeStepParts({ code: code, fields: fields, wait: 60, path: "/account/email/start/", payload: { email: email }, errKey: "email",
      backText: "Use a different email", goBack: function () { emailStep1(body, email, ""); },
      refused: function (res) { /* the same answers the first send can give */
        var c = codeOf(res);
        if (c === "email_change_cooldown") { cooldownRefused(body, email, res); return true; }
        if (c === "email_taken") { emailStep1(body, email, fieldMsg(res, "email")); return true; }
        return false;
      } });
    var f = dlgForm(function () {
      setErrors(fields, null);
      parts.status.textContent = "";
      confirm.disabled = true;
      D.call("POST", "/account/email/confirm/", emailConfirmBody(email, code.input.value), true).then(function (res) {
        confirm.disabled = false;
        if (res.ok && res.data) { S.data = view(res.data); closeDialog(); draw("acct-cool"); D.toast("Email changed", "Your other devices were signed out."); if (D.refreshAccount) D.refreshAccount(); return; } /* the menu shows the new email */
        if (res.status === 404) { closeDialog(); load("h-account"); return; }
        var c = codeOf(res);
        if (c === "email_change_cooldown") { cooldownRefused(body, email, res); return; }
        if (c === "email_taken") { emailStep1(body, email, fieldMsg(res, "email")); return; }
        setErrors(fields, { code: fieldMsg(res, "code") });
      });
    });
    f.classList.add("acct-code-step");
    f.appendChild(lead);
    f.appendChild(code.box);
    f.appendChild(parts.status);
    f.appendChild(parts.hint);
    f.appendChild(note("After you confirm, you are signed out on every other device, and we email " + (a.email || "your old address") +
      " about the change. " + kept + "You cannot change your email again for 24 hours."));
    footer(f, [confirm]);
    f.appendChild(parts.back);
    body.appendChild(f);
    code.input.focus();
    parts.cooldown();
  }
  function cooldownRefused(body, email, res) { /* S7: a stale page or a second tab met the cooldown */
    body.textContent = "";
    var when = phTime(res && res.data && res.data.retry_at);
    var em = field({ id: "acct-new-email", name: "email", label: "New email", kind: "email", value: email, readonly: true });
    S.dlg.onClose = function () { closeDialog(); load("acct-cool"); }; /* the close button and Escape: the page re-reads and shows S6 */
    var wrap = D.el("div", { "class": "acct-dlg-form" });
    wrap.appendChild(em.box);
    wrap.appendChild(note("This protects your account. If you did not make the earlier change, contact " + SUPPORT_EMAIL + "."));
    body.appendChild(wrap);
    setErrors({ email: em }, { email: when ? "Your email was changed recently. You can change it again after " + when + "." : messageOf(res, "Your email was changed recently. Please try again later.") });
  }

  /* ---- edit name (S2, revision 1): a dialog like Change email, not an inline row ---- */
  function editName(opener) {
    var a = S.data;
    if (!a) return;
    var body = openDialog(opener, "Edit your name");
    var fields = {
      first_name: field({ id: "acct-first_name", name: "first_name", label: "First name", value: a.first_name, auto: "given-name" }),
      last_name: field({ id: "acct-last_name", name: "last_name", label: "Last name", value: a.last_name, auto: "family-name" })
    };
    var save = submitBtn("Save name");
    var f = dlgForm(function () {
      setErrors(fields, null);
      save.disabled = true;
      D.call("PATCH", "/account/", nameBody(fields.first_name.input.value, fields.last_name.input.value), true).then(function (res) {
        save.disabled = false;
        if (res.ok && res.data) { S.data = view(res.data); closeDialog(); draw("acct-name-edit"); D.toast("Saved", "Your name was saved."); if (D.refreshAccount) D.refreshAccount(); return; } /* the menu shows the new name */
        if (res.status === 404) { closeDialog(); load("h-account"); return; } /* X10: data entry closed meanwhile; the read draws today's page */
        var map = res.data && res.data.fields;
        if (!(map && (map.first_name || map.last_name))) map = { first_name: fieldMsg(res, "name") }; /* the API has one name field */
        setErrors(fields, map);
      });
    });
    f.appendChild(fields.first_name.box);
    f.appendChild(fields.last_name.box);
    footer(f, [save]);
    body.appendChild(f);
    fields.first_name.input.focus();
  }

  /* ---- sign out other devices (S8) ---- */
  function openSignOut(opener) {
    var body = openDialog(opener, "Sign out other devices"), others = ((S.data && S.data.signed_in_count) || 1) - 1;
    body.appendChild(D.el("p", { "class": "dash-copy" }, others === 1
      ? "You will stay signed in here. The other device will be signed out and asked for a new code or a Google sign-in."
      : "You will stay signed in here. The other " + others + " devices will be signed out and asked for a new code or a Google sign-in."));
    body.appendChild(note("This does not start the 24-hour email cooldown."));
    var err = D.el("p", { "class": "ob-err", role: "alert" });
    err.hidden = true;
    body.appendChild(err);
    var go = btn("Sign out other devices", true, function (b) {
      b.disabled = true;
      err.hidden = true;
      D.call("POST", "/account/sessions/sign-out-others/", {}, true).then(function (res) {
        b.disabled = false;
        if (res.ok && res.data && typeof res.data.signed_in_count === "number") {
          S.data.signed_in_count = res.data.signed_in_count;
          S.data.devices = (Array.isArray(S.data.devices) ? S.data.devices : []).filter(function (d) { return d && d.current === true; });
          closeDialog();
          draw("acct-devices-toggle");
          D.toast("Signed out", "Your other devices were signed out.");
          return;
        }
        if (res.status === 404) { closeDialog(); load("h-account"); return; }
        err.textContent = messageOf(res, "That did not work. Please try again.");
        err.hidden = false;
      });
    });
    footer(body, [go]);
    S.dlg.x.focus(); /* destructive-safe default: the close button (revision 4) */
  }

  /* ---- change mobile over the existing /account/mobile/* routes (spec D3; their messages are shown as sent) ---- */
  function openMobile(opener) { mobileStep1(openDialog(opener, "Change your mobile")); }
  function mobileStep1(body) {
    body.textContent = "";
    clearInterval(S.resendTimer);
    var mob = field({ id: "acct-new-mobile", name: "mobile", label: "New mobile", kind: "phone" });
    var fields = { mobile: mob }, send = submitBtn("Send code");
    var f = dlgForm(function () {
      var number = window.NOContact.phoneValue(mob.input.value);
      setErrors(fields, null);
      send.disabled = true;
      D.call("POST", "/account/mobile/start/", { mobile: number }, true).then(function (res) {
        send.disabled = false;
        if (res.ok) { mobileStep2(body, number); return; }
        if (res.status === 404) { closeDialog(); load("h-account"); return; }
        setErrors(fields, { mobile: fieldMsg(res, "mobile") });
      });
    });
    f.appendChild(mob.box);
    f.appendChild(note("We text a 6-digit code to the new number. Nothing changes until you enter it."));
    footer(f, [send]);
    body.appendChild(f);
    mob.input.focus();
  }
  function mobileStep2(body, number) {
    body.textContent = "";
    var code = field({ id: "acct-mobile-code", name: "code", label: "Code", kind: "code" });
    var fields = { code: code }, confirm = submitBtn("Confirm mobile");
    var parts = codeStepParts({ code: code, fields: fields, wait: 30, path: "/account/mobile/start/", payload: { mobile: number }, errKey: "mobile",
      backText: "Use a different number", goBack: function () { mobileStep1(body); } });
    var f = dlgForm(function () {
      setErrors(fields, null);
      parts.status.textContent = "";
      confirm.disabled = true;
      D.call("POST", "/account/mobile/verify/", { code: code.input.value }, true).then(function (res) {
        confirm.disabled = false;
        if (res.ok && res.data) { S.data.mobile = res.data; closeDialog(); draw("acct-mobile-change"); D.toast("Mobile changed", "Your mobile number was changed."); return; }
        if (res.status === 404) { closeDialog(); load("h-account"); return; }
        setErrors(fields, { code: fieldMsg(res, "code") });
      });
    });
    f.classList.add("acct-code-step");
    f.appendChild(D.el("p", { "class": "dash-copy" }, "We sent a 6-digit code to the number ending in " + String(number).slice(-4) + ". Enter it to confirm this number."));
    f.appendChild(code.box);
    f.appendChild(parts.status);
    f.appendChild(parts.hint);
    if (hasMobile(S.data)) f.appendChild(note("After you confirm, we send a notice to your email."));
    footer(f, [confirm]);
    f.appendChild(parts.back);
    body.appendChild(f);
    code.input.focus();
    parts.cooldown();
  }

  /* ---- connect and disconnect (S16, S17; spec 5.15, D25): fixed request paths only, so nothing rides a URL ---- */
  function connectCall(name) {
    return name === "facebook" ? D.call("POST", "/account/connections/facebook/start/", {}, true, true)
      : D.call("POST", "/account/connections/google/start/", {}, true, true);
  }
  function disconnectCall(name) {
    return name === "facebook" ? D.call("POST", "/account/connections/facebook/disconnect/", {}, true)
      : D.call("POST", "/account/connections/google/disconnect/", {}, true);
  }
  /* revision 4: the provider logo leads the CTA, in a white round badge so it reads on the blue button (fixed shapes, nothing from data) */
  var LOGO_FB = "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z";
  var LOGO_G = [
    ["M17.64 9.2045c0-.638-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z", "#4285F4"],
    ["M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.3441 0-4.3282-1.5831-5.036-3.7104H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18z", "#34A853"],
    ["M3.964 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2823-1.71V4.9582H.9573A8.9965 8.9965 0 0 0 0 9c0 1.4523.3477 2.8268.9573 4.0418L3.964 10.71z", "#FBBC05"],
    ["M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.6559 3.5795 9 3.5795z", "#EA4335"]
  ];
  function logoBadge(name) {
    var NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg"), badge = D.el("span", { "class": "acct-prov-ic", "aria-hidden": "true" });
    function path(d, fill) { var n = document.createElementNS(NS, "path"); n.setAttribute("d", d); n.setAttribute("fill", fill); svg.appendChild(n); }
    svg.setAttribute("viewBox", name === "facebook" ? "0 0 24 24" : "0 0 18 18");
    svg.setAttribute("focusable", "false");
    if (name === "facebook") path(LOGO_FB, "#1877F2"); else LOGO_G.forEach(function (g) { path(g[0], g[1]); });
    badge.appendChild(svg);
    return badge;
  }
  function withLogo(b, name, text) { /* the label stays the button's text; the badge is decoration */
    b.textContent = "";
    b.appendChild(logoBadge(name));
    b.appendChild(D.el("span", {}, text));
    return b;
  }
  function openConnect(opener, p) {
    var label = LABEL[p.provider], body = openDialog(opener, "Connect " + label);
    body.appendChild(D.el("p", { "class": "dash-copy" }, "You will go to " + label + " to sign in. When you come back here, you can also sign in to NegosyoOnline with " + label + "."));
    body.appendChild(note("You can disconnect it here at any time. Your email sign-in stays."));
    var err = D.el("p", { "class": "ob-err", role: "alert" });
    err.hidden = true;
    body.appendChild(err);
    var go = btn("Continue to " + label, true, function (b) {
      b.disabled = true; err.hidden = true;
      connectCall(p.provider).then(function (res) {
        var url = providerUrl(p.provider, res);
        if (url) { location.assign(url); return; }
        b.disabled = false;
        if (res.status === 404) { closeDialog(); load("h-account"); return; }
        err.textContent = messageOf(res, "That did not work. Please try again.");
        err.hidden = false;
        b.focus();
      });
    });
    withLogo(go, p.provider, "Continue to " + label);
    footer(body, [go]);
    go.focus(); /* leaving the page is not destructive (design S16) */
  }
  function openDisconnect(opener, p) {
    var label = LABEL[p.provider], email = typeof p.email === "string" ? p.email : "", body = openDialog(opener, "Disconnect " + label);
    var mine = S.data && typeof S.data.email === "string" ? S.data.email.trim().toLowerCase() : "";
    var same = p.provider === "google" && !!email.trim() && email.trim().toLowerCase() === mine; /* ruling P3 = A (spec 5.15) */
    body.appendChild(D.el("p", { "class": "dash-copy" }, same
      ? "Google sign-in will be removed from this account. Your Google email is the same as your account email, so signing in with Google again connects it again. You can always sign in with a code sent to your email."
      : "You will no longer be able to sign in with " + label + (email ? " (" + email + ")" : "") + ". You can still sign in with a code sent to your email."));
    var err = D.el("p", { "class": "ob-err", role: "alert" });
    err.hidden = true;
    body.appendChild(err);
    var go = btn("Disconnect " + label, true, function (b) {
      b.disabled = true; err.hidden = true;
      disconnectCall(p.provider).then(function (res) {
        b.disabled = false;
        if (res.ok && res.data && Array.isArray(res.data.providers)) {
          S.data = view(res.data);
          closeDialog();
          draw(ACTION_ID[p.provider]);
          D.toast("Disconnected", label + " was disconnected.");
          return;
        }
        if (res.status === 404) { closeDialog(); load("h-account"); return; }
        err.textContent = messageOf(res, "That did not work. Please try again.");
        err.hidden = false;
        b.focus(); /* audit advisory A-01: keyboard focus stays on a control after a failed disconnect */
      });
    });
    withLogo(go, p.provider, "Disconnect " + label);
    footer(body, [go]);
    S.dlg.x.focus(); /* destructive-safe default, as S8 */
  }

  window.addEventListener("popstate", function () { closeDialog(); }); /* leaving the view by history never leaves a dialog open */
  window.NOAccount = { show: function () { S.devices = false; S.ret = takeReturn(); load(); },
    util: { view: view, nameBody: nameBody, emailConfirmBody: emailConfirmBody, providerUrl: providerUrl, returnLine: returnLine } }; /* every entry starts collapsed; a provider return is read once (spec 5.15) */
})();
