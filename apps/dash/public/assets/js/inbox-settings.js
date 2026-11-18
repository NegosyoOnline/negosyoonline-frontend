/* Inbox settings (/settings/inbox/, ClickUp z8uq9md3n6 and z8uq9mfj12, Unified Inbox): the owner's inbox channels, to the approved
   mockup d6. Reads and writes GET/PUT /sites/{id}/inquiries/channels/: the "Inbox channels" card (the website chat switch, the
   "Pause for" house dropdown with Pause chat, the status line and Resume chat) and the "Email" card (the contact-form switch, only
   when the API says contact_inbox_available, and the one "coming soon" line for direct email). Fields the API does not send yet
   (email_enabled, contact_inbox_available) hide their part. Every status comes from the API; API strings reach the page through
   textContent or D.el only. While the API answers 404 (the INQUIRIES_ENABLED switch is off, or not a Santé site) the page says
   the inbox is not available yet and the Inbox links stay hidden. The "Facebook Messenger" card (ClickUp z8uq9mg1qe) reads
   GET .../inquiries/messenger/connection/ (a 404 hides the card): unset shows Connect Facebook Page, which NAVIGATES to
   .../messenger/start/ (no fetch); back with ?messenger=pick (or pick_pending) it lists GET .../messenger/pages/ in the house
   dropdown and POST .../messenger/connect/; active shows the Page and Disconnect (with a confirm, DELETE .../connection/);
   invalid shows Reconnect; ?messenger=error&code=... is one plain line. No token is ever seen or entered here. Plain ES5. NOInboxSettings.util holds the pure helpers
   (tests/inbox.test.mjs). */
(function () {
  var D = window.NODash;
  var token = 0, S = null;
  /* One plain line for each return code of the Facebook callback, and for the connect errors. */
  var MSG_ERR = {
    cancelled: "The Facebook connection was cancelled. Nothing was changed.",
    state_invalid: "That connection attempt expired. Please press Connect Facebook Page and try again.",
    provider_down: "Facebook did not answer just now. Please try again in a moment.",
    no_pages: "We found no Facebook Page that you manage. Make sure you are an admin of the Page, then try again.",
    permission_missing: "Messenger needs all the permissions it asks for. Please connect again and allow them.",
    not_in_pick_list: "That Page is not in your list. Please choose one from the list.",
    page_taken: "That Facebook Page is already connected to another site.",
    pick_expired: "The Page list expired. Please press Connect Facebook Page to start again."
  };
  function msgErrText(code) { return Object.prototype.hasOwnProperty.call(MSG_ERR, code) ? MSG_ERR[code] : "We could not connect your Facebook Page. Please try again."; }
  /* Drop messenger and code from the address once read, keeping the path and the other parameters (site=), so a reload does not repeat it. */
  function cleanAddress() {
    try {
      var q = new URLSearchParams(location.search);
      if (!q.has("messenger") && !q.has("code")) return;
      q.delete("messenger"); q.delete("code");
      var rest = q.toString();
      window.history.replaceState(null, "", location.pathname + (rest ? "?" + rest : "") + (location.hash || ""));
    } catch (e) { /* the address stays; harmless */ }
  }
  /* The return of the callback, read from the address: {pick: bool, error: code|""}. */
  function returnOf(search) {
    var q = new URLSearchParams(search || ""), m = q.get("messenger");
    return { pick: m === "pick", error: m === "error" ? (q.get("code") || "unknown") : "" };
  }
  var DAY = 86400000;

  function byId(id) { return document.getElementById(id); }
  function h(tag, cls, text) { return D.el(tag, cls ? { "class": cls } : {}, text); }
  function add(parent) { for (var i = 1; i < arguments.length; i++) { if (arguments[i]) parent.appendChild(arguments[i]); } return parent; }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  function say(text) { var l = byId("ibs-live"); if (l) l.textContent = text; }
  function msgOf(res, fallback) { var m = res && res.data && res.data.message; return typeof m === "string" && m ? m : fallback; }
  function btn(label, kind, fn) {
    var b = h("button", "no-btn " + (kind === "primary" ? "no-btn-primary" : "no-btn-ghost") + (kind === "danger" ? " pm-danger" : ""), label);
    b.setAttribute("type", "button");
    if (fn) b.addEventListener("click", function () { fn(b); });
    return b;
  }
  function busy(b, on) { if (!b) return; if (on) { b.setAttribute("aria-busy", "true"); b.disabled = true; } else { b.removeAttribute("aria-busy"); b.disabled = false; } }
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
  /* ---------- load ---------- */

  function show() {
    var mine = ++token, root = clear(byId("ibs-root")); S = { site: null, ch: null, pause: "", msg: null, back: returnOf(typeof location !== "undefined" ? location.search : ""), pickId: "", asking: false, err: "", cm: null };
    cleanAddress();
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
  function read(mine) {
    D.call("GET", chBase(), null, true).then(function (res) {
      if (mine !== token || !S || res.status === 401) return;
      if (res.status === 404) { unavailable(); return; }
      if (!res.ok || !res.data || typeof res.data !== "object") { failedPanel(res.status === 403 ? msgOf(res, "") : ""); return; }
      S.ch = res.data; setNav(true);
      loadMessenger(mine);
    });
  }
  function mBase() { return "/sites/" + S.site + "/inquiries/messenger/"; }
  /* The Messenger connection; a 404 (its own switch is off) leaves the card out, any other failure leaves a short line with Try again. */
  function loadMessenger(mine) {
    D.call("GET", mBase() + "connection/", null, true).then(function (res) {
      if (mine !== token || !S || res.status === 401) return;
      S.err = "";
      if (res.status === 404) { S.msg = null; render(); return; }
      if (!res.ok || !res.data || typeof res.data !== "object") { S.msg = { down: true, pages: null }; render(); return; }
      S.msg = { conn: res.data, pages: null };
      if (S.back.error) S.err = msgErrText(S.back.error);
      loadComments(mine, function () {
        if (res.data.status !== "active" && (S.back.pick || res.data.pick_pending === true)) { loadPages(mine); return; }
        render();
      });
    });
  }
  function loadPages(mine) {
    D.call("GET", mBase() + "pages/", null, true).then(function (res) {
      if (mine !== token || !S || res.status === 401) return;
      if (res.status === 410) { S.err = msgErrText("pick_expired"); S.back.pick = false; render(); return; }
      if (!res.ok || !res.data || !Array.isArray(res.data.items)) { S.err = "We could not load your Facebook Pages. Please try again."; render(); return; }
      S.msg.pages = res.data.items.filter(function (p) { return p && typeof p.id === "string"; });
      render();
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

  function render() {
    var root = clear(byId("ibs-root")); root.removeAttribute("aria-busy");
    add(root, channelsCard(), messengerCard(), emailCard(), howCard());
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
    add(s, h("p", "pm-lead", "Choose which channels reach your Inbox."));
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
  /* ---------- the Facebook Messenger card ---------- */

  /* While comments are on for the site (GET comments/status/ answered, not 404) the Facebook dialog also asks for the comments permissions: start/?comments=1. */
  function goConnect() { location.href = window.NO_CONFIG.apiBase + mBase() + "start/" + (S && S.cm ? "?comments=1" : ""); }
  function loadComments(mine, next) {
    D.call("GET", "/sites/" + S.site + "/inquiries/comments/status/", null, true).then(function (res) {
      if (mine !== token || !S || res.status === 401) return;
      var d = res.data;
      S.cm = res.ok && d && typeof d === "object" && d.enabled !== false ? { reason: typeof d.reason === "string" ? d.reason : "" } : null;
      next();
    });
  }
  function errLine() {
    if (!S.err) return null;
    var p = h("p", "pm-hint", S.err); p.setAttribute("role", "alert"); p.setAttribute("id", "ibs-m-err");
    return p;
  }
  function messengerCard() {
    var m = S.msg; if (!m) return null;
    var c = m.conn || {}, st = c.status;
    var chip = m.down ? null : st === "active" ? ["ok", "Connected"] : st === "invalid" ? ["warn", "Needs reconnecting"] : m.pages ? null : ["neutral", "Not connected"];
    var s = card("fm", "Facebook Messenger", chip);
    if (m.down) {
      add(s, h("p", "pm-lead", "We could not load your Facebook Messenger connection. Nothing was changed."), btn("Try again", "ghost", function (b) { busy(b, true); loadMessenger(token); }));
      return s;
    }
    add(s, errLine());
    if (st === "active") {
      var nm = h("p", "pm-lead", "Connected Page: "); var pn = h("b", "", c.page_name || c.page_id || "Your Facebook Page"); pn.setAttribute("id", "ibs-m-page"); nm.appendChild(pn);
      add(s, nm, h("p", "pm-hint", "Messages sent to this Page show in your Inbox as Facebook Messenger."));
      var row = h("div", "mk-pause"), cc = null;
      if (S.cm && S.cm.reason === "permission_missing") {
        add(s, (function () { var ch = h("p", "pm-hint", "Turn on comments for your Page to reply."); ch.setAttribute("id", "ibs-m-cm-hint"); return ch; })());
        cc = btn("Reconnect", "ghost", goConnect); cc.setAttribute("id", "ibs-m-cm-connect");
      }
      if (S.asking) {
        /* The reconnect button keeps its own row above the question; Disconnect and Keep connected share one row below it. */
        if (cc) add(s, add(h("div", "mk-pause"), cc));
        add(s, h("p", "pm-lead", "Disconnect this Page? New Messenger messages will stop arriving in your Inbox. Your past conversations stay."));
        var go = btn("Disconnect", "danger", function (b) { disconnect(b); }); go.setAttribute("id", "ibs-m-yes");
        var no = btn("Keep connected", "ghost", function () { S.asking = false; render(); var d = byId("ibs-m-disconnect"); if (d) d.focus(); }); no.setAttribute("id", "ibs-m-no");
        add(s, add(row, go, no));
      } else {
        var dis = btn("Disconnect", "ghost", function () { S.asking = true; render(); var y = byId("ibs-m-no"); if (y) y.focus(); }); dis.setAttribute("id", "ibs-m-disconnect");
        add(s, add(row, cc, dis));
      }
      return s;
    }
    if (m.pages) { pickerPart(s, m.pages); return s; }
    if (st === "invalid") add(s, h("p", "pm-lead", "The connection to " + (c.page_name || "your Facebook Page") + " stopped working. Connect it again to receive and answer Messenger messages."));
    else add(s, h("p", "pm-lead", "Connect your Facebook Page to receive and answer Messenger messages in your Inbox."));
    var cb = btn(st === "invalid" ? "Reconnect" : "Connect Facebook Page", "primary", goConnect); cb.setAttribute("id", "ibs-m-connect");
    add(s, cb);
    return s;
  }
  function pickerPart(s, pages) {
    add(s, h("p", "pm-lead", "Choose the Facebook Page to connect."));
    var field = h("div", "pm-field");
    var lab = h("label", "bl-sr", "Facebook Page"); lab.setAttribute("for", "ibs-m-page-sel");
    var row = h("div", "mk-pause"), cell = h("div", "");
    var sel = D.el("select", { "class": "ib-input", id: "ibs-m-page-sel" });
    sel.appendChild(D.el("option", { value: "" }, "Facebook Page"));
    pages.forEach(function (p) { sel.appendChild(D.el("option", { value: p.id }, p.name || p.id)); });
    sel.value = S.pickId;
    var go = btn("Connect", "primary", function (b) { connectPage(b, sel.value); }); go.setAttribute("id", "ibs-m-go"); go.disabled = !sel.value;
    sel.addEventListener("change", function () { S.pickId = sel.value; go.disabled = !sel.value; });
    add(cell, sel); add(row, cell, go); add(field, lab, row);
    add(s, field);
    if (!pages.length) add(s, h("p", "pm-hint", "No Pages were found."));
    if (window.NOInbox && window.NOInbox.combo) window.NOInbox.combo(sel, "Facebook Page", { blankEmpty: true });
  }
  function connectPage(b, id) {
    if (!id) return;
    var mine = token; busy(b, true);
    D.call("POST", mBase() + "connect/", { page_id: id }, true).then(function (res) {
      if (res.status === 401 || mine !== token || !S) return;
      if (!res.ok) {
        busy(b, false);
        if (res.status === 404) { S.msg = null; render(); return; }
        var code = res.data && res.data.code;
        S.err = msgErrText(code);
        if (res.status === 410) { S.back.pick = false; S.msg.pages = null; S.msg.conn = { status: "unset", pick_pending: false }; }
        render(); return;
      }
      S.err = ""; S.pickId = ""; S.back.pick = false;
      S.msg = { conn: res.data, pages: null };
      render(); say("Your Facebook Page is connected.");
      var d = byId("ibs-m-disconnect"); if (d && d.focus) d.focus();
    });
  }
  function disconnect(b) {
    var mine = token; busy(b, true);
    D.call("DELETE", mBase() + "connection/", null, true).then(function (res) {
      if (res.status === 401 || mine !== token || !S) return;
      busy(b, false);
      if (!res.ok && res.status !== 404) { D.toast("That did not work", msgOf(res, "We could not disconnect the Page. Please try again."), "error"); return; }
      S.asking = false; S.err = "";
      S.msg = res.status === 404 ? null : { conn: { status: "unset", page_id: null, page_name: null, connected_at: null, pick_pending: false }, pages: null };
      render(); say("Your Facebook Page is disconnected.");
      var c = byId("ibs-m-connect"); if (c && c.focus) c.focus();
    });
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
        if (res.status === 404) { unavailable(); return; }
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
    ["The inbox shows your Facebook Messenger, website chat and email conversations in one list.",
      "Press Refresh to see new messages.",
      "You can reply to a Facebook Messenger conversation within 24 hours of the customer's last message.",
      "Answer a website chat or an email from the conversation. A closed conversation can be reopened."].forEach(function (t) { ul.appendChild(h("li", "", t)); });
    return add(s, ul);
  }

  window.NOInboxSettings = { show: show, hide: hide, util: { returnOf: returnOf, msgErrText: msgErrText, whenText: whenText, pauseUntil: pauseUntil, chatStatus: chatStatus } };
})();
