/* Inbox, Text (SMS) channel (SMS-OWNER FE-1, ClickUp z8uq9mhk1h). The pieces inbox.js and inbox-settings.js use for the store's own texts
   to its members: the pure helpers (tests/inbox-sms.test.mjs) and the "New text" screen. Routes (apps/inquiries, contract
   sms-owner-z8uq9mhbf4): GET .../inquiries/channels/ (sms_available, sms_enabled), GET .../inquiries/sms/status/, POST
   .../inquiries/sms/compose/ {member_id, text, idempotency_key}; a reply uses the normal .../conversations/{ref}/reply/.
   While the feature is off (sms_available not true, or a 404 from any of these) nothing here shows or does anything. The owner never
   types a number: a text goes to a member picked from GET /sites/{id}/members/ (masked, verified mobile only) and only the member's
   public id is sent. The server adds the store-name prefix, decides who may be texted, and its `message` is what a refusal shows (never
   the error code). Every word from the API reaches the page through textContent only. Plain ES5. */
(function () {
  /* ---------- pure helpers ---------- */

  var OFFLINE = "Your texting phone is offline. Texts can't be sent right now.";
  var NOT_NOW = "Texts can't be sent right now.";
  var OPTED_OUT = "This customer asked not to get texts from your store.";
  var OFF_TEXT = "Text messages are off for your store. Turn them on in Settings > Inbox.";
  var P_LINK = "The text must not contain a web link.", P_PLAIN = "The text must fit one SMS: at most 160 plain characters.";
  /* The characters one SMS can carry as plain text, and a web link in any form a phone could make tappable (the same lists the server checks). */
  var PLAIN = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
    "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
  var LINK = /https?:\/\/|(^|[^a-z0-9])www\.|[a-z0-9-]+\.[a-z]{2,}(?![a-z0-9])|(^|[^0-9])[0-9]{1,3}(\.[0-9]{1,3}){3}(?![0-9])/i;

  /* The feature exists only while GET .../channels/ says so. */
  function available(ch) { return !!ch && ch.sms_available === true; }
  function enabled(ch) { return available(ch) && ch.sms_enabled === true; }
  function isRef(ref) { return typeof ref === "string" && ref.indexOf("sm_") === 0; }
  /* The room for the owner's own words: the server's max_length (160 less the store-name prefix); null when it cannot be used. */
  function maxOf(x) { return x && typeof x.max_length === "number" && isFinite(x.max_length) && x.max_length > 0 ? Math.floor(x.max_length) : null; }
  function prefixOf(x) { return x && typeof x.prefix === "string" ? x.prefix : ""; }
  /* What is wrong with a text before it is sent, or "" (empty is not an error: Send stays off). The server decides in the end. */
  function problem(text, max) {
    var t = String(text || "");
    if (!t.trim()) return "";
    if (max !== null && max !== undefined && t.length > max) return "The message is over " + max + " characters. Shorten it to send.";
    for (var i = 0; i < t.length; i++) if (PLAIN.indexOf(t.charAt(i)) < 0) return P_PLAIN;
    if (LINK.test(t)) return P_LINK;
    return "";
  }
  /* A text's delivery chip in a thread, [colour, words] or null; never a code. */
  function chip(m) {
    if (!m || m.direction !== "out") return null;
    if (m.delivery_state === "failed") return ["danger", "Not sent: " + (typeof m.error_message === "string" && m.error_message ? m.error_message : "The text did not go out.")];
    if (m.delivery_state === "sent") return ["ok", "Sent"];
    return ["info", "Sending"];
  }
  /* Why a thread's reply box is off, in words; "" when open or when the reason is the ordinary "closed" (inbox.js says that one). */
  function offText(reason) {
    if (reason === "opted_out") return OPTED_OUT;
    if (reason === "sms_off") return OFF_TEXT;
    if (reason === "replies_off") return NOT_NOW;
    return "";
  }
  function left(n, cap) { return typeof n === "number" && isFinite(n) && typeof cap === "number" ? Math.max(0, Math.floor(n)) + " of " + Math.floor(cap) : ""; }
  /* The count line from GET .../sms/status/: "Texts left today: 37 of 50. This hour: 20 of 20." */
  function quota(st) {
    if (!st) return "";
    var d = left(st.left_today, st.daily_limit), hr = left(st.left_this_hour, st.hourly_limit);
    return (d ? "Texts left today: " + d + "." : "") + (d && hr ? " " : "") + (hr ? "This hour: " + hr + "." : "");
  }
  /* The status says the phone is offline (only a clear false counts), or that customers' answers cannot arrive. */
  function phoneOffline(st) { return !!st && st.phone_online === false; }
  function notReady(st) { return !!st && st.incoming_ready === false; }
  /* The members to offer: a verified mobile and an account that is not closed; the id and a label with the masked number. Never a full number. */
  function pickable(list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (m) {
      if (!m || typeof m.id !== "string" || !m.id || m.mobile_state !== "verified" || m.closed === true) return;
      var name = typeof m.full_name === "string" && m.full_name.trim() ? m.full_name.trim() : "Member";
      var mob = typeof m.mobile_masked === "string" ? m.mobile_masked : "";
      out.push({ id: m.id, name: name, label: mob ? name + " · " + mob : name });
    });
    return out;
  }
  /* The words for a compose or reply answer that did not go. res: the call's answer. */
  function refusal(res) {
    var d = res && res.data, f = d && d.fields, first = f ? f[Object.keys(f)[0]] : null;
    if (d && typeof d.message === "string" && d.message) return d.message;
    if (Array.isArray(first) && typeof first[0] === "string" && first[0]) return first[0];
    if (res && res.status === 0) return "We could not confirm it was sent. Press Try again: it will not be sent twice.";
    if (res && res.status === 404) return "This member cannot be texted.";
    return "The text could not be sent.";
  }

  /* ---------- the New text screen ---------- */

  /* ui: { D, h, add, clear, btn, busy, icon, combo, newKey, site, say, back, done(ref, name), gone() }. host: the thread pane. */
  function compose(host, ui) {
    var D = ui.D, h = ui.h, add = ui.add;
    var st = { state: "loading", status: null, q: "", found: [], searched: "", pick: null, text: "", key: null, sending: false, err: "", timer: null, run: 0, srun: 0, dead: false };
    var base = "/sites/" + ui.site + "/inquiries/sms/";
    function stop() { st.dead = true; if (st.timer) { clearTimeout(st.timer); st.timer = null; } }
    function readStatus(then) {
      D.call("GET", base + "status/", null, true).then(function (res) {
        if (st.dead || res.status === 401) return;
        if (res.status === 404) { ui.gone(); return; }
        if (!res.ok || !res.data || typeof res.data !== "object") { st.state = "failed"; draw(); return; }
        st.status = res.data; st.state = "ready";
        if (then) then(); else draw();
      });
    }
    function head() {
      var row = h("div", "ib-thead"), back = h("button", "ib-back"); back.setAttribute("type", "button"); back.setAttribute("id", "ib-back");
      back.appendChild(ui.icon("M15 6l-6 6 6 6")); back.appendChild(h("span", "", ui.home || "Inbox"));
      back.addEventListener("click", function () { stop(); ui.back(); });
      var nm = h("div", "ib-tname"); nm.appendChild(h("h2", "", "New SMS"));
      nm.appendChild(h("p", "ib-sub", "Text one of your members. For orders and member service only. No promotions."));
      return add(row, back, nm);
    }
    function note(text, warn) {
      var n = h("p", "ib-note" + (warn ? "" : " ib-note-info")); n.setAttribute("role", "status");
      n.appendChild(ui.icon(warn ? "M12 3l10 18H2zM12 10v5M12 18h.01" : "M4 5h16v11H9l-5 4z")); n.appendChild(h("span", "", text));
      return n;
    }
    function draw() {
      if (st.dead) return;
      var keepQ = document.activeElement && document.activeElement.id === "ib-sms-q";
      ui.clear(host); host.classList.remove("is-hide-phone");
      host.setAttribute("aria-label", "New SMS");
      host.appendChild(head());
      var body = h("div", "ib-msgs ib-sms-new"); body.setAttribute("tabindex", "-1");
      host.appendChild(body);
      if (st.state === "loading") { body.appendChild(h("p", "pm-meta ib-loading", "Opening…")); return; }
      if (st.state === "failed") {
        body.appendChild(h("p", "pm-meta", "We could not open the text screen just now. Nothing was sent."));
        body.appendChild(ui.btn("Try again", "primary", function (b) { ui.busy(b, true); st.state = "loading"; readStatus(); }));
        return;
      }
      var s = st.status;
      if (s.enabled === false) {
        body.appendChild(note(OFF_TEXT, true));
        var l = h("a", "no-btn no-btn-ghost", "Open Settings > Inbox"); l.setAttribute("href", "/settings/inbox/"); body.appendChild(l);
        return;
      }
      if (phoneOffline(s)) body.appendChild(note(OFFLINE, true));
      else if (notReady(s)) body.appendChild(note(NOT_NOW, true));
      var q = quota(s); if (q) body.appendChild(h("p", "pm-hint ib-sms-quota", q));
      /* 1. find the member: a search box, then the house dropdown of what was found */
      var f1 = h("div", "pm-field");
      var l1 = h("label", "pm-label", "Member"); l1.setAttribute("for", "ib-sms-q");
      var qin = D.el("input", { "class": "pm-input ib-input", id: "ib-sms-q", type: "text", autocomplete: "off", spellcheck: "false", maxlength: "80", placeholder: "Type part of the member's name" });
      qin.value = st.q;
      qin.addEventListener("input", function () { st.q = qin.value; search(); });
      add(f1, l1, qin);
      body.appendChild(f1);
      var f2 = h("div", "pm-field ib-fld");
      var l2 = h("label", "pm-label sr-only", "Choose a member"); l2.setAttribute("for", "ib-sms-pick");
      var sel = D.el("select", { "class": "ib-input", id: "ib-sms-pick" });
      sel.appendChild(D.el("option", { value: "" }, st.searched ? (st.found.length ? "Choose a member" : "No members found") : "Choose a member"));
      st.found.forEach(function (m) { sel.appendChild(D.el("option", { value: m.id }, m.label)); });
      sel.value = st.pick && st.found.some(function (m) { return m.id === st.pick; }) ? st.pick : "";
      sel.addEventListener("change", function () { st.pick = sel.value || null; ready(); });
      add(f2, l2, sel);
      body.appendChild(f2);
      ui.combo(sel, "Choose a member", { blankEmpty: true });
      if (st.searched && !st.found.length) body.appendChild(h("p", "pm-hint", "Only members with a verified mobile number can be texted."));
      /* 2. the text */
      var max = maxOf(s), pre = prefixOf(s);
      var f3 = h("div", "pm-field");
      var l3 = h("label", "pm-label", "Text"); l3.setAttribute("for", "ib-sms-t");
      var ta = h("textarea", "pm-input ib-ta"); ta.setAttribute("id", "ib-sms-t"); ta.setAttribute("rows", "3"); ta.setAttribute("aria-describedby", "ib-sms-c ib-sms-e");
      if (max !== null) ta.setAttribute("maxlength", String(max + 40)); /* a little over, so the counter can say it */
      ta.value = st.text;
      add(f3, l3);
      if (pre) { var pl = h("p", "pm-hint ib-sms-prefix", "Every text starts with: " + pre); f3.appendChild(pl); }
      f3.appendChild(ta);
      body.appendChild(f3);
      var count = h("span", "ib-count", ""); count.setAttribute("id", "ib-sms-c");
      var err = h("p", "field-err", ""); err.setAttribute("id", "ib-sms-e"); err.setAttribute("role", "alert");
      var go = ui.btn("Send text", "primary", function (b) { send(b); }); go.setAttribute("id", "ib-sms-go");
      body.appendChild(err);
      body.appendChild(add(h("div", "ib-rfoot"), count, go));
      function ready() {
        var p = problem(ta.value, max), off = max === null || phoneOffline(s) || notReady(s);
        count.textContent = max === null ? "" : ta.value.length + " / " + max;
        err.textContent = st.err || p; err.hidden = !(st.err || p);
        go.disabled = off || !!p || !ta.value.trim() || !st.pick || st.sending;
      }
      ta.addEventListener("input", function () { st.text = ta.value; st.err = ""; ready(); });
      ready();
      if (keepQ) { qin.focus(); try { qin.setSelectionRange(qin.value.length, qin.value.length); } catch (e) { /* not selectable */ } }
    }
    /* The member search: at least two letters, 300 ms after the last key; only the newest answer is used. */
    function search() {
      if (st.timer) clearTimeout(st.timer);
      st.timer = setTimeout(function () {
        st.timer = null;
        var q = st.q.trim(), run = ++st.srun;
        if (q.length < 2) { st.found = []; st.searched = ""; st.pick = null; draw(); return; }
        D.call("GET", "/sites/" + ui.site + "/members/?q=" + encodeURIComponent(q), null, true).then(function (res) {
          if (st.dead || run !== st.srun || res.status === 401) return;
          st.found = res.ok && res.data ? pickable(res.data.members) : [];
          st.searched = q; if (!st.found.some(function (m) { return m.id === st.pick; })) st.pick = null;
          draw();
        });
      }, 300);
    }
    function send(b) {
      if (st.sending || !st.pick) return;
      var chosen = st.found.filter(function (m) { return m.id === st.pick; })[0];
      if (!chosen) return;
      var text = st.text.trim(); if (!text) return;
      var key = st.key || ui.newKey(); st.key = key; st.sending = true; st.err = ""; ui.busy(b, true);
      D.call("POST", base + "compose/", { member_id: st.pick, text: text, idempotency_key: key }, true).then(function (res) {
        st.sending = false;
        if (st.dead || res.status === 401) return;
        if (!res.ok) {
          if (res.status !== 0) st.key = null; /* a text the API never saw can use a new key; a lost answer keeps it so nothing goes twice */
          st.err = refusal(res);
          /* One 404 means a member who cannot be texted or a feature that went away, and the page must not tell them apart: read the status again, which 404s when the feature is gone. */
          if (res.status === 404) { readStatus(); return; }
          draw(); return;
        }
        var d = res.data || {};
        if (d.state === "failed") { st.key = null; st.err = typeof d.message === "string" && d.message ? d.message : "The text could not be sent."; readStatus(); return; }
        st.key = null; stop();
        ui.say("Text is being sent.");
        ui.done(typeof d.ref === "string" ? d.ref : "", chosen.name);
      });
    }
    readStatus();
    return { stop: stop };
  }

  window.NOInboxSms = { compose: compose,
    util: { available: available, enabled: enabled, isRef: isRef, maxOf: maxOf, prefixOf: prefixOf, problem: problem, chip: chip, offText: offText, quota: quota,
      phoneOffline: phoneOffline, notReady: notReady, pickable: pickable, refusal: refusal, OFFLINE: OFFLINE, OPTED_OUT: OPTED_OUT } };
})();
