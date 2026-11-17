/* Inbox settings (/settings/inbox/, ClickUp z8uq9md3n6 and z8uq9mfj12, Unified Inbox): the owner's inbox channels, to the approved
   mockup d6. Reads and writes GET/PUT /sites/{id}/inquiries/channels/: the "Inbox channels" card (the website chat switch, the
   "Pause for" house dropdown with Pause chat, the status line and Resume chat) and the "Email" card (the contact-form switch, only
   when the API says contact_inbox_available, and the one "coming soon" line for direct email). Fields the API does not send yet
   (email_enabled, contact_inbox_available) hide their part. Every status comes from the API; API strings reach the page through
   textContent or D.el only. While the API answers 404 (the INQUIRIES_ENABLED switch is off, or not a Santé site) the page says
   the inbox is not available yet and the Inbox links stay hidden. Plain ES5. NOInboxSettings.util holds the pure helpers
   (tests/inbox.test.mjs). */
(function () {
  var D = window.NODash;
  var token = 0, S = null;
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
    var mine = ++token, root = clear(byId("ibs-root")); S = { site: null, ch: null, pause: "" };
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
    add(root, channelsCard(), emailCard(), howCard());
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
    ["The inbox shows your website chat and email conversations in one list.",
      "Press Refresh to see new messages.",
      "Answer a website chat or an email from the conversation. A closed conversation can be reopened."].forEach(function (t) { ul.appendChild(h("li", "", t)); });
    return add(s, ul);
  }

  window.NOInboxSettings = { show: show, hide: hide, util: { whenText: whenText, pauseUntil: pauseUntil, chatStatus: chatStatus } };
})();
