/* Inbox, Text (SMS) channel (SMS-OWNER FE-1, ClickUp z8uq9mhk1h). The pieces inbox.js and inbox-settings.js use for the store's own texts
   to its members: the pure helpers (tests/inbox-sms.test.mjs) and the "New text" screen. Routes (apps/inquiries, contract
   sms-owner-z8uq9mhbf4): GET .../inquiries/channels/ (sms_available, sms_enabled), GET .../inquiries/sms/status/, POST
   .../inquiries/sms/compose/ {member_id | contact_id, text, idempotency_key}; a reply uses the normal .../conversations/{ref}/reply/.
   While the feature is off (sms_available not true, or a 404 from any of these) nothing here shows or does anything. The owner never
   types a number: a text goes to a member picked from GET /sites/{id}/members/ (masked, verified mobile only) and only the member's
   public id is sent. The text is only what the owner types (no prefix). The server decides who may be texted, and its `message` is what a refusal shows (never
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
  /* The room for a text: always 160, counting only what the owner types (no store-name prefix, even if old data still carries a prefix key
     or a shorter max_length); null when the payload gives no usable max_length. */
  var SMS_MAX = 160;
  function maxOf(x) { return x && typeof x.max_length === "number" && isFinite(x.max_length) && x.max_length > 0 ? SMS_MAX : null; }
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
    if (res && res.status === 404) return "This person cannot be texted.";
    return "The text could not be sent.";
  }

  /* ---------- the New SMS screen ---------- */

  /* The people the picker offers: members (GET .../members/?q=, verified mobile only) and saved contacts (GET .../contacts/?q=, results with the
     masked mobile). Each is { key: "m:<id>" | "c:<id>", kind, id, name, label }; the key is the select option's value. */
  function contactItems(list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (c) {
      if (!c || (typeof c.id !== "string" && typeof c.id !== "number") || c.id === "") return;
      var name = [c.first_name, c.last_name].map(function (x) { return typeof x === "string" ? x.trim() : ""; }).filter(Boolean).join(" ") || "Contact";
      var mob = typeof c.mobile_masked === "string" ? c.mobile_masked : "";
      out.push({ key: "c:" + c.id, kind: "contact", id: c.id, name: name, label: mob ? name + " · " + mob : name });
    });
    return out;
  }
  function memberItems(list) {
    return pickable(list).map(function (m) { return { key: "m:" + m.id, kind: "member", id: m.id, name: m.name, label: m.label }; });
  }
  /* The compose body: exactly one of member_id or contact_id. */
  function composeBody(item, text, key) {
    var b = {}; b[item.kind === "contact" ? "contact_id" : "member_id"] = item.id; b.text = text; b.idempotency_key = key;
    return b;
  }

  /* ui: { D, h, add, clear, btn, busy, icon, combo, newKey, site, say, back, done(ref, name), gone() }. host: the thread pane. */
  function compose(host, ui) {
    var D = ui.D, h = ui.h, add = ui.add;
    var st = { state: "loading", status: null, contacts: false, found: [], pick: null, text: "", key: null, sending: false, err: "", timer: null, srun: 0, dead: false, searching: false, q: "" };
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
    /* Saved contacts exist only while GET .../contacts/status/ says contacts: true. */
    function readContacts() {
      var C = window.NOContacts;
      if (!C || !C.addDialog) return;
      D.call("GET", "/sites/" + ui.site + "/contacts/status/", null, true).then(function (res) {
        if (st.dead || !(res && res.ok && res.data && res.data.contacts === true)) return;
        st.contacts = true; if (st.state === "ready") draw();
      });
    }
    function head() {
      var row = h("div", "ib-thead ib-thead-new"), back = h("button", "ib-back"); back.setAttribute("type", "button"); back.setAttribute("id", "ib-back");
      back.appendChild(ui.icon("M15 6l-6 6 6 6")); back.appendChild(h("span", "", ui.home || "Inbox"));
      back.addEventListener("click", function () { stop(); ui.back(); });
      var nm = h("div", "ib-tname"); nm.appendChild(h("h2", "", "New SMS"));
      nm.appendChild(h("p", "ib-sub", "Text one of your members. For orders and member service only. No promotions."));
      add(row, back, nm);
      if (st.contacts) {
        var acts = h("div", "ib-hacts");
        var ab = ui.btn("Add contact", "ghost", function (b) { openAdd(b); }); ab.setAttribute("id", "ib-addc");
        acts.appendChild(ab); row.appendChild(acts);
      }
      return row;
    }
    function note(text, warn) {
      var n = h("p", "ib-note" + (warn ? "" : " ib-note-info")); n.setAttribute("role", "status");
      n.appendChild(ui.icon(warn ? "M12 3l10 18H2zM12 10v5M12 18h.01" : "M4 5h16v11H9l-5 4z")); n.appendChild(h("span", "", text));
      return n;
    }
    function itemOf(key) {
      if (st.pick && st.pick.key === key) return st.pick;
      return st.found.filter(function (m) { return m.key === key; })[0] || null;
    }
    /* The select behind the one house dropdown: the placeholder, the chosen person (kept even when a new search drops them), then what was found. */
    function fillSelect(sel) {
      while (sel.firstChild) sel.removeChild(sel.firstChild);
      sel.appendChild(D.el("option", { value: "" }, "Choose a member or contact"));
      var list = st.found.slice();
      if (st.pick && !list.some(function (m) { return m.key === st.pick.key; })) list.unshift(st.pick);
      list.forEach(function (m) { sel.appendChild(D.el("option", { value: m.key, "data-tag": m.kind === "contact" ? "Contact" : "Member" }, m.label)); });
      sel.value = st.pick ? st.pick.key : "";
    }
    var selNode = null, readyFn = null;
    function draw() {
      if (st.dead) return;
      ui.clear(host); host.classList.remove("is-hide-phone");
      host.setAttribute("aria-label", "New SMS");
      host.appendChild(head());
      var body = h("div", "ib-msgs ib-sms-new"); body.setAttribute("tabindex", "-1");
      host.appendChild(body);
      selNode = null; readyFn = null;
      if (st.state === "loading") { body.appendChild(h("p", "pm-meta ib-loading", "Opening…")); return; }
      if (st.state === "failed") {
        body.appendChild(h("p", "pm-meta", "We could not open the text screen just now. Nothing was sent."));
        body.appendChild(ui.btn("Try again", "primary", function (b) { ui.busy(b, true); st.state = "loading"; readStatus(); }));
        return;
      }
      var s = st.status;
      if (s.enabled === false) {
        body.appendChild(note(OFF_TEXT, true));
        var l = h("a", "no-btn no-btn-ghost", "Open Inbox Settings"); l.setAttribute("href", "/inbox/settings/"); body.appendChild(l);
        return;
      }
      if (phoneOffline(s)) body.appendChild(note(OFFLINE, true));
      else if (notReady(s)) body.appendChild(note(NOT_NOW, true));
      /* 1. who: ONE house dropdown (type or pick; opening it selects nothing) listing members and contacts */
      var f1 = h("div", "pm-field ib-fld");
      var l1 = h("label", "pm-label", st.contacts ? "Member or contact" : "Member"); l1.setAttribute("for", "ib-sms-pick");
      var sel = D.el("select", { "class": "ib-input", id: "ib-sms-pick" });
      fillSelect(sel);
      sel.addEventListener("change", function () { st.pick = itemOf(sel.value); if (readyFn) readyFn(); });
      add(f1, l1, sel);
      body.appendChild(f1);
      ui.combo(sel, st.contacts ? "Member or contact" : "Member", { blankEmpty: true, remote: function (q) { search(q); }, emptyText: emptyText });
      selNode = sel;
      /* 2. the text: no default words, no prefix; the counter starts at 0 / 160 */
      var max = maxOf(s);
      var f3 = h("div", "pm-field");
      var l3 = h("label", "pm-label", "Text"); l3.setAttribute("for", "ib-sms-t");
      var ta = h("textarea", "pm-input ib-ta"); ta.setAttribute("id", "ib-sms-t"); ta.setAttribute("rows", "3"); ta.setAttribute("aria-describedby", "ib-sms-c ib-sms-e");
      if (max !== null) ta.setAttribute("maxlength", String(max + 40)); /* a little over, so the counter can say it */
      ta.value = st.text;
      add(f3, l3, ta);
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
      readyFn = ready;
      ta.addEventListener("input", function () { st.text = ta.value; st.err = ""; ready(); });
      ready();
    }
    function emptyText(q) {
      if (String(q || "").trim().length < 2) return "Type at least 2 letters of a name or number";
      return st.searching ? "Searching…" : "No members or contacts found. Only members with a verified mobile number can be texted.";
    }
    /* The search: at least two characters, 300 ms after the last key; members and (while contacts are on) contacts; only the newest answer is used. */
    function search(raw) {
      if (st.timer) clearTimeout(st.timer);
      var q = String(raw || "").trim(), run = ++st.srun;
      if (q.length < 2) { st.q = q; st.searching = false; st.found = []; if (selNode) { fillSelect(selNode); selNode.ibRedraw(); } return; }
      st.searching = true;
      st.timer = setTimeout(function () {
        st.timer = null;
        var calls = [D.call("GET", "/sites/" + ui.site + "/members/?q=" + encodeURIComponent(q), null, true)];
        if (st.contacts) calls.push(D.call("GET", "/sites/" + ui.site + "/contacts/?q=" + encodeURIComponent(q), null, true));
        Promise.all(calls).then(function (r) {
          if (st.dead || run !== st.srun) return;
          if (r.some(function (x) { return x.status === 401; })) return;
          var a = r[0] && r[0].ok && r[0].data ? memberItems(r[0].data.members) : [];
          var b = r[1] && r[1].ok && r[1].data ? contactItems(r[1].data.results) : [];
          st.found = a.concat(b); st.searching = false; st.q = q;
          if (selNode) { fillSelect(selNode); selNode.ibRedraw(); }
        });
      }, 300);
    }
    /* The Add contact popup (contacts.js); the saved contact is picked at once. */
    function openAdd(opener) {
      window.NOContacts.addDialog({ site: ui.site, opener: opener, done: function (c) {
        var it = contactItems([c])[0];
        if (!it) return;
        st.pick = it; st.err = "";
        if (selNode) { fillSelect(selNode); if (selNode.ibSync) selNode.ibSync(); }
        if (readyFn) readyFn();
        ui.say("Contact added.");
      } });
    }
    function send(b) {
      if (st.sending || !st.pick) return;
      var chosen = st.pick;
      var text = st.text.trim(); if (!text) return;
      var key = st.key || ui.newKey(); st.key = key; st.sending = true; st.err = ""; ui.busy(b, true);
      D.call("POST", base + "compose/", composeBody(chosen, text, key), true).then(function (res) {
        st.sending = false;
        if (st.dead || res.status === 401) return;
        if (!res.ok) {
          if (res.status !== 0) st.key = null; /* a text the API never saw can use a new key; a lost answer keeps it so nothing goes twice */
          st.err = refusal(res);
          /* One 404 means a person who cannot be texted or a feature that went away, and the page must not tell them apart: read the status again, which 404s when the feature is gone. */
          if (res.status === 404) { readStatus(); return; }
          draw(); return;
        }
        var d = res.data || {};
        /* A send over a limit (or any refusal) is a 200 with state "failed" and the server's own message; the typed text stays for a retry. */
        if (d.state === "failed") { st.key = null; st.err = typeof d.message === "string" && d.message ? d.message : "The text could not be sent."; readStatus(); return; }
        st.key = null; stop();
        ui.say("Text is being sent.");
        ui.done(typeof d.ref === "string" ? d.ref : "", chosen.name);
      });
    }
    readStatus(); readContacts();
    return { stop: stop };
  }

  window.NOInboxSms = { compose: compose,
    util: { available: available, enabled: enabled, isRef: isRef, maxOf: maxOf, problem: problem, chip: chip, offText: offText,
      phoneOffline: phoneOffline, notReady: notReady, pickable: pickable, memberItems: memberItems, contactItems: contactItems, composeBody: composeBody, refusal: refusal, OFFLINE: OFFLINE, OPTED_OUT: OPTED_OUT } };
})();
